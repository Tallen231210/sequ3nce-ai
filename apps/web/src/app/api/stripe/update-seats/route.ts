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

    // Find if seat price already exists in subscription
    const seatItem = subscription.items.data.find(
      (item) => item.price.id === process.env.STRIPE_SEAT_PRICE_ID
    );

    if (seatCount === 0 && seatItem) {
      // Remove seat line item entirely
      await stripe.subscriptionItems.del(seatItem.id);
    } else if (seatCount > 0 && seatItem) {
      // Update existing seat quantity
      await stripe.subscriptionItems.update(seatItem.id, {
        quantity: seatCount,
      });
    } else if (seatCount > 0 && !seatItem) {
      // Add seat line item to subscription
      await stripe.subscriptionItems.create({
        subscription: billing.stripeSubscriptionId,
        price: process.env.STRIPE_SEAT_PRICE_ID!,
        quantity: seatCount,
      });
    }

    // Update seat count in Convex
    await convex.mutation(api.billing.updateTeamBilling, {
      stripeCustomerId: billing.stripeCustomerId!,
      seatCount,
    });

    return NextResponse.json({ success: true, seatCount });
  } catch (err) {
    console.error("Error updating seats:", err);
    return NextResponse.json(
      { error: "Failed to update seats" },
      { status: 500 }
    );
  }
}
