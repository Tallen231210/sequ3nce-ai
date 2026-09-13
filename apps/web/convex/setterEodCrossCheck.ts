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
import { loadOffDays, offKey, offViewOf, type OffView } from "./eodOffDays";
import { loadUserDays, localDayBounds } from "./settersPageActivity";
import { resolveSettersPageAccess } from "./settersPageGate";
import { DEFAULT_CONNECT_SEC, ladderFor } from "./lib/dialAnswered";
import { countsAsDue, crossCheckDay, dayStatusOf, didWork, tolerancesFor, type CrossCheckFlag, type CrossCheckTolerances, type DayStatus, type FiledDay, type MeasuredDay } from "./lib/eodCrossCheck";

const ENTRIES_TAKE = 4_000;
const ROSTER_TAKE = 200;

export interface DayCheck {
  dayKey: string;
  /** Which of the four this day is. See dayStatusOf in lib/eodCrossCheck. */
  status: DayStatus | null;
  /** Set when somebody said they didn't work. Null otherwise — "we saw nothing" is not this. */
  off: OffView | null;
  /**
   * Marked off on a day the CRM shows real work on. The mark stands — we
   * report what happened rather than ruling on it — but the manager sees
   * the contradiction beside it.
   */
  offContradicted: boolean;
  /** What we saw on a day marked off — "47 dials", "2 sets", never a bare zero. */
  offEvidence: string | null;
  /** Shorthand for "counts in the denominator of filed N of M" — filed, missing or unmeasured. */
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
  /** Days we could see and they did nothing. Nobody is chased for these. */
  daysNoActivity: number;
  /** Days we could not see them at all. Chased, because zero is not evidence. */
  daysUnmeasured: number;
  /** Days somebody said they didn't work. Outside the filed N of M fraction, on purpose. */
  daysOff: number;
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

/**
 * Which form this entry came from. Rows written before the confirmation form
 * existed (2026-09-09) carry no formShape, and falling back to the setter's
 * CURRENT role then reads five fields their form never had — which is how a
 * setter who filed properly showed up with nothing compared and zero flags.
 */
function shapeOf(e: Entry, role: "booking" | "confirmation"): "booking" | "confirmation" {
  if (e.formShape === "booking" || e.formShape === "confirmation") return e.formShape;
  const carriesConfirmationFields =
    e.newSelfBooked !== undefined ||
    e.contacted !== undefined ||
    e.reached !== undefined ||
    e.confirmedOnCalendar !== undefined ||
    e.confirmedShowed !== undefined;
  if (carriesConfirmationFields) return "confirmation";
  // Booking fields are required on that form, so their presence identifies it.
  return e.dials !== undefined || e.pickUps !== undefined || e.sets !== undefined ? "booking" : role;
}

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
  const offDays = await loadOffDays(ctx, teamId, startKey, endKey, "setter");
  if (offDays.truncated) truncated.push("days marked off");
  const entryByRosterDay = new Map<string, Entry>();
  for (const e of entries) entryByRosterDay.set(`${String(e.rosterId)}|${e.dayKey}`, e);

  const byRoster: RosterCheck[] = [];
  // ---- Pass one: read what Close recorded, decide nothing yet. ----------
  // "Have we gone blind?" can only be answered once every row is in, and
  // that question has to be answered before any day is excused.
  interface Gathered {
    row: Doc<"setterRoster">;
    rosterId: string;
    role: "booking" | "confirmation";
    linked: boolean;
    active: boolean;
    firstDueKey: string;
    activity: Map<string, DayActivity> | null;
    unreadDays: Set<string>;
  }
  const gathered: Gathered[] = [];
  for (const row of rosterRows) {
    const rosterId = String(row._id);
    const role: "booking" | "confirmation" = row.role === "confirmation" ? "confirmation" : "booking";
    const linked = !!row.crmUserId;
    const active = row.active !== false;
    const hasAnyEntry = bounds.some((b) => entryByRosterDay.has(`${rosterId}|${b.dayKey}`));
    let activity: Map<string, DayActivity> | null = null;
    let unreadDays = new Set<string>();
    // Someone off the roster with nothing filed is dropped further down, so
    // don't pay for a day-by-day scan we are about to throw away.
    if (linked && role === "booking" && (active || hasAnyEntry)) {
      const days = await loadUserDays(ctx, teamId, row.crmUserId as string, bounds, connectSec, ladderThresholds);
      if (days.truncatedDays.length > 0) truncated.push(`${row.name}: ${days.truncatedDays.length} ${days.truncatedDays.length === 1 ? "day" : "days"} too busy to read`);
      activity = days.byDay;
      unreadDays = new Set(days.truncatedDays);
    }
    gathered.push({ row, rosterId, role, linked, active, firstDueKey: dayKeyInTz(row._creationTime, tz), activity, unreadDays });
  }

