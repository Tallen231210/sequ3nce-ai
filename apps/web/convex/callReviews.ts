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

    // Enrich with closer names and unread reply status
    const enriched = await Promise.all(
      filtered.map(async (call) => {
        const closer = await ctx.db.get(call.closerId);

        // Check if there are closer comments newer than managerReadAt
        let hasUnreadReplies = false;
        if (call.commentCount && call.commentCount > 0) {
          const comments = await ctx.db
            .query("callComments")
            .withIndex("by_call", (q) => q.eq("callId", call._id))
            .collect();
          const closerComments = comments.filter((c) => c.authorType === "closer");
          if (closerComments.length > 0) {
            const latestCloserComment = closerComments.reduce((a, b) =>
              a.createdAt > b.createdAt ? a : b
            );
            hasUnreadReplies = !call.managerReadAt || latestCloserComment.createdAt > call.managerReadAt;
          }
        }

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
          hasUnreadReplies,
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
    closerId: v.optional(v.string()),  // Filter to moments visible to this closer
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let moments = await ctx.db
      .query("sharedMoments")
      .withIndex("by_team_recent", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .collect();

    // Filter by visibility if a specific closer is requesting
    if (args.closerId) {
      moments = moments.filter((m) => {
        // sharedWithAll true or undefined = visible to everyone
        if (m.sharedWithAll !== false) return true;
        // Otherwise check if this closer is in the list
        return m.sharedWithCloserIds?.includes(args.closerId!) ?? false;
      });
    }

    moments = moments.slice(0, limit);

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
        callId: call._id, // String alias for desktop Swift model
        prospectName: call.prospectName,
        duration: call.duration,
        recordingUrl: call.recordingUrl,
        recordingType: call.recordingType,
        commentCount: managerComments.length,
        latestCommentPreview: latestComment.content.slice(0, 100),
        latestCommentAt: latestComment.createdAt,
        lastCommentAt: latestComment.createdAt, // Alias for desktop Swift model
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

      // Get comments and find the latest manager comment
      const comments = await ctx.db
        .query("callComments")
        .withIndex("by_call", (q) => q.eq("callId", call._id))
        .collect();

      const managerComments = comments.filter(
        (c) => c.authorType === "manager"
      );
      if (managerComments.length === 0) continue;

      // Check if latest manager comment is newer than feedbackReadAt
      const latestManagerComment = managerComments[managerComments.length - 1];
      if (
        !call.feedbackReadAt ||
        latestManagerComment.createdAt > call.feedbackReadAt
      ) {
        unreadCount++;
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
      callAnalysis: call.callAnalysis,
      createdAt: call.createdAt,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
    };
  },
});

/**
 * Count flagged (pending review) calls for a team (for sidebar badge).
 */
export const getFlaggedCallCount = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) => q.eq("teamId", args.teamId))
      .collect();

    const flaggedCount = calls.filter(
      (c) =>
        c.status === "completed" &&
        c.recordingUrl &&
        c.flaggedForReview === true &&
        c.reviewStatus !== "reviewed"
    ).length;

    return { count: flaggedCount };
  },
});

/**
 * Count calls with unread closer replies for a team (for manager sidebar badge).
 * A call has an unread reply if the latest closer comment is newer than managerReadAt.
 */
export const getUnreadReplyCount = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) => q.eq("teamId", args.teamId))
      .collect();

    let unreadCount = 0;

    for (const call of calls) {
      if (call.status !== "completed" || (call.commentCount ?? 0) === 0)
        continue;

      const comments = await ctx.db
        .query("callComments")
        .withIndex("by_call", (q) => q.eq("callId", call._id))
        .collect();

      const closerComments = comments.filter(
        (c) => c.authorType === "closer"
      );
      if (closerComments.length === 0) continue;

      const latestCloserComment = closerComments[closerComments.length - 1];
      if (
        !call.managerReadAt ||
        latestCloserComment.createdAt > call.managerReadAt
      ) {
        unreadCount++;
      }
    }

    return { count: unreadCount };
  },
});

/**
 * Mark a call's comments as read by the manager.
 */
export const markManagerRead = mutation({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      managerReadAt: Date.now(),
    });
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
    authorType: v.union(v.literal("manager"), v.literal("closer")),
    authorId: v.string(),
    authorName: v.string(),
    content: v.string(),
    timestampSeconds: v.optional(v.number()),
    parentCommentId: v.optional(v.id("callComments")),
  },
  handler: async (ctx, args) => {
    // Input validation
    const content = args.content.trim();
    if (content.length === 0) throw new Error("Comment cannot be empty");
    if (content.length > 2000) throw new Error("Comment too long (max 2000 characters)");
    if (args.authorName.length > 100) throw new Error("Author name too long");

    // Verify call exists and belongs to the specified team
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    if (call.teamId !== args.teamId) throw new Error("Call does not belong to this team");

    const now = Date.now();

    // Insert the comment
    const commentId = await ctx.db.insert("callComments", {
      callId: args.callId,
      teamId: args.teamId,
      authorType: args.authorType,
      authorId: args.authorId,
      authorName: args.authorName,
      content,
      timestampSeconds: args.timestampSeconds,
      parentCommentId: args.parentCommentId,
      createdAt: now,
    });

    // Update denormalized count and timestamp on the call
    await ctx.db.patch(args.callId, {
      commentCount: (call.commentCount ?? 0) + 1,
      lastCommentAt: now,
    });

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
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
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
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
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
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
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
    sharedWithAll: v.optional(v.boolean()),
    sharedWithCloserIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Input validation
    const title = args.title.trim();
    if (title.length === 0) throw new Error("Title cannot be empty");
    if (title.length > 200) throw new Error("Title too long (max 200 characters)");
    if (args.notes && args.notes.length > 1000) throw new Error("Notes too long (max 1000 characters)");
    if (args.startSeconds >= args.endSeconds) throw new Error("Start must be before end");
    if (args.startSeconds < 0) throw new Error("Start time cannot be negative");

    // Verify call exists and belongs to team
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    if (call.teamId !== args.teamId) throw new Error("Call does not belong to this team");

    // Default to sharing with all if not specified
    const sharedWithAll = args.sharedWithAll !== false;

    const momentId = await ctx.db.insert("sharedMoments", {
      callId: args.callId,
      teamId: args.teamId,
      closerId: args.closerId,
      title,
      notes: args.notes?.trim() || undefined,
      startSeconds: args.startSeconds,
      endSeconds: args.endSeconds,
      sharedBy: args.sharedBy,
      sharedWithAll,
      sharedWithCloserIds: sharedWithAll ? undefined : args.sharedWithCloserIds,
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

/**
 * Get count of unread shared moments for a closer.
 */
export const getUnreadSharedMomentsCount = query({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return { count: 0 };

    const seenAt = closer.sharedMomentsSeenAt ?? 0;

    // Get moments for this closer's team created after seenAt
    const moments = await ctx.db
      .query("sharedMoments")
      .withIndex("by_team_recent", (q) => q.eq("teamId", closer.teamId))
      .order("desc")
      .collect();

    const unread = moments.filter((m) => {
      if (m.createdAt <= seenAt) return false;
      // Check visibility
      if (m.sharedWithAll !== false) return true;
      return m.sharedWithCloserIds?.includes(args.closerId) ?? false;
    });

    return { count: unread.length };
  },
});

/**
 * Mark shared moments as seen for a closer.
 */
export const markSharedMomentsSeen = mutation({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.closerId, {
      sharedMomentsSeenAt: Date.now(),
    });
  },
});
