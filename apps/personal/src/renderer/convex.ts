// Convex client for the Sequ3nce Personal (B2C) app
// Using HTTP Action endpoint instead of WebSocket (more reliable in Electron)

// HTTP Action endpoint - hosted at .convex.site (not .convex.cloud)
const CONVEX_SITE_URL = "https://ideal-ram-982.convex.site";

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

    const response = await fetch(`${CONVEX_SITE_URL}/b2c/signup?_=${Date.now()}`, {
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
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// Login a B2C user with email and password
export async function loginCloser(email: string, password: string): Promise<LoginResult> {
  try {
    console.log("[Convex] Logging in B2C user");

    // Add cache-busting query param to prevent Electron caching issues
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/login?_=${Date.now()}`, {
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

    const response = await fetch(`${CONVEX_SITE_URL}/completeCallWithOutcome`, {
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
    const response = await fetch(`${CONVEX_SITE_URL}/getPendingQuestionnaireCount`, {
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
    return { count: 0 };
  }
}

// Dismiss orphaned questionnaires (bots without linked call records)
export async function dismissOrphanedQuestionnaires(closerId: string): Promise<{ dismissed: number }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/dismissOrphanedQuestionnaires`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return { dismissed: 0 };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to dismiss orphaned questionnaires:", error);
    return { dismissed: 0 };
  }
}

// Request password reset (sends 6-digit code via email)
export async function requestPasswordReset(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/forgot-password?_=${Date.now()}`, {
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/reset-password?_=${Date.now()}`, {
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
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// Send email verification code
export async function sendVerificationCode(
  email: string
): Promise<{ success: boolean; error?: string; alreadyVerified?: boolean; retryAfter?: number }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/send-verification?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Convex] Failed to send verification code:", error);
    return { success: false, error: "Network error. Please check your connection." };
  }
}

// Verify email with 6-digit code
export async function verifyEmail(
  email: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/verify-email?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("[Convex] Failed to verify email:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/onboarding?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, source, income, struggle }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to save onboarding" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to save onboarding:", error);
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

    const response = await fetch(`${CONVEX_SITE_URL}/isMeetingBotEnabled`, {
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
    return false;
  }
}

// Check if closer needs calendar onboarding
export async function needsCalendarOnboarding(closerId: string): Promise<boolean> {
  try {
    console.log("[Convex] Checking calendar onboarding for closer:", closerId);

    const response = await fetch(`${CONVEX_SITE_URL}/needsCalendarOnboarding`, {
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
    const response = await fetch(`${CONVEX_SITE_URL}/endCallManually`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return { success: false };
    return await response.json();
  } catch {
    return { success: false };
  }
}

export async function getActiveCallForCloserBot(closerId: string): Promise<ActiveBotCall | null> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/getActiveCallForCloserBot`, {
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
    const response = await fetch(`${CONVEX_SITE_URL}/createBotForMeeting`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, teamId, meetingUrl, meetingTitle, prospectName }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to create bot:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/createQuickBot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingUrl, closerId, teamId, prospectName }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to create quick bot:", error);
    return false;
  }
}

// Cancel/kick bot from meeting
export async function cancelBot(botId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/cancelBot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botId }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to cancel bot:", error);
    return false;
  }
}

// Get upcoming bots for closer
export async function getUpcomingBotsForCloser(closerId: string): Promise<Record<string, unknown>[]> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/getUpcomingBotsForCloser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : result.bots || [];
  } catch (error) {
    console.error("[Convex] Failed to get upcoming bots:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/excludeCalendarEvent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, calendarEventId, eventTitle }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to exclude event:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/requestReinforcement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, closerId, closerName, callId, message }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to request reinforcement:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/callGoingLong`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, closerId, callId, estimatedMinutes }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to notify call going long:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/getTranscriptSegments?callId=${encodeURIComponent(callId)}`);
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[Convex] Failed to get transcript:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/getAmmoAnalysis?callId=${encodeURIComponent(callId)}`);
    if (!response.ok) return null;
    const result = await response.json();
    if (result && result.engagement) return result;
    return null;
  } catch (error) {
    console.error("[Convex] Failed to get ammo analysis:", error);
    return null;
  }
}

// Check if Ammo V2 is enabled
export async function isAmmoV2Enabled(teamId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/isAmmoV2Enabled?teamId=${encodeURIComponent(teamId)}`);
    if (!response.ok) return false;
    const result = await response.json();
    return result.enabled === true;
  } catch (error) {
    return false;
  }
}

// Update call notes
export async function updateCallNotes(callId: string, notes: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/updateCallNotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, notes }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to update notes:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/getActiveResources?teamId=${encodeURIComponent(teamId)}`);
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[Convex] Failed to get resources:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/resources?_=${Date.now()}`, {
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/resources/update?_=${Date.now()}`, {
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
    return { error: "Network error. Please check your connection." };
  }
}

// Delete a resource
export async function deleteResource(
  userId: string,
  resourceId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/resources/delete?_=${Date.now()}`, {
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
    return { error: "Network error. Please check your connection." };
  }
}

// Reorder resources
export async function reorderResources(
  userId: string,
  resourceIds: string[]
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/resources/reorder?_=${Date.now()}`, {
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
    return { error: "Network error. Please check your connection." };
  }
}

// Save meeting platform preference
export async function saveMeetingPlatform(closerId: string, platform: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/saveMeetingPlatform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, platform }),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Mark calendar onboarding as completed
export async function markOnboardingCompleted(closerId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/markOnboardingCompleted`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    return response.ok;
  } catch (error) {
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
    const response = await fetch(`${CONVEX_SITE_URL}/connectCalendarByEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, teamId, icsUrl }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to connect calendar:", error);
    return false;
  }
}

