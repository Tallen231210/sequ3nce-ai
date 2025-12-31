import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { api } from "./_generated/api";

// Create a new call record (called by audio processor when call starts)
export const createCall = mutation({
  args: {
    teamId: v.string(),
    closerId: v.string(),
    prospectName: v.optional(v.string()),
    status: v.string(),
    speakerCount: v.number(),
  },
  handler: async (ctx, args) => {
    // SAFETY: Auto-complete any existing active calls for this closer
    // This prevents duplicate calls if connection was lost without proper cleanup
    const activeCallStatuses = ["waiting", "on_call"];
    const existingCalls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId as any))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "waiting"),
          q.eq(q.field("status"), "on_call")
        )
      )
      .collect();

    for (const existingCall of existingCalls) {
      console.log(`[createCall] Auto-completing stale call ${existingCall._id} for closer ${args.closerId}`);
      await ctx.db.patch(existingCall._id, {
        status: "completed",
        endedAt: Date.now(),
        notes: (existingCall.notes || "") + "\n[Auto-completed: new call started]",
      });
    }

    // Now create the new call
    const callId = await ctx.db.insert("calls", {
      teamId: args.teamId as any, // Audio processor passes string ID
      closerId: args.closerId as any,
      prospectName: args.prospectName,
      status: args.status,
      speakerCount: args.speakerCount,
      startedAt: Date.now(),
      createdAt: Date.now(),
    });

    return callId;
  },
});

// End a call when connection is lost (called from desktop app)
export const endCallOnConnectionLost = mutation({
  args: {
    callId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Query the call by ID
    const call = await ctx.db
      .query("calls")
      .filter((q) => q.eq(q.field("_id"), args.callId as any))
      .first();

    if (!call) {
      console.log(`[endCallOnConnectionLost] Call not found: ${args.callId}`);
      return { success: false, error: "Call not found" };
    }

    // Only update if call is still active
    if (call.status === "waiting" || call.status === "on_call") {
      console.log(`[endCallOnConnectionLost] Ending call ${args.callId} due to: ${args.reason}`);
      await ctx.db.patch(call._id, {
        status: "completed",
        endedAt: Date.now(),
        notes: (call.notes || "") + `\n[Connection lost: ${args.reason || "unknown"}]`,
      });
      return { success: true };
    }

    console.log(`[endCallOnConnectionLost] Call ${args.callId} already completed, status: ${call.status}`);
    return { success: true, alreadyCompleted: true };
  },
});

// Update call status (e.g., waiting -> on_call)
export const updateCallStatus = mutation({
  args: {
    callId: v.string(),
    status: v.string(),
    speakerCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId as any, {
      status: args.status,
      speakerCount: args.speakerCount,
    });
  },
});

// Update transcript
export const updateTranscript = mutation({
  args: {
    callId: v.string(),
    transcript: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId as any, {
      transcriptText: args.transcript,
    });
  },
});

// Update AI detection fields (budget, timeline, decision-maker, spouse, objections)
export const updateCallDetection = mutation({
  args: {
    callId: v.string(),
    budgetDiscussion: v.optional(v.object({
      detected: v.boolean(),
      mentionCount: v.number(),
      quotes: v.array(v.string()),
    })),
    timelineUrgency: v.optional(v.object({
      detected: v.boolean(),
      mentionCount: v.number(),
      quotes: v.array(v.string()),
      isUrgent: v.optional(v.string()),
    })),
    decisionMakerDetection: v.optional(v.object({
      detected: v.boolean(),
      mentionCount: v.number(),
      quotes: v.array(v.string()),
      isSoleDecisionMaker: v.optional(v.string()),
    })),
    spousePartnerMentions: v.optional(v.object({
      detected: v.boolean(),
      mentionCount: v.number(),
      quotes: v.array(v.string()),
    })),
    objectionsDetected: v.optional(v.array(v.object({
      type: v.string(),
      quotes: v.array(v.string()),
      timestamp: v.optional(v.number()),
    }))),
  },
  handler: async (ctx, args) => {
    const { callId, ...detectionData } = args;

    // Only include fields that were provided
    const updateData: Record<string, unknown> = {};
    if (detectionData.budgetDiscussion) {
      updateData.budgetDiscussion = detectionData.budgetDiscussion;
    }
    if (detectionData.timelineUrgency) {
      updateData.timelineUrgency = detectionData.timelineUrgency;
    }
    if (detectionData.decisionMakerDetection) {
      updateData.decisionMakerDetection = detectionData.decisionMakerDetection;
    }
    if (detectionData.spousePartnerMentions) {
      updateData.spousePartnerMentions = detectionData.spousePartnerMentions;
    }
    if (detectionData.objectionsDetected) {
      updateData.objectionsDetected = detectionData.objectionsDetected;
    }

    if (Object.keys(updateData).length > 0) {
      await ctx.db.patch(callId as any, updateData);
    }
  },
});

// Add ammo item with scoring
export const addAmmo = mutation({
  args: {
    callId: v.string(),
    teamId: v.string(),
    text: v.string(),
    type: v.string(),
    timestamp: v.optional(v.number()),
    // Scoring fields
    score: v.optional(v.number()),
    repetitionCount: v.optional(v.number()),
    isHeavyHitter: v.optional(v.boolean()),
    categoryId: v.optional(v.string()),
    suggestedUse: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("ammo", {
      callId: args.callId as any,
      teamId: args.teamId as any,
      text: args.text,
      type: args.type,
      timestamp: args.timestamp,
      score: args.score,
      repetitionCount: args.repetitionCount,
      isHeavyHitter: args.isHeavyHitter,
      categoryId: args.categoryId,
      suggestedUse: args.suggestedUse,
      createdAt: Date.now(),
    });
  },
});

// Complete call (when call ends)
export const completeCall = mutation({
  args: {
    callId: v.string(),
    recordingUrl: v.string(),
    transcript: v.string(),
    duration: v.number(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId as any, {
      recordingUrl: args.recordingUrl,
      transcriptText: args.transcript,
      duration: args.duration,
      status: args.status,
      endedAt: Date.now(),
    });
  },
});

// Get calls by team (for dashboard)
export const getCallsByTeam = query({
  args: {
    teamId: v.id("teams"),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("calls")
        .withIndex("by_team_and_status", (q) =>
          q.eq("teamId", args.teamId).eq("status", args.status!)
        )
        .order("desc")
        .take(100);
    }

    return await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(100);
  },
});

// Get dashboard stats (calls today, live now, close rate, no-shows)
export const getDashboardStats = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();

    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Get all calls for this team
    const allCalls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    // Calls today (any call that started today)
    const callsToday = allCalls.filter(
      (call) => call.startedAt && call.startedAt >= todayStartMs
    ).length;

    // Live calls (waiting or on_call status)
    const liveNow = allCalls.filter(
      (call) => call.status === "waiting" || call.status === "on_call"
    ).length;

    // Calls from last 7 days with outcomes
    const weekCalls = allCalls.filter(
      (call) =>
        call.startedAt &&
        call.startedAt >= weekAgo &&
        call.outcome != null
    );

    // Close rate calculation
    const closedCalls = weekCalls.filter(
      (call) => call.outcome === "closed"
    ).length;
    const totalOutcomeCalls = weekCalls.length;
    const closeRateWeek =
      totalOutcomeCalls > 0
        ? Math.round((closedCalls / totalOutcomeCalls) * 100)
        : 0;

    // No-shows this week
    const noShowsWeek = weekCalls.filter(
      (call) => call.outcome === "no_show"
    ).length;

    return {
      callsToday,
      liveNow,
      closeRateWeek,
      noShowsWeek,
    };
  },
});

