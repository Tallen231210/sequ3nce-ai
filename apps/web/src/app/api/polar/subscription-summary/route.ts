import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { normaliseTier } from "@/lib/tiers";
import {
  polarFetch,
  availableTiers,
  tierOfProduct,
  type PolarSubscriptionResponse,
} from "@/lib/polar";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
    const sellable = await availableTiers();

    // Comped teams and anyone pre-checkout have no subscription. Say so
    // plainly rather than inventing a price.
    if (!billing?.polarSubscriptionId) {
      return NextResponse.json({
        tier,
        hasSubscription: false,
        lines: [],
        monthlyTotalCents: null,
        currency: "usd",
        availableTiers: sellable,
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
      availableTiers: sellable,
    });
  } catch (err) {
    console.error("[polar] subscription-summary failed:", err);
    return NextResponse.json(
      { error: "Couldn't load your billing details" },
      { status: 500 },
    );
  }
}
