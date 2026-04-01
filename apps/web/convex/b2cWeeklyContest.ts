import { v } from "convex/values";
import { mutation, internalQuery, query } from "./_generated/server";

const MAX_TITLE = 100;
const MAX_DESCRIPTION = 500;
const MAX_SHARE_URL = 500;

/** Sort submissions by votes descending, earliest submission as tiebreaker */
function compareSubmissions(
  a: { voteCount: number; createdAt: number },
  b: { voteCount: number; createdAt: number },
): number {
  return b.voteCount - a.voteCount || a.createdAt - b.createdAt;
}

// ==================== Mutations ====================

// Founder creates a new weekly contest
export const createContest = mutation({
  args: {
    createdBy: v.id("b2cUsers"),
    title: v.string(),
    description: v.optional(v.string()),
    prizeAmount: v.number(),
    weekStartDate: v.string(),
    weekEndDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.createdBy);
    if (!user) throw new Error("User not found");
    if (!user.badges?.includes("founder")) throw new Error("Only founders can create contests");
    if (!args.title.trim() || args.title.length > MAX_TITLE) throw new Error("Title required (max 100 chars)");
    if (args.description && args.description.length > MAX_DESCRIPTION) throw new Error("Description too long");
    if (args.prizeAmount < 0) throw new Error("Prize must be positive");

    // Check no active contest exists
    const existing = await ctx.db
      .query("b2cWeeklyContests")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
    if (existing) throw new Error("An active contest already exists. Complete it first.");

    const contestId = await ctx.db.insert("b2cWeeklyContests", {
      title: args.title.trim(),
      description: args.description?.trim(),
      prizeAmount: args.prizeAmount,
      status: "active",
      createdBy: args.createdBy,
      weekStartDate: args.weekStartDate,
      weekEndDate: args.weekEndDate,
      createdAt: Date.now(),
    });

    return { contestId };
  },
});

// User submits an entry to the active contest
export const submitEntry = mutation({
  args: {
    userId: v.id("b2cUsers"),
    contestId: v.id("b2cWeeklyContests"),
    type: v.string(),
    clipId: v.optional(v.id("b2cHighlightClips")),
    shareUrl: v.optional(v.string()),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const contest = await ctx.db.get(args.contestId);
    if (!contest) throw new Error("Contest not found");
    if (contest.status !== "active") throw new Error("Contest is no longer accepting submissions");

    if (!args.title.trim() || args.title.length > MAX_TITLE) throw new Error("Title required (max 100 chars)");

    // Validate submission type
    if (args.type === "highlight") {
      if (!args.clipId) throw new Error("Clip ID required for highlight submissions");
      const clip = await ctx.db.get(args.clipId);
      if (!clip || clip.userId !== args.userId) throw new Error("Clip not found or not yours");
    } else if (args.type === "share_link") {
      if (!args.shareUrl || !args.shareUrl.startsWith("https://sequ3nce.ai/")) {
        throw new Error("Must be a valid Sequ3nce share link");
      }
      if (args.shareUrl.length > MAX_SHARE_URL) throw new Error("URL too long");
    } else {
      throw new Error("Invalid submission type");
    }

    // Check for existing submission
    const existing = await ctx.db
      .query("b2cWeeklySubmissions")
      .withIndex("by_user_contest", (q) => q.eq("userId", args.userId).eq("contestId", args.contestId))
      .first();
    if (existing) throw new Error("You already submitted to this contest");

    const submissionId = await ctx.db.insert("b2cWeeklySubmissions", {
      contestId: args.contestId,
      userId: args.userId,
      type: args.type,
      clipId: args.clipId,
      shareUrl: args.shareUrl?.trim(),
      title: args.title.trim(),
      voteCount: 0,
      createdAt: Date.now(),
    });

    return { submissionId };
  },
});

// Cast a vote (one per user per contest, can change)
export const castVote = mutation({
  args: {
    userId: v.id("b2cUsers"),
    contestId: v.id("b2cWeeklyContests"),
    submissionId: v.id("b2cWeeklySubmissions"),
  },
  handler: async (ctx, args) => {
    const contest = await ctx.db.get(args.contestId);
    if (!contest || contest.status !== "active") throw new Error("Contest not active");

    const submission = await ctx.db.get(args.submissionId);
    if (!submission || submission.contestId !== args.contestId) throw new Error("Submission not found");
    if (submission.userId === args.userId) throw new Error("Cannot vote for your own submission");

    // Check for existing vote
    const existingVote = await ctx.db
      .query("b2cWeeklyVotes")
      .withIndex("by_user_contest", (q) => q.eq("userId", args.userId).eq("contestId", args.contestId))
      .first();

    if (existingVote) {
      // Remove old vote
      const oldSubmission = await ctx.db.get(existingVote.submissionId);
      if (oldSubmission) {
        await ctx.db.patch(oldSubmission._id, { voteCount: Math.max(0, oldSubmission.voteCount - 1) });
      }
      await ctx.db.delete(existingVote._id);
    }

    // Cast new vote
    await ctx.db.insert("b2cWeeklyVotes", {
      contestId: args.contestId,
      userId: args.userId,
      submissionId: args.submissionId,
      createdAt: Date.now(),
    });

    // Increment vote count
    await ctx.db.patch(args.submissionId, { voteCount: submission.voteCount + 1 });

    return { success: true };
  },
});

