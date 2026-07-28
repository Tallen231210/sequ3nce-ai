// ============================================================================
// Bookings become calls — the Overview tier's only source of call data.
//
// Overwatch has our bot in the room. Oversight has Fathom. Overview has
// neither, so the only evidence a call happened is that it was on someone's
// calendar and they say it went ahead.
//
// The alternative was asking closers to type daily totals, which makes the
// cheapest tier a spreadsheet with a login: no per-call data, so no Analytics,
// no objection tracking, and a show rate that's whatever someone typed. Turning
// each booking into a call the closer answers a normal post-call form for gives
// the cheap tier the same shape of data as the expensive ones — just sourced
// from a calendar instead of a recording.
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  isSalesBooking,
  groupBookingCopies,
  prospectFromBooking,
} from "./calendarBookings";

/**
 * How close in time two records must be to be the same meeting.
 *
 * A bot joins at the scheduled time; a booking starts then too. Fifteen
 * minutes absorbs a late join without swallowing the next call in a
 * back-to-back day.
 */
const OVERLAP_MS = 15 * 60 * 1000;

/** Teams whose calls can only come from their calendar. */
export const listOverviewTeams = internalQuery({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").take(500);
    return teams
      .filter((t) => (t.productTierOverride ?? t.productTier) === "overview")
      .map((t) => ({ teamId: t._id, name: t.name }));
  },
});

/**
 * Turn one team's finished bookings into calls.
 *
 * Only bookings whose end time has passed. A meeting at 4pm hasn't happened at
 * 2pm, and asking a closer how it went would be asking them to predict.
 */
export const ingestTeamBookings = internalMutation({
  args: { teamId: v.id("teams"), windowDays: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ created: number; skipped: number }> => {
    const now = Date.now();
    const since = now - (args.windowDays ?? 3) * 24 * 60 * 60 * 1000;

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const active = closers.filter((c) => c.status === "active");
    if (active.length === 0) return { created: 0, skipped: 0 };
    const activeIds = new Set(active.map((c) => String(c._id)));

    // Range-scanned on start time, not "the most recent 200 per closer".
    //
    // by_closer orders by creation, so for a closer whose calendar syncs
    // months ahead the newest rows are all FUTURE bookings — they filled the
    // window and pushed out the finished calls this job exists to find. It
    // returned nothing on a team holding 900 events. by_team_and_time asks the
    // question we actually mean, in one query instead of one per closer.
    const events = (await ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q) =>
        q.eq("teamId", args.teamId).gte("startTime", since).lte("startTime", now),
      )
      .take(2000)) as Doc<"calendarEvents">[];

    const finished = events.filter(
      (e) =>
        e.endTime <= now && !e.isAllDay && activeIds.has(String(e.closerId)),
    );
    if (finished.length === 0) return { created: 0, skipped: 0 };

    const grouped = groupBookingCopies(finished);
    let created = 0;
    let skipped = 0;

    for (const [, copies] of grouped) {
      // Same rule Team Performance uses to call this "Booked". If it isn't a
      // sales call there, it must not become a call here.
      if (!isSalesBooking(copies)) {
        skipped++;
        continue;
      }

      // Whichever copy we pick must be stable, or a later run creates a second
      // call for the same meeting from a different copy. Lowest id wins.
      const canonical = copies
        .slice()
        .sort((a, b) => String(a._id).localeCompare(String(b._id)))[0];

      const existing = await ctx.db
        .query("calls")
        .withIndex("by_calendar_event", (q) =>
          q.eq("calendarEventId", canonical._id),
        )
        .first();
      if (existing) {
        skipped++;
        continue;
      }

      // Is a bot or Fathom call already covering this meeting?
      //
      // Searched by TIME, not by "the 50 newest calls". The recency version
      // shipped and produced 264 duplicates out of 360 on a team with 687
      // existing calls — the matching call was always there, just nowhere near
      // the top of a list ordered by creation. Doubling a scoreboard is the
      // worst thing this job could do, so the check has to look where the
      // answer actually is.
      const nearby = await ctx.db
        .query("calls")
        .withIndex("by_team_and_date", (q) =>
          q
            .eq("teamId", args.teamId)
            .gte("createdAt", canonical.startTime - OVERLAP_MS)
            .lte("createdAt", canonical.startTime + OVERLAP_MS),
        )
        .take(50);
      const alreadyCovered = nearby.some(
        (c) =>
          c.source !== "calendar" &&
          String(c.closerId) === String(canonical.closerId),
      );
      if (alreadyCovered) {
        skipped++;
        continue;
      }

      const duration = Math.max(
        0,
        Math.round((canonical.endTime - canonical.startTime) / 1000),
      );

      await ctx.db.insert("calls", {
        teamId: args.teamId,
        closerId: canonical.closerId,
        calendarEventId: canonical._id,
        prospectName: prospectFromBooking(
          copies,
          active.find((c) => String(c._id) === String(canonical.closerId))?.name,
        ),
        source: "calendar",
        // Never counts on arrival. The calendar proves a meeting was booked,
        // not that it happened or how it went — a no-show looks identical to a
        // closed deal until someone tells us. Answering the post-call form
        // promotes it, exactly as it does for a Fathom call.
        status: "unclassified",
        countsTowardStats: false,
        classifiedAs: "sales",
        classifiedBy: "auto",
        startedAt: canonical.startTime,
        endedAt: canonical.endTime,
        // The scheduled length, not a measured one. Nothing watched this call.
        duration,
        speakerCount: 2,
        createdAt: canonical.startTime,
      });
      created++;
    }

    return { created, skipped };
  },
});

/**
 * Every fifteen minutes, for Overview teams only.
 *
 * Scoped by tier deliberately. A team on Overwatch has both a bot and a
 * calendar, and running this for them would turn one meeting into two calls —
 * the single worst thing that could happen to a scoreboard.
 */
export const pollBookings = internalAction({
  args: {},
  handler: async (ctx): Promise<{ teams: number; created: number }> => {
    const teams = await ctx.runQuery(
      internal.calendarCalls.listOverviewTeams,
      {},
    );

    let created = 0;
    for (const team of teams) {
      try {
        const result = await ctx.runMutation(
          internal.calendarCalls.ingestTeamBookings,
          { teamId: team.teamId as Id<"teams"> },
        );
        created += result.created;
      } catch (error) {
        // One team's malformed calendar must not stop everyone else's calls.
        console.error(
          `[calendar-calls] failed for team ${team.teamId}:`,
          error,
        );
      }
    }
    return { teams: teams.length, created };
  },
});
