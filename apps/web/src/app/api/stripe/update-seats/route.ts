import { auth } from "@clerk/nextjs/server";
import { pricesForTier, normaliseTier, classifyPrice } from "@/lib/tiers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

// Initialize lazily to avoid build-time errors when env vars aren't available
const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);
const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const stripe = getStripe();
  const convex = getConvex();
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { seatCount } = body;

    if (typeof seatCount !== "number" || seatCount < 0) {
      return NextResponse.json(
        { error: "Invalid seat count" },
        { status: 400 }
      );
    }

    // Get team billing info
    const billing = await convex.query(api.billing.getTeamBilling, {
      clerkId: userId,
    });

    if (!billing?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    // Get the current subscription
    const subscription = await stripe.subscriptions.retrieve(
      billing.stripeSubscriptionId
    );

    // The seat price for THIS team's tier, not one global price.
    //
    // Charging every team the same per-seat rate regardless of plan is how a
    // Scoreboard customer ends up billed the Full tier's $150 a head. The tier
    // comes from Convex, which the Stripe webhook keeps in sync with the
    // subscription itself.
    const tier = normaliseTier(billing.productTier);
    const seatPriceId = pricesForTier(tier).seat;

    // Match any seat price we know, not just the current tier's — a
    // subscription mid-change can still be carrying the previous tier's seat
    // line, and we must update that item rather than adding a second one.
    const seatItem = subscription.items.data.find(
      (item) => classifyPrice(item.price.id)?.kind === "seat",
    );

    if (seatCount === 0 && seatItem) {
      // Remove seat line item entirely
      await stripe.subscriptionItems.del(seatItem.id);
    } else if (seatCount > 0 && seatItem) {
      // Quantity, and the price too if they've changed tier since this item
      // was created. Leaving a stale price here bills the old rate forever.
      await stripe.subscriptionItems.update(seatItem.id, {
        quantity: seatCount,
        ...(seatItem.price.id !== seatPriceId ? { price: seatPriceId } : {}),
      });
    } else if (seatCount > 0 && !seatItem) {
      // Add seat line item to subscription
      await stripe.subscriptionItems.create({
        subscription: billing.stripeSubscriptionId,
        price: seatPriceId,
        quantity: seatCount,
      });
    }

    // Update seat count in Convex. Here (unlike the webhook, where an
    // orphaned Stripe customer must ack 200) a missing team for an
    // authenticated seat update is a REAL error — surface it.
    const result = await convex.mutation(api.billing.updateTeamBilling, {
      stripeCustomerId: billing.stripeCustomerId!,
      seatCount,
    });
    if (!result.success) {
      console.error(
        `update-seats: no team for stripeCustomerId=${billing.stripeCustomerId}`,
      );
      return NextResponse.json(
        { error: "Team not found for billing account" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, seatCount });
  } catch (err) {
    console.error("Error updating seats:", err);
    return NextResponse.json(
      { error: "Failed to update seats" },
      { status: 500 }
    );
  }
}
