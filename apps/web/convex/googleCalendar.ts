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

// ============================================
// B2C MULTI-CALENDAR SYNC (uses b2cCalendars table)
// ============================================

/** Get a b2cCalendar record by ID. */
export const getB2cCalendarById = internalQuery({
  args: { calendarId: v.id("b2cCalendars") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.calendarId);
  },
});

/** Get all enabled b2cCalendars with Google refresh tokens. */
export const getEnabledB2cGoogleCalendars = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("b2cCalendars").collect();
    return all.filter(
      (c) => c.isEnabled && c.googleRefreshToken && c.provider === "google"
    );
  },
});

/**
 * Refresh a Google OAuth access token using a b2cCalendar's refresh token.
 */
export const refreshB2cAccessToken = internalAction({
  args: { calendarId: v.id("b2cCalendars") },
  handler: async (ctx, args): Promise<string> => {
    const calendar = await ctx.runQuery(internal.googleCalendar.getB2cCalendarById, {
      calendarId: args.calendarId,
    });

    if (!calendar?.googleRefreshToken) {
      throw new Error("No Google Calendar refresh token found on b2cCalendar");
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
        refresh_token: calendar.googleRefreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      if (data.error === "invalid_grant") {
        // Mark the calendar as having a sync error so the UI can show "Reconnect"
        await ctx.runMutation(internal.b2cCalendars.markSyncError, {
          calendarId: args.calendarId,
          syncError: "Authorization revoked — please reconnect",
        });
        throw new Error("Google Calendar authorization revoked. User needs to reconnect.");
      }
      throw new Error(`Token refresh failed: ${data.error || response.status}`);
    }

    return data.access_token;
  },
});

/**
 * Fetch events from Google Calendar API for a b2cCalendar record.
 * Tags events with calendarId, calendarColor, and calendarLabel.
 */
export const fetchB2cCalendarEvents = internalAction({
  args: { calendarId: v.id("b2cCalendars") },
  handler: async (ctx, args): Promise<{ success: boolean; syncedEvents: number }> => {
    // 1. Get the calendar record
    const calendar = await ctx.runQuery(internal.googleCalendar.getB2cCalendarById, {
      calendarId: args.calendarId,
    });
    if (!calendar) throw new Error("Calendar record not found");

    // 2. Get the closer for attendee filtering
    const closer = await ctx.runQuery(internal.googleCalendar.getCloserWithToken, {
      closerId: calendar.closerId,
    });
    if (!closer) throw new Error("Closer not found");

    // 3. Get fresh access token
    const accessToken = await ctx.runAction(
      internal.googleCalendar.refreshB2cAccessToken,
      { calendarId: args.calendarId }
    );

    // 4. Fetch events from Google Calendar API
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      timeMin: sevenDaysAgo.toISOString(),
      timeMax: thirtyDaysFromNow.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Google Calendar API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();

    // 5. Transform to our event format with calendar metadata
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
          calendar.googleEmail || closer.email
        ),
        // Multi-calendar fields
        calendarId: args.calendarId,
        calendarColor: calendar.color,
        calendarLabel: calendar.label,
      }));

    // 6. Upsert events (using existing mutation but with calendar metadata)
    await ctx.runMutation(internal.googleCalendar.upsertB2cCalendarEvents, {
      closerId: calendar.closerId,
      teamId: calendar.teamId,
      calendarId: args.calendarId,
      events,
    });

    // 7. Mark sync success
    await ctx.runMutation(internal.b2cCalendars.markSyncSuccess, {
      calendarId: args.calendarId,
      lastSyncAt: Date.now(),
    });

    return { success: true, syncedEvents: events.length };
  },
});

/** Upsert calendar events with multi-calendar metadata. Deduplicates by uid + closerId + calendarId. */
export const upsertB2cCalendarEvents = internalMutation({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    calendarId: v.id("b2cCalendars"),
    events: v.array(v.object({
      uid: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
      startTime: v.number(),
      endTime: v.number(),
      location: v.optional(v.string()),
      isAllDay: v.optional(v.boolean()),
      meetingUrl: v.optional(v.string()),
      attendees: v.optional(v.array(v.object({
        email: v.string(),
        name: v.optional(v.string()),
        isOrganizer: v.optional(v.boolean()),
      }))),
      calendarId: v.id("b2cCalendars"),
      calendarColor: v.string(),
      calendarLabel: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const event of args.events) {
      // Check for existing event by uid + closer (may already exist from old single-calendar sync)
      const existing = await ctx.db
        .query("calendarEvents")
        .withIndex("by_closer_and_uid", (q) =>
          q.eq("closerId", args.closerId).eq("uid", event.uid)
        )
        .first();

      if (existing) {
        // Update existing event with new data + calendar metadata
        await ctx.db.patch(existing._id, {
          title: event.title,
          description: event.description,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location,
          isAllDay: event.isAllDay,
          meetingUrl: event.meetingUrl,
          fetchedAt: now,
          attendees: event.attendees,
          calendarId: args.calendarId,
          calendarColor: event.calendarColor,
          calendarLabel: event.calendarLabel,
        });
      } else {
        await ctx.db.insert("calendarEvents", {
          closerId: args.closerId,
          teamId: args.teamId,
          uid: event.uid,
          title: event.title,
          description: event.description,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location,
          isAllDay: event.isAllDay,
          meetingUrl: event.meetingUrl,
          fetchedAt: now,
          attendees: event.attendees,
          calendarId: args.calendarId,
          calendarColor: event.calendarColor,
          calendarLabel: event.calendarLabel,
        });
      }
    }

    // Delete future events for THIS calendar that are no longer in Google Calendar
    // (e.g., cancelled or deleted meetings). Only deletes events owned by this calendarId.
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const processedUids = new Set(args.events.map((e) => e.uid));
    const allExisting = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    for (const existing of allExisting) {
      if (
        existing.calendarId === args.calendarId &&
        existing.startTime > oneDayAgo &&
        !processedUids.has(existing.uid)
      ) {
        await ctx.db.delete(existing._id);
      }
    }
  },
});

/**
 * Sync all enabled b2cCalendars with Google Calendar API.
 * Called from the cron job alongside the legacy single-calendar sync.
 */
export const syncAllB2cCalendars = internalAction({
  args: {},
  handler: async (ctx) => {
    const calendars = await ctx.runQuery(
      internal.googleCalendar.getEnabledB2cGoogleCalendars
    );

    if (calendars.length === 0) return { synced: 0 };

    let synced = 0;
    for (const cal of calendars) {
      try {
        await ctx.runAction(internal.googleCalendar.fetchB2cCalendarEvents, {
          calendarId: cal._id,
        });
        synced++;
      } catch (err) {
        console.error(`[B2C Calendar Sync] Failed for calendar ${cal._id} (${cal.label}):`, err);
        try {
          await ctx.runMutation(internal.b2cCalendars.markSyncError, {
            calendarId: cal._id,
            syncError: err instanceof Error ? err.message : "Sync failed",
          });
        } catch {
          // swallow — don't let error reporting fail the whole sync
        }
      }
    }

    console.log(`[B2C Calendar Sync] Synced ${synced}/${calendars.length} calendars`);
    return { synced };
  },
});

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
