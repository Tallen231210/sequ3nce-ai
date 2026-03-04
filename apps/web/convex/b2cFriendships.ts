import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ==================== Helpers ====================

function makeFriendshipKey(a: string, b: string): string {
  return [a, b].sort().join("_");
}

async function resolvePhotoUrl(
  ctx: { storage: { getUrl: (id: string) => Promise<string | null> } },
  storageId: string | undefined | null
): Promise<string | null> {
  if (!storageId) return null;
  return await ctx.storage.getUrl(storageId);
}

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// ==================== Queries ====================

// List accepted friends with profile info
export const listFriends = query({
  args: {
    userId: v.id("b2cUsers"),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);

    // Fetch accepted friendships where user is requester
    const asRequester = await ctx.db
      .query("b2cFriendships")
      .withIndex("by_requester", (q) =>
        q.eq("requesterId", args.userId).eq("status", "accepted")
      )
      .collect();

    // Fetch accepted friendships where user is recipient
    const asRecipient = await ctx.db
      .query("b2cFriendships")
      .withIndex("by_recipient", (q) =>
        q.eq("recipientId", args.userId).eq("status", "accepted")
      )
      .collect();

    // Combine and deduplicate by friendship key
    const all = [...asRequester, ...asRecipient];
    const seen = new Set<string>();
    const unique = all.filter((f) => {
      if (seen.has(f.friendshipKey)) return false;
      seen.add(f.friendshipKey);
      return true;
    });

    // Sort by acceptedAt desc
    unique.sort((a, b) => (b.acceptedAt ?? b.createdAt) - (a.acceptedAt ?? a.createdAt));

    // Apply cursor
    let filtered = unique;
    if (args.cursor) {
      filtered = unique.filter(
        (f) => (f.acceptedAt ?? f.createdAt) < args.cursor!
      );
    }

    const page = filtered.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    // Resolve other user info
    const friends = await Promise.all(
      results.map(async (f) => {
        const otherId =
          f.requesterId === args.userId ? f.recipientId : f.requesterId;
        const user = await ctx.db.get(otherId);
        const profile = user
          ? await ctx.db
              .query("b2cProfiles")
              .withIndex("by_user", (q) => q.eq("userId", otherId))
              .first()
          : null;
        const photoUrl = await resolvePhotoUrl(ctx, profile?.photoStorageId);

        return {
          friendshipId: f._id,
          userId: otherId,
          name: user?.name ?? "Unknown",
          headline: profile?.headline ?? null,
          location: profile?.location ?? null,
          photoUrl,
          acceptedAt: f.acceptedAt ?? f.createdAt,
        };
      })
    );

    return {
      friends,
      nextCursor: hasMore
        ? results[results.length - 1].acceptedAt ??
          results[results.length - 1].createdAt
        : null,
    };
  },
});

// List incoming pending requests
export const listIncomingRequests = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("b2cFriendships")
      .withIndex("by_recipient", (q) =>
        q.eq("recipientId", args.userId).eq("status", "pending")
      )
      .collect();

    // Sort newest first
    pending.sort((a, b) => b.createdAt - a.createdAt);

    const requests = await Promise.all(
      pending.map(async (f) => {
        const user = await ctx.db.get(f.requesterId);
        const profile = user
          ? await ctx.db
              .query("b2cProfiles")
              .withIndex("by_user", (q) => q.eq("userId", f.requesterId))
              .first()
          : null;
        const photoUrl = await resolvePhotoUrl(ctx, profile?.photoStorageId);

        return {
          friendshipId: f._id,
          requesterId: f.requesterId,
          name: user?.name ?? "Unknown",
          headline: profile?.headline ?? null,
          photoUrl,
          createdAt: f.createdAt,
        };
      })
    );

    return { requests };
  },
});

// Count pending incoming requests (for badge)
export const getPendingRequestCount = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("b2cFriendships")
      .withIndex("by_recipient", (q) =>
        q.eq("recipientId", args.userId).eq("status", "pending")
      )
      .collect();
    return { count: pending.length };
  },
});

// Get friendship status between two users
export const getFriendshipStatus = query({
  args: {
    userId: v.id("b2cUsers"),
    otherUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const key = makeFriendshipKey(args.userId, args.otherUserId);
    const friendship = await ctx.db
      .query("b2cFriendships")
      .withIndex("by_friendship_key", (q) => q.eq("friendshipKey", key))
      .first();

    if (!friendship) return { status: "none" as const };
    if (friendship.status === "accepted") return { status: "accepted" as const };
    if (friendship.requesterId === args.userId) {
      return { status: "pending_sent" as const };
    }
    return { status: "pending_received" as const };
  },
});

