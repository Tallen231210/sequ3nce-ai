// ============================================================================
// Which bookings has each closer recolored after the call?
//
// The read side of the color rulebook (lib/calendarColorRules.ts). Walks a
// team's calendar events for a window, keeps the sales bookings on each
// closer's OWN calendar, and returns one verdict per booking. Shared by the
// manager check-ins card and the daily scorecard post so they never disagree.
//
// Reads: calendarEvents + calls for the window, the roster, the subscriptions.
// No per-event lookups, no history-table reads — the verdict comes from the
// two timestamps the sync stamps on the event itself.
// ============================================================================

import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { groupBookingCopies, isSalesBooking } from "./calendarBookings";
import { isOwnCapacityCalendar } from "./closerPerformanceAttribution";
import { isExcludedBookingTitle } from "./lib/bookingExclusions";
import {
  recolorState,
  recolorStateLabel,
  type RecolorState,
} from "./lib/calendarColorRules";

/** Team beta flag that turns the color rulebook features on. */
export const CALENDAR_COLOR_FLAG = "calendar_color_tracking";

export function teamHasColorTracking(team: Doc<"teams"> | null): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flags = ((team as any)?.betaFeatures ?? []) as string[];
  return flags.includes(CALENDAR_COLOR_FLAG);
}

export interface BookingRecolor {
  closerId: string;
  title: string;
  startTime: number;
  endTime: number;
  colorId?: string;
  state: RecolorState;
  /** The state in plain words, for tooltips and posts. */
  label: string;
}

/**
 * When a closer holds two own-calendar copies of one booking (primary plus a
 * second calendar of theirs), the booking takes the better verdict. Lower
 * is better.
 */
const STATE_RANK: Record<RecolorState, number> = {
  done: 0,
  unverified: 1,
  not_due: 2,
  pre_colored_untouched: 3,
  uncolored: 4,
  left_light_green: 5,
  other_color: 6,
};

/** Calls can be created a little after the booking's start; widen the read. */
const CALL_LOOKAHEAD_MS = 3 * 60 * 60 * 1000;

/**
 * One verdict per sales booking on a closer's own calendar with a start in
 * [startMs, endMs). A booking that appears on a teammate's subscribed
 * calendar is not that teammate's to recolor and is not reported for them.
 */
export async function collectRecolorStates(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  startMs: number,
  endMs: number,
  nowMs: number,
): Promise<BookingRecolor[]> {
  const [events, calls, closers, subs] = await Promise.all([
    ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q) =>
        q.eq("teamId", teamId).gte("startTime", startMs).lt("startTime", endMs),
      )
      .take(5000),
    ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q
          .eq("teamId", teamId)
          .gte("createdAt", startMs)
          .lt("createdAt", endMs + CALL_LOOKAHEAD_MS),
      )
      .take(5000),
    ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .take(500),
    ctx.db
      .query("closerCalendarSubscriptions")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .take(1000),
  ]);

  const emailByCloser = new Map(closers.map((c) => [String(c._id), c.email]));
  const ownSubIds = new Set<string>();
  for (const sub of subs) {
    if (sub.enabled === false) continue;
    if (isOwnCapacityCalendar(sub, emailByCloser.get(String(sub.closerId)))) {
      ownSubIds.add(String(sub._id));
    }
  }
  // Events with no subscription came through the closer's direct connection
  // and are theirs by definition (same rule as the Team Performance recount).
  const isOwnCopy = (ev: Doc<"calendarEvents">) =>
    !ev.subscriptionId || ownSubIds.has(String(ev.subscriptionId));

  const eventIdsWithCalls = new Set<string>();
  for (const c of calls) {
    if (c.calendarEventId) eventIdsWithCalls.add(String(c.calendarEventId));
  }

  const out: BookingRecolor[] = [];
  for (const [, copies] of groupBookingCopies(events)) {
    const recorded = copies.some((c) => eventIdsWithCalls.has(String(c._id)));
    if (!isSalesBooking(copies, { producedARecordedCall: recorded })) continue;
    if (isExcludedBookingTitle(copies[0]?.title)) continue;

    const ownByCloser = new Map<string, Doc<"calendarEvents">[]>();
    for (const c of copies) {
      if (!isOwnCopy(c)) continue;
      const key = String(c.closerId);
      const list = ownByCloser.get(key) ?? [];
      list.push(c);
      ownByCloser.set(key, list);
    }

    for (const [closerId, own] of ownByCloser) {
      let best: { state: RecolorState; ev: Doc<"calendarEvents"> } | null = null;
      for (const ev of own) {
        const state = recolorState(ev, nowMs);
        if (!best || STATE_RANK[state] < STATE_RANK[best.state]) {
          best = { state, ev };
        }
      }
      if (!best) continue;
      out.push({
        closerId,
        title: best.ev.title,
        startTime: best.ev.startTime,
        endTime: best.ev.endTime,
        colorId: best.ev.eventColorId,
        state: best.state,
        label: recolorStateLabel(best.state, best.ev.eventColorId),
      });
    }
  }
  out.sort((a, b) => a.startTime - b.startTime);
  return out;
}
