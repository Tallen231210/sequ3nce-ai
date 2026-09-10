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
import type { Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { addDaysKey } from "./dataHealthCore";
import { resolveSetterSessionCtx } from "./setterAuth";
import { getLocalDateRangeUtc } from "./setterDataNotifications";
import { DAY_COHORT_TAKE, isTheirBooking, loadCohortRecords, measureBookingDay, type BookingMeasured } from "./setterEodMeasured";
import { teamHasSetterTeams } from "./setterTeamQueries";
import { DEFAULT_CONNECT_SEC, dialConnected } from "./lib/dialAnswered";

const MEASURE_LOOKBACK_DAYS = 30;
const EVENTS_TAKE = 3_000;

export type { BookingMeasured };

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
    const data = await loadCohortRecords(ctx, teamId, dayStart, dayEnd, nowMs, DAY_COHORT_TAKE);
    const truncated: string[] = [];
    const bookings = measureBookingDay(data.records, String(me.rosterId), args.dayKey);

    // Their own Close activity for the local day: every dial, and the ones a
    // person picked up — what their EOD calls pick ups.
    let dials: number | null = null;
    let pickUps: number | null = null;
    const connectSec = team?.setterConnectionThresholdSec ?? DEFAULT_CONNECT_SEC;
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
        if (dialConnected(e.details, connectSec)) pickUps += 1;
      }
    }
    const measured: BookingMeasured = { ...bookings, dials, pickUps };
    return {
      dayKey: args.dayKey,
      measured,
      /** Something to prefill: any credited booking in the cohorts, or any own activity that day. */
      measuredExists: data.records.some((r) => isTheirBooking(r, String(me.rosterId))) || (dials ?? 0) > 0,
      truncated: [...truncated, ...data.truncated],
      linked: !!me.crmUserId,
      connectSec,
    };
  },
});
