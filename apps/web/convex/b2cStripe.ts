"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import Stripe from "stripe";

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!);

// Create a Stripe Checkout session for B2C subscription with 45-day trial
export const createCheckoutSession = internalAction({
  args: {
    email: v.string(),
    b2cUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const stripe = getStripe();

    // Check if user already has a Stripe customer ID
    const subscription = await ctx.runQuery(internal.b2cBilling.getB2CSubscriptionInternal, {
      userId: args.b2cUserId,
    });

    let customerId = subscription?.stripeCustomerId;

    // Create Stripe customer if none exists
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: args.email,
        metadata: {
          b2cUserId: args.b2cUserId,
          platform: "b2c_personal",
        },
      });
      customerId = customer.id;

      // Save customer ID to Convex
      await ctx.runMutation(internal.b2cBilling.setB2CStripeCustomerIdInternal, {
        userId: args.b2cUserId,
        stripeCustomerId: customerId,
      });
    }

    // Determine pricing tier: $99/mo for first 100 users, $129.99/mo after
    const EARLY_BIRD_PRICE_ID = process.env.STRIPE_B2C_PRICE_ID_EARLY || "price_1TJJ5IISqY0sJmwBEtBkLzMO";
    const STANDARD_PRICE_ID = process.env.STRIPE_B2C_PRICE_ID!;

    const userCount = await ctx.runQuery(internal.b2cBilling.getB2CUserCountInternal, {});
    const priceId = userCount <= 100 ? EARLY_BIRD_PRICE_ID : STANDARD_PRICE_ID;

    // Create checkout session with 45-day free trial
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 45,
        metadata: {
          b2cUserId: args.b2cUserId,
          platform: "b2c_personal",
        },
      },
      success_url: "https://sequ3nce.ai/b2c-subscribe?success=true",
      cancel_url: "https://sequ3nce.ai/b2c-subscribe?canceled=true",
      allow_promotion_codes: true,
    });

    return { url: session.url };
  },
});

// Create a Stripe Billing Portal session for subscription management
export const createPortalSession = internalAction({
  args: {
    b2cUserId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const stripe = getStripe();

    const subscription = await ctx.runQuery(internal.b2cBilling.getB2CSubscriptionInternal, {
      userId: args.b2cUserId,
    });

    if (!subscription?.stripeCustomerId) {
      return { error: "No Stripe customer found" };
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: "https://sequ3nce.ai/b2c-subscribe?portal=true",
    });

    return { url: session.url };
  },
});