// Get recent completed calls with closer info (for dashboard - limited to 5)
export const getRecentCompletedCalls = query({
  args: {
    teamId: v.id("teams"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 5;

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "completed")
      )
      .order("desc")
      .take(limit * 2); // Get extra in case some don't have outcomes

    // Filter to only include calls that have an outcome (questionnaire completed)
    const callsWithOutcome = calls.filter((call) => call.outcome != null).slice(0, limit);

    // Fetch closer info for each call
    const callsWithCloser = await Promise.all(
      callsWithOutcome.map(async (call) => {
        const closer = await ctx.db.get(call.closerId);
        return {
          ...call,
          closerName: closer?.name || "Unknown",
          closerInitials: closer?.name
            ? closer.name
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)
            : "??",
        };
      })
    );

    return callsWithCloser;
  },
});

// Get completed calls with closer info (for completed calls list)
export const getCompletedCallsWithCloser = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "completed")
      )
      .order("desc")
      .take(100);

    // Filter to only include calls that have an outcome (questionnaire completed)
    const callsWithOutcome = calls.filter((call) => call.outcome != null);

    // Fetch closer info for each call
    const callsWithCloser = await Promise.all(
      callsWithOutcome.map(async (call) => {
        const closer = await ctx.db.get(call.closerId);
        return {
          ...call,
          closerName: closer?.name || "Unknown",
          closerInitials: closer?.name
            ? closer.name
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)
            : "??",
        };
      })
    );

    return callsWithCloser;
  },
});

// Get live calls (waiting or on_call)
export const getLiveCalls = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const waitingCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "waiting")
      )
      .collect();

    const onCallCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "on_call")
      )
      .collect();

    return [...waitingCalls, ...onCallCalls];
  },
});

// Get call by ID with ammo
export const getCallWithAmmo = query({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;

    const ammo = await ctx.db
      .query("ammo")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();

    return { ...call, ammo };
  },
});

// Get ammo for a call
export const getAmmoByCall = query({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ammo")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
  },
});

// Get full call details with closer info (for call detail page)
export const getCallDetails = query({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;

    // Get closer info
    const closer = await ctx.db.get(call.closerId);

    // Get team info
    const team = await ctx.db.get(call.teamId);

    // Get ammo for this call
    const ammo = await ctx.db
      .query("ammo")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();

    // Get transcript segments (these have accurate timestamps from the audio processor)
    const transcriptSegments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_call_and_time", (q) => q.eq("callId", args.callId))
      .order("asc")
      .collect();

    return {
      ...call,
      closer: closer ? { name: closer.name, email: closer.email } : null,
      teamName: team?.name || null,
      ammo,
      transcriptSegments,
    };
  },
});

// Update talk-to-listen ratio (called periodically during call by audio processor)
export const updateTalkTime = mutation({
  args: {
    callId: v.string(),
    closerTalkTime: v.number(),
    prospectTalkTime: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId as any, {
      closerTalkTime: args.closerTalkTime,
      prospectTalkTime: args.prospectTalkTime,
    });
  },
});

// Add a transcript segment (for live streaming)
export const addTranscriptSegment = mutation({
  args: {
    callId: v.string(),
    teamId: v.string(),
    speaker: v.string(),
    text: v.string(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("transcriptSegments", {
      callId: args.callId as any,
      teamId: args.teamId as any,
      speaker: args.speaker,
      text: args.text,
      timestamp: args.timestamp,
      createdAt: Date.now(),
    });
  },
});

// Get transcript segments for a call (for live streaming)
export const getTranscriptSegments = query({
  args: {
    callId: v.id("calls"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 2000;
    return await ctx.db
      .query("transcriptSegments")
      .withIndex("by_call_and_time", (q) => q.eq("callId", args.callId))
      .order("asc")
      .take(limit);
  },
});

// Get live calls with full details (closer info, latest ammo, transcript segments)
export const getLiveCallsWithDetails = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const waitingCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "waiting")
      )
      .collect();

    const onCallCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "on_call")
      )
      .collect();

    const allCalls = [...waitingCalls, ...onCallCalls];

    // Fetch details for each call
    const callsWithDetails = await Promise.all(
      allCalls.map(async (call) => {
        // Get closer info
        const closer = await ctx.db.get(call.closerId);

        // Get ammo for this call (sorted by timestamp)
        const ammo = await ctx.db
          .query("ammo")
          .withIndex("by_call", (q) => q.eq("callId", call._id))
          .collect();

        // Get transcript segments (up to 2000 for long calls)
        const transcriptSegments = await ctx.db
          .query("transcriptSegments")
          .withIndex("by_call_and_time", (q) => q.eq("callId", call._id))
          .order("asc")
          .take(2000);

        return {
          ...call,
          closerName: closer?.name || "Unknown",
          closerInitials: closer?.name
            ? closer.name
                .split(" ")
                .map((n: string) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)
            : "??",
          ammo: ammo.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
          transcriptSegments,
        };
      })
    );

    return callsWithDetails;
  },
});

// Update call outcome (called from desktop app after call ends)
export const updateCallOutcome = mutation({
  args: {
    callId: v.id("calls"),
    outcome: v.string(),
    dealValue: v.optional(v.number()), // Legacy - kept for backward compat
    cashCollected: v.optional(v.number()), // Amount paid on the call
    contractValue: v.optional(v.number()), // Total contract commitment
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      outcome: args.outcome,
      dealValue: args.dealValue,
      cashCollected: args.cashCollected,
      contractValue: args.contractValue,
    });
  },
});

// Complete call with post-call questionnaire data (called from desktop app)
export const completeCallWithOutcome = mutation({
  args: {
    callId: v.id("calls"),
    prospectName: v.string(),
    outcome: v.string(), // "closed", "follow_up", "lost", "no_show"
    dealValue: v.optional(v.number()), // Legacy - kept for backward compat
    cashCollected: v.optional(v.number()), // Amount paid on the call
    contractValue: v.optional(v.number()), // Total contract commitment
    notes: v.optional(v.string()),
    // Enhanced questionnaire fields
    primaryObjection: v.optional(v.string()), // Selected objection from dropdown
    primaryObjectionOther: v.optional(v.string()), // Free text if "Other" was selected
    leadQualityScore: v.optional(v.number()), // 1-10 rating
    prospectWasDecisionMaker: v.optional(v.string()), // "yes" | "no" | "unclear"
  },
  handler: async (ctx, args) => {
    // Get the call to access the transcript
    const call = await ctx.db.get(args.callId);

    await ctx.db.patch(args.callId, {
      prospectName: args.prospectName,
      outcome: args.outcome,
      dealValue: args.dealValue,
      cashCollected: args.cashCollected,
      contractValue: args.contractValue,
      notes: args.notes,
      // Enhanced questionnaire fields
      primaryObjection: args.primaryObjection,
      primaryObjectionOther: args.primaryObjectionOther,
      leadQualityScore: args.leadQualityScore,
      prospectWasDecisionMaker: args.prospectWasDecisionMaker,
      status: "completed",
      completedAt: Date.now(),
    });

    // Schedule AI summary generation (runs async, doesn't block completion)
    if (call?.transcriptText) {
      await ctx.scheduler.runAfter(0, api.ai.generateCallSummary, {
        callId: args.callId,
        transcript: call.transcriptText,
        outcome: args.outcome,
        prospectName: args.prospectName,
      });
    }

    return { success: true };
  },
});

