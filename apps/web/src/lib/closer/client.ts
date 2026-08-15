"use client";

// Convex client for the desktop app
// Using HTTP Action endpoint instead of WebSocket (more reliable in Electron)

import * as Sentry from "@sentry/nextjs";
import { getToken, getCloserInfo } from "./session";

// HTTP Action endpoint - hosted at .convex.site (not .convex.cloud)
export const CONVEX_SITE_URL = "https://ideal-ram-982.convex.site";

// ============================================================================
// convexFetch — circuit-breaker wrapper around fetch()
//
// Convex's prod backend has a 64-concurrent-action ceiling. When ALL pollers
// across all signed-in users saturate that, Convex returns 429 + body
// "TooManyConcurrentRequests" and EVERY new action (including auth + magic
// link sends) fails until pressure drops. The unrelented "retry on every
// interval" pattern in the polling sites kept the system saturated.
//
// This wrapper adds three safety nets transparently:
//   1. Jitter (0-50ms) on every outgoing call so a thundering herd of N
//      users hitting the same second smears out.
//   2. Circuit breaker — after a 429, refuse new calls for an exponential
//      backoff window (2s → 4s → 8s → ... 60s cap). Resets after 30s
//      without errors.
//   3. Detection works on BOTH 429 and 500-with-TooManyConcurrentRequests
//      response bodies (Convex returns either depending on the layer).
//
// Layered with usePoll (which adds backoff at the polling cadence level),
// this defends against saturation from any direction.
// ============================================================================

let consecutive429s = 0;
let lastFailureAt = 0;
const BREAKER_RESET_MS = 30_000;

/**
 * Adds the session token to any closer request that carries a JSON body.
 *
 * Doing it here rather than per function means all 75 calls authenticate
 * without a single call site changing — and when a route is converted to
 * session auth it starts being enforced with no client work at all.
 */
function withSession(init?: RequestInit): RequestInit | undefined {
  if (!init || typeof init.body !== "string") return init;
  const token = getToken();
  if (!token) return init;
  try {
    const parsed = JSON.parse(init.body) as Record<string, unknown>;
    return { ...init, body: JSON.stringify({ ...parsed, sessionToken: token }) };
  } catch {
    return init;
  }
}

export async function convexFetch(
  input: string,
  rawInit?: RequestInit,
): Promise<Response> {
  const init = withSession(rawInit);
  // Reset breaker if it's been quiet for BREAKER_RESET_MS
  if (consecutive429s > 0 && Date.now() - lastFailureAt > BREAKER_RESET_MS) {
    consecutive429s = 0;
  }

  // Apply circuit-breaker delay OR baseline jitter
  let delay: number;
  if (consecutive429s > 0) {
    const baseBackoff = Math.min(60_000, Math.pow(2, consecutive429s) * 1000);
    delay = baseBackoff + Math.random() * baseBackoff * 0.25;
  } else {
    delay = Math.random() * 50;
  }
  if (delay > 0) {
    await new Promise((r) => setTimeout(r, delay));
  }

  // Use globalThis.fetch explicitly to avoid recursion if any future
  // sed/codemod swaps `fetch` with `convexFetch` across the file.
  const response = await globalThis.fetch(input, init);

  // Detect Convex saturation. 429 is the canonical signal; some routes
  // surface it as a 500 with the message in the body.
  if (response.status === 429) {
    consecutive429s = Math.min(consecutive429s + 1, 8);
    lastFailureAt = Date.now();
  } else if (response.status >= 500) {
    try {
      const cloned = response.clone();
      const body = await cloned.text();
      if (body.includes("TooManyConcurrentRequests")) {
        consecutive429s = Math.min(consecutive429s + 1, 8);
        lastFailureAt = Date.now();
      }
    } catch {
      // Body read failed; treat as a normal 5xx without breaker bump.
    }
  } else if (response.ok) {
    consecutive429s = 0;
  }

  return response;
}

export interface CloserInfo {
  closerId: string;
  teamId: string;
  name: string;
  email: string;
  status: string;
  teamName?: string;
  /**
   * "bot" (or absent) is the full product. "fathom" is bring-your-own-
   * recording, where we never join the call — so features that depend on us
   * being in the room aren't part of what they bought.
   */
  productTier?: string;
}

export interface LinkCloserResult {
  closerId?: string;
  teamId?: string;
  name?: string;
  teamName?: string;
  alreadyLinked?: boolean;
  error?: string;
  message?: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  closer?: CloserInfo;
  /** Proof of login. Absent on the desktop build, which predates sessions. */
  sessionToken?: string;
}

// Choice returned to the closer when their email maps to multiple
// closer records (multi-team case). Renderer shows a picker; pick
// finalizes auth via pickCloserTeam.
export interface TeamChoice {
  closerId: string;
  teamId: string;
  teamName: string;
  status: string;
}

export type VerifyMagicLinkResult =
  | { success: true; kind: "signed_in"; closer: CloserInfo; sessionToken?: string }
  | { success: true; kind: "team_picker"; pickerToken: string; choices: TeamChoice[] }
  | { success: false; error: string };

