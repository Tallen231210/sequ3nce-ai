import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ==================== Constants ====================

const MAX_BODY = 2000;
const MAX_RECIPIENTS_PER_SEND = 500;
const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;
const MAX_UNREAD_BADGE_COUNT = 99;

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

function teamParticipantKey(userId: Id<"b2cUsers">): string {
  return `team_${userId}`;
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

// Find or create a team thread for a recipient. Used during fan-out.
async function findOrCreateTeamThread(
  ctx: MutationCtx,
  recipientId: Id<"b2cUsers">,
  repliesAllowed: boolean,
  now: number
): Promise<Id<"b2cDirectMessageThreads">> {
  const participantKey = teamParticipantKey(recipientId);
  const existing = await ctx.db
    .query("b2cDirectMessageThreads")
    .withIndex("by_participant_key", (q) => q.eq("participantKey", participantKey))
    .first();
  if (existing) {
    // Update repliesAllowed if it changed for this new broadcast
    if (existing.repliesAllowed !== repliesAllowed) {
      await ctx.db.patch(existing._id, { repliesAllowed });
    }
    return existing._id;
  }
  return await ctx.db.insert("b2cDirectMessageThreads", {
    participantKey,
    participant1Id: recipientId,
    participant2Id: undefined,
    lastMessageAt: now,
    lastMessagePreview: "",
    createdAt: now,
    senderType: "team",
    repliesAllowed,
  });
}

// ==================== Mutations ====================

// Send a team notification to a specific set of recipients.
export const sendTeamNotification = mutation({
  args: {
    founderId: v.id("b2cUsers"),
    recipientIds: v.array(v.id("b2cUsers")),
    body: v.string(),
    repliesAllowed: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);

    const body = args.body.trim();
    if (body.length === 0) throw new Error("Message cannot be empty");
    if (body.length > MAX_BODY) {
      throw new Error(`Message must be ${MAX_BODY} characters or less`);
    }
    if (args.recipientIds.length === 0) {
      throw new Error("At least one recipient is required");
    }
    if (args.recipientIds.length > MAX_RECIPIENTS_PER_SEND) {
      throw new Error(`Cannot send to more than ${MAX_RECIPIENTS_PER_SEND} recipients at once`);
    }

    // Dedup recipient IDs to avoid duplicate writes if the caller passes duplicates
    const uniqueRecipients = Array.from(new Set(args.recipientIds)) as Id<"b2cUsers">[];

    const now = Date.now();
    const preview = body.slice(0, 100);

    const broadcastId = await ctx.db.insert("b2cTeamBroadcasts", {
      sentBy: args.founderId,
      body,
      recipientMode: "specific",
      recipientCount: uniqueRecipients.length,
      repliesAllowed: args.repliesAllowed,
      sentAt: now,
    });

    const threadIds: Id<"b2cDirectMessageThreads">[] = [];
    for (const recipientId of uniqueRecipients) {
      const threadId = await findOrCreateTeamThread(ctx, recipientId, args.repliesAllowed, now);
      await ctx.db.insert("b2cDirectMessages", {
        threadId,
        senderId: args.founderId,
        body,
        isRead: false,
        isDeleted: false,
        createdAt: now,
        teamSentBy: args.founderId,
        broadcastId,
      });
      await ctx.db.patch(threadId, {
        lastMessageAt: now,
        lastMessagePreview: preview,
      });
      threadIds.push(threadId);
    }

    return { broadcastId, threadIds, recipientCount: uniqueRecipients.length };
  },
});

// Send a team notification to all active, non-founder users.
export const sendTeamNotificationToAll = mutation({
  args: {
    founderId: v.id("b2cUsers"),
    body: v.string(),
    repliesAllowed: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);

    const body = args.body.trim();
    if (body.length === 0) throw new Error("Message cannot be empty");
    if (body.length > MAX_BODY) {
      throw new Error(`Message must be ${MAX_BODY} characters or less`);
    }

    // Collect all eligible recipients: active subscription, not a founder/admin.
    const activeUsers = await ctx.db
      .query("b2cUsers")
      .withIndex("by_subscription_status", (q) => q.eq("subscriptionStatus", "active"))
      .collect();
    const recipients = activeUsers
      .filter((u) => !isFounder(u))
      .map((u) => u._id);

    if (recipients.length === 0) {
      throw new Error("No eligible recipients");
    }
    if (recipients.length > MAX_RECIPIENTS_PER_SEND) {
      throw new Error(`Too many recipients (${recipients.length}); split into batches`);
    }

    const now = Date.now();
    const preview = body.slice(0, 100);

    const broadcastId = await ctx.db.insert("b2cTeamBroadcasts", {
      sentBy: args.founderId,
      body,
      recipientMode: "all",
      recipientCount: recipients.length,
      repliesAllowed: args.repliesAllowed,
      sentAt: now,
    });

    for (const recipientId of recipients) {
      const threadId = await findOrCreateTeamThread(ctx, recipientId, args.repliesAllowed, now);
      await ctx.db.insert("b2cDirectMessages", {
        threadId,
        senderId: args.founderId,
        body,
        isRead: false,
        isDeleted: false,
        createdAt: now,
        teamSentBy: args.founderId,
        broadcastId,
      });
      await ctx.db.patch(threadId, {
        lastMessageAt: now,
        lastMessagePreview: preview,
      });
    }

    return { broadcastId, recipientCount: recipients.length };
  },
});