// Sync calendar events
export async function syncCalendar(email: string, teamId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/syncCalendarByEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, teamId }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to sync calendar:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/getCloserStats`, {
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
    const response = await fetch(`${CONVEX_SITE_URL}/getCloserAnalyticsSummary`, {
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
    const response = await fetch(`${CONVEX_SITE_URL}/getCloserLostDeals`, {
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
    const response = await fetch(`${CONVEX_SITE_URL}/getCloserObjectionAnalysis`, {
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

    const response = await fetch(`${CONVEX_SITE_URL}/getCloserEventsByEmail?${params}`);

    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[Convex] Failed to get calendar events:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/getCallHistory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId, limit: limit || 20 }),
    });

    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result.calls) ? result.calls : [];
  } catch (error) {
    console.error("[Convex] Failed to get call history:", error);
    return [];
  }
}

// Fetch just the callAnalysis field for a single call (lightweight polling endpoint)
export async function getCallAnalysis(callId: string): Promise<CallAnalysis | null> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/getCallAnalysis?callId=${encodeURIComponent(callId)}`);
    if (!response.ok) return null;
    const result = await response.json();
    return result.callAnalysis ?? null;
  } catch (error) {
    console.error("[Convex] Failed to get call analysis:", error);
    return null;
  }
}

// ==================== SCHEDULE + CALENDAR ====================

// Calendar status
export interface CalendarStatus {
  closerId: string;
  connected: boolean;
  icsUrl?: string;
  connectedAt?: number;
  lastSynced?: number;
}

