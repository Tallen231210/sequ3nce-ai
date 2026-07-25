import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import {
  DEFAULT_COMP_PCT,
  DEFAULT_TARGETS,
  addTotals,
  applyOverride,
  computeCoverage,
  computeEconomics,
  computeProjection,
  computeRates,
  emptyTotals,
  pctOfGoal,
  ragForRates,
  repNet,
  wow,
  type CloserRow,
  type FunnelTotals,
} from "./closerPerformanceMetrics";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Team Performance Sheet — dashboard read API.
//
// One query serves the Team view for a given month (optionally narrowed to a
// week). Reads the daily rollup rather than raw calls so a 12-month Year
// view stays far inside Convex's 32k-document transaction budget.
// ============================================================================

function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function dayKeysOfMonth(monthKey: string): string[] {
  const n = daysInMonth(monthKey);
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    out.push(`${monthKey}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

/** Week index (0-4) for a day within its month — WK1 = days 1-7, etc. */
function weekIndexOfDayKey(dayKey: string): number {
  const day = parseInt(dayKey.slice(8, 10), 10);
  return Math.min(4, Math.floor((day - 1) / 7));
}

export const getTeamPerformance = query({
  args: {
    clerkId: v.string(),
    /** Team-local "YYYY-MM". Defaults to the current month. */
    monthKey: v.optional(v.string()),
    /** 0-4 to scope to a single week; omit for the whole month. */
    weekIndex: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;
    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    if (!team) return null;

    const tz = team.timezone || DEFAULT_TIMEZONE;
    const nowMonth = dayKeyInTz(Date.now(), tz).slice(0, 7);
    const monthKey = args.monthKey ?? nowMonth;
    const isCurrentMonth = monthKey === nowMonth;
    const todayKey = dayKeyInTz(Date.now(), tz);

    const allDayKeys = dayKeysOfMonth(monthKey);
    const startKey = allDayKeys[0];
    const endKey = allDayKeys[allDayKeys.length - 1];

    // --- Derived rows + manual overrides for the month ---------------------
    const [stats, overrides, teamRows, closers, goals] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", startKey).lte("dayKey", endKey),
        )
        .collect(),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", startKey).lte("dayKey", endKey),
        )
        .collect(),
      ctx.db
        .query("closerDailyTeamStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", startKey).lte("dayKey", endKey),
        )
        .collect(),
      ctx.db
        .query("closers")
        .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
        .take(500),
      ctx.db
        .query("closerGoals")
        .withIndex("by_team_and_month", (q: any) =>
          q.eq("teamId", teamId).eq("monthKey", monthKey),
        )
        .collect(),
    ]);

    const inScope = (dayKey: string) =>
      args.weekIndex === undefined || weekIndexOfDayKey(dayKey) === args.weekIndex;

    const overrideByKey = new Map(
      overrides.map((o) => [`${o.dayKey}|${String(o.closerId)}`, o]),
    );
    const goalByCloser = new Map(
      goals.map((g) => [String(g.closerId), g.cashGoal]),
    );

    // --- Aggregate per closer ----------------------------------------------
    const totalsByCloser = new Map<string, FunnelTotals>();
    const overriddenByCloser = new Map<string, Set<string>>();
    // Week buckets power the sparkline + WoW trend.
    const weekCashTeam = [0, 0, 0, 0, 0];
    const weekCashByCloser = new Map<string, number[]>();

    for (const row of stats) {
      const key = String(row.closerId);
      const ov = overrideByKey.get(`${row.dayKey}|${key}`);
      const { totals, overridden } = applyOverride(
        {
          slots: row.slots, booked: row.booked, taken: row.taken,
          offers: row.offers, closes: row.closes, cash: row.cash,
          contractValue: row.contractValue,
          missingOutcomes: row.missingOutcomes ?? 0,
        },
        ov,
      );

      // Week buckets always span the whole month (the sparkline shows the
      // month even when the table is scoped to one week).
      const wi = weekIndexOfDayKey(row.dayKey);
      weekCashTeam[wi] += totals.cash;
      const wcb = weekCashByCloser.get(key) ?? [0, 0, 0, 0, 0];
      wcb[wi] += totals.cash;
      weekCashByCloser.set(key, wcb);

      if (!inScope(row.dayKey)) continue;
      totalsByCloser.set(
        key,
        addTotals(totalsByCloser.get(key) ?? emptyTotals(), totals),
      );
      if (overridden.length > 0) {
        const set = overriddenByCloser.get(key) ?? new Set<string>();
        overridden.forEach((f) => set.add(f));
        overriddenByCloser.set(key, set);
      }
    }

    const targets = {
      bookedPct: team.closerBookedPctTarget ?? DEFAULT_TARGETS.bookedPct,
      showPct: team.closerShowPctTarget ?? DEFAULT_TARGETS.showPct,
      offerClosePct:
        team.closerOfferClosePctTarget ?? DEFAULT_TARGETS.offerClosePct,
      closePct: team.closerClosePctTarget ?? DEFAULT_TARGETS.closePct,
    };
    const compPct = team.closerCompPct ?? DEFAULT_COMP_PCT;

    // Ad spend scoped to the period: whole month, or a fifth of it per week.
    const monthlyAdSpend = team.closerAdSpendMonthly ?? 0;
    const adSpendForPeriod =
      args.weekIndex === undefined ? monthlyAdSpend : monthlyAdSpend / 5;

    let teamTotals = emptyTotals();
    for (const [, t] of totalsByCloser) teamTotals = addTotals(teamTotals, t);

    const economics = computeEconomics(teamTotals, adSpendForPeriod, compPct);

    // Which week is "current" for WoW — the latest week with any activity.
    const lastActiveWeek = weekCashTeam.reduce(
      (acc, c, i) => (c > 0 ? i : acc),
      0,
    );

    const nameById = new Map(closers.map((c) => [String(c._id), c.name]));
    const rows: CloserRow[] = Array.from(totalsByCloser.entries())
      .map(([closerId, totals]) => {
        const rates = computeRates(totals);
        const goal = goalByCloser.get(closerId) ?? null;
        const wcb = weekCashByCloser.get(closerId) ?? [0, 0, 0, 0, 0];
        return {
          closerId: closerId as Id<"closers">,
          name: nameById.get(closerId) ?? "Unknown closer",
          totals,
          rates,
          rag: ragForRates(rates, targets),
          avgDeal: totals.closes > 0 ? totals.cash / totals.closes : null,
          net: repNet(totals.cash, totals.booked, economics.costPerBooked, compPct),
          goal,
          pctGoal: pctOfGoal(totals.cash, goal),
          wowPct:
            lastActiveWeek > 0
              ? wow(wcb[lastActiveWeek], wcb[lastActiveWeek - 1])
              : null,
          overriddenFields: Array.from(overriddenByCloser.get(closerId) ?? []),
        };
      })
      .sort((a, b) => b.totals.cash - a.totals.cash);

    // --- Goals, projection, prize ------------------------------------------
    const sumRepGoals = Array.from(goalByCloser.values()).reduce(
      (s, g) => s + g,
      0,
    );
    const teamTarget = team.closerTeamCashGoalOverride ?? sumRepGoals;
    const dim = daysInMonth(monthKey);
    const elapsed = isCurrentMonth ? parseInt(todayKey.slice(8, 10), 10) : dim;
    // Month totals (not week-scoped) drive pacing — a month projection from
    // one week's cash would be nonsense.
    let monthTotals = emptyTotals();
    for (const row of stats) {
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
      monthTotals = addTotals(monthTotals, totals);
    }
    const projection = computeProjection(
      monthTotals.cash,
      teamTarget,
      dim,
      elapsed,
      !isCurrentMonth,
    );

    const prizeTarget = team.closerPrizeTarget ?? teamTarget;
    const prize = {
      name: team.closerPrizeName ?? null,
      emoji: team.closerPrizeEmoji ?? null,
      target: prizeTarget,
      collected: monthTotals.cash,
      pct: prizeTarget > 0 ? (monthTotals.cash / prizeTarget) * 100 : null,
      unlocked: prizeTarget > 0 && monthTotals.cash >= prizeTarget,
      remaining: Math.max(0, prizeTarget - monthTotals.cash),
    };

    const bookedUnattributed = teamRows
      .filter((r) => inScope(r.dayKey))
      .reduce((s, r) => s + r.bookedUnattributed, 0);

    return {
      monthKey,
      isCurrentMonth,
      weekIndex: args.weekIndex ?? null,
      timezone: tz,
      targets,
      compPct,
      teamTotals,
      teamRates: computeRates(teamTotals),
      // Bookings on shared calendars we refuse to attribute to one rep.
      bookedUnattributed,
      // Drives the "log your outcomes" state instead of a wall of zeros.
      coverage: computeCoverage(teamTotals),
      economics,
      perCloser: rows,
      weekCash: weekCashTeam,
      projection,
      teamTarget,
      sumRepGoals,
      prize,
      activeClosers: closers.filter((c) => c.status === "active").length,
    };
  },
});