// Remove vote
export const removeVote = mutation({
  args: {
    userId: v.id("b2cUsers"),
    contestId: v.id("b2cWeeklyContests"),
  },
  handler: async (ctx, args) => {
    const existingVote = await ctx.db
      .query("b2cWeeklyVotes")
      .withIndex("by_user_contest", (q) => q.eq("userId", args.userId).eq("contestId", args.contestId))
      .first();

    if (!existingVote) return { success: true };

    const submission = await ctx.db.get(existingVote.submissionId);
    if (submission) {
      await ctx.db.patch(submission._id, { voteCount: Math.max(0, submission.voteCount - 1) });
    }
    await ctx.db.delete(existingVote._id);

    return { success: true };
  },
});

// Complete contest — pick winner (highest votes, earliest submission as tiebreaker)
export const completeContest = mutation({
  args: {
    contestId: v.id("b2cWeeklyContests"),
    reviewerUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const reviewer = await ctx.db.get(args.reviewerUserId);
    if (!reviewer?.badges?.includes("founder")) throw new Error("Only founders can complete contests");

    const contest = await ctx.db.get(args.contestId);
    if (!contest) throw new Error("Contest not found");
    if (contest.status !== "active") throw new Error("Contest already completed");

    const submissions = await ctx.db
      .query("b2cWeeklySubmissions")
      .withIndex("by_contest", (q) => q.eq("contestId", args.contestId))
      .collect();

    submissions.sort(compareSubmissions);

    const winner = submissions[0];

    await ctx.db.patch(args.contestId, {
      status: "completed",
      winnerId: winner?.userId,
      winnerSubmissionId: winner?._id,
    });

    return { success: true, winnerId: winner?.userId };
  },
});

// ==================== Queries ====================

export const getActiveContest = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("b2cWeeklyContests")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
  },
});

export const getContestSubmissions = internalQuery({
  args: { contestId: v.id("b2cWeeklyContests") },
  handler: async (ctx, args) => {
    const submissions = await ctx.db
      .query("b2cWeeklySubmissions")
      .withIndex("by_contest", (q) => q.eq("contestId", args.contestId))
      .collect();

    submissions.sort(compareSubmissions);

    // Enrich with user info
    return await Promise.all(
      submissions.map(async (sub) => {
        const user = await ctx.db.get(sub.userId);
        let recordingUrl: string | null = null;
        if (sub.clipId) {
          const clip = await ctx.db.get(sub.clipId);
          if (clip) {
            const call = await ctx.db.get(clip.callId);
            recordingUrl = call?.recordingUrl ?? null;
          }
        }
        return {
          ...sub,
          submitterName: user?.name ?? "Unknown",
          recordingUrl,
        };
      })
    );
  },
});

export const getMySubmission = internalQuery({
  args: { userId: v.id("b2cUsers"), contestId: v.id("b2cWeeklyContests") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("b2cWeeklySubmissions")
      .withIndex("by_user_contest", (q) => q.eq("userId", args.userId).eq("contestId", args.contestId))
      .first();
  },
});

export const getMyVote = internalQuery({
  args: { userId: v.id("b2cUsers"), contestId: v.id("b2cWeeklyContests") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("b2cWeeklyVotes")
      .withIndex("by_user_contest", (q) => q.eq("userId", args.userId).eq("contestId", args.contestId))
      .first();
  },
});

export const getPastContests = query({
  args: {},
  handler: async (ctx) => {
    const contests = await ctx.db
      .query("b2cWeeklyContests")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .order("desc")
      .take(20);

    // Enrich with winner info
    return await Promise.all(
      contests.map(async (contest) => {
        let winnerName: string | null = null;
        let winnerSubmissionTitle: string | null = null;
        if (contest.winnerId) {
          const winner = await ctx.db.get(contest.winnerId);
          winnerName = winner?.name ?? null;
        }
        if (contest.winnerSubmissionId) {
          const sub = await ctx.db.get(contest.winnerSubmissionId);
          winnerSubmissionTitle = sub?.title ?? null;
        }
        return { ...contest, winnerName, winnerSubmissionTitle };
      })
    );
  },
});
