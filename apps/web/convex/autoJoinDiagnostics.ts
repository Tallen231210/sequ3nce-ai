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
      autoJoinDailyCap: (team as any)?.autoJoinDailyCap ?? 150,
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
  args: { kick: v.boolean(), sinceDays: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const since = args.sinceDays
      ? Date.now() - args.sinceDays * 86_400_000
      : 0;
    const bots = await ctx.db.query("meetingBots").order("desc").take(1000);
    const candidates = bots.filter(
      (b) =>
        !!b.joinedAt &&
        !b.recordingUrl &&
        !!b.recallBotId &&
        b.status !== "failed" &&
        // Terminally resolved ("nobody joined — nothing recorded") bots are
        // done; re-fetching them nightly is how storms start.
        !b.failureReason &&
        (b.scheduledAt ?? b.createdAt ?? 0) >= since,
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
        recallBotId: b.recallBotId ?? null,
        title: b.meetingTitle ?? null,
        joined: b.joinedAt ? new Date(b.joinedAt).toISOString() : null,
      })),
    };
  },
});

/**
 * Stuck-pending audit: completed calls with no outcome, decomposed by what
 * they have (transcript? summary?) so "Pending for days" separates into
 * "nothing to read" vs "pipeline died mid-chain".
 */
export const stuckPendingAudit = internalQuery({
  args: { teamId: v.id("teams"), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const since = Date.now() - (args.days ?? 14) * 86_400_000;
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q: any) =>
        q.eq("teamId", args.teamId).gte("createdAt", since),
      )
      .take(2000);

    const completed = calls.filter((c: any) => c.status === "completed");
    const pending = completed.filter((c: any) => c.outcome == null);
    const rows = [];
    for (const c of pending) {
      const content = await ctx.db
        .query("callContent")
        .withIndex("by_call", (q: any) => q.eq("callId", c._id))
        .first()
        .catch(() => null);
      const transcriptLen = (content as any)?.transcriptText?.length ?? (c as any).transcriptText?.length ?? 0;
      rows.push({
        created: new Date(c.createdAt).toISOString().slice(0, 16),
        ageDays: Math.round((Date.now() - c.createdAt) / 86_400_000),
        durationMin: c.duration ? Math.round(c.duration / 60) : 0,
        transcriptChars: transcriptLen,
        hasSummary: !!(c as any).summary || !!(content as any)?.summary,
        prospectJoined: (c as any).prospectJoined ?? null,
        classifiedAs: (c as any).classifiedAs ?? null,
        outcomeSource: (c as any).outcomeSource ?? null,
        extractionFailed: ((c as any).extractionFailed ?? null)?.slice(0, 60) ?? null,
      });
    }
    rows.sort((a, b) => (a.created < b.created ? 1 : -1));
    return {
      completedCalls: completed.length,
      withOutcome: completed.length - pending.length,
      stuckPending: pending.length,
      pendingWithRealTranscript: rows.filter((r) => r.transcriptChars > 500).length,
      pendingWithSummaryButNoOutcome: rows.filter((r) => r.hasSummary).length,
      pendingEmpty: rows.filter((r) => r.transcriptChars <= 500).length,
      detail: rows.slice(0, 25),
    };
  },
});

/** Earliest call rows for a team — corrupt createdAt values poison "watching since". */
export const earliestCalls = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) => q.eq("teamId", args.teamId))
      .order("asc")
      .take(5);
    return calls.map((c) => ({
      id: c._id,
      createdAt: new Date(c.createdAt).toISOString(),
      _creationTime: new Date(c._creationTime).toISOString(),
      status: c.status,
      duration: c.duration ?? null,
      source: (c as any).source ?? null,
      prospectName: (c as any).prospectName ?? null,
    }));
  },
});

/** Ingest-source census for a team's calls: how many, from where, in what state. */
export const callSourceCensus = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .take(3000);
    const bySource: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const fathom = { total: 0, unclassified: 0, oldest: null as string | null, newest: null as string | null, last24hIngested: 0 };
    const now = Date.now();
    for (const c of calls) {
      const src = (c as any).source ?? "app";
      bySource[src] = (bySource[src] ?? 0) + 1;
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      if (src === "fathom") {
        fathom.total++;
        if (c.status === "unclassified") fathom.unclassified++;
        const d = new Date(c.createdAt).toISOString();
        if (!fathom.oldest || d < fathom.oldest) fathom.oldest = d;
        if (!fathom.newest || d > fathom.newest) fathom.newest = d;
        if (now - c._creationTime < 86_400_000) fathom.last24hIngested++;
      }
    }
    return { totalRows: calls.length, bySource, byStatus, fathom };
  },
});
