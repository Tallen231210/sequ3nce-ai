// ============================================================================
// The EOD cross-check over a range: for every setter and every team-local
// day, what they filed beside what Close and the calendar measured, and the
// flags where the two disagree beyond the team's tolerances. One loader
// feeds the Setters page (cards + drawer), the daily scorecard post and the
// Monday data-health post, so a flag reads the same everywhere.
// ============================================================================

import { v } from "convex/values";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { addDaysKey, weekStartKeyFor } from "./dataHealthCore";
import { getLocalDateRangeUtc } from "./setterDataNotifications";
import { RANGE_COHORT_TAKE, loadCohortRecords, measuredDayFor, type DayActivity } from "./setterEodMeasured";
import { resolveAuthUser } from "./setterGhlOauth";
import { teamHasSetterTeams } from "./setterTeamQueries";
import { loadUserDays, localDayBounds } from "./settersPageActivity";
import { resolveSettersPageAccess } from "./settersPageGate";
import { DEFAULT_CONNECT_SEC, ladderFor } from "./lib/dialAnswered";
import { crossCheckDay, tolerancesFor, type CrossCheckFlag, type CrossCheckTolerances, type FiledDay, type MeasuredDay } from "./lib/eodCrossCheck";

const ENTRIES_TAKE = 4_000;
const ROSTER_TAKE = 200;

export interface DayCheck {
  dayKey: string;
  /** An EOD was owed: an active setter and either a filed day, or a working day (Mon–Sat) that is over. */
  due: boolean;
  filed: FiledDay | null;
  measured: MeasuredDay;
  flags: CrossCheckFlag[];
  /**
   * Answered dials in Close lasting at least each threshold (seconds) — what
   * each connect definition would count as pick-ups that day. Null when the
   * setter has no Close user or files the confirmation form.
   */
  ladder: { thresholds: number[]; counts: number[] } | null;
}

export interface RosterCheck {
  rosterId: string;
  name: string;
  role: "booking" | "confirmation";
  linked: boolean;
  active: boolean;
  daysDue: number;
  daysFiled: number;
  /** Filed days with at least one flag. */
  daysFlagged: number;
  flagCount: number;
  days: DayCheck[];
}

export interface CrossCheckRange {
  startKey: string;
  endKey: string;
  timezone: string;
  tolerances: CrossCheckTolerances;
  /** The team's connect threshold — the ladder step the cards and flags count. */
  connectSec: number;
  ladderThresholds: number[];
  byRoster: RosterCheck[];
  truncated: string[];
}

type Entry = Doc<"setterEodEntries">;

function filedOf(e: Entry, role: "booking" | "confirmation"): FiledDay {
  if (role === "confirmation") {
    return {
      newSelfBooked: e.newSelfBooked,
      contacted: e.contacted,
      reached: e.reached,
      confirmedOnCalendar: e.confirmedOnCalendar,
      confirmedShowed: e.confirmedShowed,
    };
  }
  return { dials: e.dials, pickUps: e.pickUps, sets: e.sets, callsOnCalendar: e.callsOnCalendar, callsShown: e.callsShown };
}

const isSunday = (dayKey: string) => {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
};

