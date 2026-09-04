// Convex client for the Sequ3nce Personal (B2C) app
// Using HTTP Action endpoint instead of WebSocket (more reliable in Electron)

import * as Sentry from "@sentry/electron/renderer";

// HTTP Action endpoint - hosted at .convex.site (not .convex.cloud)
export const CONVEX_SITE_URL = "https://ideal-ram-982.convex.site";
const FREEHIRE_PERSONAL_SITE_URL =
  process.env.FREEHIRE_DEV_CONVEX_SITE_URL || CONVEX_SITE_URL;

// ============================================================================
// convexFetch — circuit-breaker wrapper around fetch()
//
// Mirror of the wrapper in apps/desktop/src/renderer/convex.ts. See that
// file for the architectural rationale. Personal and Desktop are forked
// siblings; the wrapper is identical so when one app gets a real fix,
// copy it to the other.
//
// Three safety nets:
//   1. Jitter (0-50ms) on every outgoing call.
//   2. Circuit breaker — after a 429, exponential backoff 2s → 60s; resets
//      after 30s without errors.
//   3. Detects both 429 and 500-with-TooManyConcurrentRequests bodies.
// ============================================================================

let consecutive429s = 0;
let lastFailureAt = 0;
const BREAKER_RESET_MS = 30_000;

export async function convexFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  if (consecutive429s > 0 && Date.now() - lastFailureAt > BREAKER_RESET_MS) {
    consecutive429s = 0;
  }

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

  // globalThis.fetch to avoid recursion if a future sed/codemod swaps
  // `fetch` for `convexFetch` across the file.
  const response = await globalThis.fetch(input, init);

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
      // Body read failed; treat as a normal 5xx.
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
  subscriptionStatus?: string; // "active" | "cancelled" | "past_due" | "none"
  b2cUserId?: string;
  role?: string;
  badges?: string[];
  trialExpiresAt?: number;
  onboardingCompleted?: boolean;
  pricingTier?: "early" | "standard";
  /** Bearer token minted by B2C login; private APIs derive identity from it. */
  sessionToken?: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  emailVerified?: boolean;
  closer?: CloserInfo;
}

export interface SignupResult {
  success: boolean;
  error?: string;
  b2cUserId?: string;
  closerId?: string;
  teamId?: string;
  name?: string;
  email?: string;
  subscriptionStatus?: string;
}

// Safe JSON response parser — returns default on non-JSON responses
async function safeJsonParse(response: Response, defaultError: string): Promise<{ error?: string; [key: string]: unknown }> {
  try {
    return await response.json();
  } catch {
    return { error: `${defaultError} (HTTP ${response.status})` };
  }
}

