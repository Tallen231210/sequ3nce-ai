import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  addTotals,
  computeCapacitySignal,
  computeCoverage,
  computeRates,
  emptyTotals,
  mergeDailyRows,
  type FunnelTotals,
} from "./closerPerformanceMetrics";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Data behind the daily Slack/Discord scoreboard.
//
// Reads the same rollup + overrides the dashboard reads, so the post and the
// board can never disagree — a scoreboard that contradicts the tab it links
// to is worse than no scoreboard.
// ============================================================================

export interface CloserScorecardRow {
  name: string;
  booked: number;
  taken: number;
  closes: number;
  cash: number;
  showPct: number | null;
  closePct: number | null;
}

export const getCloserScorecardData = internalQuery({
  args: {
    teamId: v.id("teams"),
    /** Team-local day the post covers, "YYYY-MM-DD". */
    dayKey: v.string(),
    /** Month containing dayKey, for month-to-date context. */
    monthKey: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    const teamId = args.teamId as Id<"teams">;

    const [dayRows, dayOverrides, monthRows, monthOverrides, closers] =
      await Promise.all([
        ctx.db
          .query("closerDailyStats")
          .withIndex("by_team_and_day", (q: any) =>
            q.eq("teamId", teamId).eq("dayKey", args.dayKey),
          )
          .collect(),
        ctx.db
          .query("closerDailyOverrides")
          .withIndex("by_team_and_day", (q: any) =>
            q.eq("teamId", teamId).eq("dayKey", args.dayKey),
          )
          .collect(),
        ctx.db
          .query("closerDailyStats")
          .withIndex("by_team_and_day", (q: any) =>
            q
              .eq("teamId", teamId)
              .gte("dayKey", `${args.monthKey}-01`)
              .lte("dayKey", `${args.monthKey}-31`),
          )
          .collect(),
        ctx.db
          .query("closerDailyOverrides")
          .withIndex("by_team_and_day", (q: any) =>
            q
              .eq("teamId", teamId)
              .gte("dayKey", `${args.monthKey}-01`)
              .lte("dayKey", `${args.monthKey}-31`),
          )
          .collect(),
        ctx.db
          .query("closers")
          .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
          .take(500),
      ]);

    const nameById = new Map(closers.map((c) => [String(c._id), c.name]));

    const merge = (
      rows: Doc<"closerDailyStats">[],
      overrides: Doc<"closerDailyOverrides">[],
    ) => {
      const byCloser = new Map<string, FunnelTotals>();
      let capKnown = 0;
      let capUnknown = 0;
      // Union, so a day the bot missed entirely but a manager corrected still
      // reaches the post.
      for (const row of mergeDailyRows(rows, overrides)) {
        byCloser.set(
          row.closerId,
          addTotals(byCloser.get(row.closerId) ?? emptyTotals(), row.totals),
        );
        if (row.capacityKnown === false) capUnknown += 1;
        else if (row.capacityKnown === true) capKnown += 1;
      }
      return { byCloser, capKnown, capUnknown };
    };

    const day = merge(dayRows, dayOverrides);
    const month = merge(monthRows, monthOverrides);

    let dayTotals = emptyTotals();
    for (const [, t] of day.byCloser) dayTotals = addTotals(dayTotals, t);
    let monthTotals = emptyTotals();
    for (const [, t] of month.byCloser) monthTotals = addTotals(monthTotals, t);

    // Only reps who actually did something appear. A daily post listing every
    // rep with a row of zeros trains people to ignore it.
    const rows: CloserScorecardRow[] = Array.from(day.byCloser.entries())
      .filter(([, t]) => t.booked > 0 || t.taken > 0 || t.cash > 0)
      .map(([closerId, t]) => {
        const rates = computeRates(t);
        return {
          name: nameById.get(closerId) ?? "Unknown",
          booked: t.booked,
          taken: t.taken,
          closes: t.closes,
          cash: t.cash,
          showPct: rates.showPct,
          closePct: rates.closePct,
        };
      })
      // Cash first, then closes, then work done. Without the last tiebreak a
      // day where nobody has collected yet ranks whoever happens to sort first
      // above the rep who actually took the calls.
      .sort(
        (a, b) =>
          b.cash - a.cash || b.closes - a.closes || b.taken - a.taken ||
          b.booked - a.booked,
      );

    const dayRates = computeRates(dayTotals);
    const dayCapacity = computeCapacitySignal(day.capKnown, day.capUnknown);
    if (!dayCapacity.reliable) dayRates.bookedPct = null;

    const monthCapacity = computeCapacitySignal(month.capKnown, month.capUnknown);

    return {
      dayKey: args.dayKey,
      monthKey: args.monthKey,
      dayTotals,
      dayRates,
      dayCoverage: computeCoverage(dayTotals),
      capacityReliable: dayCapacity.reliable,
      monthTotals,
      monthCapacityReliable: monthCapacity.reliable,
      rows,
      /** Nothing happened — the caller skips the post entirely. */
      isEmpty: dayTotals.booked === 0 && dayTotals.taken === 0,
    };
  },
});
