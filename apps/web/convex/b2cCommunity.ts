import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ==================== Validation Constants ====================

const MAX_POST_BODY = 5000;
const MAX_COMMENT_BODY = 2000;
const PAGE_SIZE = 20;
const FEED_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;

// Default channels seeded on first deploy
const DEFAULT_CHANNELS = [
  { slug: "general", name: "General", description: "Introduce yourself, share wins, and hang out with the community", order: 0 },
  { slug: "sales-tips", name: "Sales Tips", description: "Share and learn tactical sales techniques that work in high-ticket", order: 1 },
  { slug: "deal-stories", name: "Deal Stories", description: "Post your deal breakdowns — wins, losses, and the lessons in between", order: 2 },
  { slug: "objection-handling", name: "Objection Handling", description: "The #1 skill in closing. Share rebuttals, ask for help, sharpen your edge", order: 3 },
  { slug: "mindset-motivation", name: "Mindset & Motivation", description: "Stay sharp between calls. Routines, mindset hacks, and accountability", order: 4 },
  { slug: "tech-tools", name: "Tech & Tools", description: "CRMs, dialers, AI tools, and tech setups that make you more efficient", order: 5 },
];

// ==================== Helpers ====================

async function resolvePhotoUrl(
  ctx: { storage: { getUrl: (id: string) => Promise<string | null> } },
  storageId: string | undefined | null
): Promise<string | null> {
  if (!storageId) return null;
  return await ctx.storage.getUrl(storageId);
}

// ==================== Queries ====================

// List all non-archived channels
export const listChannels = query({
  args: {},
  handler: async (ctx) => {
    const channels = await ctx.db
      .query("b2cCommunityChannels")
      .withIndex("by_order")
      .collect();
    return channels.filter((c) => !c.isArchived);
  },
});

// Aggregated feed — posts across all channels, newest first
export const getFeed = query({
  args: {
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
    userId: v.optional(v.id("b2cUsers")),
    friendsOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? FEED_PAGE_SIZE, MAX_PAGE_SIZE);

    // Build friend set for visibility filtering
    let friendIdSet: Set<string> | null = null;
    if (args.userId) {
      const asRequester = await ctx.db
        .query("b2cFriendships")
        .withIndex("by_requester", (q) =>
          q.eq("requesterId", args.userId!).eq("status", "accepted")
        )
        .collect();
      const asRecipient = await ctx.db
        .query("b2cFriendships")
        .withIndex("by_recipient", (q) =>
          q.eq("recipientId", args.userId!).eq("status", "accepted")
        )
        .collect();
      friendIdSet = new Set<string>();
      for (const f of asRequester) friendIdSet.add(f.recipientId);
      for (const f of asRecipient) friendIdSet.add(f.requesterId);
    }

    const posts = await ctx.db
      .query("b2cCommunityPosts")
      .withIndex("by_created")
      .order("desc")
      .collect();

    // Filter deleted, broadcasts, apply visibility, and apply cursor
    let filtered = posts.filter((p) => {
      if (p.isDeleted) return false;
      // Broadcast posts belong to Money Bells — exclude from aggregated Feed
      if (p.broadcastId) return false;

      // Friends-only filter: show only posts from friends
      if (args.friendsOnly && friendIdSet) {
        return (
          friendIdSet.has(p.authorId) || p.authorId === args.userId
        );
      }

      // Visibility filtering: hide friends-only posts from non-friends
      if (p.visibility === "friends") {
        if (!args.userId) return false;
        if (p.authorId === args.userId) return true;
        return friendIdSet?.has(p.authorId) ?? false;
      }

      return true;
    });

    if (args.cursor) {
      filtered = filtered.filter((p) => p.createdAt < args.cursor!);
    }

    const page = filtered.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    // Resolve photo URLs and like status
    const enriched = await Promise.all(
      results.map(async (post) => {
        const photoUrl = await resolvePhotoUrl(ctx, post.authorPhotoStorageId);
        const channel = await ctx.db.get(post.channelId);
        const author = await ctx.db.get(post.authorId);
        let isLikedByMe = false;
        if (args.userId) {
          const like = await ctx.db
            .query("b2cCommunityPostLikes")
            .withIndex("by_post_user", (q) =>
              q.eq("postId", post._id).eq("userId", args.userId!)
            )
            .first();
          isLikedByMe = !!like;
        }
        return {
          ...post,
          authorPhotoUrl: photoUrl,
          authorBadges: author?.badges ?? [],
          channelName: channel?.name ?? "Unknown",
          channelSlug: channel?.slug ?? "",
          isLikedByMe,
          reactionCounts: (post as any).reactionCounts ?? {},
          myReactions: [] as string[],
        };
      })
    );

    // Populate myReactions for the current user
    if (args.userId) {
      for (const post of enriched) {
        const reactions = await ctx.db
          .query("b2cCommunityReactions")
          .withIndex("by_target_user", (q) =>
            q.eq("targetType", "post").eq("targetId", post._id).eq("userId", args.userId!)
          )
          .collect();
        (post as any).myReactions = reactions.map((r) => r.emoji);
      }
    }

    return {
      posts: enriched,
      nextCursor: hasMore ? results[results.length - 1].createdAt : null,
    };
  },
});

