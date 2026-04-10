import { v } from "convex/values";
import {
  mutation,
  query,
  internalQuery,
  internalMutation,
} from "./_generated/server";

// Hard cap on how many transcriptions we keep per user.
// When a new transcription is saved, older rows beyond this count are pruned.
export const STREAM_HISTORY_CAP = 500;

// Reasonable per-field guardrails so clients can't dump huge payloads into the DB.
const MAX_TRANSCRIPT_CHARS = 10_000;
const MAX_HOTKEY_LENGTH = 128;

// ==================== Settings ====================

/** Public query — fetch Stream settings for a specific B2C user. */
export const getStreamSettings = query({
  args: { b2cUserId: v.id("b2cUsers") },
  handler: async (ctx, { b2cUserId }) => {
    const settings = await ctx.db
      .query("streamSettings")
      .withIndex("by_user", (q) => q.eq("b2cUserId", b2cUserId))
      .unique();
    return settings;
  },
});

/** Public mutation — create or update Stream settings for a user. */
export const upsertStreamSettings = mutation({
  args: {
    b2cUserId: v.id("b2cUsers"),
    hotkey: v.string(),
    hasCompletedOnboarding: v.optional(v.boolean()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, { b2cUserId, hotkey, hasCompletedOnboarding, enabled }) => {
    if (hotkey.length === 0 || hotkey.length > MAX_HOTKEY_LENGTH) {
      throw new Error("Invalid hotkey length");
    }

    // Verify the user exists so we don't write orphan rows
    const user = await ctx.db.get(b2cUserId);
    if (!user) throw new Error("User not found");

    const now = Date.now();
    const existing = await ctx.db
      .query("streamSettings")
      .withIndex("by_user", (q) => q.eq("b2cUserId", b2cUserId))
      .unique();

    if (existing) {
      const patch: Record<string, unknown> = { hotkey, updatedAt: now };
      if (hasCompletedOnboarding !== undefined) patch.hasCompletedOnboarding = hasCompletedOnboarding;
      if (enabled !== undefined) patch.enabled = enabled;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    const id = await ctx.db.insert("streamSettings", {
      b2cUserId,
      hotkey,
      hasCompletedOnboarding: hasCompletedOnboarding ?? false,
      enabled: enabled ?? false,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

// ==================== History ====================

/** Public query — fetch most-recent transcriptions for a user. */
export const getStreamHistory = query({
  args: {
    b2cUserId: v.id("b2cUsers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { b2cUserId, limit }) => {
    const take = Math.min(Math.max(limit ?? STREAM_HISTORY_CAP, 1), STREAM_HISTORY_CAP);
    const rows = await ctx.db
      .query("streamTranscriptions")
      .withIndex("by_user_and_date", (q) => q.eq("b2cUserId", b2cUserId))
      .order("desc")
      .take(take);
    return rows;
  },
});

/** Public mutation — delete a single transcription (user must own it). */
export const deleteStreamTranscription = mutation({
  args: {
    b2cUserId: v.id("b2cUsers"),
    transcriptionId: v.id("streamTranscriptions"),
  },
  handler: async (ctx, { b2cUserId, transcriptionId }) => {
    const row = await ctx.db.get(transcriptionId);
    if (!row) return { deleted: false };
    if (row.b2cUserId !== b2cUserId) {
      throw new Error("Not authorized to delete this transcription");
    }
    await ctx.db.delete(transcriptionId);
    return { deleted: true };
  },
});

/** Public mutation — wipe all history for a user. */
export const deleteAllStreamHistory = mutation({
  args: { b2cUserId: v.id("b2cUsers") },
  handler: async (ctx, { b2cUserId }) => {
    const rows = await ctx.db
      .query("streamTranscriptions")
      .withIndex("by_user_and_date", (q) => q.eq("b2cUserId", b2cUserId))
      .collect();

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { deleted: rows.length };
  },
});

// ==================== Internal variants (called by actions) ====================

/** Internal query — lookup a user to validate they exist before calling Groq. */
export const getUserForStreamInternal = internalQuery({
  args: { b2cUserId: v.id("b2cUsers") },
  handler: async (ctx, { b2cUserId }) => {
    const user = await ctx.db.get(b2cUserId);
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email,
      subscriptionStatus: user.subscriptionStatus,
    };
  },
});

/** Internal mutation — insert a new transcription and prune old rows above the cap. */
export const insertTranscriptionInternal = internalMutation({
  args: {
    b2cUserId: v.id("b2cUsers"),
    text: v.string(),
    durationSec: v.optional(v.number()),
  },
  handler: async (ctx, { b2cUserId, text, durationSec }) => {
    // Guard against runaway payloads. Groq Whisper typically returns short strings
    // for dictation clips, so anything larger is suspect.
    const safeText = text.length > MAX_TRANSCRIPT_CHARS
      ? text.slice(0, MAX_TRANSCRIPT_CHARS)
      : text;

    const id = await ctx.db.insert("streamTranscriptions", {
      b2cUserId,
      text: safeText,
      durationSec,
      createdAt: Date.now(),
    });

    // Prune: if the user now has more than STREAM_HISTORY_CAP rows, delete the oldest
    // ones. We fetch in ascending order and delete until the total fits under the cap.
    const all = await ctx.db
      .query("streamTranscriptions")
      .withIndex("by_user_and_date", (q) => q.eq("b2cUserId", b2cUserId))
      .order("asc")
      .collect();

    const excess = all.length - STREAM_HISTORY_CAP;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        await ctx.db.delete(all[i]._id);
      }
    }

    return id;
  },
});
