import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { polarFetch, PolarError } from "@/lib/polar";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { seatCount?: unknown };
    const seatCount = body?.seatCount;
    if (typeof seatCount !== "number" || !Number.isInteger(seatCount) || seatCount < 0) {
      return NextResponse.json({ error: "Invalid seat count" }, { status: 400 });
    }

    const convex = getConvex();
    const billing = await convex.query(api.billing.getTeamBilling, {
      clerkId: userId,
    });

    // No Convex user for this clerkId, or a user whose team record is
    // missing — the orphaned-Clerk-account state this codebase has hit in
    // production before. Unlike "comped, no subscription" below, there is
    // nothing to write here at all: an authenticated request with no team is
    // a REAL error, not a normal state, matching the sibling Stripe route's
    // treatment (see stripe/update-seats around lines 91-98). Reporting
    // success here would tell a manager their closer was added while the
    // seat count silently stayed wrong.
    if (!billing) {
      console.error(`update-seats: no team found for clerkId=${userId}`);
      return NextResponse.json(
        { error: "Team not found for billing account" },
        { status: 500 },
      );
    }

    if (!billing.polarSubscriptionId) {
      // A comped team adding a closer lands here, and it is not an error —
      // there is no subscription to resize. Record the seat count locally so
      // the team page stays truthful and move on. This is the common,
      // healthy path today: every live customer is comped.
      await convex.mutation(api.billing.setSeatCount, {
        clerkId: userId,
        seatCount,
      });
      return NextResponse.json({ success: true, seatCount, billed: false });
    }

    await polarFetch(`/v1/subscriptions/${billing.polarSubscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        // Polar's floor is 1 and cannot be lowered. Under the folded pricing
        // the first seat is free, so a team that removed every closer pays
        // the base and nothing for a seat they aren't using.
        seats: Math.max(1, seatCount),
        // Tyler's decision: an added closer works immediately and bills at the
        // next renewal rather than being charged part-way through the month.
        proration_behavior: "next_period",
      }),
    });

    await convex.mutation(api.billing.setSeatCount, {
      clerkId: userId,
      seatCount,
    });

    return NextResponse.json({ success: true, seatCount, billed: true });
  } catch (err) {
    console.error("[polar] update-seats failed:", err);
    const detail = err instanceof PolarError ? ` (${err.message})` : "";
    return NextResponse.json(
      { error: `Couldn't update seats${detail}` },
      { status: 500 },
    );
  }
}
