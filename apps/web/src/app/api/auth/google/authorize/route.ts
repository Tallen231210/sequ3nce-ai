import { NextRequest, NextResponse } from "next/server";

/**
 * Google Calendar OAuth authorization URL builder.
 *
 * Redirects the user to Google's OAuth consent screen.
 * The desktop app opens this URL in the user's browser.
 *
 * Query params:
 *   - closerId: The Convex closer ID (passed as OAuth state)
 *   - app: Optional app identifier (e.g. "personal") encoded into OAuth state
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const closerId = url.searchParams.get("closerId");
  const app = url.searchParams.get("app");
  const calendarLabel = url.searchParams.get("label"); // B2C multi-calendar: offer/company name

  // Manager Mode passes a one-time nonce instead of an id. The nonce was
  // minted by the signed-in manager, so it carries the identity — the callback
  // never has to be told whose calendar this is, and a forged state names
  // nobody.
  const managerNonce = url.searchParams.get("managerNonce");

  if (!closerId && !managerNonce) {
    return NextResponse.json(
      { error: "Missing closerId or managerNonce" },
      { status: 400 },
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("[Google OAuth] Missing GOOGLE_CLIENT_ID");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || "https://sequ3nce.ai"}/api/auth/google/callback`;

  // Encode app identifier and calendar label into state for the callback
  // Format: "closerId::app::label" (label is URL-encoded for safety)
  //
  // Manager state is a distinct prefixed form rather than a fourth positional
  // field, so the callback can tell the two apart by looking rather than by
  // guessing from the shape of an id. The closer format below is byte-for-byte
  // unchanged — desktop apps installed months ago build these URLs, and those
  // builds have to keep working.
  let state: string;
  if (managerNonce) {
    state = `mgr::${managerNonce}`;
  } else {
    state = closerId!;
    if (app) state += `::${app}`;
    else state += `::`;
    if (calendarLabel) state += `::${encodeURIComponent(calendarLabel)}`;
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  // Two scopes (space-separated): events.readonly lets us sync events; the
  // separate calendarlist.readonly is what `calendarList.list` needs for the
  // multi-calendar sub-calendar picker. The picker fails 403 without the
  // second scope — events.readonly alone reads events but can't enumerate
  // which calendars exist. Closers connected before this change have tokens
  // missing the second scope and need to disconnect + reconnect Google
  // Calendar from Settings to pick up the new scope.
  authUrl.searchParams.set(
    "scope",
    [
      "https://www.googleapis.com/auth/calendar.events.readonly",
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    ].join(" "),
  );
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
