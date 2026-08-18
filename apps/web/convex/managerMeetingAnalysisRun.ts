import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { analyseMeetingTranscript } from "./managerMeetingAnalysis";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Owns the database side of meeting analysis.
//
// Split from managerMeetingAnalysis.ts, which is pure, for the same reason
// callExtraction is split from callExtractionRun: the prompt and its guards
// can then be exercised against a pasted transcript without a real meeting,
// and against situations that haven't happened yet.
// ============================================================================

export const getTranscriptText = internalQuery({
  args: { meetingId: v.id("managerMeetings") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("managerMeetingTranscripts")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .collect();
    if (rows.length === 0) return null;

    rows.sort((a, b) => a.startSeconds - b.startSeconds);
    return rows.map((r) => `${r.speaker}: ${r.text}`).join("\n");
  },
});

export const saveAnalysis = internalMutation({
  args: {
    meetingId: v.id("managerMeetings"),
    userId: v.id("users"),
    teamId: v.id("teams"),
    kind: v.string(),
    summary: v.string(),
    topics: v.array(v.string()),
    actionItems: v.array(v.object({ who: v.string(), what: v.string() })),
    agreements: v.array(
      v.object({ who: v.string(), what: v.string(), measurable: v.boolean() }),
    ),
    candidateName: v.optional(v.string()),
    role: v.optional(v.string()),
    talkingPoints: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const { meetingId, ...rest } = args;

    // Replace rather than append. Re-analysing a meeting should correct the
    // record, not leave two summaries with no way to tell which is current.
    const existing = await ctx.db
      .query("managerMeetingAnalysis")
      .withIndex("by_meeting", (q) => q.eq("meetingId", meetingId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...rest, analysedAt: Date.now() });
      return { updated: true };
    }
    await ctx.db.insert("managerMeetingAnalysis", {
      meetingId,
      ...rest,
      analysedAt: Date.now(),
    });
    return { created: true };
  },
});

export const getMeetingForAnalysis = internalQuery({
  args: { meetingId: v.id("managerMeetings") },
  handler: async (ctx, args) => {
    const m = await ctx.db.get(args.meetingId);
    if (!m) return null;
    return { userId: m.userId, teamId: m.teamId, title: m.title };
  },
});

export const analyseManagerMeeting = internalAction({
  args: { meetingId: v.id("managerMeetings") },
  handler: async (
    ctx,
    args,
  ): Promise<{ analysed: boolean; reason?: string; kind?: string }> => {
    const meeting = await ctx.runQuery(
      internal.managerMeetingAnalysisRun.getMeetingForAnalysis,
      { meetingId: args.meetingId },
    );
    if (!meeting) return { analysed: false, reason: "meeting gone" };

    const transcript = await ctx.runQuery(
      internal.managerMeetingAnalysisRun.getTranscriptText,
      { meetingId: args.meetingId },
    );
    if (!transcript) {
      // Silent meeting, or one nobody joined. Not an error.
      return { analysed: false, reason: "no transcript" };
    }

    const result = await analyseMeetingTranscript(transcript);
    if (!result.ok) {
      console.warn(
        `[managerAnalysis] ${meeting.title}: ${result.reason} after ${result.attempts} attempts`,
      );
      return { analysed: false, reason: result.reason };
    }

    const d = result.data;
    await ctx.runMutation(internal.managerMeetingAnalysisRun.saveAnalysis, {
      meetingId: args.meetingId,
      userId: meeting.userId,
      teamId: meeting.teamId,
      kind: d.kind,
      summary: d.summary,
      topics: d.topics,
      actionItems: d.actionItems,
      agreements: d.agreements,
      candidateName: d.candidateName ?? undefined,
      role: d.role ?? undefined,
      talkingPoints: d.talkingPoints,
    });

    return { analysed: true, kind: d.kind };
  },
});

/**
 * Run the prompt against a pasted transcript without touching the database.
 *
 * The point of this is testing situations rather than samples — a coaching
 * one-to-one, an interview, a meeting where somebody promises something
 * unmeasurable — without waiting for one to occur. callExtraction's
 * equivalent is what caught the model filling a list and leaving the single
 * field empty, and that bug would otherwise have shipped.
 */
export const previewAnalysis = internalAction({
  args: { transcript: v.string() },
  handler: async (_ctx, args): Promise<any> => {
    const result = await analyseMeetingTranscript(args.transcript);
    return result.ok
      ? { ok: true, attempts: result.attempts, ...result.data }
      : { ok: false, reason: result.reason, attempts: result.attempts };
  },
});
