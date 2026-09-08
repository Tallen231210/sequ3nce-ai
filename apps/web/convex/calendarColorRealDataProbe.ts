// ============================================================================
// Real-data rehearsal for the color capture, on the DEV deployment.
//
// Loads a copy of a real team's calendar rows and real Google colors (pulled
// read-only from production beforehand) under throwaway closers on dev, runs
// the actual backfill and check-ins code over them, and tears everything down.
// This is how the shipped TypeScript meets real volumes and real titles
// before it ever touches production. Driven from a script; see the memory
// note "e2-calendar-color-code" for the recipe.
//
// Never point this at production.
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { collectRecolorStates } from "./calendarColorCheckinsCore";
import type { RecolorState } from "./lib/calendarColorRules";

const P = "rp-"; // fixture uid prefix

export const seedClosers = internalMutation({
  args: { teamId: v.id("teams"), names: v.array(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const out: Array<{ name: string; closerId: string; subscriptionId: string }> = [];
    for (const [i, name] of args.names.entries()) {
      const closerId = await ctx.db.insert("closers", {
        name,
        email: `realprobe-${i}@example.invalid`,
        teamId: args.teamId,
        status: "active",
        invitedAt: now,
      });
      const subscriptionId = await ctx.db.insert("closerCalendarSubscriptions", {
        closerId,
        teamId: args.teamId,
        googleCalendarId: "primary",
        label: "Primary",
        enabled: true,
        createdAt: now,
      });
      out.push({ name, closerId, subscriptionId });
    }
    return out;
  },
});

export const seedEvents = internalMutation({
  args: {
    rows: v.array(
      v.object({
        closerId: v.id("closers"),
        subscriptionId: v.id("closerCalendarSubscriptions"),
        teamId: v.id("teams"),
        uid: v.string(),
        title: v.string(),
        startTime: v.number(),
        endTime: v.number(),
        attendees: v.optional(
          v.array(v.object({ email: v.string(), isOrganizer: v.optional(v.boolean()) })),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const fetchedAt = Date.now() - 10 * 24 * 60 * 60 * 1000;
    for (const r of args.rows) {
      await ctx.db.insert("calendarEvents", {
        closerId: r.closerId,
        teamId: r.teamId,
        uid: P + r.uid,
        title: r.title,
        startTime: r.startTime,
        endTime: r.endTime,
        attendees: r.attendees,
        subscriptionId: r.subscriptionId,
        calendarLabel: "Primary",
        fetchedAt,
      });
    }
    return { inserted: args.rows.length };
  },
});

export const summarize = internalQuery({
  args: { teamId: v.id("teams"), startMs: v.number(), endMs: v.number() },
  handler: async (ctx, args) => {
    const rows = await collectRecolorStates(ctx, args.teamId, args.startMs, args.endMs, Date.now());
    const byCloser = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const c = byCloser.get(r.closerId) ?? {};
      const key: RecolorState = r.state;
      c[key] = (c[key] ?? 0) + 1;
      // Post-call colors by state, e.g. "pre_colored_untouched:11".
      if (r.colorId && ["10", "11", "5"].includes(r.colorId)) {
        const k = `${r.state}:${r.colorId}`;
        c[k] = (c[k] ?? 0) + 1;
      }
      c.total = (c.total ?? 0) + 1;
      byCloser.set(r.closerId, c);
    }
    return Array.from(byCloser.entries()).map(([closerId, counts]) => ({ closerId, counts }));
  },
});

export const teardown = internalMutation({
  args: { closerIds: v.array(v.id("closers")), teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) => {
    let events = 0;
    let history = 0;
    if (args.teamId) {
      // The recount rehearsal writes measured rows for the dev team; clear
      // them so the next run starts clean.
      const teamId = args.teamId;
      for (const table of ["closerDailyStats", "closerDailyTeamStats"] as const) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_team_and_day", (q) => q.eq("teamId", teamId))
          .collect();
        for (const r of rows) await ctx.db.delete(r._id);
      }
      for (const table of ["calls"] as const) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_team_and_date", (q) => q.eq("teamId", teamId))
          .collect();
        for (const r of rows) if (String(r.prospectName ?? "").startsWith("rp-")) await ctx.db.delete(r._id);
      }
    }
    for (const closerId of args.closerIds) {
      const evs = await ctx.db
        .query("calendarEvents")
        .withIndex("by_closer", (q) => q.eq("closerId", closerId))
        .collect();
      for (const e of evs) {
        await ctx.db.delete(e._id);
        events += 1;
      }
      const hist = await ctx.db
        .query("calendarEventColorHistory")
        .withIndex("by_closer_and_uid", (q) => q.eq("closerId", closerId))
        .collect();
      for (const h of hist) {
        await ctx.db.delete(h._id);
        history += 1;
      }
      const subs = await ctx.db
        .query("closerCalendarSubscriptions")
        .withIndex("by_closer", (q) => q.eq("closerId", closerId))
        .collect();
      for (const s of subs) await ctx.db.delete(s._id);
      await ctx.db.delete(closerId);
    }
    return { closers: args.closerIds.length, events, history };
  },
});


// ---------------------------------------------------------------------------
// Recount rehearsal: run the REAL Team Performance recount over the seeded
// rows and read back what the board would say.
// ---------------------------------------------------------------------------

/** Give the dev team the settings the real team runs with. */
export const configureTeam = internalMutation({
  args: {
    teamId: v.id("teams"),
    timezone: v.optional(v.string()),
    excludedBookingTitles: v.optional(v.array(v.string())),
    countAiContractValue: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      ...(args.timezone ? { timezone: args.timezone } : {}),
      ...(args.excludedBookingTitles ? { closerExcludedBookingTitles: args.excludedBookingTitles } : {}),
      ...(args.countAiContractValue === false ? { closerCountAiContractValue: false } : {}),
    });
    return { ok: true };
  },
});

