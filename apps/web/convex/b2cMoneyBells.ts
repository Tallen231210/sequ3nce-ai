import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ==================== Constants ====================

const MAX_CASH_COLLECTED = 10_000_000;         // $10M sanity cap per broadcast
const MAX_NOTE_LENGTH = 140;                   // chars
const SELF_DELETE_WINDOW_MS = 60 * 60 * 1000;  // 1 hour
const LEADERBOARD_PAGE_SIZE = 5;
const FEED_PAGE_SIZE = 30;
const MAX_FEED_PAGE_SIZE = 50;
const MONEY_BELLS_CHANNEL_SLUG = "money-bells";

// ==================== Helpers ====================

function isFounder(user: { badges?: string[] } | null): boolean {
  const badges = user?.badges as string[] | undefined;
  return !!badges?.includes("founder") || !!badges?.includes("admin");
}

function getMonthKey(timestamp: number): string {
  const d = new Date(timestamp);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function previousMonthKey(currentMonthKey: string): string {
  const [yearStr, monthStr] = currentMonthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
}

function daysLeftInMonth(monthKey: string, now: number = Date.now()): number {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  // First day of next month at UTC
  const nextMonthStart = Date.UTC(
    month === 12 ? year + 1 : year,
    month === 12 ? 0 : month,
    1,
    0,
    0,
    0
  );
  const ms = nextMonthStart - now;
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

async function resolvePhotoUrl(
  ctx: { storage: { getUrl: (id: string) => Promise<string | null> } },
  storageId: string | undefined | null
): Promise<string | null> {
  if (!storageId) return null;
  return await ctx.storage.getUrl(storageId);
}

// ==================== Mutations ====================

// User opts into Money Bells — must acknowledge honor-system warning
export const joinMoneyBells = mutation({
  args: {
    userId: v.id("b2cUsers"),
    acknowledgedWarning: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.acknowledgedWarning) {
      throw new Error("You must acknowledge the Money Bells rules to join");
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    // Cloaking (2026-09-03 demo-rep audit): demo/QA accounts must never enter
    // the leaderboard, feed, or Hall of Fame — block at the door.
    if (user.isTestAccount === true) {
      throw new Error("Demo accounts can't join Money Bells");
    }

    // Check idempotency — if already opted in, return existing row
    const existing = await ctx.db
      .query("b2cMoneyBellOptIns")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) return { success: true, alreadyJoined: true };

    await ctx.db.insert("b2cMoneyBellOptIns", {
      userId: args.userId,
      joinedAt: Date.now(),
      acknowledgedWarning: true,
    });
    return { success: true, alreadyJoined: false };
  },
});

// User opts out — deletes the membership row. Past broadcasts stay on the
// board (they were real closes; delete them individually if wanted). The
// post-call celebration prompt stops and the view returns to the join
// prompt. Rejoining later works — join is idempotent.
export const leaveMoneyBells = mutation({
  args: {
    userId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("b2cMoneyBellOptIns")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!existing) return { success: true, wasOptedIn: false };
    await ctx.db.delete(existing._id);
    return { success: true, wasOptedIn: true };
  },
});

