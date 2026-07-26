import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import {
  DEFAULT_COMP_PCT,
  DEFAULT_TARGETS,
  addTotals,
  applyOverride,
  computeCapacitySignal,
  computeCoverage,
  computeEconomics,
  computeProjection,
  computeRates,
  emptyTotals,
  mergeDailyRows,
  pctOfGoal,
  ragForRates,
  repNet,
  repRoas,
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
    // Capacity is only quotable where we could read the rep's own calendar.
    const capByCloser = new Map<string, { known: number; unknown: number }>();
    // Capacity inputs, so the UI can explain a low Booked% rather than just
    // assert one. Averaged over days the closer actually had activity.
    const openByCloser = new Map<string, { openMin: number; days: number }>();
    const overriddenByCloser = new Map<string, Set<string>>();
    // Week buckets power the sparkline.
    const weekCashTeam = [0, 0, 0, 0, 0];
    // Cash per closer per week per day-within-week. WoW needs day resolution:
    // comparing a part-finished week against a completed one is arithmetic,
    // not performance, and it reported a collapse every Monday.
    const weekDayCash = new Map<string, number[][]>();

    // Union of measured rows and corrections — a manager's entry on a day we
    // measured nothing must still appear. See mergeDailyRows.
    const merged = mergeDailyRows(stats, overrides);

    for (const row of merged) {
      const key = row.closerId;
      const totals = row.totals;

      // Week buckets always span the whole month (the sparkline shows the
      // month even when the table is scoped to one week).
      const dayOfMonth = parseInt(row.dayKey.slice(8, 10), 10);
      const wi = weekIndexOfDayKey(row.dayKey);
      const offsetInWeek = (dayOfMonth - 1) % 7;
      weekCashTeam[wi] += totals.cash;
      const grid =
        weekDayCash.get(key) ??
        Array.from({ length: 5 }, () => new Array(7).fill(0) as number[]);
      grid[wi][offsetInWeek] += totals.cash;
      weekDayCash.set(key, grid);

      if (!inScope(row.dayKey)) continue;
      const cap = capByCloser.get(key) ?? { known: 0, unknown: 0 };
      if (row.capacityKnown === false) cap.unknown += 1;
      else if (row.capacityKnown === true) cap.known += 1;
      capByCloser.set(key, cap);

      if (row.capacityKnown === true && typeof row.openMinutes === "number") {
        const o = openByCloser.get(key) ?? { openMin: 0, days: 0 };
        o.openMin += row.openMinutes;
        o.days += 1;
        openByCloser.set(key, o);
      }
      totalsByCloser.set(
        key,
        addTotals(totalsByCloser.get(key) ?? emptyTotals(), totals),
      );
      if (row.overridden.length > 0) {
        const set = overriddenByCloser.get(key) ?? new Set<string>();
        row.overridden.forEach((f) => set.add(f));
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

    let capKnown = 0;
    let capUnknown = 0;
    for (const [, c] of capByCloser) {
      capKnown += c.known;
      capUnknown += c.unknown;
    }
    const capacity = computeCapacitySignal(capKnown, capUnknown);

    // Derived before economics: unattributed bookings belong in the
    // cost-per-booked denominator.
    const scopedTeamRowsEarly = teamRows.filter((r) => inScope(r.dayKey));
    const unattributedForPeriod = scopedTeamRowsEarly.reduce(
      (s, r) => s + r.bookedUnattributed,
      0,
    );
    const economics = computeEconomics(
      teamTotals,
      adSpendForPeriod,
      compPct,
      unattributedForPeriod,
    );

    // --- Week-over-week window ------------------------------------------
    // Anchor on the week in progress (or, for a past month, the last week with
    // activity), then compare only the days that have actually elapsed in it
    // against the SAME number of days in the prior week. Without that, every
    // reading before Sunday compares a partial week to a full one and shows a
    // drop that is purely calendar arithmetic.
    const dim = daysInMonth(monthKey);
    const todayDayOfMonth = parseInt(todayKey.slice(8, 10), 10);
    const anchorWeek = isCurrentMonth
      ? weekIndexOfDayKey(todayKey)
      : weekCashTeam.reduce((acc, c, i) => (c > 0 ? i : acc), 0);

    const weekStartDay = anchorWeek * 7 + 1;
    const daysExisting = Math.min(7, dim - weekStartDay + 1);
    const daysElapsedInWeek = Math.max(
      0,
      isCurrentMonth
        ? Math.min(daysExisting, todayDayOfMonth - weekStartDay + 1)
        : daysExisting,
    );

    /** Cash in the first `days` days of a given week for one closer. */
    const cashInWeekPrefix = (
      grid: number[][] | undefined,
      week: number,
      days: number,
    ): number => {
      if (!grid || week < 0 || days <= 0) return 0;
      let sum = 0;
      for (let i = 0; i < days && i < 7; i++) sum += grid[week][i];
      return sum;
    };

    const nameById = new Map(closers.map((c) => [String(c._id), c.name]));
    const rows: CloserRow[] = Array.from(totalsByCloser.entries())
      .map(([closerId, totals]) => {
        const cap = capByCloser.get(closerId) ?? { known: 0, unknown: 0 };
        const capacity = computeCapacitySignal(cap.known, cap.unknown);
        const rates = computeRates(totals);
        // Slots we had to assume can't support a rate. Suppress rather than
        // publish a confident-looking number built on a guessed denominator.
        if (!capacity.reliable) rates.bookedPct = null;
        const goal = goalByCloser.get(closerId) ?? null;
        const grid = weekDayCash.get(closerId);
        return {
          closerId: closerId as Id<"closers">,
          name: nameById.get(closerId) ?? "Unknown closer",
          totals,
          rates,
          rag: ragForRates(rates, targets),
          capacity,
          // Average hours left unbooked per active day — the denominator's
          // story, without which Booked% can't be interpreted.
          openHoursPerDay: (() => {
            const o = openByCloser.get(closerId);
            return o && o.days > 0 ? o.openMin / 60 / o.days : null;
          })(),
          avgDeal: totals.closes > 0 ? totals.cash / totals.closes : null,
          net: repNet(totals.cash, totals.booked, economics.costPerBooked, compPct),
          // What the company put into this rep's lead flow, and what came back.
          // Charged on calls taken: show rate is the setter's responsibility,
          // so a closer isn't billed for prospects who never turned up.
          adCost:
            economics.costPerBooked !== null
              ? economics.costPerBooked * totals.taken
              : null,
          roas: repRoas(totals.cash, totals.taken, economics.costPerBooked),
          goal,
          pctGoal: pctOfGoal(totals.cash, goal),
          // Null in week 1 (nothing to compare against) and on a day-zero
          // week, rather than inventing a comparison.
          wowPct:
            anchorWeek > 0 && daysElapsedInWeek > 0
              ? wow(
                  cashInWeekPrefix(grid, anchorWeek, daysElapsedInWeek),
                  cashInWeekPrefix(grid, anchorWeek - 1, daysElapsedInWeek),
                )
              : null,
          overriddenFields: Array.from(overriddenByCloser.get(closerId) ?? []),
          // Weekly cash for this rep — powers the row sparkline and the
          // per-closer view when the board is filtered to them.
          weekCash: (grid ?? []).map((wk) => wk.reduce((a, b) => a + b, 0)),
        };
      })
      .sort((a, b) => b.totals.cash - a.totals.cash);

    // --- Goals, projection, prize ------------------------------------------
    const sumRepGoals = Array.from(goalByCloser.values()).reduce(
      (s, g) => s + g,
      0,
    );
    const teamTarget = team.closerTeamCashGoalOverride ?? sumRepGoals;
    const elapsed = isCurrentMonth ? todayDayOfMonth : dim;
    // Month totals (not week-scoped) drive pacing — a month projection from
    // one week's cash would be nonsense.
    let monthTotals = emptyTotals();
    for (const row of merged) monthTotals = addTotals(monthTotals, row.totals);

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

    const scopedTeamRows = teamRows.filter((r) => inScope(r.dayKey));
    const teamRates = computeRates(teamTotals);
    if (!capacity.reliable) teamRates.bookedPct = null;

    const bookedUnattributed = scopedTeamRows.reduce(
      (s, r) => s + r.bookedUnattributed,
      0,
    );

    // Roll the per-day unknown-rep tallies up to the period. Keyed
    // case-insensitively so "Callum B" and "callum b" don't split.
    const repTally = new Map<string, { name: string; count: number }>();
    for (const r of scopedTeamRows) {
      for (const u of r.unknownReps ?? []) {
        const k = u.name.trim().toLowerCase();
        const cur = repTally.get(k);
        if (cur) cur.count += u.count;
        else repTally.set(k, { name: u.name.trim(), count: u.count });
      }
    }
    const unknownReps = Array.from(repTally.values()).sort(
      (a, b) => b.count - a.count,
    );

    return {
      monthKey,
      isCurrentMonth,
      weekIndex: args.weekIndex ?? null,
      timezone: tz,
      targets,
      compPct,
      teamTotals,
      teamRates: teamRates,
      teamRatesRag: ragForRates(teamRates, targets),
      // Whether Slots were measured well enough to quote Booked% at all.
      capacity,
      // Bookings on shared calendars we refuse to attribute to one rep.
      bookedUnattributed,
      // Named reps behind those bookings who have no seat — actionable.
      unknownReps,
      // Drives the "log your outcomes" state instead of a wall of zeros.
      coverage: computeCoverage(teamTotals),
      economics: {
        ...economics,
        // Team ROAS: every dollar of cash against every dollar of ad spend.
        roas:
          adSpendForPeriod > 0 ? teamTotals.cash / adSpendForPeriod : null,
      },
      perCloser: rows,
      weekCash: weekCashTeam,
      // So the UI can state what WoW actually compared.
      wowWindow: { weekIndex: anchorWeek, daysCompared: daysElapsedInWeek },
      projection,
      teamTarget,
      sumRepGoals,
      prize,
      activeClosers: closers.filter((c) => c.status === "active").length,
    };
  },
});
