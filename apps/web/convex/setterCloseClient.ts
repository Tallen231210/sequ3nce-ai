"use node";

// ============================================================================
// Setter Data — Close CRM REST API client.
//
// Authenticated fetch wrapper for Close's API. Unlike the GHL client
// (setterGhlClient.ts) there is NO OAuth/token lifecycle — Close uses a
// long-lived API key via HTTP Basic auth (key as username, blank password).
// So this client just takes the (decrypted) key directly.
//
//   - Basic auth per Close's docs: base64("<apiKey>:")
//   - 429 rate-limit retry honoring `rate_reset` (Close returns it in the
//     body / RateLimit header; limits are per-org + per-key)
//   - `_skip`/`_limit` pagination helper for list endpoints (Close list
//     responses carry `has_more`)
//
// Base: https://api.close.com/api/v1
// ============================================================================

const CLOSE_API_BASE = "https://api.close.com/api/v1";
const MAX_RATE_LIMIT_SLEEP_MS = 30_000;

export interface CloseFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

function authHeader(apiKey: string): string {
  // Basic auth: the API key is the username, password is always blank.
  return "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single authenticated Close API call. Returns parsed JSON on success,
 * throws with status + truncated body on any non-2xx after one 429 retry.
 */
export async function closeFetch<T>(
  apiKey: string,
  path: string,
  options: CloseFetchOptions = {},
): Promise<T> {
  const url = new URL(`${CLOSE_API_BASE}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers: {
        Authorization: authHeader(apiKey),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 429 && attempt === 0) {
      // Close returns `rate_reset` (seconds until the window resets).
      const text = await response.text();
      let resetSec = 5;
      try {
        const parsed = JSON.parse(text) as { rate_reset?: number };
        if (typeof parsed.rate_reset === "number") resetSec = parsed.rate_reset;
      } catch {
        /* fall through to default */
      }
      await sleep(Math.min(Math.ceil(resetSec * 1000) || 5000, MAX_RATE_LIMIT_SLEEP_MS));
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Close API ${response.status} ${response.statusText} on ${options.method ?? "GET"} ${path}: ${text.slice(0, 400)}`,
      );
    }

    return (await response.json()) as T;
  }

  throw new Error(`Close API call failed after retries: ${path}`);
}

interface CloseListResponse<T> {
  data: T[];
  has_more: boolean;
}

/**
 * Page a Close list endpoint via `_skip`/`_limit` until `has_more` is false
 * or `max` rows are collected. Callers should pass a date filter (e.g.
 * `date_created__gte`) for large collections — deep `_skip` gets slow, so the
 * windowed-backfill strategy relies on date filtering, not raw offset paging.
 */
export async function closePaginate<T = unknown>(
  apiKey: string,
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
  opts: { pageSize?: number; max?: number } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 100;
  const max = opts.max ?? Number.POSITIVE_INFINITY;
  const out: T[] = [];
  let skip = 0;

  while (out.length < max) {
    const page = await closeFetch<CloseListResponse<T>>(apiKey, path, {
      query: { ...query, _limit: pageSize, _skip: skip },
    });
    out.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    skip += page.data.length;
  }

  return out.length > max ? out.slice(0, max) : out;
}