// Create a broadcast — atomic 3-step: create post, create broadcast, patch post
export const createBroadcast = mutation({
  args: {
    userId: v.id("b2cUsers"),
    callId: v.id("calls"),
    cashCollected: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Validate inputs
    if (args.cashCollected < 0) {
      throw new Error("Cash collected cannot be negative");
    }
    if (args.cashCollected > MAX_CASH_COLLECTED) {
      throw new Error("Cash collected exceeds maximum");
    }
    if (args.note !== undefined && args.note.length > MAX_NOTE_LENGTH) {
      throw new Error(`Note exceeds ${MAX_NOTE_LENGTH} character limit`);
    }

    // 2. Verify user is opted in
    const optIn = await ctx.db
      .query("b2cMoneyBellOptIns")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!optIn) throw new Error("Join Money Bells before broadcasting");

    // 3. Verify call exists, belongs to user, and is closed.
    // B2C users don't have a direct closer relationship — they're linked via
    // b2cUser.personalWorkspaceId === closer.teamId. So we look up the user's
    // workspace and compare it against the call's closer's teamId.
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    const callCloserId = (call as { closerId?: Id<"closers"> }).closerId;
    if (!callCloserId) throw new Error("Call has no closer — cannot broadcast");
    const callCloser = await ctx.db.get(callCloserId);
    if (!callCloser) throw new Error("Call's closer record not found");
    const userWithWorkspace = await ctx.db.get(args.userId);
    if (userWithWorkspace?.isTestAccount === true) throw new Error("Demo accounts can't broadcast to Money Bells");
    const userWorkspaceId = (userWithWorkspace as { personalWorkspaceId?: Id<"teams"> } | null)?.personalWorkspaceId;
    const callTeamId = (callCloser as { teamId?: Id<"teams"> }).teamId;
    if (!userWorkspaceId || !callTeamId || userWorkspaceId !== callTeamId) {
      throw new Error("Call does not belong to this user");
    }
    if ((call as { outcome?: string }).outcome !== "closed") {
      throw new Error("Only closed deals can be broadcast");
    }

    // 4. Prevent duplicate broadcast for same call
    const existingBroadcast = await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .first();
    if (existingBroadcast) throw new Error("This call has already been broadcast");

    // 5. Get user for authorName/photo + Money Bells channel
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const channel = await ctx.db
      .query("b2cCommunityChannels")
      .withIndex("by_slug", (q) => q.eq("slug", MONEY_BELLS_CHANNEL_SLUG))
      .first();
    if (!channel) throw new Error("Money Bells channel not initialized");
    const channelId = channel._id;

    // Get author's profile photo storage ID (same pattern as b2cCommunity.createPost)
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    // 6. Create the linked post first (broadcastId temporarily undefined)
    const now = Date.now();
    const postId = await ctx.db.insert("b2cCommunityPosts", {
      channelId,
      authorId: args.userId,
      authorName: (user as { name: string }).name,
      authorPhotoStorageId: profile?.photoStorageId,
      body: args.note?.trim() || "",
      likeCount: 0,
      commentCount: 0,
      isPinned: false,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    // 7. Create the broadcast with postId
    const broadcastId = await ctx.db.insert("b2cMoneyBellBroadcasts", {
      userId: args.userId,
      callId: args.callId,
      cashCollected: args.cashCollected,
      note: args.note?.trim() || undefined,
      postId,
      isDeleted: false,
      broadcastedAt: now,
      month: getMonthKey(now),
    });

    // 8. Patch the post with the broadcastId to complete the link
    await ctx.db.patch(postId, { broadcastId });

    return { success: true, broadcastId, postId };
  },
});

// Delete a broadcast — self-delete within 1h window OR any time by founder
export const deleteBroadcast = mutation({
  args: {
    userId: v.id("b2cUsers"),
    broadcastId: v.id("b2cMoneyBellBroadcasts"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const broadcast = await ctx.db.get(args.broadcastId);
    if (!broadcast) throw new Error("Broadcast not found");
    if (broadcast.isDeleted) throw new Error("Broadcast already deleted");

    const isOwner = broadcast.userId === args.userId;
    const withinSelfDeleteWindow = Date.now() - broadcast.broadcastedAt < SELF_DELETE_WINDOW_MS;
    const founder = isFounder(user);

    if (!founder && !(isOwner && withinSelfDeleteWindow)) {
      if (isOwner && !withinSelfDeleteWindow) {
        throw new Error("Can't delete after 1 hour — ask a founder");
      }
      throw new Error("Not authorized to delete this broadcast");
    }

    // Soft-delete both the broadcast and the linked post atomically
    const now = Date.now();
    await ctx.db.patch(args.broadcastId, {
      isDeleted: true,
      deletedAt: now,
      deletedBy: args.userId,
    });
    await ctx.db.patch(broadcast.postId, {
      isDeleted: true,
      updatedAt: now,
    });

    return { success: true };
  },
});

// Founder-only: set or update the monthly prize (all three ranks at once).
// Empty string for any prizeTextN clears that rank for the month.
export const setMonthlyPrize = mutation({
  args: {
    userId: v.id("b2cUsers"),
    month: v.string(),
    prizeText1: v.optional(v.string()),
    prizeText2: v.optional(v.string()),
    prizeText3: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !isFounder(user)) {
      throw new Error("Only founders can set monthly prizes");
    }
    if (!args.month.match(/^\d{4}-\d{2}$/)) {
      throw new Error("Month must be YYYY-MM format");
    }

    const t1 = args.prizeText1?.trim() ?? "";
    const t2 = args.prizeText2?.trim() ?? "";
    const t3 = args.prizeText3?.trim() ?? "";

    // Enforce a reasonable ceiling so the pill doesn't overflow
    for (const [label, v] of [["1st", t1], ["2nd", t2], ["3rd", t3]] as const) {
      if (v.length > 60) throw new Error(`${label} prize must be 60 characters or less`);
    }
    // At least one slot must be set
    if (!t1 && !t2 && !t3) {
      throw new Error("Set at least one prize (1st, 2nd, or 3rd)");
    }

    const existing = await ctx.db
      .query("b2cMoneyBellPrizes")
      .withIndex("by_month", (q) => q.eq("month", args.month))
      .first();

    const now = Date.now();
    // undefined in a patch clears the field. Convert empty-string → undefined.
    const patch = {
      prizeText1: t1 || undefined,
      prizeText2: t2 || undefined,
      prizeText3: t3 || undefined,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return { success: true, month: args.month, created: false };
    } else {
      await ctx.db.insert("b2cMoneyBellPrizes", {
        month: args.month,
        ...patch,
        paid: false,
        createdAt: now,
      });
      return { success: true, month: args.month, created: true };
    }
  },
});

// Founder-only: mark a prize as paid (after external pay stub verification)
export const markPrizePaid = mutation({
  args: {
    userId: v.id("b2cUsers"),
    month: v.string(),
    rank: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !isFounder(user)) {
      throw new Error("Only founders can mark prizes as paid");
    }
    const rank = args.rank ?? 1;
    const prize = await ctx.db
      .query("b2cMoneyBellPrizes")
      .withIndex("by_month", (q) => q.eq("month", args.month))
      .first();
    if (!prize) throw new Error("No prize found for this month");

    const now = Date.now();
    if (rank === 1) {
      if (!prize.winnerUserId) throw new Error("No 1st place winner determined yet");
      await ctx.db.patch(prize._id, { paid: true, paidAt: now, updatedAt: now });
    } else if (rank === 2) {
      if (!prize.winner2UserId) throw new Error("No 2nd place winner determined yet");
      await ctx.db.patch(prize._id, { paid2: true, paid2At: now, updatedAt: now });
    } else {
      if (!prize.winner3UserId) throw new Error("No 3rd place winner determined yet");
      await ctx.db.patch(prize._id, { paid3: true, paid3At: now, updatedAt: now });
    }
    return { success: true };
  },
});

