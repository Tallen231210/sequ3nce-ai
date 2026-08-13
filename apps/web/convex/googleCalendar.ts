import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { resolveEventColor } from "./lib/googleCalendarPalette";

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
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; syncedEvents: number }> => {
    // 1. Refresh access token (existing helper handles invalid_grant by
    //    clearing the connection, so we can assume the token is valid here
    //    or this throws).
    const accessToken = await ctx.runAction(
      internal.googleCalendar.refreshAccessToken,
      { closerId: args.closerId },
    );

    // 2. Get closer for attendee filtering + teamId for the lazy migration
    const closer = await ctx.runQuery(
      internal.googleCalendar.getCloserWithToken,
      { closerId: args.closerId },
    );
    if (!closer) throw new Error("Closer not found");

    // 3. Get enabled subscriptions. If the closer has none (existing user
    //    pre-multi-cal feature), lazy-create a "primary" subscription before
    //    proceeding. Transparent migration — no user action required.
    let subscriptions = (await ctx.runQuery(
      internal.closerCalendarSubscriptions
        .getEnabledSubscriptionsForCloserInternal,
      { closerId: args.closerId },
    )) as Array<{
      _id: Id<"closerCalendarSubscriptions">;
      googleCalendarId: string;
      label: string;
      calendarBackgroundColor?: string;
      accessRole?: string;
    }>;

    if (subscriptions.length === 0) {
      await ctx.runMutation(
        internal.closerCalendarSubscriptions.addPrimarySubscriptionInternal,
        { closerId: args.closerId },
      );
      subscriptions = (await ctx.runQuery(
        internal.closerCalendarSubscriptions
          .getEnabledSubscriptionsForCloserInternal,
        { closerId: args.closerId },
      )) as typeof subscriptions;
    }

    // 4. For each enabled subscription, fetch + upsert events.
    const nowDate = new Date();
    const sevenDaysAgo = new Date(
      nowDate.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    const thirtyDaysFromNow = new Date(
      nowDate.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
    const params = new URLSearchParams({
      timeMin: sevenDaysAgo.toISOString(),
      timeMax: thirtyDaysFromNow.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });

    let totalSynced = 0;

    for (const sub of subscriptions) {
      // Google's /calendars/{calendarId} endpoint takes a URL-encoded id.
      // "primary" is a special string + all real ids are already URL-safe
      // but encode defensively for shared calendars with special chars.
      const encodedCalendarId = encodeURIComponent(sub.googleCalendarId);
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedCalendarId}/events?${params}`;

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch (err) {
        // Network-level error. Log and continue to next sub — don't block
        // healthy subs because one is unreachable.
        console.error(
          `[Google Calendar] Network error syncing sub ${sub._id} (${sub.googleCalendarId}):`,
          err,
        );
        await ctx.runMutation(
          internal.closerCalendarSubscriptions
            .updateSubscriptionSyncStateInternal,
          {
            subscriptionId: sub._id,
            syncErrorCode: "other",
            lastSyncAt: Date.now(),
          },
        );
        continue;
      }

      if (!response.ok) {
        // 404 = calendar deleted in Google; 403 = permission revoked.
        // Auto-disable on 404 so we stop hammering a dead endpoint. Keep
        // 403 enabled in case the permission gets restored.
        if (response.status === 404) {
          await ctx.runMutation(
            internal.closerCalendarSubscriptions
              .updateSubscriptionSyncStateInternal,
            {
              subscriptionId: sub._id,
              syncErrorCode: "deleted",
              enabled: false,
              lastSyncAt: Date.now(),
            },
          );
        } else if (response.status === 403) {
          await ctx.runMutation(
            internal.closerCalendarSubscriptions
              .updateSubscriptionSyncStateInternal,
            {
              subscriptionId: sub._id,
              syncErrorCode: "forbidden",
              lastSyncAt: Date.now(),
            },
          );
        } else {
          await ctx.runMutation(
            internal.closerCalendarSubscriptions
              .updateSubscriptionSyncStateInternal,
            {
              subscriptionId: sub._id,
              syncErrorCode: "other",
              lastSyncAt: Date.now(),
            },
          );
        }
        const errorBody = await response.text();
        console.error(
          `[Google Calendar] ${response.status} for sub ${sub._id}: ${errorBody}`,
        );
        continue;
      }

      const data: {
        items?: GoogleCalendarEvent[];
        summary?: string;
        backgroundColor?: string;
      } = await response.json();

      // Refresh the subscription's cached backgroundColor if Google returned
      // one (events.list payload includes the calendar metadata at top level).
      if (
        data.backgroundColor &&
        data.backgroundColor !== sub.calendarBackgroundColor
      ) {
        await ctx.runMutation(
          internal.closerCalendarSubscriptions
            .updateSubscriptionSyncStateInternal,
          {
            subscriptionId: sub._id,
            calendarBackgroundColor: data.backgroundColor,
            syncErrorCode: null,
          },
        );
      }

      // Build the per-event payload. Resolve color via the standard palette:
      // event.colorId override > calendar backgroundColor > null (renderer
      // falls back to its own defaults).
      const effectiveBackgroundColor =
        data.backgroundColor ?? sub.calendarBackgroundColor ?? undefined;
      // freeBusyReader access only exposes the calendar's busy/free blocks
      // without titles. Show them clearly as "(Busy)" rather than the
      // misleading "Untitled" default (closes L1 from the review).
      const isFreeBusyOnly = sub.accessRole === "freeBusyReader";
      const events = (data.items ?? [])
        .filter((item) => item.status !== "cancelled")
        .map((item) => ({
          uid: item.id,
          title: item.summary || (isFreeBusyOnly ? "(Busy)" : "Untitled"),
          description: item.description || undefined,
          startTime: parseGoogleDateTime(item.start),
          endTime: parseGoogleDateTime(item.end),
          location: item.location || undefined,
          isAllDay: !!item.start.date && !item.start.dateTime,
          // When the booking was made. Google sends this on every event and we
          // used to throw it away, which made "how fast did the setter respond
          // after they booked" unanswerable for calendar-based teams.
          //
          // Caveat worth knowing: with singleEvents=true a recurring series is
          // expanded into instances that all carry the SERIES creation time.
          // Sales bookings are one-off so this is rarely wrong, but a recurring
          // internal meeting will report the day the series was set up.
          bookedAt: item.created ? Date.parse(item.created) || undefined : undefined,
          meetingUrl:
            extractMeetingUrl(item.location) ||
            extractMeetingUrl(item.description) ||
            item.hangoutLink ||
            undefined,
          attendees: extractProspectAttendees(
            item.attendees || [],
            closer.email,
          ),
          calendarColor:
            resolveEventColor(item.colorId, effectiveBackgroundColor) ??
            undefined,
        }));

      await ctx.runMutation(
        internal.googleCalendar.upsertSubscriptionEvents,
        {
          closerId: args.closerId,
          teamId: closer.teamId,
          subscriptionId: sub._id,
          subscriptionLabel: sub.label,
          events,
        },
      );

      await ctx.runMutation(
        internal.closerCalendarSubscriptions
          .updateSubscriptionSyncStateInternal,
        {
          subscriptionId: sub._id,
          lastSyncAt: Date.now(),
          syncErrorCode: null,
        },
      );
      totalSynced += events.length;
    }

    return { success: true, syncedEvents: totalSynced };
  },
});

/**
 * Per-subscription upsert. Scoped delete — only removes future events that
 * belong to THIS subscription and weren't matched in the current sync. Events
 * from other subscriptions or B2C connections are left alone.
 *
 * Dedup key is (closerId, uid, subscriptionId) so the same event appearing
 * on two subscribed sub-calendars produces two rows (Tyler's "show twice"
 * decision — easier for closers to see when something's double-booked).
 */
export const upsertSubscriptionEvents = internalMutation({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    subscriptionId: v.id("closerCalendarSubscriptions"),
    subscriptionLabel: v.string(),
    events: v.array(
      v.object({
        uid: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        startTime: v.number(),
        bookedAt: v.optional(v.number()),
        endTime: v.number(),
        location: v.optional(v.string()),
        isAllDay: v.optional(v.boolean()),
        meetingUrl: v.optional(v.string()),
        attendees: v.optional(
          v.array(
            v.object({
              email: v.string(),
              name: v.optional(v.string()),
              isOrganizer: v.optional(v.boolean()),
            }),
          ),
        ),
        calendarColor: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Use the by_subscription index (added in cleanup commit) so we don't
    // scan the entire closer event set on every sync (was a read-limit
    // risk per the review). For multi-cal closers (10 subs) this drops
    // reads by ~10x.
    const thisSubsEvents = await ctx.db
      .query("calendarEvents")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.subscriptionId))
      .collect();
    const existingByUid = new Map(thisSubsEvents.map((e) => [e.uid, e]));
    const matchedExistingIds = new Set<string>();
    const processedUids = new Set<string>();

    for (const event of args.events) {
      if (processedUids.has(event.uid)) continue;
      processedUids.add(event.uid);

      const existing = existingByUid.get(event.uid);
      if (existing) {
        matchedExistingIds.add(existing._id);
        await ctx.db.patch(existing._id, {
          uid: event.uid,
          title: event.title,
          description: event.description,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location,
          isAllDay: event.isAllDay,
          meetingUrl: event.meetingUrl,
          bookedAt: event.bookedAt,
          attendees: event.attendees,
          calendarColor: event.calendarColor,
          calendarLabel: args.subscriptionLabel,
          fetchedAt: now,
          // Only ever set, never cleared — losing a booking time we already
          // captured would silently break speed-from-booking.
          ...(event.bookedAt !== undefined ? { bookedAt: event.bookedAt } : {}),
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
          bookedAt: event.bookedAt,
          attendees: event.attendees,
          subscriptionId: args.subscriptionId,
          calendarColor: event.calendarColor,
          calendarLabel: args.subscriptionLabel,
          fetchedAt: now,
        });
      }
    }

    // Scoped delete — only events from THIS subscription that weren't in the
    // current sync. Don't touch events from other subscriptions (multi-cal
    // closers) or B2C events (those use calendarId, not subscriptionId).
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    for (const existing of thisSubsEvents) {
      if (
        !matchedExistingIds.has(existing._id) &&
        existing.startTime > oneDayAgo
      ) {
        await ctx.db.delete(existing._id);
      }
    }

    await ctx.db.patch(args.closerId, { calendarLastSyncAt: now });
    return { success: true, upserted: args.events.length };
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

/**
 * Sync all b2cCalendars for a specific closer. Public action so the
 * Electron app can call it from the Refresh button.
 */
export const syncB2cCalendarsForCloser = action({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args): Promise<{ synced: number; errors: number }> => {
    const calendars = await ctx.runQuery(
      internal.googleCalendar.getEnabledB2cGoogleCalendars
    );
    const myCalendars = calendars.filter((c) => c.closerId === args.closerId);

    let synced = 0;
    let errors = 0;
    for (const cal of myCalendars) {
      try {
        await ctx.runAction(internal.googleCalendar.fetchB2cCalendarEvents, {
          calendarId: cal._id,
        });
        synced++;
      } catch (err) {
        console.error(`[B2C Sync] Failed for calendar ${cal._id}:`, err);
        errors++;
      }
    }
    return { synced, errors };
  },
});

// ============================================
// HELPERS
// ============================================

/** Google Calendar API event type (subset of fields we use). */
interface GoogleCalendarEvent {
  id: string;
  status: string;
  /** RFC3339 creation time — when the booking was made. */
  created?: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  // Per-event color override (string "1"-"11"). When unset, the event takes
  // its calendar's default backgroundColor. We resolve to a hex at sync time
  // via lib/googleCalendarPalette.ts.
  colorId?: string;
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
      bookedAt: v.optional(v.number()),
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
          bookedAt: event.bookedAt,
          fetchedAt: now,
          attendees: event.attendees,
          calendarId: args.calendarId,
          calendarColor: event.calendarColor,
          calendarLabel: event.calendarLabel,
          ...(event.bookedAt !== undefined ? { bookedAt: event.bookedAt } : {}),
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
          bookedAt: event.bookedAt,
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
