import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ==================== Constants ====================

const MAX_CONTEXT_LENGTH = 500;
const MIN_PAY_STUBS = 1;
const MAX_PAY_STUBS = 6;
const MAX_CRM_IMAGES = 4;
const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

// ==================== Helpers ====================

function isFounder(user: { badges?: string[] } | null): boolean {
  const badges = user?.badges as string[] | undefined;
  return !!badges?.includes("founder") || !!badges?.includes("admin");
}

async function resolvePhotoUrl(
  ctx: { storage: { getUrl: (id: string) => Promise<string | null> } },
  storageId: string | undefined | null
): Promise<string | null> {
  if (!storageId) return null;
  return await ctx.storage.getUrl(storageId);
}

async function requireFounder(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"b2cUsers">
): Promise<void> {
  const user = await ctx.db.get(userId);
  if (!user || !isFounder(user)) {
    throw new Error("Only founders can perform this action");
  }
}

// ==================== Mutations ====================

// Generate a Convex-signed upload URL so the client can PUT a compressed image.
// The returned storageId is later passed to submitVerificationRequest.
export const generateEvidenceUploadUrl = mutation({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { uploadUrl };
  },
});

// Create a verification request after the client has uploaded all evidence files.
// Rejects if the user already has a pending request.
export const submitVerificationRequest = mutation({
  args: {
    userId: v.id("b2cUsers"),
    claimedStats: v.object({
      cashCollected: v.optional(v.number()),
      closeRate: v.optional(v.number()),
      callsCompleted: v.optional(v.number()),
    }),
    context: v.optional(v.string()),
    payStubStorageIds: v.array(v.string()),
    crmStorageIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Block double submission
    const existingPending = await ctx.db
      .query("b2cStatsVerificationRequests")
      .withIndex("by_user_pending", (q) =>
        q.eq("userId", args.userId).eq("status", "pending")
      )
      .first();
    if (existingPending) {
      throw new Error("You already have a pending verification request. Wait for it to be reviewed.");
    }

    // Validate evidence counts
    if (args.payStubStorageIds.length < MIN_PAY_STUBS) {
      throw new Error(`At least ${MIN_PAY_STUBS} pay stub screenshot is required`);
    }
    if (args.payStubStorageIds.length > MAX_PAY_STUBS) {
      throw new Error(`No more than ${MAX_PAY_STUBS} pay stub screenshots allowed`);
    }
    if (args.crmStorageIds.length > MAX_CRM_IMAGES) {
      throw new Error(`No more than ${MAX_CRM_IMAGES} CRM screenshots allowed`);
    }

    // Validate at least one claimed stat
    const { cashCollected, closeRate, callsCompleted } = args.claimedStats;
    const hasClaim =
      (cashCollected !== undefined && cashCollected > 0) ||
      (closeRate !== undefined && closeRate > 0) ||
      (callsCompleted !== undefined && callsCompleted > 0);
    if (!hasClaim) {
      throw new Error("Enter at least one claimed stat");
    }

    // Validate ranges
    if (cashCollected !== undefined && (cashCollected < 0 || cashCollected > 1_000_000_000)) {
      throw new Error("Cash Collected must be between 0 and 1,000,000,000");
    }
    if (closeRate !== undefined && (closeRate < 0 || closeRate > 100)) {
      throw new Error("Close Rate must be between 0 and 100");
    }
    if (callsCompleted !== undefined && (callsCompleted < 0 || callsCompleted > 1_000_000)) {
      throw new Error("Calls Completed must be between 0 and 1,000,000");
    }

    // Validate context length
    const context = args.context?.trim() || undefined;
    if (context && context.length > MAX_CONTEXT_LENGTH) {
      throw new Error(`Context must be ${MAX_CONTEXT_LENGTH} characters or less`);
    }

    const now = Date.now();
    const requestId = await ctx.db.insert("b2cStatsVerificationRequests", {
      userId: args.userId,
      status: "pending",
      claimedStats: args.claimedStats,
      context,
      payStubStorageIds: args.payStubStorageIds,
      crmStorageIds: args.crmStorageIds,
      submittedAt: now,
    });

    return { requestId };
  },
});