// Posts within a specific channel
export const listPosts = query({
  args: {
    channelId: v.id("b2cCommunityChannels"),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
    userId: v.optional(v.id("b2cUsers")),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);

    // Build friend set for visibility filtering
    let friendIdSet: Set<string> | null = null;
    if (args.userId) {
      const asRequester = await ctx.db
        .query("b2cFriendships")
        .withIndex("by_requester", (q) =>
          q.eq("requesterId", args.userId!).eq("status", "accepted")
        )
        .collect();
      const asRecipient = await ctx.db
        .query("b2cFriendships")
        .withIndex("by_recipient", (q) =>
          q.eq("recipientId", args.userId!).eq("status", "accepted")
        )
        .collect();
      friendIdSet = new Set<string>();
      for (const f of asRequester) friendIdSet.add(f.recipientId);
      for (const f of asRecipient) friendIdSet.add(f.requesterId);
    }

    const posts = await ctx.db
      .query("b2cCommunityPosts")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .order("desc")
      .collect();

    let filtered = posts.filter((p) => {
      if (p.isDeleted) return false;
      // Hide friends-only posts from non-friends
      if (p.visibility === "friends") {
        if (!args.userId) return false;
        if (p.authorId === args.userId) return true;
        return friendIdSet?.has(p.authorId) ?? false;
      }
      return true;
    });

    if (args.cursor) {
      filtered = filtered.filter((p) => p.createdAt < args.cursor!);
    }

    const page = filtered.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    const enriched = await Promise.all(
      results.map(async (post) => {
        const photoUrl = await resolvePhotoUrl(ctx, post.authorPhotoStorageId);
        const author = await ctx.db.get(post.authorId);
        let isLikedByMe = false;
        if (args.userId) {
          const like = await ctx.db
            .query("b2cCommunityPostLikes")
            .withIndex("by_post_user", (q) =>
              q.eq("postId", post._id).eq("userId", args.userId!)
            )
            .first();
          isLikedByMe = !!like;
        }
        return {
          ...post,
          authorPhotoUrl: photoUrl,
          authorBadges: author?.badges ?? [],
          isLikedByMe,
          reactionCounts: (post as any).reactionCounts ?? {},
          myReactions: [] as string[],
        };
      })
    );

    // Populate myReactions for the current user
    if (args.userId) {
      for (const post of enriched) {
        const reactions = await ctx.db
          .query("b2cCommunityReactions")
          .withIndex("by_target_user", (q) =>
            q.eq("targetType", "post").eq("targetId", post._id).eq("userId", args.userId!)
          )
          .collect();
        (post as any).myReactions = reactions.map((r) => r.emoji);
      }
    }

    return {
      posts: enriched,
      nextCursor: hasMore ? results[results.length - 1].createdAt : null,
    };
  },
});

// Single post detail
export const getPost = query({
  args: {
    postId: v.id("b2cCommunityPosts"),
    userId: v.optional(v.id("b2cUsers")),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.isDeleted) return null;

    const photoUrl = await resolvePhotoUrl(ctx, post.authorPhotoStorageId);
    const channel = await ctx.db.get(post.channelId);
    const author = await ctx.db.get(post.authorId);
    let isLikedByMe = false;
    if (args.userId) {
      const like = await ctx.db
        .query("b2cCommunityPostLikes")
        .withIndex("by_post_user", (q) =>
          q.eq("postId", post._id).eq("userId", args.userId!)
        )
        .first();
      isLikedByMe = !!like;
    }

    return {
      ...post,
      authorPhotoUrl: photoUrl,
      authorBadges: author?.badges ?? [],
      channelName: channel?.name ?? "Unknown",
      channelSlug: channel?.slug ?? "",
      isLikedByMe,
    };
  },
});

