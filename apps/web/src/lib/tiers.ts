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

export type Tier = "scoreboard" | "fathom" | "full";

/**
 * Absent means full, deliberately.
 *
 * Every team that existed before tiers bought the whole product, and a missing
 * field must never quietly downgrade someone. New teams get a tier the moment
 * their subscription is created, so the gap only ever applies to people who
 * are already entitled to everything.
 */
export const DEFAULT_TIER: Tier = "full";

export function normaliseTier(value: string | null | undefined): Tier {
  return value === "scoreboard" || value === "fathom" || value === "full"
    ? value
    : DEFAULT_TIER;
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
    case "scoreboard":
      return {
        platform: process.env.STRIPE_SCOREBOARD_PLATFORM_PRICE_ID,
        seat: process.env.STRIPE_SCOREBOARD_SEAT_PRICE_ID,
      };
    case "fathom":
      return {
        platform: process.env.STRIPE_FATHOM_PLATFORM_PRICE_ID,
        seat: process.env.STRIPE_FATHOM_SEAT_PRICE_ID,
      };
    case "full":
      return {
        platform: process.env.STRIPE_FULL_PLATFORM_PRICE_ID,
        seat: process.env.STRIPE_FULL_SEAT_PRICE_ID,
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

  for (const tier of ["scoreboard", "fathom", "full"] as const) {
    const prices = pricesFor(tier);
    if (priceId === prices.platform) return { tier, kind: "platform" };
    if (priceId === prices.seat) return { tier, kind: "seat" };
  }

  // The prices every existing customer is on, from before tiers existed.
  if (priceId === process.env.STRIPE_PLATFORM_PRICE_ID) {
    return { tier: "full", kind: "platform" };
  }
  if (priceId === process.env.STRIPE_SEAT_PRICE_ID) {
    return { tier: "full", kind: "seat" };
  }

  return null;
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
  meetingBot: { scoreboard: false, fathom: false, full: true },
  /** Connect an outside recorder — Fathom today. */
  externalRecording: { scoreboard: false, fathom: true, full: true },
  /** Transcripts, AI summaries and call analysis. Needs a recording of some kind. */
  callIntelligence: { scoreboard: false, fathom: true, full: true },
  /** The scoreboard itself: numbers, targets, Setter Data. Everyone gets this. */
  performance: { scoreboard: true, fathom: true, full: true },
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
  { name: string; tagline: string; includes: string[] }
> = {
  scoreboard: {
    name: "Scoreboard",
    tagline: "Tracking and visibility, working the day you sign up",
    includes: [
      "Team performance board and daily numbers",
      "Setter Data from your CRM",
      "Calendar-based booking and show rates",
      "Analytics and targets",
    ],
  },
  fathom: {
    name: "Bring your own recording",
    tagline: "See what's actually being said, without changing how you record",
    includes: [
      "Everything in Scoreboard",
      "Connect Fathom — calls arrive automatically",
      "Full transcripts and AI call analysis",
      "Check whether reported numbers are true",
    ],
  },
  full: {
    name: "Full",
    tagline: "Everything, for teams who do a lot of call review",
    includes: [
      "Everything in Bring your own recording",
      "Our meeting bot joins and records every call",
      "Watch calls live as they happen",
      "Video review with timestamped comments, clips and playbook",
    ],
  },
};

/** Ordered cheapest to most expensive, for deciding upgrade vs downgrade. */
export const TIER_ORDER: Tier[] = ["scoreboard", "fathom", "full"];

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
    lost.push("Your Fathom connection will stop bringing in calls");
  }
  if (tierHas(from, "callIntelligence") && !tierHas(to, "callIntelligence")) {
    lost.push("Transcripts and AI analysis on new calls");
  }
  return lost;
}
