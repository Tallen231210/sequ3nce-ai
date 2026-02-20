import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

// Internal mutation to store diagnostic reports (called from HTTP handler)
export const storeDiagnosticReport = internalMutation({
  args: {
    reportId: v.string(),
    closerId: v.optional(v.string()),
    teamId: v.optional(v.string()),
    closerEmail: v.optional(v.string()),
    userDescription: v.optional(v.string()),
    system: v.object({
      macOSVersion: v.string(),
      macOSBuild: v.string(),
      hardwareModel: v.string(),
      chipType: v.string(),
      ramTotal: v.number(),
      ramAvailable: v.number(),
      appVersion: v.string(),
      appBuild: v.string(),
      appUptime: v.optional(v.number()),
    }),
    audio: v.object({
      defaultInputDeviceName: v.optional(v.string()),
      defaultInputDeviceUID: v.optional(v.string()),
      systemAudioCaptureStatus: v.string(),
      micLevel: v.number(),
      systemLevel: v.number(),
      silenceDetectionActive: v.boolean(),
      lastMicCallbackSecondsAgo: v.number(),
      totalChunksSent: v.number(),
      isCapturing: v.boolean(),
    }),
    websocket: v.object({
      connectionState: v.string(),
      reconnectionCountThisSession: v.number(),
      lastHeartbeatAckSecondsAgo: v.number(),
      missedHeartbeatCount: v.number(),
      reconnectionHistory: v.array(v.object({
        timestamp: v.string(),
        reason: v.string(),
      })),
    }),
    call: v.object({
      currentCallId: v.optional(v.string()),
      convexCallId: v.optional(v.string()),
      closerId: v.optional(v.string()),
      teamId: v.optional(v.string()),
      recordingState: v.string(),
      recordingDuration: v.number(),
      timeSinceRecordingStarted: v.optional(v.number()),
    }),
    permissions: v.object({
      microphonePermission: v.string(),
      screenRecordingPermission: v.string(),
    }),
    logs: v.object({
      recentLogs: v.array(v.object({
        timestamp: v.string(),
        level: v.string(),
        category: v.string(),
        message: v.string(),
      })),
      errorCountLastHour: v.number(),
      lastErrorMessage: v.optional(v.string()),
      lastErrorTimestamp: v.optional(v.string()),
    }),
    meetingBot: v.optional(v.object({
      meetingBotEnabled: v.boolean(),
      botCallActive: v.boolean(),
      activeBotCallId: v.optional(v.string()),
      activeBotId: v.optional(v.string()),
      activeBotMeetingTitle: v.optional(v.string()),
      activeBotProspectName: v.optional(v.string()),
      pendingQuestionnaireCount: v.number(),
      showingPostCallQuestionnaire: v.boolean(),
      calendarConnected: v.boolean(),
      meetingPlatform: v.optional(v.string()),
      appMode: v.string(),
      currentSidebarItem: v.optional(v.string()),
      pollBotStatusActive: v.boolean(),
      ammoPanelVisible: v.boolean(),
      questionnairePanelVisible: v.boolean(),
      firstPendingCallId: v.optional(v.string()),
      firstPendingProspectName: v.optional(v.string()),
      botStatus: v.optional(v.string()),
      botIsScheduled: v.optional(v.boolean()),
      botActiveSeconds: v.optional(v.number()),
      lastBotError: v.optional(v.string()),
      lastBotErrorAt: v.optional(v.string()),
    })),
    ammoPanel: v.optional(v.object({
      ammoItemCount: v.number(),
      transcriptSegmentCount: v.number(),
      isPolling: v.boolean(),
      trackedCallId: v.optional(v.string()),
      isAmmoV2Enabled: v.boolean(),
    })),
    api: v.optional(v.object({
      lastApiError: v.optional(v.string()),
      lastApiErrorEndpoint: v.optional(v.string()),
      lastApiErrorAt: v.optional(v.string()),
      apiErrorCountLastHour: v.number(),
    })),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("diagnosticReports", args);
    console.log(`[Diagnostics] Stored report ${args.reportId} from closer ${args.closerId || 'unknown'}`);
  },
});

// Query to get a diagnostic report by ID (for admin viewing)
export const getReportById = query({
  args: { reportId: v.string() },
  handler: async (ctx, args) => {
    const report = await ctx.db
      .query("diagnosticReports")
      .withIndex("by_report_id", (q) => q.eq("reportId", args.reportId))
      .first();
    return report;
  },
});

// Query to get recent diagnostic reports for a team (for admin viewing)
export const getReportsForTeam = query({
  args: {
    teamId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    const reports = await ctx.db
      .query("diagnosticReports")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(limit);
    return reports;
  },
});

// Query to get recent diagnostic reports for a closer (for admin viewing)
export const getReportsForCloser = query({
  args: {
    closerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const reports = await ctx.db
      .query("diagnosticReports")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .order("desc")
      .take(limit);
    return reports;
  },
});