// ==================== Queries ====================

// Check if user has opted in
export const getOptInStatus = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const optIn = await ctx.db
      .query("b2cMoneyBellOptIns")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    return { optedIn: !!optIn, joinedAt: optIn?.joinedAt ?? null };
  },
});

// Leaderboard — aggregates cash collected per user for the given month
export const getLeaderboard = query({
  args: {
    month: v.string(),
    page: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = Math.max(1, args.page ?? 1);

    // Pull all broadcasts for the month (scale-safe for <10k broadcasts/month)
    const broadcasts = await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .withIndex("by_month_cash", (q) =>
        q.eq("month", args.month).eq("isDeleted", false)
      )
      .collect();

    // Aggregate by userId
    const totalsByUser = new Map<string, { totalCash: number; count: number; firstBroadcastAt: number }>();
    for (const b of broadcasts) {
      const key = b.userId;
      const current = totalsByUser.get(key);
      if (current) {
        current.totalCash += b.cashCollected;
        current.count += 1;
        current.firstBroadcastAt = Math.min(current.firstBroadcastAt, b.broadcastedAt);
      } else {
        totalsByUser.set(key, {
          totalCash: b.cashCollected,
          count: 1,
          firstBroadcastAt: b.broadcastedAt,
        });
      }
    }

    // Sort desc by cash, tiebreak earliest broadcast
    const sorted = Array.from(totalsByUser.entries())
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => {
        if (b.totalCash !== a.totalCash) return b.totalCash - a.totalCash;
        return a.firstBroadcastAt - b.firstBroadcastAt;
      });

    const totalBroadcasters = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalBroadcasters / LEADERBOARD_PAGE_SIZE));
    const start = (page - 1) * LEADERBOARD_PAGE_SIZE;
    const pageSlice = sorted.slice(start, start + LEADERBOARD_PAGE_SIZE);

    // Enrich with user info + photo URLs
    const entries = await Promise.all(
      pageSlice.map(async (entry, idx) => {
        const user = await ctx.db.get(entry.userId as Id<"b2cUsers">);
        const profile = await ctx.db
          .query("b2cProfiles")
          .withIndex("by_user", (q) => q.eq("userId", entry.userId as Id<"b2cUsers">))
          .first();
        const photoUrl = await resolvePhotoUrl(ctx, profile?.photoStorageId);
        return {
          rank: start + idx + 1,
          userId: entry.userId,
          userName: (user as { name?: string } | null)?.name ?? "Unknown",
          userBadges: ((user as { badges?: string[] } | null)?.badges ?? []) as string[],
          photoUrl,
          totalCash: entry.totalCash,
          broadcastCount: entry.count,
        };
      })
    );

    // Race-track scale is time-adjusted so the track fills up over the course of the month.
    // Day 1: leader sits near the left (5% into the track).
    // Last day of month: leader approaches the right edge.
    // Others are positioned proportional to (their cash / leader cash) * month progress.
    // Implementation: we set monthlyGoal = topCash / monthProgress so the existing
    // `(userCash / monthlyGoal) * 100` formula on the client yields the desired time-aware %.
    const topCash = sorted[0]?.totalCash ?? 0;
    const nowDate = new Date();
    const nowMonth = getMonthKey(nowDate.getTime());
    const isCurrentMonth = args.month === nowMonth;
    let monthProgress = 1;
    if (isCurrentMonth) {
      const year = nowDate.getUTCFullYear();
      const monthIdx = nowDate.getUTCMonth();
      const daysInMonth = new Date(year, monthIdx + 1, 0).getUTCDate();
      const currentDay = nowDate.getUTCDate();
      monthProgress = Math.max(0.05, Math.min(1, currentDay / daysInMonth));
    }
    const monthlyGoal = topCash > 0 ? topCash / monthProgress : 10_000;

    return {
      month: args.month,
      page,
      totalPages,
      totalBroadcasters,
      entries,
      topCash,
      monthlyGoal,
    };
  },
});