// Update call data (for manager edits from web dashboard)
export const updateCallData = mutation({
  args: {
    callId: v.id("calls"),
    prospectName: v.optional(v.string()),
    outcome: v.optional(v.string()),
    dealValue: v.optional(v.number()), // Legacy - kept for backward compat
    cashCollected: v.optional(v.number()), // Amount paid on the call
    contractValue: v.optional(v.number()), // Total contract commitment
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {};

    if (args.prospectName !== undefined) {
      updates.prospectName = args.prospectName;
    }
    if (args.outcome !== undefined) {
      updates.outcome = args.outcome;
    }
    if (args.dealValue !== undefined) {
      updates.dealValue = args.dealValue;
    }
    if (args.cashCollected !== undefined) {
      updates.cashCollected = args.cashCollected;
    }
    if (args.contractValue !== undefined) {
      updates.contractValue = args.contractValue;
    }
    if (args.notes !== undefined) {
      updates.notes = args.notes;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.callId, updates);
    }

    return { success: true };
  },
});

// Seed test call data (for development only) - auto-discovers team and closer
export const seedTestCallAuto = mutation({
  args: {},
  handler: async (ctx) => {
    // Get the first team
    const team = await ctx.db.query("teams").first();
    if (!team) {
      throw new Error("No team found. Please create a team first.");
    }

    // Get a closer for this team, or create one if none exists
    let closer = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .first();

    if (!closer) {
      // Create a test closer
      const closerId = await ctx.db.insert("closers", {
        email: "test@example.com",
        name: "Test Closer",
        teamId: team._id,
        status: "active",
        calendarConnected: false,
        invitedAt: Date.now(),
        activatedAt: Date.now(),
      });
      closer = await ctx.db.get(closerId);
    }

    if (!closer) {
      throw new Error("Failed to create closer");
    }

    const now = Date.now();
    const callDuration = 1847;

    const callId = await ctx.db.insert("calls", {
      teamId: team._id,
      closerId: closer._id,
      prospectName: "Sarah Mitchell",
      status: "completed",
      outcome: "closed",
      dealValue: 12000,
      startedAt: now - callDuration * 1000,
      endedAt: now,
      duration: callDuration,
      speakerCount: 2,
      recordingUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      closerTalkTime: 600, // ~10 minutes talk time
      prospectTalkTime: 1247, // ~21 minutes talk time (prospect talked more - good!)
      speakerMapping: {
        closerSpeaker: "speaker_0", // Speaker 1 = Closer
        confirmed: true,
      },
      transcriptText: `[00:00:05] Speaker 1: Hi Sarah, thanks for taking the time to chat with me today. How are you doing?

[00:00:12] Speaker 2: I'm doing well, thanks for asking. I've actually been looking forward to this call. I've been thinking about this for months now.

[00:00:25] Speaker 1: That's great to hear! So tell me a little bit about what's been going on and what brought you to us.

[00:00:35] Speaker 2: Well, honestly, I've been struggling with my business for the past year. The stress has been overwhelming and I feel like I'm working 70 hours a week but not seeing the results I want.

[00:01:02] Speaker 1: I completely understand. That sounds really challenging. What would it mean for you if you could cut that down to 40 hours and actually see growth?

[00:01:15] Speaker 2: Oh my god, that would be life-changing. I haven't taken a vacation in two years. My kids barely see me. I just want my life back.

[00:01:45] Speaker 2: Money isn't really the issue here. It's more that I've been burned before by coaches who promised the world and delivered nothing.

[00:02:15] Speaker 2: Last year I spent $5,000 on a program that was just recycled YouTube content. No personalization, no support. I felt like such an idiot.

[00:03:00] Speaker 2: I appreciate that. What I really need is someone who can help me systematize my business so it doesn't depend on me for everything.

[00:04:05] Speaker 2: Honestly? I'm at a 9. I can't keep going like this. Something has to change.

[00:05:10] Speaker 2: You know what, yes. Let's do it. I'm ready to make this change.`,
      createdAt: now - callDuration * 1000,
    });

    // Add ammo items
    const ammoItems = [
      { text: "I've been thinking about this for months now", type: "commitment", timestamp: 12 },
      { text: "The stress has been overwhelming and I feel like I'm working 70 hours a week", type: "pain_point", timestamp: 35 },
      { text: "I haven't taken a vacation in two years. My kids barely see me. I just want my life back.", type: "emotional", timestamp: 75 },
      { text: "Money isn't really the issue here", type: "budget", timestamp: 105 },
      { text: "I've been burned before by coaches who promised the world and delivered nothing", type: "objection_preview", timestamp: 105 },
      { text: "I'm at a 9. I can't keep going like this. Something has to change.", type: "urgency", timestamp: 245 },
    ];

    for (const ammo of ammoItems) {
      await ctx.db.insert("ammo", {
        callId,
        teamId: team._id,
        text: ammo.text,
        type: ammo.type,
        timestamp: ammo.timestamp,
        createdAt: now,
      });
    }

    return { callId, teamId: team._id, closerId: closer._id };
  },
});

// Seed test call data (for development only)
export const seedTestCall = mutation({
  args: {
    teamId: v.id("teams"),
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const callDuration = 1847; // ~31 minutes

    // Create the call
    const callId = await ctx.db.insert("calls", {
      teamId: args.teamId,
      closerId: args.closerId,
      prospectName: "Sarah Mitchell",
      status: "completed",
      outcome: "closed",
      dealValue: 12000,
      startedAt: now - callDuration * 1000,
      endedAt: now,
      duration: callDuration,
      speakerCount: 2,
      recordingUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3", // Sample audio for testing
      transcriptText: `[00:00:05] Speaker 1: Hi Sarah, thanks for taking the time to chat with me today. How are you doing?

[00:00:12] Speaker 2: I'm doing well, thanks for asking. I've actually been looking forward to this call. I've been thinking about this for months now.

[00:00:25] Speaker 1: That's great to hear! So tell me a little bit about what's been going on and what brought you to us.

[00:00:35] Speaker 2: Well, honestly, I've been struggling with my business for the past year. The stress has been overwhelming and I feel like I'm working 70 hours a week but not seeing the results I want.

[00:01:02] Speaker 1: I completely understand. That sounds really challenging. What would it mean for you if you could cut that down to 40 hours and actually see growth?

[00:01:15] Speaker 2: Oh my god, that would be life-changing. I haven't taken a vacation in two years. My kids barely see me. I just want my life back.

[00:01:35] Speaker 1: I hear you. And what's held you back from making a change before now?

[00:01:45] Speaker 2: Money isn't really the issue here. It's more that I've been burned before by coaches who promised the world and delivered nothing.

[00:02:05] Speaker 1: That's a valid concern. Can you tell me more about that experience?

[00:02:15] Speaker 2: Last year I spent $5,000 on a program that was just recycled YouTube content. No personalization, no support. I felt like such an idiot.

[00:02:35] Speaker 1: I'm sorry you went through that. That's not what we do here. Let me explain how our program is different...

[00:03:00] Speaker 2: I appreciate that. What I really need is someone who can help me systematize my business so it doesn't depend on me for everything.

[00:03:20] Speaker 1: Exactly. That's precisely what we specialize in. Our clients typically see a 40% reduction in their working hours within the first 90 days.

[00:03:40] Speaker 2: That sounds almost too good to be true. What's the investment for something like this?

[00:03:50] Speaker 1: Before we get to that, I want to make sure this is the right fit. On a scale of 1-10, how committed are you to making a change right now?

[00:04:05] Speaker 2: Honestly? I'm at a 9. I can't keep going like this. Something has to change.

[00:04:20] Speaker 1: I love that energy. The program is $12,000 for the full six months, which includes weekly coaching calls, our entire course library, and unlimited email support.

[00:04:40] Speaker 2: That's definitely an investment, but if it works, it would pay for itself many times over.

[00:04:55] Speaker 1: Absolutely. Most of our clients see ROI within the first 60 days. Would you like to move forward today?

[00:05:10] Speaker 2: You know what, yes. Let's do it. I'm ready to make this change.`,
      createdAt: now - callDuration * 1000,
    });

    // Add ammo items
    await ctx.db.insert("ammo", {
      callId,
      teamId: args.teamId,
      text: "I've been thinking about this for months now",
      type: "commitment",
      timestamp: 12,
      createdAt: now,
    });

    await ctx.db.insert("ammo", {
      callId,
      teamId: args.teamId,
      text: "The stress has been overwhelming and I feel like I'm working 70 hours a week",
      type: "pain_point",
      timestamp: 35,
      createdAt: now,
    });

    await ctx.db.insert("ammo", {
      callId,
      teamId: args.teamId,
      text: "I haven't taken a vacation in two years. My kids barely see me. I just want my life back.",
      type: "emotional",
      timestamp: 75,
      createdAt: now,
    });

    await ctx.db.insert("ammo", {
      callId,
      teamId: args.teamId,
      text: "Money isn't really the issue here",
      type: "budget",
      timestamp: 105,
      createdAt: now,
    });

    await ctx.db.insert("ammo", {
      callId,
      teamId: args.teamId,
      text: "I've been burned before by coaches who promised the world and delivered nothing",
      type: "objection_preview",
      timestamp: 105,
      createdAt: now,
    });

    await ctx.db.insert("ammo", {
      callId,
      teamId: args.teamId,
      text: "I'm at a 9. I can't keep going like this. Something has to change.",
      type: "urgency",
      timestamp: 245,
      createdAt: now,
    });

    return callId;
  },
});

