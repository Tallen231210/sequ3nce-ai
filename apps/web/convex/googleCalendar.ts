import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================
// INTERNAL QUERIES
// ============================================

/** Get a closer by ID with token fields. */
export const getCloserWithToken = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.closerId);
  },
});

/** Get all active closers with a Google Calendar refresh token. */
export const getClosersWithGoogleCalendar = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allClosers = await ctx.db.query("closers").collect();
    return allClosers.filter(
      (c) =>
        c.googleCalendarRefreshToken &&
        c.calendarProvider === "google" &&
        c.status === "active"
    );
  },
});

// ============================================
// INTERNAL MUTATIONS
// ============================================

/** Clear Google Calendar connection when token is revoked or invalid. */
export const clearGoogleConnection = internalMutation({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return;

    await ctx.db.patch(args.closerId, {
      googleCalendarRefreshToken: undefined,
      calendarProvider: undefined,
      calendarConnectedAt: undefined,
    });
  },
});

// ============================================
// INTERNAL ACTIONS
// ============================================

/**
 * Refresh a Google OAuth access token using the stored refresh token.
 * Returns a short-lived access token for Calendar API calls.
 */
export const refreshAccessToken = internalAction({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args): Promise<string> => {
    const closer = await ctx.runQuery(internal.googleCalendar.getCloserWithToken, {
      closerId: args.closerId,
    });

    if (!closer?.googleCalendarRefreshToken) {
      throw new Error("No Google Calendar refresh token found");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: closer.googleCalendarRefreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      // If token is revoked or expired, clear the connection
      if (data.error === "invalid_grant") {
        await ctx.runMutation(internal.googleCalendar.clearGoogleConnection, {
          closerId: args.closerId,
        });
        throw new Error(
          "Google Calendar authorization revoked. User needs to reconnect."
        );
      }
      throw new Error(`Token refresh failed: ${data.error || response.status}`);
    }

    return data.access_token;
  },
});

/**
 * Fetch events from Google Calendar API and upsert them into calendarEvents.
 * Extracts attendee emails for prospect identification.
 */
export const fetchGoogleCalendarEvents = internalAction({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args): Promise<{ success: boolean; syncedEvents: number }> => {
    // 1. Get fresh access token
    const accessToken = await ctx.runAction(
      internal.googleCalendar.refreshAccessToken,
      { closerId: args.closerId }
    );

    // 2. Get closer info for attendee filtering
    const closer = await ctx.runQuery(internal.googleCalendar.getCloserWithToken, {
      closerId: args.closerId,
    });
    if (!closer) throw new Error("Closer not found");

    // 3. Fetch events from Google Calendar API
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      timeMin: sevenDaysAgo.toISOString(),
      timeMax: thirtyDaysFromNow.toISOString(),
      singleEvents: "true", // Expand recurring events
      orderBy: "startTime",
      maxResults: "250",
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Google Calendar API error ${response.status}: ${errorBody}`
      );
    }

    const data = await response.json();

    // 4. Transform to our event format
    const events = (data.items || [])
      .filter((item: GoogleCalendarEvent) => item.status !== "cancelled")
      .map((item: GoogleCalendarEvent) => ({
        uid: item.id,
        title: item.summary || "Untitled",
        description: item.description || undefined,
        startTime: parseGoogleDateTime(item.start),
        endTime: parseGoogleDateTime(item.end),
        location: item.location || undefined,
        isAllDay: !!item.start.date && !item.start.dateTime,
        meetingUrl:
          extractMeetingUrl(item.location) ||
          extractMeetingUrl(item.description) ||
          item.hangoutLink ||
          undefined,
        attendees: extractProspectAttendees(
          item.attendees || [],
          closer.email
        ),
      }));

    // 5. Upsert events with attendees
    await ctx.runMutation(internal.calendar.upsertCalendarEventsWithAttendees, {
      closerId: args.closerId,
      teamId: closer.teamId,
      events,
    });

    return { success: true, syncedEvents: events.length };
  },
});

/**
 * Sync a single closer's Google Calendar. Exposed as a public action
 * so it can be triggered from the desktop app after OAuth connection.
 */
export const syncGoogleCalendar = action({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args): Promise<{ success: boolean; syncedEvents?: number; error?: string }> => {
    try {
      const result = await ctx.runAction(
        internal.googleCalendar.fetchGoogleCalendarEvents,
        { closerId: args.closerId }
      );
      return result;
    } catch (error) {
      console.error(
        `Google Calendar sync failed for closer ${args.closerId}:`,
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============================================
// HELPERS
// ============================================

/** Google Calendar API event type (subset of fields we use). */
interface GoogleCalendarEvent {
  id: string;
  status: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: Array<{
    email: string;
    displayName?: string;
    self?: boolean;
    organizer?: boolean;
    responseStatus?: string;
  }>;
}

/** Parse Google Calendar datetime object to Unix timestamp. */
function parseGoogleDateTime(dt: { dateTime?: string; date?: string }): number {
  if (dt.dateTime) return new Date(dt.dateTime).getTime();
  if (dt.date) return new Date(dt.date).getTime();
  return Date.now();
}

/**
 * Extract prospect attendees from a Google Calendar event.
 * Filters out the closer themselves and same-domain team members.
 */
function extractProspectAttendees(
  attendees: Array<{
    email: string;
    displayName?: string;
    self?: boolean;
    organizer?: boolean;
  }>,
  closerEmail: string
): Array<{ email: string; name?: string; isOrganizer?: boolean }> {
  const closerDomain = closerEmail.split("@")[1]?.toLowerCase();

  return attendees
    .filter((a) => !a.self) // Remove calendar owner
    .filter((a) => a.email.toLowerCase() !== closerEmail.toLowerCase())
    .filter((a) => {
      // Filter out same-domain emails (likely team members)
      // But keep common domains (gmail, outlook, etc.) since prospects use those too
      const domain = a.email.split("@")[1]?.toLowerCase();
      const commonDomains = [
        "gmail.com", "googlemail.com", "outlook.com", "hotmail.com",
        "yahoo.com", "icloud.com", "me.com", "aol.com", "protonmail.com",
        "live.com", "msn.com",
      ];
      if (commonDomains.includes(domain)) return true;
      return domain !== closerDomain;
    })
    .map((a) => ({
      email: a.email,
      name: a.displayName || undefined,
      isOrganizer: a.organizer || undefined,
    }));
}

/** Extract meeting URL from text (location, description, etc.). */
function extractMeetingUrl(text: string | null | undefined): string | undefined {
  if (!text) return undefined;

  const patterns = [
    /https?:\/\/(?:[\w-]+\.)?zoom\.us\/j\/\d+(?:\?[^\s<"']*)*/i,
    /https?:\/\/(?:[\w-]+\.)?zoom\.us\/my\/[^\s<"']+/i,
    /https?:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i,
    /https?:\/\/teams\.microsoft\.com\/[^\s<"']+/i,
    /https?:\/\/(?:[\w-]+\.)?webex\.com\/[^\s<"']+/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].replace(/[>)\]"']+$/, "");
    }
  }

  return undefined;
}
