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
 * Attaches the session token and, critically, does NOT send a closerId — the
 * server resolves that from the session. Sending one would be pointless at
 * best, and at worst would keep the old habit alive on routes that still
 * accept it.
 */
export async function closerFetch<T>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const token = getToken();
  const response = await fetch(`${CONVEX_SITE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, ...(token ? { sessionToken: token } : {}) }),
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

/** Extends the session. Called once when the app loads, not per request. */
export async function refreshSession(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(`${CONVEX_SITE_URL}/closer/session/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: token }),
    });
    const data = (await res.json()) as { valid?: boolean };
    if (!data.valid) clearSession();
    return !!data.valid;
  } catch {
    // A network blip is not a signed-out state. Keep the session and let the
    // next real request decide.
    return true;
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
