import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import { Id } from "../../../../../../convex/_generated/dataModel";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Google Calendar OAuth callback handler.
 *
 * Flow:
 * 1. Desktop app opens browser to Google OAuth consent screen
 * 2. User authorizes Google Calendar access
 * 3. Google redirects here with authorization code and state (closerId)
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

    // Handle Google OAuth errors (e.g., user denied access)
    if (error) {
      console.error("[Google OAuth] Error from Google:", error);
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=${encodeURIComponent(error)}&provider=google`,
          req.url
        )
      );
    }

    if (!code || !state) {
      console.error("[Google OAuth] Missing code or state");
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=missing_params&provider=google`,
          req.url
        )
      );
    }

    // State format: "closerId::app::label" (label is URL-encoded)
    const stateParts = (state || "").split("::");
    const closerId = stateParts[0];
    const app = stateParts[1] || undefined;
    const calendarLabel = stateParts[2] ? decodeURIComponent(stateParts[2]) : undefined;
    const typedCloserId = closerId as Id<"closers">;

    // Exchange authorization code for tokens
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_APP_URL || "https://sequ3nce.ai"}/api/auth/google/callback`;

    if (!clientId || !clientSecret) {
      console.error("[Google OAuth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=server_config&provider=google`,
          req.url
        )
      );
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
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
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      console.error("[Google OAuth] Token exchange failed:", tokenData.error || tokenResponse.status);
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=token_exchange_failed&provider=google`,
          req.url
        )
      );
    }

    const refreshToken = tokenData.refresh_token;
    if (!refreshToken) {
      console.error("[Google OAuth] No refresh token returned. User may need to re-authorize with prompt=consent.");
      return NextResponse.redirect(
        new URL(
          `/oauth/callback?success=false&error=no_refresh_token&provider=google`,
          req.url
        )
      );
    }

    // Optionally get the user's email from the ID token or userinfo endpoint
    let email = "";
    try {
      if (tokenData.access_token) {
        const userInfoResponse = await fetch(
          "https://www.googleapis.com/oauth2/v2/userinfo",
          {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
            },
          }
        );
        const userInfo = await userInfoResponse.json();
        email = userInfo.email || "";
      }
    } catch (userInfoError) {
      console.warn("[Google OAuth] Failed to fetch user info:", userInfoError);
    }

    // For B2C Personal app: create/update a b2cCalendars record.
    // Do NOT overwrite the closers table token — the legacy sync uses it for
    // the original calendar, and overwriting breaks that connection.
    if (app === "personal" && calendarLabel) {
      try {
        const closer = await convex.query(api.calendarOAuth.getCloserById, {
          closerId: typedCloserId,
        });
        if (closer) {
          // Only update the closers table token if this is the FIRST calendar connection
          // (no existing b2cCalendar records). Otherwise leave it alone.
          const existingCalendars = await convex.query(api.b2cCalendars.getCalendars, {
            closerId: typedCloserId,
          });
          if (existingCalendars.length === 0) {
            await convex.mutation(api.calendarOAuth.saveGoogleCalendarConnection, {
              closerId: typedCloserId,
              refreshToken,
              email,
            });
          }

          await convex.mutation(api.b2cCalendars.addCalendar, {
            closerId: typedCloserId,
            teamId: closer.teamId,
            label: calendarLabel,
            provider: "google",
            googleRefreshToken: refreshToken,
            googleEmail: email,
          });
          console.log("[Google OAuth] Created b2cCalendar record:", calendarLabel, email);
        }
      } catch (b2cErr) {
        console.warn("[Google OAuth] b2cCalendar creation failed (non-fatal):", b2cErr);
      }
    } else {
      // Non-B2C apps (B2B Desktop): save directly on closers table as before
      await convex.mutation(api.calendarOAuth.saveGoogleCalendarConnection, {
        closerId: typedCloserId,
        refreshToken,
        email,
      });
    }

    console.log("[Google OAuth] Successfully saved Google Calendar connection for closer:", typedCloserId);

    // Redirect to success page (which may redirect to desktop app via custom URL scheme)
    const appParam = app ? `&app=${encodeURIComponent(app)}` : "";
    return NextResponse.redirect(
      new URL(
        `/oauth/callback?success=true&provider=google&closerId=${typedCloserId}${appParam}`,
        req.url
      )
    );
  } catch (err) {
    console.error("[Google OAuth] Unexpected error:", err);
    return NextResponse.redirect(
      new URL(
        `/oauth/callback?success=false&error=server_error&provider=google`,
        req.url
      )
    );
  }
}
