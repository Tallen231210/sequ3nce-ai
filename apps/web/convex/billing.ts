import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Founder team IDs that always have free access (comma-separated in env var)
// Set FOUNDER_TEAM_IDS in Convex dashboard to grant free access
function isFounderTeam(teamId: string): boolean {
  const founderTeamIds = process.env.FOUNDER_TEAM_IDS?.split(",").map(id => id.trim()) || [];
  return founderTeamIds.includes(teamId);
}

// Get billing info for the current team
export const getTeamBilling = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // Find the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return null;
    }

    // Get the team
    const team = await ctx.db.get(user.teamId);
    if (!team) {
      return null;
    }

    // Check if this is a founder team - always return active subscription
    if (isFounderTeam(user.teamId)) {
      return {
        stripeCustomerId: team.stripeCustomerId,
        stripeSubscriptionId: team.stripeSubscriptionId,
        subscriptionStatus: "active", // Always active for founders
        currentPeriodEnd: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
        seatCount: 999, // Unlimited seats for founders
        activeCloserCount: 0,
        plan: "founder",
      };
    }

    // Count active closers
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    const activeCloserCount = closers.filter(
      (c) => c.status === "active" || c.status === "pending"
    ).length;

    return {
      stripeCustomerId: team.stripeCustomerId,
      stripeSubscriptionId: team.stripeSubscriptionId,
      subscriptionStatus: team.subscriptionStatus,
      currentPeriodEnd: team.currentPeriodEnd,
      seatCount: team.seatCount || 0,
      activeCloserCount,
      plan: team.plan,
    };
  },
});

// Update team billing info (called from webhook)
export const updateTeamBilling = mutation({
  args: {
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    seatCount: v.optional(v.number()),
    plan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find team by Stripe customer ID
    const team = await ctx.db
      .query("teams")
      .withIndex("by_stripe_customer", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();

    if (!team) {
      throw new Error(`No team found with stripeCustomerId: ${args.stripeCustomerId}`);
    }

    // Build update object with only defined values
    const updates: Record<string, unknown> = {};
    if (args.stripeSubscriptionId !== undefined) {
      updates.stripeSubscriptionId = args.stripeSubscriptionId;
    }
    if (args.subscriptionStatus !== undefined) {
      updates.subscriptionStatus = args.subscriptionStatus;
    }
    if (args.currentPeriodEnd !== undefined) {
      updates.currentPeriodEnd = args.currentPeriodEnd;
    }
    if (args.seatCount !== undefined) {
      updates.seatCount = args.seatCount;
    }
    if (args.plan !== undefined) {
      updates.plan = args.plan;
    }

    await ctx.db.patch(team._id, updates);

    return { success: true, teamId: team._id };
  },
});

// Set Stripe customer ID on team (called after creating Stripe customer)
export const setStripeCustomerId = mutation({
  args: {
    clerkId: v.string(),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Update team with Stripe customer ID
    await ctx.db.patch(user.teamId, {
      stripeCustomerId: args.stripeCustomerId,
    });

    return { success: true };
  },
});

// Get team by Stripe customer ID (for webhook handler)
export const getTeamByStripeCustomer = query({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query("teams")
      .withIndex("by_stripe_customer", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();

    return team;
  },
});
