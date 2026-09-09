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
import { teamHasSetterTeams } from "./setterTeamQueries";

export interface DataHealthWeek extends DataHealth {
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

  // The confirmation setter's filings, Mon..Sat up to the week's end.
  const eodDays: Array<{ rosterId: string; dayKey: string; filed: boolean }> = [];
  const todayKey = dayKeyInTz(nowMs, tz);
  const until = weekEndKey < todayKey ? weekEndKey : todayKey;
  for (const r of data.rosters) {
    if (r.role !== "confirmation") continue;
    for (const dayKey of workingDaysOfWeek(weekStartKey, until)) {
      const entry = await ctx.db
        .query("setterEodEntries")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_roster_and_day", (q: any) => q.eq("rosterId", r.rosterId).eq("dayKey", dayKey))
        .first();
      eodDays.push({ rosterId: r.rosterId, dayKey, filed: !!entry });
    }
  }

  return {
    ...computeDataHealth(data.records, data.rosters, eodDays),
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