export async function getCalendarStatus(email: string, teamId: string): Promise<CalendarStatus | null> {
  try {
    const params = new URLSearchParams({ email, teamId });
    const response = await fetch(`${CONVEX_SITE_URL}/getCloserCalendarStatusByEmail?${params}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get calendar status:", error);
    return null;
  }
}

export async function disconnectCalendar(email: string, teamId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/disconnectCalendarByEmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, teamId }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to disconnect calendar:", error);
    return false;
  }
}

// ==================== DIAGNOSTICS ====================

export async function submitDiagnosticReport(data: Record<string, unknown>): Promise<{ success: boolean; reportId?: string; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/submitDiagnosticReport`, {
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
    const response = await fetch(`${CONVEX_SITE_URL}/getFeedbackForCloser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : result.calls || [];
  } catch (error) {
    console.error("[Convex] Failed to get feedback:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/getCommentsForCall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId }),
    });
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : result.comments || [];
  } catch (error) {
    console.error("[Convex] Failed to get comments:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/addCallComment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, content, authorType, authorName, authorId, timestampSeconds, parentCommentId }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to add comment:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/getSharedMoments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : result.moments || [];
  } catch (error) {
    console.error("[Convex] Failed to get shared moments:", error);
    return [];
  }
}

// Unread counts
export async function getUnreadFeedbackCount(closerId: string): Promise<number> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/getUnreadFeedbackCount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return 0;
    const result = await response.json();
    return result.count || 0;
  } catch (error) {
    return 0;
  }
}

export async function getUnreadSharedMomentsCount(closerId: string): Promise<number> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/getUnreadSharedMomentsCount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    if (!response.ok) return 0;
    const result = await response.json();
    return result.count || 0;
  } catch (error) {
    return 0;
  }
}

export async function markFeedbackRead(callId: string, closerId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/markFeedbackRead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, closerId }),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

export async function markSharedMomentsSeen(closerId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/markSharedMomentsSeen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// ==================== CALL HISTORY + REVIEWS ====================

// Flag call for review
export async function flagCallForReview(callId: string, closerId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/flagCallForReview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, closerId }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to flag call:", error);
    return false;
  }
}

// Unflag call
export async function unflagCall(callId: string, closerId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/unflagCall`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, closerId }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true;
  } catch (error) {
    console.error("[Convex] Failed to unflag call:", error);
    return false;
  }
}

// Refresh recording URL (Recall.ai URLs expire ~24h)
export async function refreshRecordingUrl(callId: string): Promise<string | null> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/refreshRecordingUrl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId }),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return result.recordingUrl || null;
  } catch (error) {
    console.error("[Convex] Failed to refresh recording URL:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/createSharedLink`, {
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
    const response = await fetch(
      `${CONVEX_SITE_URL}/getSharedLinksForCall?callId=${encodeURIComponent(callId)}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get shared links:", error);
    return [];
  }
}

// Revoke a shared link
export async function revokeSharedLink(linkId: string): Promise<boolean> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/revokeSharedLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    });
    return response.ok;
  } catch (error) {
    console.error("[Convex] Failed to revoke shared link:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/getAmmoByCall?callId=${encodeURIComponent(callId)}`);
    if (!response.ok) return [];
    const result = await response.json();
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[Convex] Failed to get ammo items:", error);
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

    const response = await fetch(`${CONVEX_SITE_URL}/getOrCreateRolePlayRoom`, {
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

    const response = await fetch(`${CONVEX_SITE_URL}/joinRolePlayRoom`, {
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

    const response = await fetch(`${CONVEX_SITE_URL}/leaveRolePlayRoom`, {
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
    return { success: false, error: "Network error" };
  }
}

// Get current participants in the role play room
export async function getRolePlayRoomParticipants(teamId: string): Promise<RolePlayRoomParticipant[]> {
  try {
    const url = `${CONVEX_SITE_URL}/getRolePlayRoomParticipants?teamId=${encodeURIComponent(teamId)}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error("[Convex] Failed to get role play room participants:", response.status);
      return [];
    }

    const result = await response.json();
    return result as RolePlayRoomParticipant[];
  } catch (error) {
    console.error("[Convex] Failed to get role play room participants:", error);
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
    const response = await fetch(url);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get messages:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/sendMessage`, {
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
    return false;
  }
}

export async function markAllMessagesRead(closerId: string): Promise<void> {
  try {
    await fetch(`${CONVEX_SITE_URL}/markAllAsReadForCloser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closerId }),
    });
  } catch (error) {
    console.error("[Convex] Failed to mark messages as read:", error);
  }
}

export async function getUnreadMessageCount(closerId: string): Promise<number> {
  try {
    const url = `${CONVEX_SITE_URL}/getUnreadCountForCloser?closerId=${encodeURIComponent(closerId)}`;
    const response = await fetch(url);
    if (!response.ok) return 0;
    const data = await response.json();
    return data.count || 0;
  } catch (error) {
    console.error("[Convex] Failed to get unread message count:", error);
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
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get profile:", error);
    return null;
  }
}

export async function upsertProfile(args: ProfileUpdateArgs): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/profile?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to save profile" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to upsert profile:", error);
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function generateProfileUploadUrl(userId: string): Promise<{ uploadUrl: string } | null> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/profile/upload-url?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to generate upload URL:", error);
    return null;
  }
}

export async function saveProfilePhoto(
  userId: string,
  storageId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/profile/photo?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, storageId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to save photo" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to save profile photo:", error);
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function claimProfileSlug(
  userId: string,
  slug: string
): Promise<{ success: boolean; slug?: string; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/profile/slug?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, slug }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to claim URL" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to claim profile slug:", error);
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
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/highlight-clips?userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get highlight clips:", error);
    return [];
  }
}

export async function getHighlightClipsByCall(callId: string): Promise<HighlightClip[]> {
  try {
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/highlight-clips/by-call?callId=${encodeURIComponent(callId)}&_=${Date.now()}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get clips by call:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/highlight-clips?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to add clip" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to add highlight clip:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/highlight-clips/update?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to update clip" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to update highlight clip:", error);
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function deleteHighlightClip(
  clipId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/highlight-clips/delete?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipId, userId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to delete clip" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to delete highlight clip:", error);
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function reorderHighlightClips(
  userId: string,
  clipIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/highlight-clips/reorder?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, clipIds }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to reorder clips" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to reorder highlight clips:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/highlight-shares?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipId, userId, password: password || undefined }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create share link" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to create highlight share:", error);
    return { error: "Network error. Please check your connection." };
  }
}

// Get active share links for a clip
export async function getHighlightSharesByClip(clipId: string): Promise<HighlightShareInfo[]> {
  try {
    const params = new URLSearchParams({ clipId, _: String(Date.now()) });
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/highlight-shares?${params}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.shares || [];
  } catch (error) {
    console.error("[Convex] Failed to get highlight shares:", error);
    return [];
  }
}

// Revoke a highlight share link
export async function revokeHighlightShare(
  shareId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/highlight-shares/revoke?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareId, userId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to revoke share" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to revoke highlight share:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/content/submit-clip?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, clipId, category, paymentHandle, paymentMethod, consentGiven, note }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to submit clip" };
    return { success: true, submissionId: data.submissionId };
  } catch (error) {
    console.error("[Convex] Failed to submit clip for content:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/content/submit-testimonial?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, label, videoUrl, category, paymentHandle, paymentMethod, consentGiven, note }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to submit testimonial" };
    return { success: true, submissionId: data.submissionId };
  } catch (error) {
    console.error("[Convex] Failed to submit testimonial for content:", error);
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function getMyContentSubmissions(userId: string): Promise<ContentSubmission[]> {
  try {
    const params = new URLSearchParams({ userId, _: String(Date.now()) });
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/content/my-submissions?${params}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.submissions || [];
  } catch (error) {
    console.error("[Convex] Failed to get content submissions:", error);
    return [];
  }
}

export async function getPendingContentSubmissions(
  reviewerUserId: string
): Promise<ContentSubmission[]> {
  try {
    const params = new URLSearchParams({ reviewerUserId, _: String(Date.now()) });
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/content/pending?${params}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.submissions || [];
  } catch (error) {
    console.error("[Convex] Failed to get pending content submissions:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/content/all?${params}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.submissions || [];
  } catch (error) {
    console.error("[Convex] Failed to get all content submissions:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/content/review?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, reviewerUserId, action, rejectionReason }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to review submission" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to review content submission:", error);
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function markContentSubmissionPaid(
  submissionId: string,
  reviewerUserId: string,
  paidAmount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/content/mark-paid?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, reviewerUserId, paidAmount }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to mark as paid" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to mark content submission paid:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/training/modules?_=${Date.now()}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get training modules:", error);
    return [];
  }
}

export async function getTrainingLessons(moduleId: string): Promise<TrainingLesson[]> {
  try {
    const params = new URLSearchParams({ moduleId });
    params.set("_", String(Date.now()));
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/training/lessons?${params}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get training lessons:", error);
    return [];
  }
}

// ==================== Community API ====================

export async function getCommunityChannels(): Promise<CommunityChannel[]> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/channels?_=${Date.now()}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get channels:", error);
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

    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/feed?${params}`);
    if (!response.ok) return { posts: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get feed:", error);
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

    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/posts?${params}`);
    if (!response.ok) return { posts: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get channel posts:", error);
    return { posts: [], nextCursor: null };
  }
}

export async function getNewPostCount(since: number): Promise<number> {
  try {
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/community/new-count?since=${since}&_=${Date.now()}`
    );
    if (!response.ok) return 0;
    const data = await response.json();
    return data.count || 0;
  } catch (error) {
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/posts?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, channelId, body, visibility }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create post" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to create post:", error);
    return { error: "Network error" };
  }
}

export async function editCommunityPost(
  userId: string,
  postId: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/post/edit?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postId, body }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to edit post" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to edit post:", error);
    return { success: false, error: "Network error" };
  }
}

export async function deleteCommunityPost(
  userId: string,
  postId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/post/delete?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to delete post" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to delete post:", error);
    return { success: false, error: "Network error" };
  }
}

