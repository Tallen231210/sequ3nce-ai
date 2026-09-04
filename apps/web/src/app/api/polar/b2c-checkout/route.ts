import { NextRequest, NextResponse } from "next/server";
import { polarFetch } from "@/lib/polar";
import { ATTRIBUTION_COOKIE, ATTRIBUTION_KEYS, parseAttributionCookie } from "@/lib/attribution";

const CONVEX_SITE_URL = "https://ideal-ram-982.convex.site";

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
  let codeRaw: unknown;
  try {
    ({ plan, fbp: fbpRaw, fbc: fbcRaw, code: codeRaw } = await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof plan !== "string" || !VALID_PLANS.has(plan)) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }

  // Sales-call trial code (2026-09-03): a valid code turns the MONTHLY plan
  // into a Polar per-checkout free trial — card collected, $0 today, auto-
  // billed when the trial ends. Validated server-side against Convex; the
  // page's preview is cosmetic. Never trusted for any other plan.
  let trialDays: number | null = null;
  let trialCode: string | null = null;
  if (typeof codeRaw === "string" && codeRaw.trim()) {
    const code = codeRaw.trim().toUpperCase().slice(0, 20);
    if (!/^[A-Z0-9]{3,20}$/.test(code)) {
      return NextResponse.json({ error: "That code isn't valid — check with your rep." }, { status: 400 });
    }
    try {
      const res = await fetch(`${CONVEX_SITE_URL}/b2c/trial-code?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const lookup = (await res.json()) as { valid?: boolean; trialDays?: number };
      if (!lookup.valid || typeof lookup.trialDays !== "number") {
        return NextResponse.json({ error: "That code isn't valid — check with your rep." }, { status: 400 });
      }
      if (plan !== "monthly") {
        return NextResponse.json({ error: "That code applies to the Monthly plan." }, { status: 400 });
      }
      trialDays = lookup.trialDays;
      trialCode = code;
    } catch {
      return NextResponse.json({ error: "Couldn't verify that code — try again." }, { status: 502 });
    }
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
    if (trialCode) metadata.trial_code = trialCode;
    // First-touch ad attribution from the 90-day landing cookie. Polar copies
    // checkout metadata onto the order, so revenue joins back to campaign in
    // the CAPI worker and in Pedro's Zapier/GHL flows.
    const attribution = parseAttributionCookie(req.cookies.get(ATTRIBUTION_COOKIE)?.value);
    if (attribution) {
      for (const key of ATTRIBUTION_KEYS) {
        const v = attribution[key];
        if (v) metadata[key] = v.slice(0, 200);
      }
    }

    const origin = req.nextUrl.origin;
    const checkout = await polarFetch<{ url?: string }>("/v1/checkouts/", {
      method: "POST",
      body: JSON.stringify({
        products: [product.id],
        // No discount-code box on Polar's page either — the trial is the
        // rep's tool, not something the page should invite asking about.
        allow_discount_codes: false,
        success_url: `${origin}/personal/activate?checkout_id={CHECKOUT_ID}`,
        ...(trialDays ? { trial_interval: "day", trial_interval_count: trialDays } : {}),
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
