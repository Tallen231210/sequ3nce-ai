# Polar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new B2B client can sign up, pay through Polar, and reach the dashboard without Tyler touching anything.

**Architecture:** New `/api/polar/*` Next.js routes sitting alongside the existing `/api/stripe/*` ones, backed by a single `src/lib/polar.ts` helper. Stripe is untouched — the $99 Personal (B2C) app still depends on it. The inbound half (webhook → `convex/polar.ts`) already exists and is not rewritten.

**Tech Stack:** Next.js App Router route handlers, Clerk auth, Convex (`ConvexHttpClient`), Polar REST API v1, `npx tsx` fixture tests, Playwright for the UI path.

**Spec:** `docs/superpowers/specs/2026-08-14-polar-integration-design.md`

## Global Constraints

- **Polar API base:** `https://api.polar.sh`. Auth header `Authorization: Bearer ${POLAR_ACCESS_TOKEN}`.
- **Polar org:** `99ee9b9f-d7bb-465d-8e4b-ea750c80f655`. Token lives at `~/.polar-key` in `KEY=value` form; extract with `grep -oE 'polar_[A-Za-z0-9_-]+' ~/.polar-key | head -1`. **Never print the token into chat or into a committed file.**
- **Token scopes verified 2026-08-14:** products read+write, subscriptions read+write, customers read, checkout create. `benefits` and `organizations` are NOT granted.
- **Existing product IDs:** Overview `69d6f5d0-7b12-419f-9b0b-19631ee28187`, Oversight `4b8d45dd-cac7-4d36-b0d1-ca74aa196ee0`, Overwatch `69965636-3fcb-4d24-aefb-f56db963230a`.
- **Tier vocabulary:** `overview | oversight | overwatch`, tagged on the Polar product as `metadata.tier`. Never match on product name — a rename in Polar's dashboard would silently break tier detection.
- **Polar seat floor is 1** and cannot be configured lower. Every seat value sent to Polar is `Math.max(1, n)`.
- **Proration on seat and tier changes:** `proration_behavior: "next_period"` (Tyler's decision — added closers bill at renewal, not immediately).
- **Never default an unrecognised tier.** `null` means "leave the team's tier alone", never "use overwatch". A mistyped tag must not downgrade a paying customer.
- **Polar disables a webhook endpoint after 10 consecutive non-2xx responses.** Nothing in this plan may make the webhook throw.
- **File size:** no file over ~300 lines (CLAUDE.md).
- **Build gate:** `npx tsc --noEmit` and `npx next build` must pass clean before any task is considered done.
- **Existing customers are comped and are NOT migrated.** ManyJobs `js728xjb1vdxcfcsxcwme62eh589977x`, CreateFreedom `js7d3bx3hpwcmfgrxmsa6yx6td8bgagr`, E2 Influencers `js7ak2980wehyj0070ygsg6sms8cf84d`. They are protected by `teams.productTierOverride`; nothing here may write over it.
- **Working directory for all commands:** `/Users/tylerallen/Desktop/sequ3nce-ai/apps/web` unless stated otherwise.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/polar.ts` (new) | Talk to Polar. Token, error translation, tier↔product mapping. No Next.js or Clerk imports — keeps it fixture-testable. |
| `src/lib/polarPricing.ts` (new) | Pure pricing arithmetic: expected total for a tier at N seats. Testable without network. |
| `src/app/api/polar/available-tiers/route.ts` (new) | Public. Which tiers can be bought. |
| `src/app/api/polar/create-checkout/route.ts` (new) | Start a subscription. |
| `src/app/api/polar/subscription-summary/route.ts` (new) | What this team is charged. |
| `src/app/api/polar/create-portal/route.ts` (new) | Hosted portal session. |
| `src/app/api/polar/update-seats/route.ts` (new) | Seat count → Polar + Convex. |
| `src/app/api/polar/change-tier/route.ts` (new) | Switch product. |
| `convex/billing.ts` (modify) | `getTeamBilling` also returns the Polar ids. |
| `src/lib/tiers.ts` (modify) | `TIER_PRICING` becomes the folded figures. Feature map untouched. |
| `src/app/subscribe/page.tsx` (modify) | Polar endpoint, signed-out signup branch, comped redirect fix. |
| `src/app/subscribe/PlanChooser.tsx` (modify) | One price, "includes your first closer". |
| `src/app/_landing/PricingTiers.tsx` (modify) | Same copy change. |
| `src/app/dashboard/billing/page.tsx`, `plan-selector.tsx` (modify) | Point at `/api/polar/*`. |
| `src/app/dashboard/team/page.tsx` (modify) | Point at `/api/polar/update-seats`. |
| `docs/polar-tooling/pricing_probe.ts` (new) | Task 1's throwaway-product proof. Follows `docs/setter-data-tooling/` precedent. |
| `docs/polar-tooling/polar_fixtures.ts` (new) | Fixture tests for the pure functions. |

There is no unit-test framework in this repo — only Playwright E2E (`tests/e2e/`). Pure-logic tests follow the established `npx tsx` fixture pattern from `docs/setter-data-tooling/metric_fixtures.ts`.

---

### Task 1: Prove graduated seat pricing before repricing anything

The whole pricing decision rests on one unverified assumption: that Polar's `graduated` seat tiering, with a $0 first tier, produces exactly the totals we charge today. This task answers that against a throwaway product and touches no application code.

**Files:**
- Create: `docs/polar-tooling/pricing_probe.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a verified yes/no that gates Task 10. No exported code.

- [ ] **Step 1: Write the probe**

Create `docs/polar-tooling/pricing_probe.ts`:

```ts
// Proves Polar's graduated seat pricing produces the totals we intend to charge,
// against a throwaway product that is archived again before this script exits.
//
// Run: npx tsx docs/polar-tooling/pricing_probe.ts
// The token is read from ~/.polar-key and is never printed.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://api.polar.sh";

function token(): string {
  const raw = readFileSync(join(homedir(), ".polar-key"), "utf8");
  const match = raw.match(/polar_[A-Za-z0-9_-]+/);
  if (!match) throw new Error("No polar_ token found in ~/.polar-key");
  return match[0];
}

const TOKEN = token();

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return parsed;
}

// Overwatch's intended shape: $650 base, first seat free, $150 each after.
const BASE_CENTS = 65_000;
const EXTRA_SEAT_CENTS = 15_000;

// Expected totals, and the old shape they must match: $500 + $150 x seats.
const CASES = [1, 2, 3, 10].map((seats) => ({
  seats,
  expected: BASE_CENTS + Math.max(0, seats - 1) * EXTRA_SEAT_CENTS,
  oldShape: 50_000 + seats * 15_000,
}));

async function main() {
  let productId: string | undefined;
  let failures = 0;

  try {
    const product = await call("POST", "/v1/products/", {
      name: "__pricing probe — archived automatically, do not buy",
      recurring_interval: "month",
      prices: [
        { amount_type: "fixed", price_amount: BASE_CENTS },
        {
          amount_type: "seat_based",
          seat_tiers: {
            seat_tier_type: "graduated",
            tiers: [
              { min_seats: 1, max_seats: 1, price_per_seat: 0 },
              { min_seats: 2, max_seats: null, price_per_seat: EXTRA_SEAT_CENTS },
            ],
          },
        },
      ],
    });
    productId = product.id;
    console.log(`probe product ${productId} created`);

    for (const c of CASES) {
      const checkout = await call("POST", "/v1/checkouts/", {
        products: [productId],
        seats: c.seats,
        success_url: "https://sequ3nce.ai/subscribe?success=true",
      });
      const actual = checkout.total_amount ?? checkout.amount;
      const ok = actual === c.expected && c.expected === c.oldShape;
      if (!ok) failures++;
      console.log(
        `  ${ok ? "pass" : "FAIL"}  ${c.seats} seat(s): ` +
          `got $${(actual / 100).toFixed(2)}, ` +
          `intended $${(c.expected / 100).toFixed(2)}, ` +
          `old shape $${(c.oldShape / 100).toFixed(2)}`,
      );
    }
  } finally {
    // Archive even if a case threw. A live probe product in a real catalogue is
    // something a customer could buy.
    if (productId) {
      await call("PATCH", `/v1/products/${productId}`, { is_archived: true });
      const after = await call("GET", `/v1/products/${productId}`);
      console.log(
        after.is_archived
          ? `probe product ${productId} archived`
          : `WARNING: probe product ${productId} is STILL LIVE — archive it by hand`,
      );
    }
  }

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
```

- [ ] **Step 2: Run it**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai && npx tsx docs/polar-tooling/pricing_probe.ts
```

Expected: four `pass` lines, `probe product ... archived`, and `ALL PASS`.

- [ ] **Step 3: Confirm the catalogue is clean**

```bash
K=$(grep -oE 'polar_[A-Za-z0-9_-]+' ~/.polar-key | head -1)
curl -s -H "Authorization: Bearer $K" "https://api.polar.sh/v1/products/?is_archived=false&limit=20" \
 | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['pagination']['total_count']); [print(' -',p['name']) for p in d['items']]"
```

Expected: exactly 4 — Overwatch, Oversight, Overview, and "Sequ3nce (3 month plan)". No probe product.

- [ ] **Step 4: Record the outcome and STOP if it failed**

If all four cases pass, note it in the plan and continue to Task 2.

If any case fails, **do not proceed to Task 10 as written.** The spec's fallback applies: keep the current base and seat prices ($500 + $150) in Polar and present the combined figure in the UI instead. Same money, less tidy invoice. Report the actual numbers to Tyler and get a decision before repricing.

- [ ] **Step 5: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add docs/polar-tooling/pricing_probe.ts
git commit -m "Prove Polar's graduated seat pricing before trusting it with real prices"
```

---

### Task 2: `src/lib/polar.ts` — one way to talk to Polar

**Files:**
- Create: `src/lib/polar.ts`
- Create: `docs/polar-tooling/polar_fixtures.ts`

**Interfaces:**
- Consumes: `Tier`, `TIER_ORDER` from `@/lib/tiers`.
- Produces:
  - `class PolarError extends Error { status: number; body: unknown }`
  - `describePolarError(body: unknown, status: number): string`
  - `polarFetch<T>(path: string, init?: RequestInit): Promise<T>`
  - `buildTierMap(products: PolarProduct[]): { byTier: Map<Tier, string>; ambiguous: Tier[] }`
  - `tierOfProduct(product: PolarProduct): Tier | null`
  - `productIdForTier(tier: Tier): Promise<string>`
  - `availableTiers(): Promise<Tier[]>`
  - `interface PolarProduct { id: string; name?: string; is_archived?: boolean; metadata?: Record<string, unknown> | null }`
  - `interface PolarSubscriptionResponse { id: string; status: string; seats?: number | null; amount?: number; currency?: string; current_period_end?: string | null; cancel_at_period_end?: boolean; product?: { id?: string; name?: string; metadata?: Record<string, unknown> | null } | null; product_id?: string }`

- [ ] **Step 1: Write the failing fixture test**

Create `docs/polar-tooling/polar_fixtures.ts`:

```ts
// Fixture tests for the pure parts of the Polar client.
//
// Run: npx tsx docs/polar-tooling/polar_fixtures.ts
// No network, no token. The functions under test are pure by design so the
// parts that decide money can be checked without hitting a payment processor.

import {
  describePolarError,
  buildTierMap,
  tierOfProduct,
  type PolarProduct,
} from "/Users/tylerallen/Desktop/sequ3nce-ai/apps/web/src/lib/polar";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  pass  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`);
  }
}

const product = (id: string, tier?: string, archived = false): PolarProduct => ({
  id,
  name: `product ${id}`,
  is_archived: archived,
  metadata: tier === undefined ? {} : { tier },
});

console.log("\ntierOfProduct");
check("reads the tier tag", tierOfProduct(product("a", "overwatch")) === "overwatch");
check("is case and space insensitive", tierOfProduct(product("a", "  Oversight ")) === "oversight");
check("untagged product has no tier", tierOfProduct(product("a")) === null);
check(
  "an unknown tag is not a tier",
  tierOfProduct(product("a", "enterprise")) === null,
  "an unrecognised tag must never resolve to a real tier",
);
check("a non-string tag is not a tier", tierOfProduct({ id: "a", metadata: { tier: 3 } }) === null);

console.log("\nbuildTierMap");
{
  const { byTier, ambiguous } = buildTierMap([
    product("p-overview", "overview"),
    product("p-oversight", "oversight"),
    product("p-overwatch", "overwatch"),
  ]);
  check("maps all three tiers", byTier.size === 3);
  check("maps to the right ids", byTier.get("overwatch") === "p-overwatch");
  check("nothing ambiguous", ambiguous.length === 0);
}
{
  const { byTier, ambiguous } = buildTierMap([
    product("p-1", "overwatch"),
    product("p-2", "overwatch"),
    product("p-ok", "overview"),
  ]);
  check(
    "a duplicated tier is refused, not guessed",
    !byTier.has("overwatch"),
    "selling one of two products tagged the same charges an arbitrary price",
  );
  check("the duplicate is reported", ambiguous.includes("overwatch"));
  check("other tiers still sellable", byTier.get("overview") === "p-ok");
}
{
  const { byTier } = buildTierMap([product("p-old", "overwatch", true)]);
  check("archived products are ignored", byTier.size === 0);
}
{
  const { byTier } = buildTierMap([product("p-untagged")]);
  check("untagged products are ignored", byTier.size === 0);
}

console.log("\ndescribePolarError");
check(
  "oauth-style error",
  describePolarError({ error: "insufficient_scope", error_description: "Higher privileges required." }, 403) ===
    "Polar 403: Higher privileges required.",
);
check(
  "validation error names the field",
  describePolarError(
    { error: "RequestValidationError", detail: [{ loc: ["body", "seats"], msg: "Input should be greater than or equal to 1" }] },
    422,
  ) === "Polar 422: seats: Input should be greater than or equal to 1",
);
check(
  "plain detail string",
  describePolarError({ error: "ResourceNotFound", detail: "Not found" }, 404) === "Polar 404: Not found",
);
check("unparseable body still describes the status", describePolarError(null, 500) === "Polar 500: unexpected response");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai && npx tsx docs/polar-tooling/polar_fixtures.ts
```

Expected: FAIL — cannot resolve module `src/lib/polar`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/polar.ts`:

```ts
// ============================================================================
// Talking to Polar.
//
// Everything that reaches Polar goes through here so there is exactly one
// place that knows the token, the base URL, and how Polar reports a failure.
//
// Deliberately free of Next.js and Clerk imports: the parts that decide which
// product a customer is charged for are pure functions, so they can be tested
// without a network or a payment processor.
// ============================================================================

import { TIER_ORDER, type Tier } from "@/lib/tiers";

const POLAR_API = "https://api.polar.sh";

/** How long a resolved tier→product map is trusted, per serverless instance. */
const PRODUCT_CACHE_MS = 60_000;

export interface PolarProduct {
  id: string;
  name?: string;
  is_archived?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface PolarSubscriptionResponse {
  id: string;
  status: string;
  seats?: number | null;
  amount?: number;
  currency?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  product_id?: string;
  product?: {
    id?: string;
    name?: string;
    metadata?: Record<string, unknown> | null;
  } | null;
}

export class PolarError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PolarError";
  }
}