// Comments on a post (chronological, oldest first)
export const listComments = query({
  args: {
    postId: v.id("b2cCommunityPosts"),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
    userId: v.optional(v.id("b2cUsers")),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);
    const comments = await ctx.db
      .query("b2cCommunityComments")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .order("asc")
      .collect();

    let filtered = comments.filter((c) => !c.isDeleted);
    if (args.cursor) {
      filtered = filtered.filter((c) => c.createdAt > args.cursor!);
    }

    const page = filtered.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    const enriched = await Promise.all(
      results.map(async (comment) => {
        const photoUrl = await resolvePhotoUrl(ctx, comment.authorPhotoStorageId);
        const author = await ctx.db.get(comment.authorId);
        let isLikedByMe = false;
        if (args.userId) {
          const like = await ctx.db
            .query("b2cCommunityCommentLikes")
            .withIndex("by_comment_user", (q) =>
              q.eq("commentId", comment._id).eq("userId", args.userId!)
            )
            .first();
          isLikedByMe = !!like;
        }
        return {
          ...comment,
          authorPhotoUrl: photoUrl,
          authorBadges: author?.badges ?? [],
          isLikedByMe,
          parentCommentId: (comment as any).parentCommentId ?? undefined,
          reactionCounts: (comment as any).reactionCounts ?? {},
          myReactions: [] as string[],
        };
      })
    );

    // Populate myReactions for the current user
    if (args.userId) {
      for (const comment of enriched) {
        const reactions = await ctx.db
          .query("b2cCommunityReactions")
          .withIndex("by_target_user", (q) =>
            q.eq("targetType", "comment").eq("targetId", comment._id).eq("userId", args.userId!)
          )
          .collect();
        (comment as any).myReactions = reactions.map((r) => r.emoji);
      }
    }

    return {
      comments: enriched,
      nextCursor: hasMore ? results[results.length - 1].createdAt : null,
    };
  },
});

// Member directory — active subscribers with profile data
export const listMembers = query({
  args: {
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);

    // Get active subscribers — QA/Playwright accounts never appear in the
    // directory, however active their subscription row looks.
    const users = (
      await ctx.db
        .query("b2cUsers")
        .withIndex("by_subscription_status", (q) =>
          q.eq("subscriptionStatus", "active")
        )
        .collect()
    ).filter((u) => u.isTestAccount !== true);

    // Filter by search term if provided
    let filtered = users;
    if (args.search && args.search.trim().length > 0) {
      const term = args.search.trim().toLowerCase();
      filtered = users.filter((u) => u.name.toLowerCase().includes(term));
    }

    // Sort by createdAt desc (newest members first)
    filtered.sort((a, b) => b.createdAt - a.createdAt);

    // Apply cursor
    if (args.cursor) {
      filtered = filtered.filter((u) => u.createdAt < args.cursor!);
    }

    const page = filtered.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    // Enrich with profile data
    const enriched = await Promise.all(
      results.map(async (user) => {
        const profile = await ctx.db
          .query("b2cProfiles")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .first();

        const photoUrl = await resolvePhotoUrl(ctx, profile?.photoStorageId);

        return {
          userId: user._id,
          name: user.name,
          profileSlug: user.profileSlug ?? null,
          headline: profile?.headline ?? null,
          location: profile?.location ?? null,
          industries: profile?.industries ?? [],
          photoUrl,
          badges: user.badges ?? [],
          createdAt: user.createdAt,
        };
      })
    );

    return {
      members: enriched,
      nextCursor: hasMore ? results[results.length - 1].createdAt : null,
    };
  },
});

// Count new posts since a given timestamp (for "new posts" banner)
export const getNewPostCount = query({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    const posts = await ctx.db
      .query("b2cCommunityPosts")
      .withIndex("by_created")
      .order("desc")
      .collect();

    return posts.filter((p) => !p.isDeleted && p.createdAt > args.since).length;
  },
});

// ==================== Mutations ====================

