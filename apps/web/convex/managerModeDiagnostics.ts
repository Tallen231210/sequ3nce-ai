import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Manager Mode diagnostics — read-only support tooling.
//
// For one team: every manager meeting with what it actually has (recording
// URL, transcript segments, analysis) and every bot with how it ended, so
// "the tab isn't working" decomposes into which stage is dropping things.
// ============================================================================

export const teamManagerModeAudit = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const meetings = await ctx.db
      .query("managerMeetings")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const out = [];
    for (const m of meetings) {
      const segs = await ctx.db
        .query("managerMeetingTranscripts")
        .withIndex("by_meeting", (q) => q.eq("meetingId", m._id))
        .take(1);
      const analysis = await ctx.db
        .query("managerMeetingAnalysis")
        .withIndex("by_meeting", (q: any) => q.eq("meetingId", m._id))
        .first()
        .catch(() => null);
      out.push({
        title: m.title,
        created: new Date(m.createdAt).toISOString(),
        status: m.status,
        durationMin: m.duration ? Math.round(m.duration / 60) : null,
        hasRecordingUrl: !!m.recordingUrl,
        hasTranscript: segs.length > 0,
        hasAnalysis: !!analysis,
        failureReason: m.failureReason ?? null,
      });
    }
    out.sort((a, b) => (a.created < b.created ? 1 : -1));

    const bots = await ctx.db
      .query("managerMeetingBots")
      .withIndex("by_user")
      .collect();
    const teamBots = bots.filter((b) => String(b.teamId) === String(args.teamId));
    const botSummary = {
      total: teamBots.length,
      byStatus: {} as Record<string, number>,
      joined: teamBots.filter((b) => b.joinedAt).length,
      withMeetingRow: teamBots.filter((b) => b.meetingId).length,
      failureReasons: {} as Record<string, number>,
    };
    for (const b of teamBots) {
      botSummary.byStatus[b.status] = (botSummary.byStatus[b.status] ?? 0) + 1;
      if (b.failureReason) {
        botSummary.failureReasons[b.failureReason] =
          (botSummary.failureReasons[b.failureReason] ?? 0) + 1;
      }
    }

    return {
      meetings: out.length,
      withRecording: out.filter((m) => m.hasRecordingUrl).length,
      withTranscript: out.filter((m) => m.hasTranscript).length,
      withAnalysis: out.filter((m) => m.hasAnalysis).length,
      botSummary,
      detail: out.slice(0, 30),
    };
  },
});
