// ============================================================================
// Storing and approving funnel definitions.
//
// Owns the database; the vocabulary and validation live in setterFunnelTypes.ts
// and the arithmetic in setterMetricCompute.ts. Same split as compliance and
// extraction — the parts that can be tested without a database are kept where
// they can be.
//
// Two rules run through everything here:
//
//   A definition drives nothing until a human approves it. Half-finished setup
//   must never quietly start producing a customer's numbers.
//
//   Changing what a metric means bumps the version. Otherwise a funnel edit
//   silently rewrites history and a chart lies with no way to tell why.
// ============================================================================

import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { validateBindings, validateBusinessHours } from "./setterFunnelTypes";
import { fromRow, legacyFunnel, type ResolvedFunnel } from "./setterFunnelResolve";
import { setterIdsFor } from "./setterRoster";
import { availableMetrics } from "./setterMetricLibrary";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Only managers shape what their numbers mean. */
function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

/**
 * The funnel in force for a team right now.
 *
 * Falls back to the legacy definition rather than returning null, so every
 * caller gets a usable funnel and nobody has to remember to handle "not
 * configured yet" — which is how a half-migrated system starts producing
 * blanks in places nobody checked.
 */
export async function activeFunnelFor(
  ctx: { db: any },
  teamId: Id<"teams">,
): Promise<ResolvedFunnel> {
  const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
  const row = await ctx.db
    .query("setterFunnels")
    .withIndex("by_team_and_active", (q: any) =>
      q.eq("teamId", teamId).eq("active", true),
    )
    .first();
  const funnel = fromRow(row as Doc<"setterFunnels"> | null, team);

  // The roster is answered by the people table, not by the funnel document.
  //
  // Deliberate: who your setters are is a fact about your staff, not about a
  // funnel definition, and it stays true when the funnel is rewritten. It also
  // means a manager can name their setters without first having to build and
  // approve a whole funnel.
  //
  // Null means nobody has said, which keeps today's behaviour of counting
  // everyone. An empty list would mean "this team has no setters" and would
  // zero every metric — collapsing those two is how a dashboard silently
  // empties itself.
  const setterIds = await setterIdsFor(ctx, teamId);
  if (setterIds !== null) {
    funnel.bindings = {
      ...funnel.bindings,
      setterRoster: {
        kind: "explicit_list",
        source: "confirmed",
        evidenceCount: setterIds.length,
        params: { userIds: setterIds },
      },
    } as any;
  }
  return funnel;
}

export const getActiveFunnel = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<ResolvedFunnel> =>
    activeFunnelFor(ctx, args.teamId),
});

/**
 * What this team's funnel currently supports, and what it doesn't.
 *
 * The blocked list is as important as the available one: it is where a manager
 * learns that we can't read their Instagram DMs, rather than staring at a
 * dashboard of zeros and drawing their own conclusion about their setters.
 */
export const getFunnelStatus = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    const funnel = await activeFunnelFor(ctx, user.teamId as Id<"teams">);
    const { available, blocked } = availableMetrics(funnel);
    return {
      funnel: {
        id: funnel.funnelId,
        name: funnel.name,
        configured: funnel.configured,
        version: funnel.version,
        businessHours: funnel.businessHours,
      },
      available: available.map((m) => ({
        id: m.id,
        label: m.label,
        description: m.description,
        unit: m.unit,
      })),
      blocked: blocked.map((b) => ({
        id: b.metric.id,
        label: b.metric.label,
        // Plain language, because this is read by a sales manager rather than
        // whoever wrote the binding.
        reason: b.suppressed
          ? "Not meaningful on this funnel — prospects book themselves here."
          : b.gate.unreadable.length > 0
            ? b.gate.unreadable[0]
            : `We haven't been told what ${b.gate.missing.join(" or ")} means for your business yet.`,
      })),
    };
  },
});

/**
 * Create a draft.
 *
 * Deliberately inactive and unapproved. It exists to be looked at and argued
 * with, not to start driving anything.
 */
export const createDraftFunnel = mutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    bindings: v.any(),
    businessHours: v.optional(v.any()),
    leadScope: v.optional(v.any()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return { success: false, error: "Not authorised." };
    if (!canEdit(user)) {
      return { success: false, error: "Only managers can change what your metrics mean." };
    }

    const name = args.name.trim();
    if (!name) return { success: false, error: "Give the funnel a name." };
    if (name.length > 80) return { success: false, error: "That name is too long." };

    const check = validateBindings(args.bindings);
    if (!check.ok) return { success: false, error: check.errors.join(" "), errors: check.errors };
    const hours = validateBusinessHours(args.businessHours);
    if (!hours.ok) return { success: false, error: hours.errors.join(" ") };

    const now = Date.now();
    const id = await ctx.db.insert("setterFunnels", {
      teamId: user.teamId as Id<"teams">,
      name,
      active: false,
      bindings: args.bindings,
      businessHours: args.businessHours,
      leadScope: args.leadScope,
      version: 1,
      summary: args.summary,
      createdAt: now,
      updatedAt: now,
    });
    return { success: true, funnelId: String(id), warnings: check.warnings };
  },
});

