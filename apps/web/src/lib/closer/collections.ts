// ============================================================================
// Talking to the outstanding-balances endpoints.
//
// Every call goes through convexFetch, which attaches the session token. None
// of these take a closer id: the server works out who is asking from the
// session, so a request can't be edited to clear a teammate's balance.
// ============================================================================

import * as Sentry from "@sentry/nextjs";
import { convexFetch, CONVEX_SITE_URL } from "./client";

export interface OutstandingBalanceItem {
  callId: string;
  prospectName: string;
  closerName: string;
  closerId: string;
  cashCollected: number;
  contractValue: number;
  balance: number;
  closedAt: number;
  ageDays: number;
}

export interface OutstandingBalancesResponse {
  balances: OutstandingBalanceItem[];
  total: number;
  count: number;
  truncated: boolean;
}

async function post<T>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    console.error(`[Collections] ${path} failed:`, error);
    Sentry.captureException(error, {
      tags: { feature: "collections", integration: "convex" },
    });
    return null;
  }
}

/** What this closer has closed but not fully collected. */
export function getMyOutstandingBalances(): Promise<OutstandingBalancesResponse | null> {
  return post("/closer/collections/outstanding");
}

/**
 * Close a balance out.
 *
 * `settled` means the money arrived; `written_off` means it isn't going to.
 * The server checks the call belongs to whoever is asking.
 */
export function resolveBalance(
  callId: string,
  resolution: "settled" | "written_off",
): Promise<{ success: boolean; error?: string } | null> {
  return post("/closer/collections/resolve", { callId, resolution });
}
