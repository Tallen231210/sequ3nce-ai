import { convexFetch, CONVEX_SITE_URL } from "./convex";

// ============================================================================
// "Email me updates" switch API — Settings → Notifications. Authenticated by
// the app-session bearer token like the auto-join switch (autoJoinApi.ts),
// so a guessable id can't silence someone else's email. Sessions from
// before the token exist get needsRelogin.
// ============================================================================

export interface EmailPrefsState {
  ok?: boolean;
  enabled?: boolean;
  needsRelogin?: boolean;
  error?: string;
}

export async function getEmailPrefs(sessionToken: string | undefined): Promise<EmailPrefsState> {
  return callEmailPrefs(sessionToken);
}

export async function setEmailPrefs(
  sessionToken: string | undefined,
  enabled: boolean,
): Promise<EmailPrefsState> {
  return callEmailPrefs(sessionToken, enabled);
}

async function callEmailPrefs(sessionToken: string | undefined, enabled?: boolean): Promise<EmailPrefsState> {
  if (!sessionToken) return { needsRelogin: true };
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/email-preferences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enabled === undefined ? { sessionToken } : { sessionToken, enabled }),
    });
    return (await response.json()) as EmailPrefsState;
  } catch (error) {
    console.error("[EmailPrefs] request failed:", error);
    return { error: "Network error. Please check your connection." };
  }
}
