import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;

const VALID_STATUSES = ["open", "planned", "in_progress", "shipped"];

// ==================== Mutations ====================

/** Submit a new feature request. */
export const createRequest = mutation({
  args: {
    userId: v.id("b2cUsers"),
    title: v.string(),
    description: v.string(),
  },
  handler: async (ctx, { userId, title, description }) => {
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();

    if (!trimmedTitle || trimmedTitle.length > MAX_TITLE_LENGTH) {
      throw new Error(`Title is required and must be under ${MAX_TITLE_LENGTH} characters`);
    }
    if (!trimmedDesc || trimmedDesc.length > MAX_DESCRIPTION_LENGTH) {
      throw new Error(`Description is required and must be under ${MAX_DESCRIPTION_LENGTH} characters`);
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const id = await ctx.db.insert("b2cFeatureRequests", {
      authorId: userId,
      authorName: user.name,
      title: trimmedTitle,
      description: trimmedDesc,
      status: "open",
      upvoteCount: 0,
      commentCount: 0,
      isDeleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return id;
  },
});

/** Upvote a feature request. Idempotent — does nothing if already voted. */
export const upvoteRequest = mutation({
  args: {
    userId: v.id("b2cUsers"),
    requestId: v.id("b2cFeatureRequests"),
  },
  handler: async (ctx, { userId, requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request || request.isDeleted) throw new Error("Request not found");

    // Check if already voted (O(1) via composite index)
    const existing = await ctx.db
      .query("b2cFeatureRequestVotes")
      .withIndex("by_user_request", (q) => q.eq("userId", userId).eq("requestId", requestId))
      .first();

    if (existing) return { alreadyVoted: true }; // Idempotent

    await ctx.db.insert("b2cFeatureRequestVotes", {
      requestId,
      userId,
      createdAt: Date.now(),
    });

    await ctx.db.patch(requestId, {
      upvoteCount: request.upvoteCount + 1,
    });

    return { success: true };
  },
});

/** Remove an upvote from a feature request. */
export const removeUpvote = mutation({
  args: {
    userId: v.id("b2cUsers"),
    requestId: v.id("b2cFeatureRequests"),
  },
  handler: async (ctx, { userId, requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Request not found");

    const vote = await ctx.db
      .query("b2cFeatureRequestVotes")
      .withIndex("by_user_request", (q) => q.eq("userId", userId).eq("requestId", requestId))
      .first();

    if (!vote) return { notVoted: true };

    await ctx.db.delete(vote._id);
    await ctx.db.patch(requestId, {
      upvoteCount: Math.max(0, request.upvoteCount - 1),
    });

    return { success: true };
  },
});

/** Update a request's status. Founder/admin only. */
export const updateStatus = mutation({
  args: {
    userId: v.id("b2cUsers"),
    requestId: v.id("b2cFeatureRequests"),
    status: v.string(),
  },
  handler: async (ctx, { userId, requestId, status }) => {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`);
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Check for founder/admin badge
    const badges = (user as any).badges as string[] | undefined;
    if (!badges?.includes("founder") && !badges?.includes("admin")) {
      throw new Error("Only admins can update request status");
    }

    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Request not found");

    await ctx.db.patch(requestId, { status, updatedAt: Date.now() });
    return { success: true };
  },
});

/** Soft-delete a request. Author or admin. */
export const deleteRequest = mutation({
  args: {
    userId: v.id("b2cUsers"),
    requestId: v.id("b2cFeatureRequests"),
  },
  handler: async (ctx, { userId, requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("Request not found");

    const user = await ctx.db.get(userId);
    const badges = (user as any)?.badges as string[] | undefined;
    const isAdmin = badges?.includes("founder") || badges?.includes("admin");

    if (request.authorId !== userId && !isAdmin) {
      throw new Error("Only the author or an admin can delete this request");
    }

    await ctx.db.patch(requestId, { isDeleted: true, updatedAt: Date.now() });
    return { success: true };
  },
});

// ==================== Queries ====================

/** List feature requests, sorted by popular or newest. Enriched with user's vote status. */
export const listRequests = query({
  args: {
    userId: v.optional(v.id("b2cUsers")),
    sortBy: v.optional(v.string()), // "popular" | "newest"
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, sortBy, limit }) => {
    const take = Math.min(limit ?? 50, 100);

    // Fetch all non-deleted requests
    const requests = await ctx.db
      .query("b2cFeatureRequests")
      .withIndex("by_created", (q) => q.eq("isDeleted", false))
      .order("desc")
      .collect();

    // Sort
    const sorted = sortBy === "popular"
      ? requests.sort((a, b) => b.upvoteCount - a.upvoteCount || b.createdAt - a.createdAt)
      : requests; // already newest first from the query

    const page = sorted.slice(0, take);

    // Enrich with user's vote status
    if (userId) {
      const userVotes = await ctx.db
        .query("b2cFeatureRequestVotes")
        .withIndex("by_user_request", (q) => q.eq("userId", userId))
        .collect();
      const votedRequestIds = new Set(userVotes.map((v) => v.requestId));

      return page.map((r) => ({
        ...r,
        hasVoted: votedRequestIds.has(r._id),
      }));
    }

    return page.map((r) => ({ ...r, hasVoted: false }));
  },
});
