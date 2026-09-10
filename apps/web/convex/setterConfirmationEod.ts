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
import type { Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { addDaysKey } from "./dataHealthCore";
import { resolveSetterSessionCtx } from "./setterAuth";
import { getLocalDateRangeUtc } from "./setterDataNotifications";
import { DAY_COHORT_TAKE, isHers, loadCohortRecords, measureConfirmationDay, type ConfirmationMeasured } from "./setterEodMeasured";
import { teamHasSetterTeams } from "./setterTeamQueries";

/** Days back a day can still be measured — the filing window with room to spare. */
const MEASURE_LOOKBACK_DAYS = 30;

export type { ConfirmationMeasured };

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
    const data = await loadCohortRecords(ctx, teamId, dayStart, dayEnd, nowMs, DAY_COHORT_TAKE);
    const linked = !!me.crmUserId;
    return {
      dayKey: args.dayKey,
      measured: measureConfirmationDay(data.records, String(me.rosterId), args.dayKey, linked),
      measuredExists: data.records.some(isHers),
      truncated: data.truncated,
      linked,
    };
  },
});
