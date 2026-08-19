import { v, ConvexError } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { generateShareToken } from "./lib/shareSecurity";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Setter end-of-day forms, without a setter app.
//
// Each setter gets one stable personal link the manager hands out once. The
// token IS the identity — no accounts, no logins, nothing to reset. Setters
// churn fast at these companies; provisioning logins for people who may last
// two weeks is how this feature would have become a support burden.
//
// Built for E2's request (dials / pick-ups / sets / new leads hit /
// follow-ups) but team-agnostic on purpose.
// ============================================================================

const FIELD_MAX = 2000; // dials in a day beyond this is a typo, not hustle

// ---------------------------------------------------------------------------
// Manager side
// ---------------------------------------------------------------------------

export const listRoster = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const today = dayKeyInTz(Date.now(), tz);

    const roster = await ctx.db
      .query("setterRoster")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId as Id<"teams">))
      .collect();

    const out = [];
    for (const r of roster) {
      const todayEntry = await ctx.db
        .query("setterEodEntries")
        .withIndex("by_roster_and_day", (q) =>
          q.eq("rosterId", r._id).eq("dayKey", today),
        )
        .first();
      out.push({
        _id: r._id,
        name: r.name,
        token: r.token,
        active: r.active,
        filedToday: !!todayEntry,
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return { today, roster: out };
  },
});

export const addSetter = mutation({
  args: { clerkId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    const name = args.name.trim();
    if (!name) throw new ConvexError("Give the setter a name");
    if (name.length > 80) throw new ConvexError("That name is too long");

    const existing = await ctx.db
      .query("setterRoster")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId as Id<"teams">))
      .collect();
    if (existing.some((r) => r.active && r.name.toLowerCase() === name.toLowerCase())) {
      throw new ConvexError("There's already a setter with that name");
    }
    if (existing.filter((r) => r.active).length >= 100) {
      throw new ConvexError("Roster limit reached");
    }

    const id = await ctx.db.insert("setterRoster", {
      teamId: user.teamId as Id<"teams">,
      name,
      token: generateShareToken(),
      active: true,
      createdAt: Date.now(),
    });
    return { rosterId: id };
  },
});

/** Deactivate rather than delete — their history stays attributable. */
export const setSetterActive = mutation({
  args: { clerkId: v.string(), rosterId: v.id("setterRoster"), active: v.boolean() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    const row = await ctx.db.get(args.rosterId);
    if (!row || String(row.teamId) !== String(user.teamId)) {
      throw new ConvexError("Not your setter");
    }
    await ctx.db.patch(args.rosterId, { active: args.active });
    return { ok: true };
  },
});

/** New link, old one dead — for when a link leaks or a phone is lost. */
export const rotateSetterToken = mutation({
  args: { clerkId: v.string(), rosterId: v.id("setterRoster") },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    const row = await ctx.db.get(args.rosterId);
    if (!row || String(row.teamId) !== String(user.teamId)) {
      throw new ConvexError("Not your setter");
    }
    const token = generateShareToken();
    await ctx.db.patch(args.rosterId, { token });
    return { token };
  },
});

/** The board: every setter × recent days, for the manager's tab. */
export const getEodBoard = query({
  args: { clerkId: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const days = Math.min(Math.max(args.days ?? 7, 1), 31);

    const dayKeys: string[] = [];
    for (let i = 0; i < days; i++) {
      dayKeys.push(dayKeyInTz(Date.now() - i * 86_400_000, tz));
    }

    const roster = (
      await ctx.db
        .query("setterRoster")
        .withIndex("by_team", (q) => q.eq("teamId", user.teamId as Id<"teams">))
        .collect()
    ).filter((r) => r.active);

    const rows = [];
    for (const r of roster) {
      const entries: Record<string, any> = {};
      for (const dk of dayKeys) {
        const e = await ctx.db
          .query("setterEodEntries")
          .withIndex("by_roster_and_day", (q) =>
            q.eq("rosterId", r._id).eq("dayKey", dk),
          )
          .first();
        if (e) {
          entries[dk] = {
            dials: e.dials,
            pickUps: e.pickUps,
            sets: e.sets,
            newLeadsHit: e.newLeadsHit,
            followUps: e.followUps,
            note: e.note ?? null,
          };
        }
      }
      rows.push({ rosterId: r._id, name: r.name, entries });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return { dayKeys, rows };
  },
});

// ---------------------------------------------------------------------------
// Setter side — token is the only credential, deliberately.
// ---------------------------------------------------------------------------

export const getEodFormContext = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("setterRoster")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!row || !row.active) return null;

    const team = await ctx.db.get(row.teamId);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const today = dayKeyInTz(Date.now(), tz);

    const existing = await ctx.db
      .query("setterEodEntries")
      .withIndex("by_roster_and_day", (q) =>
        q.eq("rosterId", row._id).eq("dayKey", today),
      )
      .first();

    return {
      setterName: row.name,
      teamName: (team as any)?.name ?? "your team",
      today,
      existing: existing
        ? {
            dials: existing.dials,
            pickUps: existing.pickUps,
            sets: existing.sets,
            newLeadsHit: existing.newLeadsHit,
            followUps: existing.followUps,
            note: existing.note ?? "",
          }
        : null,
    };
  },
});

export const submitEod = mutation({
  args: {
    token: v.string(),
    dials: v.number(),
    pickUps: v.number(),
    sets: v.number(),
    newLeadsHit: v.number(),
    followUps: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("setterRoster")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!row || !row.active) throw new ConvexError("This link is no longer active");

    for (const [k, val] of Object.entries({
      dials: args.dials,
      "pick ups": args.pickUps,
      sets: args.sets,
      "new leads": args.newLeadsHit,
      "follow ups": args.followUps,
    })) {
      if (!Number.isInteger(val) || val < 0 || val > FIELD_MAX) {
        throw new ConvexError(`Check the ${k} number`);
      }
    }
    // Sanity relationships, phrased as help rather than rejection.
    if (args.pickUps > args.dials) {
      throw new ConvexError("Pick ups can't be more than dials");
    }
    const note = args.note?.trim().slice(0, 500) || undefined;

    const team = await ctx.db.get(row.teamId);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const today = dayKeyInTz(Date.now(), tz);

    // Re-submitting replaces today's numbers — a setter correcting a typo at
    // 9pm should not need anyone's help.
    const existing = await ctx.db
      .query("setterEodEntries")
      .withIndex("by_roster_and_day", (q) =>
        q.eq("rosterId", row._id).eq("dayKey", today),
      )
      .first();

    const doc = {
      teamId: row.teamId,
      rosterId: row._id,
      dayKey: today,
      dials: args.dials,
      pickUps: args.pickUps,
      sets: args.sets,
      newLeadsHit: args.newLeadsHit,
      followUps: args.followUps,
      note,
      submittedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.replace(existing._id, doc);
    } else {
      await ctx.db.insert("setterEodEntries", doc);
    }
    return { ok: true, dayKey: today };
  },
});

/**
 * Hard-delete a roster row and every entry it filed. Support tool — the UI
 * only deactivates, deliberately, so history survives normal management.
 */
export const hardDeleteSetter = internalMutation({
  args: { rosterId: v.id("setterRoster") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("setterEodEntries")
      .withIndex("by_roster_and_day", (q) => q.eq("rosterId", args.rosterId))
      .collect();
    for (const e of entries) await ctx.db.delete(e._id);
    await ctx.db.delete(args.rosterId);
    return { entriesDeleted: entries.length };
  },
});
