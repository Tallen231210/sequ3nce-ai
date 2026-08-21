// ============================================================================
// Talking to the Fathom endpoints.
//
// Its own module rather than more weight on client.ts, which is already far
// past the size anything in this codebase should be.
//
// Every call goes through convexFetch, which attaches the session token. None
// of these take a closer id: the server works out who is asking from the
// session, so a request can't be edited to act as a teammate.
// ============================================================================

import * as Sentry from "@sentry/nextjs";
import { convexFetch, CONVEX_SITE_URL } from "./client";

export interface FathomStatus {
  /** Fathom is the Oversight plan's recorder; other plans use the bot. */
  availableOnPlan: boolean;
  connected: boolean;
  connectionId: string | null;
  /** Connected at the company level — this closer has nothing to do. */
  connectedBySomeoneElse: boolean;
  lastSyncedAt: number | null;
  errorMessage: string | null;
  /** The address on their Fathom account, if they've told us. */
  fathomEmail: string | null;
  email: string | null;
  /** Fathom accounts sending us recordings that match nobody on the team. */
  unmatchedRecorders: Array<{ email: string; count: number; lastSeenAt: number }>;
  /** Addresses someone has marked as "not a closer". Shown so it's reversible. */
  ignoredRecorders: string[];
  /** Opt-in for the daily "calls need an outcome" email. */
  outcomeRemindersEnabled: boolean;
}

export interface FathomSyncResult {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  error?: string;
}

async function post<T>(path: string, body: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    console.error(`[Fathom] ${path} failed:`, error);
    Sentry.captureException(error, {
      tags: { feature: "fathom", integration: "convex" },
    });
    return null;
  }
}

export function getFathomStatus(): Promise<FathomStatus | null> {
  return post<FathomStatus>("/closer/fathom/status");
}

/**
 * `teamWide` means "this key covers everyone", which is only true for a company
 * Fathom account. Defaults off — a personal key registered team-wide would put
 * one closer's Fathom in front of the whole team's calls.
 */
export function connectFathom(
  apiKey: string,
  teamWide = false,
): Promise<{ success: boolean; error?: string; scope?: string } | null> {
  return post("/closer/fathom/connect", { apiKey, teamWide });
}

export function disconnectFathom(): Promise<{ success: boolean } | null> {
  return post("/closer/fathom/disconnect");
}

export function setFathomEmail(
  fathomEmail: string,
): Promise<{ success: boolean; error?: string } | null> {
  return post("/closer/fathom/email", { fathomEmail });
}

export function syncFathomNow(): Promise<FathomSyncResult | null> {
  return post<FathomSyncResult>("/closer/fathom/sync");
}

/**
 * "Actually, this was / wasn't a sales call."
 *
 * The server checks the call belongs to whoever is asking — a closer must not
 * be able to move a teammate's numbers by passing someone else's call id.
 */
export function reclassifyFathomCall(
  callId: string,
  isSalesCall: boolean,
): Promise<{ success: boolean; error?: string } | null> {
  return post("/closer/fathom/reclassify", { callId, isSalesCall });
}

export interface OutcomeQueueItem {
  _id: string;
  prospectName: string;
  startedAt: number;
  duration?: number;
  externalShareUrl?: string;
  classifiedAs?: string;
  isHistorical: boolean;
}

/**
 * Calls waiting on the closer to say how they went.
 *
 * Without an outcome a call contributes nothing to close rate or revenue, so
 * this queue is the only thing standing between a Fathom-only team and an
 * empty scoreboard.
 */
export function getCallsNeedingOutcome(): Promise<{
  total: number;
  calls: OutcomeQueueItem[];
} | null> {
  return post("/closer/fathom/needsOutcome");
}

/**
 * "This Fathom account isn't one of our closers — stop flagging it."
 *
 * Common at companies running support and sales in one Fathom workspace: the
 * key legitimately sees recordings that are nobody's sales calls. Suppresses
 * the notice only; it never blocks a real closer's calls from arriving.
 */
export function ignoreRecorder(
  email: string,
  undo = false,
): Promise<{ success: boolean } | null> {
  return post("/closer/fathom/ignoreRecorder", { email, undo });
}

export function setOutcomeReminders(
  enabled: boolean,
): Promise<{ success: boolean } | null> {
  return post("/closer/fathom/reminders", { enabled });
}
