import { NextRequest, NextResponse } from "next/server";
import { polarFetch } from "@/lib/polar";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// POST /api/polar/b2c-checkout  { plan: "monthly"|"3month"|"6month"|"yearly" }
//
// Public on purpose — the buyer has no account yet; the PAYMENT creates the
// account (see convex/b2cPolar.ts). All this route does is resolve the plan
// tag to today's product id and open a Polar checkout for it, so the pages
// never hardcode product ids and a reprice never touches the frontend.
// ============================================================================

const VALID_PLANS = new Set(["monthly", "3month", "6month", "yearly"]);

/** Meta click IDs are `fb.<ver>.<ts>.<value>` — accept only that shape, capped. */
function fbCookie(val: unknown): string | undefined {
  return typeof val === "string" && /^fb\.\d\.\d+\./.test(val) && val.length <= 500
    ? val
    : undefined;
}

export async function POST(req: NextRequest) {
  let plan: unknown;
  let fbpRaw: unknown;
  let fbcRaw: unknown;
  try {
    ({ plan, fbp: fbpRaw, fbc: fbcRaw } = await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof plan !== "string" || !VALID_PLANS.has(plan)) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }

  try {
    const products = await polarFetch<{
      items?: Array<{ id: string; metadata?: Record<string, unknown> | null }>;
    }>("/v1/products/?is_archived=false&limit=100");

    const product = (products.items ?? []).find(
      (p) => p.metadata?.b2c_plan === plan,
    );
    if (!product) {
      // Products exist in sandbox but possibly not (yet) in production —
      // fail loudly rather than sell something unpriceable.
      console.error(`[b2c-checkout] no product carries b2c_plan="${plan}"`);
      return NextResponse.json(
        { error: "This plan isn't available right now." },
        { status: 503 },
      );
    }

    // Conversion attribution: Polar copies checkout metadata onto the order,
    // and the order.paid webhook forwards these to Meta's Conversions API
    // (convex/metaCapi.ts). Strings only, all optional — a checkout with none
    // of them still works, the Purchase event just matches on email alone.
    const metadata: Record<string, string> = {};
    const fbp = fbCookie(fbpRaw);
    const fbc = fbCookie(fbcRaw);
    if (fbp) metadata.fbp = fbp;
    if (fbc) metadata.fbc = fbc;
    const clientIp = (req.headers.get("x-forwarded-for") ?? "")
      .split(",")[0]
      .trim();
    if (clientIp) metadata.client_ip = clientIp.slice(0, 45);
    const userAgent = req.headers.get("user-agent");
    if (userAgent) metadata.user_agent = userAgent.slice(0, 500);
    const referer = req.headers.get("referer");
    if (referer) metadata.landing_url = referer.slice(0, 500);

    const origin = req.nextUrl.origin;
    const checkout = await polarFetch<{ url?: string }>("/v1/checkouts/", {
      method: "POST",
      body: JSON.stringify({
        products: [product.id],
        success_url: `${origin}/personal/activate?checkout_id={CHECKOUT_ID}`,
        ...(Object.keys(metadata).length ? { metadata } : {}),
      }),
    });

    if (!checkout.url) {
      return NextResponse.json(
        { error: "Checkout couldn't be created." },
        { status: 502 },
      );
    }
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error(
      "[b2c-checkout]",
      error instanceof Error ? error.message : String(error),
    );
    return NextResponse.json(
      { error: "Checkout couldn't be created." },
      { status: 502 },
    );
  }
}
