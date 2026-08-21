// ============================================================================
// Who's a setter, who's a closer, and who's neither.
//
// Built from OBSERVED ACTIVITY rather than from the CRM's user list, because
// the two disagree badly. On one live team the CRM returns eight users while
// thirteen different ids made outbound touches in thirty days — the missing
// five include a setter who has since left, whose 801 dials are still sitting
// in the numbers with nobody's name on them.
//
// Listing by activity means the roster shows everyone who has actually touched
// a lead, ranked by how much they did it. A departed setter appears. A support
// account that fired two texts appears. Nobody has to remember who to look for.
// ============================================================================

import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROLES = ["setter", "closer", "other"] as const;
type Role = (typeof ROLES)[number];

/** How far back to look when working out who's active. */
const LOOKBACK_DAYS = 90;
const MAX_EVENTS = 12_000;

function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

/**
 * Every person we've seen touch a lead, with what they did and who we think
 * they are.
 *
 * Deliberately unranked by role — a manager sorting out their roster wants the
 * busiest people first, because that is where a misclassification costs most.
 */
export const listRoster = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    const teamId = user.teamId as Id<"teams">;
    const since = Date.now() - LOOKBACK_DAYS * 86_400_000;

    // Names from the CRM sync, where the person still exists there.
    const reps = await ctx.db
      .query("setterReps")
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .take(500);
    const nameById = new Map<string, string>();
    for (const r of reps as any[]) {
      if (r.ghlUserId) nameById.set(r.ghlUserId, r.name || r.email || "");
    }

    // Roles a human has already set.
    const assigned = await ctx.db
      .query("setterRoleAssignments")
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .take(500);
    const roleById = new Map<string, Doc<"setterRoleAssignments">>();
    for (const a of assigned as any[]) roleById.set(a.crmUserId, a);

    // Observed activity. Both outbound types, since a setter who only texts is
    // still a setter.
    const activity = new Map<
      string,
      { calls: number; texts: number; firstAt: number; lastAt: number }
    >();
    for (const eventType of ["dial_outbound", "sms_outbound"]) {
      const rows = await ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_type_and_time", (q: any) =>
          q.eq("teamId", teamId).eq("eventType", eventType).gte("occurredAt", since),
        )
        .take(MAX_EVENTS);
      for (const e of rows as any[]) {
        // No user means automation, which is not a person and never gets a row.
        if (!e.ghlUserId) continue;
        const row = activity.get(e.ghlUserId) ?? {
          calls: 0,
          texts: 0,
          firstAt: e.occurredAt,
          lastAt: e.occurredAt,
        };
        if (eventType === "dial_outbound") row.calls += 1;
        else row.texts += 1;
        row.firstAt = Math.min(row.firstAt, e.occurredAt);
        row.lastAt = Math.max(row.lastAt, e.occurredAt);
        activity.set(e.ghlUserId, row);
      }
    }

    // Anyone the CRM knows about but who has done nothing still deserves a row
    // — they may be a setter who started yesterday.
    for (const id of nameById.keys()) {
      if (!activity.has(id)) {
        activity.set(id, { calls: 0, texts: 0, firstAt: 0, lastAt: 0 });
      }
    }

    const people = [...activity.entries()]
      .map(([crmUserId, a]) => {
        const existing = roleById.get(crmUserId);
        const name = nameById.get(crmUserId) || existing?.displayName || null;
        return {
          crmUserId,
          name,
          // Doing the work, but absent from the CRM's own user list. The first
          // version of this called them "departed" and was wrong: several were
          // active the same day. They may have left, or belong to another
          // location, or the user sync may simply be missing them. Say what we
          // observed — active, unlisted — and let the manager say who they are.
          unlistedInCrm: !nameById.has(crmUserId) && (a.calls + a.texts) > 0,
          calls: a.calls,
          texts: a.texts,
          total: a.calls + a.texts,
          lastActiveAt: a.lastAt || null,
          role: (existing?.role as Role | undefined) ?? null,
        };
      })
      .sort((x, y) => y.total - x.total);

    return {
      lookbackDays: LOOKBACK_DAYS,
      people,
      // Until somebody classifies these, every per-setter number includes
      // whoever happens to hold a CRM login.
      unassigned: people.filter((p) => p.role === null && p.total > 0).length,
      setters: people.filter((p) => p.role === "setter").length,
    };
  },
});

