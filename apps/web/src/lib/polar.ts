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

import { TIER_ORDER, type Tier } from "./tiers";

const POLAR_API_PRODUCTION = "https://api.polar.sh";
const POLAR_API_SANDBOX = "https://sandbox-api.polar.sh";

/**
 * Which Polar environment this request talks to.
 *
 * Defaults to production when POLAR_API_BASE is unset. A payment endpoint's
 * failure mode has to be "obviously broken", never "silently misrouted" —
 * defaulting to sandbox would mean a forgotten env var quietly stops taking
 * real payments, which is far easier to miss than a sandbox test that fails
 * loudly against a production-only token. Only the two hosts Polar actually
 * runs are accepted; anything else is a typo, and a typo in a URL a payment
 * request is about to be sent to must fail before the request goes out, not
 * turn into a request to nowhere.
 */
function polarApiBase(): string {
  const raw = process.env.POLAR_API_BASE;
  if (!raw || raw === POLAR_API_PRODUCTION) return POLAR_API_PRODUCTION;
  if (raw === POLAR_API_SANDBOX) return POLAR_API_SANDBOX;
  throw new Error(
    `POLAR_API_BASE is set to "${raw}", which is not a Polar host. Use ` +
      `"${POLAR_API_PRODUCTION}" for production, "${POLAR_API_SANDBOX}" for ` +
      `sandbox, or unset it to default to production.`,
  );
}

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

  const res = await fetch(`${polarApiBase()}${path}`, {
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

// Keyed on the base URL, not just time: without that, a cached sandbox
// product map could be handed to a production request (or the reverse) in
// the window right after an env var flip, since nothing else invalidates it.
let productCache: { at: number; base: string; byTier: Map<Tier, string> } | null = null;

async function tierProducts(): Promise<Map<Tier, string>> {
  const base = polarApiBase();
  if (
    productCache &&
    productCache.base === base &&
    Date.now() - productCache.at < PRODUCT_CACHE_MS
  ) {
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

  productCache = { at: Date.now(), base, byTier };
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
