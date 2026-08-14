import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { normaliseTier, type Tier } from "@/lib/tiers";
import {
  polarFetch,
  availableTiers,
  tierOfProduct,
  type PolarSubscriptionResponse,
} from "@/lib/polar";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * The sellable tier list, degraded rather than fatal.
 *
 * `availableTiers()` throws on a Polar hiccup by design — an empty list it
 * swallowed itself would read as "no plans available" during an outage. But
 * that list is a nice-to-have for this endpoint (it only feeds the plan
 * cards), and every live customer today is comped with no subscription, so a
 * transient Polar failure here must not cost them their whole summary — just
 * the plan list.
 */
async function safeAvailableTiers(): Promise<Tier[]> {
  try {
    return await availableTiers();
  } catch (err) {
    console.error(
      "[polar] availableTiers failed inside subscription-summary; showing the summary without a plan list:",
      err,
    );
    return [];
  }
}

/**
 * What this team is actually being charged.
 *
 * Never computed from constants. The billing page once rendered two hardcoded
 * figures to every customer and showed a team on $950 a month a bill for $496.
 * The number comes from the processor, which is the only thing that knows.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = getConvex();
    const billing = await convex.query(api.billing.getTeamBilling, {
      clerkId: userId,
    });
    const tier = normaliseTier(billing?.productTier);

    // Comped teams and anyone pre-checkout have no subscription. Say so
    // plainly rather than inventing a price — and check this BEFORE fetching
    // the sellable-tier list. Every live customer today lands here, so a
    // Polar hiccup on the tier lookup used to 500 this route for all of
    // them, even though they don't need a price at all.
    if (!billing?.polarSubscriptionId) {
      return NextResponse.json({
        tier,
        hasSubscription: false,
        lines: [],
        monthlyTotalCents: null,
        currency: "usd",
        availableTiers: await safeAvailableTiers(),
      });
    }

    const sub = await polarFetch<PolarSubscriptionResponse>(
      `/v1/subscriptions/${billing.polarSubscriptionId}`,
    );

    return NextResponse.json({
      tier: tierOfProduct({ id: sub.product?.id ?? "", metadata: sub.product?.metadata }) ?? tier,
      hasSubscription: true,
      status: sub.status,
      currency: sub.currency ?? "usd",
      // Polar reports one recurring amount covering the plan and its seats,
      // and gives no per-line split. So there is no line breakdown here.
      //
      // Reconstructing one from TIER_PRICING was considered and rejected: that
      // is precisely the bug the Stripe version exists to prevent, where the
      // page rendered figures of our own making and showed a team on $950 a
      // month a bill for $496. One real number beats four invented ones.
      seats: sub.seats ?? 0,
      monthlyTotalCents: sub.amount ?? null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      currentPeriodEnd: sub.current_period_end ?? null,
      availableTiers: await safeAvailableTiers(),
    });
  } catch (err) {
    console.error("[polar] subscription-summary failed:", err);
    return NextResponse.json(
      { error: "Couldn't load your billing details" },
      { status: 500 },
    );
  }
}
