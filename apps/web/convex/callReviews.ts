import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ──────────────────────────────────────────────
// QUERIES
// ──────────────────────────────────────────────

/**
 * Get calls for the Call Reviews list (manager web dashboard).
 * Returns calls with video recordings, prioritizing flagged → reviewed → all.
 */
export const getCallsForReview = query({
  args: {
    teamId: v.id("teams"),
    closerId: v.optional(v.id("closers")),
    status: v.optional(v.string()), // "flagged" | "reviewed" | "all"
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Get all completed calls with video recordings for this team
    let callsQuery = ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) => q.eq("teamId", args.teamId))
      .order("desc");

    const allCalls = await callsQuery.collect();

    // Filter to completed calls with video recordings
    let filtered = allCalls.filter(
      (c) =>
        c.status === "completed" &&
        c.recordingUrl &&
        c.recordingType === "video"
    );

    // Apply closer filter
    if (args.closerId) {
      filtered = filtered.filter((c) => c.closerId === args.closerId);
    }

    // Apply status filter
    if (args.status === "flagged") {
      filtered = filtered.filter(
        (c) => c.flaggedForReview === true && c.reviewStatus !== "reviewed"
      );
    } else if (args.status === "reviewed") {
      filtered = filtered.filter((c) => c.reviewStatus === "reviewed");
    }

    // Limit results
    filtered = filtered.slice(0, limit);

    // Enrich with closer names
    const enriched = await Promise.all(
      filtered.map(async (call) => {
        const closer = await ctx.db.get(call.closerId);
        return {
          _id: call._id,
          closerId: call.closerId,
          closerName: closer?.name ?? "Unknown",
          prospectName: call.prospectName,
          status: call.status,
          outcome: call.outcome,
          duration: call.duration,
          recordingUrl: call.recordingUrl,
          recordingType: call.recordingType,
          flaggedForReview: call.flaggedForReview,
          flaggedAt: call.flaggedAt,
          reviewStatus: call.reviewStatus,
          reviewedAt: call.reviewedAt,
          commentCount: call.commentCount ?? 0,
          lastCommentAt: call.lastCommentAt,
          createdAt: call.createdAt,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
          summary: call.summary,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get all comments for a specific call, sorted by creation time.
 */
export const getCommentsForCall = query({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("callComments")
      .withIndex("by_call_and_time", (q) => q.eq("callId", args.callId))
      .order("asc")
      .collect();

    return comments;
  },
});

/**
 * Get shared moments for a team, sorted by most recent.
 */
export const getSharedMoments = query({
  args: {
    teamId: v.id("teams"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const moments = await ctx.db
      .query("sharedMoments")
      .withIndex("by_team_recent", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(limit);

    // Enrich with call and closer data
    const enriched = await Promise.all(
      moments.map(async (moment) => {
        const call = await ctx.db.get(moment.callId);
        const closer = moment.closerId
          ? await ctx.db.get(moment.closerId)
          : null;
        const sharedByUser = await ctx.db.get(moment.sharedBy);

        return {
          ...moment,
          closerName: closer?.name ?? "Unknown",
          prospectName: call?.prospectName,
          recordingUrl: call?.recordingUrl,
          sharedByName: sharedByUser?.name ?? "Manager",
          callCreatedAt: call?.createdAt,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get shared moments for a specific call.
 */
export const getSharedMomentsByCall = query({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const moments = await ctx.db
      .query("sharedMoments")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();

    return moments;
  },
});

/**
 * Get calls with manager feedback for a specific closer (desktop Coaching > Your Feedback).
 * Returns calls where this closer has at least one manager comment.
 */
export const getFeedbackForCloser = query({
  args: {
    closerId: v.id("closers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Get closer's completed calls that have comments
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .order("desc")
      .collect();

    // Filter to calls with manager comments
    const withFeedback = calls.filter(
      (c) =>
        c.status === "completed" &&
        (c.commentCount ?? 0) > 0
    );

    // For each call, check if there are actually manager comments
    const enriched = [];
    for (const call of withFeedback) {
      if (enriched.length >= limit) break;

      const comments = await ctx.db
        .query("callComments")
        .withIndex("by_call", (q) => q.eq("callId", call._id))
        .collect();

      const managerComments = comments.filter(
        (c) => c.authorType === "manager"
      );

      if (managerComments.length === 0) continue;

      // Get latest manager comment for preview
      const latestComment = managerComments[managerComments.length - 1];

      enriched.push({
        _id: call._id,
        prospectName: call.prospectName,
        duration: call.duration,
        recordingUrl: call.recordingUrl,
        recordingType: call.recordingType,
        commentCount: managerComments.length,
        latestCommentPreview: latestComment.content.slice(0, 100),
        latestCommentAt: latestComment.createdAt,
        feedbackReadAt: call.feedbackReadAt,
        isUnread:
          !call.feedbackReadAt ||
          latestComment.createdAt > call.feedbackReadAt,
        createdAt: call.createdAt,
        startedAt: call.startedAt,
      });
    }

    return enriched;
  },
});

/**
 * Count unread feedback for a closer (for badge on Coaching tab).
 */
export const getUnreadFeedbackCount = query({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    let unreadCount = 0;

    for (const call of calls) {
      if (call.status !== "completed" || (call.commentCount ?? 0) === 0)
        continue;

      // Check if there are manager comments newer than feedbackReadAt
      if (
        call.lastCommentAt &&
        (!call.feedbackReadAt || call.lastCommentAt > call.feedbackReadAt)
      ) {
        // Verify at least one manager comment exists
        const comments = await ctx.db
          .query("callComments")
          .withIndex("by_call", (q) => q.eq("callId", call._id))
          .collect();

        const hasManagerComment = comments.some(
          (c) => c.authorType === "manager"
        );
        if (hasManagerComment) {
          unreadCount++;
        }
      }
    }

    return { count: unreadCount };
  },
});

/**
 * Get a single call with review data (for review view header).
 */
export const getCallForReview = query({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;

    const closer = await ctx.db.get(call.closerId);

    return {
      _id: call._id,
      closerId: call.closerId,
      closerName: closer?.name ?? "Unknown",
      teamId: call.teamId,
      prospectName: call.prospectName,
      status: call.status,
      outcome: call.outcome,
      duration: call.duration,
      recordingUrl: call.recordingUrl,
      recordingType: call.recordingType,
      transcriptText: call.transcriptText,
      flaggedForReview: call.flaggedForReview,
      flaggedAt: call.flaggedAt,
      reviewStatus: call.reviewStatus,
      reviewedAt: call.reviewedAt,
      commentCount: call.commentCount ?? 0,
      summary: call.summary,
      createdAt: call.createdAt,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
    };
  },
});

// ──────────────────────────────────────────────
// MUTATIONS
// ──────────────────────────────────────────────

/**
 * Add a comment to a call.
 */
export const addComment = mutation({
  args: {
    callId: v.id("calls"),
    teamId: v.id("teams"),
    authorType: v.string(),
    authorId: v.string(),
    authorName: v.string(),
    content: v.string(),
    timestampSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Insert the comment
    const commentId = await ctx.db.insert("callComments", {
      callId: args.callId,
      teamId: args.teamId,
      authorType: args.authorType,
      authorId: args.authorId,
      authorName: args.authorName,
      content: args.content,
      timestampSeconds: args.timestampSeconds,
      createdAt: now,
    });

    // Update denormalized count and timestamp on the call
    const call = await ctx.db.get(args.callId);
    if (call) {
      await ctx.db.patch(args.callId, {
        commentCount: (call.commentCount ?? 0) + 1,
        lastCommentAt: now,
      });
    }

    return commentId;
  },
});

/**
 * Delete a comment (only by the author).
 */
export const deleteComment = mutation({
  args: {
    commentId: v.id("callComments"),
    authorId: v.string(),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new Error("Comment not found");
    if (comment.authorId !== args.authorId)
      throw new Error("Not authorized to delete this comment");

    // Delete the comment
    await ctx.db.delete(args.commentId);

    // Decrement count on the call
    const call = await ctx.db.get(comment.callId);
    if (call) {
      await ctx.db.patch(comment.callId, {
        commentCount: Math.max(0, (call.commentCount ?? 1) - 1),
      });
    }
  },
});

/**
 * Flag a call for manager review (closer action).
 */
export const flagCallForReview = mutation({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      flaggedForReview: true,
      flaggedAt: Date.now(),
      reviewStatus: "pending",
    });
  },
});

/**
 * Unflag a call (closer undo).
 */
export const unflagCall = mutation({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      flaggedForReview: false,
      flaggedAt: undefined,
      reviewStatus: undefined,
    });
  },
});

/**
 * Mark a call as reviewed (manager action).
 */
export const markAsReviewed = mutation({
  args: {
    callId: v.id("calls"),
    reviewedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      reviewStatus: "reviewed",
      reviewedAt: Date.now(),
      reviewedBy: args.reviewedBy,
    });
  },
});

/**
 * Share a call moment with the team.
 */
export const shareCallMoment = mutation({
  args: {
    callId: v.id("calls"),
    teamId: v.id("teams"),
    closerId: v.id("closers"),
    title: v.string(),
    notes: v.optional(v.string()),
    startSeconds: v.number(),
    endSeconds: v.number(),
    sharedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const momentId = await ctx.db.insert("sharedMoments", {
      callId: args.callId,
      teamId: args.teamId,
      closerId: args.closerId,
      title: args.title,
      notes: args.notes,
      startSeconds: args.startSeconds,
      endSeconds: args.endSeconds,
      sharedBy: args.sharedBy,
      createdAt: Date.now(),
    });

    return momentId;
  },
});

/**
 * Mark feedback as read for a closer (resets unread badge).
 */
export const markFeedbackRead = mutation({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      feedbackReadAt: Date.now(),
    });
  },
});