// Login a closer with email and password
export async function loginCloser(email: string, password: string): Promise<LoginResult> {
  try {
    console.log("[Convex] Logging in closer:", email);

    // Add cache-busting query param to prevent Electron caching issues
    const response = await convexFetch(`${CONVEX_SITE_URL}/loginCloser?_=${Date.now()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify({ email, password }),
    });

    console.log("[Convex] Login response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[Convex] Login error response:", errorData);
      return { success: false, error: errorData.error || "Login failed" };
    }

    const result = await response.json();
    console.log("[Convex] Login result:", result);
    console.log("[Convex] result.success:", result.success, "result.closer:", !!result.closer);
    return result as LoginResult;
  } catch (error) {
    console.error("[Convex] Failed to login closer:", error);
    Sentry.captureException(error, {
      tags: { feature: "loginCloser", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

/**
 * Request a magic-link sign-in code by email. Closer receives a 6-digit
 * code + sequ3nce:// deep-link in their inbox. Single-use, 15-min expiry,
 * 60s resend cooldown enforced server-side.
 */
export async function requestMagicLink(
  email: string,
): Promise<{ success: boolean; error?: string; retryAfter?: number }> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/closer/magicLink/request?_=${Date.now()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ email }),
      },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || "Failed to send sign-in link",
      };
    }
    return (await response.json()) as {
      success: boolean;
      error?: string;
      retryAfter?: number;
    };
  } catch (error) {
    console.error("[Convex] requestMagicLink failed:", error);
    Sentry.captureException(error, {
      tags: { feature: "requestMagicLink", integration: "convex" },
    });
    return {
      success: false,
      error: "Network error. Please check your connection.",
    };
  }
}

/**
 * Verify a magic-link code. Returns a discriminated union:
 *   { kind: "signed_in", closer }          → sign in immediately
 *   { kind: "team_picker", pickerToken,
 *     choices }                            → closer is on multiple teams,
 *                                            show picker and call pickCloserTeam
 *   { success: false, error }              → invalid/expired/etc
 */
export async function verifyMagicLink(
  email: string,
  code: string,
): Promise<VerifyMagicLinkResult> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/closer/magicLink/verify?_=${Date.now()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ email, code }),
      },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || "Verification failed",
      };
    }
    return (await response.json()) as VerifyMagicLinkResult;
  } catch (error) {
    console.error("[Convex] verifyMagicLink failed:", error);
    Sentry.captureException(error, {
      tags: { feature: "verifyMagicLink", integration: "convex" },
    });
    return {
      success: false,
      error: "Network error. Please check your connection.",
    };
  }
}

/**
 * After verifyMagicLink returns kind: "team_picker", call this with the
 * pickerToken + the closerId the user chose. Returns CloserInfo for the
 * chosen team or an error (most commonly: token expired).
 */
export async function pickCloserTeam(
  pickerToken: string,
  closerId: string,
): Promise<LoginResult> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/closer/magicLink/pickTeam?_=${Date.now()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ pickerToken, closerId }),
      },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || "Team selection failed",
      };
    }
    return (await response.json()) as LoginResult;
  } catch (error) {
    console.error("[Convex] pickCloserTeam failed:", error);
    Sentry.captureException(error, {
      tags: { feature: "pickCloserTeam", integration: "convex" },
    });
    return {
      success: false,
      error: "Network error. Please check your connection.",
    };
  }
}

// Get closer info by email (for desktop app login)
// Uses HTTP Action endpoint - simple HTTP GET, no WebSocket needed
export async function getCloserByEmail(email: string): Promise<CloserInfo | null> {
  try {
    console.log("[Convex] Fetching closer by email:", email);

    const url = `${CONVEX_SITE_URL}/getCloserByEmail?email=${encodeURIComponent(email)}`;
    console.log("[Convex] Request URL:", url);

    const response = await convexFetch(url);

    console.log("[Convex] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Convex] Error response:", errorText);
      throw new Error(`HTTP error: ${response.status}`);
    }

    const result = await response.json();
    console.log("[Convex] Result:", result);
    return result as CloserInfo | null;
  } catch (error) {
    console.error("[Convex] Failed to get closer by email:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCloserByEmail", integration: "convex" },
    });
    return null;
  }
}

// Activate closer when they log in (changes status from pending to active)
export async function activateCloser(email: string): Promise<boolean> {
  try {
    console.log("[Convex] Activating closer:", email);

    const response = await convexFetch(`${CONVEX_SITE_URL}/activateCloser`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      console.error("[Convex] Failed to activate closer:", response.status);
      return false;
    }

    const result = await response.json();
    console.log("[Convex] Activation result:", result);
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to activate closer:", error);
    Sentry.captureException(error, {
      tags: { feature: "activateCloser", integration: "convex" },
    });
    return false;
  }
}

// Find a matching scheduled call for a closer within ±15 minutes
export interface ScheduledCallMatch {
  scheduledCallId: string;
  prospectName: string | null;
  prospectEmail: string | null;
  scheduledAt: number;
  source: string;
}

export async function findMatchingScheduledCall(
  closerId: string,
  teamId: string
): Promise<ScheduledCallMatch | null> {
  try {
    console.log("[Convex] Finding matching scheduled call for closer:", closerId);

    const url = `${CONVEX_SITE_URL}/findMatchingScheduledCall?closerId=${encodeURIComponent(closerId)}&teamId=${encodeURIComponent(teamId)}`;
    const response = await convexFetch(url);

    if (!response.ok) {
      console.error("[Convex] Error finding scheduled call:", response.status);
      return null;
    }

    const result = await response.json();
    console.log("[Convex] Scheduled call match result:", result);
    return result as ScheduledCallMatch | null;
  } catch (error) {
    console.error("[Convex] Failed to find matching scheduled call:", error);
    Sentry.captureException(error, {
      tags: { feature: "findMatchingScheduledCall", integration: "convex" },
    });
    return null;
  }
}

// Update prospect name on an existing call
export async function updateProspectName(data: {
  callId: string;
  prospectName: string;
  scheduledCallId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("[Convex] Updating prospect name:", data);

    const response = await convexFetch(`${CONVEX_SITE_URL}/updateProspectName`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      try {
        const errorData = await response.json();
        console.error("[Convex] Failed to update prospect name:", errorData);
        return { success: false, error: errorData.error || "Failed to update prospect name" };
      } catch {
        console.error("[Convex] Failed to update prospect name: HTTP", response.status);
        return { success: false, error: "Failed to update prospect name" };
      }
    }

    const result = await response.json();
    console.log("[Convex] Update prospect name result:", result);
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to update prospect name:", error);
    Sentry.captureException(error, {
      tags: { feature: "updateProspectName", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

// Complete call with post-call questionnaire data
export async function completeCallWithOutcome(data: {
  callId: string;
  prospectName: string;
  outcome: string;
  cashCollected?: number;
  contractValue?: number;
  dealValue?: number; // Legacy - kept for backward compat
  notes?: string;
  primaryObjection?: string;
  primaryObjectionOther?: string;
  objectionsOvercome?: string;
  objectionsOvercomeOther?: string;
  leadQualityScore?: number;
  prospectWasDecisionMaker?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("[Convex] Completing call with outcome:", data);

    const response = await convexFetch(`${CONVEX_SITE_URL}/completeCallWithOutcome`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      try {
        const errorData = await response.json();
        console.error("[Convex] Failed to complete call:", errorData);
        return { success: false, error: errorData.error || "Failed to complete call" };
      } catch {
        console.error("[Convex] Failed to complete call: HTTP", response.status);
        return { success: false, error: "Failed to complete call" };
      }
    }

    const result = await response.json();
    console.log("[Convex] Complete call result:", result);

    // Check if backend returned success
    if (result.success === false || result.error) {
      return { success: false, error: result.error || "Failed to complete call" };
    }

    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to complete call:", error);
    Sentry.captureException(error, {
      tags: { feature: "completeCallWithOutcome", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

// Get pending questionnaire info for a closer
export async function getPendingQuestionnaireInfo(closerId: string): Promise<{
  count: number;
  firstCallId?: string;
  firstProspectName?: string;
}> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getPendingQuestionnaireCount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });

    if (!response.ok) {
      return { count: 0 };
    }

    const data = await response.json();
    return {
      count: data.count || 0,
      firstCallId: data.firstCallId || undefined,
      firstProspectName: data.firstProspectName || undefined,
    };
  } catch (error) {
    console.error("[Convex] Failed to get pending questionnaires:", error);
    Sentry.captureException(error, {
      tags: { feature: "getPendingQuestionnaireInfo", integration: "convex" },
    });
    return { count: 0 };
  }
}

// Dismiss orphaned questionnaires (bots without linked call records)
export async function dismissOrphanedQuestionnaires(closerId: string): Promise<{ dismissed: number }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/dismissOrphanedQuestionnaires`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return { dismissed: 0 };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to dismiss orphaned questionnaires:", error);
    Sentry.captureException(error, {
      tags: { feature: "dismissOrphanedQuestionnaires", integration: "convex" },
    });
    return { dismissed: 0 };
  }
}

// Change closer password
export async function changePassword(
  closerId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("[Convex] Changing password for closer:", closerId);

    const response = await convexFetch(`${CONVEX_SITE_URL}/changePassword`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ closerId, currentPassword, newPassword }),
    });

    if (!response.ok) {
      try {
        const errorData = await response.json();
        return { success: false, error: errorData.error || "Failed to change password" };
      } catch {
        return { success: false, error: "Failed to change password" };
      }
    }

    const result = await response.json();
    if (!result.success) {
      return { success: false, error: result.error || "Failed to change password" };
    }

    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to change password:", error);
    Sentry.captureException(error, {
      tags: { feature: "changePassword", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// Log client error for remote debugging
export interface ClientErrorData {
  closerEmail?: string;
  errorType: string;
  errorMessage: string;
  errorStack?: string;
  appVersion?: string;
  platform?: string;
  osVersion?: string;
  architecture?: string;
  screenPermission?: string;
  microphonePermission?: string;
  captureStep?: string; // Which step failed (e.g., "getDisplayMedia", "getUserMedia", "audioContext")
  context?: string;
}

export async function logClientError(data: ClientErrorData): Promise<void> {
  try {
    console.log("[Convex] Logging client error:", data.errorType, data.errorMessage);

    // Fire and forget - don't wait for response
    fetch(`${CONVEX_SITE_URL}/logClientError`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).catch((err) => {
      // Silently fail - we don't want error logging to cause more errors
      console.error("[Convex] Failed to send error log:", err);
    });
  } catch (error) {
    // Silently fail
    console.error("[Convex] Failed to log client error:", error);
  }
}

// ==================== MEETING BOT ====================

// Check if meeting bot is enabled for a team
export async function isMeetingBotEnabled(teamId: string): Promise<boolean> {
  try {
    console.log("[Convex] Checking meeting bot enabled for team:", teamId);

    const response = await convexFetch(`${CONVEX_SITE_URL}/isMeetingBotEnabled`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ teamId }),
    });

    if (!response.ok) {
      console.error("[Convex] Error checking meeting bot:", response.status);
      return false;
    }

    const result = await response.json();
    console.log("[Convex] Meeting bot enabled:", result);
    return result.enabled === true;
  } catch (error) {
    console.error("[Convex] Failed to check meeting bot:", error);
    Sentry.captureException(error, {
      tags: { feature: "isMeetingBotEnabled", integration: "convex" },
    });
    return false;
  }
}

