// ============================================================================
// One setter's day, measured — shared by the EOD prefills (a setter's own
// form), the Setters page cross-check and the posts. Cohorts are read the
// same way everywhere: the calendar copies BOOKED in a window and the copies
// STARTING in it, through the lanes collector, so no two readers can
// disagree about a booking. Pure measuring functions sit below the loader.
// ============================================================================

import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { collectTeamBookings, type BookingRecord } from "./setterTeamBookings";
import type { RosterRef } from "./lib/setterTeamAttribution";
import type { MeasuredDay } from "./lib/eodCrossCheck";

/** Calendar rows read per cohort for one day; a team booking more than this in a day is beyond one form. */
export const DAY_COHORT_TAKE = 1_500;
/** Per cohort over a range (the page's 14-day cross-check). */
export const RANGE_COHORT_TAKE = 6_000;

export interface CohortRecords {
  records: BookingRecord[];
  rosters: RosterRef[];
  truncated: string[];
}

/**
 * Bookings made in [fromMs, toMs) plus bookings starting in it, collected
 * once (verdicts and money included). The collector's range is widened to
 * cover every event's start so nothing in either cohort is dropped.
 */
export async function loadCohortRecords(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  fromMs: number,
  toMs: number,
  nowMs: number,
  take: number,
): Promise<CohortRecords> {
  const [booked, starting] = await Promise.all([
    ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_booked_at", (q) => q.eq("teamId", teamId).gte("bookedAt", fromMs).lt("bookedAt", toMs))
      .take(take),
    ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q) => q.eq("teamId", teamId).gte("startTime", fromMs).lt("startTime", toMs))
      .take(take),
  ]);
  const truncated: string[] = [];
  if (booked.length >= take || starting.length >= take) truncated.push("cohort");
  const byId = new Map<string, Doc<"calendarEvents">>();
  for (const e of [...booked, ...starting]) byId.set(String(e._id), e);
  const eventRows = Array.from(byId.values());
  const rangeStart = Math.min(fromMs, ...eventRows.map((e) => e.startTime));
  const rangeEnd = Math.max(toMs, ...eventRows.map((e) => e.startTime + 1));
  const data = await collectTeamBookings(ctx, teamId, rangeStart, rangeEnd, nowMs, { eventRows });
  return { records: data.records, rosters: data.rosters, truncated: [...truncated, ...data.truncated] };
}

// ----------------------------------------------------------------------------
// A booking (outbound) setter's day.
// ----------------------------------------------------------------------------

export interface BookingMeasured {
  sets: number;
  callsOnCalendar: number;
  callsShown: number;
  /** Credited calls that day with no show verdict yet. */
  callsUnknown: number;
  /** Null until their Close user is linked to the roster row. */
  dials: number | null;
  pickUps: number | null;
}

export function isTheirBooking(r: BookingRecord, rosterId: string): boolean {
  return !r.isFollowUp && r.classification.lane === "outbound" && r.classification.creditRosterIds.includes(rosterId);
}

export function measureBookingDay(records: BookingRecord[], rosterId: string, dayKey: string): Omit<BookingMeasured, "dials" | "pickUps"> {
  const setsToday = records.filter((r) => isTheirBooking(r, rosterId) && r.bookedDayKey === dayKey);
  const callsToday = records.filter((r) => isTheirBooking(r, rosterId) && r.dayKey === dayKey);
  return {
    sets: setsToday.length,
    callsOnCalendar: callsToday.length,
    callsShown: callsToday.filter((r) => r.verdict.result === "showed").length,
    callsUnknown: callsToday.filter((r) => r.verdict.result === "unknown").length,
  };
}

// ----------------------------------------------------------------------------
// The confirmation setter's day.
// ----------------------------------------------------------------------------

export interface ConfirmationMeasured {
  newSelfBooked: number;
  /** Null until her Close user is linked to the roster row — there is nothing to measure from. */
  contacted: number | null;
  reached: number | null;
  confirmedOnCalendar: number | null;
  confirmedShowed: number | null;
  confirmedUnknown: number | null;
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

export function measureConfirmationDay(records: BookingRecord[], rosterId: string, dayKey: string, linked: boolean): ConfirmationMeasured {
  const mine = records.filter(isHers);
  const bookedToday = mine.filter((r) => r.bookedDayKey === dayKey);
  if (!linked) {
    return { newSelfBooked: bookedToday.length, contacted: null, reached: null, confirmedOnCalendar: null, confirmedShowed: null, confirmedUnknown: null };
  }
  const scheduledToday = mine.filter((r) => r.dayKey === dayKey && contactedBy(r, rosterId));
  return {
    newSelfBooked: bookedToday.length,
    contacted: bookedToday.filter((r) => contactedBy(r, rosterId)).length,
    reached: bookedToday.filter((r) => herTouches(r, rosterId).some((t) => t.reached)).length,
    confirmedOnCalendar: scheduledToday.length,
    confirmedShowed: scheduledToday.filter((r) => r.verdict.result === "showed").length,
    confirmedUnknown: scheduledToday.filter((r) => r.verdict.result === "unknown").length,
  };
}

// ----------------------------------------------------------------------------
// The cross-check shape: every field, null where that role can't be measured.
// ----------------------------------------------------------------------------

export interface DayActivity {
  dials: number;
  answered: number;
}

export function measuredDayFor(
  records: BookingRecord[],
  roster: { rosterId: string; role: "booking" | "confirmation"; linked: boolean },
  dayKey: string,
  activity: DayActivity | null,
): MeasuredDay {
  const none: MeasuredDay = {
    dials: null, pickUps: null, sets: null, callsOnCalendar: null, callsShown: null, callsUnknown: null,
    newSelfBooked: null, contacted: null, reached: null, confirmedOnCalendar: null, confirmedShowed: null, confirmedUnknown: null,
  };
  if (roster.role === "confirmation") {
    return { ...none, ...measureConfirmationDay(records, roster.rosterId, dayKey, roster.linked) };
  }
  const b = measureBookingDay(records, roster.rosterId, dayKey);
  return {
    ...none,
    ...b,
    dials: roster.linked && activity ? activity.dials : null,
    pickUps: roster.linked && activity ? activity.answered : null,
  };
}