// User's rank + cash for a given month (pinned "Your rank" strip)
export const getUserRank = query({
  args: {
    userId: v.id("b2cUsers"),
    month: v.string(),
  },
  handler: async (ctx, args) => {
    // Always resolve the user's photo URL so the "Your rank" strip can render it
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const photoUrl = await resolvePhotoUrl(ctx, profile?.photoStorageId);

    const broadcasts = await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .withIndex("by_month_cash", (q) =>
        q.eq("month", args.month).eq("isDeleted", false)
      )
      .collect();

    const totals = new Map<string, { totalCash: number; firstBroadcastAt: number }>();
    for (const b of broadcasts) {
      const current = totals.get(b.userId);
      if (current) {
        current.totalCash += b.cashCollected;
        current.firstBroadcastAt = Math.min(current.firstBroadcastAt, b.broadcastedAt);
      } else {
        totals.set(b.userId, { totalCash: b.cashCollected, firstBroadcastAt: b.broadcastedAt });
      }
    }

    if (!totals.has(args.userId)) {
      return { rank: null, totalCash: 0, gapToNext: null, totalBroadcasters: totals.size, photoUrl };
    }

    const sorted = Array.from(totals.entries())
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => {
        if (b.totalCash !== a.totalCash) return b.totalCash - a.totalCash;
        return a.firstBroadcastAt - b.firstBroadcastAt;
      });

    const idx = sorted.findIndex((e) => e.userId === args.userId);
    const rank = idx + 1;
    const totalCash = sorted[idx].totalCash;
    const gapToNext = idx > 0 ? sorted[idx - 1].totalCash - totalCash : null;

    return { rank, totalCash, gapToNext, totalBroadcasters: sorted.length, photoUrl };
  },
});

