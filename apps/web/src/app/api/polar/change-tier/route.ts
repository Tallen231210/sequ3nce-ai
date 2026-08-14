import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { parseTier, type Tier } from "@/lib/tiers";
import { polarFetch, productIdForTier, PolarError } from "@/lib/polar";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Which plan. No default, and no coercion: `normaliseTier` is right for
    // reading OUR OWN stored values, but it defaults an unrecognised string to
    // the top tier — exactly wrong for a client-supplied body, where that
    // default moves someone onto the $650 plan when they asked for something
    // else, or nothing. `parseTier` is the strict counterpart: exact match on
    // a real tier, or null. See its comment in lib/tiers.ts, and the identical
    // choice in create-checkout/route.ts.
    let rawTier: unknown;
    try {
      const body = (await req.json()) as { tier?: unknown };
      rawTier = body?.tier;
    } catch {
      return NextResponse.json(
        { error: "Which plan? A tier is required." },
        { status: 400 },
      );
    }

    const tier: Tier | null = parseTier(rawTier);
    if (!tier) {
      const detail =
        typeof rawTier === "string" && rawTier.length > 0
          ? `Unrecognised plan: "${rawTier}".`
          : "Which plan? A tier is required.";
      return NextResponse.json({ error: detail }, { status: 400 });
    }

    const convex = getConvex();
    const billing = await convex.query(api.billing.getTeamBilling, {
      clerkId: userId,
    });

    if (!billing) {
      console.error(`change-tier: no team found for clerkId=${userId}`);
      return NextResponse.json(
        { error: "Team not found for billing account" },
        { status: 500 },
      );
    }

    if (!billing.polarSubscriptionId) {
      return NextResponse.json(
        { error: "There's no subscription to change on this account." },
        { status: 400 },
      );
    }

    // One field. With Polar the product IS the plan, so changing tier is
    // changing which product the subscription is for — there is no price map
    // to keep in step and no line item to find.
    await polarFetch(`/v1/subscriptions/${billing.polarSubscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        product_id: await productIdForTier(tier),
        // Product owner's decision: an upgrade or downgrade takes effect at
        // the next renewal rather than being prorated mid-cycle.
        proration_behavior: "next_period",
      }),
    });

    // The team's tier is deliberately NOT written here. It comes from the
    // webhook, which reads the product on the subscription — so the tier the
    // app enforces always matches what Polar is billing, even if this request
    // and the webhook disagree about timing.
    return NextResponse.json({ success: true, tier });
  } catch (err) {
    console.error("[polar] change-tier failed:", err);
    const detail = err instanceof PolarError ? ` (${err.message})` : "";
    return NextResponse.json(
      { error: `Couldn't change your plan${detail}` },
      { status: 500 },
    );
  }
}
