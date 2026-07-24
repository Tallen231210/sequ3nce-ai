import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

// ============================================================================
// Admin session — HMAC-signed, server-verified.
//
// The old scheme set admin_session = the literal string "authenticated"
// (forgeable by anyone) and NO route ever verified it. That's fine for a
// read-only panel behind a client-side gate, but this session adds
// impersonation — the single most dangerous action in the app (act as ANY
// user) — so the gate must be real. The cookie value is now
// `<base64 expiry>.<HMAC-SHA256(base64 expiry, secret)>`; without the secret
// it can't be forged, and every protected route calls verifyAdminSession().
// ============================================================================

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_MS = 24 * 60 * 60 * 1000; // 24h

function secret(): string {
  const s = process.env.ADMIN_PASSWORD;
  if (!s) throw new Error("ADMIN_PASSWORD not configured");
  // Namespace the signing key so the raw password is never the HMAC key
  // verbatim (defense in depth if it's ever exposed elsewhere).
  return crypto.createHash("sha256").update(`admin-session:${s}`).digest("hex");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Signed cookie value for a session expiring `ADMIN_SESSION_MS` from now. */
export function signAdminSession(): string {
  const expiry = Date.now() + ADMIN_SESSION_MS;
  const payload = Buffer.from(String(expiry)).toString("base64");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = sign(payload);
  // Constant-time compare; lengths must match or timingSafeEqual throws.
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;
  const expiry = Number(Buffer.from(payload, "base64").toString("utf8"));
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;
  return true;
}

/** True when the request carries a valid, unexpired admin session cookie. */
export async function verifyAdminSession(): Promise<boolean> {
  try {
    const store = await cookies();
    return verifyToken(store.get(ADMIN_COOKIE)?.value);
  } catch {
    return false;
  }
}
