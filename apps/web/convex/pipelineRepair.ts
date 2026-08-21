import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
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
    const PERMANENT = /too short|call not found|internal meeting|already|no outcome was stated/i;
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
      // Terminally failed ("nobody joined — nothing recorded"): no media
      // will ever exist; re-fetching nightly is how storms start.
      if (m.failureReason) continue;
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

/** Manager bots that never reached a terminal status. A missed or ignored
 *  webhook (the 429 storm swallowed several) leaves them reading "joining"
 *  forever; Recall knows what actually happened. */
export const listStaleManagerBots = internalQuery({
  args: {},
  handler: async (ctx) => {
    const bots = await ctx.db
      .query("managerMeetingBots")
      .withIndex("by_user")
      .collect();
    const cutoff = Date.now() - 12 * 3_600_000;
    return bots
      .filter(
        (b) =>
          b.status !== "completed" &&
          b.status !== "failed" &&
          b.status !== "cancelled" &&
          b.scheduledStartTime < cutoff,
      )
      .map((b) => ({
        botId: b._id,
        recallBotId: b.recallBotId,
        title: b.meetingTitle,
        hasMeetingRow: !!b.meetingId,
      }));
  },
});

export const markManagerBotTerminal = internalMutation({
  args: {
    botId: v.id("managerMeetingBots"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const bot = await ctx.db.get(args.botId);
    if (!bot) return;
    if (bot.status === "completed" || bot.status === "failed") return;
    await ctx.db.patch(args.botId, {
      status: args.status,
      endedAt: bot.endedAt ?? Date.now(),
      failureReason: args.reason,
    });
  },
});

export const reconcileStaleManagerBots = internalAction({
  args: {},
  handler: async (ctx): Promise<any> => {
    const stale: any[] = await ctx.runQuery(
      internal.pipelineRepair.listStaleManagerBots,
      {},
    );
    const report = { checked: stale.length, reconciled: 0, needsManualLook: [] as string[] };
    for (const b of stale) {
      const res = await fetch(
        `https://us-west-2.recall.ai/api/v1/bot/${b.recallBotId}/`,
        { headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` } },
      );
      if (!res.ok) {
        console.log(`[reconcileStaleManagerBots] Recall ${res.status} for ${b.recallBotId}, skipping`);
        continue;
      }
      const data: any = await res.json();
      const codes: string[] = (data.status_changes ?? []).map((c: any) => c.code);
      const recorded = codes.includes("in_call_recording");
      if (recorded && !b.hasMeetingRow) {
        // Recall has a real recording we never ingested — repairing that is
        // a webhook replay, not a status stamp. Flag it instead of burying it.
        report.needsManualLook.push(`${b.title} (${b.recallBotId})`);
        continue;
      }
      if (codes.includes("fatal")) {
        await ctx.runMutation(internal.pipelineRepair.markManagerBotTerminal, {
          botId: b.botId,
          status: "failed",
          reason: "bot failed before joining",
        });
        report.reconciled++;
      } else if (codes.includes("done") && !recorded) {
        await ctx.runMutation(internal.pipelineRepair.markManagerBotTerminal, {
          botId: b.botId,
          status: "completed",
          reason: "nobody joined — nothing recorded",
        });
        report.reconciled++;
      }
      // Anything else (still live at Recall, unknown trail): leave it for the
      // next nightly pass rather than guess.
    }
    if (report.needsManualLook.length > 0) {
      console.error(
        `[reconcileStaleManagerBots] ${report.needsManualLook.length} bots recorded at Recall with no meeting row: ${report.needsManualLook.join("; ")}`,
      );
    }
    return report;
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

    // 1b. Manager bots stranded in a non-terminal status by a missed webhook.
    try {
      const r: any = await ctx.runAction(
        internal.pipelineRepair.reconcileStaleManagerBots,
        {},
      );
      (report as any).staleManagerBots = r.reconciled ?? 0;
    } catch (e) {
      console.error("[pipelineRepair] stale manager bot sweep failed", e);
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