/**
 * Edit a draft, or revise a live one.
 *
 * Revising something already approved strips the approval and bumps the
 * version: the manager agreed to the definition they read, not to whatever it
 * becomes afterwards.
 */
export const updateFunnel = mutation({
  args: {
    clerkId: v.string(),
    funnelId: v.id("setterFunnels"),
    name: v.optional(v.string()),
    bindings: v.optional(v.any()),
    businessHours: v.optional(v.any()),
    leadScope: v.optional(v.any()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return { success: false, error: "Not authorised." };
    if (!canEdit(user)) {
      return { success: false, error: "Only managers can change what your metrics mean." };
    }
    const row = await ctx.db.get(args.funnelId);
    if (!row) return { success: false, error: "That funnel no longer exists." };
    if (String(row.teamId) !== String(user.teamId)) {
      return { success: false, error: "That funnel isn't on your team." };
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    let warnings: string[] = [];

    if (args.bindings !== undefined) {
      const check = validateBindings(args.bindings);
      if (!check.ok) return { success: false, error: check.errors.join(" "), errors: check.errors };
      warnings = check.warnings;
      patch.bindings = args.bindings;
    }
    if (args.businessHours !== undefined) {
      const hours = validateBusinessHours(args.businessHours);
      if (!hours.ok) return { success: false, error: hours.errors.join(" ") };
      patch.businessHours = args.businessHours;
    }
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) return { success: false, error: "Give the funnel a name." };
      patch.name = name.slice(0, 80);
    }
    if (args.leadScope !== undefined) patch.leadScope = args.leadScope;
    if (args.summary !== undefined) patch.summary = args.summary;

    // Anything that changes what a number MEANS invalidates the approval.
    const meaningChanged =
      args.bindings !== undefined ||
      args.businessHours !== undefined ||
      args.leadScope !== undefined;
    if (meaningChanged && row.approvedAt) {
      patch.version = row.version + 1;
      patch.approvedAt = undefined;
      patch.approvedBy = undefined;
      patch.active = false;
    }

    await ctx.db.patch(args.funnelId, patch);
    return { success: true, warnings, reapprovalNeeded: meaningChanged && !!row.approvedAt };
  },
});

/**
 * Approve and switch on.
 *
 * The moment a team's numbers stop being derived from our assumptions and start
 * being derived from their own definition. One active funnel per team for now;
 * several is a later phase, and allowing two before the routing exists would
 * mean leads counted twice.
 */
export const approveFunnel = mutation({
  args: { clerkId: v.string(), funnelId: v.id("setterFunnels") },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return { success: false, error: "Not authorised." };
    if (!canEdit(user)) {
      return { success: false, error: "Only managers can approve a funnel." };
    }
    const row = await ctx.db.get(args.funnelId);
    if (!row) return { success: false, error: "That funnel no longer exists." };
    if (String(row.teamId) !== String(user.teamId)) {
      return { success: false, error: "That funnel isn't on your team." };
    }

    const check = validateBindings(row.bindings);
    if (!check.ok) {
      return { success: false, error: "This funnel isn't complete yet.", errors: check.errors };
    }

    for (const other of await ctx.db
      .query("setterFunnels")
      .withIndex("by_team_and_active", (q: any) =>
        q.eq("teamId", user.teamId as Id<"teams">).eq("active", true),
      )
      .collect()) {
      if (String(other._id) !== String(args.funnelId)) {
        await ctx.db.patch(other._id, { active: false });
      }
    }

    await ctx.db.patch(args.funnelId, {
      active: true,
      approvedAt: Date.now(),
      approvedBy: user.clerkId,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

/** Back to our assumptions. Reversible on purpose — nothing here is one-way. */
export const deactivateFunnel = mutation({
  args: { clerkId: v.string(), funnelId: v.id("setterFunnels") },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return { success: false, error: "Not authorised." };
    if (!canEdit(user)) return { success: false, error: "Only managers can do that." };
    const row = await ctx.db.get(args.funnelId);
    if (!row || String(row.teamId) !== String(user.teamId)) {
      return { success: false, error: "That funnel isn't on your team." };
    }
    await ctx.db.patch(args.funnelId, { active: false, updatedAt: Date.now() });
    return { success: true };
  },
});

export const listFunnels = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return [];
    const rows = await ctx.db
      .query("setterFunnels")
      .withIndex("by_team", (q: any) => q.eq("teamId", user.teamId as Id<"teams">))
      .collect();
    return rows.map((r: Doc<"setterFunnels">) => ({
      id: String(r._id),
      name: r.name,
      active: r.active,
      approved: !!r.approvedAt,
      version: r.version,
      summary: r.summary,
      updatedAt: r.updatedAt,
    }));
  },
});

export { legacyFunnel };
