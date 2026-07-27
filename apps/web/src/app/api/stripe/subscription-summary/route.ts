import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import {
  classifyPrice,
  normaliseTier,
  isLegacyPrice,
  tierIsAvailable,
  TIER_ORDER,
} from "@/lib/tiers";

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);
const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * What this team is actually being charged.
 *
 * The billing page used to render two hardcoded constants — $199 platform and
 * $99 a seat — to every customer regardless of what they pay. Those were old
 * testing-account prices, so a team on $500 plus three seats at $150 was shown
 * $496 a month against a real invoice of $950.
 *
 * Constants can't be right here. Customers are grandfathered onto whatever
 * price they signed at, and the whole point of tiers is that different teams
 * pay differently. So the numbers come from Stripe, which is the only place
 * that knows.
 */
export async function GET() {
  const stripe = getStripe();
  const convex = getConvex();

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const billing = await convex.query(api.billing.getTeamBilling, {
      clerkId: userId,
    });

    const tier = normaliseTier(billing?.productTier);

    // Comped teams and anyone pre-checkout have no subscription. Say so
    // plainly rather than inventing a price.
    if (!billing?.stripeSubscriptionId) {
      return NextResponse.json({
        tier,
        hasSubscription: false,
        lines: [],
        monthlyTotalCents: null,
        currency: "usd",
        availableTiers: TIER_ORDER.filter(tierIsAvailable),
      });
    }

    const subscription = await stripe.subscriptions.retrieve(
      billing.stripeSubscriptionId,
    );

    const lines = subscription.items.data.map((item) => {
      const classified = classifyPrice(item.price.id);
      const unitAmount = item.price.unit_amount ?? 0;
      const quantity = item.quantity ?? 1;
      return {
        kind: classified?.kind ?? "unknown",
        // Named from the price itself where possible, so a grandfathered or
        // custom price still reads sensibly instead of "unknown".
        label:
          classified?.kind === "platform"
            ? "Platform fee"
            : classified?.kind === "seat"
              ? "Closer seats"
              : (item.price.nickname ?? "Subscription item"),
        unitAmountCents: unitAmount,
        quantity,
        subtotalCents: unitAmount * quantity,
        interval: item.price.recurring?.interval ?? "month",
      };
    });

    return NextResponse.json({
      tier,
      hasSubscription: true,
      status: subscription.status,
      currency: subscription.currency ?? "usd",
      lines,
      monthlyTotalCents: lines.reduce((sum, l) => sum + l.subtotalCents, 0),
      // True when they're on a price that isn't one of the current tier
      // prices — i.e. grandfathered. Worth knowing before offering to move
      // them, because a "change plan" click would give up that rate forever.
      isLegacyPricing: subscription.items.data.some((item) =>
        isLegacyPrice(item.price.id),
      ),
      // Which plans can actually be bought. The price IDs live server-side, so
      // the browser can't work this out for itself — and offering a plan whose
      // prices don't exist yet produces a button that fails on click.
      availableTiers: TIER_ORDER.filter(tierIsAvailable),
    });
  } catch (err) {
    console.error("subscription-summary failed:", err);
    return NextResponse.json(
      { error: "Couldn't load your billing details" },
      { status: 500 },
    );
  }
}
