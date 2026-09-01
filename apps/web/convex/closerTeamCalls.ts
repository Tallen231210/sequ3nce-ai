// ============================================================================
// Team call visibility for closers — E2's ask (2026-09-01): closers want to
// watch each other's calls to learn from them. CLIENT-GATED behind the
// `closer_team_calls` beta flag; no team without the flag can reach any of
// this, and even with it, access never crosses a team boundary.
//
// Read-only by design: the list feeds the same CallDetailSheet the closer
// already has, but the frontend hides every mutating control (flag, share,
// speaker swap, facts editor) on a call the viewer doesn't own — and the
// mutation routes themselves still verify ownership server-side, so this
// query widening changes what can be SEEN, never what can be CHANGED.
// ============================================================================

import { v } from "convex/values";
import { query } from "./_generated/server";
import { getContentForCallTx } from "./callContent";

export const TEAM_CALLS_FLAG = "closer_team_calls";

const FINISHED_STATUSES = new Set(["completed", "no_show", "unclassified"]);

const DISABLED = { enabled: false as const, closers: [], calls: [] };

export const getTeamCallsForCloser = query({
  args: {
    closerId: v.id("closers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await ctx.db.get(args.closerId);
    if (!viewer || viewer.status === "deactivated") return DISABLED;

    const team = await ctx.db.get(viewer.teamId);
    if (!team || !((team.betaFeatures ?? []).includes(TEAM_CALLS_FLAG))) {
      return DISABLED;
    }

    const maxResults = Math.min(Math.max(args.limit ?? 100, 1), 200);

    // Over-fetch to absorb in-progress calls the status filter drops.
    const raw = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) => q.eq("teamId", viewer.teamId))
      .order("desc")
      .take(maxResults * 2 + 40);

    const calls = raw
      .filter((c) => FINISHED_STATUSES.has(c.status))
      .slice(0, maxResults);

    // Names for the rows and the filter dropdown. Active closers only in the
    // dropdown; a departed closer's calls still render with their name.
    const teamClosers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", viewer.teamId))
      .collect();
    const nameById = new Map(teamClosers.map((c) => [String(c._id), c.name]));
    const closers = teamClosers
      .filter((c) => c.status !== "deactivated")
      .map((c) => ({ closerId: String(c._id), name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const callsWithContent = await Promise.all(
      calls.map(async (call) => ({
        call,
        content: await getContentForCallTx(ctx, call._id),
      })),
    );

    return {
      enabled: true as const,
      closers,
      // Same shape getCallHistoryForCloser returns (the CallDetailSheet reads
      // it), plus who took the call.
      calls: callsWithContent.map(({ call, content }) => ({
        _id: call._id,
        closerId: String(call.closerId),
        closerName: nameById.get(String(call.closerId)) ?? "Former closer",
        prospectName: call.prospectName,
        status: call.status,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        duration: call.duration,
        recordingUrl: call.recordingUrl,
        recordingType: call.recordingType,
        outcome: call.outcome,
        cashCollected: call.cashCollected,
        contractValue: call.contractValue,
        outcomeSource: call.outcomeSource,
        meetingBotId: call.meetingBotId,
        closerTalkTime: call.closerTalkTime,
        prospectTalkTime: call.prospectTalkTime,
        summary: content?.summary,
        transcriptText: content?.transcriptText
          ? content.transcriptText.slice(0, 500) +
            (content.transcriptText.length > 500 ? "..." : "")
          : undefined,
        flaggedForReview: call.flaggedForReview,
        reviewStatus: call.reviewStatus,
        commentCount: call.commentCount,
        callAnalysis: content?.callAnalysis,
        source: call.source,
        externalShareUrl: call.externalShareUrl,
        classifiedAs: call.classifiedAs,
        classifiedBy: call.classifiedBy,
        countsTowardStats: call.countsTowardStats,
        isHistorical: call.isHistorical,
      })),
    };
  },
});
