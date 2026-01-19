import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================
// MUTATIONS
// ============================================

/**
 * Send a message from manager to closer or closer to manager
 */
export const sendMessage = mutation({
  args: {
    teamId: v.string(),
    senderType: v.string(), // "manager" | "closer"
    senderUserId: v.optional(v.string()), // If manager
    senderCloserId: v.optional(v.string()), // If closer
    senderName: v.string(),
    recipientType: v.string(), // "manager" | "closer"
    recipientUserId: v.optional(v.string()), // If manager
    recipientCloserId: v.optional(v.string()), // If closer
    message: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate message length
    if (args.message.length > 500) {
      throw new Error("Message too long (max 500 characters)");
    }

    if (args.message.trim().length === 0) {
      throw new Error("Message cannot be empty");
    }

    const messageId = await ctx.db.insert("liveMessages", {
      teamId: args.teamId as Id<"teams">,
      senderType: args.senderType,
      senderUserId: args.senderUserId ? (args.senderUserId as Id<"users">) : undefined,
      senderCloserId: args.senderCloserId ? (args.senderCloserId as Id<"closers">) : undefined,
      senderName: args.senderName,
      recipientType: args.recipientType,
      recipientUserId: args.recipientUserId ? (args.recipientUserId as Id<"users">) : undefined,
      recipientCloserId: args.recipientCloserId ? (args.recipientCloserId as Id<"closers">) : undefined,
      message: args.message.trim(),
      isRead: false,
      createdAt: Date.now(),
    });

    console.log(`[liveMessages] Message sent: ${messageId} from ${args.senderType} to ${args.recipientType}`);
    return messageId;
  },
});

/**
 * Mark a single message as read
 */
