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
