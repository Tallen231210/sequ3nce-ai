// ============================================================================
// Snapshot and restore of a team's MEASURED closer rows.
//
// The Team Performance recount rewrites closerDailyStats (and the team-level
// closerDailyTeamStats) from calendars and calls. Before a rule change is
// replayed over a team's history, keep what the board said, so any day can
// be put back exactly and a before/after diff can be shown. Human-entered
// tables (closerDailyEntries, closerDailyOverrides) are never touched by a
// recount and are not part of this.
//
//   npx convex run --prod closerPerformanceSnapshot:exportMeasured \
//     '{"teamId":"…","startDayKey":"2026-07-25","endDayKey":"2026-09-08"}'
//   → { storageId, stats, teamStats }   (a JSON file in Convex storage)
//   npx convex run --prod closerPerformanceSnapshot:restoreMeasured \
//     '{"storageId":"…"}'               (optionally "dayKey" for one day)
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

const STATS_FIELDS = [
  "slots", "booked", "taken", "offers", "closes", "cash", "contractValue",
  "missingOutcomes", "capacityKnown", "blockedMinutes", "openMinutes",
  "fuBooked", "fuShown",
] as const;

interface SnapshotFile {
  version: 1;
  teamId: string;
  startDayKey: string;
  endDayKey: string;
  exportedAt: number;
  stats: Array<Record<string, unknown>>;
  teamStats: Array<Record<string, unknown>>;
}

export const readTeamStatsRange = internalQuery({
  args: { teamId: v.id("teams"), startDayKey: v.string(), endDayKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("closerDailyTeamStats")
      .withIndex("by_team_and_day", (q) =>
        q.eq("teamId", args.teamId).gte("dayKey", args.startDayKey).lte("dayKey", args.endDayKey),
      )
      .take(5000);
  },
});

export const exportMeasured = internalAction({
  args: { teamId: v.id("teams"), startDayKey: v.string(), endDayKey: v.string() },
  handler: async (ctx, args): Promise<{ storageId: Id<"_storage">; stats: number; teamStats: number }> => {
    const stats: Doc<"closerDailyStats">[] = await ctx.runQuery(
      internal.closerPerformance.readDailyStatsRange,
      args,
    );
    const teamStats: Doc<"closerDailyTeamStats">[] = await ctx.runQuery(
      internal.closerPerformanceSnapshot.readTeamStatsRange,
      args,
    );
    const file: SnapshotFile = {
      version: 1,
      teamId: String(args.teamId),
      startDayKey: args.startDayKey,
      endDayKey: args.endDayKey,
      exportedAt: Date.now(),
      stats: stats.map(strip),
      teamStats: teamStats.map(strip),
    };
    const storageId = await ctx.storage.store(
      new Blob([JSON.stringify(file)], { type: "application/json" }),
    );
    return { storageId, stats: stats.length, teamStats: teamStats.length };
  },
});

/** Drop the system fields so a row can be re-inserted or patched cleanly. */
function strip<T extends { _id: unknown; _creationTime: unknown }>(row: T): Record<string, unknown> {
  const { _id: _a, _creationTime: _b, ...rest } = row;
  return rest;
}

export const restoreMeasured = internalAction({
  args: { storageId: v.id("_storage"), dayKey: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ days: number; stats: number; teamStats: number }> => {
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new Error("Snapshot file not found");
    const file = JSON.parse(await blob.text()) as SnapshotFile;
    if (file.version !== 1) throw new Error(`Unknown snapshot version ${String(file.version)}`);

    const days = new Set<string>();
    for (const r of file.stats) days.add(String(r.dayKey));
    for (const r of file.teamStats) days.add(String(r.dayKey));
    const wanted = args.dayKey ? [args.dayKey] : Array.from(days).sort();

    let stats = 0;
    let teamStats = 0;
    for (const dayKey of wanted) {
      const r = await ctx.runMutation(internal.closerPerformanceSnapshot.restoreDay, {
        teamId: file.teamId as Id<"teams">,
        dayKey,
        stats: file.stats.filter((x) => x.dayKey === dayKey) as never,
        teamStats: file.teamStats.filter((x) => x.dayKey === dayKey) as never,
      });
      stats += r.stats;
      teamStats += r.teamStats;
    }
    return { days: wanted.length, stats, teamStats };
  },
});

/**
 * One day, put back exactly: rows in the snapshot are upserted, rows the
 * recount added since are deleted.
 */
export const restoreDay = internalMutation({
  args: {
    teamId: v.id("teams"),
    dayKey: v.string(),
    stats: v.array(v.any()),
    teamStats: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("closerDailyStats")
      .withIndex("by_team_and_day", (q) => q.eq("teamId", args.teamId).eq("dayKey", args.dayKey))
      .collect();
    const byCloser = new Map(existing.map((r) => [String(r.closerId), r]));
    let stats = 0;
    for (const raw of args.stats as Array<Record<string, unknown>>) {
      const values: Record<string, unknown> = {};
      for (const f of STATS_FIELDS) if (raw[f] !== undefined) values[f] = raw[f];
      const closerId = String(raw.closerId);
      const prior = byCloser.get(closerId);
      if (prior) {
        await ctx.db.patch(prior._id, { ...values, recountedAt: Number(raw.recountedAt ?? Date.now()) });
        byCloser.delete(closerId);
      } else {
        await ctx.db.insert("closerDailyStats", {
          teamId: args.teamId,
          dayKey: args.dayKey,
          closerId: raw.closerId as Id<"closers">,
          slots: 0, booked: 0, taken: 0, offers: 0, closes: 0, cash: 0, contractValue: 0,
          ...values,
          recountedAt: Number(raw.recountedAt ?? Date.now()),
        } as never);
      }
      stats += 1;
    }
    for (const [, stale] of byCloser) await ctx.db.delete(stale._id);

    const existingTeam = await ctx.db
      .query("closerDailyTeamStats")
      .withIndex("by_team_and_day", (q) => q.eq("teamId", args.teamId).eq("dayKey", args.dayKey))
      .collect();
    for (const row of existingTeam) await ctx.db.delete(row._id);
    let teamStats = 0;
    for (const raw of args.teamStats as Array<Record<string, unknown>>) {
      await ctx.db.insert("closerDailyTeamStats", { ...raw, teamId: args.teamId } as never);
      teamStats += 1;
    }
    return { stats, teamStats };
  },
});
