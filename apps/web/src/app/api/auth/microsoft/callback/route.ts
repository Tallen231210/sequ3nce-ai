import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Microsoft/Outlook Calendar OAuth callback handler.
 *
 * Flow:
 * 1. Desktop app opens browser to Microsoft OAuth consent screen
 * 2. User authorizes Calendar access
 * 3. Microsoft redirects here with authorization code and state (closerId)
 * 4. We exchange the code for tokens (access + refresh)
 * 5. Save the refresh token on the closer record via Convex mutation
 * 6. Redirect back to the desktop app or success page
 */
export async function GET(req: NextRequest) {
  const convex = getConvex();

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // Contains closerId
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    // Handle Microsoft OAuth errors (e.g., user denied access)
    if (error) {
      console.error("[Microsoft OAuth] Error from Microsoft:", error, errorDescription);
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=${encodeURIComponent(error)}&provider=microsoft`,
          req.url
        )
      );
    }

    if (!code || !state) {
      console.error("[Microsoft OAuth] Missing code or state");
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=missing_params&provider=microsoft`,
          req.url
        )
      );
    }

    // The state contains the closerId
    const closerId = state as Id<"closers">;

    // Exchange authorization code for tokens
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirectUri =
      process.env.MICROSOFT_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_APP_URL || "https://sequ3nce.ai"}/api/auth/microsoft/callback`;

    if (!clientId || !clientSecret) {
      console.error("[Microsoft OAuth] Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET");
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=server_config&provider=microsoft`,
          req.url
        )
      );
    }

    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      console.error(
        "[Microsoft OAuth] Token exchange failed:",
        tokenData.error || tokenResponse.status,
        tokenData.error_description
      );
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=token_exchange_failed&provider=microsoft`,
          req.url
        )
      );
    }

    const refreshToken = tokenData.refresh_token;
    if (!refreshToken) {
      console.error("[Microsoft OAuth] No refresh token returned.");
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=no_refresh_token&provider=microsoft`,
          req.url
        )
      );
    }

    // Optionally get the user's email from Microsoft Graph
    let email = "";
    try {
      if (tokenData.access_token) {
        const userInfoResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });
        const userInfo = await userInfoResponse.json();
        email = userInfo.mail || userInfo.userPrincipalName || "";
      }
    } catch (userInfoError) {
      console.warn("[Microsoft OAuth] Failed to fetch user info:", userInfoError);
    }

    // Save the refresh token on the closer record
    await convex.mutation(api.calendarOAuth.saveMicrosoftCalendarConnection, {
      closerId,
      refreshToken,
      email,
    });

    console.log("[Microsoft OAuth] Successfully saved Microsoft Calendar connection for closer:", closerId);

    // Redirect to success page (which may redirect to desktop app via custom URL scheme)
    return NextResponse.redirect(
      new URL(
        `/oauth/callback?success=true&provider=microsoft&closerId=${closerId}`,
        req.url
      )
    );
  } catch (err) {
    console.error("[Microsoft OAuth] Unexpected error:", err);
    return NextResponse.redirect(
      new URL(
        `/oauth/callback?success=false&error=server_error&provider=microsoft`,
        req.url
      )
    );
  }
}
