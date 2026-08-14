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
    return NextResponse.json({ tiers: await availableTiers() });
  } catch (err) {
    // 503, not an empty list. An empty list renders as "get in touch instead"
    // and would quietly turn off every sale for as long as Polar is down,
    // with nothing on the page or in the logs saying why.
    console.error("[polar] could not list available tiers:", err);
    return NextResponse.json(
      { error: "Couldn't load plans just now. Please try again in a moment." },
      { status: 503 },
    );
  }
}