// Check if closer needs calendar onboarding
export async function needsCalendarOnboarding(closerId: string): Promise<boolean> {
  try {
    console.log("[Convex] Checking calendar onboarding for closer:", closerId);

    const response = await convexFetch(`${CONVEX_SITE_URL}/needsCalendarOnboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ closerId }),
    });

    if (!response.ok) {
      console.error("[Convex] Error checking calendar onboarding:", response.status);
      return false;
    }

    const result = await response.json();
    console.log("[Convex] Needs calendar onboarding:", result);
    return result.needsOnboarding === true;
  } catch (error) {
    console.error("[Convex] Failed to check calendar onboarding:", error);
    Sentry.captureException(error, {
      tags: { feature: "needsCalendarOnboarding", integration: "convex" },
    });
    return false;
  }
}

// Get active bot call for a closer
export interface ActiveBotCall {
  callId: string;
  visitorCallId: string;
  meetingTitle: string;
  prospectName: string | null;
  startedAt: number;
  meetingUrl: string;
}

// User manually ends call — writes "ended_by_user" to Convex so poll stops detecting it
export async function endCallManually(closerId: string): Promise<{ success: boolean }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/endCallManually`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return { success: false };
    return await response.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "endCallManually", integration: "convex" },
    });
    return { success: false };
  }
}

export async function getActiveCallForCloserBot(closerId: string): Promise<ActiveBotCall | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getActiveCallForCloserBot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ closerId }),
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    if (!result || !result.callId) return null;
    return result as ActiveBotCall;
  } catch (error) {
    // Silently fail — this is polled frequently
    return null;
  }
}

// ==================== BOT MANAGEMENT ====================

// Create bot for a scheduled meeting
export async function createBotForMeeting(
  closerId: string,
  teamId: string,
  meetingUrl: string,
  meetingTitle?: string,
  prospectName?: string,
  /**
   * Which calendar meeting this is.
   *
   * Sent so a closer clicking "Join & Record" on a meeting auto-join has
   * already booked reuses that bot instead of sending a second one into the
   * same call. Without it the server can only match on the meeting link, and
   * links get reused — one team runs fourteen meetings through a single
   * personal Zoom room.
   */
  calendarEventId?: string
): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/createBotForMeeting`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closerId,
        teamId,
        meetingUrl,
        meetingTitle,
        prospectName,
        calendarEventId,
      }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to create bot:", error);
    Sentry.captureException(error, {
      tags: { feature: "createBotForMeeting", integration: "convex" },
    });
    return false;
  }
}

// Create quick bot (ad-hoc meeting)
export async function createQuickBot(
  meetingUrl: string,
  closerId: string,
  teamId: string,
  prospectName?: string
): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/createQuickBot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingUrl, closerId, teamId, prospectName }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to create quick bot:", error);
    Sentry.captureException(error, {
      tags: { feature: "createQuickBot", integration: "convex" },
    });
    return false;
  }
}

// Cancel/kick bot from meeting
export async function cancelBot(botId: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/cancelBot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botId }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to cancel bot:", error);
    Sentry.captureException(error, {
      tags: { feature: "cancelBot", integration: "convex" },
    });
    return false;
  }
}

// Get upcoming bots for closer
export async function getUpcomingBotsForCloser(closerId: string): Promise<Record<string, unknown>[]> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getUpcomingBotsForCloser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : result.bots || [];
  } catch (error) {
    console.error("[Convex] Failed to get upcoming bots:", error);
    Sentry.captureException(error, {
      tags: { feature: "getUpcomingBotsForCloser", integration: "convex" },
    });
    return [];
  }
}

// Exclude a calendar event from auto-bot
export async function excludeCalendarEvent(
  closerId: string,
  calendarEventId: string,
  eventTitle?: string
): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/excludeCalendarEvent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, calendarEventId, eventTitle }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to exclude event:", error);
    Sentry.captureException(error, {
      tags: { feature: "excludeCalendarEvent", integration: "convex" },
    });
    return false;
  }
}

// Request reinforcement from team
export async function requestReinforcement(
  teamId: string,
  closerId: string,
  closerName: string,
  callId?: string,
  message?: string
): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/requestReinforcement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, closerId, closerName, callId, message }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to request reinforcement:", error);
    Sentry.captureException(error, {
      tags: { feature: "requestReinforcement", integration: "convex" },
    });
    return false;
  }
}

// Notify team call is going long
export async function callGoingLong(
  teamId: string,
  closerId: string,
  callId?: string,
  estimatedMinutes?: number
): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/callGoingLong`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, closerId, callId, estimatedMinutes }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to notify call going long:", error);
    Sentry.captureException(error, {
      tags: { feature: "callGoingLong", integration: "convex" },
    });
    return false;
  }
}

