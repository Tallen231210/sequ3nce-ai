"use client";

/**
 * Closer session on the web.
 *
 * Closers don't use Clerk — they sign in against the `closers` table and get a
 * session token back. This module is the only place that token is read or
 * written, so there is exactly one answer to "am I signed in".
 */

const TOKEN_KEY = "sequ3nce_closer_session";
const INFO_KEY = "sequ3nce_closer_info";

export interface CloserInfo {
  closerId: string;
  teamId: string;
  name: string;
  email: string;
  status: string;
  teamName?: string;
  /**
   * "bot" (or absent) is the full product. "fathom" is bring-your-own-
   * recording — we never join the call, so features that depend on us being
   * in the room aren't part of what that team bought.
   */
  productTier?: string;
  /** Team's display name for the contract-value field; absent = default. */
  dealValueLabel?: string;
  dealValueShortLabel?: string;
}

export const DEFAULT_DEAL_VALUE_LABEL = "Contract value";
export const DEFAULT_DEAL_VALUE_SHORT = "Contract";

/**
 * What to call the contract-value field for this closer's team. Some teams
 * don't know the phrase "contract value" (E2 asked for "Total deal value"),
 * so every label, hint, and column header goes through here.
 */
export function dealValueLabels(info?: CloserInfo | null): {
  long: string;
  short: string;
  hint: string;
} {
  const long = info?.dealValueLabel?.trim() || DEFAULT_DEAL_VALUE_LABEL;
  const short = info?.dealValueShortLabel?.trim() || (info?.dealValueLabel?.trim() ? long : DEFAULT_DEAL_VALUE_SHORT);
  return {
    long,
    short,
    hint: "the full price the customer agreed to — deposit plus everything still owed",
  };
}

export const CONVEX_SITE_URL =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  "https://ideal-ram-982.convex.site";

/** Server-render safe: there is no session during SSR, by definition. */
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Private browsing or blocked storage. Treat as signed out rather than
    // throwing during render.
    return null;
  }
}

export function getToken(): string | null {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

export function getCloserInfo(): CloserInfo | null {
  const raw = storage()?.getItem(INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CloserInfo;
  } catch {
    return null;
  }
}

export function saveSession(token: string, info: CloserInfo) {
  const s = storage();
  if (!s) return;
  s.setItem(TOKEN_KEY, token);
  s.setItem(INFO_KEY, JSON.stringify(info));
}

export function clearSession() {
  const s = storage();
  if (!s) return;
  s.removeItem(TOKEN_KEY);
  s.removeItem(INFO_KEY);
}

/**
 * Thrown when the server says the session is no good. Callers should send the
 * closer back to sign in rather than showing an error — an expired session is
 * a normal thing that happens, not a failure.
 */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expired");
    this.name = "SessionExpiredError";
  }
}

/**
 * Every closer API call goes through here.
 *
 * Attaches the session token, which is what actually establishes identity: on
 * a converted route the server resolves the closer from the session and
 * ignores anything the body claims.
 *
 * It also sends `closerId` for now, because most routes haven't been converted
 * yet and still read it from the body. That is not a weakening — a converted
 * route discards it, and an unconverted one is exactly as trusting as it is
 * for the desktop app today. Routes are converted as each view is ported; when
 * the last one is done, drop the `closerId` line below and the fallback in
 * convex/closerSession.ts together.
 */
export async function closerFetch<T>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const token = getToken();
  const legacyCloserId = getCloserInfo()?.closerId;
  const response = await fetch(`${CONVEX_SITE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(legacyCloserId ? { closerId: legacyCloserId } : {}),
      ...body,
      ...(token ? { sessionToken: token } : {}),
    }),
  });

  if (response.status === 401) {
    clearSession();
    throw new SessionExpiredError();
  }
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export interface CloserMe {
  valid: boolean;
  closer?: CloserInfo;
  /** Staged rollout flag on the team. False = show "not available yet". */
  webAppEnabled?: boolean;
  /** True when the check couldn't run, so callers don't treat it as denial. */
  offline?: boolean;
}

/**
 * One call on app load: is the session still good, who is it, and is this team
 * switched on yet. Extends the session as a side effect, which is why it isn't
 * called per request.
 */
export async function fetchMe(): Promise<CloserMe> {
  const token = getToken();
  if (!token) return { valid: false };
  try {
    const res = await fetch(`${CONVEX_SITE_URL}/closer/me`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: token }),
    });
    const data = (await res.json()) as CloserMe;
    if (!data.valid) clearSession();
    return data;
  } catch {
    // A network blip is not a signed-out state, and it certainly isn't a
    // "you don't have access" state. Say so, and let the caller keep going.
    return { valid: true, offline: true, webAppEnabled: true };
  }
}

export async function signOut(): Promise<void> {
  const token = getToken();
  clearSession();
  if (!token) return;
  try {
    await fetch(`${CONVEX_SITE_URL}/closer/session/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: token }),
    });
  } catch {
    // Local session is already gone, which is what the closer asked for.
    // The server-side row expires on its own.
  }
}