// Current month prize (prize pills + days-left calc).
// Returns up to three prize slots — each slot is free-form text or null.
// `active` is true when ANY slot has a prize set.
export const getMonthlyPrize = query({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const prize = await ctx.db
      .query("b2cMoneyBellPrizes")
      .withIndex("by_month", (q) => q.eq("month", args.month))
      .first();

    // Legacy fallback: old rows only have prizeAmount (no prizeText1)
    const legacyFirst =
      prize && prize.prizeAmount && !prize.prizeText1
        ? `$${prize.prizeAmount.toLocaleString()}`
        : undefined;

    const prizeText1 = prize?.prizeText1 ?? legacyFirst;
    const prizeText2 = prize?.prizeText2;
    const prizeText3 = prize?.prizeText3;

    const active = !!(prizeText1 || prizeText2 || prizeText3);

    if (!active) {
      return { active: false as const, daysLeft: daysLeftInMonth(args.month) };
    }
    return {
      active: true as const,
      prizeText1: prizeText1 ?? null,
      prizeText2: prizeText2 ?? null,
      prizeText3: prizeText3 ?? null,
      // Legacy amount kept for backward compat — callers migrating should prefer prizeText1
      prizeAmount: prize?.prizeAmount ?? null,
      prizeLabel: prize?.prizeLabel ?? "Top Cash Collected",
      daysLeft: daysLeftInMonth(args.month),
    };
  },
});

// Aggregate stats for the month (powers the micro-stats row)
export const getMonthStats = query({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const broadcasts = await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .withIndex("by_month_cash", (q) =>
        q.eq("month", args.month).eq("isDeleted", false)
      )
      .collect();

    if (broadcasts.length === 0) {
      return {
        totalPool: 0,
        broadcastCount: 0,
        broadcasterCount: 0,
        avgBroadcast: 0,
        biggestDeal: null as null | { userId: string; cashCollected: number; broadcastedAt: number },
      };
    }

    const totalPool = broadcasts.reduce((sum, b) => sum + b.cashCollected, 0);
    const broadcasterSet = new Set(broadcasts.map((b) => b.userId));
    const biggest = broadcasts.reduce((max, b) =>
      b.cashCollected > max.cashCollected ? b : max
    , broadcasts[0]);

    return {
      totalPool,
      broadcastCount: broadcasts.length,
      broadcasterCount: broadcasterSet.size,
      avgBroadcast: Math.round(totalPool / broadcasts.length),
      biggestDeal: {
        userId: biggest.userId,
        cashCollected: biggest.cashCollected,
        broadcastedAt: biggest.broadcastedAt,
      },
    };
  },
});

// Check if a call has already been broadcast (for disabling button / idempotency)
export const hasBroadcastForCall = query({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const broadcast = await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .filter((q) => q.eq(q.field("isDeleted"), false))
      .first();
    return { hasBroadcast: !!broadcast, broadcastId: broadcast?._id ?? null };
  },
});

// Past winners (Hall of Fame) — only paid months
export const getHallOfFame = query({
  args: {},
  handler: async (ctx) => {
    const paid = await ctx.db
      .query("b2cMoneyBellPrizes")
      .withIndex("by_paid_status", (q) => q.eq("paid", true))
      .collect();

    const enriched = await Promise.all(
      paid
        .filter((p) => !!p.winnerUserId)
        .sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0))
        .slice(0, 12) // most recent 12 winners
        .map(async (p) => {
          const winner = p.winnerUserId ? await ctx.db.get(p.winnerUserId) : null;
          const profile = p.winnerUserId
            ? await ctx.db
                .query("b2cProfiles")
                .withIndex("by_user", (q) => q.eq("userId", p.winnerUserId!))
                .first()
            : null;
          const photoUrl = await resolvePhotoUrl(ctx, profile?.photoStorageId);
          return {
            month: p.month,
            prizeAmount: p.prizeAmount ?? 0,
            prizeText1: p.prizeText1 ?? null,
            winnerUserId: p.winnerUserId,
            winnerName: (winner as { name?: string } | null)?.name ?? "Unknown",
            photoUrl,
            winnerCashCollected: p.winnerCashCollected ?? 0,
            paidAt: p.paidAt ?? null,
          };
        })
    );

    return enriched;
  },
});

