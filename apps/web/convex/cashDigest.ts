// ============================================================================
// End-of-day cash.
//
// What came in today, this month and this year, whether that's ahead of or
// behind the team's goal, and who collected it.
//
// The numbers come from the TEAM PERFORMANCE BOARD, not the post-call forms.
//
// That was the other way round first, on the reasoning that the board is
// manual entry and would read zero on a day nobody submitted. Tyler corrected
// it: the board is what these closers actually maintain, and several of them
// neglect the post-call form entirely. A digest is only useful if it matches
// the number the team already believes, and the board is that number.
//
// So it reads the same three tables the board does, through the same merge —
// manager override beats closer entry beats what we measured — and counts only
// days a human has reported. Anything else and the digest and the board would
// disagree in front of the whole team.
// ============================================================================

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE } from "./closerPerformance";
import { formatInTimeZone } from "./setterDataNotifications";
import { mergeDailyRows } from "./closerPerformanceMetrics";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Ceiling on rows read in one pass.
 *
 * Year to date on a busy team is the biggest scan here. Sidecar rows are tiny,
 * so this is generous — but it's bounded, and a team that hits it gets a
 * warning in the logs rather than a silently short total.
 */
const MAX_STATS_SCANNED = 20_000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export interface CashLeader {
  closerId: string;
  name: string;
  today: number;
  month: number;
  deals: number;
  /** Closes over calls taken, this month. Null when they took none. */
  closeRate: number | null;
}

export interface CashDigestData {
  today: number;
  monthToDate: number;
  yearToDate: number;
  dealsToday: number;
  /** The team's monthly cash goal, or null when nobody has set one. */
  target: number | null;
  /**
   * Where they'd land at the current rate. Null without a goal — a projection
   * with nothing to compare against is a number nobody can act on.
   */
  projected: number | null;
  /** Positive means ahead of where they need to be by now. */
  vsPace: number | null;
  dayOfMonth: number;
  daysInMonth: number;
  leaders: CashLeader[];
  truncated: boolean;
  /**
   * Team close rate — the AVERAGE of each closer's own rate, not the team's
   * total closes over total calls.
   *
   * Tyler asked for it this way deliberately. It gives every closer equal
   * weight regardless of how many calls they took, so one rep having a huge
   * day doesn't drag the team number to their own. Null when nobody took a
   * call in the period.
   */
  closeRateToday: number | null;
  closeRateMonth: number | null;
  /** Whether the prize target is standing in for a cash goal. */
  targetIsPrize: boolean;
  prizeName: string | null;
}

