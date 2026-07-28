import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { TIER_ORDER, tierIsAvailable } from "@/lib/tiers";

/**
 * Which plans can actually be bought right now.
 *
 * The price IDs live in server env, so a browser can't work this out for
 * itself — and offering a plan whose prices don't exist yet produces a button
 * that takes the click and then fails at checkout.
 *
 * Separate from subscription-summary because this is needed BEFORE a team has
 * a subscription, on the signup page.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ tiers: TIER_ORDER.filter(tierIsAvailable) });
}
