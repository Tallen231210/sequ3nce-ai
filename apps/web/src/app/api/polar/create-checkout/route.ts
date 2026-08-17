import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { parseTier } from "@/lib/tiers";
import { polarFetch, productIdForTier, PolarError } from "@/lib/polar";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface PolarCheckout {
  id: string;
  url: string;
}

/**
 * Statuses where a Polar subscription is still live — actively billing, or in
 * dunning and still capable of resolving on its own — so buying again would
 * create a SECOND subscription rather than resuming the first. When that
 * happens the webhook overwrites `polarSubscriptionId` with the newer one,
 * and the first subscription keeps billing monthly with nothing in the
 * product showing it still exists.
 *
 * `canceled` and `incomplete`/`incomplete_expired` describe a subscription
 * that is fully wound down or never completed, so those are the only
 * statuses allowed to check out again.
 */
const LIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
]);

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Which plan. No default, and no coercion: `normaliseTier` is right for
    // reading OUR OWN stored values (a missing field there must never
    // downgrade someone already entitled), but it defaults an unrecognised
    // string to the top tier — exactly wrong for a client-supplied body,
    // where that default sells the $650 plan to someone who asked for
    // something else, or nothing. `parseTier` is the strict counterpart:
    // exact match on a real tier, or null. See its comment in lib/tiers.ts.
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

    const tier = parseTier(rawTier);
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
      return NextResponse.json(
        { error: "We couldn't find your team. Try signing out and back in." },
        { status: 400 },
      );
    }

    // Comped teams are billed outside the software, by hand — their tier is
    // pinned in Convex, not derived from a subscription. Nothing about
    // `subscriptionStatus` can be trusted to keep one of these away from
    // checkout (a stale `past_due` left behind by old Stripe dunning has
    // actually happened to two customers), so this checks the pin itself.
    // The webhook already refuses to move a pinned tier, so letting one of
    // these teams pay here would just take their card for nothing.
    if (billing.productTierPinned) {
      return NextResponse.json(
        {
          error:
            "Your account is already set up on a custom plan. Get in touch with us if you need to change it.",
        },
        { status: 400 },
      );
    }

    // A team with a still-live subscription posting here again — a stale
    // tab, the back button — must not be allowed to create a second one.
    if (
      billing.polarSubscriptionId &&
      LIVE_SUBSCRIPTION_STATUSES.has(billing.subscriptionStatus ?? "")
    ) {
      return NextResponse.json(
        {
          error:
            "Your team already has a subscription. Manage it from the billing page instead of starting a new one.",
        },
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
