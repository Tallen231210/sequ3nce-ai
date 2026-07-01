// Analytics — month-over-month trends.
//
// Powers the "Month over month" comparison section. Returns one row per month
// over a trailing window (default 6 months) with the same metric definitions
// the single-period Money Ledger uses, so the chart and the hero always agree:
//
//   captured    = Σ contractValue where outcome === "closed"
//   leaked      = in-call losses + uncollected-on-closes + estimated no-shows
//   captureRate = captured / (captured + leaked)
//   closeRate   = closedCalls / calls-with-an-outcome (excl. no-shows)
//   totalCalls  = completed calls that month
//   avgDealSize = mean contractValue across calls with contractValue > 0
//
// Month bucketing is by the Convex runtime clock (UTC). Good enough for a
// trend view; a per-team timezone refinement can come later if a customer
// straddling a date line ever cares.
//
// Scale: reads the calls main table (light after the callContent split) over
// the window via by_team_and_date. 6 months of a busy team is well within
// limits; no callContent reads.

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MIN_MONTHS = 3;
const MAX_MONTHS = 12;
const DEFAULT_MONTHS = 6;

type Call = Doc<"calls">;

function computeMonthMetrics(calls: Call[]) {
  const closed = calls.filter((c) => c.outcome === "closed");
  const captured = closed.reduce((s, c) => s + (c.contractValue || 0), 0);

  const lostOrFollowUp = calls.filter(
    (c) => c.outcome === "lost" || c.outcome === "follow_up",
  );
  const inCallLosses = lostOrFollowUp.reduce((s, c) => s + (c.contractValue || 0), 0);

  const uncollected = closed
    .filter((c) => (c.contractValue ?? 0) > (c.cashCollected ?? 0))
    .reduce((s, c) => s + ((c.contractValue || 0) - (c.cashCollected || 0)), 0);

  const withValue = calls.filter((c) => (c.contractValue ?? 0) > 0);
  const avgDealSize =
    withValue.length > 0
      ? withValue.reduce((s, c) => s + (c.contractValue || 0), 0) / withValue.length
      : 0;

  const noShowCount = calls.filter((c) => c.outcome === "no_show").length;
  const noShows = noShowCount * avgDealSize;

  const leaked = inCallLosses + uncollected + noShows;
  const inPlay = captured + leaked;
  const captureRate = inPlay > 0 ? (captured / inPlay) * 100 : 0;

  const withOutcome = calls.filter((c) => c.outcome != null && c.outcome !== "no_show");
  const closeRate = withOutcome.length > 0 ? (closed.length / withOutcome.length) * 100 : 0;

  return {
    captured: Math.round(captured),
    leaked: Math.round(leaked),
    captureRate: Math.round(captureRate * 10) / 10,
    closeRate: Math.round(closeRate * 10) / 10,
    totalCalls: calls.length,
    avgDealSize: Math.round(avgDealSize),
  };
}

export const getMonthlyTrends = query({
  args: {
    teamId: v.id("teams"),
    // Trailing-window size (ignored when `year` is provided).
    months: v.optional(v.number()),
    // When set, show that calendar year's months (Jan → Dec, capped at the
    // current month for the current year) instead of a trailing window.
    year: v.optional(v.number()),
    closerId: v.optional(v.id("closers")),
  },
  handler: async (ctx, args) => {
    const now = new Date();

    // Build the month buckets (oldest → newest).
    const buckets: Array<{
      key: string;
      label: string;
      year: number;
      month: number;
      start: number;
      end: number;
      isCurrent: boolean;
    }> = [];

    const makeBucket = (year: number, month: number) => {
      const start = new Date(year, month, 1).getTime();
      const end = new Date(year, month + 1, 1).getTime() - 1;
      return {
        key: `${year}-${month}`,
        label: MONTH_LABELS[month],
        year,
        month,
        start,
        end,
        isCurrent: year === now.getFullYear() && month === now.getMonth(),
      };
    };

    if (args.year != null) {
      // Specific calendar year. For the current year, stop at the current
      // month so we don't render empty future months.
      const lastMonth = args.year === now.getFullYear() ? now.getMonth() : 11;
      for (let m = 0; m <= lastMonth; m++) buckets.push(makeBucket(args.year, m));
    } else {
      const months = Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, args.months ?? DEFAULT_MONTHS));
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push(makeBucket(d.getFullYear(), d.getMonth()));
      }
    }

    const windowStart = buckets[0].start;
    const windowEnd = buckets[buckets.length - 1].end;

    let calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", windowStart).lte("createdAt", windowEnd),
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    if (args.closerId) {
      calls = calls.filter((c) => c.closerId === args.closerId);
    }

    // Bucket calls by their month key.
    const byMonth = new Map<string, Call[]>();
    for (const b of buckets) byMonth.set(b.key, []);
    for (const c of calls) {
      const d = new Date(c.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const arr = byMonth.get(key);
      if (arr) arr.push(c); // ignore anything outside the window
    }

    const trend = buckets.map((b) => ({
      key: b.key,
      label: b.label,
      year: b.year,
      month: b.month,
      isCurrent: b.isCurrent,
      ...computeMonthMetrics(byMonth.get(b.key) ?? []),
    }));

    return { count: buckets.length, trend };
  },
});
