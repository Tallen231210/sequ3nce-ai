import { v } from "convex/values";
import { mutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ==================== Constants ====================

const MAX_CLIPS = 10;
const MAX_LABEL = 100;
const MAX_CLIP_DURATION = 10 * 60; // 10 minutes in seconds
const VALID_BLUR_REGIONS = ["left", "right", "none"] as const;

// ==================== Queries ====================

// Get all clips for a user (for profile editor)
export const getClipsByUser = internalQuery({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("b2cHighlightClips")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// Get clips for a specific call (for showing badges in CallDetailSheet)
export const getClipsByCall = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("b2cHighlightClips")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
  },
});

// Get public clips for a user (used by public endpoint)
export const getPublicClips = internalQuery({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const clips = await ctx.db
      .query("b2cHighlightClips")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return clips.map((clip) => ({
      _id: clip._id,
      callId: clip.callId,
      label: clip.label,
      startTime: clip.startTime,
      endTime: clip.endTime,
      isFullCall: clip.isFullCall,
      blurRegion: clip.blurRegion,
      sortOrder: clip.sortOrder,
    }));
  },
});

// Resolve slug → b2cUser
export const getUserBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    if (!slug) return null;
    return await ctx.db
      .query("b2cUsers")
      .withIndex("by_profile_slug", (q) => q.eq("profileSlug", slug))
      .first();
  },
});

// ==================== Mutations ====================

export const addClip = mutation({
  args: {
    userId: v.id("b2cUsers"),
    callId: v.id("calls"),
    label: v.string(),
    startTime: v.number(),
    endTime: v.number(),
    isFullCall: v.boolean(),
    blurRegion: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate user exists
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Validate call exists and belongs to user's workspace
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    if (call.teamId !== user.personalWorkspaceId) {
      throw new Error("Not authorized to clip this call");
    }

    // Validate call has video recording
    if (call.recordingType !== "video" || !call.recordingUrl) {
      throw new Error("Call does not have a video recording");
    }

    // Validate label
    const label = args.label.trim();
    if (!label || label.length > MAX_LABEL) {
      throw new Error(`Label is required and must be under ${MAX_LABEL} characters`);
    }

    // Validate blur region
    if (!(VALID_BLUR_REGIONS as readonly string[]).includes(args.blurRegion)) {
      throw new Error(`Invalid blur region: ${args.blurRegion}`);
    }

    // Validate times
    if (args.startTime < 0 || args.endTime <= args.startTime) {
      throw new Error("Invalid start/end times");
    }

    // Validate clip duration (10 min max unless full call)
    if (!args.isFullCall && (args.endTime - args.startTime) > MAX_CLIP_DURATION) {
      throw new Error("Clip duration cannot exceed 10 minutes");
    }

    // Check max clips
    const existing = await ctx.db
      .query("b2cHighlightClips")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    if (existing.length >= MAX_CLIPS) {
      throw new Error(`Maximum of ${MAX_CLIPS} clips allowed`);
    }

    // Auto-assign sortOrder
    const maxOrder = existing.reduce((max, c) => Math.max(max, c.sortOrder), -1);

    const clipId = await ctx.db.insert("b2cHighlightClips", {
      userId: args.userId,
      callId: args.callId,
      label,
      startTime: args.startTime,
      endTime: args.endTime,
      isFullCall: args.isFullCall,
      blurRegion: args.blurRegion,
      sortOrder: maxOrder + 1,
      createdAt: Date.now(),
    });

    return { clipId };
  },
});

export const updateClip = mutation({
  args: {
    clipId: v.id("b2cHighlightClips"),
    userId: v.id("b2cUsers"),
    label: v.optional(v.string()),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    isFullCall: v.optional(v.boolean()),
    blurRegion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) throw new Error("Clip not found");
    if (clip.userId.toString() !== args.userId.toString()) {
      throw new Error("Not authorized to modify this clip");
    }

    const updates: Record<string, unknown> = {};

    if (args.label !== undefined) {
      const label = args.label.trim();
      if (!label || label.length > MAX_LABEL) {
        throw new Error(`Label is required and must be under ${MAX_LABEL} characters`);
      }
      updates.label = label;
    }

    if (args.blurRegion !== undefined) {
      if (!(VALID_BLUR_REGIONS as readonly string[]).includes(args.blurRegion)) {
        throw new Error(`Invalid blur region: ${args.blurRegion}`);
      }
      updates.blurRegion = args.blurRegion;
    }

    if (args.startTime !== undefined) updates.startTime = args.startTime;
    if (args.endTime !== undefined) updates.endTime = args.endTime;
    if (args.isFullCall !== undefined) updates.isFullCall = args.isFullCall;

    // Validate times if either changed
    const startTime = (updates.startTime as number) ?? clip.startTime;
    const endTime = (updates.endTime as number) ?? clip.endTime;
    const isFullCall = (updates.isFullCall as boolean) ?? clip.isFullCall;

    if (startTime < 0 || endTime <= startTime) {
      throw new Error("Invalid start/end times");
    }
    if (!isFullCall && (endTime - startTime) > MAX_CLIP_DURATION) {
      throw new Error("Clip duration cannot exceed 10 minutes");
    }

    await ctx.db.patch(args.clipId, updates);
    return { success: true };
  },
});

export const deleteClip = mutation({
  args: {
    clipId: v.id("b2cHighlightClips"),
    userId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) throw new Error("Clip not found");
    if (clip.userId.toString() !== args.userId.toString()) {
      throw new Error("Not authorized to delete this clip");
    }

    await ctx.db.delete(args.clipId);
    return { success: true };
  },
});

export const reorderClips = mutation({
  args: {
    userId: v.id("b2cUsers"),
    clipIds: v.array(v.id("b2cHighlightClips")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    for (let i = 0; i < args.clipIds.length; i++) {
      const clip = await ctx.db.get(args.clipIds[i]);
      if (!clip || clip.userId.toString() !== args.userId.toString()) {
        throw new Error("Invalid clip in reorder list");
      }
      await ctx.db.patch(args.clipIds[i], { sortOrder: i });
    }

    return { success: true };
  },
});