/**
 * Turn whatever Polar returned into one readable sentence.
 *
 * Polar has three failure shapes and they are not interchangeable: an
 * OAuth-style `{error, error_description}`, a field-level
 * `{detail: [{loc, msg}]}`, and a bare `{detail: "Not found"}`. Reading only
 * one of them is how a rejected request gets mistaken for a successful one —
 * which happened during design, when a PATCH that Polar refused wholesale was
 * read as a success with empty fields, leaving a product live that was
 * reported as archived.
 */
export function describePolarError(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;

    if (typeof b.error_description === "string") {
      return `Polar ${status}: ${b.error_description}`;
    }

    if (Array.isArray(b.detail)) {
      const parts = b.detail.map((entry) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        const msg = typeof item.msg === "string" ? item.msg : "invalid";
        const loc = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : undefined;
        return loc === undefined ? msg : `${String(loc)}: ${msg}`;
      });
      if (parts.length > 0) return `Polar ${status}: ${parts.join("; ")}`;
    }

    if (typeof b.detail === "string") return `Polar ${status}: ${b.detail}`;
    if (typeof b.error === "string") return `Polar ${status}: ${b.error}`;
  }
  return `Polar ${status}: unexpected response`;
}

/**
 * One request to Polar.
 *
 * Throws on any non-2xx rather than returning a body the caller has to
 * inspect. A payment call that fails quietly is worse than one that fails
 * loudly, and every caller here is either taking money or changing what
 * someone is charged.
 */
