import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  DEFAULT_TARGETS,
  addTotals,
  computeCapacitySignal,
  computeProjection,
  computeRates,
  emptyTotals,
  mergeDailyRows,
  ragForRates,
} from "./closerPerformanceMetrics";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// What a closer sees in the desktop app.
//
// Same rollup and the same precedence as the manager board — one source, so
// a closer and their manager can never be looking at different numbers for
// the same day.
//
// Deliberately excludes ad spend, rep comp, targets-as-editable, Net and ROAS
// for OTHER closers. Net and ROAS both let a closer back-solve cost-per-booked
// and from there the team's ad spend, which is the figure managers most often
// want withheld.
// ============================================================================

function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map((s) => parseInt(s, 10));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

async function loadCloser(ctx: any, closerId: Id<"closers">) {
  const closer = (await ctx.db.get(closerId)) as Doc<"closers"> | null;
  if (!closer || closer.status === "deactivated") return null;
  const team = (await ctx.db.get(closer.teamId)) as Doc<"teams"> | null;
  if (!team) return null;
  return { closer, team, tz: team.timezone || DEFAULT_TIMEZONE };
}

/** One closer's own month: funnel, rates, goal progress. */
export const getSelfPerformance = internalQuery({
  args: { closerId: v.id("closers"), monthKey: v.optional(v.string()) },
  handler: async (ctx, args): Promise<any> => {
    const info = await loadCloser(ctx, args.closerId);
    if (!info) return null;
    const { closer, team, tz } = info;
    const teamId = closer.teamId as Id<"teams">;

    const monthKey =
      args.monthKey && /^\d{4}-\d{2}$/.test(args.monthKey)
        ? args.monthKey
        : dayKeyInTz(Date.now(), tz).slice(0, 7);
    const start = `${monthKey}-01`;
    const end = `${monthKey}-31`;

    const [stats, overrides, entries, teamEntries, goal] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_closer_and_day", (q: any) =>
          q.eq("closerId", args.closerId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
      ctx.db
        .query("closerGoals")
        .withIndex("by_team_month_closer", (q: any) =>
          q
            .eq("teamId", teamId)
            .eq("monthKey", monthKey)
            .eq("closerId", args.closerId),
        )
        .first(),
    ]);

    const mine = mergeDailyRows(stats, overrides, entries).filter(
      (r) => r.closerId === String(args.closerId),
    );

    let totals = emptyTotals();
    let capKnown = 0;
    let capUnknown = 0;
    let daysSubmitted = 0;
    // Their cash by week, for the same sparkline the manager board carries.
    const weekCash = [0, 0, 0, 0, 0];
    for (const row of mine) {
      // Reported-only, matching the manager board exactly.
      if (!row.confirmed && row.overridden.length === 0) continue;
      totals = addTotals(totals, row.totals);
      const wi = Math.min(4, Math.floor((parseInt(row.dayKey.slice(8, 10), 10) - 1) / 7));
      weekCash[wi] += row.totals.cash;
      if (row.confirmed) daysSubmitted += 1;
      if (row.capacityKnown === false) capUnknown += 1;
      else if (row.capacityKnown === true) capKnown += 1;
    }

    // Team cash for the shared prize. The prize belongs to the whole floor, so
    // showing a closer only their own share of it would misrepresent the race.
    let teamCash = 0;
    for (const row of mergeDailyRows(stats, overrides, teamEntries)) {
      if (!row.confirmed && row.overridden.length === 0) continue;
      teamCash += row.totals.cash;
    }

    const targets = {
      bookedPct: team.closerBookedPctTarget ?? DEFAULT_TARGETS.bookedPct,
      showPct: team.closerShowPctTarget ?? DEFAULT_TARGETS.showPct,
      offerClosePct:
        team.closerOfferClosePctTarget ?? DEFAULT_TARGETS.offerClosePct,
      closePct: team.closerClosePctTarget ?? DEFAULT_TARGETS.closePct,
    };
    const capacity = computeCapacitySignal(capKnown, capUnknown);
    const rates = computeRates(totals);
    if (!capacity.reliable) rates.bookedPct = null;

    const todayKey = dayKeyInTz(Date.now(), tz);
    const isCurrentMonth = monthKey === todayKey.slice(0, 7);
    const daysElapsed = isCurrentMonth
      ? parseInt(todayKey.slice(8, 10), 10)
      : daysInMonth(monthKey);

    return {
      monthKey,
      timezone: tz,
      closerName: closer.name ?? "You",
      totals,
      rates,
      rag: ragForRates(rates, targets),
      targets,
      capacityReliable: capacity.reliable,
      avgCash: totals.closes > 0 ? totals.cash / totals.closes : null,
      avgDeal: totals.closes > 0 ? totals.contractValue / totals.closes : null,
      goal: goal?.cashGoal ?? null,
      pctGoal:
        goal && goal.cashGoal > 0 ? (totals.cash / goal.cashGoal) * 100 : null,
      // Their own submission rate — the nudge lives here, not on a manager screen.
      daysSubmitted,
      daysElapsed,
      weekCash,
      // Paced against their own goal, not the team's.
      projection: computeProjection(
        totals.cash,
        goal?.cashGoal ?? 0,
        daysInMonth(monthKey),
        daysElapsed,
        !isCurrentMonth,
      ),
      prize:
        team.closerPrizeName && (team.closerPrizeTarget ?? 0) > 0
          ? {
              name: team.closerPrizeName,
              emoji: team.closerPrizeEmoji ?? null,
              target: team.closerPrizeTarget as number,
              collected: teamCash,
              pct: (teamCash / (team.closerPrizeTarget as number)) * 100,
              unlocked: teamCash >= (team.closerPrizeTarget as number),
              remaining: Math.max(0, (team.closerPrizeTarget as number) - teamCash),
            }
          : null,
    };
  },
});