// Founder approval: flip profile verified flag, DM the user via Sequ3nce Team.
export const approveVerificationRequest = mutation({
  args: {
    founderId: v.id("b2cUsers"),
    requestId: v.id("b2cStatsVerificationRequests"),
  },
  handler: async (ctx, args): Promise<{ success: true }> => {
    await requireFounder(ctx, args.founderId);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending") {
      throw new Error(`Request is already ${request.status}`);
    }

    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      status: "approved",
      reviewedBy: args.founderId,
      reviewedAt: now,
    });

    // Flip the profile's verified flag
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", request.userId))
      .first();
    if (profile) {
      await ctx.db.patch(profile._id, {
        isManuallyVerified: true,
        updatedAt: now,
      });
    }

    // Send a Sequ3nce Team DM — uses the existing team-notifications infrastructure.
    try {
      await ctx.runMutation(api.b2cTeamNotifications.sendTeamNotification, {
        founderId: args.founderId,
        recipientIds: [request.userId],
        body:
          "Your Sequ3nce stats have been verified ✓\n\n" +
          "Your profile now shows the \"Verified by Sequ3nce\" badge. Thanks for submitting your evidence.",
        repliesAllowed: true,
      });
    } catch (err) {
      // Don't block approval if the DM fails — log and move on.
      console.warn("[stats-verification] Failed to send approval DM:", err);
    }

    return { success: true };
  },
});

// Founder rejection: record reason, DM the user with explanation via Sequ3nce Team.
export const rejectVerificationRequest = mutation({
  args: {
    founderId: v.id("b2cUsers"),
    requestId: v.id("b2cStatsVerificationRequests"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: true; threadId: string | null }> => {
    await requireFounder(ctx, args.founderId);

    const reason = args.reason.trim();
    if (reason.length === 0) throw new Error("Rejection reason is required");
    if (reason.length > 1000) throw new Error("Reason must be 1000 characters or less");

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.status !== "pending") {
      throw new Error(`Request is already ${request.status}`);
    }

    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      status: "rejected",
      reviewedBy: args.founderId,
      reviewedAt: now,
      rejectionReason: reason,
    });

    // Send a Sequ3nce Team DM with the reason — same infra as approval, replies allowed
    // so the user can ask questions before resubmitting.
    let threadId: string | null = null;
    try {
      const result: { threadIds?: string[] } = await ctx.runMutation(
        api.b2cTeamNotifications.sendTeamNotification,
        {
          founderId: args.founderId,
          recipientIds: [request.userId],
          body:
            "Your Sequ3nce stats verification submission couldn't be approved.\n\n" +
            `Reason: ${reason}\n\n` +
            "You can update your evidence and resubmit from your Profile page anytime. Reply here if you have questions.",
          repliesAllowed: true,
        }
      );
      if (result.threadIds && result.threadIds.length > 0) {
        threadId = result.threadIds[0];
        await ctx.db.patch(args.requestId, {
          inboxThreadId: threadId as Id<"b2cDirectMessageThreads">,
        });
      }
    } catch (err) {
      console.warn("[stats-verification] Failed to send rejection DM:", err);
    }

    return { success: true, threadId };
  },
});

// Founder-only test helper: hard-delete all verification requests for a user.
// Used by E2E tests to reset state between runs; also resets isManuallyVerified.
export const adminCleanupUserVerificationData = mutation({
  args: {
    callerId: v.id("b2cUsers"),
    targetUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.callerId);
    const rows = await ctx.db
      .query("b2cStatsVerificationRequests")
      .withIndex("by_user", (q) => q.eq("userId", args.targetUserId))
      .collect();
    for (const r of rows) {
      await ctx.db.delete(r._id);
    }
    const profile = await ctx.db
      .query("b2cProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.targetUserId))
      .first();
    if (profile?.isManuallyVerified) {
      await ctx.db.patch(profile._id, {
        isManuallyVerified: false,
        updatedAt: Date.now(),
      });
    }
    return { deleted: rows.length };
  },
});

