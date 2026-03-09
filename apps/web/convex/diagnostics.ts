import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

// Internal mutation to store diagnostic reports (called from HTTP handler)
export const storeDiagnosticReport = internalMutation({
  args: {
    reportId: v.string(),
    appType: v.optional(v.string()),
    closerId: v.optional(v.string()),
    teamId: v.optional(v.string()),
    closerEmail: v.optional(v.string()),
    userDescription: v.optional(v.string()),
    system: v.optional(v.object({
      platform: v.optional(v.string()),
      arch: v.optional(v.string()),
      osRelease: v.optional(v.string()),
      osVersion: v.optional(v.string()),
      osBuild: v.optional(v.string()),
      macOSVersion: v.optional(v.string()),
      macOSBuild: v.optional(v.string()),
      hardwareModel: v.optional(v.string()),
      chipType: v.optional(v.string()),
      cpuModel: v.optional(v.string()),
      ramTotal: v.optional(v.number()),
      ramAvailable: v.optional(v.number()),
      ramTotalGB: v.optional(v.number()),
      ramAvailableGB: v.optional(v.number()),
      appVersion: v.optional(v.string()),
      appBuild: v.optional(v.string()),
      appUptime: v.optional(v.number()),
      userAgent: v.optional(v.string()),
      electronVersion: v.optional(v.string()),
      chromeVersion: v.optional(v.string()),
      openWindowCount: v.optional(v.number()),
    })),
    audio: v.optional(v.object({
      defaultInputDeviceName: v.optional(v.string()),
      defaultInputDeviceUID: v.optional(v.string()),
      systemAudioCaptureStatus: v.optional(v.string()),
      captureStatus: v.optional(v.string()),
      micLevel: v.optional(v.number()),
      systemLevel: v.optional(v.number()),
      silenceDetectionActive: v.optional(v.boolean()),
      lastMicCallbackSecondsAgo: v.optional(v.number()),
      totalChunksSent: v.optional(v.number()),
      isCapturing: v.optional(v.boolean()),
      currentCallId: v.optional(v.string()),
      hasActiveConnection: v.optional(v.boolean()),
      useCoreAudioTap: v.optional(v.boolean()),
      audioDevices: v.optional(v.array(v.object({
        kind: v.optional(v.string()),
        label: v.optional(v.string()),
      }))),
    })),
    websocket: v.optional(v.object({
      connectionState: v.optional(v.string()),
      reconnectionCountThisSession: v.optional(v.number()),
      reconnectAttempt: v.optional(v.number()),
      isReconnecting: v.optional(v.boolean()),
      lastHeartbeatAckSecondsAgo: v.optional(v.number()),
      lastPongSecondsAgo: v.optional(v.number()),
      missedHeartbeatCount: v.optional(v.number()),
      audioServiceUrl: v.optional(v.string()),
      reconnectionHistory: v.optional(v.array(v.object({
        timestamp: v.optional(v.string()),
        reason: v.optional(v.string()),
      }))),
    })),
    call: v.optional(v.object({
      currentCallId: v.optional(v.string()),
      convexCallId: v.optional(v.string()),
      closerId: v.optional(v.string()),
      teamId: v.optional(v.string()),
      recordingState: v.optional(v.string()),
      recordingDuration: v.optional(v.number()),
      timeSinceRecordingStarted: v.optional(v.number()),
    })),
    permissions: v.optional(v.object({
      microphonePermission: v.optional(v.string()),
      screenRecordingPermission: v.optional(v.string()),
    })),
    logs: v.optional(v.object({
      recentLogs: v.optional(v.array(v.object({
        timestamp: v.optional(v.string()),
        level: v.optional(v.string()),
        category: v.optional(v.string()),
        message: v.optional(v.string()),
      }))),
      errorCountLastHour: v.optional(v.number()),
      lastErrorMessage: v.optional(v.string()),
      lastErrorTimestamp: v.optional(v.string()),
    })),
    meetingBot: v.optional(v.object({
      meetingBotEnabled: v.optional(v.boolean()),
      botCallActive: v.optional(v.boolean()),
      activeBotCallId: v.optional(v.string()),
      activeBotId: v.optional(v.string()),
      activeBotMeetingTitle: v.optional(v.string()),
      activeBotProspectName: v.optional(v.string()),
      pendingQuestionnaireCount: v.optional(v.number()),
      showingPostCallQuestionnaire: v.optional(v.boolean()),
      calendarConnected: v.optional(v.boolean()),
      calendarProvider: v.optional(v.string()),
      meetingPlatform: v.optional(v.string()),
      appMode: v.optional(v.string()),
      currentSidebarItem: v.optional(v.string()),
      pollBotStatusActive: v.optional(v.boolean()),
      ammoPanelVisible: v.optional(v.boolean()),
      questionnairePanelVisible: v.optional(v.boolean()),
      firstPendingCallId: v.optional(v.string()),
      firstPendingProspectName: v.optional(v.string()),
      botStatus: v.optional(v.string()),
      botIsScheduled: v.optional(v.boolean()),
      botActiveSeconds: v.optional(v.number()),
      lastBotError: v.optional(v.string()),
      lastBotErrorAt: v.optional(v.string()),
    })),
    ammoPanel: v.optional(v.object({
      ammoItemCount: v.optional(v.number()),
      transcriptSegmentCount: v.optional(v.number()),
      isPolling: v.optional(v.boolean()),
      trackedCallId: v.optional(v.string()),
      isAmmoV2Enabled: v.optional(v.boolean()),
    })),
    api: v.optional(v.object({
      lastApiError: v.optional(v.string()),
      lastApiErrorEndpoint: v.optional(v.string()),
      lastApiErrorAt: v.optional(v.string()),
      apiErrorCountLastHour: v.optional(v.number()),
    })),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("diagnosticReports", args);
    console.log(`[Diagnostics] Stored report ${args.reportId} from ${args.appType || 'unknown'} closer ${args.closerId || 'unknown'}`);
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