export async function polarFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "POLAR_ACCESS_TOKEN is not set. Checkout, seats and tier changes all " +
        "need it — set it in the Vercel project environment.",
    );
  }

  const res = await fetch(`${POLAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    throw new PolarError(describePolarError(body, res.status), res.status, body);
  }
  return body as T;
}

/**
 * Which plan is this product for?
 *
 * The tag, never the name — renaming a product in Polar's dashboard is a
 * normal thing to do and must not silently stop that plan being sellable.
 */
export function tierOfProduct(product: PolarProduct): Tier | null {
  const tag = product.metadata?.tier;
  const value = typeof tag === "string" ? tag.trim().toLowerCase() : "";
  return (TIER_ORDER as string[]).includes(value) ? (value as Tier) : null;
}

/**
 * Build the tier→product map, refusing anything ambiguous.
 *
 * Two live products carrying the same tier tag is not a case we can guess at:
 * picking either one charges a price nobody chose. That tier becomes
 * unsellable and is reported, while the other tiers carry on — a mistake in
 * one product must not take the whole pricing page down.
 */
export function buildTierMap(products: PolarProduct[]): {
  byTier: Map<Tier, string>;
  ambiguous: Tier[];
} {
  const seen = new Map<Tier, string[]>();
  for (const product of products) {
    if (product.is_archived) continue;
    const tier = tierOfProduct(product);
    if (!tier) continue;
    seen.set(tier, [...(seen.get(tier) ?? []), product.id]);
  }

  const byTier = new Map<Tier, string>();
  const ambiguous: Tier[] = [];
  for (const [tier, ids] of seen) {
    if (ids.length === 1) {
      byTier.set(tier, ids[0]);
    } else {
      ambiguous.push(tier);
    }
  }
  return { byTier, ambiguous };
}

let productCache: { at: number; byTier: Map<Tier, string> } | null = null;

async function tierProducts(): Promise<Map<Tier, string>> {
  if (productCache && Date.now() - productCache.at < PRODUCT_CACHE_MS) {
    return productCache.byTier;
  }

  const page = await polarFetch<{ items: PolarProduct[] }>(
    "/v1/products/?is_archived=false&limit=100",
  );
  const { byTier, ambiguous } = buildTierMap(page.items ?? []);

  for (const tier of ambiguous) {
    console.error(
      `[polar] more than one live product is tagged tier="${tier}". ` +
        `That tier cannot be sold until exactly one remains.`,
    );
  }

  productCache = { at: Date.now(), byTier };
  return byTier;
}

/**
 * The product a tier is sold as.
 *
 * Throws rather than returning undefined: the callers are checkout and tier
 * changes, and a request that proceeds without a product either subscribes
 * someone to nothing or charges the wrong amount.
 */
export async function productIdForTier(tier: Tier): Promise<string> {
  const id = (await tierProducts()).get(tier);
  if (!id) {
    throw new Error(
      `No sellable Polar product is tagged tier="${tier}". Check that exactly ` +
        `one live product carries metadata.tier="${tier}".`,
    );
  }
  return id;
}

/**
 * The tiers someone can actually buy right now.
 *
 * Never swallows a failure into an empty list. An empty list renders as "no
 * plans available", which during a Polar outage is a lie that quietly stops
 * every sale — so an outage throws and the caller decides what to show.
 */
export async function availableTiers(): Promise<Tier[]> {
  const byTier = await tierProducts();
  return TIER_ORDER.filter((tier) => byTier.has(tier));
}
```

- [ ] **Step 4: Run the fixtures to verify they pass**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai && npx tsx docs/polar-tooling/polar_fixtures.ts
```

Expected: all pass, `0 failed`.

- [ ] **Step 5: Prove the suite can fail**

Temporarily change `tierOfProduct` to `return "overwatch";` unconditionally, re-run, and confirm failures appear. Revert. A green suite that cannot go red proves nothing.

- [ ] **Step 6: Typecheck**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Set the token in Vercel**

Ask Tyler to add `POLAR_ACCESS_TOKEN` to the Vercel project environment (Production and Preview) using the value from `~/.polar-key`. Add it to `apps/web/.env.local` for local runs. **Do not print the value.** Confirm `.env.local` is gitignored before writing to it.

- [ ] **Step 8: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/src/lib/polar.ts docs/polar-tooling/polar_fixtures.ts
git commit -m "One way to talk to Polar, with the money-deciding parts kept pure"
```

---

### Task 3: `GET /api/polar/available-tiers` — public, and honest during an outage

**Files:**
- Create: `src/app/api/polar/available-tiers/route.ts`
- Modify: `src/middleware.ts` (add `/api/polar/available-tiers` to the public matcher)

**Interfaces:**
- Consumes: `availableTiers()` from Task 2.
- Produces: `GET` returning `{ tiers: Tier[] }` on success, or `{ error: string }` with status 503 when Polar is unreachable.

- [ ] **Step 1: Write the route**

Create `src/app/api/polar/available-tiers/route.ts`:

```ts
import { NextResponse } from "next/server";
import { availableTiers } from "@/lib/polar";

/**
 * Which plans can be bought right now.
 *
 * Public on purpose. The Stripe version of this required auth and returned 401
 * to a signed-out visitor, and PlanChooser read that 401 as "no plans exist" —
 * so a prospect on the pricing page was told plans weren't available while they
 * were. Pricing is not a secret.
 */
export async function GET() {
  try {
    return NextResponse.json({ tiers: await availableTiers() });
  } catch (err) {
    // 503, not an empty list. An empty list renders as "get in touch instead"
    // and would quietly turn off every sale for as long as Polar is down,
    // with nothing on the page or in the logs saying why.
    console.error("[polar] could not list available tiers:", err);
    return NextResponse.json(
      { error: "Couldn't load plans just now. Please try again in a moment." },
      { status: 503 },
    );
  }
}
```

- [ ] **Step 2: Make it reachable when signed out**

In `src/middleware.ts`, add to `isPublicApiRoute`:

```ts
const isPublicApiRoute = createRouteMatcher([
  "/api/webhooks(.*)",
  "/api/stripe/b2c-(.*)",
  "/api/updates/(.*)",
  // Pricing has to be readable before someone has an account, or the signup
  // page can't tell a visitor what the plans are.
  "/api/polar/available-tiers",
]);
```

Leave the `config.matcher` regex alone — it only needs entries for paths that must skip middleware entirely, and this route is fine running through `clerkMiddleware` as a non-protected path.

- [ ] **Step 3: Run it signed out**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npm run dev
```

Then in another shell:

```bash
curl -s http://localhost:3000/api/polar/available-tiers
```

Expected: `{"tiers":["overview","oversight","overwatch"]}` with no cookie and no sign-in.

- [ ] **Step 4: Verify the outage path is honest**

Temporarily set `POLAR_ACCESS_TOKEN=broken` in `.env.local`, restart dev, and re-run the curl.

Expected: HTTP 503 with the "Couldn't load plans just now" message — **not** `{"tiers":[]}`. Restore the real token and restart.

- [ ] **Step 5: Typecheck and commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/src/app/api/polar/available-tiers/route.ts apps/web/src/middleware.ts
git commit -m "Tell a signed-out visitor what the plans are"
```

---

### Task 4: `getTeamBilling` returns the Polar ids

Every route from Task 5 on needs `polarCustomerId` and `polarSubscriptionId`, and today the query returns only the Stripe pair. Additive — the Stripe routes and the B2C app read the same query and are unaffected.

**Files:**
- Modify: `convex/billing.ts:54-67` (the main return) and `convex/billing.ts:33-41` (the founder-team early return)

**Interfaces:**
- Consumes: nothing new.
- Produces: `getTeamBilling` additionally returns `polarCustomerId?: string`, `polarSubscriptionId?: string`.

- [ ] **Step 1: Add the fields to the main return**

In `convex/billing.ts`, in the final `return` of `getTeamBilling`, after `stripeSubscriptionId`:

```ts
      stripeCustomerId: team.stripeCustomerId,
      stripeSubscriptionId: team.stripeSubscriptionId,
      // The same two ids at Polar. Both processors are readable from one
      // query because a team has at most one of them and the caller knows
      // which it wants — B2C reads the Stripe pair, B2B reads these.
      polarCustomerId: team.polarCustomerId,
      polarSubscriptionId: team.polarSubscriptionId,
```

- [ ] **Step 2: Add them to the founder-team early return too**

The founder branch at `convex/billing.ts:33` returns a different object literal and would otherwise omit these, making a founder team look like it has no Polar subscription. Add:

```ts
      return {
        stripeCustomerId: team.stripeCustomerId,
        stripeSubscriptionId: team.stripeSubscriptionId,
        polarCustomerId: team.polarCustomerId,
        polarSubscriptionId: team.polarSubscriptionId,
        subscriptionStatus: "active", // Always active for founders
```

- [ ] **Step 3: Deploy and verify against production**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx convex deploy --yes
```

Then confirm a real team still resolves and the new fields are present (undefined is the correct value — nobody has a Polar subscription yet):

```bash
npx convex run billing:getTeamBilling --prod '{"clerkId":"<Tyler'\''s clerk id>"}'
```

Expected: the object returns, `polarCustomerId` and `polarSubscriptionId` are absent/undefined, and every existing field is unchanged.

- [ ] **Step 4: Confirm nothing else broke**

```bash
npx tsc --noEmit
```

Expected: clean. In particular the B2C routes (`b2c-create-checkout`, `b2c-create-portal`) and the Stripe routes read this query and must still typecheck.

- [ ] **Step 5: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/convex/billing.ts
git commit -m "Let billing callers see the Polar ids, not just the Stripe ones"
```

---

### Task 5: `POST /api/polar/create-checkout`

**Files:**
- Create: `src/app/api/polar/create-checkout/route.ts`

**Interfaces:**
- Consumes: `polarFetch`, `productIdForTier`, `PolarError` (Task 2); `getTeamBilling` (Task 4); `normaliseTier`, `type Tier` from `@/lib/tiers`.
- Produces: `POST` with body `{ tier: string }` → `{ url: string }`, or `{ error: string }` with 400/401/500.

- [ ] **Step 1: Write the route**

Create `src/app/api/polar/create-checkout/route.ts`:

```ts
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
```

- [ ] **Step 2: Add the team-id query this route needs**

`getTeamBilling` deliberately does not expose the team's `_id`, and `external_customer_id` needs it. Add to `convex/billing.ts`:

```ts
/**
 * The team id for a signed-in user.
 *
 * Needed by Polar checkout, which sends our own id as `external_customer_id`
 * so a subscription can always be traced back to a team — see the comment on
 * `polar.applySubscription`.
 */
export const getTeamIdForClerkUser = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    return user?.teamId ?? null;
  },
});
```

Deploy it:

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx convex deploy --yes
```

- [ ] **Step 3: Verify a bad request is refused before it reaches Polar**

With dev running and signed in as Tyler in the browser, from the browser console on `localhost:3000`:

```js
await (await fetch("/api/polar/create-checkout", {method:"POST",headers:{"Content-Type":"application/json"},body:"{}"})).json()
```

Expected: `{ error: "Which plan? A tier is required." }`, HTTP 400. Nothing created in Polar.

- [ ] **Step 4: Create a real checkout session and inspect it — do not pay**

```js
await (await fetch("/api/polar/create-checkout", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tier:"overview"})})).json()
```

Expected: `{ url: "https://polar.sh/..." }`. Open it and confirm the plan name, the price, and that no card is charged by looking. Do not complete it — completing checkout is Task 12's job, on a real card, once everything else is in place.

Then confirm the session carries our team id:

```bash
K=$(grep -oE 'polar_[A-Za-z0-9_-]+' ~/.polar-key | head -1)
curl -s -H "Authorization: Bearer $K" "https://api.polar.sh/v1/checkouts/?limit=3" \
 | python3 -c "import json,sys; d=json.load(sys.stdin); [print(c['id'], c.get('external_customer_id'), c.get('seats'), c.get('total_amount')) for c in d['items']]"
