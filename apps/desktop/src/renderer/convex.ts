// Convex client for the desktop app
// Using HTTP Action endpoint instead of WebSocket (more reliable in Electron)

// HTTP Action endpoint - hosted at .convex.site (not .convex.cloud)
const CONVEX_SITE_URL = "https://ideal-ram-982.convex.site";

export interface CloserInfo {
  closerId: string;
  teamId: string;
  name: string;
  email: string;
  status: string;
  teamName?: string;
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
}

// Login a closer with email and password
export async function loginCloser(email: string, password: string): Promise<LoginResult> {
  try {
    console.log("[Convex] Logging in closer:", email);

    // Add cache-busting query param to prevent Electron caching issues
    const response = await fetch(`${CONVEX_SITE_URL}/loginCloser?_=${Date.now()}`, {
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
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// Get closer info by email (for desktop app login)
// Uses HTTP Action endpoint - simple HTTP GET, no WebSocket needed
export async function getCloserByEmail(email: string): Promise<CloserInfo | null> {
  try {
    console.log("[Convex] Fetching closer by email:", email);

    const url = `${CONVEX_SITE_URL}/getCloserByEmail?email=${encodeURIComponent(email)}`;
    console.log("[Convex] Request URL:", url);

    const response = await fetch(url);

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
    return null;
  }
}

// Activate closer when they log in (changes status from pending to active)
export async function activateCloser(email: string): Promise<boolean> {
  try {
    console.log("[Convex] Activating closer:", email);

    const response = await fetch(`${CONVEX_SITE_URL}/activateCloser`, {
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
    const response = await fetch(url);

    if (!response.ok) {
      console.error("[Convex] Error finding scheduled call:", response.status);
      return null;
    }

    const result = await response.json();
    console.log("[Convex] Scheduled call match result:", result);
    return result as ScheduledCallMatch | null;
  } catch (error) {
    console.error("[Convex] Failed to find matching scheduled call:", error);
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

    const response = await fetch(`${CONVEX_SITE_URL}/updateProspectName`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[Convex] Failed to update prospect name:", errorData);
      return { success: false, error: errorData.error || "Failed to update prospect name" };
    }

    const result = await response.json();
    console.log("[Convex] Update prospect name result:", result);
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to update prospect name:", error);
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
  leadQualityScore?: number;
  prospectWasDecisionMaker?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    console.log("[Convex] Completing call with outcome:", data);

    const response = await fetch(`${CONVEX_SITE_URL}/completeCallWithOutcome`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("[Convex] Failed to complete call:", errorData);
      return { success: false, error: errorData.error || "Failed to complete call" };
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

    const response = await fetch(`${CONVEX_SITE_URL}/changePassword`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ closerId, currentPassword, newPassword }),
    });

    const result = await response.json();
    console.log("[Convex] Change password result:", result);

    if (!response.ok || !result.success) {
      return { success: false, error: result.error || "Failed to change password" };
    }

    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to change password:", error);
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