  // The sync's own heartbeat: the last day ANYBODY on the team registered a
  // call or a text. Before it we were provably listening, so a quiet day is
  // a real quiet day and can be excused. After it we may simply have stopped
  // hearing, so nobody is excused.
  //
  // This is deliberately not "did every setter read zero today" — for a
  // Monday-to-Friday team that is true every weekend, and it would chase the
  // whole roster every Saturday to guard against an outage that isn't there.
  //
  // Both heartbeat tests need more than one day to mean anything: over a
  // single-day window "the team read nothing" and "it was Sunday" are the
  // same sentence. crossCheckDayFor asks for exactly one day, so below two
  // the heartbeat abstains rather than declaring everyone unreadable.
  const heartbeatUsable = bounds.length >= 2;
  const hasEvents = (c: DayActivity | undefined) => !!c && c.dials + (c.texts ?? 0) > 0;
  let lastLiveDay: string | null = null;
  for (const g of gathered) {
    if (!g.activity) continue;
    for (const [dayKey, counts] of g.activity) {
      if (hasEvents(counts) && (lastLiveDay === null || dayKey > lastLiveDay)) lastLiveDay = dayKey;
    }
  }

  // ---- Pass two: decide. ------------------------------------------------
  for (const g of gathered) {
    const { rosterId, role, linked, active, firstDueKey, activity, unreadDays } = g;
    // A CRM link that was deleted or mis-typed reads zero forever. Left
    // alone that excuses the person permanently and tells nobody, which is
    // strictly worse than chasing them — so a person who registered nothing
    // all period while the team was live is treated as unreadable, not idle.
    const sawSomething = activity ? Array.from(activity.values()).some(hasEvents) : true;
    const linkAlive = sawSomething || lastLiveDay === null || !heartbeatUsable;
    if (heartbeatUsable && activity && !sawSomething && lastLiveDay !== null) {
      truncated.push(`${g.row.name}: nothing at all from the CRM this period — check their Close user`);
    }
    const days: DayCheck[] = [];
    for (const b of bounds) {
      const key = b.dayKey;
      const entry = entryByRosterDay.get(`${rosterId}|${key}`) ?? null;
      // The form they filed decides which numbers are compared; the roster's
      // role only fills in for a day they haven't filed yet.
      const dayRole: "booking" | "confirmation" = entry ? shapeOf(entry, role) : role;
      // A day we could read but that has no events is a real zero; a day
      // that hit the read cap is unknown — null, so it is never flagged.
      const dayActivity = activity && !unreadDays.has(key) ? activity.get(key) ?? { dials: 0, answered: 0, texts: 0, answeredAt: ladderThresholds.map(() => 0) } : null;
      const measured = measuredDayFor(cohorts.records, { rosterId, role: dayRole, linked }, key, dayActivity, b.endMs);
      const filed = entry ? filedOf(entry, dayRole) : null;
      // A confirmation setter's rows from before the form split carry booking
      // fields, so they read as a booking day and get compared against
      // outbound-lane bookings she has none of — three false flags on a day
      // she filed honestly. Her old numbers stand; we just don't check them.
      const offMark = offDays.byKey.get(offKey(rosterId, key));
      const legacyShape = !!entry && role === "confirmation" && !entry.formShape;
      const flags = filed && !legacyShape ? crossCheckDay(filed, measured, tolerances) : [];
      const status = dayStatusOf({
        hasEntry: entry !== null,
        active,
        beforeJoin: key < firstDueKey,
        dayIsOver: key <= yesterdayKey,
        measurable: linked,
        readable: !unreadDays.has(key),
        linkAlive,
        // Only people whose evidence comes down the dial pipe are affected by
        // that pipe going quiet; a confirmation setter is measured off the
        // calendar and the booking records instead.
        teamBlind: heartbeatUsable && activity !== null && (lastLiveDay === null || key > lastLiveDay),
        worked: didWork(measured, dayActivity),
        markedOff: !!offMark,
      });
      const ladder = dayRole === "booking" && dayActivity?.answeredAt ? { thresholds: ladderThresholds, counts: dayActivity.answeredAt } : null;
      days.push({
        dayKey: key,
        due: countsAsDue(status),
        status,
        off: status === "off" ? offViewOf(offMark) : null,
        offContradicted: status === "off" && didWork(measured, dayActivity),
        offEvidence:
          status === "off" && didWork(measured, dayActivity)
            ? [
                dayActivity && dayActivity.dials > 0 ? `${dayActivity.dials} dials` : null,
                (measured.sets ?? 0) > 0 ? `${measured.sets} sets` : null,
                (measured.contacted ?? 0) > 0 ? `${measured.contacted} contacted` : null,
              ].filter(Boolean).join(", ") || "activity"
            : null,
        filed,
        measured,
        flags,
        ladder,
      });
    }
    const filedDays = days.filter((d) => d.filed !== null);
    if (filedDays.length === 0 && !active) continue; // gone, and nothing to check
    byRoster.push({
      rosterId,
      name: g.row.name,
      role,
      linked,
      active,
      daysDue: days.filter((d) => d.due).length,
      daysFiled: filedDays.length,
      daysNoActivity: days.filter((d) => d.status === "no-activity").length,
      daysUnmeasured: days.filter((d) => d.status === "unmeasured").length,
      daysOff: days.filter((d) => d.status === "off").length,
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
