import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import {
  pricesForTier,
  normaliseTier,
  classifyPrice,
  isDowngrade,
  type Tier,
} from "@/lib/tiers";

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);
const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Move a team between tiers.
 *
 * Swaps the price on the subscription items they already have rather than
 * cancelling and re-subscribing. Same mechanism the seat-count update uses, and
 * it keeps the subscription — and therefore the billing period, the payment
 * method and the customer's history — intact.
 *
 * Deliberately does NOT write the tier to Convex. The Stripe webhook does that,
 * from the price on the resulting subscription. One writer means entitlement
 * and billing cannot disagree, and it also means a change made directly in the
 * Stripe dashboard is picked up exactly the same way as one made here.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const convex = getConvex();

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const requested = String(body?.tier ?? "");
    if (
      requested !== "overview" &&
      requested !== "oversight" &&
      requested !== "overwatch"
    ) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }
    const target: Tier = requested;

    // The team is resolved from the signed-in user, never from the request.
    // Taking a team id from the body would let anyone move anyone's plan.
    const billing = await convex.query(api.billing.getTeamBilling, {
      clerkId: userId,
    });

    if (!billing?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription to change." },
        { status: 400 },
      );
    }

    const current = normaliseTier(billing.productTier);
    if (current === target) {
      return NextResponse.json({ success: true, unchanged: true });
    }

    const prices = pricesForTier(target);
    const subscription = await stripe.subscriptions.retrieve(
      billing.stripeSubscriptionId,
    );

    if (subscription.status === "canceled") {
      return NextResponse.json(
        { error: "This subscription has been cancelled." },
        { status: 400 },
      );
    }

    // Build every line change as one update.
    //
    // Doing it as a single subscriptions.update rather than item-by-item means
    // Stripe produces ONE proration, and a failure part-way through can't
    // leave a team paying the new platform fee at the old seat rate.
    const items: Stripe.SubscriptionUpdateParams.Item[] = [];
    for (const item of subscription.items.data) {
      const classified = classifyPrice(item.price.id);
      if (!classified) {
        // Something on this subscription we don't recognise. Refuse rather
        // than guess — a wrong swap here charges a real customer.
        console.error(
          `[stripe] refusing tier change for subscription ${subscription.id}: ` +
            `unrecognised price ${item.price.id}`,
        );
        return NextResponse.json(
          { error: "This subscription has a plan we can't change automatically. Contact support." },
          { status: 409 },
        );
      }
      const nextPrice =
        classified.kind === "platform" ? prices.platform : prices.seat;
      if (nextPrice !== item.price.id) {
        items.push({ id: item.id, price: nextPrice });
      }
    }

    if (items.length > 0) {
      await stripe.subscriptions.update(billing.stripeSubscriptionId, {
        items,
        // Upgrades charge the difference now; downgrades leave a credit against
        // the next invoice. The alternative — waiting for the period to end —
        // means someone can pay for Overview while using the bot all month.
        proration_behavior: "create_prorations",
      });
    }

    return NextResponse.json({
      success: true,
      from: current,
      to: target,
      downgrade: isDowngrade(current, target),
    });
  } catch (err) {
    console.error("change-tier failed:", err);
    // Surface a configuration problem as itself. "Something went wrong" on a
    // missing price ID sends someone hunting through Stripe for an hour.
    const message =
      err instanceof Error && err.message.includes("not configured")
        ? err.message
        : "Couldn't change your plan. Nothing has been charged.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
