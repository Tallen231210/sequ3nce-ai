import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ==================== Constants ====================

const VALID_EMOJIS = [
  "thumbsup",
  "fire",
  "hundred",
  "clap",
  "laugh",
  "heart",
  "eyes",
  "mindblown",
];

// ==================== Mutations ====================

// Add an emoji reaction to a post or comment
export const addReaction = mutation({
  args: {
    userId: v.id("b2cUsers"),
    targetType: v.string(),
    targetId: v.string(),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate user
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.subscriptionStatus !== "active") {
      throw new Error("Active subscription required");
    }

    // Validate targetType
    if (args.targetType !== "post" && args.targetType !== "comment") {
      throw new Error("targetType must be 'post' or 'comment'");
    }

    // Validate emoji
    if (!VALID_EMOJIS.includes(args.emoji)) {
      throw new Error(`Invalid emoji. Must be one of: ${VALID_EMOJIS.join(", ")}`);
    }

    // Validate target exists and is not deleted
    if (args.targetType === "post") {
      const post = await ctx.db.get(args.targetId as any);
      if (!post || (post as any).isDeleted) throw new Error("Post not found");
    } else {
      const comment = await ctx.db.get(args.targetId as any);
      if (!comment || (comment as any).isDeleted) throw new Error("Comment not found");
    }

    // Check for duplicate reaction
    const existing = await ctx.db
      .query("b2cCommunityReactions")
      .withIndex("by_target_user", (q) =>
        q
          .eq("targetType", args.targetType)
          .eq("targetId", args.targetId)
          .eq("userId", args.userId)
      )
      .collect();

    const alreadyReacted = existing.find((r) => r.emoji === args.emoji);
    if (alreadyReacted) {
      return { success: true, message: "Already reacted" };
    }

    // Insert reaction
    await ctx.db.insert("b2cCommunityReactions", {
      targetType: args.targetType,
      targetId: args.targetId,
      userId: args.userId,
      emoji: args.emoji,
      createdAt: Date.now(),
    });

    // Update reactionCounts on target document
    if (args.targetType === "post") {
      const post = await ctx.db.get(args.targetId as any);
      if (post) {
        const counts: Record<string, number> = (post as any).reactionCounts ?? {};
        counts[args.emoji] = (counts[args.emoji] ?? 0) + 1;
        await ctx.db.patch(args.targetId as any, { reactionCounts: counts });
      }
    } else {
      const comment = await ctx.db.get(args.targetId as any);
      if (comment) {
        const counts: Record<string, number> = (comment as any).reactionCounts ?? {};
        counts[args.emoji] = (counts[args.emoji] ?? 0) + 1;
        await ctx.db.patch(args.targetId as any, { reactionCounts: counts });
      }
    }

    return { success: true };
  },
});

// Remove an emoji reaction from a post or comment
export const removeReaction = mutation({
  args: {
    userId: v.id("b2cUsers"),
    targetType: v.string(),
    targetId: v.string(),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the reaction
    const reactions = await ctx.db
      .query("b2cCommunityReactions")
      .withIndex("by_target_user", (q) =>
        q
          .eq("targetType", args.targetType)
          .eq("targetId", args.targetId)
          .eq("userId", args.userId)
      )
      .collect();

    const reaction = reactions.find((r) => r.emoji === args.emoji);
    if (!reaction) {
      return { success: true, message: "Reaction not found" };
    }

    // Validate ownership
    if (reaction.userId !== args.userId) {
      throw new Error("Not authorized");
    }

    // Delete the reaction
    await ctx.db.delete(reaction._id);

    // Update reactionCounts on target document
    if (args.targetType === "post") {
      const post = await ctx.db.get(args.targetId as any);
      if (post) {
        const counts: Record<string, number> = { ...((post as any).reactionCounts ?? {}) };
        if (counts[args.emoji]) {
          counts[args.emoji] -= 1;
          if (counts[args.emoji] <= 0) delete counts[args.emoji];
        }
        await ctx.db.patch(args.targetId as any, { reactionCounts: counts });
      }
    } else {
      const comment = await ctx.db.get(args.targetId as any);
      if (comment) {
        const counts: Record<string, number> = { ...((comment as any).reactionCounts ?? {}) };
        if (counts[args.emoji]) {
          counts[args.emoji] -= 1;
          if (counts[args.emoji] <= 0) delete counts[args.emoji];
        }
        await ctx.db.patch(args.targetId as any, { reactionCounts: counts });
      }
    }

    return { success: true };
  },
});

// ==================== Queries ====================

// Get the current user's reactions on a set of targets (for enrichment)
export const getMyReactions = query({
  args: {
    userId: v.id("b2cUsers"),
    targetType: v.string(),
    targetIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const result: Record<string, string[]> = {};

    for (const targetId of args.targetIds) {
      const reactions = await ctx.db
        .query("b2cCommunityReactions")
        .withIndex("by_target_user", (q) =>
          q
            .eq("targetType", args.targetType)
            .eq("targetId", targetId)
            .eq("userId", args.userId)
        )
        .collect();
      result[targetId] = reactions.map((r) => r.emoji);
    }

    return result;
  },
});