// Create a new post in a channel
export const createPost = mutation({
  args: {
    userId: v.id("b2cUsers"),
    channelId: v.id("b2cCommunityChannels"),
    body: v.string(),
    visibility: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate user
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.subscriptionStatus !== "active") {
      throw new Error("Active subscription required");
    }

    // Validate channel
    const channel = await ctx.db.get(args.channelId);
    if (!channel || channel.isArchived) throw new Error("Channel not found");

    // Validate body
    const body = args.body.trim();
    if (body.length === 0) throw new Error("Post cannot be empty");
    if (body.length > MAX_POST_BODY) {
      throw new Error(`Post must be ${MAX_POST_BODY} characters or less`);
    }

    // Validate visibility
    const visibility = args.visibility ?? "everyone";
    if (visibility !== "everyone" && visibility !== "friends") {
      throw new Error("Visibility must be 'everyone' or 'friends'");
    }

    // Get author profile photo
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const now = Date.now();
    const postId = await ctx.db.insert("b2cCommunityPosts", {
      channelId: args.channelId,
      authorId: args.userId,
      authorName: user.name,
      authorPhotoStorageId: profile?.photoStorageId,
      body,
      visibility: visibility === "friends" ? "friends" : undefined,
      likeCount: 0,
      commentCount: 0,
      isPinned: false,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    // Update channel activity
    await ctx.db.patch(args.channelId, {
      postCount: channel.postCount + 1,
      lastActivityAt: now,
    });

    return { postId };
  },
});

// Edit a post (author only)
export const editPost = mutation({
  args: {
    userId: v.id("b2cUsers"),
    postId: v.id("b2cCommunityPosts"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.isDeleted) throw new Error("Post not found");
    if (post.authorId !== args.userId) throw new Error("Not authorized");

    const body = args.body.trim();
    if (body.length === 0) throw new Error("Post cannot be empty");
    if (body.length > MAX_POST_BODY) {
      throw new Error(`Post must be ${MAX_POST_BODY} characters or less`);
    }

    await ctx.db.patch(args.postId, { body, updatedAt: Date.now() });
    return { success: true };
  },
});

// Soft-delete a post (author or admin)
export const deletePost = mutation({
  args: {
    userId: v.id("b2cUsers"),
    postId: v.id("b2cCommunityPosts"),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.isDeleted) throw new Error("Post not found");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    const isAdmin = user.role === "admin";
    if (post.authorId !== args.userId && !isAdmin) throw new Error("Not authorized");

    await ctx.db.patch(args.postId, { isDeleted: true, updatedAt: Date.now() });

    // Decrement channel post count
    const channel = await ctx.db.get(post.channelId);
    if (channel) {
      await ctx.db.patch(post.channelId, {
        postCount: Math.max(0, channel.postCount - 1),
      });
    }

    return { success: true };
  },
});

