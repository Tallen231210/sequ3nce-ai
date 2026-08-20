import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Nightly pipeline repair.
//
// Every failure found on 2026-08-20 shared one shape: a scheduled step threw
// once, died silently, and the damage sat invisible until a customer noticed
// (a $9,800 close hid in a "Pending" badge for days). Scheduled Convex
// actions do not retry, so instead of trusting every chain to be perfect,
// this sweep re-runs anything that should have produced data and didn't:
// closer recordings, manager recordings/transcripts/analyses, and AI call
// dispositions. Idempotent — everything it kicks checks its own work first.
// ============================================================================

const REPAIR_WINDOW_DAYS = 7;

/** Recent completed calls whose disposition never landed and isn't
 *  permanently unextractable. Self-quieting: a call that fails again gets an
 *  extractionFailed marker and stops qualifying once it's permanent. */
export const listRecentStuckExtractions = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const since = Date.now() - REPAIR_WINDOW_DAYS * 86_400_000;
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q: any) =>
        q.eq("teamId", args.teamId).gte("createdAt", since),
      )
      .take(300);
    const PERMANENT = /too short|call not found|internal meeting|already/i;
    return calls
      .filter(
        (c: any) =>
          c.status === "completed" &&
          c.outcome == null &&
          c.outcomeSource == null &&
          c.classifiedAs !== "internal" &&
          // Give the live pipeline an hour before declaring a chain dead.
          c.createdAt < Date.now() - 60 * 60 * 1000 &&
          (c.extractionFailed == null || !PERMANENT.test(c.extractionFailed)),
      )
      .map((c: any) => String(c._id));
  },
});

/** Manager meetings missing what a completed meeting should have. */
export const listManagerMeetingsNeedingRepair = internalQuery({
  args: {},
  handler: async (ctx) => {
    const since = Date.now() - REPAIR_WINDOW_DAYS * 86_400_000;
    const meetings = await ctx.db.query("managerMeetings").order("desc").take(200);
    const out = [];
    for (const m of meetings) {
      if (m.createdAt < since || m.status !== "completed") continue;
      // Same grace as calls: the live chain gets an hour first.
      if (m.createdAt > Date.now() - 60 * 60 * 1000) continue;
      const seg = await ctx.db
        .query("managerMeetingTranscripts")
        .withIndex("by_meeting", (q: any) => q.eq("meetingId", m._id))
        .take(1);
      const analysis = await ctx.db
        .query("managerMeetingAnalysis")
        .withIndex("by_meeting", (q: any) => q.eq("meetingId", m._id))
        .first();
      const needsRecording = !m.recordingUrl;
      const needsTranscript = seg.length === 0;
      const needsAnalysis = seg.length > 0 && !analysis;
      if (needsRecording || needsTranscript || needsAnalysis) {
        out.push({
          meetingId: m._id,
          needsRecording,
          needsTranscript,
          needsAnalysis,
        });
      }
    }
    return out;
  },
});

export const listAllTeamIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").take(500);
    return teams.map((t) => t._id);
  },
});

export const runNightlyRepair = internalAction({
  args: {},
  handler: async (ctx): Promise<any> => {
    const report = { botRecordings: 0, managerMeetings: 0, extractions: 0 };

    // 1. Closer bots that joined but have no recording URL. The fetch itself
    //    terminally marks never-recorded bots, so this list shrinks to real
    //    misses over time.
    try {
      const r: any = await ctx.runMutation(
        internal.autoJoinDiagnostics.repairMissingRecordings,
        { kick: true, sinceDays: REPAIR_WINDOW_DAYS },
      );
      report.botRecordings = r.missingRecording ?? 0;
    } catch (e) {
      console.error("[pipelineRepair] bot recording sweep failed", e);
    }

    // 2. Manager meetings missing recording / transcript / analysis.
    try {
      const meetings: any[] = await ctx.runQuery(
        internal.pipelineRepair.listManagerMeetingsNeedingRepair,
        {},
      );
      let i = 0;
      for (const m of meetings) {
        if (m.needsRecording) {
          await ctx.scheduler.runAfter(
            i * 8000,
            internal.managerMeetingTranscript.fetchManagerRecording,
            { meetingId: m.meetingId },
          );
        }
        if (m.needsTranscript) {
          await ctx.scheduler.runAfter(
            i * 8000 + 4000,
            internal.managerMeetingTranscript.fetchManagerTranscript,
            { meetingId: m.meetingId },
          );
        } else if (m.needsAnalysis) {
          await ctx.scheduler.runAfter(
            i * 8000 + 4000,
            internal.managerMeetingAnalysisRun.analyseManagerMeeting,
            { meetingId: m.meetingId },
          );
        }
        i++;
      }
      report.managerMeetings = meetings.length;
    } catch (e) {
      console.error("[pipelineRepair] manager meeting sweep failed", e);
    }

    // 3. Dispositions that never landed, team by team.
    try {
      const teamIds: any[] = await ctx.runQuery(
        internal.pipelineRepair.listAllTeamIds,
        {},
      );
      let j = 0;
      for (const teamId of teamIds) {
        const callIds: string[] = await ctx.runQuery(
          internal.pipelineRepair.listRecentStuckExtractions,
          { teamId },
        );
        for (const callId of callIds) {
          await ctx.scheduler.runAfter(
            j * 6000,
            internal.callExtractionRun.extractCall,
            { callId: callId as any },
          );
          j++;
        }
      }
      report.extractions = j;
    } catch (e) {
      console.error("[pipelineRepair] extraction sweep failed", e);
    }

    console.log(
      `[pipelineRepair] nightly: ${report.botRecordings} bot recordings, ` +
        `${report.managerMeetings} manager meetings, ${report.extractions} extractions re-kicked`,
    );
    return report;
  },
});
