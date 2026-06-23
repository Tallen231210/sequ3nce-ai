import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

// Initialize lazily to avoid build-time errors when env vars aren't available
const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);
const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const stripe = getStripe();
  const convex = getConvex();
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
        // Route to B2C or B2B based on subscription metadata
        if (await isB2CEvent(stripe, session.customer as string)) {
          await handleB2CCheckoutCompleted(stripe, convex, session);
        } else {
          await handleCheckoutCompleted(session);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        if (await isB2CEvent(stripe, subscription.customer as string)) {
          await handleB2CSubscriptionUpdate(convex, subscription);
        } else {
          await handleSubscriptionUpdate(subscription);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        if (await isB2CEvent(stripe, subscription.customer as string)) {
          await handleB2CSubscriptionDeleted(convex, subscription);
        } else {
          await handleSubscriptionDeleted(subscription);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        if (await isB2CEvent(stripe, invoice.customer as string)) {
          await handleB2CPaymentFailed(convex, invoice);
        } else {
          await handlePaymentFailed(invoice);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (await isB2CEvent(stripe, invoice.customer as string)) {
          await handleB2CInvoicePaid(stripe, convex, invoice);
        } else {
          await handleInvoicePaid(invoice);
        }
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

// ==================== B2C/B2B Routing ====================

/** Check if a Stripe customer belongs to B2C by checking metadata */
async function isB2CEvent(stripe: Stripe, customerId: string | null): Promise<boolean> {
  if (!customerId) return false;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return false;
    return customer.metadata?.platform === "b2c_personal" || !!customer.metadata?.b2cUserId;
  } catch {
    return false;
  }
}

// ==================== B2C Handlers ====================

async function handleB2CCheckoutCompleted(
  stripe: Stripe,
  convex: ConvexHttpClient,
  session: Stripe.Checkout.Session
) {
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;

  if (!customerId || !subscriptionId) {
    console.log("B2C checkout session missing customer or subscription");
    return;
  }

  // Get customer metadata to find b2cUserId
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return;

  const b2cUserId = customer.metadata?.b2cUserId;
  if (!b2cUserId) {
    console.error(`B2C customer ${customerId} missing b2cUserId metadata`);
    return;
  }

  await convex.mutation(api.b2cBilling.updateB2CSubscriptionByUserId, {
    userId: b2cUserId as Id<"b2cUsers">,
    subscriptionStatus: "active",
    subscriptionId,
    stripeCustomerId: customerId,
  });

  console.log(`B2C checkout completed for customer ${customerId} (user ${b2cUserId})`);
}

async function handleB2CSubscriptionUpdate(
  convex: ConvexHttpClient,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;
  const status = mapStripeStatus(subscription.status);

  await convex.mutation(api.b2cBilling.updateB2CSubscription, {
    stripeCustomerId: customerId,
    subscriptionStatus: status,
    subscriptionId: subscription.id,
  });

  console.log(`B2C subscription updated for customer ${customerId}: ${status}`);
}

async function handleB2CSubscriptionDeleted(
  convex: ConvexHttpClient,
  subscription: Stripe.Subscription
) {
  const customerId = subscription.customer as string;

  await convex.mutation(api.b2cBilling.updateB2CSubscription, {
    stripeCustomerId: customerId,
    subscriptionStatus: "cancelled",
    cancelledAt: Date.now(),
  });

  console.log(`B2C subscription cancelled for customer ${customerId}`);
}

async function handleB2CPaymentFailed(
  convex: ConvexHttpClient,
  invoice: Stripe.Invoice
) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  await convex.mutation(api.b2cBilling.updateB2CSubscription, {
    stripeCustomerId: customerId,
    subscriptionStatus: "past_due",
  });

  console.log(`B2C payment failed for customer ${customerId}`);
}

async function handleB2CInvoicePaid(
  stripe: Stripe,
  convex: ConvexHttpClient,
  invoice: Stripe.Invoice
) {
  const customerId = invoice.customer as string;
  const subscriptionId =
    "subscription" in invoice ? (invoice.subscription as string) : null;

  if (!customerId || !subscriptionId) return;

  await convex.mutation(api.b2cBilling.updateB2CSubscription, {
    stripeCustomerId: customerId,
    subscriptionStatus: "active",
    subscriptionId,
  });

  console.log(`B2C invoice paid for customer ${customerId}`);
}

/** Map Stripe subscription status to our B2C status enum */
function mapStripeStatus(
  stripeStatus: string
): "active" | "cancelled" | "past_due" | "none" {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return "none";
  }
}

// ==================== B2B Handlers (existing) ====================

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const stripe = getStripe();
  const convex = getConvex();
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

  // Fire the B2B welcome email. Idempotent inside the action (checks
  // team.welcomeEmailSentAt); Stripe retries won't double-send.
  // Wrapped in try/catch so an email-infra hiccup never causes the
  // webhook to 500, which would make Stripe keep retrying.
  try {
    const managerEmail = session.customer_details?.email ?? "";
    const managerName = session.customer_details?.name ?? undefined;
    if (managerEmail) {
      await convex.action(api.welcomeEmail.scheduleB2BWelcomeEmail, {
        stripeCustomerId: customerId,
        managerEmail,
        managerName,
      });
    } else {
      console.warn(
        `[stripe webhook] No manager email on session ${session.id} — welcome email skipped`,
      );
    }
  } catch (err) {
    console.error("[stripe webhook] Welcome email failed (non-fatal):", err);
  }

  console.log(`Checkout completed for customer ${customerId}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const convex = getConvex();
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
  const convex = getConvex();
  const customerId = subscription.customer as string;

  await convex.mutation(api.billing.updateTeamBilling, {
    stripeCustomerId: customerId,
    subscriptionStatus: "canceled",
    plan: "canceled",
  });

  console.log(`Subscription canceled for customer ${customerId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const convex = getConvex();
  const customerId = invoice.customer as string;

  if (!customerId) return;

  await convex.mutation(api.billing.updateTeamBilling, {
    stripeCustomerId: customerId,
    subscriptionStatus: "past_due",
  });

  console.log(`Payment failed for customer ${customerId}`);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const stripe = getStripe();
  const convex = getConvex();
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