export async function togglePostLike(
  userId: string,
  postId: string
): Promise<{ liked?: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/post/like?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to toggle like" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to toggle like:", error);
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

    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/comments?${params}`);
    if (!response.ok) return { comments: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get comments:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/comments?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create comment" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to create comment:", error);
    return { error: "Network error" };
  }
}

export async function editPostComment(
  userId: string,
  commentId: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/comment/edit?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, commentId, body }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to edit comment" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to edit comment:", error);
    return { success: false, error: "Network error" };
  }
}

export async function deletePostComment(
  userId: string,
  commentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/comment/delete?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, commentId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to delete comment" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to delete comment:", error);
    return { success: false, error: "Network error" };
  }
}

export async function toggleCommentLike(
  userId: string,
  commentId: string
): Promise<{ liked?: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/comment/like?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, commentId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to toggle like" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to toggle like:", error);
    return { error: "Network error" };
  }
}

// ==================== Direct Messages ====================

export interface DMThread {
  _id: string;
  otherUserId: string;
  otherUserName: string;
  otherUserPhotoUrl: string | null;
  lastMessageAt: number;
  lastMessagePreview: string | null;
  unreadCount: number;
  createdAt: number;
}

export interface DMMessage {
  _id: string;
  threadId: string;
  senderId: string;
  body: string;
  isRead: boolean;
  isDeleted: boolean;
  createdAt: number;
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

    const response = await fetch(`${CONVEX_SITE_URL}/b2c/dm/threads?${params}`);
    if (!response.ok) return { threads: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get DM threads:", error);
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

    const response = await fetch(`${CONVEX_SITE_URL}/b2c/dm/messages?${params}`);
    if (!response.ok) return { messages: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get DM messages:", error);
    return { messages: [], nextCursor: null };
  }
}

export async function getDMUnreadCount(userId: string): Promise<number> {
  try {
    const params = new URLSearchParams({ userId, _: String(Date.now()) });
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/dm/unread-count?${params}`);
    if (!response.ok) return 0;
    const data = await response.json();
    return data.count ?? 0;
  } catch (error) {
    console.error("[Convex] Failed to get DM unread count:", error);
    return 0;
  }
}