```

Expected: the newest session shows Tyler's team id as `external_customer_id`, `seats` ≥ 1, and a total matching the tier.

- [ ] **Step 5: Typecheck and commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/src/app/api/polar/create-checkout/route.ts apps/web/convex/billing.ts
git commit -m "Send a new customer to Polar carrying our own team id"
```

---

### Task 6: `GET /api/polar/subscription-summary`

**Files:**
- Create: `src/app/api/polar/subscription-summary/route.ts`

**Interfaces:**
- Consumes: `polarFetch`, `availableTiers`, `tierOfProduct`, `type PolarSubscriptionResponse` (Task 2); `getTeamBilling` (Task 4); `normaliseTier`.
- Produces: `GET` → `{ tier, hasSubscription, status?, currency, lines, monthlyTotalCents, availableTiers, cancelAtPeriodEnd?, currentPeriodEnd? }`.

- [ ] **Step 1: Write the route**

Create `src/app/api/polar/subscription-summary/route.ts`:

```ts
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
```

Note there is no `isLegacyPricing`. It exists on the Stripe version to warn customers grandfathered onto pre-tier prices that changing plan gives up their rate. Nobody is grandfathered on Polar and nobody will be — Task 11 removes the UI that reads it (`plan-selector.tsx:84`).

The response shape deliberately differs from the Stripe version: `lines[]` is replaced by a single `seats` number and `monthlyTotalCents`. Task 11 Step 3b updates the billing page to match — do not skip it, or the page will render `$NaN` where the line table used to be.

- [ ] **Step 2: Verify the no-subscription path**

