import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { polarFetch, PolarError } from "@/lib/polar";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

interface PolarCustomerSession {
  customer_portal_url: string;
}

interface PolarCustomerSeat {
  member_id: string;
  email: string;
  status: string;
}

interface PolarCustomerSeatList {
  items: PolarCustomerSeat[];
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Needed to find (or claim) this manager's seat below. Guessing an email
    // would risk seating the portal request as the wrong person, so a
    // missing one is a hard stop rather than a fallback.
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress;
    if (!email) {
      console.error(
        `[polar] create-portal: no primary email on Clerk user for clerkId=${userId}`,
      );
      return NextResponse.json(
        { error: "Couldn't determine your account email." },
        { status: 500 },
      );
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

    const billing = await convex.query(api.billing.getTeamBilling, {
      clerkId: userId,
    });

    // A team that has never paid has no subscription at Polar, and that is a
    // normal state — comped teams live here permanently. Say so plainly
    // instead of trying to seat a subscription that doesn't exist.
    if (!billing?.polarSubscriptionId) {
      return NextResponse.json(
        { error: "There's no subscription to manage on this account yet." },
        { status: 400 },
      );
    }
    const subscriptionId = billing.polarSubscriptionId;

    // Our products bill per seat, which makes every Polar customer here a
    // TEAM customer, never an INDIVIDUAL one. Polar's documented fallback for
    // POST /v1/customer-sessions/ — "when not provided, the owner member of
    // the customer will be used" — only applies to individual customers. We
    // never used Polar's own seat-assignment feature when building checkout,
    // so no member exists for anybody, and the plain
    // { external_customer_id, return_url } call 422s with "member_id is
    // required for team customers" for every customer, every time. Verified
    // live against the Polar sandbox API: resolve (or claim) a member for the
    // signed-in manager and pass member_id explicitly. Do not "simplify" this
    // back to a bare external_customer_id session — it will 422 again.
    let memberId: string;
    try {
      const seats = await polarFetch<PolarCustomerSeatList>(
        `/v1/customer-seats?subscription_id=${encodeURIComponent(subscriptionId)}`,
      );
      const existing = seats.items?.find(
        (seat) => seat.email?.toLowerCase() === email.toLowerCase(),
      );

      if (existing) {
        memberId = existing.member_id;
      } else {
        // No seat for this manager yet on this subscription — claim one.
        // Do NOT send external_member_id: a value that already exists
        // org-wide under a different email fails with MemberEmailMismatch,
        // and a value that doesn't exist yet fails with "Member does not
        // exist for this customer" — both confirmed live. Also confirmed
        // live: claiming a seat does not change billing. The subscription's
        // seats/amount were identical before and after — seat ASSIGNMENT and
        // billed SEAT COUNT are independent, and the billed count is set
        // explicitly elsewhere (see update-seats/route.ts). Do not add any
        // seat-count adjustment here.
        const created = await polarFetch<PolarCustomerSeat>(
          "/v1/customer-seats",
          {
            method: "POST",
            body: JSON.stringify({
              subscription_id: subscriptionId,
              email,
              immediate_claim: true,
            }),
          },
        );
        memberId = created.member_id;
      }
    } catch (err) {
      // It's untested what Polar does when a second person needs a seat on a
      // subscription billed for only one. Whatever this produces — seat
      // exhaustion, a rejected claim, anything else — must not be reported as
      // "no subscription yet": that message means a different, normal state
      // (comped teams) and would hide a real, debuggable failure behind it.
      const detail = err instanceof PolarError ? err.message : String(err);
      console.error("[polar] create-portal: seat resolution failed:", detail);
      return NextResponse.json(
        { error: `Couldn't open the billing portal (${detail})` },
        { status: 500 },
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
          member_id: memberId,
          return_url: `${origin}/dashboard/billing`,
        }),
      },
    );

    return NextResponse.json({ url: session.customer_portal_url });
  } catch (err) {
    // Anything that reaches here — including a 403, which means WE are
    // misconfigured (wrong token, wrong environment) — must stay a loud 500
    // rather than be disguised as a normal customer state.
    console.error("[polar] create-portal failed:", err);
    return NextResponse.json(
      { error: "Couldn't open the billing portal" },
      { status: 500 },
    );
  }
}
