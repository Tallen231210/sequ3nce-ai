// ============================================================================
// Which product did this team buy, and what does it include?
//
// One file, because the answer has to be identical everywhere. A checkout that
// disagrees with a feature gate is a customer paying for something they can't
// use, or using something they aren't paying for.
//
// The tier is DERIVED from the Stripe price a team is subscribed to, never
// stored independently. That is the whole design: entitlement and billing
// can't drift apart if there's only one fact and it lives at the payment
// processor. `teams.productTier` is a cache of this, written by the Stripe
// webhook and read by everything else.
// ============================================================================

export type Tier = "overview" | "oversight" | "overwatch";

/**
 * Absent means full, deliberately.
 *
 * Every team that existed before tiers bought the whole product, and a missing
 * field must never quietly downgrade someone. New teams get a tier the moment
 * their subscription is created, so the gap only ever applies to people who
 * are already entitled to everything.
 */
export const DEFAULT_TIER: Tier = "overwatch";

/**
 * Also accepts the keys these tiers had before they were named.
 *
 * "fathom" was the worst of them: it named the tier after the one recorder it
 * happened to support first, and that tier is meant to take Zoom and Gong too.
 * Mapping the old values means no data migration is required to read them, and
 * anything still holding one resolves correctly instead of silently landing on
 * the default.
 */
const LEGACY_KEYS: Record<string, Tier> = {
  scoreboard: "overview",
  fathom: "oversight",
  full: "overwatch",
};

export function normaliseTier(value: string | null | undefined): Tier {
  if (value === "overview" || value === "oversight" || value === "overwatch") {
    return value;
  }
  if (value && LEGACY_KEYS[value]) return LEGACY_KEYS[value];
  return DEFAULT_TIER;
}

interface TierPrices {
  platform?: string;
  seat?: string;
}

/**
 * The prices we sell today.
 *
 * Read at call time rather than module load, so a missing env var surfaces as
 * a clear failure on the request that needed it instead of a mysterious
 * undefined captured at import.
 */
function pricesFor(tier: Tier): TierPrices {
  switch (tier) {
    case "overview":
      return {
        platform: process.env.STRIPE_OVERVIEW_PLATFORM_PRICE_ID,
        seat: process.env.STRIPE_OVERVIEW_SEAT_PRICE_ID,
      };
    case "oversight":
      return {
        platform: process.env.STRIPE_OVERSIGHT_PLATFORM_PRICE_ID,
        seat: process.env.STRIPE_OVERSIGHT_SEAT_PRICE_ID,
      };
    case "overwatch":
      // Falls back to the original price IDs.
      //
      // Full IS the product as it exists today, so until dedicated prices are
      // created it must resolve to exactly what we already charge. Without
      // this, introducing tiers silently broke checkout and adding a closer —
      // both call this and both would have thrown on a variable nobody has
      // set yet. Not hypothetical: it shipped that way and this is the fix.
      return {
        platform:
          process.env.STRIPE_OVERWATCH_PLATFORM_PRICE_ID ??
          process.env.STRIPE_PLATFORM_PRICE_ID,
        seat:
          process.env.STRIPE_OVERWATCH_SEAT_PRICE_ID ??
          process.env.STRIPE_SEAT_PRICE_ID,
      };
  }
}

/**
 * The prices for a tier, or an explicit failure.
 *
 * Throwing beats returning undefined here: the callers are checkout and tier
 * changes, and a request that silently proceeds without a price either creates
 * a subscription for nothing or charges the wrong amount.
 */
export function pricesForTier(tier: Tier): { platform: string; seat: string } {
  const prices = pricesFor(tier);
  if (!prices.platform || !prices.seat) {
    throw new Error(
      `Stripe prices are not configured for the "${tier}" tier. ` +
        `Set STRIPE_${tier.toUpperCase()}_PLATFORM_PRICE_ID and ` +
        `STRIPE_${tier.toUpperCase()}_SEAT_PRICE_ID.`,
    );
  }
  return { platform: prices.platform, seat: prices.seat };
}

/**
 * What IS this price — whose tier, and is it the platform fee or a seat?
 *
 * Both questions have to be answered from the same table or they drift. The
 * seat half matters more than it looks: the Stripe webhook counts seats by
 * matching one hardcoded seat price, so a team on any other tier's seat price
 * would have been recorded as having zero seats.
 */
export function classifyPrice(
  priceId: string | null | undefined,
): { tier: Tier; kind: "platform" | "seat" } | null {
  if (!priceId) return null;

  for (const tier of ["overview", "oversight", "overwatch"] as const) {
    const prices = pricesFor(tier);
    if (priceId === prices.platform) return { tier, kind: "platform" };
    if (priceId === prices.seat) return { tier, kind: "seat" };
  }

  // The prices every existing customer is on, from before tiers existed.
  if (priceId === process.env.STRIPE_PLATFORM_PRICE_ID) {
    return { tier: "overwatch", kind: "platform" };
  }
  if (priceId === process.env.STRIPE_SEAT_PRICE_ID) {
    return { tier: "overwatch", kind: "seat" };
  }

  return null;
}

/**
 * Is this one of the prices from before tiers existed?
 *
 * Distinct from "unrecognised", which is what this used to be checked as —
 * and wrongly, because legacy prices ARE recognised: they map to Full. The
 * warning that depends on this ("changing plan gives up your original rate")
 * therefore never fired for the one group it exists to protect.
 */