Signed in as Tyler (whose team has no Polar subscription), from the browser console:

```js
await (await fetch("/api/polar/subscription-summary")).json()
```

Expected: `hasSubscription: false`, `monthlyTotalCents: null`, `availableTiers` listing all three, and **no invented price**.

- [ ] **Step 3: Verify it refuses when signed out**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/polar/subscription-summary
```

Expected: `401`. Unlike `available-tiers`, this one is per-team and must stay protected.

- [ ] **Step 4: Typecheck and commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/src/app/api/polar/subscription-summary/route.ts
git commit -m "Read what a team is charged from Polar, never from a constant"
```

---

### Task 7: `POST /api/polar/create-portal`

**Files:**
- Create: `src/app/api/polar/create-portal/route.ts`

**Interfaces:**
- Consumes: `polarFetch`, `PolarError` (Task 2); `getTeamIdForClerkUser` (Task 5).
- Produces: `POST` → `{ url: string }` or `{ error: string }` with 400/401/500.

- [ ] **Step 1: Write the route**

Create `src/app/api/polar/create-portal/route.ts`:

```ts
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
```

- [ ] **Step 2: Verify the never-paid path**

Signed in as Tyler, from the browser console:

```js
await (await fetch("/api/polar/create-portal", {method:"POST"})).json()
```

Expected: `{ error: "There's no subscription to manage on this account yet." }` at HTTP 400 — **not** a 500, and no customer created at Polar. Confirm:

```bash
K=$(grep -oE 'polar_[A-Za-z0-9_-]+' ~/.polar-key | head -1)
curl -s -H "Authorization: Bearer $K" "https://api.polar.sh/v1/customers/?limit=5" \
 | python3 -c "import json,sys; print('customers:', json.load(sys.stdin)['pagination']['total_count'])"
```

Expected: still `0`.

- [ ] **Step 3: Typecheck and commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/src/app/api/polar/create-portal/route.ts
git commit -m "Open Polar's billing portal without needing their customer id"
```

---

### Task 8: `POST /api/polar/update-seats`

**Files:**
- Create: `src/app/api/polar/update-seats/route.ts`

**Interfaces:**
- Consumes: `polarFetch`, `PolarError` (Task 2); `getTeamBilling` (Task 4).
- Produces: `POST` with body `{ seatCount: number }` → `{ success: true, seatCount: number }`.

- [ ] **Step 1: Write the route**

Create `src/app/api/polar/update-seats/route.ts`:

```ts
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

    if (!billing?.polarSubscriptionId) {
      // A comped team adding a closer lands here, and it is not an error —
      // there is no subscription to resize. Record the seat count locally so
      // the team page stays truthful and move on.
      if (billing) {
        await convex.mutation(api.billing.setSeatCount, {
          clerkId: userId,
          seatCount,
        });
      }
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
```

- [ ] **Step 2: Add the mutation it writes through**

The Stripe route writes seats via `updateTeamBilling`, which is keyed on `stripeCustomerId` — no use here. Add to `convex/billing.ts`:

```ts
/**
 * Record how many seats a team is paying for.
 *
 * Keyed on the signed-in user rather than a processor's customer id, so it
 * works for a Polar team, a comped team with no processor at all, and anyone
 * mid-migration between the two.
 */
export const setSeatCount = mutation({
  args: { clerkId: v.string(), seatCount: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.seatCount) || args.seatCount < 0) {
      throw new Error(`Invalid seat count: ${args.seatCount}`);
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) throw new Error("User not found");
    await ctx.db.patch(user.teamId, { seatCount: args.seatCount });
    return { success: true as const, teamId: user.teamId };
  },
});
```

Deploy:

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx convex deploy --yes
```

- [ ] **Step 3: Verify the comped path does not throw**

Signed in as Tyler (no Polar subscription), from the browser console:

```js
await (await fetch("/api/polar/update-seats", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({seatCount:2})})).json()
```

Expected: `{ success: true, seatCount: 2, billed: false }`. This is the case that matters most right now — every live customer is comped, so this path runs far more often than the billed one.

- [ ] **Step 4: Verify bad input is refused**

```js
await (await fetch("/api/polar/update-seats", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({seatCount:-1})})).json()
```

Expected: `{ error: "Invalid seat count" }`, HTTP 400.

- [ ] **Step 5: Typecheck and commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/src/app/api/polar/update-seats/route.ts apps/web/convex/billing.ts
git commit -m "Resize a Polar subscription, and don't break comped teams doing it"
```

---

### Task 9: `POST /api/polar/change-tier`

**Files:**
- Create: `src/app/api/polar/change-tier/route.ts`

**Interfaces:**
- Consumes: `polarFetch`, `productIdForTier`, `PolarError` (Task 2); `getTeamBilling` (Task 4); `normaliseTier`, `type Tier`.
- Produces: `POST` with body `{ tier: string }` → `{ success: true, tier: Tier }`.

- [ ] **Step 1: Write the route**

Create `src/app/api/polar/change-tier/route.ts`:

```ts
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { normaliseTier, type Tier } from "@/lib/tiers";
import { polarFetch, productIdForTier, PolarError } from "@/lib/polar";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let tier: Tier;
    try {
      const body = (await req.json()) as { tier?: unknown };
      if (typeof body?.tier !== "string") throw new Error("no tier");
      tier = normaliseTier(body.tier);
    } catch {
      return NextResponse.json({ error: "A tier is required." }, { status: 400 });
    }

    const convex = getConvex();
    const billing = await convex.query(api.billing.getTeamBilling, {
      clerkId: userId,
    });

    if (!billing?.polarSubscriptionId) {
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
```

- [ ] **Step 2: Verify the no-subscription path**

```js
await (await fetch("/api/polar/change-tier", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tier:"oversight"})})).json()
```

Expected: `{ error: "There's no subscription to change on this account." }`, HTTP 400. A comped team must not be able to change a plan it doesn't have.

- [ ] **Step 3: Typecheck and commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/src/app/api/polar/change-tier/route.ts
git commit -m "Change plan by changing the product, and let the webhook confirm it"
```

---

### Task 10: Reprice the three real Polar products

**Gated on Task 1 passing.** If it did not, stop and follow the fallback recorded there.

**Files:**
- Create: `docs/polar-tooling/reprice.ts`

**Interfaces:**
- Consumes: Task 1's verified pricing shape.
- Produces: three repriced Polar products. No application code.

- [ ] **Step 1: Get Tyler's explicit go-ahead**

This changes live prices in a real payment account. Show him the table and wait for a yes:

| Tier | Base now | Base after | First closer | Each extra |
|---|---|---|---|---|
| Overview | $200 | $225 | included | $25 |
| Oversight | $350 | $400 | included | $50 |
| Overwatch | $500 | $650 | included | $150 |

State plainly: revenue is unchanged at every closer count, no customer is affected because there are no subscriptions, and the old prices are archived rather than deleted.

- [ ] **Step 2: Snapshot the current catalogue first**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
K=$(grep -oE 'polar_[A-Za-z0-9_-]+' ~/.polar-key | head -1)
curl -s -H "Authorization: Bearer $K" "https://api.polar.sh/v1/products/?limit=50" \
 > /private/tmp/claude-501/-Users-tylerallen-Desktop-sequ3nce-ai/e7c7a8e4-0435-4a76-9bb6-1fb6673ee861/scratchpad/polar-products-before.json
