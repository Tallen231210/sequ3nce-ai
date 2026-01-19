import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================
// FEATURE FLAG HELPERS (Live streaming now enabled for all teams)
// ============================================

/**
 * Check if a team has live streaming enabled
 * Now always returns true - live streaming is available to everyone
 */
export const isLiveStreamingEnabled = query({
  args: {
    teamId: v.string(),
  },
  handler: async () => {
    return true; // Live streaming enabled for all teams
  },
});

// ============================================
// MUTATIONS (Called by audio processor)
// ============================================

/**
 * Create a new live stream record when a call starts
 * Called by audio processor when closer connects
 */
export const createLiveStream = mutation({
  args: {
    callId: v.string(),
    visitorCallId: v.string(),
    teamId: v.string(),
    closerId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamIdTyped = args.teamId as Id<"teams">;

    // Check if a stream already exists for this visitorCallId
    const existing = await ctx.db
      .query("liveStreams")
      .withIndex("by_visitor_call_id", (q) => q.eq("visitorCallId", args.visitorCallId))
      .first();

    if (existing) {
      // If stream exists but is ended, reactivate it (reconnection scenario)
      if (existing.status === "ended") {
        await ctx.db.patch(existing._id, {
          status: "active",
          callId: args.callId as Id<"calls">,
          endedAt: undefined,
        });
        console.log(`[liveStreams] Reactivated ended stream ${existing._id} for visitorCallId: ${args.visitorCallId}`);
        return existing._id;
      }
      console.log(`[liveStreams] Stream already active for visitorCallId: ${args.visitorCallId}`);
      return existing._id;
    }

    // Create the stream record
    const streamId = await ctx.db.insert("liveStreams", {
      callId: args.callId as Id<"calls">,
      teamId: teamIdTyped,
      closerId: args.closerId as Id<"closers">,
      visitorCallId: args.visitorCallId,
      status: "active",
      listenerCount: 0,
      startedAt: Date.now(),
    });

    console.log(`[liveStreams] Created stream ${streamId} for call ${args.callId}`);
    return streamId;
  },
});

/**
 * End a live stream when a call ends
 * Called by audio processor when closer disconnects
 */
export const endLiveStream = mutation({
  args: {
    visitorCallId: v.string(),
  },
  handler: async (ctx, args) => {
    const stream = await ctx.db
      .query("liveStreams")
      .withIndex("by_visitor_call_id", (q) => q.eq("visitorCallId", args.visitorCallId))
      .first();

    if (!stream) {
      console.log(`[liveStreams] No stream found for visitorCallId: ${args.visitorCallId}`);
      return { success: false, error: "Stream not found" };
    }

    if (stream.status === "ended") {
      console.log(`[liveStreams] Stream already ended for visitorCallId: ${args.visitorCallId}`);
      return { success: true, alreadyEnded: true };
    }

    await ctx.db.patch(stream._id, {
      status: "ended",
      endedAt: Date.now(),
    });

    console.log(`[liveStreams] Ended stream ${stream._id} for visitorCallId: ${args.visitorCallId}`);
    return { success: true };
  },
});

/**
 * Update listener count (for analytics/debugging)
 * Called by audio processor when managers connect/disconnect
 */
export const updateListenerCount = mutation({
  args: {
    visitorCallId: v.string(),
    delta: v.number(), // +1 when manager joins, -1 when manager leaves
  },
  handler: async (ctx, args) => {
    const stream = await ctx.db
      .query("liveStreams")
      .withIndex("by_visitor_call_id", (q) => q.eq("visitorCallId", args.visitorCallId))
      .first();

    if (!stream || stream.status !== "active") {
      return { success: false };
    }

    const newCount = Math.max(0, (stream.listenerCount ?? 0) + args.delta);
    await ctx.db.patch(stream._id, { listenerCount: newCount });

    return { success: true, listenerCount: newCount };
  },
});

// ============================================
// QUERIES (Called by web dashboard)
// ============================================

/**
 * Get active live stream for a specific call
 * Used by web dashboard to show "Listen Live" button
 */
export const getLiveStreamForCall = query({
  args: {
    callId: v.string(),
  },
  handler: async (ctx, args) => {
    const callIdTyped = args.callId as Id<"calls">;

    const stream = await ctx.db
      .query("liveStreams")
      .withIndex("by_call", (q) => q.eq("callId", callIdTyped))
      .first();

    if (!stream || stream.status !== "active") {
      return null;
    }

    return {
      _id: stream._id,
      callId: stream.callId,
      visitorCallId: stream.visitorCallId,
      status: stream.status,
      listenerCount: stream.listenerCount ?? 0,
      startedAt: stream.startedAt,
    };
  },
});

/**
 * Get all active live streams for a team
 * Used by web dashboard to show which calls have streaming available
 */
export const getActiveLiveStreams = query({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamIdTyped = args.teamId as Id<"teams">;

    const streams = await ctx.db
      .query("liveStreams")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", teamIdTyped).eq("status", "active")
      )
      .collect();

    return streams.map((stream) => ({
      _id: stream._id,
      callId: stream.callId,
      visitorCallId: stream.visitorCallId,
      closerId: stream.closerId,
      listenerCount: stream.listenerCount ?? 0,
      startedAt: stream.startedAt,
    }));
  },
});

/**
 * Get live stream by visitorCallId
 * Used by audio processor to verify manager connection requests
 */
export const getLiveStreamByVisitorCallId = query({
  args: {
    visitorCallId: v.string(),
  },
  handler: async (ctx, args) => {
    const stream = await ctx.db
      .query("liveStreams")
      .withIndex("by_visitor_call_id", (q) => q.eq("visitorCallId", args.visitorCallId))
      .first();

    if (!stream) {
      return null;
    }

    return {
      _id: stream._id,
      callId: stream.callId,
      teamId: stream.teamId,
      closerId: stream.closerId,
      visitorCallId: stream.visitorCallId,
      status: stream.status,
      listenerCount: stream.listenerCount ?? 0,
      startedAt: stream.startedAt,
      endedAt: stream.endedAt,
    };
  },
});
