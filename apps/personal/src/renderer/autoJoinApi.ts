import { convexFetch, CONVEX_SITE_URL } from "./convex";

// ============================================================================
// Auto-join switch API. The one B2C route that authenticates by the
// app-session bearer token (minted at login, stored inside closerInfo) —
// it toggles whether a bot records the user's meetings, so a guessable id
// is not enough. Sessions from before the token exist get needsRelogin.
// ============================================================================

export interface AutoJoinState {
  ok?: boolean;
  enabled?: boolean;
  hasLiveCalendar?: boolean;
  needsRelogin?: boolean;
  error?: string;
}

export async function getAutoJoinState(sessionToken: string | undefined): Promise<AutoJoinState> {
  return callAutoJoin(sessionToken);
}

export async function setAutoJoin(
  sessionToken: string | undefined,
  enabled: boolean,
): Promise<AutoJoinState> {
  return callAutoJoin(sessionToken, enabled);
}

async function callAutoJoin(sessionToken: string | undefined, enabled?: boolean): Promise<AutoJoinState> {
  if (!sessionToken) return { needsRelogin: true };
  try {
    const response = await convexFetch(`${CONVEX_SITE_URL}/b2c/auto-join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enabled === undefined ? { sessionToken } : { sessionToken, enabled }),
    });
    return (await response.json()) as AutoJoinState;
  } catch (error) {
    console.error("[AutoJoin] request failed:", error);
    return { error: "Network error. Please check your connection." };
  }
}