python3 -c "
import json;d=json.load(open('/private/tmp/claude-501/-Users-tylerallen-Desktop-sequ3nce-ai/e7c7a8e4-0435-4a76-9bb6-1fb6673ee861/scratchpad/polar-products-before.json'))
print(d['pagination']['total_count'],'products captured')"
```

This is the undo. Without it, an incorrect reprice has nothing to restore from.

- [ ] **Step 3: Write the reprice script**

Create `docs/polar-tooling/reprice.ts`:

```ts
// Repricing the three tier products so the base includes the first closer.
//
// Run: npx tsx docs/polar-tooling/reprice.ts          (dry run, prints only)
//      npx tsx docs/polar-tooling/reprice.ts --write  (applies)
//
// Revenue is unchanged at every closer count >= 1. Verified by
// pricing_probe.ts before this script was allowed to touch a real product.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const API = "https://api.polar.sh";
const WRITE = process.argv.includes("--write");

const TOKEN = (() => {
  const m = readFileSync(join(homedir(), ".polar-key"), "utf8").match(/polar_[A-Za-z0-9_-]+/);
  if (!m) throw new Error("No polar_ token found in ~/.polar-key");
  return m[0];
})();

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const PLAN = [
  { tier: "overview",  id: "69d6f5d0-7b12-419f-9b0b-19631ee28187", base: 22_500, extra: 2_500 },
  { tier: "oversight", id: "4b8d45dd-cac7-4d36-b0d1-ca74aa196ee0", base: 40_000, extra: 5_000 },
  { tier: "overwatch", id: "69965636-3fcb-4d24-aefb-f56db963230a", base: 65_000, extra: 15_000 },
];

async function main() {
  for (const p of PLAN) {
    const before = await call("GET", `/v1/products/${p.id}`);
    console.log(`\n${before.name} (${p.tier})`);
    for (const pr of before.prices) {
      console.log(`  before: ${pr.amount_type} ${pr.price_amount ?? JSON.stringify(pr.seat_tiers)}`);
    }
    console.log(`  after:  fixed ${p.base}, graduated [1-1 @ 0] [2+ @ ${p.extra}]`);

    if (!WRITE) continue;

    const updated = await call("PATCH", `/v1/products/${p.id}`, {
      prices: [
        { amount_type: "fixed", price_amount: p.base },
        {
          amount_type: "seat_based",
          seat_tiers: {
            seat_tier_type: "graduated",
            tiers: [
              { min_seats: 1, max_seats: 1, price_per_seat: 0 },
              { min_seats: 2, max_seats: null, price_per_seat: p.extra },
            ],
          },
        },
      ],
    });

    // Read the response rather than assuming the write landed. Polar validates
    // a body atomically and refuses the whole thing on one bad field.
    const fixed = updated.prices.find((x: { amount_type: string }) => x.amount_type === "fixed");
    const ok = fixed?.price_amount === p.base;
    console.log(`  ${ok ? "applied" : "DID NOT APPLY — check the response"}`);
    if (!ok) process.exitCode = 1;
  }
  console.log(WRITE ? "\ndone" : "\ndry run only — pass --write to apply");
}

void main();
```

- [ ] **Step 4: Dry run**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai && npx tsx docs/polar-tooling/reprice.ts
```

Expected: three before/after blocks and "dry run only". Read them against the table in Step 1.

- [ ] **Step 5: Apply**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai && npx tsx docs/polar-tooling/reprice.ts --write
```

Expected: `applied` on all three.

- [ ] **Step 6: Verify the prices a customer would actually be quoted**

Create a checkout against each tier at 1 and 3 seats and check the totals, then confirm no stray sessions matter (they expire unpaid):

```bash
K=$(grep -oE 'polar_[A-Za-z0-9_-]+' ~/.polar-key | head -1)
for P in 69d6f5d0-7b12-419f-9b0b-19631ee28187 4b8d45dd-cac7-4d36-b0d1-ca74aa196ee0 69965636-3fcb-4d24-aefb-f56db963230a; do
  for S in 1 3; do
    curl -s -X POST -H "Authorization: Bearer $K" -H "Content-Type: application/json" \
      -d "{\"products\":[\"$P\"],\"seats\":$S,\"success_url\":\"https://sequ3nce.ai/subscribe?success=true\"}" \
      "https://api.polar.sh/v1/checkouts/" \
      | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['product']['name'] if d.get('product') else '?', '${S} seats →', '\$%.2f' % ((d.get('total_amount') or 0)/100))"
  done
done
```

Expected: Overview $225 / $275, Oversight $400 / $500, Overwatch $650 / $950. Each three-seat figure must equal the old shape (`base + 3 × seat` at the previous prices).

- [ ] **Step 7: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add docs/polar-tooling/reprice.ts
git commit -m "Fold the first closer into the base price"
```

---

### Task 11: Point the app at Polar, restore signup, fix the comped redirect

**Files:**
- Modify: `src/lib/tiers.ts` (`TIER_PRICING` only)
- Modify: `src/app/subscribe/page.tsx`
- Modify: `src/app/subscribe/PlanChooser.tsx`
- Modify: `src/app/_landing/PricingTiers.tsx`
- Modify: `src/app/dashboard/billing/page.tsx`
- Modify: `src/app/dashboard/billing/plan-selector.tsx`
- Modify: `src/app/dashboard/team/page.tsx`

**Interfaces:**
- Consumes: every route from Tasks 3, 5, 6, 7, 8, 9.
- Produces: no new exports. `TIER_PRICING[tier]` changes shape from `{ platform, seat }` to `{ monthly, extraSeat }`.

- [ ] **Step 1: Update the pricing constants**

In `src/lib/tiers.ts`, replace `TIER_PRICING` and its comment:

```ts
/**
 * List prices, in whole dollars.
 *
 * `monthly` includes the first closer; `extraSeat` is each closer after that.
 * Polar cannot sell a subscription with zero seats — the floor of 1 is baked
 * into the price tier — so the plan absorbs one and the customer sees a single
 * number instead of a base plus a compulsory extra.
 *
 * Public marketing figures, kept here so the pricing page and the signup page
 * can't drift apart; they were three separate hardcodings and two of them
 * still said $499. What a customer is ACTUALLY charged always comes from the
 * payment processor, never from this.
 */
export const TIER_PRICING: Record<Tier, { monthly: number; extraSeat: number }> = {
  overview: { monthly: 225, extraSeat: 25 },
  oversight: { monthly: 400, extraSeat: 50 },
  overwatch: { monthly: 650, extraSeat: 150 },
};
```

Leave every other export in this file alone — `TIER_FEATURES`, `tierHas`, `normaliseTier`, `featuresLostMovingTo` and `TIER_INFO` are processor-independent and are still used by the B2C app and the feature gates.

`pricesForTier`, `classifyPrice`, `isLegacyPrice`, `tierIsAvailable` and `tierForPriceId` stay too — the Stripe routes and the B2C checkout still call them.

- [ ] **Step 2: Update the two price displays**

The rename from `platform`/`seat` to `monthly`/`extraSeat` is deliberate: it makes every missed site a compile error rather than a wrong price on a screen nobody re-read.

In `src/app/subscribe/PlanChooser.tsx`, replace the price block (lines 86-96):

```tsx
            <div className="mt-5 border-t border-zinc-100 pt-5">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-zinc-900">
                  ${price.monthly}
                </span>
                <span className="text-zinc-500">/month</span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                Includes your first closer, then ${price.extraSeat}/month for
                each additional closer
              </p>
            </div>
```

In `src/app/_landing/PricingTiers.tsx`, change `TIER_PRICING[plan.tier].platform` (line 116) to `.monthly` and `TIER_PRICING[plan.tier].seat` (line 125) to `.extraSeat`, and reword the line around 125 so it reads as *additional* closers rather than per closer. Read the surrounding markup before editing — do not paste the PlanChooser block into it, the two components have different layouts.

- [ ] **Step 3: Repoint every fetch**

