import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

// ============================================================================
// GoHighLevel Marketplace App — OAuth callback route.
//
// GHL redirects here after the user authorizes the install on their side:
//   https://sequ3nce.ai/api/ghl-marketplace/oauth/callback?code=<code>&state=<teamId>
//
// We hand the code off to a Convex action that exchanges it for tokens,
// encrypts them, and persists the install. This route just orchestrates
// the redirect dance — no business logic lives here.
//
// State convention: state === teamId (mirrors the Slack OAuth pattern at
// apps/web/src/app/api/slack/callback/route.ts:1-65). The user clicked
// "Install" from the Setter Data Settings tab, which seeded teamId from
// their authenticated session — we trust the echo back.
// ============================================================================

const SETTER_DATA_TAB = "/dashboard/setter-data?tab=settings";

const getConvex = () => new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(req: Request) {
  const convex = getConvex();

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // teamId
    const oauthError = url.searchParams.get("error");
    const oauthErrorDescription = url.searchParams.get("error_description");

    // GHL surfaces user-cancellation and consent-denial as ?error=... params.
    if (oauthError) {
      console.error("[GHL OAuth] Error from GoHighLevel:", oauthError, oauthErrorDescription);
      return redirectWithError(
        req,
        oauthErrorDescription || oauthError || "authorization_denied",
      );
    }

    if (!code || !state) {
      console.error("[GHL OAuth] Missing code or state on callback");
      return redirectWithError(req, "missing_params");
    }

    const teamId = state as Id<"teams">;

    const result = await convex.action(api.setterGhlOauthActions.exchangeCodeForTokens, {
      code,
      teamId,
    });

    if (!result.success) {
      console.error("[GHL OAuth] Token exchange failed:", result.error);
      return redirectWithError(req, result.error || "exchange_failed");
    }

    // Success — bounce the user to the Setter Data settings tab with a
    // success flag so the UI can show a "Connected!" toast.
    const successUrl = new URL(SETTER_DATA_TAB, req.url);
    successUrl.searchParams.set("connected", "1");
    if (result.locationId) {
      successUrl.searchParams.set("location_id", result.locationId);
    }
    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error("[GHL OAuth] Unexpected error:", err);
    return redirectWithError(req, "server_error");
  }
}

/**
 * Redirect back to the Setter Data tab with a `ghl_error` query param so
 * the Settings UI can render a user-readable error message.
 */
function redirectWithError(req: Request, error: string): NextResponse {
  const errorUrl = new URL(SETTER_DATA_TAB, req.url);
  errorUrl.searchParams.set("ghl_error", error);
  return NextResponse.redirect(errorUrl);
}
