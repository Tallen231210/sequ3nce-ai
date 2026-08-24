import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Purge phase 3 of 3: relationship tables (DMs, friendships, clips, votes),
// stored files, closer/team-level rows, pending scheduled jobs, and finally
// the three root rows. Runs AFTER purgeCallsBatch has drained the calls and
// purgeUserSweeps has cleared community content. See b2cAdminPurge.ts.
// ============================================================================

type Report = Record<string, number>;

function bump(report: Report, table: string, n = 1) {
  if (n > 0) report[table] = (report[table] ?? 0) + n;
}

async function sweep(
  ctx: any,
  dry: boolean,
  report: Report,
  table: string,
  index: string,
  field: string,
  value: unknown,
) {
  const rows = await ctx.db
    .query(table)
    .withIndex(index, (q: any) => q.eq(field, value))
    .collect();
  for (const row of rows) {
    if (!dry) await ctx.db.delete(row._id);
  }
  bump(report, table, rows.length);
  return rows;
}

const CLOSER_SWEEPS: Array<[string, string]> = [
  ["closerSessions", "by_closer"],
  ["scheduledCalls", "by_closer"],
  ["calendarEvents", "by_closer"],
  ["b2cCalendars", "by_closer"],
  ["closerCalendarSubscriptions", "by_closer"],
  ["excludedCalendarEvents", "by_closer"],
  ["meetingBots", "by_closer"],
  ["fathomConnections", "by_closer"],
  ["clientErrors", "by_closer"],
  ["diagnosticReports", "by_closer"],
  ["reinforcementRequests", "by_closer"],
  ["trainingPlaylistAssignments", "by_closer"],
  ["closerDailyEntries", "by_closer_and_day"],
  ["highlights", "by_closer"],
  ["liveMessages", "by_sender_closer"],
];

const TEAM_SWEEPS: Array<[string, string]> = [
  ["calls", "by_team"],
  ["callStats", "by_team"],
  ["callContent", "by_team"],
  ["ammo", "by_team"],
  ["objections", "by_team"],
  ["highlights", "by_team"],
  ["closerResources", "by_team"],
  ["ammoConfigs", "by_team"],
  ["slackNotifications", "by_team"],
  ["sharedMoments", "by_team"],
  ["sharedLinks", "by_team"],
  ["liveStreams", "by_team_status"],
  ["liveMessages", "by_team"],
  ["b2cJobPostings", "by_team"],
  ["closerDailyStats", "by_team_and_day"],
  ["closerDailyOverrides", "by_team_and_day"],
  ["closerDailyTeamStats", "by_team_and_day"],
  ["closerAdSpend", "by_team_and_month"],
  ["closerGoals", "by_team_and_month"],
  ["adSpendDaily", "by_team_and_date"],
  ["fathomConnections", "by_team"],
  ["users", "by_team"],
  ["managerInvites", "by_team"],
  ["setterRoster", "by_team"],
  ["setterCallMatches", "by_team"],
  ["setterEodEntries", "by_team_and_day"],
  ["setterGhlInstallations", "by_team"],
  ["setterReps", "by_team"],
  ["setterLeads", "by_team"],
  ["setterAppointments", "by_team"],
  ["setterDailyStats", "by_team_and_day"],
  ["setterPipelines", "by_team"],
  ["setterOpportunities", "by_team"],
  ["setterStageTransitions", "by_team"],
  ["setterRoleAssignments", "by_team"],
  ["setterFunnels", "by_team"],
];

