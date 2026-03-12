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
    const { b2cUserId } = await req.json();

    if (!b2cUserId) {
      return NextResponse.json(
        { error: "Missing b2cUserId" },
        { status: 400 }
      );
    }

    const subscription = await convex.query(api.b2cBilling.getB2CSubscription, {
      userId: b2cUserId as Id<"b2cUsers">,
    });

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found" },
        { status: 400 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: "https://sequ3nce.ai/b2c-subscribe?portal=true",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Error creating B2C portal session:", err);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