// Broadcast feed — scrollable list of broadcast posts, newest first
export const getMoneyBellsFeed = query({
  args: {
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
    userId: v.optional(v.id("b2cUsers")),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? FEED_PAGE_SIZE, MAX_FEED_PAGE_SIZE);

    const channel = await ctx.db
      .query("b2cCommunityChannels")
      .withIndex("by_slug", (q) => q.eq("slug", MONEY_BELLS_CHANNEL_SLUG))
      .first();
    if (!channel) return { posts: [], nextCursor: null };
    const channelId = channel._id;

    // Get posts for the money-bells channel (all will have broadcastId)
    let postsQuery = ctx.db
      .query("b2cCommunityPosts")
      .withIndex("by_channel", (q) =>
        q.eq("channelId", channelId).lt("createdAt", args.cursor ?? Date.now())
      )
      .order("desc");

    const posts = await postsQuery.take(limit);
    const nextCursor = posts.length === limit ? posts[posts.length - 1].createdAt : null;

    // Enrich each post with broadcast data + reactions
    const enriched = await Promise.all(
      posts
        .filter((p) => !p.isDeleted && !!p.broadcastId)
        .map(async (post) => {
          const broadcast = post.broadcastId ? await ctx.db.get(post.broadcastId) : null;
          if (!broadcast || broadcast.isDeleted) return null;

          const authorPhotoUrl = await resolvePhotoUrl(ctx, post.authorPhotoStorageId);

          // My reactions (if userId provided)
          let myReactions: string[] = [];
          let isLikedByMe = false;
          if (args.userId) {
            const reactions = await ctx.db
              .query("b2cCommunityReactions")
              .withIndex("by_target_user", (q) =>
                q.eq("targetType", "post").eq("targetId", post._id).eq("userId", args.userId!)
              )
              .collect();
            myReactions = reactions.map((r) => r.emoji);

            const like = await ctx.db
              .query("b2cCommunityPostLikes")
              .withIndex("by_post_user", (q) => q.eq("postId", post._id).eq("userId", args.userId!))
              .first();
            isLikedByMe = !!like;
          }

          // Author badges
          const author = await ctx.db.get(post.authorId);

          // Detect edits: compare broadcast snapshot to current call amount
          const call = await ctx.db.get(broadcast.callId);
          const currentCash = (call as { cashCollected?: number } | null)?.cashCollected ?? null;
          const isEdited = currentCash !== null && currentCash !== broadcast.cashCollected;

          return {
            _id: post._id,
            channelId: post.channelId,
            authorId: post.authorId,
            authorName: post.authorName,
            authorPhotoUrl,
            authorBadges: ((author as { badges?: string[] } | null)?.badges ?? []) as string[],
            body: post.body,
            visibility: post.visibility ?? "everyone",
            likeCount: post.likeCount,
            commentCount: post.commentCount,
            isPinned: post.isPinned,
            reactionCounts: post.reactionCounts ?? {},
            myReactions,
            isLikedByMe,
            broadcastId: broadcast._id,
            broadcastData: {
              cashCollected: broadcast.cashCollected,
              note: broadcast.note ?? null,
              callId: broadcast.callId,
              broadcastedAt: broadcast.broadcastedAt,
              month: broadcast.month,
              isEdited,
            },
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
          };
        })
    );

    return { posts: enriched.filter((p) => p !== null), nextCursor };
  },
});

// Count of non-deleted broadcasts in the current month since a timestamp, excluding the
// caller's own. Drives the sidebar unread-count badge on the Money Bells nav button.
// Capped at 99 to keep the badge display compact.
const MAX_UNREAD_BADGE_COUNT = 99;

