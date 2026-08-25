import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================================================
// Meta Conversions API — server-fired Purchase events for Sequ3nce Personal.
//
// Polar is merchant of record, so the sale happens on Polar's domain and the
// browser pixel can only report it if the buyer returns to our site. The
// order.paid webhook (convex/http.ts /webhooks/polar) is the guaranteed
// source: it schedules sendB2cPurchase here, which posts a Purchase event to
// the SAME pixel the site's browser events use.
//
// Idempotency: event_id = the Polar order id. Meta deduplicates identical
// event_name + event_id pairs for 48 hours, so webhook redeliveries and our
// own retries can never double-count a sale. No bookkeeping table needed.
//
// Env (Convex deployment, set via `npx convex env set`):
//   META_PIXEL_ID               — must equal Vercel's NEXT_PUBLIC_META_PIXEL_ID
//   META_CONVERSIONS_API_TOKEN  — CAPI access token for that pixel
//   META_TEST_EVENT_CODE        — optional; testing only, REMOVE for launch
// ============================================================================

const PURCHASE_ARGS = {
  orderId: v.string(),
  email: v.optional(v.string()),
  polarCustomerId: v.optional(v.string()),
  amountCents: v.number(),
  currency: v.string(),
  productId: v.optional(v.string()),
  productName: v.optional(v.string()),
  createdAt: v.optional(v.string()),
  landingUrl: v.optional(v.string()),
  fbp: v.optional(v.string()),
  fbc: v.optional(v.string()),
  clientIp: v.optional(v.string()),
  userAgent: v.optional(v.string()),
};

/**
 * Webhook-side hop: httpActions can't reach the scheduler, mutations can
 * (same pattern as b2cPolar.applyB2CSubscription scheduling the welcome
 * email). Keeps the webhook's <2s ack rule intact.
 */
export const schedulePurchase = internalMutation({
  args: PURCHASE_ARGS,
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.metaCapi.sendB2cPurchase, args);
  },
});

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const sendB2cPurchase = internalAction({
  args: PURCHASE_ARGS,
  handler: async (_ctx, args) => {
    const pixelId = process.env.META_PIXEL_ID?.trim();
    const accessToken = process.env.META_CONVERSIONS_API_TOKEN?.trim();
    if (!pixelId || !accessToken) {
      console.error(
        `[metaCapi] Not configured (META_PIXEL_ID/META_CONVERSIONS_API_TOKEN) — Purchase for order ${args.orderId} NOT sent`,
      );
      return;
    }

    const userData: Record<string, unknown> = {};
    if (args.email) {
      userData.em = [await sha256Hex(args.email.trim().toLowerCase())];
    }
    if (args.polarCustomerId) {
      userData.external_id = [await sha256Hex(args.polarCustomerId)];
    }
    if (args.fbp) userData.fbp = args.fbp;
    if (args.fbc) userData.fbc = args.fbc;
    if (args.clientIp) userData.client_ip_address = args.clientIp;
    if (args.userAgent) userData.client_user_agent = args.userAgent;

    const createdMs = args.createdAt ? Date.parse(args.createdAt) : NaN;
    const eventTime = Math.floor(
      (Number.isNaN(createdMs) ? Date.now() : createdMs) / 1000,
    );

    const event = {
      event_name: "Purchase",
      event_time: eventTime,
      event_id: args.orderId,
      action_source: "website",
      ...(args.landingUrl ? { event_source_url: args.landingUrl } : {}),
      user_data: userData,
      custom_data: {
        currency: args.currency.toUpperCase(),
        value: args.amountCents / 100,
        ...(args.productId ? { content_ids: [args.productId] } : {}),
        ...(args.productName ? { content_name: args.productName } : {}),
        content_type: "product",
        order_id: args.orderId,
      },
    };

    const body: Record<string, unknown> = {
      data: [event],
      access_token: accessToken,
    };
    const testCode = process.env.META_TEST_EVENT_CODE?.trim();
    if (testCode) body.test_event_code = testCode;

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${pixelId}/events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const text = await res.text();
      if (!res.ok) {
        console.error(
          `[metaCapi] Meta rejected Purchase for order ${args.orderId}: ${res.status} ${text}`,
        );
      } else {
        console.log(
          `[metaCapi] Purchase sent for order ${args.orderId} ($${(args.amountCents / 100).toFixed(2)}): ${text}`,
        );
      }
    } catch (error) {
      console.error(
        `[metaCapi] Network error sending Purchase for order ${args.orderId}:`,
        error,
      );
    }
  },
});