// Mark all user-sent messages in a team thread as read (shared state across founders).
export const markTeamThreadRead = mutation({
  args: {
    founderId: v.id("b2cUsers"),
    threadId: v.id("b2cDirectMessageThreads"),
  },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");
    if (thread.senderType !== "team") throw new Error("Not a team thread");

    const unread = await ctx.db
      .query("b2cDirectMessages")
      .withIndex("by_recipient_unread", (q) =>
        q.eq("threadId", args.threadId).eq("isRead", false)
      )
      .collect();

    const now = Date.now();
    for (const msg of unread) {
      // Only mark user-sent replies as read (not team-sent originals)
      if (!msg.teamSentBy) {
        await ctx.db.patch(msg._id, { isRead: true, readAt: now });
      }
    }
    return { marked: unread.filter((m) => !m.teamSentBy).length };
  },
});

// Reply into an existing team thread (user side only — founders use sendTeamMessageAsTeam).
// Enforces thread.repliesAllowed.
export const replyToTeamThread = mutation({
  args: {
    senderId: v.id("b2cUsers"),
    threadId: v.id("b2cDirectMessageThreads"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const sender = await ctx.db.get(args.senderId);
    if (!sender) throw new Error("Sender not found");
    if (sender.subscriptionStatus !== "active") {
      throw new Error("Active subscription required");
    }

    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");
    if (thread.senderType !== "team") throw new Error("Not a team thread");
    if (thread.repliesAllowed === false) {
      throw new Error("Replies are disabled for this notification");
    }
    if (thread.participant1Id !== args.senderId) {
      throw new Error("Not authorized");
    }

    const body = args.body.trim();
    if (body.length === 0) throw new Error("Message cannot be empty");
    if (body.length > MAX_BODY) {
      throw new Error(`Message must be ${MAX_BODY} characters or less`);
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("b2cDirectMessages", {
      threadId: args.threadId,
      senderId: args.senderId,
      body,
      isRead: false,
      isDeleted: false,
      createdAt: now,
    });
    await ctx.db.patch(args.threadId, {
      lastMessageAt: now,
      lastMessagePreview: body.slice(0, 100),
    });
    return { messageId };
  },
});

// Send a reply as "Sequ3nce Team" from a founder into an existing team thread.
export const sendTeamMessageAsTeam = mutation({
  args: {
    founderId: v.id("b2cUsers"),
    threadId: v.id("b2cDirectMessageThreads"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");
    if (thread.senderType !== "team") throw new Error("Not a team thread");

    const body = args.body.trim();
    if (body.length === 0) throw new Error("Message cannot be empty");
    if (body.length > MAX_BODY) {
      throw new Error(`Message must be ${MAX_BODY} characters or less`);
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("b2cDirectMessages", {
      threadId: args.threadId,
      senderId: args.founderId,
      body,
      isRead: false,
      isDeleted: false,
      createdAt: now,
      teamSentBy: args.founderId,
    });
    await ctx.db.patch(args.threadId, {
      lastMessageAt: now,
      lastMessagePreview: body.slice(0, 100),
    });
    return { messageId };
  },
});

// ==================== Queries ====================

// Count of active users eligible for an "all users" broadcast (for the compose UI).
export const getEligibleRecipientCount = query({
  args: { founderId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);
    const activeUsers = await ctx.db
      .query("b2cUsers")
      .withIndex("by_subscription_status", (q) => q.eq("subscriptionStatus", "active"))
      .collect();
    const count = activeUsers.filter((u) => !isFounder(u)).length;
    return { count };
  },
});

// List past broadcasts for the founder history panel.
export const listTeamBroadcasts = query({
  args: {
    founderId: v.id("b2cUsers"),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);
    const limit = Math.min(args.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);

    let all = await ctx.db
      .query("b2cTeamBroadcasts")
      .withIndex("by_sent_at")
      .order("desc")
      .collect();

    if (args.cursor) {
      all = all.filter((b) => b.sentAt < args.cursor!);
    }

    const page = all.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    const enriched = await Promise.all(
      results.map(async (b) => {
        const sender = await ctx.db.get(b.sentBy);
        const readMessages = await ctx.db
          .query("b2cDirectMessages")
          .withIndex("by_broadcast", (q) => q.eq("broadcastId", b._id))
          .collect();
        const readCount = readMessages.filter((m) => m.isRead).length;
        return {
          _id: b._id,
          body: b.body,
          recipientMode: b.recipientMode,
          recipientCount: b.recipientCount,
          repliesAllowed: b.repliesAllowed,
          sentAt: b.sentAt,
          sentBy: sender ? { userId: sender._id, name: sender.name } : null,
          readCount,
        };
      })
    );

    return {
      broadcasts: enriched,
      nextCursor: hasMore ? results[results.length - 1].sentAt : null,
    };
  },
});

// List team threads (founder inbox). Includes recipient info + unread count of user-sent replies.
export const listTeamThreads = query({
  args: {
    founderId: v.id("b2cUsers"),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);
    const limit = Math.min(args.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);

    let all = await ctx.db
      .query("b2cDirectMessageThreads")
      .withIndex("by_sender_type_last", (q) => q.eq("senderType", "team"))
      .order("desc")
      .collect();

    if (args.cursor) {
      all = all.filter((t) => (t.lastMessageAt ?? t.createdAt) < args.cursor!);
    }

    const page = all.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    const enriched = await Promise.all(
      results.map(async (thread) => {
        const recipient = await ctx.db.get(thread.participant1Id);
        const profile = recipient
          ? await ctx.db
              .query("b2cProfiles")
              .withIndex("by_user", (q) => q.eq("userId", thread.participant1Id))
              .first()
          : null;
        const photoUrl = await resolvePhotoUrl(ctx, profile?.photoStorageId);

        // Unread count: user-sent replies (no teamSentBy) where isRead=false
        const unreadMessages = await ctx.db
          .query("b2cDirectMessages")
          .withIndex("by_recipient_unread", (q) =>
            q.eq("threadId", thread._id).eq("isRead", false)
          )
          .collect();
        const unreadCount = unreadMessages.filter(
          (m) => !m.teamSentBy && !m.isDeleted
        ).length;

        return {
          _id: thread._id,
          recipientUserId: thread.participant1Id as string,
          recipientName: recipient?.name ?? "Unknown",
          recipientPhotoUrl: photoUrl,
          lastMessageAt: thread.lastMessageAt ?? thread.createdAt,
          lastMessagePreview: thread.lastMessagePreview ?? null,
          unreadCount,
          repliesAllowed: thread.repliesAllowed ?? false,
          createdAt: thread.createdAt,
        };
      })
    );

    return {
      threads: enriched,
      nextCursor: hasMore
        ? (results[results.length - 1].lastMessageAt ?? results[results.length - 1].createdAt)
        : null,
    };
  },
});

// Global badge count for the Notifications sidebar tab: total unread user-sent replies
// across all team threads. Any founder sees the same number (shared inbox semantics).
export const getTeamUnreadCount = query({
  args: { founderId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);

    const teamThreads = await ctx.db
      .query("b2cDirectMessageThreads")
      .withIndex("by_sender_type_last", (q) => q.eq("senderType", "team"))
      .collect();

    let count = 0;
    for (const thread of teamThreads) {
      const unread = await ctx.db
        .query("b2cDirectMessages")
        .withIndex("by_recipient_unread", (q) =>
          q.eq("threadId", thread._id).eq("isRead", false)
        )
        .collect();
      count += unread.filter((m) => !m.teamSentBy && !m.isDeleted).length;
      if (count >= MAX_UNREAD_BADGE_COUNT) break;
    }
    return { count: Math.min(count, MAX_UNREAD_BADGE_COUNT) };
  },
});

// Fetch messages in a team thread (founder view, no participant check).
export const getTeamThreadMessages = query({
  args: {
    founderId: v.id("b2cUsers"),
    threadId: v.id("b2cDirectMessageThreads"),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireFounder(ctx, args.founderId);
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");
    if (thread.senderType !== "team") throw new Error("Not a team thread");

    const limit = Math.min(args.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);
    let q = ctx.db
      .query("b2cDirectMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc");
    let all = await q.collect();
    if (args.cursor) {
      all = all.filter((m) => m.createdAt < args.cursor!);
    }
    const page = all.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);
    // Return chronological (oldest first) for UI rendering
    const ordered = results.slice().reverse();

    return {
      messages: ordered.map((m) => ({
        _id: m._id,
        threadId: m.threadId,
        senderId: m.senderId,
        body: m.body,
        isRead: m.isRead,
        isDeleted: m.isDeleted,
        createdAt: m.createdAt,
        teamSentBy: m.teamSentBy ?? null,
      })),
      nextCursor: hasMore ? results[results.length - 1].createdAt : null,
      thread: {
        _id: thread._id,
        recipientUserId: thread.participant1Id as string,
        repliesAllowed: thread.repliesAllowed ?? false,
      },
    };
  },
});
