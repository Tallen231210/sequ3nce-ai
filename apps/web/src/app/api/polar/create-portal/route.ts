import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { polarFetch, PolarError } from "@/lib/polar";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface PolarCustomerSession {
  customer_portal_url: string;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = getConvex();
    const teamId = await convex.query(api.billing.getTeamIdForClerkUser, {
      clerkId: userId,
    });
    if (!teamId) {
      return NextResponse.json(
        { error: "We couldn't find your team." },
        { status: 400 },
      );
    }

    const origin = req.headers.get("origin") ?? "https://sequ3nce.ai";

    // Our own team id rather than Polar's customer id, for the same reason
    // checkout sends it: the portal keeps working even if the customer-id
    // write was missed, so a paying customer is never told they have no
    // billing account.
    const session = await polarFetch<PolarCustomerSession>(
      "/v1/customer-sessions/",
      {
        method: "POST",
        body: JSON.stringify({
          external_customer_id: teamId,
          return_url: `${origin}/dashboard/billing`,
        }),
      },
    );

    return NextResponse.json({ url: session.customer_portal_url });
  } catch (err) {
    // A team that has never paid has no customer at Polar, and that is a
    // normal state — comped teams live here permanently. Say so plainly
    // instead of creating a customer who has bought nothing.
    if (err instanceof PolarError && err.status === 404) {
      return NextResponse.json(
        { error: "There's no subscription to manage on this account yet." },
        { status: 400 },
      );
    }
    console.error("[polar] create-portal failed:", err);
    return NextResponse.json(
      { error: "Couldn't open the billing portal" },
      { status: 500 },
    );
  }
}
