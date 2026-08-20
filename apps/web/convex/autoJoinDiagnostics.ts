import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Auto-join diagnostics — read-only support tooling.
//
// Answers "why isn't the bot in every meeting?" for one team by walking the
// whole eligibility chain per closer: tier → opt-in → connected calendar →
// synced events → events with meeting links → bots booked → bots that got in.
// The gap between any two adjacent stages is the answer.
// ============================================================================

export const teamAutoJoinAudit = internalQuery({
  args: { teamId: v.id("teams"), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const days = Math.min(args.days ?? 7, 14);
    const now = Date.now();
    const from = now - days * 24 * 60 * 60 * 1000;

    const team = await ctx.db.get(args.teamId);
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const perCloser = [];
    for (const c of closers) {
      if (c.status !== "active") continue;

      const events = await ctx.db
        .query("calendarEvents")
        .withIndex("by_closer", (q) => q.eq("closerId", c._id))
        .filter((q) =>
          q.and(
            q.gte(q.field("startTime"), from),
            q.lte(q.field("startTime"), now),
          ),
        )
        .take(2000);
      const withUrl = events.filter((e) => !!e.meetingUrl);

      const bots = (
        await ctx.db
          .query("meetingBots")
          .withIndex("by_closer", (q) => q.eq("closerId", c._id))
          .order("desc")
          .take(500)
      ).filter((b) => (b.scheduledAt ?? b.createdAt) >= from);

      const failureReasons: Record<string, number> = {};
      let joined = 0;
      let neverJoined = 0;
      for (const b of bots) {
        if (b.joinedAt) joined++;
        else if ((b.scheduledAt ?? 0) < now - 30 * 60 * 1000) neverJoined++;
        if (b.status === "failed") {
          const r = b.failureReason ?? "unknown";
          failureReasons[r] = (failureReasons[r] ?? 0) + 1;
        }
      }

      // Events with a meeting link that never got a bot AT ALL — the silent
      // failure bucket auto-join can't see from the bot table alone.
      const botEventIds = new Set(
        bots.map((b) => b.calendarEventId).filter(Boolean),
      );
      const excluded = await ctx.db
        .query("excludedCalendarEvents")
        .withIndex("by_closer", (q) => q.eq("closerId", c._id))
        .collect();
      const excludedIds = new Set(excluded.map((e) => e.calendarEventId));

      const noBot = withUrl.filter(
        (e) => !botEventIds.has(e.uid) && !excludedIds.has(e.uid),
      );

      const subs = await ctx.db
        .query("closerCalendarSubscriptions")
        .withIndex("by_closer", (q: any) => q.eq("closerId", c._id))
        .collect()
        .catch(() => [] as any[]);

      perCloser.push({
        name: c.name,
        email: c.email,
        autoJoinEnabled: c.autoJoinEnabled === true,
        hasGoogleCalendar: !!c.googleCalendarRefreshToken,
        hasIcsFeed: !!c.icsUrl,
        calendarLastSyncAt: c.calendarLastSyncAt
          ? new Date(c.calendarLastSyncAt).toISOString()
          : null,
        subscribedCalendars: subs.length,
        window: {
          eventsSynced: events.length,
          eventsWithMeetingLink: withUrl.length,
          botsBooked: bots.length,
          botsJoined: joined,
          botsNeverGotIn: neverJoined,
          failureReasons,
          linkEventsWithNoBot: noBot.length,
          noBotSamples: noBot.slice(0, 5).map((e) => ({
            title: e.title,
            start: new Date(e.startTime).toISOString(),
            url: (e.meetingUrl ?? "").slice(0, 40),
          })),
        },
      });
    }

    perCloser.sort((a, b) => a.name.localeCompare(b.name));
    return {
      team: team?.name,
      tier: (team as any)?.productTierOverride ?? (team as any)?.productTier,
      autoJoinDailyCap: (team as any)?.autoJoinDailyCap ?? 50,
      windowDays: days,
      activeClosers: perCloser.length,
      closersWithAutoJoinOn: perCloser.filter((c) => c.autoJoinEnabled).length,
      perCloser,
    };
  },
});

/**
 * Set a team's auto-join daily cap. Support lever — the default (50) was
 * sized as a runaway detector for ~14-bot/day teams; a floor the size of
 * E2's legitimately books ~50/day and needs headroom, not a silent stop.
 */
export const setAutoJoinDailyCap = internalMutation({
  args: { teamId: v.id("teams"), cap: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.cap) || args.cap < 1 || args.cap > 500) {
      throw new Error("Cap must be an integer between 1 and 500");
    }
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");
    const previous = (team as { autoJoinDailyCap?: number }).autoJoinDailyCap ?? 50;
    await ctx.db.patch(args.teamId, { autoJoinDailyCap: args.cap });
    return { team: team.name, previous, now: args.cap };
  },
});

/**
 * Bots that JOINED a meeting (so a recording exists at Recall) but whose
 * recording URL never landed — the immortal-retry-loop storm burned their
 * three fetch attempts on 429s. Read-only count + optional repair kick.
 *
 * `kick: true` re-schedules the (now fixed) fetch for each, staggered 5s
 * apart so the repair itself can't recreate the rate-limit pile-up.
 */
export const repairMissingRecordings = internalMutation({
  args: { kick: v.boolean() },
  handler: async (ctx, args) => {
    const bots = await ctx.db.query("meetingBots").order("desc").take(1000);
    const candidates = bots.filter(
      (b) =>
        !!b.joinedAt &&
        !b.recordingUrl &&
        !!b.recallBotId &&
        b.status !== "failed",
    );
    if (args.kick) {
      for (let i = 0; i < candidates.length; i++) {
        await ctx.scheduler.runAfter(
          i * 5000,
          internal.meetingBot.fetchBotRecording,
          { recallBotId: candidates[i].recallBotId as string, attempt: 1 },
        );
      }
    }
    return {
      scanned: bots.length,
      missingRecording: candidates.length,
      kicked: args.kick,
      sample: candidates.slice(0, 10).map((b) => ({
        title: b.meetingTitle ?? null,
        joined: b.joinedAt ? new Date(b.joinedAt).toISOString() : null,
      })),
    };
  },
});