// Sign up a new B2C user
export async function signupB2CUser(
  email: string,
  phone: string,
  password: string,
  name: string
): Promise<SignupResult> {
  try {
    console.log("[Convex] Signing up B2C user");

    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/signup?_=${Date.now()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, phone, password, name }),
    });

    if (!response.ok) {
      const errorData = await safeJsonParse(response, "Signup failed");
      return { success: false, error: errorData.error as string || "Signup failed" };
    }

    const result = await response.json();
    return result as SignupResult;
  } catch (error) {
    console.error("[Convex] Failed to sign up:", error);
    Sentry.captureException(error, {
      tags: { feature: "signupB2CUser", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// Login a B2C user with email and password
export async function loginCloser(email: string, password: string): Promise<LoginResult> {
  try {
    console.log("[Convex] Logging in B2C user");

    // Add cache-busting query param to prevent Electron caching issues
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/login?_=${Date.now()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await safeJsonParse(response, "Login failed");
      return { success: false, error: errorData.error as string || "Login failed" };
    }

    const result = await response.json();
    return result as LoginResult;
  } catch (error) {
    console.error("[Convex] Failed to login:", error);
    Sentry.captureException(error, {
      tags: { feature: "loginCloser", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
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

// One call awaiting a human-confirmed disposition (AI-filled ones included —
// the leaderboard only fires from a closer-confirmed form submit).
export interface PendingDisposition {
  callId: string;
  prospectName: string | null;
  startedAt: number;
  duration: number;
  aiFilled: boolean;
}

// Pending dispositions for a closer — feeds the Calls badge and the
// "needs outcomes" banner. B2C-own endpoint; the legacy B2B
// getPendingQuestionnaireCount hard-returns 0 and must not be used.
export async function getPendingDispositions(closerId: string): Promise<{
  count: number;
  calls: PendingDisposition[];
}> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/pending-dispositions?closerId=${encodeURIComponent(closerId)}`
    );
    if (!response.ok) return { count: 0, calls: [] };
    const data = await response.json();
    return { count: data.count || 0, calls: data.calls || [] };
  } catch (error) {
    console.error("[Convex] Failed to get pending dispositions:", error);
    Sentry.captureException(error, {
      tags: { feature: "getPendingDispositions", integration: "convex" },
    });
    return { count: 0, calls: [] };
  }
}

// Current disposition fields for one call — prefills the post-call form
// with whatever the AI extraction already wrote.
export interface CallDisposition {
  outcome: string | null;
  outcomeSource: string | null;
  cashCollected: number | null;
  contractValue: number | null;
  pitchedValue: number | null;
  primaryObjection: string | null;
  objections: string[] | null;
  objectionsOvercome: string | null;
  leadQualityScore: number | null;
  prospectWasDecisionMaker: string | null;
  prospectName: string | null;
  notes: string | null;
}

export async function getCallDisposition(
  callId: string,
  closerId: string
): Promise<CallDisposition | null> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/call-disposition?callId=${encodeURIComponent(callId)}&closerId=${encodeURIComponent(closerId)}`
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get call disposition:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCallDisposition", integration: "convex" },
    });
    return null;
  }
}

// Request password reset (sends 6-digit code via email)
export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/forgot-password?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    if (!data.success) {
      return { success: false, error: data.error || "Failed to send reset code" };
    }
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to request password reset:", error);
    Sentry.captureException(error, {
      tags: { feature: "requestPasswordReset", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// Verify reset code and set new password
export async function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/reset-password?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, newPassword }),
    });

    const data = await response.json();
    if (!data.success) {
      return { success: false, error: data.error || "Failed to reset password" };
    }
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to reset password:", error);
    Sentry.captureException(error, {
      tags: { feature: "resetPasswordWithCode", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// Send email verification code
export async function sendVerificationCode(
  email: string
): Promise<{ success: boolean; error?: string; alreadyVerified?: boolean; retryAfter?: number }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/send-verification?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Convex] Failed to send verification code:", error);
    Sentry.captureException(error, {
      tags: { feature: "sendVerificationCode", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// Verify email with 6-digit code
export async function verifyEmail(
  email: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/verify-email?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Convex] Failed to verify email:", error);
    Sentry.captureException(error, {
      tags: { feature: "verifyEmail", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// Save onboarding questionnaire answers
export async function completeOnboarding(
  userId: string,
  source: string,
  income: string,
  struggle: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/onboarding?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, source, income, struggle }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to save onboarding" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to save onboarding:", error);
    Sentry.captureException(error, {
      tags: { feature: "completeOnboarding", integration: "convex" },
    });
    return { success: false, error: "Network error" };
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
  prospectName?: string
): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/createBotForMeeting`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, teamId, meetingUrl, meetingTitle, prospectName }),
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

// ==================== B2C RESOURCE MANAGEMENT ====================

// Add a new resource
export async function addResource(
  userId: string,
  type: string,
  title: string,
  description?: string,
  content?: string,
  url?: string
): Promise<{ resourceId?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/resources?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, type, title, description, content, url }),
    });
    if (!response.ok) {
      const data = await safeJsonParse(response, "Failed to add resource");
      return { error: data.error as string || "Failed to add resource" };
    }
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to add resource:", error);
    Sentry.captureException(error, {
      tags: { feature: "addResource", integration: "convex" },
    });
    return { error: "Network error. Please check your connection." };
  }
}

// Update an existing resource
export async function updateResource(
  userId: string,
  resourceId: string,
  updates: Partial<{ title: string; description: string; content: string; url: string }>
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/resources/update?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, resourceId, ...updates }),
    });
    if (!response.ok) {
      const data = await safeJsonParse(response, "Failed to update resource");
      return { error: data.error as string || "Failed to update resource" };
    }
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to update resource:", error);
    Sentry.captureException(error, {
      tags: { feature: "updateResource", integration: "convex" },
    });
    return { error: "Network error. Please check your connection." };
  }
}

// Delete a resource
export async function deleteResource(
  userId: string,
  resourceId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/resources/delete?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, resourceId }),
    });
    if (!response.ok) {
      const data = await safeJsonParse(response, "Failed to delete resource");
      return { error: data.error as string || "Failed to delete resource" };
    }
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to delete resource:", error);
    Sentry.captureException(error, {
      tags: { feature: "deleteResource", integration: "convex" },
    });
    return { error: "Network error. Please check your connection." };
  }
}

// Reorder resources
export async function reorderResources(
  userId: string,
  resourceIds: string[]
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/resources/reorder?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, resourceIds }),
    });
    if (!response.ok) {
      const data = await safeJsonParse(response, "Failed to reorder resources");
      return { error: data.error as string || "Failed to reorder resources" };
    }
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to reorder resources:", error);
    Sentry.captureException(error, {
      tags: { feature: "reorderResources", integration: "convex" },
    });
    return { error: "Network error. Please check your connection." };
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
  // Multi-calendar fields (B2C)
  calendarId?: string;
  calendarColor?: string;
  calendarLabel?: string;
  // When set, this event is a system-generated reference to a coaching call.
  // The Schedule Join handler routes to the in-app CoachingCallRoom overlay
  // instead of opening meetingUrl externally.
  coachingCallId?: string;
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
  callAnalysis?: CallAnalysis;
  endedAt?: number;
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
  linkId: string;
}

export async function createSharedLink(
  callId: string,
  closerId: string,
  teamId: string,
  options?: { accessType?: "full_access" | "compliance"; password?: string }
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
        accessType: options?.accessType,
        password: options?.password,
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

// Get all shared links for a call
export interface SharedLinkInfo {
  _id: string;
  token: string;
  shareType: string;
  includeComments: boolean;
  isActive: boolean;
  createdAt: number;
  accessType: string;
  hasPassword: boolean;
  url: string;
}

export async function getSharedLinksForCall(callId: string): Promise<SharedLinkInfo[]> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/getSharedLinksForCall?callId=${encodeURIComponent(callId)}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get shared links:", error);
    Sentry.captureException(error, {
      tags: { feature: "getSharedLinksForCall", integration: "convex" },
    });
    return [];
  }
}

// Revoke a shared link
export async function revokeSharedLink(linkId: string): Promise<boolean> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/revokeSharedLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to revoke shared link:", error);
    Sentry.captureException(error, {
      tags: { feature: "revokeSharedLink", integration: "convex" },
    });
    return false;
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

// ==================== B2C Profile API ====================

export interface B2CProfile {
  profileSlug: string | null;
  name: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  photoUrl: string | null;
  photoStorageId: string | null;
  industries: string[];
  ticketRange: string | null;
  skills: string[];
  socialLinks: {
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    website?: string;
    calendly?: string;
  } | null;
  isPublic: boolean;
  isAvailable: boolean;
  introVideoUrl: string | null;
  highlightReelUrl: string | null;
  whatsappNumber: string | null;
  autoStats: {
    callsCompleted: number;
    closeRate: number | null;
    cashCollected: number;
    avgDealSize: number | null;
    avgDuration: number | null;
    talkRatio: number | null;
  } | null;
  manualStats: {
    callsCompleted?: number;
    closeRate?: number;
    cashCollected?: number;
    avgDealSize?: number;
    avgDuration?: number;
    talkRatio?: number;
  } | null;
  statsSource: "auto" | "manual" | "combined";
  isManuallyVerified: boolean;
  createdAt: number | null;
  updatedAt: number | null;
}

export interface ProfileUpdateArgs {
  userId: string;
  headline?: string;
  bio?: string;
  location?: string;
  industries?: string[];
  ticketRange?: string;
  skills?: string[];
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    instagram?: string;
    website?: string;
    calendly?: string;
  };
  isPublic?: boolean;
  isAvailable?: boolean;
  introVideoUrl?: string;
  highlightReelUrl?: string;
  whatsappNumber?: string;
  manualStats?: {
    callsCompleted?: number;
    closeRate?: number;
    cashCollected?: number;
    avgDealSize?: number;
    avgDuration?: number;
    talkRatio?: number;
  };
  statsSource?: "auto" | "manual" | "combined";
}

export async function getMyProfile(userId: string): Promise<B2CProfile | null> {
  try {
    const url = `${CONVEX_SITE_URL}/b2c/profile?userId=${encodeURIComponent(userId)}&_=${Date.now()}`;
    const response = await convexFetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get profile:", error);
    Sentry.captureException(error, {
      tags: { feature: "getMyProfile", integration: "convex" },
    });
    return null;
  }
}

export async function upsertProfile(args: ProfileUpdateArgs): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/profile?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to save profile" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to upsert profile:", error);
    Sentry.captureException(error, {
      tags: { feature: "upsertProfile", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function generateProfileUploadUrl(userId: string): Promise<{ uploadUrl: string } | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/profile/upload-url?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to generate upload URL:", error);
    Sentry.captureException(error, {
      tags: { feature: "generateProfileUploadUrl", integration: "convex" },
    });
    return null;
  }
}

export async function saveProfilePhoto(
  userId: string,
  storageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/profile/photo?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, storageId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to save photo" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to save profile photo:", error);
    Sentry.captureException(error, {
      tags: { feature: "saveProfilePhoto", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function claimProfileSlug(
  userId: string,
  slug: string
): Promise<{ success: boolean; slug?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/profile/slug?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, slug }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to claim URL" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to claim profile slug:", error);
    Sentry.captureException(error, {
      tags: { feature: "claimProfileSlug", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// ==================== B2C Highlight Clips API ====================

export interface HighlightClip {
  _id: string;
  userId: string;
  callId: string;
  label: string;
  startTime: number;
  endTime: number;
  isFullCall: boolean;
  blurRegion: string; // "left" | "right" | "none"
  sortOrder: number;
  createdAt: number;
}

export async function getHighlightClips(userId: string): Promise<HighlightClip[]> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/highlight-clips?userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get highlight clips:", error);
    Sentry.captureException(error, {
      tags: { feature: "getHighlightClips", integration: "convex" },
    });
    return [];
  }
}

export async function getHighlightClipsByCall(callId: string): Promise<HighlightClip[]> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/highlight-clips/by-call?callId=${encodeURIComponent(callId)}&_=${Date.now()}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get clips by call:", error);
    Sentry.captureException(error, {
      tags: { feature: "getHighlightClipsByCall", integration: "convex" },
    });
    return [];
  }
}

export async function addHighlightClip(args: {
  userId: string;
  callId: string;
  label: string;
  startTime: number;
  endTime: number;
  isFullCall: boolean;
  blurRegion: string;
}): Promise<{ success: boolean; clipId?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/highlight-clips?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to add clip" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to add highlight clip:", error);
    Sentry.captureException(error, {
      tags: { feature: "addHighlightClip", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function updateHighlightClip(args: {
  clipId: string;
  userId: string;
  label?: string;
  startTime?: number;
  endTime?: number;
  isFullCall?: boolean;
  blurRegion?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/highlight-clips/update?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to update clip" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to update highlight clip:", error);
    Sentry.captureException(error, {
      tags: { feature: "updateHighlightClip", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function deleteHighlightClip(
  clipId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/highlight-clips/delete?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipId, userId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to delete clip" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to delete highlight clip:", error);
    Sentry.captureException(error, {
      tags: { feature: "deleteHighlightClip", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function reorderHighlightClips(
  userId: string,
  clipIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/highlight-clips/reorder?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, clipIds }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to reorder clips" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to reorder highlight clips:", error);
    Sentry.captureException(error, {
      tags: { feature: "reorderHighlightClips", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// ==================== B2C Highlight Sharing ====================

export interface HighlightShareInfo {
  _id: string;
  token: string;
  hasPassword: boolean;
  createdAt: number;
  isActive: boolean;
}

// Create a share link for a highlight clip
export async function createHighlightShare(
  clipId: string,
  userId: string,
  password?: string
): Promise<{ token?: string; shareId?: string; url?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/highlight-shares?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipId, userId, password: password || undefined }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create share link" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to create highlight share:", error);
    Sentry.captureException(error, {
      tags: { feature: "createHighlightShare", integration: "convex" },
    });
    return { error: "Network error. Please check your connection." };
  }
}

// Get active share links for a clip
export async function getHighlightSharesByClip(clipId: string): Promise<HighlightShareInfo[]> {
  try {
    const params = new URLSearchParams({ clipId, _: String(Date.now()) });
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/highlight-shares?${params}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.shares || [];
  } catch (error) {
    console.error("[Convex] Failed to get highlight shares:", error);
    Sentry.captureException(error, {
      tags: { feature: "getHighlightSharesByClip", integration: "convex" },
    });
    return [];
  }
}

// Revoke a highlight share link
export async function revokeHighlightShare(
  shareId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/highlight-shares/revoke?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareId, userId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to revoke share" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to revoke highlight share:", error);
    Sentry.captureException(error, {
      tags: { feature: "revokeHighlightShare", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// ==================== B2C Content Submissions API ====================

export interface ContentSubmission {
  _id: string;
  userId: string;
  type: "clip" | "testimonial";
  clipId?: string;
  label: string;
  category: string;
  note?: string;
  paymentHandle: string;
  paymentMethod: string;
  videoUrl?: string;
  status: "pending" | "approved" | "rejected" | "paid";
  reviewedAt?: number;
  rejectionReason?: string;
  paidAmount?: number;
  createdAt: number;
  submitterName?: string;
  submitterEmail?: string;
  recordingUrl?: string;
  startTime?: number;
  endTime?: number;
  blurRegion?: string;
}

export async function submitClipForContent(
  userId: string,
  clipId: string,
  category: string,
  paymentHandle: string,
  paymentMethod: string,
  consentGiven: boolean,
  note?: string
): Promise<{ success: boolean; submissionId?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/content/submit-clip?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, clipId, category, paymentHandle, paymentMethod, consentGiven, note }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to submit clip" };
    return { success: true, submissionId: data.submissionId };
  } catch (error) {
    console.error("[Convex] Failed to submit clip for content:", error);
    Sentry.captureException(error, {
      tags: { feature: "submitClipForContent", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function submitTestimonialForContent(
  userId: string,
  label: string,
  videoUrl: string,
  category: string,
  paymentHandle: string,
  paymentMethod: string,
  consentGiven: boolean,
  note?: string
): Promise<{ success: boolean; submissionId?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/content/submit-testimonial?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, label, videoUrl, category, paymentHandle, paymentMethod, consentGiven, note }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to submit testimonial" };
    return { success: true, submissionId: data.submissionId };
  } catch (error) {
    console.error("[Convex] Failed to submit testimonial for content:", error);
    Sentry.captureException(error, {
      tags: { feature: "submitTestimonialForContent", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function getMyContentSubmissions(userId: string): Promise<ContentSubmission[]> {
  try {
    const params = new URLSearchParams({ userId, _: String(Date.now()) });
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/content/my-submissions?${params}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.submissions || [];
  } catch (error) {
    console.error("[Convex] Failed to get content submissions:", error);
    Sentry.captureException(error, {
      tags: { feature: "getMyContentSubmissions", integration: "convex" },
    });
    return [];
  }
}

export async function getPendingContentSubmissions(
  reviewerUserId: string
): Promise<ContentSubmission[]> {
  try {
    const params = new URLSearchParams({ reviewerUserId, _: String(Date.now()) });
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/content/pending?${params}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.submissions || [];
  } catch (error) {
    console.error("[Convex] Failed to get pending content submissions:", error);
    Sentry.captureException(error, {
      tags: { feature: "getPendingContentSubmissions", integration: "convex" },
    });
    return [];
  }
}

export async function getAllContentSubmissions(
  reviewerUserId: string,
  status?: string
): Promise<ContentSubmission[]> {
  try {
    const params = new URLSearchParams({ reviewerUserId, _: String(Date.now()) });
    if (status) params.set("status", status);
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/content/all?${params}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.submissions || [];
  } catch (error) {
    console.error("[Convex] Failed to get all content submissions:", error);
    Sentry.captureException(error, {
      tags: { feature: "getAllContentSubmissions", integration: "convex" },
    });
    return [];
  }
}

export async function reviewContentSubmission(
  submissionId: string,
  reviewerUserId: string,
  action: "approve" | "reject",
  rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/content/review?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, reviewerUserId, action, rejectionReason }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to review submission" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to review content submission:", error);
    Sentry.captureException(error, {
      tags: { feature: "reviewContentSubmission", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function markContentSubmissionPaid(
  submissionId: string,
  reviewerUserId: string,
  paidAmount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/content/mark-paid?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, reviewerUserId, paidAmount }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to mark as paid" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to mark content submission paid:", error);
    Sentry.captureException(error, {
      tags: { feature: "markContentSubmissionPaid", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// ==================== B2C Community API ====================

export interface CommunityChannel {
  _id: string;
  slug: string;
  name: string;
  description: string;
  icon?: string;
  order: number;
  postCount: number;
  lastActivityAt?: number;
}

export interface CommunityPost {
  _id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  body: string;
  visibility?: string; // "everyone" (default) | "friends"
  likeCount: number;
  commentCount: number;
  isPinned: boolean;
  isLikedByMe: boolean;
  reactionCounts: Record<string, number>;
  myReactions: string[];
  channelName?: string;
  channelSlug?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CommunityComment {
  _id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  body: string;
  parentCommentId?: string;
  likeCount: number;
  isLikedByMe: boolean;
  reactionCounts: Record<string, number>;
  myReactions: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CommunityMember {
  userId: string;
  name: string;
  profileSlug: string | null;
  headline: string | null;
  location: string | null;
  industries: string[];
  photoUrl: string | null;
  createdAt: number;
}

// ==================== Friendship Types ====================

export interface FriendItem {
  friendshipId: string;
  userId: string;
  name: string;
  headline: string | null;
  location: string | null;
  photoUrl: string | null;
  acceptedAt: number;
}

export interface FriendRequest {
  friendshipId: string;
  requesterId: string;
  name: string;
  headline: string | null;
  photoUrl: string | null;
  createdAt: number;
}

export type FriendshipStatus = "none" | "pending_sent" | "pending_received" | "accepted";

// ==================== Training Types ====================

export interface TrainingModule {
  _id: string;
  title: string;
  description?: string;
  thumbnailUrl: string | null;
  order: number;
  lessonCount: number;
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TrainingLesson {
  _id: string;
  moduleId: string;
  title: string;
  description?: string;
  videoUrl: string;
  durationSeconds?: number;
  order: number;
  isPublished: boolean;
  createdAt: number;
  updatedAt: number;
}

// ==================== Training API ====================

export async function getTrainingModules(): Promise<TrainingModule[]> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/training/modules?_=${Date.now()}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get training modules:", error);
    Sentry.captureException(error, {
      tags: { feature: "getTrainingModules", integration: "convex" },
    });
    return [];
  }
}

export async function getTrainingLessons(moduleId: string): Promise<TrainingLesson[]> {
  try {
    const params = new URLSearchParams({ moduleId });
    params.set("_", String(Date.now()));
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/training/lessons?${params}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get training lessons:", error);
    Sentry.captureException(error, {
      tags: { feature: "getTrainingLessons", integration: "convex" },
    });
    return [];
  }
}

// ==================== Community API ====================

export async function getCommunityChannels(userId?: string): Promise<CommunityChannel[]> {
  try {
    // userId unlocks VIP-only channels (The Inner Circle) server-side.
    const uid = userId ? `&userId=${encodeURIComponent(userId)}` : "";
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/channels?_=${Date.now()}${uid}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get channels:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCommunityChannels", integration: "convex" },
    });
    return [];
  }
}

export async function getFeedPosts(
  userId?: string,
  limit?: number,
  cursor?: number,
  friendsOnly?: boolean
): Promise<{ posts: CommunityPost[]; nextCursor: number | null }> {
  try {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));
    if (friendsOnly) params.set("friendsOnly", "true");
    params.set("_", String(Date.now()));

    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/feed?${params}`);
    if (!response.ok) return { posts: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get feed:", error);
    Sentry.captureException(error, {
      tags: { feature: "getFeedPosts", integration: "convex" },
    });
    return { posts: [], nextCursor: null };
  }
}

export async function getChannelPosts(
  channelId: string,
  userId?: string,
  limit?: number,
  cursor?: number
): Promise<{ posts: CommunityPost[]; nextCursor: number | null }> {
  try {
    const params = new URLSearchParams({ channelId });
    if (userId) params.set("userId", userId);
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));
    params.set("_", String(Date.now()));

    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/posts?${params}`);
    if (!response.ok) return { posts: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get channel posts:", error);
    Sentry.captureException(error, {
      tags: { feature: "getChannelPosts", integration: "convex" },
    });
    return { posts: [], nextCursor: null };
  }
}

export async function getNewPostCount(since: number): Promise<number> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/community/new-count?since=${since}&_=${Date.now()}`
    );
    if (!response.ok) return 0;
    const data = await response.json();
    return data.count || 0;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getNewPostCount", integration: "convex" },
    });
    return 0;
  }
}

export async function createCommunityPost(
  userId: string,
  channelId: string,
  body: string,
  visibility?: string
): Promise<{ postId?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/posts?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, channelId, body, visibility }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create post" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to create post:", error);
    Sentry.captureException(error, {
      tags: { feature: "createCommunityPost", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function editCommunityPost(
  userId: string,
  postId: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/post/edit?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postId, body }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to edit post" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to edit post:", error);
    Sentry.captureException(error, {
      tags: { feature: "editCommunityPost", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function deleteCommunityPost(
  userId: string,
  postId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/post/delete?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to delete post" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to delete post:", error);
    Sentry.captureException(error, {
      tags: { feature: "deleteCommunityPost", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function togglePostLike(
  userId: string,
  postId: string
): Promise<{ liked?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/post/like?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to toggle like" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to toggle like:", error);
    Sentry.captureException(error, {
      tags: { feature: "togglePostLike", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getPostComments(
  postId: string,
  userId?: string,
  cursor?: number,
  limit?: number
): Promise<{ comments: CommunityComment[]; nextCursor: number | null }> {
  try {
    const params = new URLSearchParams({ postId });
    if (userId) params.set("userId", userId);
    if (cursor) params.set("cursor", String(cursor));
    if (limit) params.set("limit", String(limit));
    params.set("_", String(Date.now()));

    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/comments?${params}`);
    if (!response.ok) return { comments: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get comments:", error);
    Sentry.captureException(error, {
      tags: { feature: "getPostComments", integration: "convex" },
    });
    return { comments: [], nextCursor: null };
  }
}

export async function createPostComment(
  userId: string,
  postId: string,
  body: string,
  parentCommentId?: string
): Promise<{ commentId?: string; error?: string }> {
  try {
    const payload: Record<string, string> = { userId, postId, body };
    if (parentCommentId) payload.parentCommentId = parentCommentId;
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/comments?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create comment" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to create comment:", error);
    Sentry.captureException(error, {
      tags: { feature: "createPostComment", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function editPostComment(
  userId: string,
  commentId: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/comment/edit?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, commentId, body }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to edit comment" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to edit comment:", error);
    Sentry.captureException(error, {
      tags: { feature: "editPostComment", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function deletePostComment(
  userId: string,
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/comment/delete?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, commentId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to delete comment" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to delete comment:", error);
    Sentry.captureException(error, {
      tags: { feature: "deletePostComment", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function toggleCommentLike(
  userId: string,
  commentId: string
): Promise<{ liked?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/comment/like?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, commentId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to toggle like" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to toggle like:", error);
    Sentry.captureException(error, {
      tags: { feature: "toggleCommentLike", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

// ==================== Direct Messages ====================

export interface DMThread {
  _id: string;
  // Null for team-notification threads (no real "other user").
  otherUserId: string | null;
  otherUserName: string;
  otherUserPhotoUrl: string | null;
  lastMessageAt: number;
  lastMessagePreview: string | null;
  unreadCount: number;
  createdAt: number;
  // Team-notification additions (defaults for legacy rows):
  senderType?: "user" | "team";
  repliesAllowed?: boolean;
}

export interface DMMessage {
  _id: string;
  threadId: string;
  senderId: string;
  body: string;
  isRead: boolean;
  isDeleted: boolean;
  createdAt: number;
  // Set when the message was sent as "Sequ3nce Team" by a founder.
  teamSentBy?: string | null;
}

export async function getDMThreads(
  userId: string,
  limit?: number,
  cursor?: number
): Promise<{ threads: DMThread[]; nextCursor: number | null }> {
  try {
    const params = new URLSearchParams({ userId, _: String(Date.now()) });
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));

    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/dm/threads?${params}`);
    if (!response.ok) return { threads: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get DM threads:", error);
    Sentry.captureException(error, {
      tags: { feature: "getDMThreads", integration: "convex" },
    });
    return { threads: [], nextCursor: null };
  }
}

export async function getDMMessages(
  userId: string,
  threadId: string,
  limit?: number,
  cursor?: number
): Promise<{ messages: DMMessage[]; nextCursor: number | null }> {
  try {
    const params = new URLSearchParams({ userId, threadId, _: String(Date.now()) });
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));

    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/dm/messages?${params}`);
    if (!response.ok) return { messages: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get DM messages:", error);
    Sentry.captureException(error, {
      tags: { feature: "getDMMessages", integration: "convex" },
    });
    return { messages: [], nextCursor: null };
  }
}

export async function getDMUnreadCount(userId: string): Promise<number> {
  try {
    const params = new URLSearchParams({ userId, _: String(Date.now()) });
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/dm/unread-count?${params}`);
    if (!response.ok) return 0;
    const data = await response.json();
    return data.count ?? 0;
  } catch (error) {
    console.error("[Convex] Failed to get DM unread count:", error);
    Sentry.captureException(error, {
      tags: { feature: "getDMUnreadCount", integration: "convex" },
    });
    return 0;
  }
}

export async function sendDM(
  senderId: string,
  recipientId: string,
  body: string
): Promise<{ messageId?: string; threadId?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/dm/send?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, recipientId, body }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to send message" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to send DM:", error);
    Sentry.captureException(error, {
      tags: { feature: "sendDM", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function markDMThreadRead(
  userId: string,
  threadId: string
): Promise<void> {
  try {
    await convexFetch(`${CONVEX_SITE_URL}/b2c/dm/mark-read?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, threadId }),
    });
  } catch (error) {
    console.error("[Convex] Failed to mark thread read:", error);
    Sentry.captureException(error, {
      tags: { feature: "markDMThreadRead", integration: "convex" },
    });
  }
}

export async function deleteDMMessage(
  userId: string,
  messageId: string
): Promise<{ error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/dm/delete?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, messageId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to delete message" };
    return {};
  } catch (error) {
    console.error("[Convex] Failed to delete DM:", error);
    Sentry.captureException(error, {
      tags: { feature: "deleteDMMessage", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

// ==================== ONLINE PRESENCE ====================

// Send heartbeat to update online presence
export async function sendHeartbeat(userId: string): Promise<void> {
  try {
    await convexFetch(`${CONVEX_SITE_URL}/b2c/heartbeat?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
  } catch (error) {
    // Silently fail — heartbeat is best-effort
    console.error("[Convex] Heartbeat failed:", error);
  }
}

// Get IDs of currently online users
export async function getOnlineUserIds(): Promise<string[]> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/online-users?_=${Date.now()}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.onlineIds || [];
  } catch (error) {
    console.error("[Convex] Failed to get online users:", error);
    Sentry.captureException(error, {
      tags: { feature: "getOnlineUserIds", integration: "convex" },
    });
    return [];
  }
}

export async function getCommunityMembers(
  limit?: number,
  search?: string,
  cursor?: number,
  // Founder-only surfaces (the notification recipient picker) pass true so
  // flagged QA accounts stay addressable; member-facing surfaces never do.
  includeTest?: boolean,
  // Lets the server apply test-viewer cloaking rules (test accounts see
  // each other; real members never see them).
  viewerId?: string
): Promise<{ members: CommunityMember[]; nextCursor: number | null }> {
  try {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (search) params.set("search", search);
    if (cursor) params.set("cursor", String(cursor));
    if (includeTest) params.set("includeTest", "1");
    if (viewerId) params.set("viewerId", viewerId);
    params.set("_", String(Date.now()));

    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/members?${params}`);
    if (!response.ok) return { members: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get members:", error);
    Sentry.captureException(error, {
      tags: { feature: "getCommunityMembers", integration: "convex" },
    });
    return { members: [], nextCursor: null };
  }
}

// ==================== Reaction Functions ====================

export async function addReaction(
  userId: string,
  targetType: string,
  targetId: string,
  emoji: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/reaction/add?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, targetType, targetId, emoji }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to add reaction" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to add reaction:", error);
    Sentry.captureException(error, {
      tags: { feature: "addReaction", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function removeReaction(
  userId: string,
  targetType: string,
  targetId: string,
  emoji: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/reaction/remove?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, targetType, targetId, emoji }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to remove reaction" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to remove reaction:", error);
    Sentry.captureException(error, {
      tags: { feature: "removeReaction", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

// ==================== Channel Read State Functions ====================

export async function markChannelRead(
  userId: string,
  channelId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/channel/mark-read?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, channelId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to mark channel read" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to mark channel read:", error);
    Sentry.captureException(error, {
      tags: { feature: "markChannelRead", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getUnreadChannels(
  userId: string
): Promise<{ unreadChannelIds: string[] }> {
  try {
    const params = new URLSearchParams({ userId, _: String(Date.now()) });
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/channel/unread?${params}`);
    if (!response.ok) return { unreadChannelIds: [] };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get unread channels:", error);
    Sentry.captureException(error, {
      tags: { feature: "getUnreadChannels", integration: "convex" },
    });
    return { unreadChannelIds: [] };
  }
}

// ==================== Pin Functions ====================

export async function pinCommunityPost(
  userId: string,
  postId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/post/pin?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to pin post" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to pin post:", error);
    Sentry.captureException(error, {
      tags: { feature: "pinCommunityPost", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function unpinCommunityPost(
  userId: string,
  postId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/post/unpin?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to unpin post" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to unpin post:", error);
    Sentry.captureException(error, {
      tags: { feature: "unpinCommunityPost", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

// ==================== Search Functions ====================

export async function searchCommunityPosts(
  query: string,
  channelId?: string,
  cursor?: number,
  limit?: number,
  userId?: string
): Promise<{ posts: CommunityPost[]; nextCursor: number | null }> {
  try {
    const params = new URLSearchParams({ q: query, _: String(Date.now()) });
    if (channelId) params.set("channelId", channelId);
    if (cursor) params.set("cursor", String(cursor));
    if (limit) params.set("limit", String(limit));
    if (userId) params.set("userId", userId); // unlocks Inner Circle results for VIP
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/community/search?${params}`);
    if (!response.ok) return { posts: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to search posts:", error);
    Sentry.captureException(error, {
      tags: { feature: "searchCommunityPosts", integration: "convex" },
    });
    return { posts: [], nextCursor: null };
  }
}

// ==================== DM Typing Functions ====================

export async function setDMTyping(
  userId: string,
  threadId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/dm/typing?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, threadId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to set typing" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to set typing:", error);
    Sentry.captureException(error, {
      tags: { feature: "setDMTyping", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getDMTypingUsers(
  userId: string,
  threadId: string
): Promise<{ users: { userId: string; userName: string }[] }> {
  try {
    const params = new URLSearchParams({ userId, threadId, _: String(Date.now()) });
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/dm/typing?${params}`);
    if (!response.ok) return { users: [] };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get typing users:", error);
    Sentry.captureException(error, {
      tags: { feature: "getDMTypingUsers", integration: "convex" },
    });
    return { users: [] };
  }
}

// ==================== Friendship Functions ====================

export async function getFriends(
  userId: string,
  limit?: number,
  cursor?: number
): Promise<{ friends: FriendItem[]; nextCursor: number | null }> {
  try {
    const params = new URLSearchParams({ userId });
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));
    params.set("_", String(Date.now()));

    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/friends?${params}`);
    if (!response.ok) return { friends: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get friends:", error);
    Sentry.captureException(error, {
      tags: { feature: "getFriends", integration: "convex" },
    });
    return { friends: [], nextCursor: null };
  }
}

export async function getIncomingFriendRequests(
  userId: string
): Promise<{ requests: FriendRequest[] }> {
  try {
    const params = new URLSearchParams({ userId, _: String(Date.now()) });
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/friends/requests?${params}`);
    if (!response.ok) return { requests: [] };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get friend requests:", error);
    Sentry.captureException(error, {
      tags: { feature: "getIncomingFriendRequests", integration: "convex" },
    });
    return { requests: [] };
  }
}

export async function getPendingFriendRequestCount(
  userId: string
): Promise<number> {
  try {
    const params = new URLSearchParams({ userId, _: String(Date.now()) });
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/friends/request-count?${params}`);
    if (!response.ok) return 0;
    const data = await response.json();
    return data.count || 0;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getPendingFriendRequestCount", integration: "convex" },
    });
    return 0;
  }
}

export async function getFriendshipStatus(
  userId: string,
  otherUserId: string
): Promise<FriendshipStatus> {
  try {
    const params = new URLSearchParams({ userId, otherUserId, _: String(Date.now()) });
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/friends/status?${params}`);
    if (!response.ok) return "none";
    const data = await response.json();
    return data.status || "none";
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getFriendshipStatus", integration: "convex" },
    });
    return "none";
  }
}

export async function sendFriendRequest(
  requesterId: string,
  recipientId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/friends/request?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId, recipientId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to send request" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to send friend request:", error);
    Sentry.captureException(error, {
      tags: { feature: "sendFriendRequest", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function acceptFriendRequest(
  userId: string,
  requesterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/friends/accept?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, requesterId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to accept" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to accept friend request:", error);
    Sentry.captureException(error, {
      tags: { feature: "acceptFriendRequest", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function declineFriendRequest(
  userId: string,
  requesterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/friends/decline?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, requesterId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to decline" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to decline friend request:", error);
    Sentry.captureException(error, {
      tags: { feature: "declineFriendRequest", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function removeFriend(
  userId: string,
  friendId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/friends/remove?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, friendId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to remove" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to remove friend:", error);
    Sentry.captureException(error, {
      tags: { feature: "removeFriend", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

// ==================== Job Board ====================

export interface JobPosting {
  _id: string;
  teamId: string;
  teamName?: string;
  title: string;
  description: string;
  industry?: string;
  ticketRange?: string;
  ote?: string;
  requiredSkills?: string[];
  contactEmail?: string;
  contactUrl?: string;
  status: string;
  interestCount: number;
  createdAt: number;
}

export interface JobInterest {
  _id: string;
  jobPostingId: string;
  posting?: JobPosting;
  createdAt: number;
}

export async function getOpenJobPostings(filters?: {
  industry?: string;
  ticketRange?: string;
  limit?: number;
}): Promise<JobPosting[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.industry) params.set("industry", filters.industry);
    if (filters?.ticketRange) params.set("ticketRange", filters.ticketRange);
    if (filters?.limit) params.set("limit", String(filters.limit));
    params.set("_", String(Date.now()));

    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/jobs/open?${params}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to load job postings:", error);
    Sentry.captureException(error, {
      tags: { feature: "getOpenJobPostings", integration: "convex" },
    });
    return [];
  }
}

export async function getJobPosting(postingId: string): Promise<JobPosting | null> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/jobs/posting?postingId=${encodeURIComponent(postingId)}&_=${Date.now()}`
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to load job posting:", error);
    Sentry.captureException(error, {
      tags: { feature: "getJobPosting", integration: "convex" },
    });
    return null;
  }
}

export async function getInterestStatus(
  postingId: string,
  userId: string
): Promise<{ interested: boolean }> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/jobs/interest-status?postingId=${encodeURIComponent(postingId)}&userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    if (!response.ok) return { interested: false };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to check interest status:", error);
    Sentry.captureException(error, {
      tags: { feature: "getInterestStatus", integration: "convex" },
    });
    return { interested: false };
  }
}

export async function getMyJobInterests(userId: string): Promise<JobInterest[]> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/jobs/my-interests?userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to load interests:", error);
    Sentry.captureException(error, {
      tags: { feature: "getMyJobInterests", integration: "convex" },
    });
    return [];
  }
}

export async function expressJobInterest(
  postingId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/jobs/express-interest?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postingId, userId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to express interest" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to express interest:", error);
    Sentry.captureException(error, {
      tags: { feature: "expressJobInterest", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function withdrawJobInterest(
  postingId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/jobs/withdraw-interest?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postingId, userId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to withdraw" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to withdraw interest:", error);
    Sentry.captureException(error, {
      tags: { feature: "withdrawJobInterest", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function toggleAvailability(
  userId: string,
  isAvailable: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/profile/toggle-availability?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isAvailable }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to toggle" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to toggle availability:", error);
    Sentry.captureException(error, {
      tags: { feature: "toggleAvailability", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

// ==================== B2C Billing / Stripe ====================

/** Create a Stripe Checkout session for B2C subscription with 45-day trial */
export async function createB2CCheckout(
  email: string,
  b2cUserId: string
): Promise<{ url?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/create-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, b2cUserId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create checkout" };
    return { url: data.url };
  } catch (error) {
    console.error("[Convex] Failed to create B2C checkout:", error);
    Sentry.captureException(error, {
      tags: { feature: "createB2CCheckout", integration: "convex" },
    });
    return { error: "Network error. Please check your connection." };
  }
}

/** Create a Stripe Customer Portal session for subscription management */
export async function createB2CPortal(
  b2cUserId: string
): Promise<{ url?: string; error?: string }> {
  try {
    // Polar customer portal (B2C moved off Stripe 2026-08-19).
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/polar-portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ b2cUserId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create portal" };
    return { url: data.url };
  } catch (error) {
    console.error("[Convex] Failed to create B2C portal:", error);
    Sentry.captureException(error, {
      tags: { feature: "createB2CPortal", integration: "convex" },
    });
    return { error: "Network error. Please check your connection." };
  }
}

// ==================== B2C Weekly Contest API ====================

export interface WeeklyContest {
  _id: string;
  title: string;
  description?: string;
  prizeAmount: number;
  status: string;
  winnerId?: string;
  winnerSubmissionId?: string;
  weekStartDate: string;
  weekEndDate: string;
  createdAt: number;
  winnerName?: string;
  winnerSubmissionTitle?: string;
}

export interface WeeklySubmission {
  _id: string;
  contestId: string;
  userId: string;
  type: string;
  clipId?: string;
  shareUrl?: string;
  title: string;
  voteCount: number;
  createdAt: number;
  submitterName?: string;
  recordingUrl?: string;
}

export async function createWeeklyContest(
  createdBy: string,
  title: string,
  description: string | undefined,
  prizeAmount: number,
  weekStartDate: string,
  weekEndDate: string
): Promise<{ contestId?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/contest/create?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ createdBy, title, description, prizeAmount, weekStartDate, weekEndDate }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create contest" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to create weekly contest:", error);
    Sentry.captureException(error, {
      tags: { feature: "createWeeklyContest", integration: "convex" },
    });
    return { error: "Network error. Please check your connection." };
  }
}

export async function getActiveContest(): Promise<WeeklyContest | null> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/contest/active?_=${Date.now()}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get active contest:", error);
    Sentry.captureException(error, {
      tags: { feature: "getActiveContest", integration: "convex" },
    });
    return null;
  }
}

export async function getContestSubmissions(contestId: string): Promise<WeeklySubmission[]> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/contest/submissions?contestId=${encodeURIComponent(contestId)}&_=${Date.now()}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get contest submissions:", error);
    Sentry.captureException(error, {
      tags: { feature: "getContestSubmissions", integration: "convex" },
    });
    return [];
  }
}

export async function submitContestEntry(
  userId: string,
  contestId: string,
  type: string,
  title: string,
  clipId?: string,
  shareUrl?: string
): Promise<{ submissionId?: string; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/contest/submit?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, contestId, type, title, clipId, shareUrl }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to submit entry" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to submit contest entry:", error);
    Sentry.captureException(error, {
      tags: { feature: "submitContestEntry", integration: "convex" },
    });
    return { error: "Network error. Please check your connection." };
  }
}

export async function castContestVote(
  userId: string,
  contestId: string,
  submissionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/contest/vote?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, contestId, submissionId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to cast vote" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to cast contest vote:", error);
    Sentry.captureException(error, {
      tags: { feature: "castContestVote", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function removeContestVote(
  userId: string,
  contestId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/contest/remove-vote?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, contestId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to remove vote" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to remove contest vote:", error);
    Sentry.captureException(error, {
      tags: { feature: "removeContestVote", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function getMyContestSubmission(
  contestId: string,
  userId: string
): Promise<WeeklySubmission | null> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/contest/my-submission?contestId=${encodeURIComponent(contestId)}&userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get my contest submission:", error);
    Sentry.captureException(error, {
      tags: { feature: "getMyContestSubmission", integration: "convex" },
    });
    return null;
  }
}

export async function getMyContestVote(
  contestId: string,
  userId: string
): Promise<{ _id: string; submissionId: string } | null> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/contest/my-vote?contestId=${encodeURIComponent(contestId)}&userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get my contest vote:", error);
    Sentry.captureException(error, {
      tags: { feature: "getMyContestVote", integration: "convex" },
    });
    return null;
  }
}

export async function getPastContests(): Promise<WeeklyContest[]> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/contest/history?_=${Date.now()}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get past contests:", error);
    Sentry.captureException(error, {
      tags: { feature: "getPastContests", integration: "convex" },
    });
    return [];
  }
}

export async function completeWeeklyContest(
  contestId: string,
  reviewerUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/contest/complete?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contestId, reviewerUserId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to complete contest" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to complete weekly contest:", error);
    Sentry.captureException(error, {
      tags: { feature: "completeWeeklyContest", integration: "convex" },
    });
    return { success: false, error: "Network error. Please check your connection." };
  }
}

/** Poll subscription status (used after checkout to detect activation) */
export async function getSubscriptionStatus(
  userId: string
): Promise<{ subscriptionStatus: string; stripeCustomerId?: string; error?: string }> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/subscription-status?userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    const data = await response.json();
    if (!response.ok) return { subscriptionStatus: "none", error: data.error };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to get subscription status:", error);
    Sentry.captureException(error, {
      tags: { feature: "getSubscriptionStatus", integration: "convex" },
    });
    return { subscriptionStatus: "none", error: "Network error" };
  }
}

// Hydrate missing session fields (b2cUserId) for users whose cached localStorage
// predates the b2cUserId field. Returns null on any error so the caller can fall
// back to cached state without surfacing a scary UX failure.
export async function resolveSessionByEmail(
  email: string
): Promise<{ b2cUserId: string | null; subscriptionStatus: string | null } | null> {
  try {
    const response = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/session/resolve?email=${encodeURIComponent(email)}&_=${Date.now()}`
    );
    if (!response.ok) return null;
    const data = await response.json();
    if ('error' in data) return null;
    return data;
  } catch (error) {
    console.error("[Convex] Failed to resolve session:", error);
    Sentry.captureException(error, {
      tags: { feature: "resolveSessionByEmail", integration: "convex" },
    });
    return null;
  }
}

// ==================== B2C MULTI-CALENDAR ====================

export interface B2cCalendar {
  _id: string;
  closerId: string;
  teamId: string;
  label: string;
  color: string;
  provider: string;
  googleEmail?: string;
  isEnabled: boolean;
  lastSyncAt?: number;
  syncError?: string;
  createdAt: number;
}

export async function syncAllB2cCalendars(closerId: string): Promise<{ synced?: number; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/calendars/sync-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "syncAllB2cCalendars", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getB2cCalendars(closerId: string): Promise<B2cCalendar[]> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/calendars?closerId=${encodeURIComponent(closerId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.calendars || [];
  } catch (error) {
    console.error("[Convex] Failed to get calendars:", error);
    Sentry.captureException(error, {
      tags: { feature: "getB2cCalendars", integration: "convex" },
    });
    return [];
  }
}

export async function addB2cCalendar(
  closerId: string,
  teamId: string,
  label: string,
  provider: string,
  opts?: { googleRefreshToken?: string; googleEmail?: string }
): Promise<{ id?: string; color?: string; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/calendars`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closerId, teamId, label, provider,
        ...opts,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Failed to add calendar" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to add calendar:", error);
    Sentry.captureException(error, {
      tags: { feature: "addB2cCalendar", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function removeB2cCalendar(
  calendarId: string,
  closerId: string
): Promise<{ deleted?: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/calendars/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId, closerId }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Failed to remove calendar" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to remove calendar:", error);
    Sentry.captureException(error, {
      tags: { feature: "removeB2cCalendar", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function updateB2cCalendar(
  calendarId: string,
  closerId: string,
  updates: { label?: string; color?: string; isEnabled?: boolean }
): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/calendars/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId, closerId, ...updates }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Failed to update calendar" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to update calendar:", error);
    Sentry.captureException(error, {
      tags: { feature: "updateB2cCalendar", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

// ==================== B2C FEATURE REQUESTS ====================

export interface FeatureRequest {
  _id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  status: string;
  upvoteCount: number;
  commentCount: number;
  hasVoted: boolean;
  createdAt: number;
  updatedAt: number;
}

export async function getFeatureRequests(
  userId: string,
  sortBy: string = "popular"
): Promise<FeatureRequest[]> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/feature-requests?userId=${encodeURIComponent(userId)}&sortBy=${sortBy}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.requests || [];
  } catch (error) {
    console.error("[Convex] Failed to get feature requests:", error);
    Sentry.captureException(error, {
      tags: { feature: "getFeatureRequests", integration: "convex" },
    });
    return [];
  }
}

export async function createFeatureRequest(
  userId: string,
  title: string,
  description: string
): Promise<{ id?: string; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/feature-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title, description }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Failed to create request" };
    return data;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "createFeatureRequest", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function upvoteFeatureRequest(
  userId: string,
  requestId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/feature-requests/upvote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, requestId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "upvoteFeatureRequest", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function removeFeatureRequestUpvote(
  userId: string,
  requestId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/feature-requests/remove-upvote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, requestId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "removeFeatureRequestUpvote", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function updateFeatureRequestStatus(
  userId: string,
  requestId: string,
  status: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/feature-requests/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, requestId, status }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "updateFeatureRequestStatus", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

// ==================== B2C BUG REPORTS ====================

export interface BugReport {
  _id: string;
  authorId: string;
  whatHappened: string;
  whatWereDoing: string;
  whichScreen: string;
  status: string;
  createdAt: number;
}

export async function submitBugReport(args: {
  authorId: string;
  authorEmail: string;
  whatHappened: string;
  whatWereDoing: string;
  whichScreen: string;
  appVersion?: string;
  platform?: string;
}): Promise<{ id?: string; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/bug-reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Failed to submit report" };
    return data;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "submitBugReport", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getMyBugReports(authorId: string): Promise<BugReport[]> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/bug-reports?authorId=${encodeURIComponent(authorId)}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.reports || [];
  } catch (error) {
    console.error("[Convex] Failed to get bug reports:", error);
    Sentry.captureException(error, {
      tags: { feature: "getMyBugReports", integration: "convex" },
    });
    return [];
  }
}

// ==================== B2C PUBLIC JOB BOARD ====================

export interface PublicJob {
  _id: string;
  vipOnly?: boolean;
  companyName: string;
  title: string;
  location: string;
  salaryRange?: string;
  industry: string;
  description?: string;
  applyUrl: string;
  source?: string;
  status: string;
  // Bulk-import fields (May 2026 — VA-scraped batch). Optional because
  // older rows added through the manual form may not have them set.
  remote?: boolean;
  jobType?: string;
  experienceLevel?: string;
  datePosted?: number;
  createdAt: number;
  tracking: {
    saved: boolean;
    applied: boolean;
    interviewed: boolean;
  } | null;
}

export interface PublicJobsResult {
  jobs: PublicJob[];
  /** Partner roles behind the VIP wall — shown as a locked count to non-VIP. */
  partnerRoleCount: number;
  vipViewer: boolean;
}

export async function getPublicJobs(userId: string, industry?: string): Promise<PublicJobsResult> {
  try {
    let url = `${CONVEX_SITE_URL}/b2c/public-jobs?userId=${encodeURIComponent(userId)}`;
    if (industry) url += `&industry=${encodeURIComponent(industry)}`;
    const res = await convexFetch(url);
    if (!res.ok) return { jobs: [], partnerRoleCount: 0, vipViewer: false };
    const data = await res.json();
    return {
      jobs: data.jobs || [],
      partnerRoleCount: data.partnerRoleCount ?? 0,
      vipViewer: data.vipViewer === true,
    };
  } catch (error) {
    console.error("[Convex] Failed to get public jobs:", error);
    Sentry.captureException(error, {
      tags: { feature: "getPublicJobs", integration: "convex" },
    });
    return { jobs: [], partnerRoleCount: 0, vipViewer: false };
  }
}

export async function addPublicJob(args: {
  userId: string;
  companyName: string;
  title: string;
  location: string;
  salaryRange?: string;
  industry: string;
  description?: string;
  applyUrl: string;
  source?: string;
}): Promise<{ id?: string; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/public-jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Failed to add job" };
    return data;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "addPublicJob", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function closePublicJob(userId: string, jobId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/public-jobs/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, jobId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "closePublicJob", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function deletePublicJob(userId: string, jobId: string): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/public-jobs/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, jobId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "deletePublicJob", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function updateJobTracking(
  userId: string,
  jobId: string,
  updates: { saved?: boolean; applied?: boolean; interviewed?: boolean }
): Promise<{ id?: string; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/public-jobs/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, jobId, ...updates }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "updateJobTracking", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

// ==================== App-version telemetry ====================

/**
 * Tell the server which app version + platform this session runs. Fired
 * after login, signup, and session restore. Fire-and-forget: it can never
 * block the app, and it grants nothing server-side.
 */
export async function reportAppVersion(info: CloserInfo): Promise<void> {
  try {
    const [appVersion, platformInfo] = await Promise.all([
      window.electron.app.getVersion(),
      window.electron.app.getPlatform(),
    ]);
    await convexFetch(`${CONVEX_SITE_URL}/b2c/app-version`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionToken: (info as { sessionToken?: string }).sessionToken,
        userId: info.b2cUserId,
        appVersion,
        platform: platformInfo.platform,
      }),
    });
  } catch {
    // Telemetry only — never surface.
  }
}

// ==================== Remote feature flags ====================

/**
 * Per-user flag decisions from the server. Any failure returns null and the
 * caller falls back to the legacy experience — flags can only ever ADD the
 * new UI, never take the app down.
 */
export async function getFeatureFlags(
  sessionToken: string | undefined,
): Promise<Record<string, boolean> | null> {
  // Always ask, even with no token: flags in "all" mode need no identity,
  // and sessions from before login tokens existed would otherwise be stuck
  // on legacy UI forever (bitten 2026-09-03 — the co-founder's session).
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/feature-flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: sessionToken ?? "" }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data && typeof data.flags === "object" ? data.flags : null;
  } catch {
    return null;
  }
}

// ==================== FreeHire development activity ====================

export type FreeHireJobStage = "saved" | "preparing" | "applied" | "interviewing";

export interface FreeHireTrackedJobSnapshot {
  title: string;
  company: string;
  logoUrl?: string;
  location: string;
  applyUrl: string;
  source: string;
  workMode: string;
  salary: string;
  employmentType: string;
  seniority: string;
  postedAt?: string;
}

export interface FreeHireActivity {
  _id: string;
  externalJobId: string;
  stage?: FreeHireJobStage;
  note?: string;
  dismissed: boolean;
  viewedAt?: number;
  job: FreeHireTrackedJobSnapshot;
  createdAt: number;
  updatedAt: number;
  stageChangedAt: number;
}

export interface FreeHirePreferences {
  roleLane: "sales" | "closer" | "account-executive" | "high-ticket" | "leadership";
  sortMode: "relevance" | "newest";
  workMode: "all" | "remote" | "hybrid" | "onsite";
  country: string;
  postedWindow: "any" | "7" | "30";
  minSalary: 0 | 75000 | 100000 | 150000 | 200000;
}

type FreeHireTrackingResult =
  | { activities: FreeHireActivity[] }
  | { id?: string; removed?: boolean }
  | { error: string; needsRelogin?: boolean };

async function callFreeHireTracking(
  sessionToken: string,
  body: Record<string, unknown>,
): Promise<FreeHireTrackingResult> {
  if (!sessionToken) {
    return { error: "Sign in again to sync job activity.", needsRelogin: true };
  }
  try {
    const response = await convexFetch(`${FREEHIRE_PERSONAL_SITE_URL}/b2c/freehire-tracking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, sessionToken }),
    });
    const data = await safeJsonParse(response, "Failed to sync job activity") as FreeHireTrackingResult;
    if (!response.ok && !("error" in data)) {
      return { error: "Failed to sync job activity" };
    }
    return data;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "freeHireTracking", integration: "convex" },
    });
    return { error: "Job activity could not sync. Your local preview is still available." };
  }
}

export async function getFreeHireActivities(
  sessionToken: string,
): Promise<{ activities?: FreeHireActivity[]; error?: string; needsRelogin?: boolean }> {
  const result = await callFreeHireTracking(sessionToken, { operation: "list" });
  if ("error" in result) return result;
  return "activities" in result ? { activities: result.activities } : { activities: [] };
}

export async function saveFreeHireActivity(args: {
  sessionToken: string;
  externalJobId: string;
  stage?: FreeHireJobStage;
  note?: string;
  dismissed: boolean;
  viewedAt?: number;
  job: FreeHireTrackedJobSnapshot;
}): Promise<{ success: boolean; error?: string; needsRelogin?: boolean }> {
  const { sessionToken, ...activity } = args;
  const result = await callFreeHireTracking(sessionToken, {
    operation: "upsert",
    ...activity,
  });
  if ("error" in result) return { success: false, ...result };
  return { success: true };
}

type FreeHirePreferencesResult =
  | { preferences: (FreeHirePreferences & { updatedAt?: number }) | null }
  | { previousVisitedAt: number | null; visitedAt: number }
  | { error: string; needsRelogin?: boolean };

async function callFreeHirePreferences(
  sessionToken: string,
  body: Record<string, unknown>,
): Promise<FreeHirePreferencesResult> {
  if (!sessionToken) {
    return { error: "Sign in again to sync job preferences.", needsRelogin: true };
  }
  try {
    const response = await convexFetch(`${FREEHIRE_PERSONAL_SITE_URL}/b2c/freehire-preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, sessionToken }),
    });
    const data = await safeJsonParse(response, "Failed to sync job preferences") as FreeHirePreferencesResult;
    if (!response.ok && !("error" in data)) {
      return { error: "Failed to sync job preferences" };
    }
    return data;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "freeHirePreferences", integration: "convex" },
    });
    return { error: "Job preferences could not sync." };
  }
}

export async function getFreeHirePreferences(
  sessionToken: string,
): Promise<{ preferences?: FreeHirePreferences | null; error?: string; needsRelogin?: boolean }> {
  const result = await callFreeHirePreferences(sessionToken, { operation: "get" });
  if ("error" in result) return result;
  return "preferences" in result
    ? { preferences: result.preferences }
    : { error: "Failed to load job preferences" };
}

export async function saveFreeHirePreferences(args: FreeHirePreferences & {
  sessionToken: string;
}): Promise<{ success: boolean; error?: string; needsRelogin?: boolean }> {
  const { sessionToken, ...preferences } = args;
  const result = await callFreeHirePreferences(sessionToken, {
    operation: "set",
    ...preferences,
  });
  if ("error" in result) return { success: false, ...result };
  return "preferences" in result
    ? { success: true }
    : { success: false, error: "Failed to save job preferences" };
}

export async function recordFreeHireJobBoardVisit(
  sessionToken: string,
): Promise<{
  previousVisitedAt?: number | null;
  visitedAt?: number;
  error?: string;
  needsRelogin?: boolean;
}> {
  const result = await callFreeHirePreferences(sessionToken, { operation: "visit" });
  if ("error" in result) return result;
  return "previousVisitedAt" in result ? result : { error: "Job-board visit could not sync." };
}

// ==================== Money Bells ====================

export interface MoneyBellsLeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userBadges: string[];
  photoUrl: string | null;
  totalCash: number;
  broadcastCount: number;
}

export interface MoneyBellsLeaderboard {
  month: string;
  page: number;
  totalPages: number;
  totalBroadcasters: number;
  entries: MoneyBellsLeaderboardEntry[];
  topCash: number;
  monthlyGoal: number;
}

export interface MoneyBellsUserRank {
  rank: number | null;
  totalCash: number;
  gapToNext: number | null;
  totalBroadcasters: number;
  photoUrl: string | null;
}

export interface MoneyBellsPrize {
  active: boolean;
  // Three free-form prize slots (1st, 2nd, 3rd place). Any can be null.
  prizeText1?: string | null;
  prizeText2?: string | null;
  prizeText3?: string | null;
  // Legacy — only present when a row was created under the old single-number API
  prizeAmount?: number | null;
  prizeLabel?: string;
  daysLeft: number;
}

export interface MoneyBellsHallOfFameWinner {
  month: string;
  prizeAmount: number;
  // Free-form prize text (new API). Falls back to prizeAmount when null.
  prizeText1?: string | null;
  winnerUserId: string | null;
  winnerName: string;
  photoUrl: string | null;
  winnerCashCollected: number;
  paidAt: number | null;
}

export interface MoneyBellsBroadcastPost {
  _id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  authorBadges: string[];
  body: string;
  visibility: string;
  likeCount: number;
  commentCount: number;
  isPinned: boolean;
  reactionCounts: Record<string, number>;
  myReactions: string[];
  isLikedByMe: boolean;
  broadcastId: string;
  broadcastData: {
    cashCollected: number;
    note: string | null;
    callId: string;
    broadcastedAt: number;
    month: string;
    isEdited: boolean;
  };
  createdAt: number;
  updatedAt: number;
}

export async function getMoneyBellsOptInStatus(
  userId: string
): Promise<{ optedIn: boolean; joinedAt: number | null } | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/money-bells/opt-in-status?userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getMoneyBellsOptInStatus", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function joinMoneyBells(
  userId: string,
  acknowledgedWarning: boolean
): Promise<{ success: boolean; alreadyJoined?: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/money-bells/opt-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, acknowledgedWarning }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "joinMoneyBells", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function leaveMoneyBells(
  userId: string
): Promise<{ success: boolean; wasOptedIn?: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/money-bells/opt-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "leaveMoneyBells", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function createMoneyBellBroadcast(
  userId: string,
  callId: string,
  cashCollected: number,
  note?: string
): Promise<{ success: boolean; broadcastId?: string; postId?: string; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/money-bells/broadcast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, callId, cashCollected, note }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "createMoneyBellBroadcast", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function deleteMoneyBellBroadcast(
  userId: string,
  broadcastId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/money-bells/broadcast/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, broadcastId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "deleteMoneyBellBroadcast", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function getMoneyBellsLeaderboard(
  month: string,
  page: number = 1
): Promise<MoneyBellsLeaderboard | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/money-bells/leaderboard?month=${encodeURIComponent(month)}&page=${page}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getMoneyBellsLeaderboard", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getMoneyBellsUserRank(
  userId: string,
  month: string
): Promise<MoneyBellsUserRank | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/money-bells/user-rank?userId=${encodeURIComponent(userId)}&month=${encodeURIComponent(month)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getMoneyBellsUserRank", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getMoneyBellsPrize(
  month: string
): Promise<MoneyBellsPrize | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/money-bells/prize?month=${encodeURIComponent(month)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getMoneyBellsPrize", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function setMoneyBellsMonthlyPrize(
  userId: string,
  month: string,
  prizes: { prizeText1?: string; prizeText2?: string; prizeText3?: string }
): Promise<{ success: boolean; created?: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/money-bells/prize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, month, ...prizes }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "setMoneyBellsMonthlyPrize", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

export async function markMoneyBellsPrizePaid(
  userId: string,
  month: string,
  rank: 1 | 2 | 3 = 1
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/money-bells/prize/paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, month, rank }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "markMoneyBellsPrizePaid", integration: "convex" },
    });
    return { success: false, error: "Network error" };
  }
}

// ==================== B2C Coaching Calls ====================

export type CoachingCallStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type CoachingRecordingStatus = 'recording' | 'processing' | 'ready' | 'failed' | 'deleted';

export interface CoachingCall {
  _id: string;
  coachUserId: string;
  coachName: string;
  title: string;
  description?: string;
  scheduledStartTime: number;
  scheduledDurationMin: number;
  status: CoachingCallStatus;
  dailyRoomName: string;
  dailyRoomUrl?: string;
  recordingUrl?: string;
  recordingStatus?: CoachingRecordingStatus;
  actualStartTime?: number;
  actualEndTime?: number;
  cancelledReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CoachingCallJoinResult {
  roomUrl: string;
  token: string;
  selfPhotoUrl?: string | null;
  /** Present when the host starts the call — used to anchor the live timer.
   *  Omitted for regular joins (attendees get it from call.actualStartTime). */
  actualStartTime?: number;
}

export async function listCoachingCalls(
  status?: CoachingCallStatus,
  limit?: number
): Promise<CoachingCall[] | { error: string }> {
  try {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (limit) params.set('limit', String(limit));
    params.set('_', String(Date.now()));
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/coaching-calls/list?${params}`);
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "listCoachingCalls", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function getCoachingCall(
  callId: string
): Promise<(CoachingCall & { attendeeCount: number }) | null | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/coaching-calls/detail?callId=${encodeURIComponent(callId)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getCoachingCall", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function getPastCoachingCallsWithRecordings(
  cursor?: number,
  limit?: number
): Promise<{ calls: CoachingCall[]; nextCursor: number | null } | { error: string }> {
  try {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', String(cursor));
    if (limit) params.set('limit', String(limit));
    params.set('_', String(Date.now()));
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/coaching-calls/past?${params}`);
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getPastCoachingCallsWithRecordings", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function createCoachingCall(
  coachUserId: string,
  payload: {
    title: string;
    description?: string;
    scheduledStartTime: number;
    scheduledDurationMin: number;
  }
): Promise<{ callId?: string; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/coaching-calls/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coachUserId, ...payload }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "createCoachingCall", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function cancelCoachingCall(
  callId: string,
  callerId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/coaching-calls/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, callerId, reason }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "cancelCoachingCall", integration: "convex" },
    });
    return { success: false, error: 'Network error' };
  }
}

export async function startCoachingCall(
  callId: string,
  coachUserId: string
): Promise<CoachingCallJoinResult | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/coaching-calls/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, coachUserId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "startCoachingCall", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function joinCoachingCall(
  callId: string,
  userId: string
): Promise<CoachingCallJoinResult | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/coaching-calls/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, userId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "joinCoachingCall", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function endCoachingCall(
  callId: string,
  coachUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/coaching-calls/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, coachUserId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "endCoachingCall", integration: "convex" },
    });
    return { success: false, error: 'Network error' };
  }
}

export async function deleteCoachingCallRecording(
  callId: string,
  callerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/coaching-calls/delete-recording`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, callerId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "deleteCoachingCallRecording", integration: "convex" },
    });
    return { success: false, error: 'Network error' };
  }
}

export async function kickFromCoachingCall(
  callId: string,
  coachUserId: string,
  targetSessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/coaching-calls/kick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId, coachUserId, targetSessionId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "kickFromCoachingCall", integration: "convex" },
    });
    return { success: false, error: 'Network error' };
  }
}

// (Role Play Rooms / breakouts wrapper removed in v1.15 — replaced by
// inline role-play in the main call. See FocusMode in CoachingCallRoom.)

// ==================== Objection Playbook ====================

export type PlaybookSortBy = 'top' | 'newest';

export interface PlaybookEntry {
  _id: string;
  rebuttalText: string;
  objectionText: string;
  authorUserId: string | null;
  authorName: string;
  tags: string[];
  sourceCallId: string | null;
  voteCount: number;
  coachAnnotation: string | null;
  featured: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  myVote: boolean;
}

export async function listPlaybookEntries(params: {
  cursor?: number;
  limit?: number;
  tag?: string;
  sortBy?: PlaybookSortBy;
  userId?: string;
}): Promise<{ items: PlaybookEntry[]; nextCursor: number | null } | { error: string }> {
  try {
    const qs = new URLSearchParams();
    if (params.cursor !== undefined) qs.set('cursor', String(params.cursor));
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.tag) qs.set('tag', params.tag);
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    if (params.userId) qs.set('userId', params.userId);
    qs.set('_', String(Date.now()));
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/playbook/list?${qs}`);
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "listPlaybookEntries", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function createPlaybookEntry(params: {
  coachUserId: string;
  rebuttalText: string;
  objectionText: string;
  authorUserId?: string;
  authorName: string;
  tags?: string[];
  sourceCallId?: string;
  coachAnnotation?: string;
  featured?: boolean;
}): Promise<{ entryId: string } | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/playbook/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "createPlaybookEntry", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function updatePlaybookEntry(params: {
  entryId: string;
  coachUserId: string;
  coachAnnotation?: string;
  featured?: boolean;
  tags?: string[];
  rebuttalText?: string;
  objectionText?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/playbook/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "updatePlaybookEntry", integration: "convex" },
    });
    return { success: false, error: 'Network error' };
  }
}

export async function deletePlaybookEntry(
  entryId: string,
  coachUserId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/playbook/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId, coachUserId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "deletePlaybookEntry", integration: "convex" },
    });
    return { success: false, error: 'Network error' };
  }
}

export async function votePlaybookEntry(
  entryId: string,
  userId: string,
): Promise<{ voted: boolean; voteCount: number; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/playbook/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId, userId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "votePlaybookEntry", integration: "convex" },
    });
    return { voted: false, voteCount: 0, error: 'Network error' };
  }
}

// ==================== B2C Personal Goal Tracker ====================

export type GoalStatus = 'active' | 'completed' | 'expired' | 'cancelled';
export type CommissionMode = 'cash' | 'contract';

export interface PersonalGoal {
  _id: string;
  userId: string;
  title: string;
  emoji?: string;
  targetAmount: number;
  startDate: number;
  endDate: number;
  status: GoalStatus;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveGoalProgress {
  goal: PersonalGoal | null;
  earned: number;
  lastTerminal: PersonalGoal | null;
  hasCommissionSettings: boolean;
  commissionMode: CommissionMode | null;
  commissionRate: number | null;
}

export interface CommissionSettings {
  _id: string;
  userId: string;
  commissionMode: CommissionMode;
  commissionRate: number;
  createdAt: number;
  updatedAt: number;
}

export async function getActiveGoalWithProgress(
  userId: string,
  closerId: string
): Promise<ActiveGoalProgress | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/personal-goals/active?userId=${encodeURIComponent(userId)}&closerId=${encodeURIComponent(closerId)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getActiveGoalWithProgress", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function getCommissionSettings(
  userId: string
): Promise<CommissionSettings | null | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/personal-goals/commission?userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getCommissionSettings", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function setCommissionSettings(
  userId: string,
  commissionMode: CommissionMode,
  commissionRate: number
): Promise<{ id?: string; created?: boolean; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/personal-goals/commission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, commissionMode, commissionRate }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "setCommissionSettings", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function createPersonalGoal(
  userId: string,
  payload: { title: string; emoji?: string; targetAmount: number; durationMonths: number }
): Promise<{ id?: string; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/personal-goals/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...payload }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "createPersonalGoal", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function cancelActivePersonalGoal(
  userId: string
): Promise<{ success: boolean; reason?: string; error?: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/personal-goals/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "cancelActivePersonalGoal", integration: "convex" },
    });
    return { success: false, error: 'Network error' };
  }
}

export async function getMoneyBellsFeed(
  userId?: string,
  cursor?: number,
  limit?: number
): Promise<{ posts: MoneyBellsBroadcastPost[]; nextCursor: number | null } | { error: string }> {
  try {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (cursor) params.set("cursor", String(cursor));
    if (limit) params.set("limit", String(limit));
    params.set("_", String(Date.now()));
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/money-bells/feed?${params}`);
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getMoneyBellsFeed", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getMoneyBellsHallOfFame(): Promise<
  { winners: MoneyBellsHallOfFameWinner[] } | { error: string }
> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/money-bells/hall-of-fame?_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getMoneyBellsHallOfFame", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export interface MoneyBellsMonthStats {
  totalPool: number;
  broadcastCount: number;
  broadcasterCount: number;
  avgBroadcast: number;
  biggestDeal: { userId: string; cashCollected: number; broadcastedAt: number } | null;
}

export async function getMoneyBellsMonthStats(
  month: string
): Promise<MoneyBellsMonthStats | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/money-bells/month-stats?month=${encodeURIComponent(month)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getMoneyBellsMonthStats", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function hasBroadcastForCall(
  callId: string
): Promise<{ hasBroadcast: boolean; broadcastId: string | null } | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/money-bells/has-broadcast-for-call?callId=${encodeURIComponent(callId)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "hasBroadcastForCall", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getMoneyBellsUnreadCount(
  userId: string,
  since: number
): Promise<{ count: number } | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/money-bells/unread-count?userId=${encodeURIComponent(userId)}&since=${since}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getMoneyBellsUnreadCount", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

// ==================== B2C TEAM NOTIFICATIONS ====================

export interface TeamBroadcast {
  _id: string;
  body: string;
  recipientMode: "specific" | "all";
  recipientCount: number;
  repliesAllowed: boolean;
  sentAt: number;
  sentBy: { userId: string; name: string } | null;
  readCount: number;
}

export interface TeamThread {
  _id: string;
  recipientUserId: string;
  recipientName: string;
  recipientPhotoUrl: string | null;
  lastMessageAt: number;
  lastMessagePreview: string | null;
  unreadCount: number;
  repliesAllowed: boolean;
  createdAt: number;
}

export interface TeamThreadMessage {
  _id: string;
  threadId: string;
  senderId: string;
  body: string;
  isRead: boolean;
  isDeleted: boolean;
  createdAt: number;
  teamSentBy: string | null;
}

export async function sendTeamNotification(
  founderId: string,
  recipientIds: string[],
  body: string,
  repliesAllowed: boolean
): Promise<{ broadcastId: string; threadIds: string[]; recipientCount: number } | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/notifications/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ founderId, recipientIds, body, repliesAllowed }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "sendTeamNotification", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function sendTeamNotificationToAll(
  founderId: string,
  body: string,
  repliesAllowed: boolean
): Promise<{ broadcastId: string; recipientCount: number } | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/notifications/send-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ founderId, body, repliesAllowed }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "sendTeamNotificationToAll", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function markTeamThreadRead(
  founderId: string,
  threadId: string
): Promise<{ marked: number } | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/notifications/mark-thread-read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ founderId, threadId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "markTeamThreadRead", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function replyToTeamThread(
  senderId: string,
  threadId: string,
  body: string
): Promise<{ messageId: string } | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/notifications/reply-team-thread`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, threadId, body }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "replyToTeamThread", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function sendTeamMessageAsTeam(
  founderId: string,
  threadId: string,
  body: string
): Promise<{ messageId: string } | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/notifications/send-as-team`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ founderId, threadId, body }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "sendTeamMessageAsTeam", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getEligibleRecipientCount(
  founderId: string
): Promise<{ count: number } | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/notifications/eligible-count?founderId=${encodeURIComponent(founderId)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getEligibleRecipientCount", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function listTeamBroadcasts(
  founderId: string,
  limit?: number,
  cursor?: number
): Promise<{ broadcasts: TeamBroadcast[]; nextCursor: number | null } | { error: string }> {
  try {
    const params = new URLSearchParams({ founderId, _: String(Date.now()) });
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/notifications/broadcasts?${params}`);
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "listTeamBroadcasts", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function listTeamThreads(
  founderId: string,
  limit?: number,
  cursor?: number
): Promise<{ threads: TeamThread[]; nextCursor: number | null } | { error: string }> {
  try {
    const params = new URLSearchParams({ founderId, _: String(Date.now()) });
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/notifications/team-threads?${params}`);
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "listTeamThreads", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getTeamUnreadCount(
  founderId: string
): Promise<{ count: number } | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/notifications/team-unread-count?founderId=${encodeURIComponent(founderId)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getTeamUnreadCount", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getTeamThreadMessages(
  founderId: string,
  threadId: string,
  limit?: number,
  cursor?: number
): Promise<
  | {
      messages: TeamThreadMessage[];
      nextCursor: number | null;
      thread: { _id: string; recipientUserId: string; repliesAllowed: boolean };
    }
  | { error: string }
> {
  try {
    const params = new URLSearchParams({ founderId, threadId, _: String(Date.now()) });
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/notifications/team-thread-messages?${params}`);
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getTeamThreadMessages", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

// ==================== B2C STATS VERIFICATION ====================

export interface StatsVerificationClaim {
  cashCollected?: number;
  closeRate?: number;
  callsCompleted?: number;
}

export interface StatsVerificationRequest {
  requestId: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: number;
  claimedStats: StatsVerificationClaim;
  context: string | null;
  payStubUrls: string[];
  crmUrls: string[];
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
  user: {
    userId: string;
    name: string;
    email: string;
    photoUrl: string | null;
  } | null;
}

export interface MyLatestVerificationRequest {
  requestId: string;
  status: "pending" | "approved" | "rejected";
  submittedAt: number;
  rejectionReason?: string;
  reviewedAt?: number;
}

export async function generateEvidenceUploadUrl(
  userId: string
): Promise<{ uploadUrl: string } | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/stats-verification/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "generateEvidenceUploadUrl", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function submitVerificationRequest(
  userId: string,
  claimedStats: StatsVerificationClaim,
  payStubStorageIds: string[],
  crmStorageIds: string[],
  context?: string
): Promise<{ requestId: string } | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/stats-verification/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, claimedStats, payStubStorageIds, crmStorageIds, context }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "submitVerificationRequest", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function approveVerificationRequest(
  founderId: string,
  requestId: string
): Promise<{ success: true } | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/stats-verification/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ founderId, requestId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "approveVerificationRequest", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function rejectVerificationRequest(
  founderId: string,
  requestId: string,
  reason: string
): Promise<{ success: true; threadId: string | null } | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/stats-verification/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ founderId, requestId, reason }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "rejectVerificationRequest", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getMyLatestVerificationRequest(
  userId: string
): Promise<MyLatestVerificationRequest | null | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/stats-verification/my-latest?userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getMyLatestVerificationRequest", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function listVerificationRequests(
  founderId: string,
  status?: "pending" | "approved" | "rejected",
  limit?: number,
  cursor?: number
): Promise<{ requests: StatsVerificationRequest[]; nextCursor: number | null } | { error: string }> {
  try {
    const params = new URLSearchParams({ founderId, _: String(Date.now()) });
    if (status) params.set("status", status);
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", String(cursor));
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/stats-verification/pending?${params}`);
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "listVerificationRequests", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getPendingVerificationCount(
  founderId: string
): Promise<{ count: number } | { error: string }> {
  try {
    const res = await convexFetch(
      `${CONVEX_SITE_URL}/b2c/stats-verification/pending-count?founderId=${encodeURIComponent(founderId)}&_=${Date.now()}`
    );
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getPendingVerificationCount", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

export async function getVerificationRequestDetail(
  founderId: string,
  requestId: string
): Promise<StatsVerificationRequest | { error: string }> {
  try {
    const params = new URLSearchParams({ founderId, requestId, _: String(Date.now()) });
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/stats-verification/detail?${params}`);
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getVerificationRequestDetail", integration: "convex" },
    });
    return { error: "Network error" };
  }
}

// ==================== Adoption Checklist ====================

export interface AdoptionChecklistData {
  state: {
    firstSeenAt: number;
    setupDismissedAt: number | null;
    setupCompletedAt: number | null;
    setupAutoOpenedAt: number | null;
    earnRedDotLastSeenAt: number | null;
  } | null;
  setup: {
    profile: boolean;
    firstCall: boolean;
    highlightClip: boolean;
    coachingCall: boolean;
    stream: boolean;
  };
  earn: {
    moneyBells: {
      optedIn: boolean;
      currentRank: number | null;
      totalParticipants: number;
      daysRemaining: number;
      monthLabel: string;
    };
    creatorCash: {
      totalEarned: number;
      approvedCount: number;
    };
    testimonial:
      | { status: 'pending' | 'approved' | 'rejected' | 'paid'; submittedAt: number; paidAmount: number | null }
      | null;
  };
}

export async function getAdoptionChecklistData(
  userId: string,
): Promise<AdoptionChecklistData | { error: string }> {
  try {
    const res = await convexFetch(`${CONVEX_SITE_URL}/b2c/adoption-checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    return await res.json();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: "getAdoptionChecklistData", integration: "convex" },
    });
    return { error: 'Network error' };
  }
}

export async function ensureAdoptionChecklistRow(userId: string): Promise<void> {
  try {
    await convexFetch(`${CONVEX_SITE_URL}/b2c/adoption-checklist/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch {
    /* non-fatal — UI degrades gracefully */
  }
}

export async function markSetupAutoOpened(userId: string): Promise<void> {
  try {
    await convexFetch(`${CONVEX_SITE_URL}/b2c/adoption-checklist/mark-auto-opened`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch { /* non-fatal */ }
}

export async function dismissAdoptionSetup(userId: string): Promise<void> {
  try {
    await convexFetch(`${CONVEX_SITE_URL}/b2c/adoption-checklist/dismiss-setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch { /* non-fatal */ }
}

export async function markEarnSeen(userId: string): Promise<void> {
  try {
    await convexFetch(`${CONVEX_SITE_URL}/b2c/adoption-checklist/mark-earn-seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch { /* non-fatal */ }
}

export async function recordReplayProgress(
  userId: string,
  callId: string,
  watchedSeconds: number,
): Promise<void> {
  try {
    await convexFetch(`${CONVEX_SITE_URL}/b2c/coaching-calls/replay-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, callId, watchedSeconds }),
    });
  } catch { /* non-fatal */ }
}