export const getUnreadBroadcastCount = query({
  args: {
    userId: v.id("b2cUsers"),
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const currentMonth = getMonthKey(Date.now());
    const broadcasts = await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .withIndex("by_month_cash", (q) =>
        q.eq("month", currentMonth).eq("isDeleted", false)
      )
      .collect();
    let count = 0;
    for (const b of broadcasts) {
      if (b.broadcastedAt > args.since && b.userId !== args.userId) {
        count += 1;
        if (count >= MAX_UNREAD_BADGE_COUNT) break;
      }
    }
    return { count };
  },
});

// ==================== Cron: Month-End Winner Determination ====================

export const determineMonthWinner = internalAction({
  args: {},
  handler: async (ctx): Promise<{ month: string; winnerSet: boolean }> => {
    const nowMonth = getMonthKey(Date.now());
    const targetMonth = previousMonthKey(nowMonth);

    const result = await ctx.runMutation(internal.b2cMoneyBells.determineWinnerForMonth, {
      month: targetMonth,
    });
    return result;
  },
});

// Internal mutation used by the cron action
export const determineWinnerForMonth = internalMutation({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    // Aggregate cash collected per user for the month
    const broadcasts = await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .withIndex("by_month_cash", (q) =>
        q.eq("month", args.month).eq("isDeleted", false)
      )
      .collect();

    if (broadcasts.length === 0) {
      return { month: args.month, winnerSet: false };
    }

    const totals = new Map<string, { totalCash: number; firstBroadcastAt: number }>();
    for (const b of broadcasts) {
      const current = totals.get(b.userId);
      if (current) {
        current.totalCash += b.cashCollected;
        current.firstBroadcastAt = Math.min(current.firstBroadcastAt, b.broadcastedAt);
      } else {
        totals.set(b.userId, { totalCash: b.cashCollected, firstBroadcastAt: b.broadcastedAt });
      }
    }

    const sorted = Array.from(totals.entries())
      .map(([userId, v]) => ({ userId, ...v }))
      .sort((a, b) => {
        if (b.totalCash !== a.totalCash) return b.totalCash - a.totalCash;
        return a.firstBroadcastAt - b.firstBroadcastAt;
      });

    const winner1 = sorted[0];
    const winner2 = sorted[1]; // may be undefined if fewer than 2 participants
    const winner3 = sorted[2]; // may be undefined if fewer than 3 participants

    // Upsert prize row for this month with winner info
    const existing = await ctx.db
      .query("b2cMoneyBellPrizes")
      .withIndex("by_month", (q) => q.eq("month", args.month))
      .first();

    const now = Date.now();
    const winnerPatch = {
      winnerUserId: winner1.userId as Id<"b2cUsers">,
      winnerCashCollected: winner1.totalCash,
      winner2UserId: (winner2?.userId as Id<"b2cUsers"> | undefined) ?? undefined,
      winner2CashCollected: winner2?.totalCash,
      winner3UserId: (winner3?.userId as Id<"b2cUsers"> | undefined) ?? undefined,
      winner3CashCollected: winner3?.totalCash,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, winnerPatch);
    } else {
      // No prize was activated, but we still record winners for future reference / Hall of Fame
      await ctx.db.insert("b2cMoneyBellPrizes", {
        month: args.month,
        ...winnerPatch,
        paid: false,
        createdAt: now,
      });
    }

    return { month: args.month, winnerSet: true };
  },
});

// Internal query helper (used for debugging / admin tooling)
export const _getAllBroadcastsForMonth = internalQuery({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .withIndex("by_month_cash", (q) => q.eq("month", args.month).eq("isDeleted", false))
      .collect();
  },
});

// Founder-only: wipe ALL Money Bells prize rows across every month. Used to
// reset the leaderboard to a no-prize state before public release so prize
// pills disappear everywhere (including Hall of Fame).
export const adminResetAllPrizes = mutation({
  args: { callerId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.callerId);
    if (!user || !isFounder(user)) {
      throw new Error("Only founders can reset prizes");
    }
    const all = await ctx.db.query("b2cMoneyBellPrizes").collect();
    for (const p of all) {
      await ctx.db.delete(p._id);
    }
    return { deleted: all.length };
  },
});

