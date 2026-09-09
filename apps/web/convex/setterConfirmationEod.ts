// ============================================================================
// The confirmation setter's day, measured: what the calendar and Close say
// happened, so her EOD form opens filled in and she corrects rather than
// counts. Her own numbers win once she submits; this is the prefill and the
// drift check beside it.
//
// One team-local day D. Self-booked funnel calls BOOKED on D are her
// workload (contacted / reached from Close activity after the booking);
// self-booked calls SCHEDULED on D that she had contacted are the ones whose
// shows she is measured on. Reads the same one-pass collector as the Setter
// Data lanes, over the 30 days that follow D — a self-book made on D can be
// scheduled up to a few weeks out.
// ============================================================================

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE } from "./closerPerformance";
import { resolveSetterSessionCtx } from "./setterAuth";
import { getLocalDateRangeUtc } from "./setterDataNotifications";
import { collectTeamBookings, type BookingRecord } from "./setterTeamBookings";
import { teamHasSetterTeams } from "./setterTeamQueries";

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far ahead a self-book made today can be scheduled and still be hers. */
const LOOKAHEAD_MS = 30 * DAY_MS;

export interface ConfirmationMeasured {
  newSelfBooked: number;
  contacted: number;
  reached: number;
  confirmedOnCalendar: number;
  confirmedShowed: number;
  /** Proxies: same guest rebooked at another time / a cancelled copy exists. */
  rescheduled: number;
  cancelled: number;
}

function herTouches(r: BookingRecord, rosterId: string) {
  return r.touches.filter((t) => t.rosterId === rosterId && t.afterBooking);
}

/** Her cohort: funnel self-books that no outbound or DM setter owns. */
function isHers(r: BookingRecord): boolean {
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
  cancelledGuests: string[],
  rosterId: string,
  dayKey: string,
): ConfirmationMeasured {
  const mine = records.filter(isHers);
  const bookedToday = mine.filter((r) => r.bookedDayKey === dayKey);
  const scheduledToday = mine.filter((r) => r.dayKey === dayKey && contactedBy(r, rosterId));
  const cancelled = new Set(cancelledGuests);
  const startsByGuest = new Map<string, Set<number>>();
  for (const r of mine) {
    if (!r.guestEmailNorm) continue;
    const set = startsByGuest.get(r.guestEmailNorm) ?? new Set<number>();
    set.add(r.startTime);
    startsByGuest.set(r.guestEmailNorm, set);
  }
  return {
    newSelfBooked: bookedToday.length,
    contacted: bookedToday.filter((r) => contactedBy(r, rosterId)).length,
    reached: bookedToday.filter((r) => herTouches(r, rosterId).some((t) => t.reached)).length,
    confirmedOnCalendar: scheduledToday.length,
    confirmedShowed: scheduledToday.filter((r) => r.verdict.result === "showed").length,
    rescheduled: bookedToday.filter((r) => r.guestEmailNorm && (startsByGuest.get(r.guestEmailNorm)?.size ?? 0) > 1).length,
    cancelled: bookedToday.filter((r) => r.guestEmailNorm && cancelled.has(r.guestEmailNorm)).length,
  };
}

/**
 * The measured numbers for one of the confirmation setter's days. Null for
 * anyone else, or for a team without the setter_teams flag.
 */
export const getMeasuredForDay = query({
  args: { sessionToken: v.string(), dayKey: v.string() },
  handler: async (ctx, args) => {
    const me = await resolveSetterSessionCtx(ctx, args.sessionToken);
    if (!me || me.role !== "confirmation") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.dayKey)) return null;
    const team = await ctx.db.get(me.teamId as Id<"teams">);
    if (!teamHasSetterTeams(team)) return null;
    const tz = (team as { timezone?: string } | null)?.timezone || DEFAULT_TIMEZONE;
    const { startMs } = getLocalDateRangeUtc(args.dayKey, tz);
    const nowMs = Date.now();
    const data = await collectTeamBookings(ctx, me.teamId as Id<"teams">, startMs, startMs + LOOKAHEAD_MS, nowMs);
    const measured = measureConfirmationDay(data.records, data.cancelledGuests, String(me.rosterId), args.dayKey);
    const cohortSeen = data.records.some(isHers);
    return {
      dayKey: args.dayKey,
      measured,
      measuredExists: cohortSeen,
      truncated: data.truncated,
      linked: !!me.crmUserId,
    };
  },
});