Change these five call sites from `/api/stripe/...` to `/api/polar/...`:

| File | Line | From | To |
|---|---|---|---|
| `src/app/subscribe/page.tsx` | 96 | `/api/stripe/create-checkout` | `/api/polar/create-checkout` |
| `src/app/dashboard/billing/page.tsx` | 151 | `/api/stripe/create-checkout` | `/api/polar/create-checkout` |
| `src/app/dashboard/billing/page.tsx` | 171 | `/api/stripe/create-portal` | `/api/polar/create-portal` |
| `src/app/dashboard/billing/plan-selector.tsx` | 55 | `/api/stripe/change-tier` | `/api/polar/change-tier` |
| `src/app/dashboard/team/page.tsx` | 152 | `/api/stripe/update-seats` | `/api/polar/update-seats` |

Also repoint any `subscription-summary` and `available-tiers` fetches in `dashboard/billing/page.tsx` and `PlanChooser.tsx` to their `/api/polar/` equivalents. Grep to be sure none are missed:

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web
grep -rn "api/stripe/" src --include="*.tsx" --include="*.ts" | grep -v "b2c-"
```

Expected after the change: no results. Any `b2c-` hits are correct and must stay.

- [ ] **Step 3b: Update the billing page to the new summary shape**

`src/app/dashboard/billing/page.tsx` renders `line.unitAmountCents`, `line.subtotalCents` and `line.interval` as plain numbers (lines 334-357). Task 6 removed `lines` because Polar gives no per-line split, so this section must be rewritten or it prints `$NaN`.

Replace the `SubscriptionLine` interface and the `lines` field on the summary type (lines 30-46) with:

```tsx
interface SubscriptionSummary {
  tier: string;
  hasSubscription: boolean;
  status?: string;
  currency: string;
  seats: number;
  monthlyTotalCents: number | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
  availableTiers?: string[];
}
```

Replace the line table (lines 334-358) with a plan + seats + total block:

```tsx
            {summary?.hasSubscription ? (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-zinc-600">
                    {TIER_INFO[normaliseTier(summary.tier)].name}, including
                    your first closer
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-zinc-600">
                    {summary.seats} {summary.seats === 1 ? "closer" : "closers"}
                    {" "}({billing?.activeCloserCount ?? 0} active)
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-t border-zinc-100 pt-3">
                  <span className="font-semibold text-zinc-900">Total</span>
                  <span className="font-semibold text-zinc-900">
                    {money(summary.monthlyTotalCents ?? 0, currency)}/mo
                  </span>
                </div>
              </div>
            ) : (
```

Keep whatever the existing `:` branch renders for a team with no subscription — that is the branch every comped customer sees today and it already works.

Remove `isLegacyPricing` from the summary type, from the `<PlanSelector>` props at line 381, and from `plan-selector.tsx` (the prop at lines 28/36 and the warning block at line 84). Nobody is grandfathered on Polar.

Import `TIER_INFO` and `normaliseTier` from `@/lib/tiers` if not already imported.

- [ ] **Step 4: Fix the comped-team redirect**

In `src/app/subscribe/page.tsx`, the redirect effect only fires when `?success=true` is present, so a comped manager with an active subscription sits on the paywall forever — this is what happened to Zion on 2026-08-13. Replace the effect:

```tsx
  // Anyone whose subscription is live belongs in the dashboard, however they
  // got here. This used to require ?success=true, which meant a comped team —
  // active, but with no checkout behind them — was stranded on the pricing
  // page reading "plans aren't available", with no way forward.
  useEffect(() => {
    if (!billing) return;
    const isActive =
      billing.subscriptionStatus === "active" ||
      billing.subscriptionStatus === "trialing";
    if (isActive) router.push("/dashboard");
  }, [billing, router]);
```

- [ ] **Step 5: Restore signup for signed-out visitors**

There is no `/sign-up` route in this app — Clerk runs as a modal. A signed-out visitor should see the same plan cards, and clicking one should open sign-up and then continue into checkout rather than dead-ending.

In `src/app/subscribe/page.tsx`, add `useClerk` to the existing Clerk import:

```tsx
import { useUser, UserButton, useClerk } from "@clerk/nextjs";
```

Inside `SubscribeContent`, add:

```tsx
  const { openSignUp } = useClerk();
  // A tier chosen before signing up, carried across the modal so they land
  // back here and go straight to checkout instead of picking twice.
  const pendingTier = searchParams.get("tier");
```

Replace `handleSubscribe` so it handles the signed-out case:

```tsx
  const handleSubscribe = async (tier: Tier) => {
    // Not signed in yet: they picked a plan before they had an account, which
    // is the normal order for a stranger arriving from the pricing page. Send
    // them back here with their choice so it survives the sign-up.
    if (isUserLoaded && !user) {
      openSignUp({
        redirectUrl: `/subscribe?tier=${tier}`,
        signInFallbackRedirectUrl: `/subscribe?tier=${tier}`,
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/polar/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Without this every signup silently bought the top plan — the two
        // cheaper ones existed everywhere except the one page where someone
        // could actually buy them.
        body: JSON.stringify({ tier }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("No checkout URL returned:", data.error);
        setCheckoutError(data.error ?? "Couldn't start checkout. Please try again.");
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      setCheckoutError("Couldn't start checkout. Please try again.");
      setIsLoading(false);
    }
  };
```

Add the error state next to `isLoading`:

```tsx
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
```

and render it above `<PlanChooser>`:

```tsx
            {checkoutError && (
              <div className="mx-auto mb-6 max-w-xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {checkoutError}
              </div>
            )}
```

Then resume the chosen plan once they're back and signed in:

```tsx
  // They picked a plan, signed up, and came back. Continue where they left off
  // rather than making them choose the same thing twice.
  useEffect(() => {
    if (!pendingTier || !isTeamReady || !user || isLoading) return;
    void handleSubscribe(normaliseTier(pendingTier));
    // Runs once, when the team is ready after a sign-up round trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTier, isTeamReady, user]);
```

with `normaliseTier` added to the `@/lib/tiers` import.

Replace the long "no signed-out sign-up path here, deliberately" comment block (lines 35-51) with:

```tsx
  // Pricing is public. /api/polar/available-tiers is readable signed out, and
  // choosing a plan opens Clerk's sign-up modal and returns here with ?tier=
  // so the choice survives. The old signed-out branch was removed when nothing
  // could be bought; it exists again because now something can.
```

Keep the `looksLikeAWrongTurn` banner exactly as it is — it exists because a colleague signing in with the wrong address gets an auto-created team and reads the pricing page as "your company's account has lapsed", a misread that cost an hour of live debugging on 2026-08-12. Note it can only render for a signed-in user, so it is unaffected by this change.

- [ ] **Step 6: Tell a Polar outage apart from "no plans exist"**

`PlanChooser` currently maps any non-ok response to `{ tiers: [] }`, which renders as "Plans aren't available to buy online just yet. Get in touch." After Task 3 that is exactly what a 503 during an outage would say — turning a five-minute blip into a lost sale, and telling the visitor something untrue.

In `src/app/subscribe/PlanChooser.tsx`, replace the state and effect (lines 27-67):

```tsx
type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; tiers: Tier[] };

export function PlanChooser({
  isLoading,
  onChoose,
}: {
  isLoading: boolean;
  onChoose: (tier: Tier) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [chosen, setChosen] = useState<Tier | null>(null);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    fetch("/api/polar/available-tiers")
      .then(async (r) => {
        if (!r.ok) throw new Error(`available-tiers ${r.status}`);
        return (await r.json()) as { tiers?: Tier[] };
      })
      .then((d) => {
        if (active) setState({ status: "ready", tiers: d?.tiers ?? [] });
      })
      .catch((err) => {
        // An outage is NOT an empty catalogue, and must not be reported as
        // one. "No plans exist" is a permanent-sounding answer to a temporary
        // problem, and the visitor leaves.
        console.error("[plans] couldn't load available tiers:", err);
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (state.status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-center">
        <p className="text-sm text-zinc-700">
          We couldn&apos;t load the plans just now.
        </p>
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white"
        >
          Try again
        </button>
      </div>
    );
  }

  const plans = TIER_ORDER.filter((t) => state.tiers.includes(t));

  if (plans.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm text-amber-900">
          Plans aren&apos;t available to buy online just yet. Get in touch and
          we&apos;ll set your team up directly.
        </p>
      </div>
    );
  }
```

The rest of the component — the `plans.map` and everything inside it — is unchanged apart from the price block in Step 2.

Also update the file's header comment: the last paragraph says "Only plans whose prices exist are offered", which described Stripe price IDs in env vars. It is now "only plans that have a live product in Polar".

- [ ] **Step 7: Build and check every screen**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx tsc --noEmit && npx next build
```

Expected: both clean.

Then with `npm run dev`, look at, signed out: `/` (landing pricing shows $225/$400/$650 with "includes your first closer") and `/subscribe` (three plans plus a sign-up button, not "get in touch"). Signed in as Tyler: `/dashboard/billing` (no crash, shows no active subscription) and `/dashboard/team`.

- [ ] **Step 8: Commit**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/web/src
git commit -m "Sell through Polar, and stop stranding comped teams on the paywall"
```

---

### Task 12: Buy the product with a real card

Nothing before this proves the system works. The webhook has never received a real delivery — it was written, corrected once for a signature bug that would have made Polar disable the endpoint after ten silent failures, and never exercised.

**Files:** none. This is verification.

- [ ] **Step 1: Confirm the webhook is configured in Polar**

In Polar's dashboard, confirm an endpoint pointing at the production Convex HTTP URL `/webhooks/polar`, subscribed to `subscription.created`, `subscription.updated`, `subscription.active`, `subscription.canceled`, `subscription.revoked`, `subscription.uncanceled`. `POLAR_WEBHOOK_SECRET` is already set in Convex prod; if the endpoint is recreated, the secret changes and must be reset:

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web
npx convex env set POLAR_WEBHOOK_SECRET whsec_... --prod
```

- [ ] **Step 2: Watch the logs while buying**

In one shell:

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx convex logs --prod
```

- [ ] **Step 3: Sign up as a stranger and pay**

From a private browser window on production: create a **new** Clerk account with an address that is not an existing customer, land on `/subscribe`, pick **Overview** (cheapest — $225), and pay with Tyler's real card.

Confirm on the way through: the plan name and price on Polar's checkout page match the pricing page, and the charge is $225.00.

- [ ] **Step 4: Confirm the webhook landed and the team is right**

Expected in the logs: a verified webhook, and `applySubscription` returning `applied: true` with no "no team for this Polar customer".

Then check the team record:

```bash
npx convex run billing:getTeamBilling --prod '{"clerkId":"<the new test account clerk id>"}'
```

Expected: `subscriptionStatus: "active"`, `productTier: "overview"`, `polarCustomerId` and `polarSubscriptionId` both set, `seatCount` 1.

And confirm the browser landed on `/dashboard`, not stuck on the paywall.

- [ ] **Step 5: Add a closer and confirm it bills next period, not now**

Add a closer from `/dashboard/team`. Then:

```bash
K=$(grep -oE 'polar_[A-Za-z0-9_-]+' ~/.polar-key | head -1)
curl -s -H "Authorization: Bearer $K" "https://api.polar.sh/v1/subscriptions/?limit=5" \
 | python3 -c "import json,sys; d=json.load(sys.stdin); [print(s['id'], s['status'], 'seats=', s.get('seats'), 'amount=', s.get('amount')) for s in d['items']]"
```

Expected: `seats` is 2. Then check Polar's orders/invoices for that customer and confirm **no new charge was raised today** — the second closer should appear on the next renewal.

- [ ] **Step 6: Change tier, then open the portal**

From `/dashboard/billing`, change to Oversight. Expected: the PATCH succeeds, the webhook fires, and `productTier` becomes `oversight` in Convex. Then click through to the billing portal and confirm it opens on Polar with the right customer and subscription.

- [ ] **Step 7: Cancel, and confirm access ends correctly**

Cancel from the portal. Expected: the webhook arrives, `subscriptionStatus` becomes `canceled`, and the account behaves as unpaid. **Refund the charge** from Polar's dashboard once cancellation is confirmed.

- [ ] **Step 8: Confirm the comped teams were untouched throughout**

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web
npx convex data teams --prod --limit 100 --format json | python3 -c "
import json,sys
rows=json.load(sys.stdin)
watch={'js728xjb1vdxcfcsxcwme62eh589977x':'ManyJobs','js7d3bx3hpwcmfgrxmsa6yx6td8bgagr':'CreateFreedom','js7ak2980wehyj0070ygsg6sms8cf84d':'E2 Influencers'}
for r in rows:
    if r['_id'] in watch:
        print(f\"{watch[r['_id']]:16s} tier={r.get('productTier')} override={r.get('productTierOverride')} status={r.get('subscriptionStatus')} seats={r.get('seatCount')} polarCust={r.get('polarCustomerId')}\")
"
```

**Baseline captured 2026-08-14, before any of this was built.** Every field must still read exactly this:

```
E2 Influencers   tier=overwatch override=overwatch status=active seats=5 polarCust=None
CreateFreedom    tier=overwatch override=overwatch status=active seats=1 polarCust=None
ManyJobs         tier=overwatch override=overwatch status=active seats=3 polarCust=None
```

Any drift is a release blocker, not a follow-up. `polarCust=None` is the one that matters most: a comped team acquiring a Polar customer id means something tried to bill a customer who is invoiced outside the software.

Then confirm Polar itself only ever knew about the test account:

```bash
K=$(grep -oE 'polar_[A-Za-z0-9_-]+' ~/.polar-key | head -1)
curl -s -H "Authorization: Bearer $K" "https://api.polar.sh/v1/customers/?limit=20" \
 | python3 -c "import json,sys; d=json.load(sys.stdin); print('customers:', d['pagination']['total_count']); [print(' -', c.get('email'), c.get('external_id')) for c in d['items']]"
```

Expected: exactly one customer, the test account, and its `external_id` is the test team's id — not one of the three above.

Finally, confirm no customer-facing side effects fired: check the ManyJobs and CreateFreedom Slack channels for any message posted during this task's window. Saving an outcome is what normally reaches into a customer's CRM, and nothing here should have touched that path — but the check is cheap and the failure is not.

- [ ] **Step 9: Delete the test account**

Remove the test Clerk user and its Convex team so it can't be mistaken for a customer later, or turn it into a comped internal account if Tyler wants it kept.

- [ ] **Step 10: Record the outcome**

Update the memory file for this work with what was proven end to end, and anything that behaved differently from the spec.

---

## Notes for whoever executes this

- **Task 1 gates Task 10.** Do not reprice real products on an unverified assumption about graduated tiering.
- **Task 12 is not optional and cannot be simulated.** Every task before it verifies a piece; only Task 12 verifies the system.
- **Do not touch anything Stripe.** The $99 Personal app depends on it and has paying history. If a change seems to require editing a Stripe route, stop and ask.
- **Do not print the Polar token.** Extract it into a shell variable, use it, never echo it.
- **Comped teams are the only live customers.** Any change that makes a comped team throw, get billed, or lose access is a release blocker, not a follow-up.
