import type { Doc } from "./_generated/dataModel";

// ============================================================================
// Reading a calendar: what an event MEANS.
//
// Split out of closerPerformance.ts, which owns the rollup itself. Everything
// here answers an interpretation question — is this a sales call or a block,
// is this calendar the rep's own, which rep does this booking belong to — and
// every function is pure, so it can be reasoned about and tested without a
// database or a Convex context.
// ============================================================================

export type CalendarEvent = Doc<"calendarEvents">;


/**
 * Is this calendar event a sales call, or the closer blocking time out?
 *
 * This is what makes Slots real: closers create availability by blocking
 * their calendars, so we must tell "Gym"/"OOO" (capacity removed) from an
 * actual booked call (capacity consumed by a prospect).
 *
 *   1. The event produced a real recorded call  -> sales call.
 *      Works on EVERY calendar provider, because it's our own data.
 *   2. The event has an external attendee       -> sales call.
 *      Google-only: the ICS/Microsoft sync path never populates attendees.
 *   3. Otherwise                                -> personal block.
 */
export function classifyEvent(
  event: CalendarEvent,
  eventIdsWithCalls: Set<string>,
): "call" | "block" {
  if (eventIdsWithCalls.has(String(event._id))) return "call";
  const external = (event.attendees ?? []).some(
    (a) => a.isOrganizer !== true && !!a.email,
  );
  return external ? "call" : "block";
}

export type Interval = [start: number, end: number];

/**
 * Total time covered by these intervals, counting overlaps once.
 *
 * Summing durations instead would double-count: a real closer's calendar
 * carries overlapping blocks routinely (a 3-hour "Unavailable" sitting inside
 * an all-day "OOO"), and one live team summed to 36 hours of blocked time in
 * a 24-hour day.
 */
export function unionMs(intervals: Interval[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals]
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  if (sorted.length === 0) return 0;

  let total = 0;
  let [curStart, curEnd] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s > curEnd) {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    } else if (e > curEnd) {
      curEnd = e;
    }
  }
  return total + (curEnd - curStart);
}

/**
 * Below this much declared-unavailable time in a day, we can't treat the
 * calendar as a statement of availability. A rep who blocks nothing would
 * otherwise appear to offer ~24 hours of capacity, making Booked% a fiction.
 * The board reports capacity as unmeasured instead — see computeCapacitySignal.
 */
export const MIN_BLOCKED_MS_FOR_CAPACITY = 8 * 60 * 60 * 1000;
function localPart(address: string): string {
  return address.trim().toLowerCase().split("@")[0] ?? "";
}

/**
 * Does this subscribed calendar represent the subscriber's OWN availability?
 *
 * Teams routinely subscribe to each other's calendars, so a closer's feed
 * carries far more than their own diary — on one live team a single closer's
 * feed held 1,869 events in a month, most of them teammates'. Counting all of
 * it as "time blocked" consumed their entire working window and collapsed
 * their capacity to zero.
 *
 * `accessRole` cannot decide this: on a shared Google Workspace every
 * subscription reports "owner". The address can: it is either "primary" or
 * the calendar owner's email.
 *
 * An explicit `countsTowardCapacity` set by a manager always wins — inference
 * is a default, not a verdict.
 */
export function isOwnCapacityCalendar(
  sub: { googleCalendarId: string; countsTowardCapacity?: boolean },
  closerEmail: string | undefined,
): boolean {
  if (typeof sub.countsTowardCapacity === "boolean") {
    return sub.countsTowardCapacity;
  }
  const cal = sub.googleCalendarId.trim().toLowerCase();
  if (cal === "primary") return true;
  if (!closerEmail) return false;
  const mine = localPart(closerEmail);
  if (!mine) return false;
  const theirs = localPart(cal);
  // Reps commonly run a second calendar ("nick@" plus "nick2@"), so match the
  // local part with an optional numeric suffix rather than requiring equality.
  return theirs === mine || new RegExp(`^${escapeRe(mine)}\\d+$`).test(theirs);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Booking-title convention used by Calendly, GHL and Zoom scheduler:
 * "Prospect Name and Rep Name", sometimes prefixed with a status word.
 * Returns the rep half, or null when the title doesn't follow the pattern.
 */
export function repNameFromTitle(title: string | undefined): string | null {
  if (!title) return null;
  const cleaned = title
    .replace(/^\s*(canceled|cancelled|rescheduled|second call|follow[- ]?up)\s*:\s*/i, "")
    .trim();
  const m = cleaned.match(/\band\s+(.{2,60})$/i);
  if (!m) return null;
  // Drop trailing qualifiers ("Nick Rowe second call") so the name matches.
  return m[1]
    .replace(/\s+(second call|follow[- ]?up|call|meeting|discovery)\s*$/i, "")
    .trim() || null;
}

function nameMatchesCloser(repName: string, closerName: string): boolean {
  const rep = repName.toLowerCase();
  const full = closerName.trim().toLowerCase();
  if (full.length > 2 && (rep === full || rep.includes(full) || full.includes(rep))) {
    return true;
  }
  // Closers are often stored by first name only ("Nick" vs "Nick Rowe").
  const first = full.split(/\s+/)[0] ?? "";
  return first.length > 2 && rep.split(/\s+/)[0] === first;
}

export interface BookingAttribution {
  /** The closer who owns this booking, or null if we can't say. */
  closerId: string | null;
  /** Rep named in the title who isn't a Sequ3nce closer — surfaced to the
   *  manager rather than silently folded into an anonymous bucket. */
  unknownRep: string | null;
}

/**
 * Pick which closer owns a booking when the same meeting appears on several
 * calendars. Teams commonly subscribe to each other's calendars, so the
 * `closerId` on any single copy is not authoritative — verified on a live
 * team where 389 of 390 unique meetings appeared on multiple calendars.
 *
 * Priority:
 *  1. an actual recorded call — provider-agnostic and unambiguous;
 *  2. the rep named in the title. This outranks calendar ownership because
 *     the title states who is ON the call while the calendar only says whose
 *     subscription it synced through. A live team runs a fourth rep who
 *     isn't a Sequ3nce user; when their booking lands on a single teammate's
 *     calendar, trusting ownership credited the wrong person;
 *  3. only then, a single unambiguous copy.
 *
 * A title naming a non-closer STOPS attribution — we'd rather report "210
 * bookings belong to Callum B, who isn't on Sequ3nce" than credit them to
 * whoever happened to subscribe. Inventing an owner quietly corrupts every
 * per-rep rate on the leaderboard.
 */
export function attributeBooking(
  copies: CalendarEvent[],
  closerIdFromCall: string | null,
  closerNames: Array<{ id: string; name: string }>,
): BookingAttribution {
  if (closerIdFromCall) return { closerId: closerIdFromCall, unknownRep: null };

  const repName = repNameFromTitle(copies[0]?.title);
  if (repName) {
    const hits = closerNames.filter((c) => nameMatchesCloser(repName, c.name));
    if (hits.length === 1) return { closerId: hits[0].id, unknownRep: null };
    // Named a rep we don't recognise: attributable to a person, just not to
    // anyone with a seat. Report who, so the manager can act on it.
    if (hits.length === 0) return { closerId: null, unknownRep: repName };
    // Ambiguous name (two closers match) — fall through to calendar evidence.
  }

  const distinct = Array.from(new Set(copies.map((c) => String(c.closerId))));
  if (distinct.length === 1) return { closerId: distinct[0], unknownRep: null };

  return { closerId: null, unknownRep: null };
}

/**
 * Recompute one team-local day for every closer on the team, writing
 * absolute values. Idempotent — safe to re-run at any time.
 */