// Create a comment on a post
export const createComment = mutation({
  args: {
    userId: v.id("b2cUsers"),
    postId: v.id("b2cCommunityPosts"),
    body: v.string(),
    parentCommentId: v.optional(v.id("b2cCommunityComments")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.subscriptionStatus !== "active") {
      throw new Error("Active subscription required");
    }

    const post = await ctx.db.get(args.postId);
    if (!post || post.isDeleted) throw new Error("Post not found");

    const body = args.body.trim();
    if (body.length === 0) throw new Error("Comment cannot be empty");
    if (body.length > MAX_COMMENT_BODY) {
      throw new Error(`Comment must be ${MAX_COMMENT_BODY} characters or less`);
    }

    // Validate parentCommentId if provided (1-level nesting only)
    if (args.parentCommentId) {
      const parentComment = await ctx.db.get(args.parentCommentId);
      if (!parentComment || parentComment.isDeleted) {
        throw new Error("Parent comment not found");
      }
      if (parentComment.postId !== args.postId) {
        throw new Error("Parent comment belongs to a different post");
      }
      if ((parentComment as any).parentCommentId) {
        throw new Error("Cannot nest replies more than 1 level deep");
      }
    }

    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const now = Date.now();
    const commentId = await ctx.db.insert("b2cCommunityComments", {
      postId: args.postId,
      channelId: post.channelId,
      authorId: args.userId,
      authorName: user.name,
      authorPhotoStorageId: profile?.photoStorageId,
      body,
      parentCommentId: args.parentCommentId,
      likeCount: 0,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    // Increment post comment count
    await ctx.db.patch(args.postId, {
      commentCount: post.commentCount + 1,
      updatedAt: now,
    });

    // Update channel activity
    const channel = await ctx.db.get(post.channelId);
    if (channel) {
      await ctx.db.patch(post.channelId, { lastActivityAt: now });
    }

    return { commentId };
  },
});

// Edit a comment (author only)
export const editComment = mutation({
  args: {
    userId: v.id("b2cUsers"),
    commentId: v.id("b2cCommunityComments"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment || comment.isDeleted) throw new Error("Comment not found");
    if (comment.authorId !== args.userId) throw new Error("Not authorized");

    const body = args.body.trim();
    if (body.length === 0) throw new Error("Comment cannot be empty");
    if (body.length > MAX_COMMENT_BODY) {
      throw new Error(`Comment must be ${MAX_COMMENT_BODY} characters or less`);
    }

    await ctx.db.patch(args.commentId, { body, updatedAt: Date.now() });
    return { success: true };
  },
});

// Soft-delete a comment (author or admin)
export const deleteComment = mutation({
  args: {
    userId: v.id("b2cUsers"),
    commentId: v.id("b2cCommunityComments"),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment || comment.isDeleted) throw new Error("Comment not found");
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    const isAdmin = user.role === "admin";
    if (comment.authorId !== args.userId && !isAdmin) throw new Error("Not authorized");

    await ctx.db.patch(args.commentId, { isDeleted: true, updatedAt: Date.now() });

    // Decrement post comment count
    const post = await ctx.db.get(comment.postId);
    if (post) {
      await ctx.db.patch(comment.postId, {
        commentCount: Math.max(0, post.commentCount - 1),
      });
    }

    return { success: true };
  },
});

// Toggle post like (idempotent)
export const togglePostLike = mutation({
  args: {
    userId: v.id("b2cUsers"),
    postId: v.id("b2cCommunityPosts"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.subscriptionStatus !== "active") {
      throw new Error("Active subscription required");
    }

    const post = await ctx.db.get(args.postId);
    if (!post || post.isDeleted) throw new Error("Post not found");

    const existing = await ctx.db
      .query("b2cCommunityPostLikes")
      .withIndex("by_post_user", (q) =>
        q.eq("postId", args.postId).eq("userId", args.userId)
      )
      .first();

    if (existing) {
      // Unlike
      await ctx.db.delete(existing._id);
      await ctx.db.patch(args.postId, {
        likeCount: Math.max(0, post.likeCount - 1),
      });
      return { liked: false };
    } else {
      // Like
      await ctx.db.insert("b2cCommunityPostLikes", {
        postId: args.postId,
        userId: args.userId,
        createdAt: Date.now(),
      });
      await ctx.db.patch(args.postId, { likeCount: post.likeCount + 1 });
      return { liked: true };
    }
  },
});

// Toggle comment like (idempotent)
export const toggleCommentLike = mutation({
  args: {
    userId: v.id("b2cUsers"),
    commentId: v.id("b2cCommunityComments"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    if (user.subscriptionStatus !== "active") {
      throw new Error("Active subscription required");
    }

    const comment = await ctx.db.get(args.commentId);
    if (!comment || comment.isDeleted) throw new Error("Comment not found");

    const existing = await ctx.db
      .query("b2cCommunityCommentLikes")
      .withIndex("by_comment_user", (q) =>
        q.eq("commentId", args.commentId).eq("userId", args.userId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(args.commentId, {
        likeCount: Math.max(0, comment.likeCount - 1),
      });
      return { liked: false };
    } else {
      await ctx.db.insert("b2cCommunityCommentLikes", {
        commentId: args.commentId,
        userId: args.userId,
        createdAt: Date.now(),
      });
      await ctx.db.patch(args.commentId, { likeCount: comment.likeCount + 1 });
      return { liked: true };
    }
  },
});

// Seed default channels (idempotent — only inserts if no channels exist)
export const seedDefaultChannels = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("b2cCommunityChannels")
      .first();

    if (existing) {
      return { seeded: false, message: "Channels already exist" };
    }

    const now = Date.now();
    for (const ch of DEFAULT_CHANNELS) {
      await ctx.db.insert("b2cCommunityChannels", {
        slug: ch.slug,
        name: ch.name,
        description: ch.description,
        order: ch.order,
        isDefault: true,
        isArchived: false,
        postCount: 0,
        createdAt: now,
      });
    }

    return { seeded: true, count: DEFAULT_CHANNELS.length };
  },
});

// Add a single channel (for seeding new channels after initial setup)
export const addChannel = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    // Check for duplicate slug
    const existing = await ctx.db
      .query("b2cCommunityChannels")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) return { id: existing._id, alreadyExists: true };

    const id = await ctx.db.insert("b2cCommunityChannels", {
      slug: args.slug,
      name: args.name,
      description: args.description,
      order: args.order,
      isDefault: true,
      isArchived: false,
      postCount: 0,
      createdAt: Date.now(),
    });
    return { id, alreadyExists: false };
  },
});

