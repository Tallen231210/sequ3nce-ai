import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook signature verification failed: ${message}`);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Error processing webhook:", err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!customerId || !subscriptionId) {
    console.log("Checkout session missing customer or subscription");
    return;
  }

  // Get the subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Calculate seat count from subscription items
  let seatCount = 0;
  for (const item of subscription.items.data) {
    if (item.price.id === process.env.STRIPE_SEAT_PRICE_ID) {
      seatCount = item.quantity || 0;
    }
  }

  // Access current_period_end safely
  const currentPeriodEnd =
    "current_period_end" in subscription
      ? (subscription.current_period_end as number) * 1000
      : undefined;

  await convex.mutation(api.billing.updateTeamBilling, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    subscriptionStatus: subscription.status,
    currentPeriodEnd,
    seatCount,
    plan: "active",
  });

  console.log(`Checkout completed for customer ${customerId}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // Calculate seat count
  let seatCount = 0;
  for (const item of subscription.items.data) {
    if (item.price.id === process.env.STRIPE_SEAT_PRICE_ID) {
      seatCount = item.quantity || 0;
    }
  }

  // Access current_period_end safely
  const currentPeriodEnd =
    "current_period_end" in subscription
      ? (subscription.current_period_end as number) * 1000
      : undefined;

  await convex.mutation(api.billing.updateTeamBilling, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    currentPeriodEnd,
    seatCount,
  });

  console.log(
    `Subscription updated for customer ${customerId}: ${subscription.status}`
  );
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  await convex.mutation(api.billing.updateTeamBilling, {
    stripeCustomerId: customerId,
    subscriptionStatus: "canceled",
    plan: "canceled",
  });

  console.log(`Subscription canceled for customer ${customerId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  if (!customerId) return;

  await convex.mutation(api.billing.updateTeamBilling, {
    stripeCustomerId: customerId,
    subscriptionStatus: "past_due",
  });

  console.log(`Payment failed for customer ${customerId}`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const subscriptionId =
    "subscription" in invoice ? (invoice.subscription as string) : null;

  if (!customerId || !subscriptionId) return;

  // Get fresh subscription data
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Access current_period_end safely
  const currentPeriodEnd =
    "current_period_end" in subscription
      ? (subscription.current_period_end as number) * 1000
      : undefined;

  await convex.mutation(api.billing.updateTeamBilling, {
    stripeCustomerId: customerId,
    subscriptionStatus: subscription.status,
    currentPeriodEnd,
  });

  console.log(`Invoice paid for customer ${customerId}`);
}
