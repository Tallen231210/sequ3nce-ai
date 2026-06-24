import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";

// ==================== Queries ====================

/** Get subscription info for a B2C user.
 *
 * Founder/admin badge bypass: if the user has either "founder" or "admin"
 * in their badges, we report subscriptionStatus as "active" regardless
 * of the actual Stripe state. Founders are comped — they shouldn't get
 * paywalled if their Stripe subscription lapses for any reason. This
 * single source of truth is consumed by the Personal app's paywall gate
 * and the /b2c/subscription-status HTTP route.
 *
 * stripeCustomerId / subscriptionId / cancelledAt remain the raw values
 * for downstream billing flows that need the actual Stripe state.
 */
export const getB2CSubscription = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;

    const badges = user.badges ?? [];
    const hasBypass = badges.includes("founder") || badges.includes("admin");
    const effectiveStatus = hasBypass ? "active" : user.subscriptionStatus;

    return {
      subscriptionStatus: effectiveStatus,
      stripeCustomerId: user.stripeCustomerId,
      subscriptionId: user.subscriptionId,
      cancelledAt: user.cancelledAt,
    };
  },
});

/** Get total B2C user count (for tiered pricing — $99 for first 100, $129.99 after) */
export const getB2CUserCount = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("b2cUsers").collect();
    return users.length;
  },
});

// ==================== Mutations ====================

/** Set Stripe customer ID on a B2C user (called during checkout creation) */
export const setB2CStripeCustomerId = mutation({
  args: {
    userId: v.id("b2cUsers"),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, { userId, stripeCustomerId }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    await ctx.db.patch(userId, { stripeCustomerId });
  },
});

/** Update B2C subscription status (called by webhook handler) */
export const updateB2CSubscription = mutation({
  args: {
    stripeCustomerId: v.string(),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("past_due"),
      v.literal("none")
    ),
    subscriptionId: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Find user by Stripe customer ID
    const user = await ctx.db
      .query("b2cUsers")
      .filter((q) => q.eq(q.field("stripeCustomerId"), args.stripeCustomerId))
      .first();

    if (!user) {
      console.error(`No B2C user found for Stripe customer ${args.stripeCustomerId}`);
      return;
    }

    const updates: Record<string, unknown> = {
      subscriptionStatus: args.subscriptionStatus,
    };

    if (args.subscriptionId !== undefined) {
      updates.subscriptionId = args.subscriptionId;
    }
    if (args.cancelledAt !== undefined) {
      updates.cancelledAt = args.cancelledAt;
    }

    await ctx.db.patch(user._id, updates);
    console.log(`B2C subscription updated for ${user.email}: ${args.subscriptionStatus}`);
  },
});

/** Update subscription by b2cUserId directly (used during checkout completion) */
export const updateB2CSubscriptionByUserId = mutation({
  args: {
    userId: v.id("b2cUsers"),
    subscriptionStatus: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("past_due"),
      v.literal("none")
    ),
    subscriptionId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      console.error(`No B2C user found for ID ${args.userId}`);
      return;
    }

    const updates: Record<string, unknown> = {
      subscriptionStatus: args.subscriptionStatus,
    };

    if (args.subscriptionId !== undefined) {
      updates.subscriptionId = args.subscriptionId;
    }
    if (args.stripeCustomerId !== undefined) {
      updates.stripeCustomerId = args.stripeCustomerId;
    }

    await ctx.db.patch(args.userId, updates);
    console.log(`B2C subscription updated for ${user.email}: ${args.subscriptionStatus}`);
  },
});

// ==================== Internal variants (for Stripe actions) ====================

/** Internal query: get subscription info for a B2C user */
export const getB2CSubscriptionInternal = internalQuery({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    return {
      subscriptionStatus: user.subscriptionStatus,
      stripeCustomerId: user.stripeCustomerId,
      subscriptionId: user.subscriptionId,
    };
  },
});

/** Internal mutation: set Stripe customer ID */
export const setB2CStripeCustomerIdInternal = internalMutation({
  args: { userId: v.id("b2cUsers"), stripeCustomerId: v.string() },
  handler: async (ctx, { userId, stripeCustomerId }) => {
    await ctx.db.patch(userId, { stripeCustomerId });
  },
});

/** Internal query: get total B2C user count for pricing tier */
export const getB2CUserCountInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("b2cUsers").collect();
    return users.length;
  },
});