// Seed live call test data (for development only) - creates active calls with talk ratio and transcript
export const seedLiveCallsTest = mutation({
  args: {},
  handler: async (ctx) => {
    // Get the first team
    const team = await ctx.db.query("teams").first();
    if (!team) {
      throw new Error("No team found. Please create a team first.");
    }

    // Get closers for this team, or create them if we need more
    let closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();

    // Need at least 3 closers for this test
    if (closers.length < 3) {
      // Create test closers
      const closerData = [
        { name: "Mike Johnson", email: "mike@example.com" },
        { name: "Sarah Chen", email: "sarah@example.com" },
        { name: "David Park", email: "david@example.com" },
        { name: "Emily Davis", email: "emily@example.com" },
        { name: "James Wilson", email: "james@example.com" },
      ];

      for (const closer of closerData) {
        // Check if closer already exists by email
        const existing = await ctx.db.query("closers").withIndex("by_email", (q) => q.eq("email", closer.email)).first();
        if (!existing) {
          await ctx.db.insert("closers", {
            email: closer.email,
            name: closer.name,
            teamId: team._id,
            status: "active",
            calendarConnected: false,
            invitedAt: Date.now(),
            activatedAt: Date.now(),
          });
        }
      }

      closers = await ctx.db
        .query("closers")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();
    }

    const now = Date.now();
    const createdCallIds: string[] = [];

    // Call 1: Active call with good talk ratio (prospect talking more) - 8 minutes in
    const call1StartTime = now - 8 * 60 * 1000; // 8 minutes ago
    const call1Id = await ctx.db.insert("calls", {
      teamId: team._id,
      closerId: closers[0]._id,
      prospectName: "Jennifer Martinez",
      status: "on_call",
      speakerCount: 2,
      startedAt: call1StartTime,
      closerTalkTime: 180, // 3 minutes
      prospectTalkTime: 300, // 5 minutes
      speakerMapping: {
        closerSpeaker: "speaker_0", // Speaker 1 = Closer (confirmed)
        confirmed: true,
      },
      createdAt: call1StartTime,
    });
    createdCallIds.push(call1Id);

    // Add transcript segments for call 1
    const call1Segments = [
      { speaker: "closer", text: "Hi Jennifer, thanks for hopping on today. How are you doing?", timestamp: 5 },
      { speaker: "prospect", text: "I'm doing okay, thanks. Been a crazy week but I'm hanging in there.", timestamp: 15 },
      { speaker: "closer", text: "I hear you. So tell me a bit about what's going on with your business right now.", timestamp: 25 },
      { speaker: "prospect", text: "Well honestly, I've been stuck at the same revenue level for about 18 months now. No matter what I try, I can't seem to break through.", timestamp: 35 },
      { speaker: "prospect", text: "I've tried hiring VAs, running more ads, even raised my prices... but nothing seems to move the needle.", timestamp: 55 },
      { speaker: "closer", text: "That sounds frustrating. What would it mean for you if you could finally break through that ceiling?", timestamp: 75 },
      { speaker: "prospect", text: "Oh man, it would change everything. I could finally pay myself a real salary. Maybe even take a vacation.", timestamp: 85 },
      { speaker: "prospect", text: "My husband keeps asking when things are going to get better. I don't know what to tell him anymore.", timestamp: 105 },
      { speaker: "closer", text: "I can hear how much pressure you're under. Tell me more about what you've already tried.", timestamp: 125 },
      { speaker: "prospect", text: "I spent $15,000 on a marketing agency last year. Complete waste of money.", timestamp: 140 },
      { speaker: "prospect", text: "They promised me 50 leads a month and I maybe got 10. And none of them converted.", timestamp: 160 },
      { speaker: "closer", text: "That's rough. What do you think went wrong there?", timestamp: 180 },
      { speaker: "prospect", text: "I think they just didn't understand my audience. Everything felt generic.", timestamp: 195 },
    ];

    for (const segment of call1Segments) {
      await ctx.db.insert("transcriptSegments", {
        callId: call1Id,
        teamId: team._id,
        speaker: segment.speaker,
        text: segment.text,
        timestamp: segment.timestamp,
        createdAt: call1StartTime + segment.timestamp * 1000,
      });
    }

    // Add ammo for call 1
    const call1Ammo = [
      { text: "I've been stuck at the same revenue level for about 18 months now", type: "pain_point", timestamp: 35 },
      { text: "My husband keeps asking when things are going to get better. I don't know what to tell him anymore.", type: "emotional", timestamp: 105 },
      { text: "I spent $15,000 on a marketing agency last year. Complete waste of money.", type: "budget", timestamp: 140 },
    ];

    for (const ammo of call1Ammo) {
      await ctx.db.insert("ammo", {
        callId: call1Id,
        teamId: team._id,
        text: ammo.text,
        type: ammo.type,
        timestamp: ammo.timestamp,
        createdAt: now,
      });
    }

    // Call 2: Call where closer is talking too much - 12 minutes in
    const call2StartTime = now - 12 * 60 * 1000; // 12 minutes ago
    const call2Id = await ctx.db.insert("calls", {
      teamId: team._id,
      closerId: closers[1]._id,
      prospectName: "Robert Thompson",
      status: "on_call",
      speakerCount: 2,
      startedAt: call2StartTime,
      closerTalkTime: 480, // 8 minutes (too much!)
      prospectTalkTime: 240, // 4 minutes
      speakerMapping: {
        closerSpeaker: "speaker_0", // Speaker 1 = Closer (not yet confirmed)
        confirmed: false,
      },
      createdAt: call2StartTime,
    });
    createdCallIds.push(call2Id);

    // Add transcript segments for call 2
    const call2Segments = [
      { speaker: "closer", text: "Robert, great to connect with you today. Let me tell you a bit about what we do here.", timestamp: 10 },
      { speaker: "closer", text: "We've helped over 200 businesses scale past 7 figures using our proprietary system.", timestamp: 25 },
      { speaker: "prospect", text: "That sounds interesting. How long does it usually take?", timestamp: 45 },
      { speaker: "closer", text: "Great question. So our program is 12 weeks, and in that time we cover lead generation, sales systems, fulfillment optimization...", timestamp: 55 },
      { speaker: "closer", text: "...and then we also do weekly coaching calls, plus you get access to our private community.", timestamp: 75 },
      { speaker: "prospect", text: "Okay, what does it cost?", timestamp: 95 },
      { speaker: "closer", text: "Before I get into that, let me explain the full value you're getting. So the course alone is worth $10,000...", timestamp: 105 },
      { speaker: "prospect", text: "I really just need to know the price. I'm on a tight budget.", timestamp: 145 },
    ];

    for (const segment of call2Segments) {
      await ctx.db.insert("transcriptSegments", {
        callId: call2Id,
        teamId: team._id,
        speaker: segment.speaker,
        text: segment.text,
        timestamp: segment.timestamp,
        createdAt: call2StartTime + segment.timestamp * 1000,
      });
    }

    // Add ammo for call 2
    const call2Ammo = [
      { text: "I'm on a tight budget", type: "budget", timestamp: 145 },
    ];

    for (const ammo of call2Ammo) {
      await ctx.db.insert("ammo", {
        callId: call2Id,
        teamId: team._id,
        text: ammo.text,
        type: ammo.type,
        timestamp: ammo.timestamp,
        createdAt: now,
      });
    }

    // Call 3: Waiting room - prospect hasn't joined yet - 2 minutes waiting
    const call3StartTime = now - 2 * 60 * 1000; // 2 minutes ago
    const call3Id = await ctx.db.insert("calls", {
      teamId: team._id,
      closerId: closers[2]._id,
      prospectName: "Amanda Wilson",
      status: "waiting",
      speakerCount: 1,
      startedAt: call3StartTime,
      createdAt: call3StartTime,
    });
    createdCallIds.push(call3Id);

    // Call 4: Just started, balanced talk ratio - 3 minutes in
    const call4StartTime = now - 3 * 60 * 1000; // 3 minutes ago
    const call4Id = await ctx.db.insert("calls", {
      teamId: team._id,
      closerId: closers[0]._id,
      prospectName: "Chris Anderson",
      status: "on_call",
      speakerCount: 2,
      startedAt: call4StartTime,
      closerTalkTime: 85, // ~1.5 minutes
      prospectTalkTime: 95, // ~1.5 minutes
      speakerMapping: {
        closerSpeaker: "speaker_0", // Speaker 1 = Closer (confirmed)
        confirmed: true,
      },
      createdAt: call4StartTime,
    });
    createdCallIds.push(call4Id);

    // Add transcript segments for call 4
    const call4Segments = [
      { speaker: "closer", text: "Hey Chris! Good to meet you. How's your day going?", timestamp: 5 },
      { speaker: "prospect", text: "Pretty good, thanks. Busy as always but excited to chat.", timestamp: 12 },
      { speaker: "closer", text: "Awesome. So what prompted you to book this call today?", timestamp: 22 },
      { speaker: "prospect", text: "I saw your ad about scaling coaching businesses. I'm at about $30k/month right now and want to get to $100k.", timestamp: 32 },
      { speaker: "closer", text: "Nice! $30k is a great foundation. What's been the biggest bottleneck for you?", timestamp: 52 },
      { speaker: "prospect", text: "Honestly, I'm doing everything myself. Sales, delivery, content... I'm burned out.", timestamp: 65 },
    ];

    for (const segment of call4Segments) {
      await ctx.db.insert("transcriptSegments", {
        callId: call4Id,
        teamId: team._id,
        speaker: segment.speaker,
        text: segment.text,
        timestamp: segment.timestamp,
        createdAt: call4StartTime + segment.timestamp * 1000,
      });
    }

    // Add ammo for call 4
    const call4Ammo = [
      { text: "I'm at about $30k/month right now and want to get to $100k", type: "commitment", timestamp: 32 },
      { text: "I'm doing everything myself. Sales, delivery, content... I'm burned out.", type: "pain_point", timestamp: 65 },
    ];

    for (const ammo of call4Ammo) {
      await ctx.db.insert("ammo", {
        callId: call4Id,
        teamId: team._id,
        text: ammo.text,
        type: ammo.type,
        timestamp: ammo.timestamp,
        createdAt: now,
      });
    }

    return {
      message: "Created 4 test live calls",
      callIds: createdCallIds,
      teamId: team._id,
    };
  },
});

