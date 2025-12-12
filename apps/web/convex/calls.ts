import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
    // We receive string IDs from the audio processor, need to validate they exist
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

// Add ammo item
export const addAmmo = mutation({
  args: {
    callId: v.string(),
    teamId: v.string(),
    text: v.string(),
    type: v.string(),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("ammo", {
      callId: args.callId as any,
      teamId: args.teamId as any,
      text: args.text,
      type: args.type,
      timestamp: args.timestamp,
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

    // Fetch closer info for each call
    const callsWithCloser = await Promise.all(
      calls.map(async (call) => {
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

    return {
      ...call,
      closer: closer ? { name: closer.name, email: closer.email } : null,
      teamName: team?.name || null,
      ammo,
    };
  },
});

// Update call outcome (called from desktop app after call ends)
export const updateCallOutcome = mutation({
  args: {
    callId: v.id("calls"),
    outcome: v.string(),
    dealValue: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      outcome: args.outcome,
      dealValue: args.dealValue,
    });
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