// Admin-only: wipe Money Bells test data for a given month.
// Deletes the prize row (clears Hall of Fame entry) and hard-deletes any
// already-soft-deleted broadcasts + their linked posts for that month.
// Does NOT touch live (non-deleted) broadcasts.
export const adminCleanupTestData = mutation({
  args: {
    userId: v.id("b2cUsers"),
    month: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !isFounder(user)) {
      throw new Error("Only founders can cleanup test data");
    }

    let prizesDeleted = 0;
    let broadcastsDeleted = 0;
    let postsDeleted = 0;
    let optInsDeleted = 0;

    // Delete prize row for this month
    const prize = await ctx.db
      .query("b2cMoneyBellPrizes")
      .withIndex("by_month", (q) => q.eq("month", args.month))
      .first();
    if (prize) {
      await ctx.db.delete(prize._id);
      prizesDeleted++;
    }

    // Hard-delete all soft-deleted broadcasts + their linked posts for this month
    const allBroadcasts = await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .filter((q) => q.eq(q.field("month"), args.month))
      .collect();
    for (const b of allBroadcasts) {
      if (b.isDeleted) {
        // Delete linked post first
        const linkedPost = await ctx.db.get(b.postId);
        if (linkedPost) {
          await ctx.db.delete(b.postId);
          postsDeleted++;
        }
        await ctx.db.delete(b._id);
        broadcastsDeleted++;
      }
    }

    // Also clean up all opt-ins (tests leave these)
    const optIns = await ctx.db.query("b2cMoneyBellOptIns").collect();
    for (const o of optIns) {
      await ctx.db.delete(o._id);
      optInsDeleted++;
    }

    return {
      prizesDeleted,
      broadcastsDeleted,
      postsDeleted,
      optInsDeleted,
    };
  },
});

// Founder-only test helper: create a Money Bells broadcast FROM another user without
// needing a valid closed call. Used to verify the unread-badge flow end-to-end.
// Pass `asUserId` = the b2cUserId of the user the broadcast should appear to come from.
export const adminSeedTestBroadcast = mutation({
  args: {
    callerId: v.id("b2cUsers"),
    asUserId: v.id("b2cUsers"),
    cashCollected: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await ctx.db.get(args.callerId);
    if (!caller || !isFounder(caller)) {
      throw new Error("Only founders can seed test broadcasts");
    }

    const asUser = await ctx.db.get(args.asUserId);
    if (!asUser) throw new Error("asUser not found");

    const channel = await ctx.db
      .query("b2cCommunityChannels")
      .withIndex("by_slug", (q) => q.eq("slug", MONEY_BELLS_CHANNEL_SLUG))
      .first();
    if (!channel) throw new Error("Money Bells channel not found");

    const now = Date.now();
    const month = getMonthKey(now);

    // Fetch author profile for photo
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.asUserId))
      .first();

    // Create the linked community post
    const postId = await ctx.db.insert("b2cCommunityPosts", {
      channelId: channel._id,
      authorId: args.asUserId,
      authorName: asUser.name,
      authorPhotoStorageId: profile?.photoStorageId,
      body: args.note ?? "",
      visibility: "everyone",
      likeCount: 0,
      commentCount: 0,
      isPinned: false,
      isDeleted: false,
      reactionCounts: {},
      createdAt: now,
      updatedAt: now,
    });

    // Need a real call ID (Convex validates the ID's table). Grab the first available
    // call in the DB as a sentinel — test broadcasts don't need call-specific logic.
    const anyCall = await ctx.db.query("calls").first();
    if (!anyCall) throw new Error("No calls in DB — cannot seed test broadcast");
    const callIdFallback = anyCall._id;

    const broadcastId = await ctx.db.insert("b2cMoneyBellBroadcasts", {
      userId: args.asUserId,
      callId: callIdFallback,
      cashCollected: args.cashCollected,
      note: args.note,
      postId,
      isDeleted: false,
      broadcastedAt: now,
      month,
    });

    await ctx.db.patch(postId, { broadcastId });

    return { broadcastId, postId };
  },
});