export function isLegacyPrice(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  // Only legacy if it isn't also a current tier price. Once STRIPE_FULL_*
  // prices are created these stop overlapping; until then the Full tier falls
  // back to exactly these IDs, and nobody is "legacy" for being on the only
  // prices we sell.
  const isCurrentTierPrice = (["overview", "oversight", "overwatch"] as const).some(
    (tier) => {
      const prices = pricesFor(tier);
      return priceId === prices.platform || priceId === prices.seat;
    },
  );
  if (isCurrentTierPrice) return false;
  return (
    priceId === process.env.STRIPE_PLATFORM_PRICE_ID ||
    priceId === process.env.STRIPE_SEAT_PRICE_ID
  );
}

/** Whether a tier can actually be sold — its prices exist in the environment. */
export function tierIsAvailable(tier: Tier): boolean {
  const prices = pricesFor(tier);
  return !!prices.platform && !!prices.seat;
}

/**
 * Which tier does this price belong to?
 *
 * Returns null for anything we don't recognise — including the case that
 * matters most, a price created in Stripe but never added to our env. Callers
 * must treat null as "leave the tier alone", never as a default, or a typo in
 * a price ID silently downgrades a paying customer.
 */
export function tierForPriceId(priceId: string | null | undefined): Tier | null {
  return classifyPrice(priceId)?.tier ?? null;
}

// ============================================================================
// What each tier includes
// ============================================================================

/**
 * Features as data, not as conditionals scattered through the app.
 *
 * Anything that depends on OUR meeting bot being in the call is `full` only —
 * on the other tiers we are never in the room, so those screens can only ever
 * be empty and showing them advertises something the customer didn't buy.
 */
export const TIER_FEATURES = {
  /** Our bot joins calls: live view, video review, clips, playbook, coaching. */
  meetingBot: { overview: false, oversight: false, overwatch: true },
  /** Connect an outside recorder — Fathom today. */
  externalRecording: { overview: false, oversight: true, overwatch: true },
  /** Transcripts, AI summaries and call analysis. Needs a recording of some kind. */
  callIntelligence: { overview: false, oversight: true, overwatch: true },
  /** The scoreboard itself: numbers, targets, Setter Data. Everyone gets this. */
  performance: { overview: true, oversight: true, overwatch: true },
} as const;

export type Feature = keyof typeof TIER_FEATURES;

export function tierHas(tier: Tier | string | undefined, feature: Feature): boolean {
  return TIER_FEATURES[feature][normaliseTier(tier)];
}

/**
 * Customer-facing names and descriptions.
 *
 * Here rather than in the billing page so the plan selector, the checkout and
 * any future pricing page can't describe the same tier differently.
 */
export const TIER_INFO: Record<
  Tier,
  { name: string; tagline: string; promise: string; includes: string[] }
> = {
  overview: {
    name: "Overview",
    tagline: "Every number in one place",
    promise: "Your numbers, without chasing anyone for them.",
    includes: [
      "Bookings, shows, closes and cash — updated daily",
      "Each closer's numbers, side by side",
      "Setter performance from your CRM",
      "Targets, pace and where the funnel leaks",
    ],
  },
  oversight: {
    name: "Oversight",
    tagline: "Find what's working, and spread it",
    promise: "See what the calls that close have in common.",
    includes: [
      "Everything in Overview",
      "Connect the recorder you already use",
      "Full transcripts and AI breakdowns of every call",
      "The objections that keep coming up, and the answers that land",
    ],
  },
  overwatch: {
    name: "Overwatch",
    tagline: "Coach from the calls themselves",
    promise: "Turn your best calls into how everyone else sells.",
    includes: [
      "Everything in Oversight",
      "Every call recorded automatically — nobody has to remember",
      "Drop into a live call when a big one needs backup",
      "Clip the moments that matter into a playbook new hires learn from",
    ],
  },
};

/** Ordered cheapest to most expensive, for deciding upgrade vs downgrade. */
export const TIER_ORDER: Tier[] = ["overview", "oversight", "overwatch"];

export function isDowngrade(from: Tier, to: Tier): boolean {
  return TIER_ORDER.indexOf(to) < TIER_ORDER.indexOf(from);
}

/**
 * What a team stops being able to do by moving to a cheaper tier.
 *
 * Shown in the confirmation before the change. A customer who discovers after
 * the fact that their bot stopped joining calls raises a chargeback, and they'd
 * be right to.
 */
export function featuresLostMovingTo(from: Tier, to: Tier): string[] {
  const lost: string[] = [];
  if (tierHas(from, "meetingBot") && !tierHas(to, "meetingBot")) {
    lost.push("Our meeting bot will stop joining your calls");
    lost.push("Live call view, video review, clips and the playbook");
  }
  if (tierHas(from, "externalRecording") && !tierHas(to, "externalRecording")) {
    // Not "your Fathom connection" — this tier is meant to take Zoom and Gong
            // too, and copy that names one vendor goes stale the day we add another.
    lost.push("Your connected recording tool will stop bringing in calls");
  }
  if (tierHas(from, "callIntelligence") && !tierHas(to, "callIntelligence")) {
    lost.push("Transcripts and AI analysis on new calls");
  }
  return lost;
}
