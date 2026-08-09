// ============================================================================
// End-of-day cash.
//
// What came in today, this month and this year, whether that's ahead of or
// behind the team's goal, and who collected it.
//
// The numbers come from the calls themselves — the cash a closer entered on
// the post-call form — NOT from the Team Performance board. That board is
// manual entry and only shows what closers have submitted to it, so a digest
// built on it would report zero on any day nobody filled it in and look like
// the team sold nothing.
//
// Read from the `callStats` sidecar for the same reason Collections does: the
// calls table carries transcripts, and scanning a year of them would blow
// Convex's read limit long before it produced a total.
// ============================================================================

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE } from "./closerPerformance";
import { formatInTimeZone } from "./setterDataNotifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Ceiling on rows read in one pass.
 *
 * Year to date on a busy team is the biggest scan here. Sidecar rows are tiny,
 * so this is generous — but it's bounded, and a team that hits it gets a
 * warning in the logs rather than a silently short total.
 */
const MAX_STATS_SCANNED = 20_000;

export interface CashLeader {
  closerId: string;
  name: string;
  today: number;
  month: number;
  deals: number;
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
}

/** Cash on a call only counts once the closer has said the deal closed. */
function cashOf(row: { outcome?: string; cashCollected?: number }): number {
  if (row.outcome !== "closed") return 0;
  return row.cashCollected ?? 0;
}

export async function collectCashDigest(
  ctx: { db: any },
  teamId: Id<"teams">,
  nowMs: number,
): Promise<CashDigestData> {
  const team = await ctx.db.get(teamId);
  const tz = team?.timezone || DEFAULT_TIMEZONE;
  const local = formatInTimeZone(new Date(nowMs), tz);

  // Boundaries are computed in the team's own zone. A digest that rolled over
  // at UTC midnight would move a 7pm deal in California into tomorrow.
  const startOfYear = Date.UTC(local.year, 0, 1) - tzOffsetMs(nowMs, tz);
  const startOfMonth = Date.UTC(local.year, local.month - 1, 1) - tzOffsetMs(nowMs, tz);
  const startOfDay =
    Date.UTC(local.year, local.month - 1, local.day) - tzOffsetMs(nowMs, tz);

  const stats = await ctx.db
    .query("callStats")
    .withIndex("by_team_and_date", (q: any) =>
      q.eq("teamId", teamId).gte("createdAt", startOfYear),
    )
    .take(MAX_STATS_SCANNED);

  const truncated = stats.length === MAX_STATS_SCANNED;
  if (truncated) {
    console.warn(
      `[cashDigest] team ${teamId} hit the ${MAX_STATS_SCANNED}-row scan ` +
        `ceiling — the year-to-date figure is short`,
    );
  }

  let today = 0;
  let monthToDate = 0;
  let yearToDate = 0;
  let dealsToday = 0;

  const byCloser = new Map<string, { today: number; month: number; deals: number }>();

  for (const row of stats) {
    const cash = cashOf(row);
    if (cash <= 0) continue;
    const at = row.createdAt ?? 0;

    yearToDate += cash;

    const closerId = row.closerId ? String(row.closerId) : null;
    if (at >= startOfMonth) {
      monthToDate += cash;
      if (closerId) {
        const e = byCloser.get(closerId) ?? { today: 0, month: 0, deals: 0 };
        e.month += cash;
        byCloser.set(closerId, e);
      }
    }
    if (at >= startOfDay) {
      today += cash;
      dealsToday++;
      if (closerId) {
        const e = byCloser.get(closerId) ?? { today: 0, month: 0, deals: 0 };
        e.today += cash;
        e.deals++;
        byCloser.set(closerId, e);
      }
    }
  }

  // The goal: an explicit team override, else the sum of the reps' own monthly
  // goals. Same rule the Team Performance board uses, so the two can't disagree
  // about what the team is aiming at.
  const target = await resolveTarget(ctx, teamId, team, local);

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
    if (e.month <= 0) continue;
    const closer = await ctx.db.get(closerId as Id<"closers">);
    leaders.push({
      closerId,
      name: closer?.name ?? "Unknown",
      today: e.today,
      month: e.month,
      deals: e.deals,
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
    truncated,
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

async function resolveTarget(
  ctx: { db: any },
  teamId: Id<"teams">,
  team: any,
  local: { year: number; month: number },
): Promise<number | null> {
  if (typeof team?.closerTeamCashGoalOverride === "number") {
    return team.closerTeamCashGoalOverride;
  }

  // Per-closer goals live in their own table, keyed by month so history stays
  // truthful. Same source the Team Performance board reads, so the two can't
  // disagree about what the team is aiming at.
  const monthKey = `${local.year}-${String(local.month).padStart(2, "0")}`;
  const goals = await ctx.db
    .query("closerGoals")
    .withIndex("by_team_and_month", (q: any) =>
      q.eq("teamId", teamId).eq("monthKey", monthKey),
    )
    .collect();

  if (goals.length === 0) return null;
  return goals.reduce((sum: number, g: any) => sum + (g.cashGoal ?? 0), 0);
}

export const getCashDigest = internalQuery({
  args: { teamId: v.id("teams"), nowMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<CashDigestData> =>
    collectCashDigest(ctx, args.teamId, args.nowMs ?? Date.now()),
});
