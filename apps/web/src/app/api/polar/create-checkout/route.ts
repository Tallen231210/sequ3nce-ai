import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { normaliseTier, type Tier } from "@/lib/tiers";
import { polarFetch, productIdForTier, PolarError } from "@/lib/polar";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface PolarCheckout {
  id: string;
  url: string;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Which plan. No default: the Stripe version defaulted to the top tier for
    // a body-less request, which is a habit worth not repeating now that the
    // page always sends one — a silent default here sells the $650 plan to
    // someone who clicked $225.
    let tier: Tier;
    try {
      const body = (await req.json()) as { tier?: unknown };
      if (typeof body?.tier !== "string") throw new Error("no tier");
      tier = normaliseTier(body.tier);
    } catch {
      return NextResponse.json(
        { error: "Which plan? A tier is required." },
        { status: 400 },
      );
    }

    const convex = getConvex();
    const billing = await convex.query(api.billing.getTeamBilling, {
      clerkId: userId,
    });
    if (!billing) {
      return NextResponse.json(
        { error: "We couldn't find your team. Try signing out and back in." },
        { status: 400 },
      );
    }

    const teamId = await convex.query(api.billing.getTeamIdForClerkUser, {
      clerkId: userId,
    });
    if (!teamId) {
      return NextResponse.json(
        { error: "We couldn't find your team. Try signing out and back in." },
        { status: 400 },
      );
    }

    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress;
    const origin = req.headers.get("origin") ?? "https://sequ3nce.ai";

    const checkout = await polarFetch<PolarCheckout>("/v1/checkouts/", {
      method: "POST",
      body: JSON.stringify({
        products: [await productIdForTier(tier)],
        // Our own team id, not Polar's customer id. This is what makes the
        // webhook able to find the team even if the customer-id write is
        // missed — a failed callback, or a customer created by hand in Polar's
        // dashboard, would otherwise arrive for someone we've never heard of.
        external_customer_id: teamId,
        ...(email ? { customer_email: email } : {}),
        // Polar refuses a seat count below 1 and the floor is baked into the
        // price tier, so it cannot be lowered. Under the folded pricing the
        // first seat costs nothing, so a team with no closers yet pays only
        // the base.
        seats: Math.max(1, billing.activeCloserCount ?? 0),
        allow_discount_codes: true,
        success_url: `${origin}/subscribe?success=true`,
        return_url: `${origin}/subscribe?canceled=true`,
        // Informational only. The tier we act on always comes from the product
        // on the subscription, so this can never disagree with what they paid.
        metadata: { clerkId: userId, tier },
      }),
    });

    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    console.error("[polar] create-checkout failed:", err);
    // Polar's own message where we have one — "seats: Input should be greater
    // than or equal to 1" tells whoever is debugging far more than "failed".
    const detail = err instanceof PolarError ? ` (${err.message})` : "";
    return NextResponse.json(
      { error: `Couldn't start checkout${detail}` },
      { status: 500 },
    );
  }
}