export const markAsRead = mutation({
  args: {
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    const messageIdTyped = args.messageId as Id<"liveMessages">;
    const message = await ctx.db.get(messageIdTyped);

    if (!message) {
      return { success: false, error: "Message not found" };
    }

    if (message.isRead) {
      return { success: true, alreadyRead: true };
    }

    await ctx.db.patch(messageIdTyped, {
      isRead: true,
      readAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Mark all unread messages for a closer as read
 * Used when closer opens the chat panel
 */
export const markAllAsReadForCloser = mutation({
  args: {
    closerId: v.string(),
  },
  handler: async (ctx, args) => {
    const closerIdTyped = args.closerId as Id<"closers">;

    // Get all unread messages for this closer
    const unreadMessages = await ctx.db
      .query("liveMessages")
      .withIndex("by_recipient_closer", (q) =>
        q.eq("recipientCloserId", closerIdTyped).eq("isRead", false)
      )
      .collect();

    const now = Date.now();
    let markedCount = 0;

    for (const message of unreadMessages) {
      await ctx.db.patch(message._id, {
        isRead: true,
        readAt: now,
      });
      markedCount++;
    }

    console.log(`[liveMessages] Marked ${markedCount} messages as read for closer ${args.closerId}`);
    return { success: true, markedCount };
  },
});

/**
 * Mark all unread messages for a manager from a specific closer as read
 * Used when manager opens conversation with a specific closer
 */
export const markConversationAsRead = mutation({
  args: {
    userId: v.string(), // Manager's user ID
    closerId: v.string(), // The closer they're chatting with
  },
  handler: async (ctx, args) => {
    const userIdTyped = args.userId as Id<"users">;
    const closerIdTyped = args.closerId as Id<"closers">;

    // Get all unread messages FROM this closer TO this manager
    const unreadMessages = await ctx.db
      .query("liveMessages")
      .withIndex("by_recipient_user", (q) =>
        q.eq("recipientUserId", userIdTyped).eq("isRead", false)
      )
      .filter((q) => q.eq(q.field("senderCloserId"), closerIdTyped))
      .collect();

    const now = Date.now();
    let markedCount = 0;

    for (const message of unreadMessages) {
      await ctx.db.patch(message._id, {
        isRead: true,
        readAt: now,
      });
      markedCount++;
    }

    console.log(`[liveMessages] Marked ${markedCount} messages as read for manager ${args.userId} from closer ${args.closerId}`);
    return { success: true, markedCount };
  },
});

// ============================================
// QUERIES - For Desktop App (Closer)
// ============================================

/**
 * Get all messages for a closer (both sent and received)
 * Used by desktop app to display the chat panel
 */
export const getMessagesForCloser = query({
  args: {
    closerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const closerIdTyped = args.closerId as Id<"closers">;
    const limit = args.limit ?? 100;

    // Get messages where closer is either sender or recipient
    const receivedMessages = await ctx.db
      .query("liveMessages")
      .withIndex("by_recipient_closer", (q) =>
        q.eq("recipientCloserId", closerIdTyped)
      )
      .order("desc")
      .take(limit);

    const sentMessages = await ctx.db
      .query("liveMessages")
      .withIndex("by_sender_closer", (q) =>
        q.eq("senderCloserId", closerIdTyped)
      )
      .order("desc")
      .take(limit);

    // Combine and sort by createdAt
    const allMessages = [...receivedMessages, ...sentMessages]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-limit);

    return allMessages.map((msg) => ({
      _id: msg._id,
      senderType: msg.senderType,
      senderName: msg.senderName,
      message: msg.message,
      isRead: msg.isRead,
      createdAt: msg.createdAt,
      isFromMe: msg.senderCloserId === closerIdTyped,
    }));
  },
});

/**
 * Get unread message count for a closer
 * Used by desktop app to show badge on chat icon
 */
export const getUnreadCountForCloser = query({
  args: {
    closerId: v.string(),
  },
  handler: async (ctx, args) => {
    const closerIdTyped = args.closerId as Id<"closers">;

    const unreadMessages = await ctx.db
      .query("liveMessages")
      .withIndex("by_recipient_closer", (q) =>
        q.eq("recipientCloserId", closerIdTyped).eq("isRead", false)
      )
      .collect();

    return { count: unreadMessages.length };
  },
});

/**
 * Get the latest unread message for a closer
 * Used by desktop app to show notification banner
 */
export const getLatestUnreadForCloser = query({
  args: {
    closerId: v.string(),
  },
  handler: async (ctx, args) => {
    const closerIdTyped = args.closerId as Id<"closers">;

    const latestUnread = await ctx.db
      .query("liveMessages")
      .withIndex("by_recipient_closer", (q) =>
        q.eq("recipientCloserId", closerIdTyped).eq("isRead", false)
      )
      .order("desc")
      .first();

    if (!latestUnread) {
      return null;
    }

    return {
      _id: latestUnread._id,
      senderName: latestUnread.senderName,
      message: latestUnread.message,
      createdAt: latestUnread.createdAt,
    };
  },
});

// ============================================
// QUERIES - For Web Dashboard (Manager)
// ============================================

/**
 * Get all closers for a team with their message status
 * Shows unread count and last message preview for each closer
 */
export const getClosersWithMessageStatus = query({
  args: {
    teamId: v.string(),
    userId: v.string(), // Manager's user ID
  },
  handler: async (ctx, args) => {
    const teamIdTyped = args.teamId as Id<"teams">;
    const userIdTyped = args.userId as Id<"users">;

    // Get all closers for the team
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", teamIdTyped))
      .collect();

    // For each closer, get message stats
    const closersWithStatus = await Promise.all(
      closers.map(async (closer) => {
        // Get unread messages FROM this closer TO the manager
        const unreadFromCloser = await ctx.db
          .query("liveMessages")
          .withIndex("by_recipient_user", (q) =>
            q.eq("recipientUserId", userIdTyped).eq("isRead", false)
          )
          .filter((q) => q.eq(q.field("senderCloserId"), closer._id))
          .collect();

        // Get the most recent message in the conversation (either direction)
        const recentFromCloser = await ctx.db
          .query("liveMessages")
          .withIndex("by_sender_closer", (q) =>
            q.eq("senderCloserId", closer._id)
          )
          .filter((q) => q.eq(q.field("recipientUserId"), userIdTyped))
          .order("desc")
          .first();

        const recentToCloser = await ctx.db
          .query("liveMessages")
          .withIndex("by_recipient_closer", (q) =>
            q.eq("recipientCloserId", closer._id)
          )
          .filter((q) => q.eq(q.field("senderUserId"), userIdTyped))
          .order("desc")
          .first();

        // Get the most recent message between the two
        let lastMessage = null;
        if (recentFromCloser && recentToCloser) {
          lastMessage = recentFromCloser.createdAt > recentToCloser.createdAt
            ? recentFromCloser
            : recentToCloser;
        } else {
          lastMessage = recentFromCloser || recentToCloser;
        }

        return {
          _id: closer._id,
          name: closer.name,
          email: closer.email,
          isOnCall: closer.status === "on_call",
          unreadCount: unreadFromCloser.length,
          lastMessage: lastMessage
            ? {
                message: lastMessage.message,
                createdAt: lastMessage.createdAt,
                isFromCloser: lastMessage.senderCloserId === closer._id,
              }
            : null,
        };
      })
    );

    // Sort by: has unread first, then by last message time
    return closersWithStatus.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      const aTime = a.lastMessage?.createdAt ?? 0;
      const bTime = b.lastMessage?.createdAt ?? 0;
      return bTime - aTime;
    });
  },
});

/**
 * Get conversation messages between a manager and a specific closer
 */
export const getConversationMessages = query({
  args: {
    userId: v.string(), // Manager's user ID
    closerId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userIdTyped = args.userId as Id<"users">;
    const closerIdTyped = args.closerId as Id<"closers">;
    const limit = args.limit ?? 100;

    // Messages FROM manager TO closer
    const fromManager = await ctx.db
      .query("liveMessages")
      .withIndex("by_sender_user", (q) =>
        q.eq("senderUserId", userIdTyped)
      )
      .filter((q) => q.eq(q.field("recipientCloserId"), closerIdTyped))
      .order("desc")
      .take(limit);

    // Messages FROM closer TO manager
    const fromCloser = await ctx.db
      .query("liveMessages")
      .withIndex("by_sender_closer", (q) =>
        q.eq("senderCloserId", closerIdTyped)
      )
      .filter((q) => q.eq(q.field("recipientUserId"), userIdTyped))
      .order("desc")
      .take(limit);

    // Combine and sort by createdAt (oldest first)
    const allMessages = [...fromManager, ...fromCloser]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-limit);

    return allMessages.map((msg) => ({
      _id: msg._id,
      senderType: msg.senderType,
      senderName: msg.senderName,
      message: msg.message,
      isRead: msg.isRead,
      createdAt: msg.createdAt,
      isFromMe: msg.senderUserId === userIdTyped,
    }));
  },
});

/**
 * Get total unread count for a manager across all closers
 * Used for the main chat button badge
 */
export const getTotalUnreadForManager = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const userIdTyped = args.userId as Id<"users">;

    const unreadMessages = await ctx.db
      .query("liveMessages")
      .withIndex("by_recipient_user", (q) =>
        q.eq("recipientUserId", userIdTyped).eq("isRead", false)
      )
      .collect();

    return { count: unreadMessages.length };
  },
});