// Get accepted friend IDs for a user (internal helper, used by b2cCommunity)
export const getAcceptedFriendIds = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const asRequester = await ctx.db
      .query("b2cFriendships")
      .withIndex("by_requester", (q) =>
        q.eq("requesterId", args.userId).eq("status", "accepted")
      )
      .collect();

    const asRecipient = await ctx.db
      .query("b2cFriendships")
      .withIndex("by_recipient", (q) =>
        q.eq("recipientId", args.userId).eq("status", "accepted")
      )
      .collect();

    const friendIds = new Set<string>();
    for (const f of asRequester) friendIds.add(f.recipientId);
    for (const f of asRecipient) friendIds.add(f.requesterId);
    return { friendIds: Array.from(friendIds) };
  },
});

// ==================== Mutations ====================

// Send a friend request
export const sendRequest = mutation({
  args: {
    requesterId: v.id("b2cUsers"),
    recipientId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    if (args.requesterId === args.recipientId) {
      throw new Error("Cannot send friend request to yourself");
    }

    // Validate both users exist and have active subs
    const requester = await ctx.db.get(args.requesterId);
    if (!requester) throw new Error("Requester not found");
    if (requester.subscriptionStatus !== "active") {
      throw new Error("Active subscription required");
    }

    const recipient = await ctx.db.get(args.recipientId);
    if (!recipient) throw new Error("Recipient not found");

    // Check for existing friendship
    const key = makeFriendshipKey(args.requesterId, args.recipientId);
    const existing = await ctx.db
      .query("b2cFriendships")
      .withIndex("by_friendship_key", (q) => q.eq("friendshipKey", key))
      .first();

    if (existing) {
      if (existing.status === "accepted") {
        return { success: true, message: "Already friends" };
      }
      if (existing.status === "pending") {
        return { success: true, message: "Request already pending" };
      }
    }

    await ctx.db.insert("b2cFriendships", {
      requesterId: args.requesterId,
      recipientId: args.recipientId,
      friendshipKey: key,
      status: "pending",
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// Accept a friend request
export const acceptRequest = mutation({
  args: {
    userId: v.id("b2cUsers"),
    requesterId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const key = makeFriendshipKey(args.userId, args.requesterId);
    const friendship = await ctx.db
      .query("b2cFriendships")
      .withIndex("by_friendship_key", (q) => q.eq("friendshipKey", key))
      .first();

    if (!friendship) throw new Error("Friend request not found");
    if (friendship.status !== "pending") {
      throw new Error("Request is not pending");
    }
    if (friendship.recipientId !== args.userId) {
      throw new Error("Not authorized to accept this request");
    }

    await ctx.db.patch(friendship._id, {
      status: "accepted",
      acceptedAt: Date.now(),
    });

    return { success: true };
  },
});

// Decline a friend request (deletes record to allow re-request)
export const declineRequest = mutation({
  args: {
    userId: v.id("b2cUsers"),
    requesterId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const key = makeFriendshipKey(args.userId, args.requesterId);
    const friendship = await ctx.db
      .query("b2cFriendships")
      .withIndex("by_friendship_key", (q) => q.eq("friendshipKey", key))
      .first();

    if (!friendship) throw new Error("Friend request not found");
    if (friendship.status !== "pending") {
      throw new Error("Request is not pending");
    }
    if (friendship.recipientId !== args.userId) {
      throw new Error("Not authorized to decline this request");
    }

    await ctx.db.delete(friendship._id);
    return { success: true };
  },
});

// Remove a friend (deletes record to allow re-request later)
export const removeFriend = mutation({
  args: {
    userId: v.id("b2cUsers"),
    friendId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const key = makeFriendshipKey(args.userId, args.friendId);
    const friendship = await ctx.db
      .query("b2cFriendships")
      .withIndex("by_friendship_key", (q) => q.eq("friendshipKey", key))
      .first();

    if (!friendship) throw new Error("Friendship not found");
    if (friendship.status !== "accepted") {
      throw new Error("Not currently friends");
    }

    // Either party can remove
    if (
      friendship.requesterId !== args.userId &&
      friendship.recipientId !== args.userId
    ) {
      throw new Error("Not authorized");
    }

    await ctx.db.delete(friendship._id);
    return { success: true };
  },
});
