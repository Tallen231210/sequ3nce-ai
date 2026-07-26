import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  addTotals,
  applyOverride,
  computeCapacitySignal,
  computeCoverage,
  computeRates,
  emptyTotals,
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
      const ovByKey = new Map(
        overrides.map((o) => [`${o.dayKey}|${String(o.closerId)}`, o]),
      );
      const byCloser = new Map<string, FunnelTotals>();
      let capKnown = 0;
      let capUnknown = 0;
      for (const r of rows) {
        const key = String(r.closerId);
        const { totals } = applyOverride(
          {
            slots: r.slots, booked: r.booked, taken: r.taken,
            offers: r.offers, closes: r.closes, cash: r.cash,
            contractValue: r.contractValue,
            missingOutcomes: r.missingOutcomes ?? 0,
          },
          ovByKey.get(`${r.dayKey}|${key}`),
        );
        byCloser.set(key, addTotals(byCloser.get(key) ?? emptyTotals(), totals));
        if (r.capacityKnown === false) capUnknown += 1;
        else capKnown += 1;
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