/** Synthetic calls for the taken / contract-value rules (prospectName rp-*). */
export const seedCalls = internalMutation({
  args: {
    teamId: v.id("teams"),
    calls: v.array(
      v.object({
        closerId: v.id("closers"),
        label: v.string(),
        createdAt: v.number(),
        status: v.string(),
        duration: v.optional(v.number()),
        outcome: v.optional(v.string()),
        outcomeSource: v.optional(v.string()),
        contractValue: v.optional(v.number()),
        cashCollected: v.optional(v.number()),
        prospectJoined: v.optional(v.boolean()),
        countsTowardStats: v.optional(v.boolean()),
        factsConfirmedAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const c of args.calls) {
      const { label, ...rest } = c;
      await ctx.db.insert("calls", {
        teamId: args.teamId,
        speakerCount: 2,
        prospectName: "rp-" + label,
        ...rest,
      } as never);
    }
    return { inserted: args.calls.length };
  },
});

export const recountDays = internalAction({
  args: { teamId: v.id("teams"), dayKeys: v.array(v.string()) },
  handler: async (ctx, args): Promise<{ days: number }> => {
    for (const dayKey of args.dayKeys) {
      await ctx.runMutation(internal.closerPerformance.recountCloserDay, {
        teamId: args.teamId,
        dayKey,
      });
    }
    return { days: args.dayKeys.length };
  },
});

export const readMeasured = internalQuery({
  args: { teamId: v.id("teams"), startDayKey: v.string(), endDayKey: v.string() },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("closerDailyStats")
      .withIndex("by_team_and_day", (q) =>
        q.eq("teamId", args.teamId).gte("dayKey", args.startDayKey).lte("dayKey", args.endDayKey),
      )
      .collect();
    const teamStats = await ctx.db
      .query("closerDailyTeamStats")
      .withIndex("by_team_and_day", (q) =>
        q.eq("teamId", args.teamId).gte("dayKey", args.startDayKey).lte("dayKey", args.endDayKey),
      )
      .collect();
    return {
      stats: stats.map((r) => ({
        closerId: String(r.closerId), dayKey: r.dayKey, booked: r.booked, taken: r.taken,
        offers: r.offers, closes: r.closes, cash: r.cash, contractValue: r.contractValue,
        missingOutcomes: r.missingOutcomes ?? 0,
      })),
      teamStats: teamStats.map((r) => ({
        dayKey: r.dayKey, bookedUnattributed: r.bookedUnattributed, unknownReps: r.unknownReps ?? [],
      })),
    };
  },
});