// Set initial speaker mapping (auto-detected by audio processor)
// Called when 2 speakers are detected to trigger identification popup in desktop
// Note: closerSnippet for the popup is computed dynamically from transcript segments
export const setSpeakerMapping = mutation({
  args: {
    callId: v.string(), // String ID from audio processor
    closerSpeaker: v.string(), // "speaker_0" or "speaker_1"
    sampleText: v.optional(v.string()), // Optional - not stored, snippet is computed from transcript
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId as any, {
      speakerMapping: {
        closerSpeaker: args.closerSpeaker,
        confirmed: false,
      },
    });
  },
});

// Confirm speaker mapping (closer confirms auto-detection was correct)
export const confirmSpeakerMapping = mutation({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || !call.speakerMapping) return;

    await ctx.db.patch(args.callId, {
      speakerMapping: {
        ...call.speakerMapping,
        confirmed: true,
      },
    });
  },
});

// Swap speaker mapping (closer indicates auto-detection was wrong)
export const swapSpeakerMapping = mutation({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || !call.speakerMapping) return;

    // Swap the speaker assignment
    const currentCloser = call.speakerMapping.closerSpeaker;
    const newCloser = currentCloser === "speaker_0" ? "speaker_1" : "speaker_0";

    await ctx.db.patch(args.callId, {
      speakerMapping: {
        closerSpeaker: newCloser,
        confirmed: true, // User confirmed by swapping
      },
    });

    // Also swap the talk time values so they're accurate
    if (call.closerTalkTime !== undefined && call.prospectTalkTime !== undefined) {
      await ctx.db.patch(args.callId, {
        closerTalkTime: call.prospectTalkTime,
        prospectTalkTime: call.closerTalkTime,
      });
    }
  },
});

// Get speaker mapping for a call (used by audio processor to sync after swap)
export const getSpeakerMappingForCall = query({
  args: {
    callId: v.string(),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId as any);
    if (!call || !call.speakerMapping) return null;
    return call.speakerMapping;
  },
});

// Update prospect name on an existing call (from desktop app inline prompt)
export const updateProspectName = mutation({
  args: {
    callId: v.id("calls"),
    prospectName: v.string(),
    scheduledCallId: v.optional(v.id("scheduledCalls")),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {
      prospectName: args.prospectName,
    };

    // Link to scheduled call if provided
    if (args.scheduledCallId) {
      updates.scheduledCallId = args.scheduledCallId;
    }

    await ctx.db.patch(args.callId, updates);
    return { success: true };
  },
});

