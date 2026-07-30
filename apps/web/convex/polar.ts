// ============================================================================
// Polar — receiving subscription changes.
//
// Built alongside Stripe, not as a replacement for it. Stripe is still the
// live processor and nothing here affects it: a team's plan only comes from
// Polar once someone deliberately points checkout at Polar.
//
// The tier still comes from the processor rather than being stored on its own,
// for the same reason it did with Stripe — entitlement and billing can't drift
// apart if there's only one fact. Polar makes it simpler: one subscription is
// one product, so the product IS the plan. No price-to-tier map to maintain.
//
// Which product means which plan comes from the `metadata.tier` tag set when
// the products were created. Deliberately not the product name — a rename in
// Polar's dashboard would silently break tier detection — and not the product
// id, which would mean three UUIDs hardcoded in our source.
// ============================================================================

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/** The shape of a Polar subscription, narrowed to what we read. */
export interface PolarSubscription {
  id?: string;
  status?: string;
  customer_id?: string;
  product_id?: string;
  seats?: number | null;
  amount?: number;
  currency?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, unknown> | null;
  product?: {
    id?: string;
    name?: string;
    metadata?: Record<string, unknown> | null;
  } | null;
}

/**
 * Which plan is this subscription for?
 *
 * Returns null when we can't tell, and callers must treat that as "leave the
 * tier alone" rather than defaulting. A subscription to something we don't
 * recognise — the co-founder's manually-negotiated annual product, say —
 * must never silently strip a team's access.
 */
export function tierFromSubscription(sub: PolarSubscription): string | null {
  const tag = sub.product?.metadata?.tier ?? sub.metadata?.tier;
  const value = typeof tag === "string" ? tag.trim().toLowerCase() : "";
  return value === "overview" || value === "oversight" || value === "overwatch"
    ? value
    : null;
}

/**
 * Polar's statuses, mapped onto the ones the app already understands.
 *
 * The app reads `subscriptionStatus` in a dozen places to decide whether a team
 * is paid up. Translating here means none of those have to learn a second
 * vocabulary — and `incomplete` deliberately becomes "incomplete" rather than
 * "active", because a checkout that was started and abandoned must not grant
 * access.
 */
export function mapPolarStatus(status: string | undefined): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "unpaid";
    case "canceled":
      return "canceled";
    case "paused":
      return "paused";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return status ?? "unknown";
  }
}

/** Find the team a Polar customer belongs to. */
export const getTeamByPolarCustomer = internalQuery({
  args: { polarCustomerId: v.string() },
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query("teams")
      .withIndex("by_polar_customer", (q) =>
        q.eq("polarCustomerId", args.polarCustomerId),
      )
      .first();
    return team ? { teamId: team._id, name: team.name } : null;
  },
});

/**
 * Apply a subscription change from Polar.
 *
 * Mirrors what the Stripe webhook does, including the two rules that matter:
 *
 *  - a tier we don't recognise leaves the existing one untouched, and says so
 *  - a team pinned by hand (comped, internal, or a prepaid annual deal closed
 *    on a demo call) is never overwritten by the processor
 */
export const applySubscription = internalMutation({
  args: {
    polarCustomerId: v.string(),
    polarSubscriptionId: v.string(),
    status: v.string(),
    tier: v.union(v.string(), v.null()),
    seats: v.union(v.number(), v.null()),
    currentPeriodEnd: v.union(v.number(), v.null()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ applied: boolean; reason?: string }> => {
    const team = await ctx.db
      .query("teams")
      .withIndex("by_polar_customer", (q) =>
        q.eq("polarCustomerId", args.polarCustomerId),
      )
      .first();

    if (!team) {
      // Not an error worth failing the delivery over. Polar disables an
      // endpoint after ten consecutive non-2xx responses, and an unknown
      // customer can never heal by retrying — so record it and acknowledge.
      return { applied: false, reason: "no team for this Polar customer" };
    }

    const updates: Record<string, unknown> = {
      polarSubscriptionId: args.polarSubscriptionId,
      subscriptionStatus: args.status,
    };
    if (args.seats !== null) updates.seatCount = args.seats;
    if (args.currentPeriodEnd !== null) {
      updates.currentPeriodEnd = args.currentPeriodEnd;
    }

    if (args.tier !== null) {
      if (team.productTierOverride) {
        // Pinned on purpose — comped teams, internal accounts, and the annual
        // deals negotiated on demo calls whose billing lives outside the normal
        // flow. The processor doesn't get to undo that.
        console.log(
          `[polar] team ${team._id} is pinned to ` +
            `"${team.productTierOverride}" — ignoring tier "${args.tier}"`,
        );
      } else {
        updates.productTier = args.tier;
      }
    }

    await ctx.db.patch(team._id, updates);
    return { applied: true };
  },
});

/**
 * Link a Polar customer to a team.
 *
 * Called when a checkout is created, before any subscription exists — without
 * it the first webhook arrives for a customer we've never heard of and there is
 * nothing to attach it to.
 */
export const linkPolarCustomer = internalMutation({
  args: { teamId: v.id("teams"), polarCustomerId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, { polarCustomerId: args.polarCustomerId });
    return { success: true };
  },
});
