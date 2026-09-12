// ============================================================================
// Data health, read two ways: the manager card (this week so far) and the
// weekly post (last week, Monday to Sunday). Both run the same one-pass
// collector and the same pure scoring, so the card and the post can never
// disagree about a week.
// ============================================================================

import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { addDaysKey, computeDataHealth, weekStartKeyFor, workingDaysOfWeek, type DataHealth } from "./dataHealthCore";
import { getLocalDateRangeUtc } from "./setterDataNotifications";
import { resolveAuthUser } from "./setterGhlOauth";
import { collectTeamBookings } from "./setterTeamBookings";
import { loadUserDays, localDayBounds } from "./settersPageActivity";
import { activityShowsWork, type DayActivity } from "./lib/eodCrossCheck";
import { DEFAULT_CONNECT_SEC } from "./lib/dialAnswered";
import { teamHasSetterTeams } from "./setterTeamQueries";

export interface DataHealthWeek extends DataHealth {
  /** Claims and assignments made this week (any booking). */
  claimedThisWeek: number;
  weekStartKey: string;
  /** Last day included (Sunday for a finished week, today for the card). */
  weekEndKey: string;
  truncated: string[];
  timezone: string;
}

async function healthForWeek(
  ctx: { db: any },
  team: Doc<"teams">,
  weekStartKey: string,
  weekEndKey: string,
  nowMs: number,
): Promise<DataHealthWeek> {
  const tz = (team as { timezone?: string }).timezone || DEFAULT_TIMEZONE;
  const { startMs } = getLocalDateRangeUtc(weekStartKey, tz);
  const { endMs } = getLocalDateRangeUtc(weekEndKey, tz);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await collectTeamBookings(ctx as any, team._id, startMs, endMs, nowMs);

  // Who owed a form this week and didn't file it.
  //
  // This used to look at confirmation setters only, so the row it produces
  // has only ever been able to name one person on a five-person roster —
  // every booking setter was invisible to it. It also asked nothing about
  // whether the day was worked, so a day off read the same as a day skipped.
  const eodDays: Array<{ rosterId: string; dayKey: string; filed: boolean }> = [];
  // Only days that are over count as missed: today's EOD isn't due yet.
  const yesterdayKey = addDaysKey(dayKeyInTz(nowMs, tz), -1);
  const until = weekEndKey < yesterdayKey ? weekEndKey : yesterdayKey;
  const weekDays = workingDaysOfWeek(weekStartKey, until);
  const connectSec = (team as { setterConnectionThresholdSec?: number }).setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC;
  const dayBounds = weekDays.length > 0 ? localDayBounds(weekDays[0], weekDays[weekDays.length - 1], tz) : [];
  for (const r of data.rosters) {
    // A deactivated setter stays in the roster refs so their old bookings
    // keep their credit, but they owe nothing.
    if (r.active === false) continue;
    // Nothing is owed before they joined — the check this loop never had.
    const joinedKey = r.createdAt ? dayKeyInTz(r.createdAt, tz) : null;
    let activity: Map<string, DayActivity> | null = null;
    if (r.crmUserId && dayBounds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      activity = (await loadUserDays(ctx as any, team._id, r.crmUserId, dayBounds, connectSec)).byDay;
    }
    for (const dayKey of weekDays) {
      if (joinedKey && dayKey < joinedKey) continue;
      // No CRM user, or a day we couldn't read, means we cannot see them —
      // and silence we caused must never be reported as a day off.
      if (activity && activity.has(dayKey) && !activityShowsWork(activity.get(dayKey))) continue;
      const entry = await ctx.db
        .query("setterEodEntries")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_roster_and_day", (q: any) => q.eq("rosterId", r.rosterId).eq("dayKey", dayKey))
        .first();
      eodDays.push({ rosterId: r.rosterId, dayKey, filed: !!entry });
    }
  }

  const claims = await ctx.db
    .query("setterBookingClaims")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_claimed_at", (q: any) => q.eq("teamId", team._id).gte("claimedAt", startMs).lt("claimedAt", endMs))
    .take(1_000);

  return {
    ...computeDataHealth(data.records, data.rosters, eodDays),
    claimedThisWeek: claims.length,
    weekStartKey,
    weekEndKey,
    truncated: data.truncated,
    timezone: tz,
  };
}

/** The manager card: this week, Monday to today. Null off-flag. */
export const getDataHealthWeek = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<DataHealthWeek | null> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    if (user.role !== "admin" && user.role !== "manager") return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team || !teamHasSetterTeams(team)) return null;
    const tz = (team as { timezone?: string }).timezone || DEFAULT_TIMEZONE;
    const nowMs = Date.now();
    const todayKey = dayKeyInTz(nowMs, tz);
    return healthForWeek(ctx, team, weekStartKeyFor(todayKey), todayKey, nowMs);
  },
});

/** The weekly post: one finished week, Monday to Sunday. */
export const getDataHealthForPost = internalQuery({
  args: { teamId: v.id("teams"), weekStartKey: v.string() },
  handler: async (ctx, args): Promise<DataHealthWeek | null> => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;
    return healthForWeek(ctx, team, args.weekStartKey, addDaysKey(args.weekStartKey, 6), Date.now());
  },
});