/**
 * The closer's own sheet for a month: every day up to today, pre-filled from
 * what we measured, with anything they already reported on top.
 *
 * Every day stays editable however old. Refunds and balance payments arrive
 * weeks after the sale and have to land on the day it happened.
 */
export const getSelfDailyEntries = internalQuery({
  args: { closerId: v.id("closers"), monthKey: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const info = await loadCloser(ctx, args.closerId);
    if (!info) return null;
    const { closer, tz } = info;
    const teamId = closer.teamId as Id<"teams">;
    if (!/^\d{4}-\d{2}$/.test(args.monthKey)) return null;

    const start = `${args.monthKey}-01`;
    const end = `${args.monthKey}-31`;

    const [stats, entries, overrides] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_closer_and_day", (q: any) =>
          q.eq("closerId", args.closerId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
    ]);

    const key = (d: string) => `${d}|${String(args.closerId)}`;
    const statBy = new Map(
      stats
        .filter((r) => String(r.closerId) === String(args.closerId))
        .map((r) => [key(r.dayKey), r]),
    );
    const entryBy = new Map(entries.map((e) => [key(e.dayKey), e]));
    const ovBy = new Map(
      overrides
        .filter((o) => String(o.closerId) === String(args.closerId))
        .map((o) => [key(o.dayKey), o]),
    );

    const todayKey = dayKeyInTz(Date.now(), tz);
    const dim = daysInMonth(args.monthKey);
    const rows = [];
    for (let d = 1; d <= dim; d++) {
      const dayKey = `${args.monthKey}-${String(d).padStart(2, "0")}`;
      if (dayKey > todayKey) break;
      const st = statBy.get(key(dayKey));
      const en = entryBy.get(key(dayKey));
      const ov = ovBy.get(key(dayKey));
      rows.push({
        dayKey,
        // Pre-fill. Marked as a suggestion in the UI, never as a stat.
        measured: {
          slots: st?.slots ?? 0, booked: st?.booked ?? 0, taken: st?.taken ?? 0,
          offers: st?.offers ?? 0, closes: st?.closes ?? 0, cash: st?.cash ?? 0,
          contractValue: st?.contractValue ?? 0,
          fuBooked: st?.fuBooked ?? 0, fuShown: st?.fuShown ?? 0,
        },
        // True when the bot recorded nothing — the sheet asks them to fill it
        // in rather than to confirm a row of zeros.
        measuredExists: !!st,
        reported: en
          ? {
              slots: en.slots, booked: en.booked, taken: en.taken,
              offers: en.offers, closes: en.closes, cash: en.cash,
              contractValue: en.contractValue,
              fuBooked: en.fuBooked, fuShown: en.fuShown,
              tier1Pitched: en.tier1Pitched, tier2Pitched: en.tier2Pitched,
              tier3Pitched: en.tier3Pitched,
            }
          : null,
        confirmedAt: en?.confirmedAt ?? null,
        // Shown read-only: a closer should know their manager changed a figure.
        managerCorrected: ov
          ? {
              slots: ov.slots, booked: ov.booked, taken: ov.taken,
              offers: ov.offers, closes: ov.closes, cash: ov.cash,
              fuBooked: ov.fuBooked, fuShown: ov.fuShown,
              tier1Pitched: ov.tier1Pitched, tier2Pitched: ov.tier2Pitched,
              tier3Pitched: ov.tier3Pitched,
            }
          : null,
      });
    }
    rows.reverse(); // today first — that's the day they're filling in

    // Tier labels for the EOD form; teams without prices see no tier inputs.
    const team = await ctx.db.get(teamId);
    const tierPrices = (team as Doc<"teams"> | null)?.closerTierPrices ?? null;

    return { monthKey: args.monthKey, timezone: tz, todayKey, rows, tierPrices };
  },
});

