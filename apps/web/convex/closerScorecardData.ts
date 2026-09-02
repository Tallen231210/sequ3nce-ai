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

/**
 * One closer's day, carrying every field the end-of-day form captures.
 *
 * The post used to show four of the seven (booked, taken, closes, cash) even
 * though the merge produced all of them — so a manager reading Slack saw less
 * than the closer had typed in. Slots, offers and contract value are the ones
 * that were being dropped, and they're the ones that explain the others: a bad
 * close rate reads differently when you can see how many offers were made.
 */
/**
 * Move a "YYYY-MM-DD" key by whole days.
 *
 * UTC arithmetic on a date-only string, never on the team's clock: this only
 * produces the lower bound of a range scan, and doing it in a timezone would
 * make the boundary shift under DST for no benefit. A day either falls inside
 * the fortnight or it doesn't.
 */
function shiftDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export interface CloserScorecardRow {
  name: string;
  slots: number;
  booked: number;
  taken: number;
  offers: number;
  closes: number;
  cash: number;
  contractValue: number;
  showPct: number | null;
  closePct: number | null;
  offerClosePct: number | null;
  /** Same fields for the previous day they worked, for the deltas. Null on their first day. */
  prev: {
    slots: number;
    booked: number;
    taken: number;
    offers: number;
    closes: number;
    cash: number;
    contractValue: number;
  } | null;
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

    const [
      dayRows, dayOverrides, dayEntries,
      monthRows, monthOverrides, monthEntries,
      closers,
    ] = await Promise.all([
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
          .query("closerDailyEntries")
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
          .query("closerDailyEntries")
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

    // Departed closers keep their filed history (see closerPerformance
    // recount) — the post says so rather than reading like they're still here.
    const nameById = new Map(
      closers.map((c) => [
        String(c._id),
        c.status === "deactivated" ? `${c.name} (departed)` : c.name,
      ]),
    );

    const merge = (
      rows: Doc<"closerDailyStats">[],
      overrides: Doc<"closerDailyOverrides">[],
      entries: Doc<"closerDailyEntries">[],
    ) => {
      const byCloser = new Map<string, FunnelTotals>();
      let capKnown = 0;
      let capUnknown = 0;
      // Union, so a day the bot missed entirely but a manager corrected still
      // reaches the post.
      for (const row of mergeDailyRows(rows, overrides, entries)) {
        // Reported only — the post must not claim numbers nobody submitted.
        if (!row.confirmed && row.overridden.length === 0) continue;
        byCloser.set(
          row.closerId,
          addTotals(byCloser.get(row.closerId) ?? emptyTotals(), row.totals),
        );
        if (row.capacityKnown === false) capUnknown += 1;
        else if (row.capacityKnown === true) capKnown += 1;
      }
      return { byCloser, capKnown, capUnknown };
    };

    const day = merge(dayRows, dayOverrides, dayEntries);
    const month = merge(monthRows, monthOverrides, monthEntries);

    // ---- The day before, for comparison ------------------------------------
    //
    // Deliberately the previous day WITH ACTIVITY, not the previous calendar
    // day. This team doesn't work weekends, so a literal yesterday makes every
    // Monday a miracle recovery from zero and every Saturday a collapse. A
    // fixed Mon-Fri list would break on public holidays and on teams that work
    // Sundays, so the data decides rather than a calendar.
    //
    // Bounded to a fortnight: far enough back to clear Christmas, short enough
    // that a dormant team doesn't drag a month of rows into a query with a
    // 1-second budget.
    const LOOKBACK_DAYS = 14;
    const windowStart = shiftDayKey(args.dayKey, -LOOKBACK_DAYS);
    const [prevRows, prevOverrides, prevEntries] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", windowStart).lt("dayKey", args.dayKey),
        )
        .collect(),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", windowStart).lt("dayKey", args.dayKey),
        )
        .collect(),
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", windowStart).lt("dayKey", args.dayKey),
        )
        .collect(),
    ]);

    // Per day, per closer — so "their previous working day" is theirs, not the
    // team's. A closer off sick on Friday should be compared against the last
    // day THEY worked, not against a day they weren't there for.
    const prevByDay = new Map<string, Map<string, FunnelTotals>>();
    for (const row of mergeDailyRows(prevRows, prevOverrides, prevEntries)) {
      if (!row.confirmed && row.overridden.length === 0) continue;
      const forDay = prevByDay.get(row.dayKey) ?? new Map<string, FunnelTotals>();
      forDay.set(
        row.closerId,
        addTotals(forDay.get(row.closerId) ?? emptyTotals(), row.totals),
      );
      prevByDay.set(row.dayKey, forDay);
    }
    const daysDescending = Array.from(prevByDay.keys()).sort().reverse();

    /** The most recent earlier day this closer actually has numbers for. */
    const previousFor = (closerId: string): FunnelTotals | null => {
      for (const d of daysDescending) {
        const t = prevByDay.get(d)?.get(closerId);
        if (t && (t.booked > 0 || t.taken > 0 || t.cash > 0)) return t;
      }
      return null;
    };

    /** Team-wide previous working day: the latest day anyone had activity. */
    const prevTeamDayKey = daysDescending.find((d) => {
      let any = emptyTotals();
      for (const [, t] of prevByDay.get(d) ?? []) any = addTotals(any, t);
      return any.booked > 0 || any.taken > 0 || any.cash > 0;
    });
    let prevDayTotals: FunnelTotals | null = null;
    if (prevTeamDayKey) {
      prevDayTotals = emptyTotals();
      for (const [, t] of prevByDay.get(prevTeamDayKey) ?? []) {
        prevDayTotals = addTotals(prevDayTotals, t);
      }
    }

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
        const p = previousFor(closerId);
        return {
          name: nameById.get(closerId) ?? "Unknown",
          slots: t.slots,
          booked: t.booked,
          taken: t.taken,
          offers: t.offers,
          closes: t.closes,
          cash: t.cash,
          contractValue: t.contractValue,
          showPct: rates.showPct,
          closePct: rates.closePct,
          offerClosePct: rates.offerClosePct,
          prev: p
            ? {
                slots: p.slots,
                booked: p.booked,
                taken: p.taken,
                offers: p.offers,
                closes: p.closes,
                cash: p.cash,
                contractValue: p.contractValue,
              }
            : null,
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
      /** Team totals for the previous working day, and which day that was. */
      prevDayKey: prevTeamDayKey ?? null,
      prevDayTotals,
      /** Nothing happened — the caller skips the post entirely. */
      isEmpty: dayTotals.booked === 0 && dayTotals.taken === 0,
    };
  },
});
