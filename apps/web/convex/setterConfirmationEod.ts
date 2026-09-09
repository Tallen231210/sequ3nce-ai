// ============================================================================
// The confirmation setter's day, measured: what the calendar and Close say
// happened, so her EOD form opens filled in and she corrects rather than
// counts. Her own numbers win once she submits; this is the prefill and the
// drift check beside it.
//
// One team-local day D, read as two small cohorts rather than a month of
// calendar: the copies BOOKED on D (her workload — contacted / reached from
// Close activity after the booking, however far out the call sits) and the
// copies STARTING on D that she had contacted (the shows she is measured
// on). Both go through the same collector as the Setter Data lanes, so the
// form, the lanes and the weekly post never disagree about a booking.
// ============================================================================

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { addDaysKey } from "./dataHealthCore";
import { resolveSetterSessionCtx } from "./setterAuth";
import { getLocalDateRangeUtc } from "./setterDataNotifications";
import { collectTeamBookings, type BookingRecord } from "./setterTeamBookings";
import { teamHasSetterTeams } from "./setterTeamQueries";

/** Days back a day can still be measured — the filing window with room to spare. */
const MEASURE_LOOKBACK_DAYS = 30;
/** Calendar rows read per cohort; a team booking more than this in one day is beyond one form. */
const COHORT_TAKE = 1_500;

export interface ConfirmationMeasured {
  newSelfBooked: number;
  /** Null until her Close user is linked to the roster row — there is nothing to measure from. */
  contacted: number | null;
  reached: number | null;
  confirmedOnCalendar: number | null;
  confirmedShowed: number | null;
}

function herTouches(r: BookingRecord, rosterId: string) {
  return r.touches.filter((t) => t.rosterId === rosterId && t.afterBooking);
}

/** Her cohort: funnel self-books that no outbound or DM setter owns. */
export function isHers(r: BookingRecord): boolean {
  const lane = r.classification.lane;
  return r.classification.isFunnel && lane !== "outbound" && lane !== "dm" && !r.isFollowUp;
}

function contactedBy(r: BookingRecord, rosterId: string): boolean {
  return (
    herTouches(r, rosterId).length > 0 ||
    (r.classification.attributedBy === "tag" && r.classification.creditRosterIds.includes(rosterId))
  );
}

export function measureConfirmationDay(
  records: BookingRecord[],
  rosterId: string,
  dayKey: string,
  linked: boolean,
): ConfirmationMeasured {
  const mine = records.filter(isHers);
  const bookedToday = mine.filter((r) => r.bookedDayKey === dayKey);
  if (!linked) {
    return { newSelfBooked: bookedToday.length, contacted: null, reached: null, confirmedOnCalendar: null, confirmedShowed: null };
  }
  const scheduledToday = mine.filter((r) => r.dayKey === dayKey && contactedBy(r, rosterId));
  return {
    newSelfBooked: bookedToday.length,
    contacted: bookedToday.filter((r) => contactedBy(r, rosterId)).length,
    reached: bookedToday.filter((r) => herTouches(r, rosterId).some((t) => t.reached)).length,
    confirmedOnCalendar: scheduledToday.length,
    confirmedShowed: scheduledToday.filter((r) => r.verdict.result === "showed").length,
  };
}

/**
 * The measured numbers for one of the confirmation setter's days. Null for
 * anyone else, for a team without the setter_teams flag, or for a day she
 * could not file for.
 */
export const getMeasuredForDay = query({
  args: { sessionToken: v.string(), dayKey: v.string() },
  handler: async (ctx, args) => {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me || me.role !== "confirmation") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.dayKey)) return null;
    const teamId = me.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    if (!teamHasSetterTeams(team)) return null;
    const tz = (team as { timezone?: string } | null)?.timezone || DEFAULT_TIMEZONE;
    const nowMs = Date.now();
    const todayKey = dayKeyInTz(nowMs, tz);
    if (args.dayKey > todayKey || args.dayKey < addDaysKey(todayKey, -MEASURE_LOOKBACK_DAYS)) return null;

    const { startMs: dayStart, endMs: dayEnd } = getLocalDateRangeUtc(args.dayKey, tz);
    const [booked, starting] = await Promise.all([
      ctx.db
        .query("calendarEvents")
        .withIndex("by_team_and_booked_at", (q) => q.eq("teamId", teamId).gte("bookedAt", dayStart).lt("bookedAt", dayEnd))
        .take(COHORT_TAKE),
      ctx.db
        .query("calendarEvents")
        .withIndex("by_team_and_time", (q) => q.eq("teamId", teamId).gte("startTime", dayStart).lt("startTime", dayEnd))
        .take(COHORT_TAKE),
    ]);
    const truncated: string[] = [];
    if (booked.length >= COHORT_TAKE || starting.length >= COHORT_TAKE) truncated.push("cohort");
    const byId = new Map<string, Doc<"calendarEvents">>();
    for (const e of [...booked, ...starting]) byId.set(String(e._id), e);
    const eventRows = Array.from(byId.values());
    const rangeStart = Math.min(dayStart, ...eventRows.map((e) => e.startTime));
    const rangeEnd = Math.max(dayEnd, ...eventRows.map((e) => e.startTime + 1));
    const data = await collectTeamBookings(ctx, teamId, rangeStart, rangeEnd, nowMs, { eventRows });
    const linked = !!me.crmUserId;
    return {
      dayKey: args.dayKey,
      measured: measureConfirmationDay(data.records, String(me.rosterId), args.dayKey, linked),
      measuredExists: data.records.some(isHers),
      truncated: [...truncated, ...data.truncated],
      linked,
    };
  },
});