// Founder-only: comprehensive test-artifact cleanup for a single user.
// Wipes derivative data across stats verification, team-DMs/broadcasts, and
// Money Bells — used to scrub a test account before a public release without
// deleting the user itself or their profile.
export const adminCleanupTesterArtifacts = mutation({
  args: {
    callerId: v.id("b2cUsers"),
    targetUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.callerId);

    let verificationRows = 0;
    let teamThreadsDeleted = 0;
    let teamMessagesDeleted = 0;
    let teamBroadcastsDeleted = 0;
    let moneyBellsBroadcastsDeleted = 0;
    let moneyBellsPostsDeleted = 0;
    let moneyBellsOptInsDeleted = 0;

    // 1) Stats verification requests for the target user
    const vReqs = await ctx.db
      .query("b2cStatsVerificationRequests")
      .withIndex("by_user", (q) => q.eq("userId", args.targetUserId))
      .collect();
    for (const r of vReqs) {
      await ctx.db.delete(r._id);
      verificationRows++;
    }

    // 2) Team DM thread (where target is the recipient) + its messages.
    // Team threads are keyed by participant1Id = recipientId and senderType="team".
    const threads = await ctx.db
      .query("b2cDirectMessageThreads")
      .withIndex("by_participant1", (q) => q.eq("participant1Id", args.targetUserId))
      .collect();
    const broadcastIdsToDelete = new Set<string>();
    for (const t of threads) {
      if (t.senderType !== "team") continue;
      // Collect messages in the thread + their broadcastIds for orphan-free cleanup
      const msgs = await ctx.db
        .query("b2cDirectMessages")
        .withIndex("by_thread", (q) => q.eq("threadId", t._id))
        .collect();
      for (const m of msgs) {
        if (m.broadcastId) broadcastIdsToDelete.add(m.broadcastId);
        await ctx.db.delete(m._id);
        teamMessagesDeleted++;
      }
      await ctx.db.delete(t._id);
      teamThreadsDeleted++;
    }
    for (const bId of broadcastIdsToDelete) {
      const b = await ctx.db.get(bId as Id<"b2cTeamBroadcasts">);
      if (b) {
        await ctx.db.delete(b._id);
        teamBroadcastsDeleted++;
      }
    }

    // 3) Money Bells broadcasts by this user + the community posts that link to them.
    const mbBroadcasts = await ctx.db
      .query("b2cMoneyBellBroadcasts")
      .filter((q) => q.eq(q.field("userId"), args.targetUserId))
      .collect();
    for (const mb of mbBroadcasts) {
      // Each broadcast spawns a community post via the by_broadcast index
      const linkedPosts = await ctx.db
        .query("b2cCommunityPosts")
        .withIndex("by_broadcast", (q) => q.eq("broadcastId", mb._id))
        .collect();
      for (const p of linkedPosts) {
        await ctx.db.delete(p._id);
        moneyBellsPostsDeleted++;
      }
      await ctx.db.delete(mb._id);
      moneyBellsBroadcastsDeleted++;
    }

    // 4) Money Bells opt-in row
    const optIns = await ctx.db
      .query("b2cMoneyBellOptIns")
      .withIndex("by_user", (q) => q.eq("userId", args.targetUserId))
      .collect();
    for (const o of optIns) {
      await ctx.db.delete(o._id);
      moneyBellsOptInsDeleted++;
    }

    return {
      verificationRows,
      teamThreadsDeleted,
      teamMessagesDeleted,
      teamBroadcastsDeleted,
      moneyBellsBroadcastsDeleted,
      moneyBellsPostsDeleted,
      moneyBellsOptInsDeleted,
    };
  },
});

// ==================== Queries ====================

// Most recent request for this user (any status). Used by the Profile view to decide
// whether to show "Submit for verification" / "Pending" / "Verified" button state.
export const getMyLatestVerificationRequest = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("b2cStatsVerificationRequests")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
    if (!request) return null;
    return {
      requestId: request._id,
      status: request.status,
      submittedAt: request.submittedAt,
      rejectionReason: request.rejectionReason,
      reviewedAt: request.reviewedAt,
    };
  },
});