export async function sendDM(
  senderId: string,
  recipientId: string,
  body: string
): Promise<{ messageId?: string; threadId?: string; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/dm/send?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, recipientId, body }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to send message" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to send DM:", error);
    return { error: "Network error" };
  }
}

export async function markDMThreadRead(
  userId: string,
  threadId: string
): Promise<void> {
  try {
    await fetch(`${CONVEX_SITE_URL}/b2c/dm/mark-read?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, threadId }),
    });
  } catch (error) {
    console.error("[Convex] Failed to mark thread read:", error);
  }
}

export async function deleteDMMessage(
  userId: string,
  messageId: string
): Promise<{ error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/dm/delete?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, messageId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to delete message" };
    return {};
  } catch (error) {
    console.error("[Convex] Failed to delete DM:", error);
    return { error: "Network error" };
  }
}

// ==================== ONLINE PRESENCE ====================

// Send heartbeat to update online presence
export async function sendHeartbeat(userId: string): Promise<void> {
  try {
    await fetch(`${CONVEX_SITE_URL}/b2c/heartbeat?_=${Date.now()}`, {
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/online-users?_=${Date.now()}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.onlineIds || [];
  } catch (error) {
    console.error("[Convex] Failed to get online users:", error);
    return [];
  }
}

export async function getCommunityMembers(
  limit?: number,
  search?: string,
  cursor?: number
): Promise<{ members: CommunityMember[]; nextCursor: number | null }> {
  try {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (search) params.set("search", search);
    if (cursor) params.set("cursor", String(cursor));
    params.set("_", String(Date.now()));

    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/members?${params}`);
    if (!response.ok) return { members: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get members:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/reaction/add?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, targetType, targetId, emoji }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to add reaction" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to add reaction:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/reaction/remove?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, targetType, targetId, emoji }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to remove reaction" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to remove reaction:", error);
    return { error: "Network error" };
  }
}

