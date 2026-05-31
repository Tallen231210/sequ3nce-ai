// ============================================================================
// Dashboard Phase 4 — booking matcher (reverse direction).
//
// Given a team's date range, build the list of matched (setterLead,
// calendarEvent) bookings. Mirrors setterCloserBriefing but operates over
// the full range rather than a single event lookup. Deduped per
// (setterLeadId, week-of-year) so weekly recurring meetings don't inflate
// the booking count.
//
// Used by:
//   - computeBookings (the dashboard's bookings stats)
//   - detectBookingFlow (classifies setter-driven vs self-book by comparing
//     lead.firstDialAt to calendarEvent._creationTime)
//
// Reads are bounded: calendarEvents date-range scan (~1KB rows, 10K cap
// per query) + by_team setterLeads collect (~2.3MB on AICom). Future
// scaling: if a larger customer outgrows the by_team collect, add the
// email index documented in setter-data-wider-range-showrate.
// ============================================================================

import type { Doc, Id } from "./_generated/dataModel";
import { normalizeEmail } from "./setterCloserMatcher";

export interface MatchedBooking {
  setterLeadId: Id<"setterLeads">;
  ghlContactId: string;
  setterLeadEmail: string;
  leadDateAdded: number;
  leadFirstDialAt: number | undefined;
  leadAssignedToGhlUserId: string | undefined;
  calendarEventId: Id<"calendarEvents">;
  calendarEventCreationTime: number;
  startTime: number;
  weekKey: string;
}

export interface BookingMatcherIndex {
  bookings: MatchedBooking[];
  sourceCalendarEventsCount: number;
  externalAttendeeEventCount: number;
  rangeClampedToDays?: number;
}

const MAX_BOOKING_RANGE_MS = 60 * 24 * 60 * 60_000;
const CALENDAR_EVENT_TAKE = 10_000;

export async function buildBookingMatcherIndex(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  teamId: Id<"teams">,
  rangeStart: number,
  rangeEnd: number,
): Promise<BookingMatcherIndex> {
  const effectiveStart = Math.max(rangeStart, rangeEnd - MAX_BOOKING_RANGE_MS);
  const rangeClampedToDays = effectiveStart > rangeStart ? 60 : undefined;

  const calendarEvents = (await ctx.db
    .query("calendarEvents")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_time", (q: any) =>
      q
        .eq("teamId", teamId)
        .gte("startTime", effectiveStart)
        .lt("startTime", rangeEnd),
    )
    .take(CALENDAR_EVENT_TAKE)) as Doc<"calendarEvents">[];

  // Filter to events with at least one non-organizer attendee — internal
  // team meetings (no external prospect) are not bookings.
  const eventsWithProspects = calendarEvents.filter((e) => {
    if (!e.attendees || e.attendees.length === 0) return false;
    return e.attendees.some((a) => a.isOrganizer !== true);
  });

  // Build email → lead lookup. by_team collect is the only available scan;
  // setterLeads doesn't have an email index yet (see
  // setter-data-wider-range-showrate memo for deferred follow-up).
  const leads = (await ctx.db
    .query("setterLeads")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
    .collect()) as Doc<"setterLeads">[];
  const leadsByNormEmail = new Map<string, Doc<"setterLeads">>();
  for (const lead of leads) {
    const norm = normalizeEmail(lead.email);
    if (norm) leadsByNormEmail.set(norm, lead);
  }

  // Match + dedup per (lead, week). Keep the earliest booking per week —
  // represents the FIRST time the prospect booked that week.
  const bookingsByLeadWeek = new Map<string, MatchedBooking>();
  for (const event of eventsWithProspects) {
    const guest = event.attendees!.find((a) => a.isOrganizer !== true);
    const normEmail = normalizeEmail(guest?.email);
    if (!normEmail) continue;
    const lead = leadsByNormEmail.get(normEmail);
    if (!lead || !lead.email) continue;

    const weekKey = weekKeyForTimestamp(event._creationTime);
    const dedupKey = `${String(lead._id)}:${weekKey}`;
    const existing = bookingsByLeadWeek.get(dedupKey);
    if (
      existing &&
      existing.calendarEventCreationTime <= event._creationTime
    ) {
      continue;
    }
    bookingsByLeadWeek.set(dedupKey, {
      setterLeadId: lead._id,
      ghlContactId: lead.ghlContactId,
      setterLeadEmail: lead.email,
      leadDateAdded: lead.dateAdded,
      leadFirstDialAt: lead.firstDialAt,
      leadAssignedToGhlUserId: lead.assignedToGhlUserId,
      calendarEventId: event._id,
      calendarEventCreationTime: event._creationTime,
      startTime: event.startTime,
      weekKey,
    });
  }

  return {
    bookings: Array.from(bookingsByLeadWeek.values()),
    sourceCalendarEventsCount: calendarEvents.length,
    externalAttendeeEventCount: eventsWithProspects.length,
    rangeClampedToDays,
  };
}

// Simple year-week key. Used only for in-team dedup, so collision across
// year boundaries is fine for our purposes.
export function weekKeyForTimestamp(ts: number): string {
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const days = Math.floor((ts - startOfYear) / (24 * 60 * 60_000));
  const week = Math.floor(days / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}
