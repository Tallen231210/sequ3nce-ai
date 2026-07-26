import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import {
  DEFAULT_COMP_PCT,
  addTotals,
  applyOverride,
  computeCapacitySignal,
  computeRates,
  emptyTotals,
  type FunnelTotals,
} from "./closerPerformanceMetrics";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Team Performance Sheet — year view.
//
// Twelve months of trend from the daily rollup. This is the reason the rollup
// exists: aggregating a year straight from `calls` and `calendarEvents` would
// blow Convex's 32k-document transaction budget on any real team.
// ============================================================================

/**
 * Ceiling on rows read for a year. A 50-closer team runs ~18k rows (50 × 365),
 * comfortably inside Convex's 32k limit; this stops a much larger team from
 * hitting it as a hard failure. If we ever truncate we SAY so rather than
 * quietly render a year that's missing December.
 */
const MAX_YEAR_ROWS = 25_000;

export const getYearPerformance = query({
  args: {
    clerkId: v.string(),
    /** Four-digit year. Defaults to the team's current year. */
    year: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;
    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    if (!team) return null;

    const tz = team.timezone || DEFAULT_TIMEZONE;
    const todayKey = dayKeyInTz(Date.now(), tz);
    const currentYear = parseInt(todayKey.slice(0, 4), 10);
    const year = args.year ?? currentYear;
    if (!Number.isInteger(year) || year < 2000 || year > currentYear + 1) {
      return null;
    }

    const startKey = `${year}-01-01`;
    const endKey = `${year}-12-31`;

    const [stats, overrides, goals] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", startKey).lte("dayKey", endKey),
        )
        .take(MAX_YEAR_ROWS),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", startKey).lte("dayKey", endKey),
        )
        .take(MAX_YEAR_ROWS),
      ctx.db
        .query("closerGoals")
        .withIndex("by_team_and_month", (q: any) => q.eq("teamId", teamId))
        .take(2000),
    ]);

    const truncated = stats.length >= MAX_YEAR_ROWS;

    const overrideByKey = new Map(
      overrides.map((o) => [`${o.dayKey}|${String(o.closerId)}`, o]),
    );

    // Goals are per closer per month; the year table compares against the sum.
    const goalByMonth = new Map<string, number>();
    for (const g of goals) {
      if (!g.monthKey.startsWith(`${year}-`)) continue;
      goalByMonth.set(g.monthKey, (goalByMonth.get(g.monthKey) ?? 0) + g.cashGoal);
    }

    const byMonth = new Map<
      string,
      { totals: FunnelTotals; capKnown: number; capUnknown: number }
    >();

    for (const row of stats) {
      const monthKey = row.dayKey.slice(0, 7);
      const ov = overrideByKey.get(`${row.dayKey}|${String(row.closerId)}`);
      const { totals } = applyOverride(
        {
          slots: row.slots, booked: row.booked, taken: row.taken,
          offers: row.offers, closes: row.closes, cash: row.cash,
          contractValue: row.contractValue,
          missingOutcomes: row.missingOutcomes ?? 0,
        },
        ov,
      );
      const bucket =
        byMonth.get(monthKey) ??
        { totals: emptyTotals(), capKnown: 0, capUnknown: 0 };
      bucket.totals = addTotals(bucket.totals, totals);
      if (row.capacityKnown === false) bucket.capUnknown += 1;
      else bucket.capKnown += 1;
      byMonth.set(monthKey, bucket);
    }

    const compPct = team.closerCompPct ?? DEFAULT_COMP_PCT;
    const monthlyAdSpend = team.closerAdSpendMonthly ?? 0;
    const currentMonthKey = todayKey.slice(0, 7);

    // Always emit all twelve months so the chart keeps a stable x-axis and a
    // month with no activity reads as a gap rather than vanishing.
    const months = [];
    let prevCash: number | null = null;
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${year}-${String(m).padStart(2, "0")}`;
      const bucket = byMonth.get(monthKey);
      const totals = bucket?.totals ?? emptyTotals();
      const capacity = computeCapacitySignal(
        bucket?.capKnown ?? 0,
        bucket?.capUnknown ?? 0,
      );
      const rates = computeRates(totals);
      if (!capacity.reliable) rates.bookedPct = null;

      const hasData = totals.booked > 0 || totals.taken > 0 || totals.cash > 0;
      // Month-over-month only means something between two months that both
      // happened; comparing against a month with no data would read as a
      // collapse rather than an absence.
      const momPct =
        prevCash !== null && prevCash > 0 && hasData
          ? ((totals.cash - prevCash) / prevCash) * 100
          : null;

      const goal = goalByMonth.get(monthKey) ?? null;

      months.push({
        monthKey,
        monthIndex: m,
        isFuture: monthKey > currentMonthKey,
        isCurrent: monthKey === currentMonthKey,
        hasData,
        totals,
        rates,
        capacityReliable: capacity.reliable,
        avgDeal: totals.closes > 0 ? totals.cash / totals.closes : null,
        costPerBooked:
          monthlyAdSpend > 0 && totals.booked > 0
            ? monthlyAdSpend / totals.booked
            : null,
        net: totals.cash - monthlyAdSpend - totals.cash * (compPct / 100),
        goal,
        pctGoal: goal && goal > 0 ? (totals.cash / goal) * 100 : null,
        momPct,
      });

      if (hasData) prevCash = totals.cash;
    }

    let yearTotals = emptyTotals();
    for (const m of months) yearTotals = addTotals(yearTotals, m.totals);

    const active = months.filter((m) => m.hasData);
    const best = active.reduce(
      (acc, m) => (acc === null || m.totals.cash > acc.totals.cash ? m : acc),
      null as (typeof months)[number] | null,
    );

    return {
      year,
      currentYear,
      timezone: tz,
      truncated,
      months,
      yearTotals,
      yearRates: computeRates(yearTotals),
      activeMonths: active.length,
      bestMonthKey: best?.monthKey ?? null,
      avgCashPerActiveMonth:
        active.length > 0 ? yearTotals.cash / active.length : 0,
    };
  },
});