// ==================== Channel Read State Functions ====================

export async function markChannelRead(
  userId: string,
  channelId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/channel/mark-read?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, channelId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to mark channel read" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to mark channel read:", error);
    return { error: "Network error" };
  }
}

export async function getUnreadChannels(
  userId: string
): Promise<{ unreadChannelIds: string[] }> {
  try {
    const params = new URLSearchParams({ userId, _: String(Date.now()) });
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/channel/unread?${params}`);
    if (!response.ok) return { unreadChannelIds: [] };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get unread channels:", error);
    return { unreadChannelIds: [] };
  }
}

// ==================== Pin Functions ====================

export async function pinCommunityPost(
  userId: string,
  postId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/post/pin?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to pin post" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to pin post:", error);
    return { error: "Network error" };
  }
}

export async function unpinCommunityPost(
  userId: string,
  postId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/post/unpin?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, postId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to unpin post" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to unpin post:", error);
    return { error: "Network error" };
  }
}

// ==================== Search Functions ====================

export async function searchCommunityPosts(
  query: string,
  channelId?: string,
  cursor?: number,
  limit?: number
): Promise<{ posts: CommunityPost[]; nextCursor: number | null }> {
  try {
    const params = new URLSearchParams({ q: query, _: String(Date.now()) });
    if (channelId) params.set("channelId", channelId);
    if (cursor) params.set("cursor", String(cursor));
    if (limit) params.set("limit", String(limit));
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/community/search?${params}`);
    if (!response.ok) return { posts: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to search posts:", error);
    return { posts: [], nextCursor: null };
  }
}

// ==================== DM Typing Functions ====================

export async function setDMTyping(
  userId: string,
  threadId: string
): Promise<{ success?: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/dm/typing?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, threadId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to set typing" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to set typing:", error);
    return { error: "Network error" };
  }
}

export async function getDMTypingUsers(
  userId: string,
  threadId: string
): Promise<{ users: { userId: string; userName: string }[] }> {
  try {
    const params = new URLSearchParams({ userId, threadId, _: String(Date.now()) });
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/dm/typing?${params}`);
    if (!response.ok) return { users: [] };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get typing users:", error);
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

    const response = await fetch(`${CONVEX_SITE_URL}/b2c/friends?${params}`);
    if (!response.ok) return { friends: [], nextCursor: null };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get friends:", error);
    return { friends: [], nextCursor: null };
  }
}

export async function getIncomingFriendRequests(
  userId: string
): Promise<{ requests: FriendRequest[] }> {
  try {
    const params = new URLSearchParams({ userId, _: String(Date.now()) });
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/friends/requests?${params}`);
    if (!response.ok) return { requests: [] };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get friend requests:", error);
    return { requests: [] };
  }
}