// Find a matching scheduled call for a closer within ±15 minutes of now
// Calendar-agnostic: works with any calendar source (Calendly, Google, manual)
export const findMatchingScheduledCall = query({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const fifteenMinutes = 15 * 60 * 1000;
    const windowStart = now - fifteenMinutes;
    const windowEnd = now + fifteenMinutes;

    // Get scheduled calls for this team within the time window
    const scheduledCalls = await ctx.db
      .query("scheduledCalls")
      .withIndex("by_team_and_date", (q) => q.eq("teamId", args.teamId))
      .filter((q) =>
        q.and(
          q.gte(q.field("scheduledAt"), windowStart),
          q.lte(q.field("scheduledAt"), windowEnd),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .collect();

    // Filter to calls assigned to this closer, or unassigned calls
    const matchingCalls = scheduledCalls.filter(
      (call) => call.closerId === args.closerId || !call.closerId
    );

    if (matchingCalls.length === 0) {
      return null;
    }

    // If multiple matches, pick the one closest to current time
    const sortedByProximity = matchingCalls.sort((a, b) => {
      const diffA = Math.abs(a.scheduledAt - now);
      const diffB = Math.abs(b.scheduledAt - now);
      return diffA - diffB;
    });

    const bestMatch = sortedByProximity[0];

    return {
      scheduledCallId: bestMatch._id,
      prospectName: bestMatch.prospectName || null,
      prospectEmail: bestMatch.prospectEmail || null,
      scheduledAt: bestMatch.scheduledAt,
      source: bestMatch.source || "manual",
    };
  },
});

// Update call notes (from desktop app during call)
export const updateCallNotes = mutation({
  args: {
    callId: v.id("calls"),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      notes: args.notes,
    });
    return { success: true };
  },
});

// Clean up ALL test calls - deletes everything
export const cleanupLiveCalls = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all calls and delete them all
    const allCalls = await ctx.db.query("calls").collect();

    let deleted = 0;
    for (const call of allCalls) {
      // Delete associated ammo
      const ammo = await ctx.db
        .query("ammo")
        .withIndex("by_call", (q) => q.eq("callId", call._id))
        .collect();
      for (const a of ammo) {
        await ctx.db.delete(a._id);
      }

      // Delete associated transcript segments
      const segments = await ctx.db
        .query("transcriptSegments")
        .withIndex("by_call", (q) => q.eq("callId", call._id))
        .collect();
      for (const s of segments) {
        await ctx.db.delete(s._id);
      }

      // Delete the call
      await ctx.db.delete(call._id);
      deleted++;
    }

    return { deleted };
  },
});

// NUCLEAR OPTION: Delete everything - new function name to force Convex to pick it up
export const nukeAllTestData = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all calls
    const allCalls = await ctx.db.query("calls").collect();

    let deletedCalls = 0;
    let deletedAmmo = 0;
    let deletedSegments = 0;

    for (const call of allCalls) {
      // Delete associated ammo
      const ammo = await ctx.db
        .query("ammo")
        .withIndex("by_call", (q) => q.eq("callId", call._id))
        .collect();
      for (const a of ammo) {
        await ctx.db.delete(a._id);
        deletedAmmo++;
      }

      // Delete associated transcript segments
      const segments = await ctx.db
        .query("transcriptSegments")
        .withIndex("by_call", (q) => q.eq("callId", call._id))
        .collect();
      for (const s of segments) {
        await ctx.db.delete(s._id);
        deletedSegments++;
      }

      // Delete the call
      await ctx.db.delete(call._id);
      deletedCalls++;
    }

    return { deletedCalls, deletedAmmo, deletedSegments };
  },
});

// Internal mutation to update call summary (called by AI action)
export const updateCallSummary = internalMutation({
  args: {
    callId: v.id("calls"),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      summary: args.summary,
    });
  },
});

// Delete a call and all associated data (for admin use - removes accidental calls from stats)
export const deleteCall = mutation({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    // Get the call to verify it exists
    const call = await ctx.db.get(args.callId);
    if (!call) {
      return { success: false, error: "Call not found" };
    }

    let deletedAmmo = 0;
    let deletedSegments = 0;
    let deletedObjections = 0;
    let deletedHighlights = 0;

    // Delete associated ammo
    const ammo = await ctx.db
      .query("ammo")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    for (const a of ammo) {
      await ctx.db.delete(a._id);
      deletedAmmo++;
    }

    // Delete associated transcript segments
    const segments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    for (const s of segments) {
      await ctx.db.delete(s._id);
      deletedSegments++;
    }

    // Delete associated objections
    const objections = await ctx.db
      .query("objections")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    for (const o of objections) {
      await ctx.db.delete(o._id);
      deletedObjections++;
    }

    // Delete associated highlights (saved to playbook)
    const highlights = await ctx.db
      .query("highlights")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    for (const h of highlights) {
      await ctx.db.delete(h._id);
      deletedHighlights++;
    }

    // Delete the call itself
    await ctx.db.delete(args.callId);

    return {
      success: true,
      deleted: {
        call: 1,
        ammo: deletedAmmo,
        transcriptSegments: deletedSegments,
        objections: deletedObjections,
        highlights: deletedHighlights,
      },
    };
  },
});

// ============================================
// SMART NUDGES
// ============================================

// Add a new nudge (called by audio processor)
export const addNudge = mutation({
  args: {
    callId: v.string(),
    teamId: v.string(),
    type: v.string(), // "dig_deeper" | "missing_info" | "script_reminder" | "objection_warning"
    message: v.string(),
    detail: v.optional(v.string()),
    triggeredBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nudgeId = await ctx.db.insert("nudges", {
      callId: args.callId as any,
      teamId: args.teamId as any,
      type: args.type,
      message: args.message,
      detail: args.detail,
      triggeredBy: args.triggeredBy,
      status: "active",
      createdAt: Date.now(),
    });
    return nudgeId;
  },
});

// Get active nudges for a call (for desktop app polling)
export const getNudgesByCall = query({
  args: {
    callId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all nudges for this call, ordered by creation time
    const nudges = await ctx.db
      .query("nudges")
      .withIndex("by_call", (q) => q.eq("callId", args.callId as any))
      .order("desc")
      .take(50);

    return nudges;
  },
});

// Update nudge status (save or dismiss)
export const updateNudgeStatus = mutation({
  args: {
    nudgeId: v.id("nudges"),
    status: v.string(), // "saved" | "dismissed"
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.nudgeId, {
      status: args.status,
    });
  },
});

// ============================================
// COMPREHENSIVE TEST DATA SEEDING
// ============================================

const SEED_CLOSER_NAMES = [
  { name: "Marcus Johnson", email: "marcus@example.com" },
  { name: "Sarah Chen", email: "sarah@example.com" },
  { name: "David Rodriguez", email: "david@example.com" },
  { name: "Emily Thompson", email: "emily@example.com" },
  { name: "James Wilson", email: "james@example.com" },
];

const SEED_PROSPECT_NAMES = [
  "John Smith", "Maria Garcia", "Robert Brown", "Lisa Davis", "Michael Miller",
  "Jennifer Taylor", "William Anderson", "Patricia Thomas", "Richard Jackson", "Linda White",
  "Charles Harris", "Barbara Martin", "Joseph Thompson", "Susan Robinson", "Daniel Clark",
];

