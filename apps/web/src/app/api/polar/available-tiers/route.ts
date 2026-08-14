import { NextResponse } from "next/server";
import { availableTiers } from "@/lib/polar";

/**
 * Which plans can be bought right now.
 *
 * Public on purpose. The Stripe version of this required auth and returned 401
 * to a signed-out visitor, and PlanChooser read that 401 as "no plans exist" —
 * so a prospect on the pricing page was told plans weren't available while they
 * were. Pricing is not a secret.
 */
export async function GET() {
  try {
    const res = NextResponse.json({ tiers: await availableTiers() });
    // This route is unauthenticated, so every cache miss is a live Polar call
    // on the same token checkout uses for productIdForTier — a burst of
    // traffic here can exhaust the rate limit and degrade real checkouts, not
    // just this endpoint. Let Vercel's edge absorb repeat requests instead of
    // forwarding them to a serverless instance (and Polar) at all.
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    return res;
  } catch (err) {
    // 503, not an empty list. An empty list renders as "get in touch instead"
    // and would quietly turn off every sale for as long as Polar is down,
    // with nothing on the page or in the logs saying why.
    console.error("[polar] could not list available tiers:", err);
    const res = NextResponse.json(
      { error: "Couldn't load plans just now. Please try again in a moment." },
      { status: 503 },
    );
    // Explicit no-store: an edge-cached 503 would keep the pricing page
    // broken for the whole TTL after Polar recovers, turning a blip into a
    // five-minute outage for every visitor. Don't inherit a cacheable default.
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
}
