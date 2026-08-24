import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Internal account admin: hard-delete a single Money Bells broadcast, and
// provision flagged test accounts (the Playwright suite's fixtures). Not
// reachable over HTTP — run via `npx convex run --prod`.
// ============================================================================

/**
 * Hard-deletes ONE broadcast plus its linked feed post and that post's
 * children, and fixes the channel counter. The stock deleteBroadcast only
 * soft-deletes (patches isDeleted), which keeps the row in the DB; this is
 * for scrubbing test money out of the leaderboard for good. The owner's
 * account is untouched.
 */
export const hardDeleteMoneyBellBroadcast = internalMutation({
  args: { broadcastId: v.id("b2cMoneyBellBroadcasts") },
  handler: async (ctx, args) => {
    const broadcast = await ctx.db.get(args.broadcastId);
    if (!broadcast) return { deleted: false, reason: "broadcast not found" };
    const counts: Record<string, number> = {};

    if (broadcast.postId) {
      const post = await ctx.db.get(broadcast.postId);
      if (post) {
        const comments = await ctx.db
          .query("b2cCommunityComments")
          .withIndex("by_post", (q: any) => q.eq("postId", post._id))
          .collect();
        for (const c of comments) {
          const likes = await ctx.db
            .query("b2cCommunityCommentLikes")
            .withIndex("by_comment_user", (q: any) => q.eq("commentId", c._id))
            .collect();
          for (const l of likes) await ctx.db.delete(l._id);
          const cr = await ctx.db
            .query("b2cCommunityReactions")
            .withIndex("by_target", (q: any) =>
              q.eq("targetType", "comment").eq("targetId", String(c._id)),
            )
            .collect();
          for (const r of cr) await ctx.db.delete(r._id);
          await ctx.db.delete(c._id);
        }
        counts.comments = comments.length;

        const likes = await ctx.db
          .query("b2cCommunityPostLikes")
          .withIndex("by_post_user", (q: any) => q.eq("postId", post._id))
          .collect();
        for (const l of likes) await ctx.db.delete(l._id);
        counts.likes = likes.length;

        const reactions = await ctx.db
          .query("b2cCommunityReactions")
          .withIndex("by_target", (q: any) =>
            q.eq("targetType", "post").eq("targetId", String(post._id)),
          )
          .collect();
        for (const r of reactions) await ctx.db.delete(r._id);
        counts.reactions = reactions.length;

        if (!post.isDeleted) {
          const channel = await ctx.db.get(post.channelId);
          if (channel) {
            await ctx.db.patch(post.channelId, {
              postCount: Math.max(0, channel.postCount - 1),
            });
          }
        }
        await ctx.db.delete(post._id);
        counts.post = 1;
      }
    }

    await ctx.db.delete(broadcast._id);
    return { deleted: true, cashCollected: broadcast.cashCollected, counts };
  },
});

/** Same SHA-256 hashing the signup path uses (b2cAuth.ts). */
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Creates the same three rows signup creates (personal workspace team +
 * closer + b2cUsers — mirrors b2cAuth.ts signupB2CUser) but flagged
 * isTestAccount so community/presence queries hide it, emailVerified so
 * login works immediately, and with NO GHL sync. Returns the ids the
 * Playwright fixtures need.
 */
export const provisionTestAccount = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    password: v.string(),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("none"),
      v.literal("cancelled"),
      v.literal("past_due"),
    ),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("b2cUsers")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .first();
    if (existing) throw new Error(`${email} already exists — purge it first`);

    const passwordHash = await hashPassword(args.password);
    const now = Date.now();

    const teamId = await ctx.db.insert("teams", {
      name: `${args.name}'s Workspace`,
      type: "personal",
      plan: "active",
      createdAt: now,
    });
    const closerId = await ctx.db.insert("closers", {
      email,
      name: args.name,
      teamId,
      status: "active",
      passwordHash,
      invitedAt: now,
      activatedAt: now,
      // UI specs must land on the hub, not the calendar-onboarding overlay
      calendarOnboardingCompleted: true,
    });
    const b2cUserId = await ctx.db.insert("b2cUsers", {
      email,
      phoneVerified: false,
      emailVerified: true,
      name: args.name,
      passwordHash,
      personalWorkspaceId: teamId,
      subscriptionStatus: args.subscriptionStatus,
      isTestAccount: true,
      // Skip the welcome/goal questionnaire on real logins in UI specs
      onboardingCompleted: true,
      createdAt: now,
    });

    return { b2cUserId, closerId, teamId };
  },
});
