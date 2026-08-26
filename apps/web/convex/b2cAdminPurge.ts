import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// One-time-use purge machinery for TEST accounts. Internal-only — never
// exposed over HTTP. A B2C account is b2cUsers + closers + a personal
// workspace team + everything created lazily; the existing deleters all leak
// (deleteCall misses callStats/callContent, deleteTeam can't even run on
// personal workspaces), so this walks every referencing table itself.
//
// Every write is gated on `dryRun` — a dry run performs the identical walk
// and returns identical per-table counts without touching a row.
// ============================================================================

type Report = Record<string, number>;

function bump(report: Report, table: string, n = 1) {
  if (n > 0) report[table] = (report[table] ?? 0) + n;
}

/** Delete (or count) every row an index prefix-scan finds. */
async function sweep(
  ctx: any,
  dry: boolean,
  report: Report,
  table: string,
  index: string,
  field: string,
  value: unknown,
) {
  const rows = await ctx.db
    .query(table)
    .withIndex(index, (q: any) => q.eq(field, value))
    .collect();
  for (const row of rows) {
    if (!dry) await ctx.db.delete(row._id);
  }
  bump(report, table, rows.length);
  return rows;
}

/** Resolve the account triple from an email, or null if no such user. */
async function resolveAccount(ctx: any, email: string) {
  const user = await ctx.db
    .query("b2cUsers")
    .withIndex("by_email", (q: any) => q.eq("email", email.toLowerCase()))
    .first();
  if (!user) return null;
  const teamId = user.personalWorkspaceId as Id<"teams"> | undefined;
  const closer = teamId
    ? await ctx.db
        .query("closers")
        .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
        .first()
    : null;
  return { user, teamId: teamId ?? null, closer };
}

// Tables hanging off a single call, all indexed by_call (or a by_call prefix).
const CALL_CHILDREN: Array<[string, string]> = [
  ["callStats", "by_call"],
  ["callContent", "by_call"],
  ["transcriptSegments", "by_call"],
  ["ammo", "by_call"],
  ["objections", "by_call"],
  ["highlights", "by_call"],
  ["callComments", "by_call"],
  ["sharedMoments", "by_call"],
  ["sharedLinks", "by_call"],
  ["liveStreams", "by_call"],
  ["slackNotifications", "by_call_and_type"],
];

/**
 * Deletes a batch of the account's calls WITH all their children — including
 * the callStats sidecar and callContent, which the stock deleteCall leaks.
 * Transcript segments can run to hundreds of rows per real call, so the
 * driver action calls this repeatedly until remaining hits zero.
 */
export const purgeCallsBatch = internalMutation({
  args: {
    email: v.string(),
    dryRun: v.boolean(),
    batch: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const account = await resolveAccount(ctx, args.email);
    if (!account) return { deleted: 0, remaining: 0, report: {} as Report };
    const batch = Math.min(Math.max(args.batch ?? 4, 1), 10);

    const report: Report = {};
    const calls = account.closer
      ? await ctx.db
          .query("calls")
          .withIndex("by_closer", (q: any) => q.eq("closerId", account.closer._id))
          .collect()
      : [];
    const slice = calls.slice(0, batch);
    for (const call of slice) {
      for (const [table, index] of CALL_CHILDREN) {
        await sweep(ctx, args.dryRun, report, table, index, "callId", call._id);
      }
      // callStats.closerId is a plain string, so a stray-row sweep by call is
      // the reliable path (done above); nothing else references the call.
      if (!args.dryRun) await ctx.db.delete(call._id);
      bump(report, "calls");
    }
    return {
      deleted: slice.length,
      remaining: args.dryRun ? 0 : calls.length - slice.length,
      totalCalls: calls.length,
      report,
    };
  },
});

// Straightforward per-user sweeps: [table, index, field]. Field value is the
// b2cUserId. Order doesn't matter — none of these reference each other.
const USER_SWEEPS: Array<[string, string, string]> = [
  ["b2cChannelReadState", "by_user", "userId"],
  ["b2cMoneyBellOptIns", "by_user", "userId"],
  ["b2cGoalTrackerSettings", "by_user", "userId"],
  ["b2cPersonalGoals", "by_user", "userId"],
  ["b2cCoachingCallAttendance", "by_user", "userId"],
  ["b2cCoachingReplayWatched", "by_user", "userId"],
  ["b2cAdoptionChecklist", "by_user", "userId"],
  ["b2cPublicJobTracking", "by_user", "userId"],
  ["b2cBugReports", "by_author", "authorId"],
  ["streamSettings", "by_user", "b2cUserId"],
  ["streamTranscriptions", "by_user_and_date", "b2cUserId"],
  ["b2cTeamBroadcasts", "by_sent_by", "sentBy"],
];

/** Decrement one emoji in a reactionCounts blob, dropping the key at zero. */
function decrementReaction(counts: any, emoji: string) {
  const next = { ...(counts ?? {}) };
  const n = (next[emoji] ?? 0) - 1;
  if (n > 0) next[emoji] = n;
  else delete next[emoji];
  return next;
}