// Archive a channel (admin-only, soft delete)
export const archiveChannel = mutation({
  args: { channelId: v.id("b2cCommunityChannels") },
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new Error("Channel not found");
    await ctx.db.patch(args.channelId, { isArchived: true });
    return { archived: true, slug: channel.slug };
  },
});

// ==================== Channel Read State ====================

// Mark a channel as read (upsert last-read timestamp)
export const markChannelRead = mutation({
  args: {
    userId: v.id("b2cUsers"),
    channelId: v.id("b2cCommunityChannels"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("b2cChannelReadState")
      .withIndex("by_user_channel", (q) =>
        q.eq("userId", args.userId).eq("channelId", args.channelId)
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { lastReadAt: now });
    } else {
      await ctx.db.insert("b2cChannelReadState", {
        userId: args.userId,
        channelId: args.channelId,
        lastReadAt: now,
      });
    }
    return { success: true };
  },
});

// Get channel IDs that have unread activity for a user
export const getUnreadChannels = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const channels = await ctx.db
      .query("b2cCommunityChannels")
      .withIndex("by_order")
      .collect();
    const activeChannels = channels.filter((c) => !c.isArchived);

    const readStates = await ctx.db
      .query("b2cChannelReadState")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const readMap = new Map(readStates.map((r) => [r.channelId, r.lastReadAt]));

    const unreadIds: string[] = [];
    for (const ch of activeChannels) {
      const lastRead = readMap.get(ch._id) ?? 0;
      if (ch.lastActivityAt && ch.lastActivityAt > lastRead) {
        unreadIds.push(ch._id);
      }
    }

    return { unreadChannelIds: unreadIds };
  },
});

// ==================== Pin / Unpin (Admin Only) ====================

export const pinPost = mutation({
  args: {
    userId: v.id("b2cUsers"),
    postId: v.id("b2cCommunityPosts"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.role !== "admin") throw new Error("Admin access required");
    const post = await ctx.db.get(args.postId);
    if (!post || post.isDeleted) throw new Error("Post not found");
    await ctx.db.patch(args.postId, { isPinned: true, updatedAt: Date.now() });
    return { success: true };
  },
});

export const unpinPost = mutation({
  args: {
    userId: v.id("b2cUsers"),
    postId: v.id("b2cCommunityPosts"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.role !== "admin") throw new Error("Admin access required");
    const post = await ctx.db.get(args.postId);
    if (!post || post.isDeleted) throw new Error("Post not found");
    await ctx.db.patch(args.postId, { isPinned: false, updatedAt: Date.now() });
    return { success: true };
  },
});

// ==================== Search ====================

export const searchPosts = query({
  args: {
    query: v.string(),
    channelId: v.optional(v.id("b2cCommunityChannels")),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);
    const searchTerm = args.query.trim().toLowerCase();
    if (searchTerm.length === 0) return { posts: [], nextCursor: null };

    let posts;
    if (args.channelId) {
      posts = await ctx.db
        .query("b2cCommunityPosts")
        .withIndex("by_channel", (q) => q.eq("channelId", args.channelId!))
        .order("desc")
        .collect();
    } else {
      posts = await ctx.db
        .query("b2cCommunityPosts")
        .withIndex("by_created")
        .order("desc")
        .collect();
    }

    let filtered = posts.filter(
      (p) => !p.isDeleted && p.body.toLowerCase().includes(searchTerm)
    );
    if (args.cursor) {
      filtered = filtered.filter((p) => p.createdAt < args.cursor!);
    }

    const page = filtered.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    const enriched = await Promise.all(
      results.map(async (post) => {
        const photoUrl = await resolvePhotoUrl(ctx, post.authorPhotoStorageId);
        const channel = await ctx.db.get(post.channelId);
        const author = await ctx.db.get(post.authorId);
        return {
          ...post,
          authorPhotoUrl: photoUrl,
          authorBadges: author?.badges ?? [],
          channelName: channel?.name ?? "Unknown",
          channelSlug: channel?.slug ?? "",
          isLikedByMe: false,
          reactionCounts: (post as any).reactionCounts ?? {},
          myReactions: [] as string[],
        };
      })
    );

    return {
      posts: enriched,
      nextCursor: hasMore ? results[results.length - 1].createdAt : null,
    };
  },
});
