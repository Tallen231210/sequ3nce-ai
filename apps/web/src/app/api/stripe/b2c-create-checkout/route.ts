import { NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);
const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const stripe = getStripe();
  const convex = getConvex();

  try {
    const { email, b2cUserId } = await req.json();

    if (!email || !b2cUserId) {
      return NextResponse.json(
        { error: "Missing email or b2cUserId" },
        { status: 400 }
      );
    }

    // Check if user already has a Stripe customer ID
    const subscription = await convex.query(api.b2cBilling.getB2CSubscription, {
      userId: b2cUserId as Id<"b2cUsers">,
    });

    let customerId = subscription?.stripeCustomerId;

    // Create Stripe customer if none exists
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: {
          b2cUserId,
          platform: "b2c_personal",
        },
      });
      customerId = customer.id;

      // Save customer ID to Convex
      await convex.mutation(api.b2cBilling.setB2CStripeCustomerId, {
        userId: b2cUserId as Id<"b2cUsers">,
        stripeCustomerId: customerId,
      });
    }

    // Determine pricing tier: $99/mo for first 100 users, $129.99/mo after
    const EARLY_BIRD_PRICE_ID = process.env.STRIPE_B2C_PRICE_ID_EARLY || "price_1TJJ5IISqY0sJmwBEtBkLzMO";
    const STANDARD_PRICE_ID = process.env.STRIPE_B2C_PRICE_ID!;

    // Query total B2C user count to determine pricing tier
    const userCount = await convex.query(api.b2cBilling.getB2CUserCount, {});
    const priceId = userCount <= 100 ? EARLY_BIRD_PRICE_ID : STANDARD_PRICE_ID;

    // Create checkout session with 45-day free trial
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `https://sequ3nce.ai/b2c-subscribe?success=true`,
      cancel_url: `https://sequ3nce.ai/b2c-subscribe?canceled=true`,
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: 45,
        metadata: {
          b2cUserId,
          platform: "b2c_personal",
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Error creating B2C checkout session:", errMsg);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
