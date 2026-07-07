"use node";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { decryptApiKey } from "./lib/encrypt";

// ============================================================================
// Setter Data — GoHighLevel REST API client.
//
// Authenticated fetch wrapper used by sync actions (fastBackfill,
// deepBackfillStep, reconcile). Handles:
//   - Decrypting tokens at call time (never persists plaintext)
//   - Proactive refresh when access_token is within 60s of expiry
//   - Lazy refresh on 401 (token rotated mid-flight) + retry once
//   - 429 rate-limit retry honoring X-RateLimit-Interval-Milliseconds
//
// Pattern mirrors apps/web/convex/ghlActions.ts:31-45 but adapted for
// OAuth tokens (vs. the legacy API-key flow there).
// ============================================================================

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

// Refresh tokens proactively when they're within this many ms of expiring.
// Avoids in-flight 401s during long-running backfill operations.
const PROACTIVE_REFRESH_WINDOW_MS = 60_000;

// Cap rate-limit sleep — GHL's interval can theoretically be longer than
// we'd want to block an action for. After the cap we just fail and let
// the caller decide what to do.
const MAX_RATE_LIMIT_SLEEP_MS = 30_000;

export interface GhlFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

// ActionCtx shape — kept loose here because Convex's generated ActionCtx
// type doesn't cleanly cross file boundaries. The runtime contract is
// well-defined and stable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionCtx = any;

/**
 * Make an authenticated GHL API call. Returns parsed JSON on success,
 * throws on any non-2xx after retries are exhausted.
 *
 * Error semantics:
 *   - 401 after refresh failed → throw "Token refresh failed: ..." (caller
 *     should treat this as a fatal install-broken state — surface to UI)
 *   - 429 after retry failed → throw "Rate limit exceeded" (caller can
 *     back off + retry the operation)
 *   - 4xx other → throw with HTTP status + truncated body
 *   - 5xx → throw (caller can retry idempotent operations)
 *   - Network error → propagated as-is
 */
export async function ghlFetch<T>(
  ctx: ActionCtx,
  installationId: Id<"setterGhlInstallations">,
  path: string,
  options: GhlFetchOptions = {},
): Promise<T> {
  let accessToken = await getValidAccessToken(ctx, installationId);

  // Try the call. If it fails with a recoverable error, refresh + retry once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await rawFetch(accessToken, path, options);

    if (response.status === 401 && attempt === 0) {
      // Token rotated mid-flight or our cached value was stale. Refresh.
      const refreshResult = await ctx.runAction(
        internal.setterGhlOauthActions.refreshAccessToken,
        { installationId },
      );
      if (!refreshResult.success) {
        throw new Error(`GHL token refresh failed: ${refreshResult.error}`);
      }
      accessToken = refreshResult.accessToken;
      continue;
    }

    if (response.status === 429 && attempt === 0) {
      const intervalHeader = response.headers.get("X-RateLimit-Interval-Milliseconds");
      const sleepMs = Math.min(
        Number.parseInt(intervalHeader ?? "10000", 10) || 10_000,
        MAX_RATE_LIMIT_SLEEP_MS,
      );
      await sleep(sleepMs);
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `GHL API ${response.status} ${response.statusText} on ${options.method ?? "GET"} ${path}: ${text.slice(0, 500)}`,
      );
    }

    return (await response.json()) as T;
  }

  throw new Error(`GHL API call failed after retries: ${path}`);
}

/**
 * Look up the installation, return the (decrypted) access token. Performs
 * a proactive refresh if the token is within 60s of expiry — avoids the
 * cost of a failed 401 + reactive refresh during long backfills where
 * many calls happen back-to-back.
 */
async function getValidAccessToken(
  ctx: ActionCtx,
  installationId: Id<"setterGhlInstallations">,
): Promise<string> {
  const installation = await ctx.runQuery(
    internal.setterGhlOauth.getInstallationById,
    { installationId },
  );

  if (!installation) {
    throw new Error(`GHL installation not found: ${installationId}`);
  }
  // Only "uninstalled" is a hard stop. An install marked "error" may have
  // perfectly valid credentials (Remotestack 2026-07-06: a transient GHL
  // search flake marked the install errored; this guard then blocked every
  // retry with a generic message, making the error PERMANENT and clobbering
  // the specific root cause). Letting errored installs attempt real calls is
  // what enables the reconcile sweep to self-heal them — and when creds ARE
  // dead, the call fails with the SPECIFIC GHL error instead of this guard.
  if (installation.status === "uninstalled") {
    throw new Error(`GHL installation status is uninstalled — cannot make API calls`);
  }

  const now = Date.now();
  const msUntilExpiry = installation.expiresAt - now;

  if (msUntilExpiry < PROACTIVE_REFRESH_WINDOW_MS) {
    const refreshResult = await ctx.runAction(
      internal.setterGhlOauthActions.refreshAccessToken,
      { installationId },
    );
    if (!refreshResult.success) {
      throw new Error(`GHL proactive refresh failed: ${refreshResult.error}`);
    }
    return refreshResult.accessToken;
  }

  return decryptApiKey(installation.accessToken);
}

/**
 * Build the URL + send the request. Pure HTTP, no retry logic — that's
 * the caller's job. Tagged with the standard `Version` header per GHL's
 * API contract.
 */
async function rawFetch(
  accessToken: string,
  path: string,
  options: GhlFetchOptions,
): Promise<Response> {
  const url = new URL(`${GHL_API_BASE}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Version: GHL_API_VERSION,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