export async function getPendingFriendRequestCount(
  userId: string
): Promise<number> {
  try {
    const params = new URLSearchParams({ userId, _: String(Date.now()) });
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/friends/request-count?${params}`);
    if (!response.ok) return 0;
    const data = await response.json();
    return data.count || 0;
  } catch (error) {
    return 0;
  }
}

export async function getFriendshipStatus(
  userId: string,
  otherUserId: string
): Promise<FriendshipStatus> {
  try {
    const params = new URLSearchParams({ userId, otherUserId, _: String(Date.now()) });
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/friends/status?${params}`);
    if (!response.ok) return "none";
    const data = await response.json();
    return data.status || "none";
  } catch (error) {
    return "none";
  }
}

export async function sendFriendRequest(
  requesterId: string,
  recipientId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/friends/request?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requesterId, recipientId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to send request" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to send friend request:", error);
    return { success: false, error: "Network error" };
  }
}

export async function acceptFriendRequest(
  userId: string,
  requesterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/friends/accept?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, requesterId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to accept" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to accept friend request:", error);
    return { success: false, error: "Network error" };
  }
}

export async function declineFriendRequest(
  userId: string,
  requesterId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/friends/decline?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, requesterId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to decline" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to decline friend request:", error);
    return { success: false, error: "Network error" };
  }
}

export async function removeFriend(
  userId: string,
  friendId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/friends/remove?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, friendId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to remove" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to remove friend:", error);
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

    const response = await fetch(`${CONVEX_SITE_URL}/b2c/jobs/open?${params}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to load job postings:", error);
    return [];
  }
}

export async function getJobPosting(postingId: string): Promise<JobPosting | null> {
  try {
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/jobs/posting?postingId=${encodeURIComponent(postingId)}&_=${Date.now()}`
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to load job posting:", error);
    return null;
  }
}

export async function getInterestStatus(
  postingId: string,
  userId: string
): Promise<{ interested: boolean }> {
  try {
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/jobs/interest-status?postingId=${encodeURIComponent(postingId)}&userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    if (!response.ok) return { interested: false };
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to check interest status:", error);
    return { interested: false };
  }
}

export async function getMyJobInterests(userId: string): Promise<JobInterest[]> {
  try {
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/jobs/my-interests?userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to load interests:", error);
    return [];
  }
}

export async function expressJobInterest(
  postingId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/jobs/express-interest?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postingId, userId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to express interest" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to express interest:", error);
    return { success: false, error: "Network error" };
  }
}

export async function withdrawJobInterest(
  postingId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/jobs/withdraw-interest?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postingId, userId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to withdraw" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to withdraw interest:", error);
    return { success: false, error: "Network error" };
  }
}

export async function toggleAvailability(
  userId: string,
  isAvailable: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/profile/toggle-availability?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, isAvailable }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to toggle" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to toggle availability:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/create-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, b2cUserId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create checkout" };
    return { url: data.url };
  } catch (error) {
    console.error("[Convex] Failed to create B2C checkout:", error);
    return { error: "Network error. Please check your connection." };
  }
}

/** Create a Stripe Customer Portal session for subscription management */
export async function createB2CPortal(
  b2cUserId: string
): Promise<{ url?: string; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/create-portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ b2cUserId }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create portal" };
    return { url: data.url };
  } catch (error) {
    console.error("[Convex] Failed to create B2C portal:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/contest/create?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ createdBy, title, description, prizeAmount, weekStartDate, weekEndDate }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to create contest" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to create weekly contest:", error);
    return { error: "Network error. Please check your connection." };
  }
}

export async function getActiveContest(): Promise<WeeklyContest | null> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/contest/active?_=${Date.now()}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get active contest:", error);
    return null;
  }
}