// Get transcript segments for a call
export interface TranscriptSegment {
  _id: string;
  callId?: string;
  speaker: string;
  text: string;
  timestamp: number;
  createdAt?: number;
}

export async function getTranscriptSegments(callId: string): Promise<TranscriptSegment[]> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getTranscriptSegments?callId=${encodeURIComponent(callId)}`);
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[Convex] Failed to get transcript:", error);
    Sentry.captureException(error, {
      tags: { feature: "getTranscriptSegments", integration: "convex" },
    });
    return [];
  }
}

// Ammo V2 analysis
export interface AmmoV2Analysis {
  engagement: {
    level: 'high' | 'medium' | 'low';
    reason: string;
  };
  beliefs: {
    problem: number;
    solution: number;
    vehicle: number;
    self: number;
    time: number;
    money: number;
    urgency: number;
  };
  objectionPrediction: Array<{
    type: string;
    probability: number;
  }>;
  painPoints: string[];
  liveSummary?: string;
  analyzedAt?: number;
}

export async function getAmmoAnalysis(callId: string): Promise<AmmoV2Analysis | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getAmmoAnalysis?callId=${encodeURIComponent(callId)}`);
    if (!response.ok) return null;
    const result = await response.json();
    if (result && result.engagement) return result;
    return null;
  } catch (error) {
    console.error("[Convex] Failed to get ammo analysis:", error);
    Sentry.captureException(error, {
      tags: { feature: "getAmmoAnalysis", integration: "convex" },
    });
    return null;
  }
}

// Check if Ammo V2 is enabled
export async function isAmmoV2Enabled(teamId: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/isAmmoV2Enabled?teamId=${encodeURIComponent(teamId)}`);
    if (!response.ok) return false;
    const result = await response.json();
    return result.enabled === true;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "isAmmoV2Enabled", integration: "convex" },
    });
    return false;
  }
}

// Update call notes
export async function updateCallNotes(callId: string, notes: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/updateCallNotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, notes }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to update notes:", error);
    Sentry.captureException(error, {
      tags: { feature: "updateCallNotes", integration: "convex" },
    });
    return false;
  }
}

// Get active resources for team
export interface TeamResource {
  _id: string;
  type: 'script' | 'payment_link' | 'document' | 'link';
  title: string;
  description?: string;
  content?: string;
  url?: string;
}

export async function getActiveResources(teamId: string): Promise<TeamResource[]> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getActiveResources?teamId=${encodeURIComponent(teamId)}`);
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[Convex] Failed to get resources:", error);
    Sentry.captureException(error, {
      tags: { feature: "getActiveResources", integration: "convex" },
    });
    return [];
  }
}

// Save meeting platform preference
export async function saveMeetingPlatform(closerId: string, platform: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/saveMeetingPlatform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, platform }),
    });
    return response.ok;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "saveMeetingPlatform", integration: "convex" },
    });
    return false;
  }
}

// Mark calendar onboarding as completed
export async function markOnboardingCompleted(closerId: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/markOnboardingCompleted`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    return response.ok;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "markOnboardingCompleted", integration: "convex" },
    });
    return false;
  }
}

// Connect calendar with ICS URL
export async function connectCalendar(
  email: string,
  teamId: string,
  icsUrl: string
): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/connectCalendarByEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, teamId, icsUrl }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to connect calendar:", error);
    Sentry.captureException(error, {
      tags: { feature: "connectCalendar", integration: "convex" },
    });
    return false;
  }
}

// Sync calendar events
export async function syncCalendar(email: string, teamId: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/syncCalendarByEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, teamId }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to sync calendar:", error);
    Sentry.captureException(error, {
      tags: { feature: "syncCalendar", integration: "convex" },
    });
    return false;
  }
}

// ==================== DASHBOARD + STATS ====================

// Closer dashboard stats (calls, close rate, cash, etc.)
export interface CloserStats {
  callsThisPeriod: number;
  closeRate: number;
  cashCollected: number;
  avgCallDuration: number;
  avgTalkRatio: number;
  totalContractValue: number;
  revenuePerCallCash: number;
  revenuePerCallContract: number;
  revenuePerSitCash: number;
  revenuePerSitContract: number;
  revenuePerCallTrend: number | null;
  revenuePerSitTrend: number | null;
  teamSize: number;
  teamAvgCloseRate: number;
  teamAvgCash: number;
  teamAvgCalls: number;
  teamAvgDuration: number;
  teamAvgTalkRatio: number;
  teamAvgRevenuePerCallCash: number;
  teamAvgRevenuePerCallContract: number;
  teamAvgRevenuePerSitCash: number;
  teamAvgRevenuePerSitContract: number;
}

export async function getCloserStats(closerId: string, period: string, customStart?: number | null, customEnd?: number | null): Promise<CloserStats | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getCloserStats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closerId, period,
        ...(customStart != null && customEnd != null ? { customStart, customEnd } : {}),
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get closer stats:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCloserStats", integration: "convex" },
    });
    return null;
  }
}

// Analytics summary (money overview)
export interface AnalyticsTrends {
  pitched: number;
  closed: number;
  leftOnTable: number;
  closeRate: number;
}

export interface AnalyticsSummary {
  totalPitched: number;
  totalClosed: number;
  leftOnTable: number;
  closeRate: number;
  totalCalls: number;
  closedCalls: number;
  lostOrFollowUpCalls: number;
  trends: AnalyticsTrends;
}

export async function getAnalyticsSummary(closerId: string, teamId: string, period: string, customStart?: number | null, customEnd?: number | null): Promise<AnalyticsSummary | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getCloserAnalyticsSummary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closerId, teamId, period,
        ...(customStart != null && customEnd != null ? { customStart, customEnd } : {}),
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get analytics summary:", error);
    Sentry.captureException(error, {
      tags: { feature: "getAnalyticsSummary", integration: "convex" },
    });
    return null;
  }
}

// Lost deals by objection
export interface ObjectionBreakdown {
  objection: string;
  objectionLabel: string;
  lostAmount: number;
  dealCount: number;
  trend: number;
}

export interface LostDealsData {
  objections: ObjectionBreakdown[];
  totalLost: number;
  totalDeals: number;
  problemAreas: string[];
}

export async function getLostDealsByObjection(closerId: string, teamId: string, period: string, customStart?: number | null, customEnd?: number | null): Promise<LostDealsData | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getCloserLostDeals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closerId, teamId, period,
        ...(customStart != null && customEnd != null ? { customStart, customEnd } : {}),
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get lost deals:", error);
    Sentry.captureException(error, {
      tags: { feature: "getLostDealsByObjection", integration: "convex" },
    });
    return null;
  }
}

// Objection analysis
export interface LostObjectionItem {
  objection: string;
  objectionLabel: string;
  count: number;
  value: number;
  overcomeRate?: number;
}

export interface OvercomeObjectionItem {
  objection: string;
  objectionLabel: string;
  count: number;
  value: number;
}

export interface ObjectionAnalysisData {
  lostObjections: LostObjectionItem[];
  overcomeObjections: OvercomeObjectionItem[];
  totalLostValue: number;
  totalClosedValue: number;
  insights: string[];
}

export async function getObjectionAnalysis(closerId: string, teamId: string, period: string, customStart?: number | null, customEnd?: number | null): Promise<ObjectionAnalysisData | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getCloserObjectionAnalysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closerId, teamId, period,
        ...(customStart != null && customEnd != null ? { customStart, customEnd } : {}),
      }),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get objection analysis:", error);
    Sentry.captureException(error, {
      tags: { feature: "getObjectionAnalysis", integration: "convex" },
    });
    return null;
  }
}

// Calendar events
export interface CalendarEvent {
  _id: string;
  uid: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  location?: string;
  isAllDay?: boolean;
  meetingUrl?: string;
  attendees?: Array<{ email: string; name?: string; isOrganizer?: boolean }>;
  // Multi-calendar B2B fields. Populated by sync from Google's per-event
  // colorId override or the calendar's backgroundColor default. Renderers
  // use these for color cues without doing palette math.
  calendarColor?: string;
  calendarLabel?: string;
  subscriptionId?: string;
}

export async function getCalendarEvents(
  email: string,
  teamId: string,
  startDate: number,
  endDate: number
): Promise<CalendarEvent[]> {
  try {
    const params = new URLSearchParams({
      email,
      teamId,
      startDate: String(startDate),
      endDate: String(endDate),
    });

    const response = await convexFetch(`${CONVEX_SITE_URL}/getCloserEventsByEmail?${params}`);

    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[Convex] Failed to get calendar events:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCalendarEvents", integration: "convex" },
    });
    return [];
  }
}

// ===========================================================================
// Pre-call briefing (Transcripts Roadmap Phase 3)
// ===========================================================================

export interface CloserBriefingResponse {
  matchedSetterLead: {
    setterLeadId: string;
    name?: string;
    email?: string;
    phone?: string;
    source?: string;
    tags: string[];
  } | null;
  transcript: {
    transcriptRowId: string;
    occurredAt: number;
    direction: "outbound" | "inbound";
    durationSec?: number;
    aiSummary?: string;
    setterTalkTimeSec?: number;
    prospectTalkTimeSec?: number;
    setterSpeakerIndex?: 0 | 1;
    hasFullTranscript: boolean;
  } | null;
  setterName: string | null;
  reason?:
    | "no_calendar_event"
    | "no_prospect_identity"
    | "no_matching_setter_lead"
    | "no_transcript_yet";
}

export async function getCloserBriefing(
  closerEmail: string,
  teamId: string,
  calendarEventId: string,
): Promise<CloserBriefingResponse | null> {
  try {
    const params = new URLSearchParams({
      closerEmail,
      teamId,
      calendarEventId,
    });
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/getCloserBriefing?${params}`,
    );
    if (!response.ok) return null;
    const result = await response.json();
    if (result && typeof result === "object" && "error" in result) {
      return null;
    }
    return result as CloserBriefingResponse;
  } catch (error) {
    console.error("[Convex] Failed to get closer briefing:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCloserBriefing", integration: "convex" },
    });
    return null;
  }
}