/**
 * Set one person's role.
 *
 * One at a time rather than a bulk save: a manager works down the list making
 * individual judgements, and a partial save that silently discarded the rest
 * would be worse than no save at all.
 */
export const setRole = mutation({
  args: {
    clerkId: v.string(),
    crmUserId: v.string(),
    role: v.union(v.literal("setter"), v.literal("closer"), v.literal("other")),
    displayName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return { success: false, error: "Not authorised." };
    if (!canEdit(user)) {
      return { success: false, error: "Only managers can set who the setters are." };
    }
    const teamId = user.teamId as Id<"teams">;

    const existing = await ctx.db
      .query("setterRoleAssignments")
      .withIndex("by_team_and_user", (q: any) =>
        q.eq("teamId", teamId).eq("crmUserId", args.crmUserId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        assignedBy: user.clerkId,
        assignedAt: Date.now(),
        ...(args.displayName ? { displayName: args.displayName } : {}),
      });
    } else {
      await ctx.db.insert("setterRoleAssignments", {
        teamId,
        crmUserId: args.crmUserId,
        role: args.role,
        displayName: args.displayName,
        assignedBy: user.clerkId,
        assignedAt: Date.now(),
      });
    }
    return { success: true };
  },
});

/**
 * The setter ids for a team, or null when nobody has said.
 *
 * Null and empty mean different things and must not be collapsed: null is "no
 * one has told us", which keeps today's behaviour of counting everyone; an
 * empty list would be "this team has no setters", which would zero every
 * metric. Returning the wrong one of those silently empties a dashboard.
 */
export async function setterIdsFor(
  ctx: { db: any },
  teamId: Id<"teams">,
): Promise<string[] | null> {
  const rows = await ctx.db
    .query("setterRoleAssignments")
    .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
    .take(500);
  if (rows.length === 0) return null;
  return rows
    .filter((r: Doc<"setterRoleAssignments">) => r.role === "setter")
    .map((r: Doc<"setterRoleAssignments">) => r.crmUserId);
}

/**
 * Fill every unassigned roster row with role "other" (not sales floor).
 *
 * For teams too big to classify by hand: the manager marks the setters and
 * closers they know; everyone left — predecessors' accounts, support users,
 * integrations — is by their own definition not their sales floor. Same
 * enumeration listRoster shows (CRM users ∪ anyone with outbound activity in
 * the lookback), so nothing visible stays blank.
 */
export const autofillUnassignedAsOther = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const since = Date.now() - LOOKBACK_DAYS * 86_400_000;

    const reps = await ctx.db
      .query("setterReps")
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .take(500);
    const nameById = new Map<string, string>();
    for (const r of reps as any[]) {
      if (r.ghlUserId) nameById.set(r.ghlUserId, r.name || r.email || "");
    }

    const assigned = await ctx.db
      .query("setterRoleAssignments")
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .take(500);
    const assignedIds = new Set((assigned as any[]).map((a) => a.crmUserId));

    const ids = new Set<string>(nameById.keys());
    for (const eventType of ["dial_outbound", "sms_outbound"]) {
      const rows = await ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_type_and_time", (q: any) =>
          q.eq("teamId", args.teamId).eq("eventType", eventType).gte("occurredAt", since),
        )
        .take(MAX_EVENTS);
      for (const e of rows as any[]) {
        if (e.ghlUserId) ids.add(e.ghlUserId);
      }
    }

    const filled: string[] = [];
    for (const id of ids) {
      if (assignedIds.has(id)) continue;
      await ctx.db.insert("setterRoleAssignments", {
        teamId: args.teamId,
        crmUserId: id,
        role: "other",
        displayName: nameById.get(id) || undefined,
        assignedBy: "autofill: unclassified = not sales",
        assignedAt: Date.now(),
      });
      filled.push(nameById.get(id) || id);
    }
    return {
      alreadyAssigned: assignedIds.size,
      autofilledAsOther: filled.length,
      names: filled,
    };
  },
});
