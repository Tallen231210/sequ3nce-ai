import { auth } from "@clerk/nextjs/server";
import { pricesForTier, normaliseTier, type Tier } from "@/lib/tiers";
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

    // Which product they're buying. Defaults to full so an older client that
    // posts nothing behaves exactly as it did before tiers existed.
    let tier: Tier = "full";
    try {
      const body = await req.json();
      if (body?.tier) tier = normaliseTier(String(body.tier));
    } catch {
      // No body at all — the pre-tier signup flow. Keep the old behaviour.
    }

    // Get team billing info
    const billing = await convex.query(api.billing.getTeamBilling, {
      clerkId: userId,
    });

    let customerId = billing?.stripeCustomerId;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: {
          clerkId: userId,
        },
      });
      customerId = customer.id;

      // Save customer ID to Convex
      await convex.mutation(api.billing.setStripeCustomerId, {
        clerkId: userId,
        stripeCustomerId: customerId,
      });
    }

    // Create checkout session with platform fee only (seats added separately when closers are added)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          // Throws with a readable message if this tier's prices aren't
          // configured, rather than creating a subscription for nothing.
          price: pricesForTier(tier).platform,
          quantity: 1,
        },
      ],
      success_url: `${req.headers.get("origin")}/subscribe?success=true`,
      cancel_url: `${req.headers.get("origin")}/subscribe?canceled=true`,
      allow_promotion_codes: true, // Allow customers to enter coupon codes
      subscription_data: {
        metadata: {
          clerkId: userId,
          // Informational only. The tier we act on is always derived from the
          // price on the subscription, so metadata can never disagree with
          // what they're actually paying for.
          tier,
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Error creating checkout session:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