// Call analysis types (deep AI analysis with chapters + sales process scoring)
export interface CallChapter {
  title: string;
  startTime: number;  // seconds from call start
  endTime: number;
  summary: string;
}

export interface CallAnalysisDimension {
  score: string;  // "strong" | "adequate" | "weak"
  summary: string;
}

export interface CallAnalysis {
  chapters: CallChapter[];
  analysis: {
    opening: CallAnalysisDimension;
    discovery: CallAnalysisDimension;
    presentation: CallAnalysisDimension;
    objectionHandling: CallAnalysisDimension;
    closing: CallAnalysisDimension;
  };
  callSequence: { phase: string; description: string }[];
  analyzedAt: number;
}

// Call history
export interface CallHistoryItem {
  _id: string;
  prospectName: string;
  duration: number;
  outcome?: string;
  startedAt: number;
  closerName?: string;
  recordingUrl?: string;
  recordingType?: string;
  closerTalkTime?: number;
  prospectTalkTime?: number;
  summary?: string;
  transcriptText?: string;
  flaggedForReview?: boolean;
  reviewStatus?: string;
  commentCount?: number;
  cashCollected?: number;
  contractValue?: number;
  /** "ai" | "closer" | "manager" — absent on anything predating extraction. */
  outcomeSource?: string;
  callAnalysis?: CallAnalysis;
  endedAt?: number;
  /** "bot" or "fathom" — absent on everything recorded before Fathom existed. */
  source?: string;
  /** Fathom hosts the media; this is the only way to watch it back. */
  externalShareUrl?: string;
  classifiedAs?: string;
  classifiedBy?: string;
  countsTowardStats?: boolean;
  /** Pulled from Fathom history at connect, rather than arriving live. */
  isHistorical?: boolean;
}

export async function getCallHistory(closerId: string, limit?: number): Promise<CallHistoryItem[]> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getCallHistory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, limit: limit || 20 }),
    });

    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result.calls) ? result.calls : [];
  } catch (error) {
    console.error("[Convex] Failed to get call history:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCallHistory", integration: "convex" },
    });
    return [];
  }
}

// Fetch just the callAnalysis field for a single call (lightweight polling endpoint)
export async function getCallAnalysis(callId: string): Promise<CallAnalysis | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getCallAnalysis?callId=${encodeURIComponent(callId)}`);
    if (!response.ok) return null;
    const result = await response.json();
    return result.callAnalysis ?? null;
  } catch (error) {
    console.error("[Convex] Failed to get call analysis:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCallAnalysis", integration: "convex" },
    });
    return null;
  }
}

// ==================== SCHEDULE + CALENDAR ====================

// Calendar status
export interface CalendarStatus {
  closerId: string;
  connected: boolean;
  provider?: string | null; // "google" | "ics" | null
  icsUrl?: string;
  connectedAt?: number;
  lastSynced?: number;
}

export async function getCalendarStatus(email: string, teamId: string): Promise<CalendarStatus | null> {
  try {
    const params = new URLSearchParams({ email, teamId });
    const response = await convexFetch(`${CONVEX_SITE_URL}/getCloserCalendarStatusByEmail?${params}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get calendar status:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCalendarStatus", integration: "convex" },
    });
    return null;
  }
}

export async function disconnectCalendar(email: string, teamId: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/disconnectCalendarByEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, teamId }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to disconnect calendar:", error);
    Sentry.captureException(error, {
      tags: { feature: "disconnectCalendar", integration: "convex" },
    });
    return false;
  }
}

// ==================== MULTI-CALENDAR SUBSCRIPTIONS (B2B) ====================

export interface CalendarSubscription {
  _id: string;
  closerId: string;
  teamId: string;
  googleCalendarId: string;
  label: string;
  calendarBackgroundColor?: string;
  accessRole?: string;
  enabled: boolean;
  syncErrorCode?: string;
  lastSyncAt?: number;
  createdAt: number;
}

