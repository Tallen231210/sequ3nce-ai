import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Zoom OAuth callback handler.
 *
 * Flow:
 * 1. Desktop app opens browser to Zoom OAuth consent screen
 * 2. User authorizes Zoom access
 * 3. Zoom redirects here with authorization code and state (closerId)
 * 4. We exchange the code for tokens (access + refresh)
 * 5. Save the tokens on the closer record via Convex mutation
 * 6. Trigger Meeting BaaS registration for Zoom credentials
 * 7. Redirect back to the desktop app or success page
 */
export async function GET(req: NextRequest) {
  const convex = getConvex();

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // Contains closerId
    const error = url.searchParams.get("error");

    // Handle Zoom OAuth errors
    if (error) {
      console.error("[Zoom OAuth] Error from Zoom:", error);
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=${encodeURIComponent(error)}&provider=zoom`,
          req.url
        )
      );
    }

    if (!code || !state) {
      console.error("[Zoom OAuth] Missing code or state");
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=missing_params&provider=zoom`,
          req.url
        )
      );
    }

    // The state contains the closerId
    const closerId = state as Id<"closers">;

    // Exchange authorization code for tokens
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    const redirectUri =
      process.env.ZOOM_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_APP_URL || "https://app.sequ3nce.ai"}/api/auth/zoom/callback`;

    if (!clientId || !clientSecret) {
      console.error("[Zoom OAuth] Missing ZOOM_CLIENT_ID or ZOOM_CLIENT_SECRET");
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=server_config&provider=zoom`,
          req.url
        )
      );
    }

    // Zoom requires Basic auth header with client_id:client_secret
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenResponse = await fetch("https://zoom.us/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      console.error(
        "[Zoom OAuth] Token exchange failed:",
        tokenData.error || tokenResponse.status,
        tokenData.reason
      );
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=token_exchange_failed&provider=zoom`,
          req.url
        )
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    if (!accessToken || !refreshToken) {
      console.error("[Zoom OAuth] Missing tokens in response");
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=no_tokens&provider=zoom`,
          req.url
        )
      );
    }

    // Save the Zoom tokens on the closer record
    await convex.mutation(api.zoomOAuth.saveZoomConnection, {
      closerId,
      accessToken,
      refreshToken,
    });

    console.log("[Zoom OAuth] Successfully saved Zoom connection for closer:", closerId);

    // Trigger Meeting BaaS registration for Zoom credentials
    // This is fire-and-forget; we don't wait for it to complete before redirecting
    try {
      await convex.action(api.zoomOAuth.registerZoomCredentialsWithMeetingBaas, {
        closerId,
      });
      console.log("[Zoom OAuth] Meeting BaaS Zoom registration triggered for closer:", closerId);
    } catch (baasError) {
      // Log but don't fail the OAuth flow if Meeting BaaS registration fails
      // It can be retried later
      console.error("[Zoom OAuth] Meeting BaaS registration failed (non-fatal):", baasError);
    }

    // Redirect to success page (which may redirect to desktop app via custom URL scheme)
    return NextResponse.redirect(
      new URL(
        `/oauth/callback?success=true&provider=zoom&closerId=${closerId}`,
        req.url
      )
    );
  } catch (err) {
    console.error("[Zoom OAuth] Unexpected error:", err);
    return NextResponse.redirect(
      new URL(
        `/oauth/callback?success=false&error=server_error&provider=zoom`,
        req.url
      )
    );
  }
}
