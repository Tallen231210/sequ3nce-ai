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

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
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

  // Email → lead lookup via the by_team_and_email_norm index: one point
  // read per UNIQUE guest email on the in-range events, instead of the
  // 20k-lead scan this used to do. That scan alone blew the 32k-doc budget
  // on the first genuinely large org (E2: ~200 leads/day) — this was the
  // "durable fix" the old comment promised.
  //
  // emailNorm is stamped at ingest and backfilled per team; a lead from
  // before the backfill reaches it simply doesn't match, exactly as a lead
  // outside the old 20k window didn't.
  const uniqueGuestEmails = new Set<string>();
  for (const e of eventsWithProspects) {
    const guest = e.attendees!.find((a) => a.isOrganizer !== true);
    const norm = normalizeEmail(guest?.email);
    if (norm) uniqueGuestEmails.add(norm);
    if (uniqueGuestEmails.size >= 5_000) break; // budget guard, logged below
  }
  if (uniqueGuestEmails.size >= 5_000) {
    console.warn(
      `[bookingMatcher] >5k unique guest emails in range for team ${teamId} — matching capped`,
    );
  }
  const leadsByNormEmail = new Map<string, Doc<"setterLeads">>();
  for (const norm of uniqueGuestEmails) {
    const lead = (await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_email_norm", (q: any) =>
        q.eq("teamId", teamId).eq("emailNorm", norm),
      )
      .first()) as Doc<"setterLeads"> | null;
    if (lead) leadsByNormEmail.set(norm, lead);
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

/**
 * Backfill `emailNorm` for one team's leads, in pages.
 *
 * Self-schedules until done — kicked ONCE per team, never twice (concurrent
 * chains OCC-thrash each other to death; see the Convex notes). New writes
 * stamp emailNorm at ingest, so this only has to catch history.
 */
export const backfillEmailNorm = internalMutation({
  args: { teamId: v.id("teams"), cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<void> => {
    const page = await ctx.db
      .query("setterLeads")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .paginate({ cursor: args.cursor ?? null, numItems: 300 });

    let stamped = 0;
    for (const lead of page.page) {
      if (lead.email && lead.emailNorm === undefined) {
        await ctx.db.patch(lead._id, {
          emailNorm: lead.email.trim().toLowerCase(),
        });
        stamped++;
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        200,
        internal.setterCloserBookings.backfillEmailNorm,
        { teamId: args.teamId, cursor: page.continueCursor },
      );
    } else {
      console.log(`[emailNorm] backfill complete for team ${args.teamId}`);
    }
    if (stamped > 0) {
      console.log(`[emailNorm] stamped ${stamped} leads (team ${args.teamId})`);
    }
  },
});

/** How many leads still lack emailNorm despite having an email — must be 0
 *  per team before the indexed matcher is trusted. Uses the index's own
 *  undefined-bucket, so it reads only unstamped rows (one paginate limit
 *  per function in Convex — and no pagination needed this way). */
export const emailNormCoverage = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const unstamped = (await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_email_norm", (q: any) =>
        q.eq("teamId", args.teamId).eq("emailNorm", undefined),
      )
      .take(2000)) as Doc<"setterLeads">[];
    const missing = unstamped.filter((l) => l.email).length;
    return {
      unstampedSampled: unstamped.length,
      missing,
      complete: unstamped.length < 2000,
    };
  },
});