export async function crossCheckRange(ctx: QueryCtx, team: Doc<"teams">, startMs: number, endMs: number, nowMs: number): Promise<CrossCheckRange> {
  const teamId = team._id;
  const tz = (team as { timezone?: string }).timezone || DEFAULT_TIMEZONE;
  const tolerances = tolerancesFor((team as { setterEodTolerances?: Partial<CrossCheckTolerances> }).setterEodTolerances);
  const connectSec = team.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC;
  const ladderThresholds = ladderFor(connectSec);
  const startKey = dayKeyInTz(startMs, tz);
  const todayKey = dayKeyInTz(nowMs, tz);
  const yesterdayKey = addDaysKey(todayKey, -1);
  const endKey = [dayKeyInTz(endMs - 1, tz), todayKey].sort()[0];
  const bounds = localDayBounds(startKey, endKey, tz);
  const truncated: string[] = [];

  const rosterRows = await ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(ROSTER_TAKE);
  const cohorts = await loadCohortRecords(ctx, teamId, startMs, endMs, nowMs, RANGE_COHORT_TAKE);
  truncated.push(...cohorts.truncated);

  const entries = await ctx.db
    .query("setterEodEntries")
    .withIndex("by_team_and_day", (q) => q.eq("teamId", teamId).gte("dayKey", startKey).lte("dayKey", endKey))
    .take(ENTRIES_TAKE);
  if (entries.length >= ENTRIES_TAKE) truncated.push("eod entries");
  const entryByRosterDay = new Map<string, Entry>();
  for (const e of entries) entryByRosterDay.set(`${String(e.rosterId)}|${e.dayKey}`, e);

  const byRoster: RosterCheck[] = [];
  for (const row of rosterRows) {
    const rosterId = String(row._id);
    const role: "booking" | "confirmation" = row.role === "confirmation" ? "confirmation" : "booking";
    const linked = !!row.crmUserId;
    const active = row.active !== false;
    let activity: Map<string, DayActivity> | null = null;
    let unreadDays = new Set<string>();
    if (linked && role === "booking") {
      const days = await loadUserDays(ctx, teamId, row.crmUserId as string, bounds, connectSec, ladderThresholds);
      if (days.truncatedDays.length > 0) truncated.push(`${row.name}: ${days.truncatedDays.length} ${days.truncatedDays.length === 1 ? "day" : "days"} too busy to read`);
      activity = days.byDay;
      unreadDays = new Set(days.truncatedDays);
    }
    // Nothing is owed before the roster row existed.
    const firstDueKey = dayKeyInTz(row._creationTime, tz);
    const days: DayCheck[] = [];
    for (const b of bounds) {
      const key = b.dayKey;
      const entry = entryByRosterDay.get(`${rosterId}|${key}`) ?? null;
      // The form they filed decides which numbers are compared; the roster's
      // role only fills in for a day they haven't filed yet.
      const dayRole: "booking" | "confirmation" = entry?.formShape ?? role;
      // A day we could read but that has no events is a real zero; a day
      // that hit the read cap is unknown — null, so it is never flagged.
      const dayActivity = activity && !unreadDays.has(key) ? activity.get(key) ?? { dials: 0, answered: 0, answeredAt: ladderThresholds.map(() => 0) } : null;
      const measured = measuredDayFor(cohorts.records, { rosterId, role: dayRole, linked }, key, dayActivity, b.endMs);
      const filed = entry ? filedOf(entry, dayRole) : null;
      const flags = filed ? crossCheckDay(filed, measured, tolerances) : [];
      // A filed day always counts as due (a Sunday they worked is still a
      // day they reported); an unfiled one only once it is over, Mon–Sat,
      // and only from the day they joined the roster.
      const due = active && (entry !== null || (!isSunday(key) && key <= yesterdayKey && key >= firstDueKey));
      const ladder = dayRole === "booking" && dayActivity?.answeredAt ? { thresholds: ladderThresholds, counts: dayActivity.answeredAt } : null;
      days.push({ dayKey: key, due, filed, measured, flags, ladder });
    }
    const filedDays = days.filter((d) => d.filed !== null);
    if (filedDays.length === 0 && !active) continue; // gone, and nothing to check
    byRoster.push({
      rosterId,
      name: row.name,
      role,
      linked,
      active,
      daysDue: days.filter((d) => d.due).length,
      daysFiled: filedDays.length,
      daysFlagged: filedDays.filter((d) => d.flags.length > 0).length,
      flagCount: filedDays.reduce((n, d) => n + d.flags.length, 0),
      days,
    });
  }
  byRoster.sort((a, b) => b.daysFlagged - a.daysFlagged || a.name.localeCompare(b.name));
  return { startKey, endKey, timezone: tz, tolerances, connectSec, ladderThresholds, byRoster, truncated };
}

/** One team-local day, for the daily post: roster id → that day's check. */
export async function crossCheckDayFor(ctx: QueryCtx, team: Doc<"teams">, dayKey: string, nowMs: number): Promise<Map<string, DayCheck>> {
  const tz = (team as { timezone?: string }).timezone || DEFAULT_TIMEZONE;
  const { startMs, endMs } = getLocalDateRangeUtc(dayKey, tz);
  const range = await crossCheckRange(ctx, team, startMs, endMs, nowMs);
  const out = new Map<string, DayCheck>();
  for (const r of range.byRoster) {
    const day = r.days.find((d) => d.dayKey === dayKey);
    if (day) out.set(r.rosterId, day);
  }
  return out;
}

function weekWindow(team: Doc<"teams">, weekStartKey: string, nowMs: number): { startMs: number; endMs: number } {
  const tz = (team as { timezone?: string }).timezone || DEFAULT_TIMEZONE;
  const { startMs } = getLocalDateRangeUtc(weekStartKey, tz);
  const { endMs } = getLocalDateRangeUtc(addDaysKey(weekStartKey, 6), tz);
  return { startMs, endMs: Math.min(endMs, nowMs) };
}

/** The Setters page: the range the manager is looking at (14-day clamp, like every page query). */
export const getSettersCrossCheck = query({
  args: { clerkId: v.string(), rangeStart: v.number(), rangeEnd: v.number() },
  handler: async (ctx, args): Promise<CrossCheckRange | null> => {
    const access = await resolveSettersPageAccess(ctx, args.clerkId, args.rangeStart, args.rangeEnd);
    if (!access) return null;
    return crossCheckRange(ctx, access.team, access.startMs, access.endMs, access.nowMs);
  },
});

/** The data-health card: this week so far. Null off-flag. */
export const getEodCrossCheckThisWeek = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<CrossCheckRange | null> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    if (user.role !== "admin" && user.role !== "manager") return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team || !teamHasSetterTeams(team)) return null;
    const nowMs = Date.now();
    const tz = (team as { timezone?: string }).timezone || DEFAULT_TIMEZONE;
    const { startMs, endMs } = weekWindow(team, weekStartKeyFor(dayKeyInTz(nowMs, tz)), nowMs);
    return crossCheckRange(ctx, team, startMs, endMs, nowMs);
  },
});

/** The Monday post: one finished week. */
export const getEodCrossCheckForWeek = internalQuery({
  args: { teamId: v.id("teams"), weekStartKey: v.string() },
  handler: async (ctx, args): Promise<CrossCheckRange | null> => {
    const team = await ctx.db.get(args.teamId);
    if (!team || !teamHasSetterTeams(team)) return null;
    const nowMs = Date.now();
    const { startMs, endMs } = weekWindow(team, args.weekStartKey, nowMs);
    return crossCheckRange(ctx, team, startMs, endMs, nowMs);
  },
});
