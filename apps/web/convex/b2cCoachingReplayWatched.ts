import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Upsert replay-watch progress for a (user, call) pair. Called by
// ReplayPlayerModal every 10s while the user is actively watching. The
// adoption-checklist "join coaching call or watch a replay" task is
// satisfied when ANY row exists with watchedSeconds >= 30.
export const recordReplayProgress = mutation({
  args: {
    userId: v.id("b2cUsers"),
    callId: v.id("b2cCoachingCalls"),
    watchedSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("b2cCoachingReplayWatched")
      .withIndex("by_user_call", (q) =>
        q.eq("userId", args.userId).eq("callId", args.callId),
      )
      .first();
    if (existing) {
      // Take the max — user might rewind, but we never want progress to drop.
      const next = Math.max(existing.watchedSeconds, args.watchedSeconds);
      if (next === existing.watchedSeconds) {
        // No-op for jitter; still bump updatedAt.
        await ctx.db.patch(existing._id, { updatedAt: now });
        return;
      }
      await ctx.db.patch(existing._id, {
        watchedSeconds: next,
        updatedAt: now,
      });
      return;
    }
    await ctx.db.insert("b2cCoachingReplayWatched", {
      userId: args.userId,
      callId: args.callId,
      watchedSeconds: args.watchedSeconds,
      firstWatchedAt: now,
      updatedAt: now,
    });
  },
});
