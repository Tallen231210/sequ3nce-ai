import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { seatCount = 1 } = body;

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

    // Create checkout session with both prices
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env.STRIPE_PLATFORM_PRICE_ID!,
          quantity: 1,
        },
        {
          price: process.env.STRIPE_SEAT_PRICE_ID!,
          quantity: seatCount,
        },
      ],
      success_url: `${req.headers.get("origin")}/dashboard/billing?success=true`,
      cancel_url: `${req.headers.get("origin")}/dashboard/billing?canceled=true`,
      subscription_data: {
        metadata: {
          clerkId: userId,
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