export interface AvailableCalendar {
  googleCalendarId: string;
  summary: string;
  backgroundColor: string | null;
  accessRole: string;
  primary: boolean;
  alreadySubscribed: boolean;
}

export async function listCalendarSubscriptions(
  email: string,
  teamId: string,
): Promise<CalendarSubscription[]> {
  try {
    const params = new URLSearchParams({ email, teamId });
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/listCalendarSubscriptionsByEmail?${params}`,
    );
    if (!response.ok) return [];
    const data = await response.json();
    return data.subscriptions ?? [];
  } catch (error) {
    console.error("[Convex] Failed to list calendar subscriptions:", error);
    Sentry.captureException(error, {
      tags: { feature: "listCalendarSubscriptions", integration: "convex" },
    });
    return [];
  }
}

export async function listAvailableGoogleCalendars(
  email: string,
  teamId: string,
): Promise<{
  ok: boolean;
  calendars?: AvailableCalendar[];
  error?: string;
  needsReauth?: boolean;
}> {
  try {
    const params = new URLSearchParams({ email, teamId });
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/listAvailableGoogleCalendarsByEmail?${params}`,
    );
    const data = await response.json();
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        error: data.error ?? "Failed to list available calendars",
        needsReauth: data.needsReauth === true,
      };
    }
    return { ok: true, calendars: data.calendars ?? [] };
  } catch (error) {
    console.error("[Convex] Failed to list available calendars:", error);
    Sentry.captureException(error, {
      tags: { feature: "listAvailableGoogleCalendars", integration: "convex" },
    });
    return { ok: false, error: "Network error" };
  }
}