export async function getContestSubmissions(contestId: string): Promise<WeeklySubmission[]> {
  try {
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/contest/submissions?contestId=${encodeURIComponent(contestId)}&_=${Date.now()}`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get contest submissions:", error);
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
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/contest/submit?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, contestId, type, title, clipId, shareUrl }),
    });
    const data = await response.json();
    if (!response.ok) return { error: data.error || "Failed to submit entry" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to submit contest entry:", error);
    return { error: "Network error. Please check your connection." };
  }
}

export async function castContestVote(
  userId: string,
  contestId: string,
  submissionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/contest/vote?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, contestId, submissionId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to cast vote" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to cast contest vote:", error);
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function removeContestVote(
  userId: string,
  contestId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/contest/remove-vote?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, contestId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to remove vote" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to remove contest vote:", error);
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export async function getMyContestSubmission(
  contestId: string,
  userId: string
): Promise<WeeklySubmission | null> {
  try {
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/contest/my-submission?contestId=${encodeURIComponent(contestId)}&userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get my contest submission:", error);
    return null;
  }
}

export async function getMyContestVote(
  contestId: string,
  userId: string
): Promise<{ _id: string; submissionId: string } | null> {
  try {
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/contest/my-vote?contestId=${encodeURIComponent(contestId)}&userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get my contest vote:", error);
    return null;
  }
}

export async function getPastContests(): Promise<WeeklyContest[]> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/contest/history?_=${Date.now()}`);
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error("[Convex] Failed to get past contests:", error);
    return [];
  }
}

export async function completeWeeklyContest(
  contestId: string,
  reviewerUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${CONVEX_SITE_URL}/b2c/contest/complete?_=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contestId, reviewerUserId }),
    });
    const data = await response.json();
    if (!response.ok) return { success: false, error: data.error || "Failed to complete contest" };
    return { success: true };
  } catch (error) {
    console.error("[Convex] Failed to complete weekly contest:", error);
    return { success: false, error: "Network error. Please check your connection." };
  }
}

/** Poll subscription status (used after checkout to detect activation) */
export async function getSubscriptionStatus(
  userId: string
): Promise<{ subscriptionStatus: string; stripeCustomerId?: string; error?: string }> {
  try {
    const response = await fetch(
      `${CONVEX_SITE_URL}/b2c/subscription-status?userId=${encodeURIComponent(userId)}&_=${Date.now()}`
    );
    const data = await response.json();
    if (!response.ok) return { subscriptionStatus: "none", error: data.error };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to get subscription status:", error);
    return { subscriptionStatus: "none", error: "Network error" };
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

export async function getB2cCalendars(closerId: string): Promise<B2cCalendar[]> {
  try {
    const res = await fetch(`${CONVEX_SITE_URL}/b2c/calendars?closerId=${encodeURIComponent(closerId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.calendars || [];
  } catch (error) {
    console.error("[Convex] Failed to get calendars:", error);
    return [];
  }
}

export async function addB2cCalendar(
  closerId: string,
  teamId: string,
  label: string,
  provider: string,
  opts?: { googleRefreshToken?: string; googleEmail?: string; icsUrl?: string }
): Promise<{ id?: string; color?: string; error?: string }> {
  try {
    const res = await fetch(`${CONVEX_SITE_URL}/b2c/calendars`, {
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
    return { error: "Network error" };
  }
}

export async function removeB2cCalendar(
  calendarId: string,
  closerId: string
): Promise<{ deleted?: boolean; error?: string }> {
  try {
    const res = await fetch(`${CONVEX_SITE_URL}/b2c/calendars/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId, closerId }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Failed to remove calendar" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to remove calendar:", error);
    return { error: "Network error" };
  }
}

export async function updateB2cCalendar(
  calendarId: string,
  closerId: string,
  updates: { label?: string; color?: string; isEnabled?: boolean }
): Promise<{ success?: boolean; error?: string }> {
  try {
    const res = await fetch(`${CONVEX_SITE_URL}/b2c/calendars/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId, closerId, ...updates }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Failed to update calendar" };
    return data;
  } catch (error) {
    console.error("[Convex] Failed to update calendar:", error);
    return { error: "Network error" };
  }
}