/**
 * The team leaderboard as a closer may see it.
 *
 * Net and ROAS are omitted, not blanked: both are derived from ad spend, and
 * from either one plus their own call count a closer can solve for
 * cost-per-booked and approximate the team's ad budget.
 */
export const getLeaderboardForCloser = internalQuery({
  args: { closerId: v.id("closers"), monthKey: v.optional(v.string()) },
  handler: async (ctx, args): Promise<any> => {
    const info = await loadCloser(ctx, args.closerId);
    if (!info) return null;
    const { closer, tz } = info;
    const teamId = closer.teamId as Id<"teams">;

    const monthKey =
      args.monthKey && /^\d{4}-\d{2}$/.test(args.monthKey)
        ? args.monthKey
        : dayKeyInTz(Date.now(), tz).slice(0, 7);
    const start = `${monthKey}-01`;
    const end = `${monthKey}-31`;

    const [stats, overrides, entries, closers] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .collect(),
      ctx.db
        .query("closers")
        .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
        .take(500),
    ]);

    const nameById = new Map(closers.map((c) => [String(c._id), c.name]));
    const byCloser = new Map<string, ReturnType<typeof emptyTotals>>();
    for (const row of mergeDailyRows(stats, overrides, entries)) {
      if (!row.confirmed && row.overridden.length === 0) continue;
      byCloser.set(
        row.closerId,
        addTotals(byCloser.get(row.closerId) ?? emptyTotals(), row.totals),
      );
    }

    const rows = Array.from(byCloser.entries())
      .map(([closerId, t]) => {
        const rates = computeRates(t);
        return {
          closerId,
          name: nameById.get(closerId) ?? "Unknown",
          isYou: closerId === String(args.closerId),
          booked: t.booked,
          taken: t.taken,
          offers: t.offers,
          closes: t.closes,
          cash: t.cash,
          avgCash: t.closes > 0 ? t.cash / t.closes : null,
          avgDeal: t.closes > 0 ? t.contractValue / t.closes : null,
          showPct: rates.showPct,
          closePct: rates.closePct,
        };
      })
      .sort((a, b) => b.cash - a.cash || b.closes - a.closes || b.taken - a.taken);

    return { monthKey, rows };
  },
});