/** Hard-delete a community post with all its children + the channel counter. */
export async function hardDeletePost(
  ctx: any,
  dry: boolean,
  report: Report,
  post: any,
) {
  const comments = await ctx.db
    .query("b2cCommunityComments")
    .withIndex("by_post", (q: any) => q.eq("postId", post._id))
    .collect();
  for (const c of comments) {
    await sweep(ctx, dry, report, "b2cCommunityCommentLikes", "by_comment_user", "commentId", c._id);
    const cReactions = await ctx.db
      .query("b2cCommunityReactions")
      .withIndex("by_target", (q: any) => q.eq("targetType", "comment").eq("targetId", String(c._id)))
      .collect();
    for (const r of cReactions) if (!dry) await ctx.db.delete(r._id);
    bump(report, "b2cCommunityReactions", cReactions.length);
    if (!dry) await ctx.db.delete(c._id);
  }
  bump(report, "b2cCommunityComments", comments.length);
  // reactions/likes on the post itself
  const reactions = await ctx.db
    .query("b2cCommunityReactions")
    .withIndex("by_target", (q: any) => q.eq("targetType", "post").eq("targetId", String(post._id)))
    .collect();
  for (const r of reactions) if (!dry) await ctx.db.delete(r._id);
  bump(report, "b2cCommunityReactions", reactions.length);
  await sweep(ctx, dry, report, "b2cCommunityPostLikes", "by_post_user", "postId", post._id);
  if (!post.isDeleted) {
    const channel = await ctx.db.get(post.channelId);
    if (channel && !dry) {
      await ctx.db.patch(post.channelId, { postCount: Math.max(0, channel.postCount - 1) });
    }
  }
  if (!dry) await ctx.db.delete(post._id);
  bump(report, "b2cCommunityPosts");
}

export const purgeUserSweeps = internalMutation({
  args: { email: v.string(), dryRun: v.boolean() },
  handler: async (ctx, args) => {
    const account = await resolveAccount(ctx, args.email);
    if (!account) return { report: {} as Report, warnings: ["no such user"] };
    const dry = args.dryRun;
    const userId = account.user._id;
    const report: Report = {};
    const warnings: string[] = [];
    const storageIds: string[] = [];

    for (const [table, index, field] of USER_SWEEPS) {
      await sweep(ctx, dry, report, table, index, field, userId);
    }

    // --- Community content with counters -----------------------------------
    // Own posts (with children + channel counters)
    const posts = await ctx.db
      .query("b2cCommunityPosts")
      .withIndex("by_author", (q: any) => q.eq("authorId", userId))
      .collect();
    for (const post of posts) await hardDeletePost(ctx, dry, report, post);

    // Own comments on OTHER posts — decrement that post's commentCount
    const comments = await ctx.db
      .query("b2cCommunityComments")
      .withIndex("by_author", (q: any) => q.eq("authorId", userId))
      .collect();
    for (const c of comments) {
      await sweep(ctx, dry, report, "b2cCommunityCommentLikes", "by_comment_user", "commentId", c._id);
      const post = await ctx.db.get(c.postId);
      if (post && post.authorId !== userId && !c.isDeleted && !dry) {
        await ctx.db.patch(c.postId, { commentCount: Math.max(0, post.commentCount - 1) });
      }
      if (!dry) await ctx.db.delete(c._id);
    }
    bump(report, "b2cCommunityComments", comments.length);

    // Likes the user left on others' content
    const postLikes = await ctx.db
      .query("b2cCommunityPostLikes")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect();
    for (const like of postLikes) {
      const post = await ctx.db.get(like.postId);
      if (post && post.authorId !== userId && !dry) {
        await ctx.db.patch(like.postId, { likeCount: Math.max(0, post.likeCount - 1) });
      }
      if (!dry) await ctx.db.delete(like._id);
    }
    bump(report, "b2cCommunityPostLikes", postLikes.length);

    const commentLikes = await ctx.db
      .query("b2cCommunityCommentLikes")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect();
    for (const like of commentLikes) {
      const c = await ctx.db.get(like.commentId);
      if (c && c.authorId !== userId && !dry) {
        await ctx.db.patch(like.commentId, { likeCount: Math.max(0, c.likeCount - 1) });
      }
      if (!dry) await ctx.db.delete(like._id);
    }
    bump(report, "b2cCommunityCommentLikes", commentLikes.length);

    // Emoji reactions the user left anywhere — re-derive the target's blob
    const reactions = await ctx.db
      .query("b2cCommunityReactions")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect();
    for (const r of reactions) {
      // targetId is a plain string in the schema — normalize it against the
      // right table so a stale/malformed id degrades to a skip, not a throw.
      const targetTable =
        r.targetType === "post" ? "b2cCommunityPosts" : "b2cCommunityComments";
      const targetId = ctx.db.normalizeId(targetTable, r.targetId);
      const target: any = targetId ? await ctx.db.get(targetId) : null;
      if (target && targetId && target.authorId !== userId && !dry) {
        await ctx.db.patch(targetId, {
          reactionCounts: decrementReaction(target.reactionCounts, r.emoji),
        });
      }
      if (!dry) await ctx.db.delete(r._id);
    }
    bump(report, "b2cCommunityReactions", reactions.length);

    // --- Money Bells --------------------------------------------------------
    const broadcasts = await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .withIndex("by_user_month", (q: any) => q.eq("userId", userId))
      .collect();
    for (const b of broadcasts) {
      if (b.postId) {
        const post = await ctx.db.get(b.postId);
        if (post) await hardDeletePost(ctx, dry, report, post);
      }
      if (!dry) await ctx.db.delete(b._id);
    }
    bump(report, "b2cMoneyBellBroadcasts", broadcasts.length);

    const prizes = await ctx.db.query("b2cMoneyBellPrizes").collect();
    for (const p of prizes) {
      const patch: any = {};
      if (p.winnerUserId === userId) patch.winnerUserId = undefined;
      if (p.winner2UserId === userId) patch.winner2UserId = undefined;
      if (p.winner3UserId === userId) patch.winner3UserId = undefined;
      if (Object.keys(patch).length) {
        bump(report, "b2cMoneyBellPrizes(winner unset)");
        if (!dry) await ctx.db.patch(p._id, patch);
      }
    }

    return { report, warnings, storageIds };
  },
});