export async function addCalendarSubscription(
  email: string,
  teamId: string,
  googleCalendarId: string,
  label: string,
  backgroundColor?: string,
  accessRole?: string,
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/addCalendarSubscriptionByEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        teamId,
        googleCalendarId,
        label,
        backgroundColor,
        accessRole,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error ?? "Failed to add subscription" };
    }
    return data;
  } catch (error) {
    console.error("[Convex] Failed to add calendar subscription:", error);
    Sentry.captureException(error, {
      tags: { feature: "addCalendarSubscription", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function removeCalendarSubscription(
  subscriptionId: string,
  email: string,
  teamId: string,
): Promise<{ success: boolean; eventsDeleted?: number; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/removeCalendarSubscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // email + teamId required for the ownership check (was unauthenticated
      // before the cleanup commit — anyone with a Convex doc id could delete
      // another closer's subscription).
      body: JSON.stringify({ subscriptionId, email, teamId }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error ?? "Failed to remove subscription" };
    }
    return data;
  } catch (error) {
    console.error("[Convex] Failed to remove calendar subscription:", error);
    Sentry.captureException(error, {
      tags: { feature: "removeCalendarSubscription", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function toggleCalendarSubscription(
  subscriptionId: string,
  enabled: boolean,
  email: string,
  teamId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/toggleCalendarSubscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // email + teamId required for the ownership check (same reason as
      // removeCalendarSubscription above).
      body: JSON.stringify({ subscriptionId, enabled, email, teamId }),
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error ?? "Failed to toggle subscription" };
    }
    return data;
  } catch (error) {
    console.error("[Convex] Failed to toggle calendar subscription:", error);
    Sentry.captureException(error, {
      tags: { feature: "toggleCalendarSubscription", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

// ==================== DIAGNOSTICS ====================

export async function submitDiagnosticReport(data: Record<string, unknown>): Promise<{ success: boolean; reportId?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/submitDiagnosticReport`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[Convex] Diagnostic report rejected:", response.status, errorBody);
      return { success: false, error: `Server error (${response.status})` };
    }
    const result = await response.json();
    return { success: true, reportId: result.reportId };
  } catch (error) {
    console.error("[Convex] Failed to submit diagnostics:", error);
    Sentry.captureException(error, {
      tags: { feature: "submitDiagnosticReport", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

// ==================== COACHING + FEEDBACK ====================

// Feedback call (call with manager comments)
export interface FeedbackCall {
  callId: string;
  prospectName: string;
  lastCommentAt: number;
  commentCount: number;
  latestCommentPreview?: string;
  isUnread: boolean;
}

export async function getFeedbackForCloser(closerId: string): Promise<FeedbackCall[]> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getFeedbackForCloser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : result.calls || [];
  } catch (error) {
    console.error("[Convex] Failed to get feedback:", error);
    Sentry.captureException(error, {
      tags: { feature: "getFeedbackForCloser", integration: "convex" },
    });
    return [];
  }
}

// Call comments
export interface CallComment {
  _id: string;
  content: string;
  authorType: string;
  authorName: string;
  authorId: string;
  timestampSeconds?: number;
  createdAt: number;
  parentCommentId?: string;
}

export async function getCommentsForCall(callId: string): Promise<CallComment[]> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getCommentsForCall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId }),
    });
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : result.comments || [];
  } catch (error) {
    console.error("[Convex] Failed to get comments:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCommentsForCall", integration: "convex" },
    });
    return [];
  }
}

export async function addCallComment(
  callId: string,
  content: string,
  authorType: string,
  authorName: string,
  authorId: string,
  timestampSeconds?: number,
  parentCommentId?: string
): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/addCallComment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, content, authorType, authorName, authorId, timestampSeconds, parentCommentId }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to add comment:", error);
    Sentry.captureException(error, {
      tags: { feature: "addCallComment", integration: "convex" },
    });
    return false;
  }
}

// Shared moments
export interface SharedMoment {
  callId: string;
  title: string;
  closerName?: string;
  startSeconds: number;
  endSeconds: number;
  notes?: string;
  createdAt: number;
}

export async function getSharedMoments(closerId: string): Promise<SharedMoment[]> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getSharedMoments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : result.moments || [];
  } catch (error) {
    console.error("[Convex] Failed to get shared moments:", error);
    Sentry.captureException(error, {
      tags: { feature: "getSharedMoments", integration: "convex" },
    });
    return [];
  }
}

// Unread counts
export async function getUnreadFeedbackCount(closerId: string): Promise<number> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getUnreadFeedbackCount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return 0;
    const result = await response.json();
    return result.count || 0;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getUnreadFeedbackCount", integration: "convex" },
    });
    return 0;
  }
}

export async function getUnreadSharedMomentsCount(closerId: string): Promise<number> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getUnreadSharedMomentsCount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return 0;
    const result = await response.json();
    return result.count || 0;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getUnreadSharedMomentsCount", integration: "convex" },
    });
    return 0;
  }
}

export async function markFeedbackRead(callId: string, closerId: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/markFeedbackRead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, closerId }),
    });
    return response.ok;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "markFeedbackRead", integration: "convex" },
    });
    return false;
  }
}

export async function markSharedMomentsSeen(closerId: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/markSharedMomentsSeen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    return response.ok;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "markSharedMomentsSeen", integration: "convex" },
    });
    return false;
  }
}

// ==================== CALL HISTORY + REVIEWS ====================

// Flag call for review
export async function flagCallForReview(callId: string, closerId: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/flagCallForReview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, closerId }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to flag call:", error);
    Sentry.captureException(error, {
      tags: { feature: "flagCallForReview", integration: "convex" },
    });
    return false;
  }
}

// Unflag call
export async function unflagCall(callId: string, closerId: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/unflagCall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, closerId }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to unflag call:", error);
    Sentry.captureException(error, {
      tags: { feature: "unflagCall", integration: "convex" },
    });
    return false;
  }
}

// Refresh recording URL (Recall.ai URLs expire ~24h)
export async function refreshRecordingUrl(callId: string): Promise<string | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/refreshRecordingUrl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return result.recordingUrl || null;
  } catch (error) {
    console.error("[Convex] Failed to refresh recording URL:", error);
    Sentry.captureException(error, {
      tags: { feature: "refreshRecordingUrl", integration: "convex" },
    });
    return null;
  }
}

// Create shared link for a call
export interface SharedLinkResult {
  token: string;
  url: string;
}

export async function createSharedLink(
  callId: string,
  closerId: string,
  teamId: string
): Promise<SharedLinkResult | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/createSharedLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId,
        teamId,
        shareType: "full",
        includeComments: false,
        createdBy: closerId,
        createdByType: "closer",
      }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    if (result.token && result.url) return result as SharedLinkResult;
    return null;
  } catch (error) {
    console.error("[Convex] Failed to create shared link:", error);
    Sentry.captureException(error, {
      tags: { feature: "createSharedLink", integration: "convex" },
    });
    return null;
  }
}

// Get ammo items for a call (legacy ammo)
export interface AmmoItem {
  _id: string;
  type: string;
  text: string;
  createdAt: number;
}

export async function getAmmoByCall(callId: string): Promise<AmmoItem[]> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getAmmoByCall?callId=${encodeURIComponent(callId)}`);
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[Convex] Failed to get ammo items:", error);
    Sentry.captureException(error, {
      tags: { feature: "getAmmoByCall", integration: "convex" },
    });
    return [];
  }
}

// ==================== ROLE PLAY ROOM ====================

export interface RolePlayRoomResponse {
  roomUrl: string;
  roomName: string;
}

export interface RolePlayRoomParticipant {
  closerId: string;
  userName: string;
  joinedAt: number;
}

// Get or create the team's role play room
export async function getOrCreateRolePlayRoom(teamId: string): Promise<RolePlayRoomResponse | null> {
  try {
    console.log("[Convex] Getting/creating role play room for team:", teamId);

    const response = await convexFetch(`${CONVEX_SITE_URL}/getOrCreateRolePlayRoom`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ teamId }),
    });

    if (!response.ok) {
      console.error("[Convex] Failed to get role play room: HTTP", response.status);
      return null;
    }

    const result = await response.json();
    console.log("[Convex] Role play room result:", result);
    return result as RolePlayRoomResponse;
  } catch (error) {
    console.error("[Convex] Failed to get role play room:", error);
    Sentry.captureException(error, {
      tags: { feature: "getOrCreateRolePlayRoom", integration: "convex" },
    });
    return null;
  }
}

// Join the role play room
export async function joinRolePlayRoom(
  teamId: string,
  closerId: string,
  userName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("[Convex] Joining role play room:", { teamId, closerId, userName });

    const response = await convexFetch(`${CONVEX_SITE_URL}/joinRolePlayRoom`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ teamId, closerId, userName }),
    });

    if (!response.ok) {
      try {
        const errorData = await response.json();
        return { success: false, error: errorData.error || "Failed to join room" };
      } catch {
        return { success: false, error: "Failed to join room" };
      }
    }

    const result = await response.json();
    console.log("[Convex] Join role play room result:", result);
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to join role play room:", error);
    Sentry.captureException(error, {
      tags: { feature: "joinRolePlayRoom", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

// Leave the role play room
export async function leaveRolePlayRoom(
  teamId: string,
  closerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("[Convex] Leaving role play room:", { teamId, closerId });

    const response = await convexFetch(`${CONVEX_SITE_URL}/leaveRolePlayRoom`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ teamId, closerId }),
    });

    if (!response.ok) {
      try {
        const errorData = await response.json();
        return { success: false, error: errorData.error || "Failed to leave room" };
      } catch {
        return { success: false, error: "Failed to leave room" };
      }
    }

    const result = await response.json();
    console.log("[Convex] Leave role play room result:", result);
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to leave role play room:", error);
    Sentry.captureException(error, {
      tags: { feature: "leaveRolePlayRoom", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

// Get current participants in the role play room
export async function getRolePlayRoomParticipants(teamId: string): Promise<RolePlayRoomParticipant[]> {
  try {
    const url = `${CONVEX_SITE_URL}/getRolePlayRoomParticipants?teamId=${encodeURIComponent(teamId)}`;
    const response = await convexFetch(url);

    if (!response.ok) {
      console.error("[Convex] Failed to get role play room participants:", response.status);
      return [];
    }

    const result = await response.json();
    return result as RolePlayRoomParticipant[];
  } catch (error) {
    console.error("[Convex] Failed to get role play room participants:", error);
    Sentry.captureException(error, {
      tags: { feature: "getRolePlayRoomParticipants", integration: "convex" },
    });
    return [];
  }
}

// ──────────────────────────────────────────────
// Chat / Messaging
// ──────────────────────────────────────────────

export interface ChatMessage {
  _id: string;
  teamId: string;
  senderType: 'closer' | 'manager';
  senderName: string;
  message: string;
  createdAt: number;
  isRead?: boolean;
}

export async function getMessagesForCloser(closerId: string, limit = 100): Promise<ChatMessage[]> {
  try {
    const url = `${CONVEX_SITE_URL}/getMessagesForCloser?closerId=${encodeURIComponent(closerId)}&limit=${limit}`;
    const response = await convexFetch(url);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get messages:", error);
    Sentry.captureException(error, {
      tags: { feature: "getMessagesForCloser", integration: "convex" },
    });
    return [];
  }
}

export async function sendMessageFromCloser(
  teamId: string,
  closerId: string,
  closerName: string,
  message: string
): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId,
        senderType: "closer",
        senderCloserId: closerId,
        senderName: closerName,
        recipientType: "manager",
        message,
      }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to send message:", error);
    Sentry.captureException(error, {
      tags: { feature: "sendMessageFromCloser", integration: "convex" },
    });
    return false;
  }
}

export async function markAllMessagesRead(closerId: string): Promise<void> {
  try {
    await convexFetch(`${CONVEX_SITE_URL}/markAllAsReadForCloser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
  } catch (error) {
    console.error("[Convex] Failed to mark messages as read:", error);
    Sentry.captureException(error, {
      tags: { feature: "markAllMessagesRead", integration: "convex" },
    });
  }
}

export async function getUnreadMessageCount(closerId: string): Promise<number> {
  try {
    const url = `${CONVEX_SITE_URL}/getUnreadCountForCloser?closerId=${encodeURIComponent(closerId)}`;
    const response = await convexFetch(url);
    if (!response.ok) return 0;
    const data = await response.json();
    return data.count || 0;
  } catch (error) {
    console.error("[Convex] Failed to get unread message count:", error);
    Sentry.captureException(error, {
      tags: { feature: "getUnreadMessageCount", integration: "convex" },
    });
    return 0;
  }
}

// ============================================================================
// Team Performance — the closer's own numbers.
//
// The board reports what closers submit, so these are the primary write path
// for the feature, not a supplement. Reads pre-fill the sheet from what the
// meeting bot recorded; nothing reaches a manager's board until the closer
// submits the day.
// ============================================================================

export interface PerfTotals {
  slots: number; booked: number; taken: number; offers: number;
  closes: number; cash: number; contractValue: number; missingOutcomes: number;
}

export interface SelfPerformance {
  monthKey: string;
  timezone: string;
  closerName: string;
  totals: PerfTotals;
  rates: {
    bookedPct: number | null; showPct: number | null;
    offerClosePct: number | null; closePct: number | null;
  };
  rag: Record<string, "green" | "amber" | "red" | "na">;
  targets: Record<string, number>;
  capacityReliable: boolean;
  avgCash: number | null;
  avgDeal: number | null;
  goal: number | null;
  pctGoal: number | null;
  daysSubmitted: number;
  daysElapsed: number;
  // The three below are returned by the API and read by the stats view, but
  // were missing from the desktop copy of this type. Nothing complained there
  // because the desktop build runs TypeScript with strict mode off. Shapes
  // taken from the live response.
  /** Cash per week of the month — five entries, W1 through W5. */
  weekCash: number[];
  projection: {
    collected: number;
    target: number;
    projectedCash: number;
    needPerDay: number;
    remaining: number;
    daysElapsed: number;
    daysLeft: number;
    pctOfTarget: number;
    onTrack: boolean;
    isFinal: boolean;
  } | null;
  /** Shared team prize, so this is the TEAM's cash against the target. */
  prize: {
    name: string;
    emoji: string;
    target: number;
    collected: number;
    remaining: number;
    pct: number;
    unlocked: boolean;
  } | null;
}

export interface DailyEntryRow {
  dayKey: string;
  measured: Record<string, number>;
  /** False when the bot recorded nothing — ask them to fill it in, not confirm. */
  measuredExists: boolean;
  reported: Record<string, number | undefined> | null;
  confirmedAt: number | null;
  managerCorrected: Record<string, number | undefined> | null;
}

export interface LeaderboardRow {
  closerId: string;
  name: string;
  isYou: boolean;
  booked: number; taken: number; offers: number; closes: number; cash: number;
  avgCash: number | null; avgDeal: number | null;
  showPct: number | null; closePct: number | null;
}

export async function getCloserPerformance(
  closerId: string,
  monthKey?: string,
): Promise<SelfPerformance | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getCloserPerformance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, ...(monthKey ? { monthKey } : {}) }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get closer performance:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCloserPerformance", integration: "convex" },
    });
    return null;
  }
}

export async function getCloserDailyEntries(
  closerId: string,
  monthKey: string,
): Promise<{ monthKey: string; todayKey: string; rows: DailyEntryRow[] } | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getCloserDailyEntries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, monthKey }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get daily entries:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCloserDailyEntries", integration: "convex" },
    });
    return null;
  }
}

/**
 * Submit one day. Passing no values still marks it submitted — confirming
 * that our numbers are right is the point of the confirm step, not a no-op.
 * Returns the server's message on failure so the closer can fix the value.
 */
export async function saveCloserDailyEntry(
  closerId: string,
  dayKey: string,
  values: Record<string, number | null>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/saveCloserDailyEntry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, dayKey, values }),
    });
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to save daily entry:", error);
    Sentry.captureException(error, {
      tags: { feature: "saveCloserDailyEntry", integration: "convex" },
    });
    return { success: false, error: "Couldn't reach the server. Try again." };
  }
}

export async function getTeamLeaderboardForCloser(
  closerId: string,
  monthKey?: string,
): Promise<{ monthKey: string; rows: LeaderboardRow[] } | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getTeamLeaderboardForCloser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, ...(monthKey ? { monthKey } : {}) }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get leaderboard:", error);
    Sentry.captureException(error, {
      tags: { feature: "getTeamLeaderboardForCloser", integration: "convex" },
    });
    return null;
  }
}

export interface YearMonthRow {
  monthKey: string;
  monthIndex: number;
  isCurrent: boolean;
  isFuture: boolean;
  hasData: boolean;
  totals: {
    slots: number; booked: number; taken: number; offers: number;
    closes: number; cash: number; contractValue: number;
  };
  rates: {
    bookedPct: number | null; showPct: number | null;
    offerPct: number | null; closePct: number | null;
  };
  daysSubmitted: number;
  daysInMonth: number;
  avgCash: number | null;
  avgDeal: number | null;
  goal: number | null;
  pctGoal: number | null;
  momPct: number | null;
}

export interface SelfYearPerformance {
  year: number;
  currentYear: number;
  months: YearMonthRow[];
  yearTotals: YearMonthRow["totals"];
  activeMonths: number;
  bestMonthKey: string | null;
  avgCashPerActiveMonth: number;
  truncated: boolean;
}

/** Twelve months of the closer's own reported numbers. */
export async function getCloserYearPerformance(
  closerId: string,
  year?: number,
): Promise<SelfYearPerformance | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/getCloserYearPerformance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, ...(typeof year === "number" ? { year } : {}) }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get year performance:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCloserYearPerformance", integration: "convex" },
    });
    return null;
  }
}

/**
 * Correct the outcome or money on one of your own calls.
 *
 * `null` clears a value and `undefined` leaves it untouched — the difference
 * matters, because a figure the AI got wrong should be blankable without having
 * to invent a replacement.
 */
export async function updateOwnCallFacts(
  callId: string,
  closerId: string,
  facts: {
    outcome?: string | null;
    cashCollected?: number | null;
    contractValue?: number | null;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/updateOwnCallFacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, closerId, ...facts }),
    });
    if (!response.ok) return { success: false, error: "Couldn't save that." };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to update call facts:", error);
    Sentry.captureException(error, { tags: { feature: "updateOwnCallFacts" } });
    return { success: false, error: "Couldn't save that." };
  }
}

export interface AutoJoinState {
  ok: boolean;
  enabled: boolean;
  available: boolean;
  hasCalendar: boolean;
  reason?: string;
}

/**
 * Read or change whether Sequ3nce joins this closer's meetings.
 *
 * Omit `enabled` to read. The route identifies the caller from their session —
 * it never takes a closerId as an instruction, because this switch decides
 * whether a bot sits in someone's calls.
 */
export async function getOrSetAutoJoin(
  enabled?: boolean,
): Promise<AutoJoinState | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/closer/autoJoin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enabled === undefined ? {} : { enabled }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to read/set auto-join:", error);
    Sentry.captureException(error, { tags: { feature: "autoJoinToggle" } });
    return null;
  }
}
