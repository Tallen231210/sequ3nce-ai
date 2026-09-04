// ============================================================================
// First-touch ad attribution (2026-09-04, per Pedro's spec).
//
// On first landing, capture utm_source/medium/campaign/content/term + gclid +
// fbclid into a first-party cookie (90 days). First touch WINS: a return
// visit with different params never overwrites. Consumed by the lead form
// (→ Convex + GHL), the booking widget (→ GHL calendar attribution), and the
// checkout route (→ Polar metadata → order → CAPI/Zapier).
// ============================================================================

export const ATTRIBUTION_COOKIE = "s3_attr";
export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
] as const;
export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type Attribution = Partial<Record<AttributionKey, string>> & { landed_at?: string };

const MAX_VALUE = 200;
const NINETY_DAYS = 90 * 24 * 60 * 60;

function clean(value: string | null): string | undefined {
  const v = (value ?? "").trim().slice(0, MAX_VALUE);
  return v ? v : undefined;
}

/** Parse the cookie (client-side). Null when nothing was ever captured. */
export function readAttribution(): Attribution | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie.match(new RegExp(`(?:^|; )${ATTRIBUTION_COOKIE}=([^;]+)`))?.[1];
  return parseAttributionCookie(raw ? decodeURIComponent(raw) : undefined);
}

/** Shared parser (server routes read the same cookie via req.cookies). */
export function parseAttributionCookie(raw: string | undefined): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Attribution = {};
    for (const key of ATTRIBUTION_KEYS) {
      const v = parsed[key];
      if (typeof v === "string" && v.trim()) out[key] = v.trim().slice(0, MAX_VALUE);
    }
    if (typeof parsed.landed_at === "string") out.landed_at = parsed.landed_at.slice(0, 40);
    return Object.keys(out).some((k) => k !== "landed_at") ? out : null;
  } catch {
    return null;
  }
}

/**
 * Capture first touch from the current URL. No-op when the cookie already
 * exists (first touch wins) or the URL carries no attribution params.
 */
export function captureFirstTouch(): void {
  if (typeof window === "undefined") return;
  if (readAttribution()) return;
  const params = new URLSearchParams(window.location.search);
  const captured: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const v = clean(params.get(key));
    if (v) captured[key] = v;
  }
  if (Object.keys(captured).length === 0) return;
  captured.landed_at = new Date().toISOString();

  const host = window.location.hostname;
  const domain = host.endsWith("sequ3nce.ai") ? "; domain=.sequ3nce.ai" : "";
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(captured))}` +
    `; max-age=${NINETY_DAYS}; path=/${domain}; SameSite=Lax${secure}`;
}

/** Query string (no leading ?) for embedding into the GHL booking widget URL. */
export function attributionQueryString(attr: Attribution | null): string {
  if (!attr) return "";
  const qs = new URLSearchParams();
  for (const key of ATTRIBUTION_KEYS) {
    if (attr[key]) qs.set(key, attr[key] as string);
  }
  return qs.toString();
}
