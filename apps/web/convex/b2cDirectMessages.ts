import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ==================== Constants ====================

const MAX_DM_BODY = 2000;
const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;

// ==================== Helpers ====================

function makeParticipantKey(a: string, b: string): string {
  return [a, b].sort().join("_");
}

async function resolvePhotoUrl(
  ctx: { storage: { getUrl: (id: string) => Promise<string | null> } },
  storageId: string | undefined | null
): Promise<string | null> {
  if (!storageId) return null;
  return await ctx.storage.getUrl(storageId);
}

// Fetch all threads where userId is participant1 or participant2
async function getAllThreadsForUser(ctx: QueryCtx, userId: Id<"b2cUsers">) {
  const [threads1, threads2] = await Promise.all([
    ctx.db
      .query("b2cDirectMessageThreads")
      .withIndex("by_participant1", (q) => q.eq("participant1Id", userId))
      .collect(),
    ctx.db
      .query("b2cDirectMessageThreads")
      .withIndex("by_participant2", (q) => q.eq("participant2Id", userId))
      .collect(),
  ]);
  return [...threads1, ...threads2];
}

// ==================== Queries ====================

// List all DM threads for a user, with other participant's info and unread counts
export const listThreads = query({
  args: {
    userId: v.id("b2cUsers"),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);

    let allThreads = await getAllThreadsForUser(ctx, args.userId);
    allThreads.sort((a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt));

    // Apply cursor
    if (args.cursor) {
      allThreads = allThreads.filter(
        (t) => (t.lastMessageAt ?? t.createdAt) < args.cursor!
      );
    }

    const page = allThreads.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    // Enrich with other user's info + unread count
    const enriched = await Promise.all(
      results.map(async (thread) => {
        const otherId =
          thread.participant1Id === args.userId
            ? thread.participant2Id
            : thread.participant1Id;

        const otherUser = await ctx.db.get(otherId);
        const profile = otherUser
          ? await ctx.db
              .query("b2cProfiles")
              .withIndex("by_user", (q) => q.eq("userId", otherId))
              .first()
          : null;

        const photoUrl = await resolvePhotoUrl(ctx, profile?.photoStorageId);

        // Count unread messages in this thread (sent by other user, not read)
        const unreadMessages = await ctx.db
          .query("b2cDirectMessages")
          .withIndex("by_recipient_unread", (q) =>
            q.eq("threadId", thread._id).eq("isRead", false)
          )
          .collect();
        const unreadCount = unreadMessages.filter(
          (m) => m.senderId !== args.userId && !m.isDeleted
        ).length;

        return {
          _id: thread._id,
          otherUserId: otherId,
          otherUserName: otherUser?.name ?? "Unknown",
          otherUserPhotoUrl: photoUrl,
          lastMessageAt: thread.lastMessageAt ?? thread.createdAt,
          lastMessagePreview: thread.lastMessagePreview ?? null,
          unreadCount,
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

// Get messages in a thread (paginated, chronological)
export const getMessages = query({
  args: {
    userId: v.id("b2cUsers"),
    threadId: v.id("b2cDirectMessageThreads"),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Validate user is a participant
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");
    if (thread.participant1Id !== args.userId && thread.participant2Id !== args.userId) {
      throw new Error("Not authorized");
    }

    const limit = Math.min(args.limit ?? PAGE_SIZE, MAX_PAGE_SIZE);

    // Fetch messages newest-first for pagination
    const messages = await ctx.db
      .query("b2cDirectMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .collect();

    // Apply cursor (messages older than cursor)
    let filtered = messages;
    if (args.cursor) {
      filtered = messages.filter((m) => m.createdAt < args.cursor!);
    }

    const page = filtered.slice(0, limit + 1);
    const hasMore = page.length > limit;
    const results = page.slice(0, limit);

    // Reverse for chronological display
    results.reverse();

    return {
      messages: results.map((m) => ({
        _id: m._id,
        threadId: m.threadId,
        senderId: m.senderId,
        body: m.isDeleted ? "" : m.body,
        isRead: m.isRead,
        isDeleted: m.isDeleted,
        createdAt: m.createdAt,
      })),
      nextCursor: hasMore ? page[limit].createdAt : null,
    };
  },
});

// Total unread count across all threads (for sidebar badge)
export const getUnreadCount = query({
  args: {
    userId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const allThreads = await getAllThreadsForUser(ctx, args.userId);
    let total = 0;

    for (const thread of allThreads) {
      const unread = await ctx.db
        .query("b2cDirectMessages")
        .withIndex("by_recipient_unread", (q) =>
          q.eq("threadId", thread._id).eq("isRead", false)
        )
        .collect();
      total += unread.filter(
        (m) => m.senderId !== args.userId && !m.isDeleted
      ).length;
    }

    return { count: total };
  },
});

// ==================== Mutations ====================

// Send a DM — creates thread if needed
export const sendMessage = mutation({
  args: {
    senderId: v.id("b2cUsers"),
    recipientId: v.id("b2cUsers"),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate sender
    const sender = await ctx.db.get(args.senderId);
    if (!sender) throw new Error("Sender not found");
    if (sender.subscriptionStatus !== "active") {
      throw new Error("Active subscription required");
    }

    // Validate recipient
    const recipient = await ctx.db.get(args.recipientId);
    if (!recipient) throw new Error("Recipient not found");

    // Cannot message self
    if (args.senderId === args.recipientId) {
      throw new Error("Cannot message yourself");
    }

    // Validate body
    const body = args.body.trim();
    if (body.length === 0) throw new Error("Message cannot be empty");
    if (body.length > MAX_DM_BODY) {
      throw new Error(`Message must be ${MAX_DM_BODY} characters or less`);
    }

    const now = Date.now();
    const participantKey = makeParticipantKey(args.senderId, args.recipientId);

    // Get or create thread
    let thread = await ctx.db
      .query("b2cDirectMessageThreads")
      .withIndex("by_participant_key", (q) => q.eq("participantKey", participantKey))
      .first();

    if (!thread) {
      // Create thread with sorted participants
      const sorted = [args.senderId, args.recipientId].sort();
      const threadId = await ctx.db.insert("b2cDirectMessageThreads", {
        participantKey,
        participant1Id: sorted[0] as any,
        participant2Id: sorted[1] as any,
        lastMessageAt: now,
        lastMessagePreview: body.slice(0, 100),
        createdAt: now,
      });
      thread = await ctx.db.get(threadId);
    } else {
      // Update thread metadata
      await ctx.db.patch(thread._id, {
        lastMessageAt: now,
        lastMessagePreview: body.slice(0, 100),
      });
    }

    // Insert message
    const messageId = await ctx.db.insert("b2cDirectMessages", {
      threadId: thread!._id,
      senderId: args.senderId,
      body,
      isRead: false,
      isDeleted: false,
      createdAt: now,
    });

    return { messageId, threadId: thread!._id };
  },
});

// Mark all unread messages in a thread as read
export const markThreadRead = mutation({
  args: {
    userId: v.id("b2cUsers"),
    threadId: v.id("b2cDirectMessageThreads"),
  },
  handler: async (ctx, args) => {
    // Validate participant
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");
    if (thread.participant1Id !== args.userId && thread.participant2Id !== args.userId) {
      throw new Error("Not authorized");
    }

    const now = Date.now();

    // Get unread messages from other user
    const unread = await ctx.db
      .query("b2cDirectMessages")
      .withIndex("by_recipient_unread", (q) =>
        q.eq("threadId", args.threadId).eq("isRead", false)
      )
      .collect();

    const toMark = unread.filter((m) => m.senderId !== args.userId);
    for (const msg of toMark) {
      await ctx.db.patch(msg._id, { isRead: true, readAt: now });
    }

    return { marked: toMark.length };
  },
});

// Soft-delete a message (sender only)
export const deleteMessage = mutation({
  args: {
    userId: v.id("b2cUsers"),
    messageId: v.id("b2cDirectMessages"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId !== args.userId) throw new Error("Not authorized");

    await ctx.db.patch(args.messageId, { isDeleted: true });

    // Update thread preview to reflect the latest non-deleted message
    const threadMessages = await ctx.db
      .query("b2cDirectMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", message.threadId))
      .order("desc")
      .collect();
    const latestVisible = threadMessages.find(
      (m) => !m.isDeleted && m._id !== args.messageId
    );
    await ctx.db.patch(message.threadId, {
      lastMessagePreview: latestVisible ? latestVisible.body.slice(0, 100) : undefined,
      ...(latestVisible ? { lastMessageAt: latestVisible.createdAt } : {}),
    });

    return { success: true };
  },
});

// ==================== Typing Indicators ====================

// Set typing indicator (upsert with 5s TTL)
export const setTyping = mutation({
  args: {
    userId: v.id("b2cUsers"),
    threadId: v.id("b2cDirectMessageThreads"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");
    if (thread.participant1Id !== args.userId && thread.participant2Id !== args.userId) {
      throw new Error("Not authorized");
    }

    // Upsert typing indicator
    const existing = await ctx.db
      .query("b2cTypingIndicators")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    const myIndicator = existing.find((t) => t.userId === args.userId);
    const expiresAt = Date.now() + 5000;

    if (myIndicator) {
      await ctx.db.patch(myIndicator._id, { expiresAt });
    } else {
      await ctx.db.insert("b2cTypingIndicators", {
        threadId: args.threadId,
        userId: args.userId,
        userName: user.name,
        expiresAt,
      });
    }

    return { success: true };
  },
});

// Get typing users for a thread (excluding requesting user)
export const getTypingUsers = query({
  args: {
    userId: v.id("b2cUsers"),
    threadId: v.id("b2cDirectMessageThreads"),
  },
  handler: async (ctx, args) => {
    const indicators = await ctx.db
      .query("b2cTypingIndicators")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    const now = Date.now();
    const active = indicators.filter(
      (t) => t.expiresAt > now && t.userId !== args.userId
    );

    return {
      users: active.map((t) => ({ userId: t.userId, userName: t.userName })),
    };
  },
});