const SEED_OBJECTIONS = ["spouse_partner", "price_money", "timing", "need_to_think", "not_qualified", "logistics", "competitor"];

const SEED_SUMMARIES = [
  "Strong discovery call. Prospect identified clear pain points around scaling challenges. Budget confirmed at $8,000. Decision maker present. Main hesitation was timing due to upcoming product launch.",
  "Good call with qualified lead. Objection around price handled well. Prospect needs to discuss with spouse. Follow-up scheduled.",
  "Challenging call - prospect came in skeptical from previous bad experience. Built trust through case studies. Close pending partner approval.",
  "Excellent call resulting in close. Prospect was highly motivated after hearing ROI case studies. Quick decision maker.",
  "No-show on initial call. Rescheduled for next week.",
  "Prospect interested but not decision maker. Need to get business partner on next call.",
];

// Comprehensive seed function - creates all test data for a user's team
export const seedComprehensiveTestData = mutation({
  args: {
    userEmail: v.string(),
    clearExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Find user and team
    const user = await ctx.db.query("users").filter((q) => q.eq(q.field("email"), args.userEmail.toLowerCase())).first();
    if (!user) throw new Error(`User not found: ${args.userEmail}`);

    const team = await ctx.db.get(user.teamId);
    if (!team) throw new Error("Team not found");

    const teamId = team._id;

    // Clear existing data if requested
    if (args.clearExisting) {
      // Delete calls and related data
      const calls = await ctx.db.query("calls").withIndex("by_team", (q) => q.eq("teamId", teamId)).collect();
      for (const call of calls) {
        const ammo = await ctx.db.query("ammo").withIndex("by_call", (q) => q.eq("callId", call._id)).collect();
        for (const a of ammo) await ctx.db.delete(a._id);
        const segs = await ctx.db.query("transcriptSegments").withIndex("by_call", (q) => q.eq("callId", call._id)).collect();
        for (const s of segs) await ctx.db.delete(s._id);
        const objs = await ctx.db.query("objections").withIndex("by_call", (q) => q.eq("callId", call._id)).collect();
        for (const o of objs) await ctx.db.delete(o._id);
        await ctx.db.delete(call._id);
      }

      // Delete scheduled calls
      const scheduled = await ctx.db.query("scheduledCalls").withIndex("by_team_and_date", (q) => q.eq("teamId", teamId)).collect();
      for (const s of scheduled) await ctx.db.delete(s._id);

      // Delete closers
      const closers = await ctx.db.query("closers").withIndex("by_team", (q) => q.eq("teamId", teamId)).collect();
      for (const c of closers) await ctx.db.delete(c._id);

      // Delete highlights and playlists
      const highlights = await ctx.db.query("highlights").withIndex("by_team", (q) => q.eq("teamId", teamId)).collect();
      for (const h of highlights) await ctx.db.delete(h._id);

      const playlists = await ctx.db.query("trainingPlaylists").withIndex("by_team", (q) => q.eq("teamId", teamId)).collect();
      for (const p of playlists) {
        const items = await ctx.db.query("trainingPlaylistItems").withIndex("by_playlist", (q) => q.eq("playlistId", p._id)).collect();
        for (const i of items) await ctx.db.delete(i._id);
        await ctx.db.delete(p._id);
      }

      // Delete ammo config
      const config = await ctx.db.query("ammoConfigs").withIndex("by_team", (q) => q.eq("teamId", teamId)).first();
      if (config) await ctx.db.delete(config._id);
    }

    const now = Date.now();
    const randomItem = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    const randomInRange = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

    // 1. Create closers
    const closerIds: any[] = [];
    for (const closer of SEED_CLOSER_NAMES) {
      const id = await ctx.db.insert("closers", {
        email: closer.email,
        name: closer.name,
        teamId,
        status: "active",
        calendarConnected: false,
        invitedAt: now - 30 * 24 * 60 * 60 * 1000,
        activatedAt: now - 29 * 24 * 60 * 60 * 1000,
        lastLoginAt: now - randomInRange(1, 7) * 24 * 60 * 60 * 1000,
      });
      closerIds.push(id);
    }

    // 2. Create scheduled calls (future)
    for (let i = 0; i < 10; i++) {
      await ctx.db.insert("scheduledCalls", {
        closerId: randomItem(closerIds),
        teamId,
        calendarEventId: `test-event-${now}-${i}`,
        prospectName: randomItem(SEED_PROSPECT_NAMES),
        prospectEmail: `prospect${i}@example.com`,
        scheduledAt: now + randomInRange(1, 14) * 24 * 60 * 60 * 1000,
        meetingLink: "https://zoom.us/j/123456789",
        syncedAt: now,
        source: "calendly",
        status: "scheduled",
      });
    }

    // 3. Create completed calls with various outcomes
    const callIds: any[] = [];
    for (let i = 0; i < 30; i++) {
      const callDate = now - randomInRange(1, 60) * 24 * 60 * 60 * 1000;
      const duration = randomInRange(15 * 60, 50 * 60);

      const outcomeRoll = Math.random();
      let outcome: string, dealValue: number | undefined, cashCollected: number | undefined, primaryObjection: string | undefined;

      // Use realistic round numbers for deal values
      const roundDealValues = [3000, 5000, 6000, 7500, 8000, 10000, 12000, 15000];
      const roundCashCollectedOptions: Record<number, number[]> = {
        3000: [1500, 2000, 3000],
        5000: [2000, 2500, 3000, 5000],
        6000: [2000, 3000, 4000, 6000],
        7500: [2500, 3000, 5000, 7500],
        8000: [2500, 4000, 5000, 8000],
        10000: [3000, 5000, 7500, 10000],
        12000: [4000, 6000, 8000, 12000],
        15000: [5000, 7500, 10000, 15000],
      };

      if (outcomeRoll < 0.25) {
        outcome = "closed";
        dealValue = randomItem(roundDealValues);
        const cashOptions = roundCashCollectedOptions[dealValue] || [dealValue];
        cashCollected = randomItem(cashOptions);
      } else if (outcomeRoll < 0.35) {
        outcome = "no_show";
        primaryObjection = "no_show_ghosted";
      } else if (outcomeRoll < 0.45) {
        outcome = "rescheduled";
      } else {
        outcome = "not_closed";
        primaryObjection = randomItem(SEED_OBJECTIONS);
        dealValue = randomItem(roundDealValues.slice(0, 5)); // Lower values for lost deals
      }

      const closerId = closerIds[i % closerIds.length];
      const budgetDetected = Math.random() > 0.3;
      const timelineDetected = Math.random() > 0.4;
      const dmDetected = Math.random() > 0.35;
      const spouseDetected = Math.random() > 0.7;

      const callId = await ctx.db.insert("calls", {
        closerId,
        teamId,
        prospectName: SEED_PROSPECT_NAMES[i % SEED_PROSPECT_NAMES.length],
        status: "completed",
        outcome,
        dealValue,
        cashCollected,
        contractValue: dealValue,
        startedAt: callDate,
        endedAt: callDate + duration * 1000,
        duration,
        speakerCount: 2,
        transcriptText: `Sample transcript for call ${i}...`,
        closerTalkTime: Math.round(duration * 0.45),
        prospectTalkTime: Math.round(duration * 0.55),
        summary: randomItem(SEED_SUMMARIES),
        primaryObjection,
        leadQualityScore: randomInRange(3, 10),
        prospectWasDecisionMaker: randomItem(["yes", "no", "unclear"]),
        budgetDiscussion: { detected: budgetDetected, mentionCount: budgetDetected ? randomInRange(1, 3) : 0, quotes: budgetDetected ? ["We have about $5k set aside"] : [] },
        timelineUrgency: { detected: timelineDetected, mentionCount: timelineDetected ? randomInRange(1, 2) : 0, quotes: timelineDetected ? ["We need to start by next month"] : [], isUrgent: randomItem(["yes", "no", "unclear"]) },
        decisionMakerDetection: { detected: dmDetected, mentionCount: dmDetected ? randomInRange(1, 2) : 0, quotes: dmDetected ? ["I make all the decisions here"] : [], isSoleDecisionMaker: randomItem(["yes", "no", "unclear"]) },
        spousePartnerMentions: { detected: spouseDetected, mentionCount: spouseDetected ? randomInRange(1, 2) : 0, quotes: spouseDetected ? ["Let me discuss with my spouse"] : [] },
        objectionsDetected: primaryObjection ? [{ type: primaryObjection, quotes: ["I need to think about it"] }] : [],
        createdAt: callDate,
      });
      callIds.push(callId);

      // Add ammo
      const ammoCount = randomInRange(2, 4);
      const ammoTypes = ["pain_point", "emotional", "commitment", "urgency", "budget"];
      for (let j = 0; j < ammoCount; j++) {
        await ctx.db.insert("ammo", {
          callId,
          teamId,
          text: `Sample ammo quote ${j + 1} for this call`,
          type: randomItem(ammoTypes),
          timestamp: randomInRange(60, duration - 60),
          createdAt: callDate,
          score: randomInRange(50, 95),
          isHeavyHitter: true,
        });
      }

      // Add objection record if applicable
      if (primaryObjection) {
        await ctx.db.insert("objections", {
          callId,
          teamId,
          objectionText: "Sample objection text",
          category: primaryObjection,
          handled: outcome === "closed",
          timestamp: randomInRange(duration / 2, duration - 60),
          createdAt: callDate,
        });
      }
    }

    // 4. Create playbook highlights
    const highlightIds: any[] = [];
    const categories = ["objection_handling", "pitch", "close", "pain_discovery"];
    for (let i = 0; i < 6 && i < callIds.length; i++) {
      // Use the closerId from the index since we know the pattern
      const closerIdForHighlight = closerIds[i % closerIds.length];

      const hId = await ctx.db.insert("highlights", {
        callId: callIds[i],
        closerId: closerIdForHighlight,
        teamId,
        title: `Highlight ${i + 1}: ${randomItem(["Handling price objection", "Strong close", "Great discovery", "Building rapport"])}`,
        notes: "Great example of effective technique.",
        category: categories[i % categories.length],
        transcriptText: "Sample transcript segment...",
        startTimestamp: randomInRange(60, 300),
        endTimestamp: randomInRange(320, 600),
        createdAt: now - randomInRange(1, 14) * 24 * 60 * 60 * 1000,
        createdBy: user._id,
      });
      highlightIds.push(hId);
    }

    // 5. Create training playlists
    const playlist1 = await ctx.db.insert("trainingPlaylists", {
      teamId,
      name: "New Closer Onboarding",
      description: "Essential clips for new team members",
      createdBy: user._id,
      createdAt: now - 7 * 24 * 60 * 60 * 1000,
      updatedAt: now - 2 * 24 * 60 * 60 * 1000,
    });

    const playlist2 = await ctx.db.insert("trainingPlaylists", {
      teamId,
      name: "Objection Handling",
      description: "Best examples of overcoming objections",
      createdBy: user._id,
      createdAt: now - 5 * 24 * 60 * 60 * 1000,
      updatedAt: now - 1 * 24 * 60 * 60 * 1000,
    });

    // Add highlights to playlists
    for (let i = 0; i < Math.min(3, highlightIds.length); i++) {
      await ctx.db.insert("trainingPlaylistItems", {
        playlistId: playlist1,
        highlightId: highlightIds[i],
        order: i,
        addedAt: now - randomInRange(1, 5) * 24 * 60 * 60 * 1000,
      });
    }

    // Assign playlists to closers
    for (const closerId of closerIds.slice(0, 2)) {
      await ctx.db.insert("trainingPlaylistAssignments", {
        playlistId: playlist1,
        closerId,
        assignedBy: user._id,
        assignedAt: now - randomInRange(1, 5) * 24 * 60 * 60 * 1000,
      });
    }

    // 6. Create ammo config (playbook)
    await ctx.db.insert("ammoConfigs", {
      teamId,
      requiredInfo: [
        { id: "budget", label: "Budget", description: "What's their budget?" },
        { id: "timeline", label: "Timeline", description: "When do they need to decide?" },
        { id: "decision_maker", label: "Decision Maker", description: "Are they the sole decision maker?" },
        { id: "pain_points", label: "Pain Points", description: "What problems are they trying to solve?" },
      ],
      scriptFramework: [
        { id: "rapport", name: "Rapport Building", order: 0 },
        { id: "discovery", name: "Discovery", order: 1 },
        { id: "presentation", name: "Presentation", order: 2 },
        { id: "close", name: "Close", order: 3 },
      ],
      commonObjections: [
        { id: "price", label: "Price/Money", keywords: ["expensive", "afford", "budget", "cost"] },
        { id: "spouse", label: "Spouse/Partner", keywords: ["wife", "husband", "partner", "spouse"] },
        { id: "timing", label: "Timing", keywords: ["not right now", "busy", "later"] },
        { id: "think", label: "Need to Think", keywords: ["think about it", "sleep on it"] },
      ],
      ammoCategories: [
        { id: "pain", name: "Pain Points", color: "red", keywords: ["struggling", "frustrated", "problem"] },
        { id: "emotional", name: "Emotional", color: "purple", keywords: ["excited", "love", "hate", "feel"] },
        { id: "urgency", name: "Urgency", color: "orange", keywords: ["need to", "have to", "deadline"] },
      ],
      offerDescription: "High-ticket coaching program",
      problemSolved: "Helping businesses scale revenue",
      callManifesto: {
        stages: [
          { id: "opening", name: "Opening", goal: "Set frame and build rapport", goodBehaviors: ["Smile", "Set agenda"], badBehaviors: ["Jump to pitch"], keyMoments: ["Agenda set"], order: 0 },
          { id: "discovery", name: "Discovery", goal: "Understand their situation", goodBehaviors: ["Ask open questions", "Listen"], badBehaviors: ["Talk too much"], keyMoments: ["Pain identified"], order: 1 },
          { id: "close", name: "Close", goal: "Secure commitment", goodBehaviors: ["Ask for sale", "Handle objections"], badBehaviors: ["Be pushy"], keyMoments: ["Final close"], order: 2 },
        ],
        objections: [
          { id: "price", name: "Price/Money", rebuttals: ["If money wasn't a factor, is this what you'd want?"] },
          { id: "spouse", name: "Spouse/Partner", rebuttals: ["What do you think their main concern would be?"] },
          { id: "think", name: "Need to Think", rebuttals: ["What specifically do you need to think about?"] },
        ],
      },
      createdAt: now - 30 * 24 * 60 * 60 * 1000,
      updatedAt: now - 2 * 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      created: {
        closers: closerIds.length,
        scheduledCalls: 10,
        completedCalls: callIds.length,
        highlights: highlightIds.length,
        playlists: 2,
        ammoConfig: 1,
      },
    };
  },
});
