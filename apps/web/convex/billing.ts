import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// Founder team IDs that always have free access (comma-separated in env var)
// Set FOUNDER_TEAM_IDS in Convex dashboard to grant free access
function isFounderTeam(teamId: string): boolean {
  const founderTeamIds = process.env.FOUNDER_TEAM_IDS?.split(",").map(id => id.trim()) || [];
  return founderTeamIds.includes(teamId);
}

/**
 * The team id for a signed-in user.
 *
 * Needed by Polar checkout, which sends our own id as `external_customer_id`
 * so a subscription can always be traced back to a team — see the comment on
 * `polar.applySubscription`.
 */
export const getTeamIdForClerkUser = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    return user?.teamId ?? null;
  },
});

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
        polarCustomerId: team.polarCustomerId,
        polarSubscriptionId: team.polarSubscriptionId,
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
      // The same two ids at Polar. Both processors are readable from one
      // query because a team has at most one of them and the caller knows
      // which it wants — B2C reads the Stripe pair, B2B reads these.
      polarCustomerId: team.polarCustomerId,
      polarSubscriptionId: team.polarSubscriptionId,
      subscriptionStatus: team.subscriptionStatus,
      currentPeriodEnd: team.currentPeriodEnd,
      seatCount: team.seatCount || 0,
      activeCloserCount,
      plan: team.plan,
      // Which product they bought. Absent means they predate tiers, and
      // everyone who predates tiers bought the whole thing.
      productTier: team.productTierOverride ?? team.productTier ?? "overwatch",
      /** True when the tier was pinned by hand rather than derived from Stripe. */
      productTierPinned: !!team.productTierOverride,
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
    /**
     * Which product they're paying for, derived from the Stripe price on their
     * subscription. Optional and only ever passed when we RECOGNISED the price
     * — an unknown price must leave the existing tier alone rather than
     * downgrade a paying customer because someone mistyped an env var.
     */
    productTier: v.optional(v.string()),
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
      // Don't throw: the primary caller is the Stripe webhook, and a throw
      // makes it 500 → Stripe retries for 72h → warning emails → eventual
      // endpoint auto-disable risk. A missing team isn't retriable (an
      // orphaned Stripe customer whose team was deleted — e.g. Zion's test
      // account, July 2026 — can never heal by retrying). Callers decide
      // how loud to be: the webhook logs to Sentry + acks 200; the seat
      // route treats it as a real error.
      return { success: false as const, reason: "team_not_found" as const };
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
    if (args.productTier !== undefined) {
      // An override means someone deliberately pinned this team's tier, and a
      // routine invoice must not undo that. Skipping the write is the whole
      // mechanism — see the field's comment in schema.ts.
      if (team.productTierOverride) {
        console.log(
          `[billing] team ${team._id} is pinned to ` +
            `"${team.productTierOverride}" — ignoring tier "${args.productTier}" from Stripe`,
        );
      } else {
        updates.productTier = args.productTier;
      }
    }

    await ctx.db.patch(team._id, updates);

    return { success: true as const, teamId: team._id };
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

/**
 * Pin a team to a tier regardless of what they pay.
 *
 * For comped accounts and internal testing only. Writes both the override and
 * the effective tier so the change is visible immediately rather than at the
 * next Stripe event — which for a pinned team never comes.
 */
export const setProductTierOverride = internalMutation({
  args: {
    teamId: v.id("teams"),
    /** Pass null to unpin and let Stripe decide again. */
    tier: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    if (args.tier === null) {
      await ctx.db.patch(args.teamId, { productTierOverride: undefined });
      return { pinned: false };
    }
    if (!["overview", "oversight", "overwatch"].includes(args.tier)) {
      throw new Error(`Unknown tier: ${args.tier}`);
    }
    await ctx.db.patch(args.teamId, {
      productTierOverride: args.tier,
      productTier: args.tier,
    });
    return { pinned: true, tier: args.tier };
  },
});
