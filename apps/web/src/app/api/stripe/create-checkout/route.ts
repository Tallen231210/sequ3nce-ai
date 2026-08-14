import { auth } from "@clerk/nextjs/server";
import { pricesForTier, parseTier } from "@/lib/tiers";
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

    // Which product they're buying. No default, and no coercion: this route
    // is unreachable from any current B2B UI, but it is still a live,
    // authenticated POST endpoint, and it used to default a missing/unknown
    // tier to "overwatch" — selling the most expensive plan to anyone who
    // posted nothing or a typo. `parseTier` is the strict counterpart to
    // `normaliseTier`: exact match on a real tier, or null. See its comment
    // in lib/tiers.ts, and the matching guard in the Polar create-checkout
    // route this one mirrors.
    let rawTier: unknown;
    try {
      const body = (await req.json()) as { tier?: unknown };
      rawTier = body?.tier;
    } catch {
      return NextResponse.json(
        { error: "Which plan? A tier is required." },
        { status: 400 },
      );
    }

    const tier = parseTier(rawTier);
    if (!tier) {
      const detail =
        typeof rawTier === "string" && rawTier.length > 0
          ? `Unrecognised plan: "${rawTier}".`
          : "Which plan? A tier is required.";
      return NextResponse.json({ error: detail }, { status: 400 });
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
