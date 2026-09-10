// ============================================================================
// A booking (outbound) setter's day, measured — the prefill for their EOD
// form, so the calendar and Close fill the boxes and they correct rather
// than count. Same two one-day cohorts as the confirmation setter's query:
// bookings MADE on D (their sets) and bookings STARTING on D (their calls on
// the calendar, and which showed). Dials and pick-ups come from their own
// Close activity for the local day. Their typed number wins once filed.
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
import { dialAnswered } from "./lib/dialAnswered";

const MEASURE_LOOKBACK_DAYS = 30;
const COHORT_TAKE = 1_500;
const EVENTS_TAKE = 3_000;

export interface BookingMeasured {
  sets: number;
  callsOnCalendar: number;
  callsShown: number;
  /** Null until their Close user is linked to the roster row. */
  dials: number | null;
  pickUps: number | null;
}

function mine(r: BookingRecord, rosterId: string): boolean {
  return !r.isFollowUp && r.classification.lane === "outbound" && r.classification.creditRosterIds.includes(rosterId);
}

export function measureBookingDay(records: BookingRecord[], rosterId: string, dayKey: string): Omit<BookingMeasured, "dials" | "pickUps"> {
  const setsToday = records.filter((r) => mine(r, rosterId) && r.bookedDayKey === dayKey);
  const callsToday = records.filter((r) => mine(r, rosterId) && r.dayKey === dayKey);
  return {
    sets: setsToday.length,
    callsOnCalendar: callsToday.length,
    callsShown: callsToday.filter((r) => r.verdict.result === "showed").length,
  };
}

export const getMeasuredForDay = query({
  args: { sessionToken: v.string(), dayKey: v.string() },
  handler: async (ctx, args) => {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me || me.role === "confirmation") return null;
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
    const bookings = measureBookingDay(data.records, String(me.rosterId), args.dayKey);

    // Their own Close activity for the local day: every dial, and the ones a
    // person picked up — what their EOD calls pick ups.
    let dials: number | null = null;
    let pickUps: number | null = null;
    if (me.crmUserId) {
      const rows = await ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_setter_and_time", (q) =>
          q.eq("teamId", teamId).eq("ghlUserId", me.crmUserId as string).gte("occurredAt", dayStart).lt("occurredAt", dayEnd),
        )
        .order("desc")
        .take(EVENTS_TAKE);
      if (rows.length >= EVENTS_TAKE) truncated.push("dials");
      dials = 0;
      pickUps = 0;
      for (const e of rows) {
        if (e.eventType !== "dial_outbound") continue;
        dials += 1;
        if (dialAnswered(e.details)) pickUps += 1;
      }
    }
    const measured: BookingMeasured = { ...bookings, dials, pickUps };
    return {
      dayKey: args.dayKey,
      measured,
      /** Something to prefill: any credited booking in the cohorts, or any own activity that day. */
      measuredExists: data.records.some((r) => mine(r, String(me.rosterId))) || (dials ?? 0) > 0,
      truncated: [...truncated, ...data.truncated],
      linked: !!me.crmUserId,
    };
  },
});
