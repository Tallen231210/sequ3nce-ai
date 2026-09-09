import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { findOrCreateTeamThread } from "./b2cTeamNotifications";

// ============================================================================
// System posts into the "Sequ3nce Team" thread — the in-app half of every
// notification in the adoption batch (Monday roles, coaching reminders,
// cancel notes). Same writes as a founder broadcast so the inbox, unread
// badge and history panel treat them identically; no founder at the
// keyboard, so no founder check. Differences from the founder path, on
// purpose: test accounts are never recipients, replies stay allowed (the
// thread helper rewrites that flag on every send), and each message carries
// a `systemKind` so kinds can be counted later.
// ============================================================================

const MAX_BODY = 2000;
const MAX_RECIPIENTS = 500;

function isFounderOrAdmin(user: Pick<Doc<"b2cUsers">, "badges">): boolean {
  return !!user.badges?.includes("founder") || !!user.badges?.includes("admin");
}

function isNotifiable(user: Doc<"b2cUsers">): boolean {
  return (
    user.subscriptionStatus === "active" &&
    user.isTestAccount !== true &&
    !isFounderOrAdmin(user)
  );
}

/** The founder whose name system messages are sent under. */
async function founderId(ctx: { db: any }): Promise<Id<"b2cUsers">> {
  const users: Doc<"b2cUsers">[] = await ctx.db.query("b2cUsers").collect();
  const founder = users.find((u) => u.badges?.includes("founder"));
  if (!founder) throw new Error("No founder-badged account to send system messages as");
  return founder._id;
}

/** Active, non-test, non-founder members: the audience for system posts and
 *  digest email. Carries the opt-out flag so email callers can filter. */
export const listNotifiableMembers = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db
      .query("b2cUsers")
      .withIndex("by_subscription_status", (q) => q.eq("subscriptionStatus", "active"))
      .collect();
    return users.filter(isNotifiable).map((u) => ({
      userId: u._id,
      email: u.email,
      name: u.name,
      optedOut: u.emailNotificationsOptOut === true,
    }));
  },
});

export const sendSystemNotification = internalMutation({
  args: {
    kind: v.string(),
    body: v.string(),
    /** Omit for "every notifiable member". Explicit ids are still filtered
     *  through the same eligibility rules. */
    recipientIds: v.optional(v.array(v.id("b2cUsers"))),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const body = args.body.trim();
    if (!body) throw new Error("Message cannot be empty");
    if (body.length > MAX_BODY) throw new Error(`Message must be ${MAX_BODY} characters or less`);

    let recipients: Doc<"b2cUsers">[];
    if (args.recipientIds) {
      const unique = Array.from(new Set(args.recipientIds));
      const docs = await Promise.all(unique.map((id) => ctx.db.get(id)));
      recipients = docs.filter((u): u is Doc<"b2cUsers"> => !!u && isNotifiable(u));
    } else {
      const active = await ctx.db
        .query("b2cUsers")
        .withIndex("by_subscription_status", (q) => q.eq("subscriptionStatus", "active"))
        .collect();
      recipients = active.filter(isNotifiable);
    }
    if (recipients.length > MAX_RECIPIENTS) {
      console.warn(
        `[b2cSystemNotifications] ${args.kind}: ${recipients.length} recipients, capping at ${MAX_RECIPIENTS}`,
      );
      recipients = recipients.slice(0, MAX_RECIPIENTS);
    }
    if (args.dryRun) {
      return { broadcastId: null, recipientCount: recipients.length, dryRun: true };
    }
    if (recipients.length === 0) return { broadcastId: null, recipientCount: 0 };

    const sentBy = await founderId(ctx);
    const now = Date.now();
    const preview = body.slice(0, 100);
    const broadcastId = await ctx.db.insert("b2cTeamBroadcasts", {
      sentBy,
      body,
      recipientMode: args.recipientIds ? "specific" : "all",
      recipientCount: recipients.length,
      repliesAllowed: true,
      sentAt: now,
    });
    for (const recipient of recipients) {
      const threadId = await findOrCreateTeamThread(ctx, recipient._id, true, now);
      await ctx.db.insert("b2cDirectMessages", {
        threadId,
        senderId: sentBy,
        body,
        isRead: false,
        isDeleted: false,
        createdAt: now,
        teamSentBy: sentBy,
        broadcastId,
        systemKind: args.kind,
      });
      await ctx.db.patch(threadId, { lastMessageAt: now, lastMessagePreview: preview });
    }
    return { broadcastId, recipientCount: recipients.length };
  },
});
