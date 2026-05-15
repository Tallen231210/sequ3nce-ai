// Meta Pixel + Conversions API helper.
//
// Conversion events fire BOTH:
//   1. The browser pixel (via window.fbq) — fast feedback, breadcrumbs
//      visible in Meta Pixel Helper, attributes the event to the
//      browser session.
//   2. The Conversions API (via our /api/meta/conversions route) —
//      server-side, survives ad blockers and iOS 14.5+ ATT. Recovers
//      ~30% of attribution that browser-only pixels lose.
//
// Both events carry the SAME event_id so Meta dedupes them — counts as
// one conversion in Events Manager, not two.

type MetaEventName =
  | "Lead"
  | "CompleteRegistration"
  | "InitiateCheckout"
  | "Subscribe"
  | "Purchase"
  | "Schedule";

interface MetaUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}

interface MetaCustomData {
  /** Tag whether the event came from the B2B or B2C funnel. */
  product?: "b2b" | "b2c";
  /** Monetary value for revenue events (Subscribe, Purchase). */
  value?: number;
  /** Currency code for monetary values (defaults to USD). */
  currency?: string;
  /** Stripe price ID, GHL location ID, etc. */
  contentIds?: string[];
}

function generateEventId(): string {
  // RFC4122-ish v4 UUID. Used as the dedup key between browser + CAPI.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Fire a Meta conversion event in both the browser and via Conversions
 * API. Dedupes via shared event_id.
 *
 * Safe to call from anywhere — silently no-ops if the pixel isn't
 * loaded or if env vars are missing. Never throws.
 */
export async function trackMetaEvent(
  name: MetaEventName,
  customData?: MetaCustomData,
  userData?: MetaUserData,
): Promise<void> {
  const eventId = generateEventId();
  const sourceUrl = typeof window !== "undefined" ? window.location.href : undefined;

  const browserParams: Record<string, unknown> = {};
  if (customData?.value !== undefined) browserParams.value = customData.value;
  if (customData?.currency) browserParams.currency = customData.currency;
  if (customData?.contentIds) browserParams.content_ids = customData.contentIds;
  if (customData?.product) browserParams.product = customData.product;

  // 1. Browser pixel — fast, attributed to the browser session.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fbq = (window as any).fbq;
    if (typeof fbq === "function") {
      fbq("track", name, browserParams, { eventID: eventId });
    }
  } catch (err) {
    console.error("[meta-pixel] fbq call failed:", err);
  }

  // 2. Conversions API — server-side, survives ad blockers / ATT.
  try {
    await fetch("/api/meta/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventId,
        eventName: name,
        eventSourceUrl: sourceUrl,
        customData,
        userData,
      }),
    });
  } catch (err) {
    console.error("[meta-pixel] CAPI call failed:", err);
  }
}