export const purgeRelationsAndRoots = internalMutation({
  args: { email: v.string(), dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase();
    const dry = args.dryRun;
    const report: Report = {};
    const warnings: string[] = [];

    const user = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .first();
    if (!user) return { report, warnings: ["no such user"], ghlContactId: null };
    const userId = user._id;
    const teamId = user.personalWorkspaceId ?? null;
    const closer = teamId
      ? await ctx.db
          .query("closers")
          .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
          .first()
      : null;

    // --- DMs: threads via both participant indexes → messages → broadcasts --
    const threads = [
      ...(await ctx.db.query("b2cDirectMessageThreads")
        .withIndex("by_participant1", (q: any) => q.eq("participant1Id", userId)).collect()),
      ...(await ctx.db.query("b2cDirectMessageThreads")
        .withIndex("by_participant2", (q: any) => q.eq("participant2Id", userId)).collect()),
    ];
    const broadcastIds = new Set<string>();
    for (const t of threads) {
      const msgs = await ctx.db.query("b2cDirectMessages")
        .withIndex("by_thread", (q: any) => q.eq("threadId", t._id)).collect();
      for (const m of msgs) {
        if (m.broadcastId) broadcastIds.add(String(m.broadcastId));
        if (!dry) await ctx.db.delete(m._id);
      }
      bump(report, "b2cDirectMessages", msgs.length);
      await sweep(ctx, dry, report, "b2cTypingIndicators", "by_thread", "threadId", t._id);
      if (!dry) await ctx.db.delete(t._id);
    }
    bump(report, "b2cDirectMessageThreads", threads.length);
    for (const id of broadcastIds) {
      const b: any = await ctx.db.get(id as any).catch(() => null);
      // Only remove a team broadcast when this purge removed its last copy —
      // broadcasts fan out to many users, so leave shared ones alone.
      if (b && b.sentBy === userId && !dry) await ctx.db.delete(b._id);
    }

    // --- Friendships (both directions) --------------------------------------
    await sweep(ctx, dry, report, "b2cFriendships", "by_requester", "requesterId", userId);
    await sweep(ctx, dry, report, "b2cFriendships", "by_recipient", "recipientId", userId);

    // --- Highlight clips: shares + content submissions BEFORE the clip ------
    const clips = await ctx.db.query("b2cHighlightClips")
      .withIndex("by_user", (q: any) => q.eq("userId", userId)).collect();
    for (const clip of clips) {
      await sweep(ctx, dry, report, "b2cHighlightShares", "by_clip", "clipId", clip._id);
      await sweep(ctx, dry, report, "b2cContentSubmissions", "by_clip", "clipId", clip._id);
      if (!dry) await ctx.db.delete(clip._id);
    }
    bump(report, "b2cHighlightClips", clips.length);
    await sweep(ctx, dry, report, "b2cContentSubmissions", "by_user", "userId", userId);

    // --- Profile + verification files (the only storage refs) ---------------
    const profiles = await ctx.db.query("b2cProfiles")
      .withIndex("by_user", (q: any) => q.eq("userId", userId)).collect();
    for (const p of profiles) {
      if (p.photoStorageId && !dry) {
        await ctx.storage.delete(p.photoStorageId as any).catch(() => warnings.push(`storage ${p.photoStorageId} not deleted`));
      }
      if (p.photoStorageId) bump(report, "_storage files");
      if (!dry) await ctx.db.delete(p._id);
    }
    bump(report, "b2cProfiles", profiles.length);

    const verifications = await ctx.db.query("b2cStatsVerificationRequests")
      .withIndex("by_user", (q: any) => q.eq("userId", userId)).collect();
    for (const req of verifications) {
      for (const sid of [...(req.payStubStorageIds ?? []), ...(req.crmStorageIds ?? [])]) {
        if (!dry) await ctx.storage.delete(sid as any).catch(() => warnings.push(`storage ${sid} not deleted`));
        bump(report, "_storage files");
      }
      if (!dry) await ctx.db.delete(req._id);
    }
    bump(report, "b2cStatsVerificationRequests", verifications.length);

    // --- Votes with counters ------------------------------------------------
    const frVotes = await ctx.db.query("b2cFeatureRequestVotes")
      .withIndex("by_user_request", (q: any) => q.eq("userId", userId)).collect();
    for (const vte of frVotes) {
      const fr = await ctx.db.get(vte.requestId);
      if (fr && fr.authorId !== userId && !dry) {
        await ctx.db.patch(vte.requestId, { upvoteCount: Math.max(0, fr.upvoteCount - 1) });
      }
      if (!dry) await ctx.db.delete(vte._id);
    }
    bump(report, "b2cFeatureRequestVotes", frVotes.length);

    const frOwn = await ctx.db.query("b2cFeatureRequests")
      .withIndex("by_author", (q: any) => q.eq("authorId", userId)).collect();
    for (const fr of frOwn) {
      await sweep(ctx, dry, report, "b2cFeatureRequestVotes", "by_request", "requestId", fr._id);
      if (!dry) await ctx.db.delete(fr._id);
    }
    bump(report, "b2cFeatureRequests", frOwn.length);

    const pbVotes = await ctx.db.query("b2cPlaybookVotes")
      .withIndex("by_user", (q: any) => q.eq("userId", userId)).collect();
    for (const vte of pbVotes) {
      const entry = await ctx.db.get(vte.entryId);
      if (entry && !dry) {
        await ctx.db.patch(vte.entryId, { voteCount: Math.max(0, entry.voteCount - 1) });
      }
      if (!dry) await ctx.db.delete(vte._id);
    }
    bump(report, "b2cPlaybookVotes", pbVotes.length);

    const playbook = await ctx.db.query("b2cObjectionPlaybook").collect();
    for (const entry of playbook) {
      if (entry.authorUserId === userId || entry.createdBy === userId) {
        await sweep(ctx, dry, report, "b2cPlaybookVotes", "by_entry_user", "entryId", entry._id);
        if (!dry) await ctx.db.delete(entry._id);
        bump(report, "b2cObjectionPlaybook");
      }
    }

    const wkVotes = await ctx.db.query("b2cWeeklyVotes")
      .withIndex("by_user_contest", (q: any) => q.eq("userId", userId)).collect();
    for (const vte of wkVotes) {
      const sub = await ctx.db.get(vte.submissionId);
      if (sub && sub.userId !== userId && !dry) {
        await ctx.db.patch(vte.submissionId, { voteCount: Math.max(0, sub.voteCount - 1) });
      }
      if (!dry) await ctx.db.delete(vte._id);
    }
    bump(report, "b2cWeeklyVotes", wkVotes.length);

    const wkSubs = await ctx.db.query("b2cWeeklySubmissions")
      .withIndex("by_user_contest", (q: any) => q.eq("userId", userId)).collect();
    for (const sub of wkSubs) {
      await sweep(ctx, dry, report, "b2cWeeklyVotes", "by_submission", "submissionId", sub._id);
      if (!dry) await ctx.db.delete(sub._id);
    }
    bump(report, "b2cWeeklySubmissions", wkSubs.length);

    const contests = await ctx.db.query("b2cWeeklyContests").collect();
    for (const c of contests) {
      if (c.winnerId === userId) {
        if (!dry) await ctx.db.patch(c._id, { winnerId: undefined });
        bump(report, "b2cWeeklyContests(winner unset)");
      }
      if (c.createdBy === userId) warnings.push(`weekly contest ${c._id} createdBy purged user — left in place`);
    }

    const jobInterests = await ctx.db.query("b2cJobInterests")
      .withIndex("by_user", (q: any) => q.eq("b2cUserId", userId)).collect();
    for (const ji of jobInterests) {
      const job = await ctx.db.get(ji.jobPostingId);
      if (job && !dry) {
        await ctx.db.patch(ji.jobPostingId, { interestCount: Math.max(0, job.interestCount - 1) });
      }
      if (!dry) await ctx.db.delete(ji._id);
    }
    bump(report, "b2cJobInterests", jobInterests.length);

    // --- Coaching calls the user HOSTED (fan-out cleanup) -------------------
    const hosted = await ctx.db.query("b2cCoachingCalls")
      .withIndex("by_coach", (q: any) => q.eq("coachUserId", userId)).collect();
    for (const call of hosted) {
      await sweep(ctx, dry, report, "calendarEvents", "by_coaching_call", "coachingCallId", call._id);
      await sweep(ctx, dry, report, "b2cCoachingCallAttendance", "by_call", "callId", call._id);
      if (!dry) await ctx.db.delete(call._id);
    }
    bump(report, "b2cCoachingCalls(hosted)", hosted.length);

    // --- Closer- and team-level rows ----------------------------------------
    if (closer) {
      for (const [table, index] of CLOSER_SWEEPS) {
        const field = index === "by_sender_closer" ? "senderCloserId" : "closerId";
        await sweep(ctx, dry, report, table, index, field, closer._id);
      }
      await sweep(ctx, dry, report, "liveMessages", "by_recipient_closer", "recipientCloserId", closer._id);
      // trainingPlaylists created inside the workspace (with their items)
      if (teamId) {
        const playlists = await ctx.db.query("trainingPlaylists")
          .withIndex("by_team", (q: any) => q.eq("teamId", teamId)).collect();
        for (const pl of playlists) {
          await sweep(ctx, dry, report, "trainingPlaylistItems", "by_playlist", "playlistId", pl._id);
          if (!dry) await ctx.db.delete(pl._id);
        }
        bump(report, "trainingPlaylists", playlists.length);
      }
    }
    if (teamId) {
      for (const [table, index] of TEAM_SWEEPS) {
        await sweep(ctx, dry, report, table, index, "teamId", teamId);
      }
    }

    // --- Pending scheduled jobs referencing the purged user -----------------
    const pending = await ctx.db.system
      .query("_scheduled_functions")
      .filter((q: any) => q.eq(q.field("state.kind"), "pending"))
      .take(1000);
    for (const job of pending) {
      if (JSON.stringify(job.args ?? []).includes(String(userId))) {
        if (!dry) await ctx.scheduler.cancel(job._id);
        bump(report, "scheduled jobs cancelled");
      }
    }

    // --- Lead row (capture GHL contact id first) + roots --------------------
    let ghlContactId: string | null = null;
    const lead = await ctx.db.query("b2cLeads")
      .withIndex("by_email", (q: any) => q.eq("email", email)).first();
    if (lead) {
      ghlContactId = lead.ghlContactId ?? null;
      if (!dry) await ctx.db.delete(lead._id);
      bump(report, "b2cLeads");
    }
    if (closer) {
      if (!dry) await ctx.db.delete(closer._id);
      bump(report, "closers");
    }
    if (teamId) {
      if (!dry) await ctx.db.delete(teamId);
      bump(report, "teams");
    }
    if (!dry) await ctx.db.delete(userId);
    bump(report, "b2cUsers");

    return { report, warnings, ghlContactId };
  },
});
