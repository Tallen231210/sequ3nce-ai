"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { encryptApiKey, decryptApiKey } from "./lib/encrypt";

// ============================================================================
// Setter Data — GoHighLevel OAuth actions (Node runtime).
//
// Handles the HTTP work that V8-isolate code can't do: token endpoint
// fetches and AES-256-GCM encryption of the resulting tokens. Convex
// state changes happen via ctx.runMutation calls into setterGhlOauth.ts.
// ============================================================================

const GHL_TOKEN_ENDPOINT = "https://services.leadconnectorhq.com/oauth/token";

// Tokens we ask for at install time. Phase 1 needs read access to contacts,
// conversations, and users. Calendars + opportunities are added in Phase 2/3
// (the user re-authorizes when we expand scopes — same OAuth flow).
const PHASE_1_SCOPES = [
  "contacts.readonly",
  "conversations.readonly",
  "conversations/message.readonly",
  "users.readonly",
  "locations.readonly",
] as const;

// ----------------------------------------------------------------------------
// PUBLIC ACTION: exchange OAuth code for tokens, called from the Next.js
// callback route after GHL redirects back with ?code=...&state=<teamId>
// ----------------------------------------------------------------------------

export const exchangeCodeForTokens = action({
  args: {
    code: v.string(),
    teamId: v.id("teams"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { success: true; locationId: string; locationName?: string }
    | { success: false; error: string }
  > => {
    const clientId = process.env.GHL_CLIENT_ID;
    const clientSecret = process.env.GHL_CLIENT_SECRET;
    const redirectUri =
      process.env.GHL_REDIRECT_URI ||
      "https://sequ3nce.ai/api/ghl-marketplace/oauth/callback";

    if (!clientId || !clientSecret) {
      console.error("[GHL OAuth] Missing client credentials in env");
      return { success: false, error: "GoHighLevel credentials not configured" };
    }

    // Exchange the authorization code for an access + refresh token pair.
    // GHL's token endpoint expects form-urlencoded, NOT JSON.
    let tokenResponse: TokenResponse;
    try {
      tokenResponse = await postTokenEndpoint({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code: args.code,
        user_type: "Location",
        redirect_uri: redirectUri,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[GHL OAuth] Token exchange failed:", message);
      return { success: false, error: `Token exchange failed: ${message}` };
    }

    // GHL returns locationId + companyId on the token response when
    // user_type=Location. We trust these over anything in the redirect URL
    // since the token response is the authoritative scope binding.
    const locationId = tokenResponse.locationId;
    if (!locationId) {
      console.error("[GHL OAuth] Token response missing locationId");
      return { success: false, error: "GoHighLevel did not return a location" };
    }

    const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

    // Encrypt before crossing the action → mutation boundary. The mutation
    // runs in V8 isolate which can't access ENCRYPTION_KEY env var.
    const encryptedAccessToken = encryptApiKey(tokenResponse.access_token);
    const encryptedRefreshToken = encryptApiKey(tokenResponse.refresh_token);

    // Scopes returned by GHL may differ from what we asked for (user can
    // narrow). Persist what was actually granted so we can detect
    // missing-scope errors later and prompt re-auth.
    const grantedScopes = tokenResponse.scope
      ? tokenResponse.scope.split(/\s+/).filter(Boolean)
      : Array.from(PHASE_1_SCOPES);

    await ctx.runMutation(internal.setterGhlOauth.upsertInstallation, {
      teamId: args.teamId,
      locationId,
      // GHL doesn't return locationName on the token response — we'll fetch
      // it from /locations/:id during the first sync. Leave undefined here.
      locationName: undefined,
      companyId: tokenResponse.companyId,
      encryptedAccessToken,
      encryptedRefreshToken,
      expiresAt,
      scopes: grantedScopes,
    });

    // TODO (Phase 1.6): schedule fast backfill once setterGhlSync is built.
    // ctx.scheduler.runAfter(0, internal.setterGhlSync.fastBackfill, { ... });

    return {
      success: true,
      locationId,
    };
  },
});

// ----------------------------------------------------------------------------
// INTERNAL ACTION: refresh expired access tokens. Called by the REST client
// wrapper on 401 (lazy refresh) and by an hourly cron (proactive refresh).
// ----------------------------------------------------------------------------

export const refreshAccessToken = internalAction({
  args: {
    installationId: v.id("setterGhlInstallations"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    { success: true; accessToken: string; expiresAt: number } | { success: false; error: string }
  > => {
    const clientId = process.env.GHL_CLIENT_ID;
    const clientSecret = process.env.GHL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return { success: false, error: "GoHighLevel credentials not configured" };
    }

    const installation = await ctx.runQuery(
      internal.setterGhlOauth.getInstallationById,
      { installationId: args.installationId },
    );

    if (!installation) {
      return { success: false, error: "Installation not found" };
    }

    if (installation.status === "uninstalled") {
      return { success: false, error: "Installation is uninstalled" };
    }

    let refreshToken: string;
    try {
      refreshToken = decryptApiKey(installation.refreshToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await ctx.runMutation(internal.setterGhlOauth.markInstallationError, {
        installationId: args.installationId,
        errorMessage: `Could not decrypt refresh token: ${message}`,
      });
      return { success: false, error: "Could not decrypt refresh token" };
    }

    let tokenResponse: TokenResponse;
    try {
      tokenResponse = await postTokenEndpoint({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        user_type: "Location",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // Refresh failures are usually permanent — refresh_token expired (1y)
      // or customer revoked at GHL. Mark installation errored so the UI
      // prompts reinstall.
      await ctx.runMutation(internal.setterGhlOauth.markInstallationError, {
        installationId: args.installationId,
        errorMessage: `Token refresh failed: ${message}`,
      });
      return { success: false, error: `Token refresh failed: ${message}` };
    }

    const expiresAt = Date.now() + tokenResponse.expires_in * 1000;
    const encryptedAccessToken = encryptApiKey(tokenResponse.access_token);
    const encryptedRefreshToken = encryptApiKey(tokenResponse.refresh_token);

    await ctx.runMutation(internal.setterGhlOauth.patchInstallationTokens, {
      installationId: args.installationId,
      encryptedAccessToken,
      encryptedRefreshToken,
      expiresAt,
    });

    return {
      success: true,
      accessToken: tokenResponse.access_token,
      expiresAt,
    };
  },
});

// ----------------------------------------------------------------------------
// HTTP HELPER
// ----------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
  userType?: string;
  companyId?: string;
  locationId?: string;
}

/**
 * POST to GHL's OAuth token endpoint. Used for both initial code-exchange
 * and refresh flows. GHL expects application/x-www-form-urlencoded.
 */
async function postTokenEndpoint(params: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(GHL_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params),
  });

  // Read body once. GHL returns JSON for both success and error responses.
  const text = await response.text();
  let data: TokenResponse | { error?: string; error_description?: string; message?: string };
  try {
    data = JSON.parse(text) as
      | TokenResponse
      | { error?: string; error_description?: string; message?: string };
  } catch {
    throw new Error(
      `GHL token endpoint returned non-JSON response (${response.status}): ${text.slice(0, 200)}`,
    );
  }

  if (!response.ok) {
    const errorPayload = data as { error?: string; error_description?: string; message?: string };
    const reason =
      errorPayload.error_description ||
      errorPayload.error ||
      errorPayload.message ||
      `HTTP ${response.status}`;
    throw new Error(reason);
  }

  const successPayload = data as TokenResponse;
  if (!successPayload.access_token || !successPayload.refresh_token) {
    throw new Error("Token response missing access_token or refresh_token");
  }

  return successPayload;
}