// Founder queue: pending requests first, newest first. Paginated.
export const listPendingVerificationRequests = query({
  args: {
    founderId: v.id("b2cUsers"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      )
    ),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);
    const limit = Math.min(args.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);
    const statusFilter = args.status ?? "pending";

    let all = await ctx.db
      .query("b2cStatsVerificationRequests")
      .withIndex("by_status_submitted_at", (q) => q.eq("status", statusFilter))
      .order("desc")
      .collect();

    if (args.cursor) {
      all = all.filter((r) => r.submittedAt < args.cursor!);
    }

    // VIP priority lane ("verified in 24 hours"): annual members' pending
    // requests surface first in the review queue. Only reorders the pending
    // view — approved/rejected history stays chronological.
    if (statusFilter === "pending" && all.length > 1) {
      const vipFlags = await Promise.all(
        all.map(async (r) => {
          const u = await ctx.db.get(r.userId);
          return ((u as any)?.badges ?? []).includes("vip");
        }),
      );
      const flagged = all.map((r, i) => ({ r, vip: vipFlags[i] }));
      all = [
        ...flagged.filter((f) => f.vip).map((f) => f.r),
        ...flagged.filter((f) => !f.vip).map((f) => f.r),
      ];
    }
    const page = all.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    const enriched = await Promise.all(
      results.map(async (r) => {
        const user = await ctx.db.get(r.userId);
        const requesterIsVip = ((user as any)?.badges ?? []).includes("vip");
        const profile = user
          ? await ctx.db
              .query("b2cProfiles")
              .withIndex("by_user", (q) => q.eq("userId", r.userId))
              .first()
          : null;
        const photoUrl = await resolvePhotoUrl(ctx, profile?.photoStorageId);
        const payStubUrls = await Promise.all(
          r.payStubStorageIds.map((id) => ctx.storage.getUrl(id))
        );
        const crmUrls = await Promise.all(
          r.crmStorageIds.map((id) => ctx.storage.getUrl(id))
        );
        return {
          requestId: r._id,
          status: r.status,
          requesterIsVip,
          submittedAt: r.submittedAt,
          claimedStats: r.claimedStats,
          context: r.context ?? null,
          payStubUrls: payStubUrls.filter((u): u is string => !!u),
          crmUrls: crmUrls.filter((u): u is string => !!u),
          rejectionReason: r.rejectionReason ?? null,
          reviewedBy: r.reviewedBy ?? null,
          reviewedAt: r.reviewedAt ?? null,
          user: user
            ? {
                userId: user._id as string,
                name: user.name,
                email: user.email,
                photoUrl,
              }
            : null,
        };
      })
    );

    return {
      requests: enriched,
      nextCursor: hasMore ? results[results.length - 1].submittedAt : null,
    };
  },
});

// Lightweight count for the sidebar badge.
export const getPendingVerificationCount = query({
  args: { founderId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);
    const pending = await ctx.db
      .query("b2cStatsVerificationRequests")
      .withIndex("by_status_submitted_at", (q) => q.eq("status", "pending"))
      .collect();
    return { count: Math.min(pending.length, 99) };
  },
});

// Full detail for one request (founder-only).
export const getVerificationRequest = query({
  args: {
    founderId: v.id("b2cUsers"),
    requestId: v.id("b2cStatsVerificationRequests"),
  },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);
    const r = await ctx.db.get(args.requestId);
    if (!r) throw new Error("Request not found");
    const user = await ctx.db.get(r.userId);
    const profile = user
      ? await ctx.db
          .query("b2cProfiles")
          .withIndex("by_user", (q) => q.eq("userId", r.userId))
          .first()
      : null;
    const photoUrl = await resolvePhotoUrl(ctx, profile?.photoStorageId);
    const payStubUrls = await Promise.all(
      r.payStubStorageIds.map((id) => ctx.storage.getUrl(id))
    );
    const crmUrls = await Promise.all(
      r.crmStorageIds.map((id) => ctx.storage.getUrl(id))
    );
    return {
      requestId: r._id,
      status: r.status,
      submittedAt: r.submittedAt,
      claimedStats: r.claimedStats,
      context: r.context ?? null,
      payStubUrls: payStubUrls.filter((u): u is string => !!u),
      crmUrls: crmUrls.filter((u): u is string => !!u),
      rejectionReason: r.rejectionReason ?? null,
      reviewedBy: r.reviewedBy ?? null,
      reviewedAt: r.reviewedAt ?? null,
      user: user
        ? {
            userId: user._id as string,
            name: user.name,
            email: user.email,
            photoUrl,
          }
        : null,
    };
  },
});