export async function collectCashDigest(
  ctx: { db: any },
  teamId: Id<"teams">,
  nowMs: number,
): Promise<CashDigestData> {
  const team = await ctx.db.get(teamId);
  const tz = team?.timezone || DEFAULT_TIMEZONE;
  const local = formatInTimeZone(new Date(nowMs), tz);

  // dayKeys are team-local "YYYY-MM-DD" strings, so the boundaries are string
  // prefixes rather than timestamps — no timezone arithmetic, and the same keys
  // the board itself groups by.
  const todayKey = `${local.year}-${pad2(local.month)}-${pad2(local.day)}`;
  const monthPrefix = `${local.year}-${pad2(local.month)}`;
  const startKey = `${local.year}-01-01`;
  const endKey = todayKey;

  const [stats, overrides, entries, closers] = await Promise.all([
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
      .query("closerDailyEntries")
      .withIndex("by_team_and_day", (q: any) =>
        q.eq("teamId", teamId).gte("dayKey", startKey).lte("dayKey", endKey),
      )
      .collect(),
    ctx.db
      .query("closers")
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect(),
  ]);

  const merged = mergeDailyRows(stats, overrides, entries);

  // Only days a human reported. Showing a measured number as though it were
  // reported is the exact confusion manual entry exists to remove — and it
  // would put a figure in Slack that the board doesn't show.
  const reported = merged.filter(
    (r: any) => r.confirmed || r.overridden.length > 0,
  );

  // Same label the Team Performance board uses for deactivated closers whose
  // filed days still count toward month/year — the digest must not read as
  // though they're still on the team.
  const nameById = new Map<string, string>(
    closers.map((c: any) => [
      String(c._id),
      c.status === "deactivated"
        ? `${c.name ?? "Unknown"} (departed)`
        : (c.name ?? "Unknown"),
    ]),
  );

  let today = 0;
  let monthToDate = 0;
  let yearToDate = 0;
  let dealsToday = 0;

  const byCloser = new Map<
    string,
    { today: number; month: number; deals: number; takenM: number; closesM: number }
  >();
  // Per-closer today figures, kept separately so the day's team close rate is
  // an average of the reps who actually worked today.
  const todayByCloser = new Map<string, { taken: number; closes: number }>();

  for (const row of reported) {
    const t = row.totals ?? {};
    const cash = t.cash ?? 0;
    const closes = t.closes ?? 0;
    const taken = t.taken ?? 0;
    const inMonth = row.dayKey.startsWith(monthPrefix);
    const isToday = row.dayKey === todayKey;

    yearToDate += cash;

    const e = byCloser.get(row.closerId) ?? {
      today: 0, month: 0, deals: 0, takenM: 0, closesM: 0,
    };

    if (inMonth) {
      monthToDate += cash;
      e.month += cash;
      e.deals += closes;
      e.takenM += taken;
      e.closesM += closes;
    }
    if (isToday) {
      today += cash;
      dealsToday += closes;
      e.today += cash;
      const d = todayByCloser.get(row.closerId) ?? { taken: 0, closes: 0 };
      d.taken += taken;
      d.closes += closes;
      todayByCloser.set(row.closerId, d);
    }
    byCloser.set(row.closerId, e);
  }

  // Average of individual rates, per Tyler — every closer weighted equally
  // rather than the team's total closes over its total calls.
  const meanRate = (
    rows: Array<{ taken: number; closes: number }>,
  ): number | null => {
    const withCalls = rows.filter((r) => r.taken > 0);
    if (withCalls.length === 0) return null;
    const sum = withCalls.reduce((s, r) => s + r.closes / r.taken, 0);
    return sum / withCalls.length;
  };

  const closeRateToday = meanRate([...todayByCloser.values()]);
  const closeRateMonth = meanRate(
    [...byCloser.values()].map((e) => ({ taken: e.takenM, closes: e.closesM })),
  );

  const { target, isPrize } = await resolveTarget(ctx, teamId, team, local);

  const daysInMonth = new Date(Date.UTC(local.year, local.month, 0)).getUTCDate();
  const dayOfMonth = local.day;

  let projected: number | null = null;
  let vsPace: number | null = null;
  if (target !== null && target > 0 && dayOfMonth > 0) {
    projected = Math.round((monthToDate / dayOfMonth) * daysInMonth);
    vsPace = Math.round(monthToDate - (target / daysInMonth) * dayOfMonth);
  }

  const leaders: CashLeader[] = [];
  for (const [closerId, e] of byCloser) {
    if (e.month <= 0 && e.closesM <= 0 && e.takenM <= 0) continue;
    leaders.push({
      closerId,
      name: nameById.get(closerId) ?? "Unknown",
      today: e.today,
      month: e.month,
      deals: e.deals,
      closeRate: e.takenM > 0 ? e.closesM / e.takenM : null,
    });
  }
  leaders.sort((a, b) => b.month - a.month);

  return {
    today,
    monthToDate,
    yearToDate,
    dealsToday,
    target,
    projected,
    vsPace,
    dayOfMonth,
    daysInMonth,
    leaders,
    truncated: false,
    closeRateToday,
    closeRateMonth,
    targetIsPrize: isPrize,
    prizeName: team?.closerPrizeName ?? null,
  };
}

/**
 * How far the team's zone is from UTC right now, in milliseconds.
 *
 * Needed because the day, month and year boundaries have to be the team's, not
 * UTC's — a deal closed at 7pm in California belongs to that day, and a digest
 * that rolled over at UTC midnight would file it under tomorrow and report the
 * wrong number to the person who closed it.
 */
function tzOffsetMs(nowMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(nowMs));
  const get = (t: string) =>
    parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asIfUtc - Math.floor(nowMs / 1000) * 1000;
}

/**
 * What the team is aiming at this month.
 *
 * Explicit cash goal, else the sum of the reps' own monthly goals, else the
 * PRIZE target. That last fallback exists because it's what RemoteStack had
 * actually set — a $4,000,000 "Team trip to Ibiza" and no cash goal at all —
 * so pace came back blank on a team that plainly had a target. The board
 * already treats the prize as a thing to pace against; this just stops the
 * digest disagreeing with it.
 */
async function resolveTarget(
  ctx: { db: any },
  teamId: Id<"teams">,
  team: any,
  local: { year: number; month: number },
): Promise<{ target: number | null; isPrize: boolean }> {
  if (typeof team?.closerTeamCashGoalOverride === "number") {
    return { target: team.closerTeamCashGoalOverride, isPrize: false };
  }

  // Per-closer goals live in their own table, keyed by month so history stays
  // truthful. Same source the Team Performance board reads.
  const monthKey = `${local.year}-${String(local.month).padStart(2, "0")}`;
  const goals = await ctx.db
    .query("closerGoals")
    .withIndex("by_team_and_month", (q: any) =>
      q.eq("teamId", teamId).eq("monthKey", monthKey),
    )
    .collect();

  if (goals.length > 0) {
    const sum = goals.reduce((s: number, g: any) => s + (g.cashGoal ?? 0), 0);
    if (sum > 0) return { target: sum, isPrize: false };
  }

  if (typeof team?.closerPrizeTarget === "number" && team.closerPrizeTarget > 0) {
    return { target: team.closerPrizeTarget, isPrize: true };
  }

  return { target: null, isPrize: false };
}

export const getCashDigest = internalQuery({
  args: { teamId: v.id("teams"), nowMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<CashDigestData> =>
    collectCashDigest(ctx, args.teamId, args.nowMs ?? Date.now()),
});