/**
 * Twelve months of the closer's own reported numbers.
 *
 * Reads the same rollup with the same reported-only rule as everything else,
 * so their year and their manager's year can never disagree. Excludes the
 * ad-spend columns the manager board carries — cost per booked and net both
 * expose the team's ad budget.
 */
export const getSelfYearPerformance = internalQuery({
  args: { closerId: v.id("closers"), year: v.optional(v.number()) },
  handler: async (ctx, args): Promise<any> => {
    const info = await loadCloser(ctx, args.closerId);
    if (!info) return null;
    const { closer, tz } = info;
    const teamId = closer.teamId as Id<"teams">;

    const todayKey = dayKeyInTz(Date.now(), tz);
    const currentYear = parseInt(todayKey.slice(0, 4), 10);
    const year = args.year ?? currentYear;
    if (!Number.isInteger(year) || year < 2000 || year > currentYear + 1) return null;

    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    // A year of one team's daily rows. Capped for the same reason the manager
    // year view is: a large team must degrade visibly, not fail.
    const MAX_ROWS = 25_000;

    const [stats, overrides, entries, goals] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .take(MAX_ROWS),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).gte("dayKey", start).lte("dayKey", end),
        )
        .take(MAX_ROWS),
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_closer_and_day", (q: any) =>
          q.eq("closerId", args.closerId).gte("dayKey", start).lte("dayKey", end),
        )
        .take(MAX_ROWS),
      ctx.db
        .query("closerGoals")
        .withIndex("by_team_and_month", (q: any) => q.eq("teamId", teamId))
        .take(2000),
    ]);

    const goalByMonth = new Map(
      goals
        .filter(
          (g) =>
            String(g.closerId) === String(args.closerId) &&
            g.monthKey.startsWith(`${year}-`),
        )
        .map((g) => [g.monthKey, g.cashGoal]),
    );

    const byMonth = new Map<
      string,
      { totals: ReturnType<typeof emptyTotals>; daysSubmitted: number }
    >();
    for (const row of mergeDailyRows(stats, overrides, entries)) {
      if (row.closerId !== String(args.closerId)) continue;
      if (!row.confirmed && row.overridden.length === 0) continue;
      const mk = row.dayKey.slice(0, 7);
      const b = byMonth.get(mk) ?? { totals: emptyTotals(), daysSubmitted: 0 };
      b.totals = addTotals(b.totals, row.totals);
      if (row.confirmed) b.daysSubmitted += 1;
      byMonth.set(mk, b);
    }

    const currentMonthKey = todayKey.slice(0, 7);
    const months = [];
    let prevCash: number | null = null;
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${year}-${String(m).padStart(2, "0")}`;
      const bucket = byMonth.get(monthKey);
      const totals = bucket?.totals ?? emptyTotals();
      const hasData = (bucket?.daysSubmitted ?? 0) > 0;
      const goal = goalByMonth.get(monthKey) ?? null;

      months.push({
        monthKey,
        monthIndex: m,
        isCurrent: monthKey === currentMonthKey,
        isFuture: monthKey > currentMonthKey,
        hasData,
        totals,
        rates: computeRates(totals),
        daysSubmitted: bucket?.daysSubmitted ?? 0,
        daysInMonth: daysInMonth(monthKey),
        avgCash: totals.closes > 0 ? totals.cash / totals.closes : null,
        avgDeal: totals.closes > 0 ? totals.contractValue / totals.closes : null,
        goal,
        pctGoal: goal && goal > 0 ? (totals.cash / goal) * 100 : null,
        // Only between two months that both happened — comparing against a
        // month with nothing submitted would read as a collapse, not a gap.
        momPct:
          prevCash !== null && prevCash > 0 && hasData
            ? ((totals.cash - prevCash) / prevCash) * 100
            : null,
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
      months,
      yearTotals,
      activeMonths: active.length,
      bestMonthKey: best?.monthKey ?? null,
      avgCashPerActiveMonth:
        active.length > 0 ? yearTotals.cash / active.length : 0,
      truncated: stats.length >= MAX_ROWS,
    };
  },
});
