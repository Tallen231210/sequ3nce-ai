import { v } from "convex/values";
import { query, mutation, action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================
// QUERIES
// ============================================

// Get calendar connection status for a closer
export const getCloserCalendarStatus = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return null;

    return {
      connected: !!closer.icsUrl || !!closer.googleCalendarRefreshToken,
      provider: closer.calendarProvider || (closer.icsUrl ? "ics" : null),
      icsUrl: closer.icsUrl,
      connectedAt: closer.calendarConnectedAt,
      lastSynced: closer.calendarLastSyncAt,
    };
  },
});

// Get calendar status for a closer by email and team (for desktop app)
export const getCloserCalendarStatusByEmail = query({
  args: {
    email: v.string(),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) => q.eq(q.field("teamId"), args.teamId))
      .first();
    if (!closer) return null;

    return {
      closerId: closer._id,
      connected: !!closer.icsUrl || !!closer.googleCalendarRefreshToken,
      provider: closer.calendarProvider || (closer.icsUrl ? "ics" : null),
      icsUrl: closer.icsUrl,
      connectedAt: closer.calendarConnectedAt,
      lastSynced: closer.calendarLastSyncAt,
    };
  },
});

// Get events for a specific closer within a date range
export const getCloserEvents = query({
  args: {
    closerId: v.id("closers"),
    startDate: v.number(), // Unix timestamp
    endDate: v.number(), // Unix timestamp
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    // Filter by date range
    return events
      .filter((e) => e.startTime >= args.startDate && e.startTime <= args.endDate)
      .sort((a, b) => a.startTime - b.startTime);
  },
});

// Get next upcoming event for a closer (used for Slack notifications)
export const getNextEventForCloser = query({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    // Find next event that starts after now
    const futureEvents = events
      .filter((e) => e.startTime > now)
      .sort((a, b) => a.startTime - b.startTime);

    return futureEvents[0] || null;
  },
});

// Get events for a closer by email and team (for desktop app)
export const getCloserEventsByEmail = query({
  args: {
    email: v.string(),
    teamId: v.id("teams"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) => q.eq(q.field("teamId"), args.teamId))
      .first();
    if (!closer) return [];

    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
      .collect();

    // Hide events from disabled sub-calendar subscriptions (B2B multi-cal).
    // Events with no subscriptionId (ICS users, pre-multi-cal Google events)
    // always show. Only events linked to an explicitly-disabled sub get
    // filtered — matches plan behavior of "preserve label preference, hide
    // events until re-enabled."
    const subs = await ctx.db
      .query("closerCalendarSubscriptions")
      .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
      .collect();
    const disabledSubIds = new Set(
      subs.filter((s) => !s.enabled).map((s) => s._id as string),
    );

    return events
      .filter((e) => e.startTime >= args.startDate && e.startTime <= args.endDate)
      .filter(
        (e) =>
          !e.subscriptionId || !disabledSubIds.has(e.subscriptionId as string),
      )
      .sort((a, b) => a.startTime - b.startTime);
  },
});

// Get team events for web dashboard
export const getTeamEvents = query({
  args: {
    clerkId: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    closerIds: v.optional(v.array(v.id("closers"))), // Optional filter
  },
  handler: async (ctx, args) => {
    // Get user and team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return [];

    // Get closers on the team
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    // Filter closers if specified
    const targetCloserIds = args.closerIds || closers.map((c) => c._id);

    // Get events for target closers
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q) => q.eq("teamId", user.teamId))
      .collect();

    // Pull all disabled subscriptions for the target closers so we can hide
    // their events (matches the same filter applied in the closer's desktop
    // view). One-shot fetch since N closers is small.
    const allSubs = await ctx.db
      .query("closerCalendarSubscriptions")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();
    const disabledSubIds = new Set(
      allSubs.filter((s) => !s.enabled).map((s) => s._id as string),
    );

    // Filter by date range, target closers, and enabled subscription state.
    // Events without a subscriptionId (ICS / legacy single-cal sync) always
    // pass through.
    const filteredEvents = events.filter(
      (e) =>
        e.startTime >= args.startDate &&
        e.startTime <= args.endDate &&
        targetCloserIds.includes(e.closerId) &&
        (!e.subscriptionId || !disabledSubIds.has(e.subscriptionId as string))
    );

    // Attach closer info
    const closerMap = new Map(closers.map((c) => [c._id, c]));

    return filteredEvents
      .map((event) => {
        const closer = closerMap.get(event.closerId);
        const name = closer?.name || "Unknown";
        const initials = name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2);
        return {
          ...event,
          closerName: name,
          closerEmail: closer?.email || "",
          closerInitials: initials,
        };
      })
      .sort((a, b) => a.startTime - b.startTime);
  },
});

// Get calendar connection status for all closers on a team
export const getTeamCalendarStatus = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return [];

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    return closers.map((closer) => ({
      closerId: closer._id,
      name: closer.name,
      email: closer.email,
      connected: !!closer.icsUrl || !!closer.googleCalendarRefreshToken,
      provider: closer.calendarProvider || (closer.icsUrl ? "ics" : null),
      lastSynced: closer.calendarLastSyncAt,
    }));
  },
});

// ============================================
// MUTATIONS
// ============================================

// Connect a calendar via ICS URL
export const connectCalendar = mutation({
  args: {
    closerId: v.id("closers"),
    icsUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate URL format (basic check)
    const url = args.icsUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      throw new Error("Invalid URL format. URL must start with http:// or https://");
    }

    // Update closer with ICS URL
    const existing = await ctx.db.get(args.closerId);
    await ctx.db.patch(args.closerId, {
      icsUrl: url,
      calendarConnectedAt: Date.now(),
      // Same default as the OAuth paths — see calendarOAuth.ts.
      autoJoinEnabled: (existing as any)?.autoJoinEnabled ?? true,
    });

    return { success: true };
  },
});

// Connect calendar by closer email and team (for desktop app)
export const connectCalendarByEmail = mutation({
  args: {
    email: v.string(),
    teamId: v.id("teams"),
    icsUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) => q.eq(q.field("teamId"), args.teamId))
      .first();
    if (!closer) {
      throw new Error("Closer not found for this team");
    }

    const url = args.icsUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      throw new Error("Invalid URL format. URL must start with http:// or https://");
    }

    await ctx.db.patch(closer._id, {
      icsUrl: url,
      calendarConnectedAt: Date.now(),
      autoJoinEnabled: (closer as any).autoJoinEnabled ?? true,
    });

    return { success: true, closerId: closer._id };
  },
});

// Disconnect calendar and delete all events
export const disconnectCalendar = mutation({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    // Clear all calendar fields (ICS + Google/Microsoft OAuth)
    await ctx.db.patch(args.closerId, {
      icsUrl: undefined,
      calendarConnectedAt: undefined,
      calendarLastSyncAt: undefined,
      googleCalendarRefreshToken: undefined,
      microsoftCalendarRefreshToken: undefined,
      calendarProvider: undefined,
      calendarOnboardingCompleted: undefined,
    });

    // Delete all calendar events for this closer
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    return { success: true, deletedEvents: events.length };
  },
});

// Disconnect calendar by email and team (for desktop app)
export const disconnectCalendarByEmail = mutation({
  args: {
    email: v.string(),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) => q.eq(q.field("teamId"), args.teamId))
      .first();
    if (!closer) {
      throw new Error("Closer not found for this team");
    }

    // Clear all calendar fields (ICS + Google/Microsoft OAuth)
    await ctx.db.patch(closer._id, {
      icsUrl: undefined,
      calendarConnectedAt: undefined,
      calendarLastSyncAt: undefined,
      googleCalendarRefreshToken: undefined,
      microsoftCalendarRefreshToken: undefined,
      calendarProvider: undefined,
      calendarOnboardingCompleted: undefined,
    });

    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
      .collect();

    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    // Wipe multi-cal subscriptions too. The picker has no way to deal with
    // ghost rows pointing at the old account, and the next sync would 404 on
    // every one of them. Cleaner to start fresh on reconnect. The OAuth
    // callback re-creates a primary subscription automatically.
    const subs = await ctx.db
      .query("closerCalendarSubscriptions")
      .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
      .collect();
    for (const sub of subs) {
      await ctx.db.delete(sub._id);
    }

    return {
      success: true,
      deletedEvents: events.length,
      deletedSubscriptions: subs.length,
    };
  },
});

// ============================================
// INTERNAL MUTATIONS (for syncing)
// ============================================

// Internal: Upsert calendar events for a closer
export const upsertCalendarEvents = internalMutation({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    events: v.array(
      v.object({
        uid: v.string(),
        title: v.string(),
        description: v.optional(v.string()),
        startTime: v.number(),
        endTime: v.number(),
        location: v.optional(v.string()),
        isAllDay: v.optional(v.boolean()),
        meetingUrl: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get existing events for this closer
    const existingEvents = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    // Primary lookup by UID
    const existingByUid = new Map(existingEvents.map((e) => [e.uid, e]));

    // Secondary lookup by title + startTime (within 2 hour tolerance for timezone edge cases)
    // This helps catch duplicates where UID might differ
    const TIME_TOLERANCE_MS = 2 * 60 * 60 * 1000; // 2 hours
    function findByTitleAndTime(title: string, startTime: number) {
      return existingEvents.find(
        (e) =>
          e.title === title &&
          Math.abs(e.startTime - startTime) < TIME_TOLERANCE_MS
      );
    }

    // Track which existing events we've matched (to avoid deleting them)
    const matchedExistingIds = new Set<string>();
    // Track which incoming events we've processed (to avoid duplicates in same sync)
    const processedKeys = new Set<string>();

    // Upsert incoming events
    for (const event of args.events) {
      // Create a key for dedup within this sync batch
      const eventKey = `${event.title}|${Math.floor(event.startTime / TIME_TOLERANCE_MS)}`;
      if (processedKeys.has(eventKey)) {
        // Skip duplicate within the same ICS feed
        continue;
      }
      processedKeys.add(eventKey);

      // Try to find existing event by UID first, then by title+time
      let existing = existingByUid.get(event.uid);
      if (!existing) {
        existing = findByTitleAndTime(event.title, event.startTime);
      }

      if (existing) {
        // Update existing event (also update UID in case it changed)
        matchedExistingIds.add(existing._id);
        await ctx.db.patch(existing._id, {
          uid: event.uid, // Update UID to latest
          title: event.title,
          description: event.description,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location,
          isAllDay: event.isAllDay,
          meetingUrl: event.meetingUrl,
          fetchedAt: now,
        });
      } else {
        // Create new event
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
        });
      }
    }

    // Delete events that are no longer in the feed (and are in the future)
    // Only delete if not matched by the new dedup logic.
    // Skip events owned by a b2cCalendar — they're managed by the B2C sync.
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    for (const existing of existingEvents) {
      if (!matchedExistingIds.has(existing._id) && existing.startTime > oneDayAgo) {
        if (existing.calendarId) continue;
        await ctx.db.delete(existing._id);
      }
    }

    // Update last sync timestamp on closer
    await ctx.db.patch(args.closerId, {
      calendarLastSyncAt: now,
    });

    return { success: true, upserted: args.events.length };
  },
});

// Internal: Upsert calendar events with attendees (for Google Calendar API sync)
export const upsertCalendarEventsWithAttendees = internalMutation({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    events: v.array(
      v.object({
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
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get existing events for this closer
    const existingEvents = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    const existingByUid = new Map(existingEvents.map((e) => [e.uid, e]));
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
          attendees: event.attendees,
          fetchedAt: now,
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
          attendees: event.attendees,
          fetchedAt: now,
        });
      }
    }

    // Delete future events no longer in Google Calendar — but ONLY events
    // that belong to this sync source. Events with a calendarId (from b2cCalendars
    // multi-calendar sync) must be left alone; only the B2C sync manages those.
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    for (const existing of existingEvents) {
      if (!matchedExistingIds.has(existing._id) && existing.startTime > oneDayAgo) {
        // Skip events owned by a b2cCalendar — they're managed by the B2C sync
        if (existing.calendarId) continue;
        await ctx.db.delete(existing._id);
      }
    }

    await ctx.db.patch(args.closerId, { calendarLastSyncAt: now });
    return { success: true, upserted: args.events.length };
  },
});

// Internal: Get closer by ID for action
export const getCloserById = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.closerId);
  },
});

// One-time cleanup: Remove duplicate events (same title + similar time)
// Call this after deploying the timezone fix to clean up existing bad data
export const cleanupDuplicateEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allEvents = await ctx.db.query("calendarEvents").collect();

    // Group events by closer
    const eventsByCloser = new Map<string, typeof allEvents>();
    for (const event of allEvents) {
      const closerId = event.closerId;
      if (!eventsByCloser.has(closerId)) {
        eventsByCloser.set(closerId, []);
      }
      eventsByCloser.get(closerId)!.push(event);
    }

    let deletedCount = 0;
    const TIME_TOLERANCE_MS = 2 * 60 * 60 * 1000; // 2 hours

    // For each closer, find and remove duplicates
    for (const [, closerEvents] of eventsByCloser) {
      // Sort by fetchedAt (keep the most recently fetched)
      closerEvents.sort((a, b) => (b.fetchedAt || 0) - (a.fetchedAt || 0));

      const seen = new Map<string, typeof closerEvents[0]>();

      for (const event of closerEvents) {
        // Create a key based on title + approximate time bucket
        const timeBucket = Math.floor(event.startTime / TIME_TOLERANCE_MS);
        const key = `${event.title}|${timeBucket}`;

        if (seen.has(key)) {
          // This is a duplicate - delete it (keep the more recently fetched one)
          await ctx.db.delete(event._id);
          deletedCount++;
        } else {
          seen.set(key, event);
        }
      }
    }

    return { success: true, deletedCount };
  },
});

// Internal: Get all closers with ICS URL for cron
export const getClosersWithIcsUrl = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allClosers = await ctx.db.query("closers").collect();
    return allClosers.filter((c) => c.icsUrl && c.status === "active");
  },
});

// Internal: Get closer by email and teamId (for sync action)
export const getCloserByEmailAndTeam = internalQuery({
  args: {
    email: v.string(),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .filter((q) => q.eq(q.field("teamId"), args.teamId))
      .first();
    return closer;
  },
});

// ============================================
// ACTIONS (for external fetching)
// ============================================

// Extract meeting URL from text (location, description, etc.)
function extractMeetingUrl(text: string | null | undefined): string | undefined {
  if (!text) return undefined;

  // Patterns for common video conferencing URLs
  const patterns = [
    // Zoom - various formats
    /https?:\/\/(?:[\w-]+\.)?zoom\.us\/j\/\d+(?:\?[^\s<"']*)*/i,
    /https?:\/\/(?:[\w-]+\.)?zoom\.us\/my\/[^\s<"']+/i,
    // Google Meet
    /https?:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i,
    // Microsoft Teams
    /https?:\/\/teams\.microsoft\.com\/[^\s<"']+/i,
    // Webex
    /https?:\/\/(?:[\w-]+\.)?webex\.com\/[^\s<"']+/i,
    // Generic meeting links (some calendars use custom domains)
    /https?:\/\/[^\s<"']*(?:meet|call|video|conference)[^\s<"']*/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      // Clean up the URL - remove trailing punctuation that might have been captured
      let url = match[0];
      // Remove trailing >, ), ], ", ' that might be part of HTML or markdown
      url = url.replace(/[>)\]"']+$/, '');
      return url;
    }
  }

  return undefined;
}

// Parse ICS content into events
function parseIcsContent(icsContent: string): Array<{
  uid: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  location?: string;
  isAllDay?: boolean;
  meetingUrl?: string;
}> {
  const events: Array<{
    uid: string;
    title: string;
    description?: string;
    startTime: number;
    endTime: number;
    location?: string;
    isAllDay?: boolean;
    meetingUrl?: string;
  }> = [];

  // Split into VEVENT blocks
  const veventRegex = /BEGIN:VEVENT[\s\S]*?END:VEVENT/g;
  const veventBlocks = icsContent.match(veventRegex) || [];

  for (const block of veventBlocks) {
    const uid = extractIcsField(block, "UID");
    const summary = extractIcsField(block, "SUMMARY");
    const description = extractIcsField(block, "DESCRIPTION");
    const location = extractIcsField(block, "LOCATION");
    const dtstart = extractIcsField(block, "DTSTART");
    const dtend = extractIcsField(block, "DTEND");

    if (!uid || !summary || !dtstart) continue;

    // Extract timezone info from DTSTART/DTEND fields
    const startTzid = extractTzid(block, "DTSTART");
    const endTzid = extractTzid(block, "DTEND");

    const startTime = parseIcsDate(dtstart, startTzid);
    if (!startTime) continue;

    const endTime = dtend ? parseIcsDate(dtend, endTzid) || startTime + 60 * 60 * 1000 : startTime + 60 * 60 * 1000; // Default 1 hour
    const isAllDay = dtstart.length === 8; // DATE format without time

    // Extract meeting URL from location first (most reliable), then description
    const meetingUrl = extractMeetingUrl(location) || extractMeetingUrl(description);

    events.push({
      uid,
      title: summary,
      description: description || undefined,
      startTime,
      endTime,
      location: location || undefined,
      isAllDay,
      meetingUrl,
    });
  }

  return events;
}

// Extract a field from ICS content, including any TZID parameter
function extractIcsField(block: string, fieldName: string): string | null {
  // Handle both simple and parameterized fields (e.g., DTSTART;VALUE=DATE:20240115)
  const regex = new RegExp(`^${fieldName}(?:;[^:]*)?:(.*)$`, "m");
  const match = block.match(regex);
  if (!match) return null;

  // Handle line continuations (lines starting with space/tab are continuations)
  let value = match[1];
  const lines = block.split(/\r?\n/);
  const fieldIndex = lines.findIndex((line) => line.match(regex));
  if (fieldIndex !== -1) {
    for (let i = fieldIndex + 1; i < lines.length; i++) {
      if (lines[i].startsWith(" ") || lines[i].startsWith("\t")) {
        value += lines[i].substring(1);
      } else {
        break;
      }
    }
  }

  // Unescape ICS values
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

// Extract TZID parameter from an ICS field line
function extractTzid(block: string, fieldName: string): string | null {
  // Match DTSTART;TZID=America/New_York:20240115T093000
  const regex = new RegExp(`^${fieldName};[^:]*TZID=([^;:]+)`, "m");
  const match = block.match(regex);
  return match ? match[1] : null;
}

// Map legacy/alias timezone names to IANA timezone names
const TIMEZONE_ALIASES: Record<string, string> = {
  "US/Eastern": "America/New_York",
  "US/Central": "America/Chicago",
  "US/Mountain": "America/Denver",
  "US/Pacific": "America/Los_Angeles",
  "US/Hawaii": "Pacific/Honolulu",
  "US/Alaska": "America/Anchorage",
  "EST": "America/New_York",
  "EDT": "America/New_York",
  "CST": "America/Chicago",
  "CDT": "America/Chicago",
  "MST": "America/Denver",
  "MDT": "America/Denver",
  "PST": "America/Los_Angeles",
  "PDT": "America/Los_Angeles",
  "GMT": "UTC",
};

/**
 * Get timezone offset in hours for a specific date, handling DST correctly.
 * Uses JavaScript's Intl API which has built-in timezone database.
 *
 * @param tzid - IANA timezone name (e.g., "America/New_York")
 * @param year - Full year (e.g., 2024)
 * @param month - Month (0-11, JavaScript style)
 * @param day - Day of month (1-31)
 * @param hour - Hour (0-23)
 * @returns Offset in hours (negative for west of UTC), or null if timezone unknown
 */
function getTimezoneOffset(
  tzid: string,
  year: number,
  month: number,
  day: number,
  hour: number
): number | null {
  // Normalize timezone name
  const normalizedTzid = TIMEZONE_ALIASES[tzid] || tzid;

  try {
    // Create a formatter that will give us the offset
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizedTzid,
      timeZoneName: "longOffset", // e.g., "GMT-05:00" or "GMT-04:00"
    });

    // Create a date at the specified time (as if it were UTC)
    const testDate = new Date(Date.UTC(year, month, day, hour, 0, 0));

    // Format and extract the offset
    const parts = formatter.formatToParts(testDate);
    const tzPart = parts.find(p => p.type === "timeZoneName");

    if (tzPart) {
      // Parse "GMT-05:00" or "GMT+01:00" format
      const match = tzPart.value.match(/GMT([+-])(\d{2}):(\d{2})/);
      if (match) {
        const sign = match[1] === "+" ? 1 : -1;
        const hours = parseInt(match[2]);
        const minutes = parseInt(match[3]);
        return sign * (hours + minutes / 60);
      }
      // Handle "GMT" (no offset = UTC)
      if (tzPart.value === "GMT") {
        return 0;
      }
    }

    return null;
  } catch {
    // Invalid timezone name - Intl will throw
    console.warn(`Unknown timezone: ${tzid}`);
    return null;
  }
}

// Parse ICS date format to Unix timestamp
// tzid: optional timezone ID from TZID parameter (e.g., "America/New_York")
function parseIcsDate(dateStr: string, tzid?: string | null): number | null {
  // Remove any VALUE parameter prefix
  const cleanDate = dateStr.replace(/^.*:/, "");

  // Handle different formats:
  // DATE: 20240115
  // DATETIME: 20240115T093000
  // DATETIME with Z: 20240115T093000Z

  if (cleanDate.length === 8) {
    // DATE format (all day event) - treat as midnight UTC
    const year = parseInt(cleanDate.substring(0, 4));
    const month = parseInt(cleanDate.substring(4, 6)) - 1;
    const day = parseInt(cleanDate.substring(6, 8));
    return Date.UTC(year, month, day, 0, 0, 0);
  } else if (cleanDate.length >= 15) {
    // DATETIME format
    const year = parseInt(cleanDate.substring(0, 4));
    const month = parseInt(cleanDate.substring(4, 6)) - 1;
    const day = parseInt(cleanDate.substring(6, 8));
    const hour = parseInt(cleanDate.substring(9, 11));
    const minute = parseInt(cleanDate.substring(11, 13));
    const second = parseInt(cleanDate.substring(13, 15));

    if (cleanDate.endsWith("Z")) {
      // Already UTC
      return Date.UTC(year, month, day, hour, minute, second);
    } else if (tzid) {
      // Has timezone info - use dynamic offset calculation (handles DST!)
      const offsetHours = getTimezoneOffset(tzid, year, month, day, hour);
      if (offsetHours !== null) {
        // Convert local time to UTC
        // If offset is -5 (EST), local 2pm = 7pm UTC, so we subtract the offset
        // Date.UTC(2024, 0, 15, 14, 0, 0) with offset -5 should give us
        // Date.UTC(2024, 0, 15, 14 - (-5), 0, 0) = Date.UTC(2024, 0, 15, 19, 0, 0)
        const offsetMinutes = offsetHours * 60;
        const utcMs = Date.UTC(year, month, day, hour, minute, second);
        // Subtract offset: local time + offset = UTC time inverted
        // If local is 2pm EST (offset -5), UTC is 2pm - (-5h) = 7pm UTC
        return utcMs - offsetMinutes * 60 * 1000;
      }
    }

    // No timezone info and no Z suffix - treat as UTC to be safe
    // This is better than assuming server timezone which caused the Hawaii bug
    return Date.UTC(year, month, day, hour, minute, second);
  }

  return null;
}

// Sync calendar for a single closer
export const syncCloserCalendar = action({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    // Get closer info
    const closer = await ctx.runQuery(internal.calendar.getCloserById, {
      closerId: args.closerId,
    });

    if (!closer || !closer.icsUrl) {
      return { success: false, error: "No ICS URL configured" };
    }

    try {
      // Fetch ICS content
      const response = await fetch(closer.icsUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ICS: ${response.status} ${response.statusText}`);
      }

      const icsContent = await response.text();

      // Parse ICS content
      const events = parseIcsContent(icsContent);

      // Filter to events in the next 30 days and past 7 days
      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

      const relevantEvents = events.filter(
        (e) => e.startTime >= sevenDaysAgo && e.startTime <= thirtyDaysFromNow
      );

      // Upsert events
      await ctx.runMutation(internal.calendar.upsertCalendarEvents, {
        closerId: args.closerId,
        teamId: closer.teamId,
        events: relevantEvents,
      });

      return { success: true, syncedEvents: relevantEvents.length };
    } catch (error) {
      console.error(`Calendar sync failed for closer ${args.closerId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Sync calendar by email and team (for desktop app to trigger sync after connecting)
export const syncCalendarByEmail = action({
  args: {
    email: v.string(),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string; syncedEvents?: number }> => {
    // Get closer by email and team directly (not filtered by status)
    const closer = await ctx.runQuery(internal.calendar.getCloserByEmailAndTeam, {
      email: args.email,
      teamId: args.teamId,
    });

    if (!closer) {
      return { success: false, error: "Closer not found for this team" };
    }

    // Google Calendar: sync via Google Calendar API
    if (closer.googleCalendarRefreshToken && closer.calendarProvider === "google") {
      const result = await ctx.runAction(
        internal.googleCalendar.fetchGoogleCalendarEvents,
        { closerId: closer._id }
      );
      return result;
    }

    // ICS feed: sync via existing ICS logic
    if (closer.icsUrl) {
      const result = await ctx.runAction(api.calendar.syncCloserCalendar, {
        closerId: closer._id,
      });
      return result;
    }

    return { success: false, error: "No calendar connection found" };
  },
});

// Type for sync result
type SyncResult = {
  closerId: Id<"closers">;
  email: string;
  success: boolean;
  error?: string;
  syncedEvents?: number;
};

// Sync all calendars (called by cron job) — supports both ICS feeds and Google Calendar API
export const syncAllCalendars = action({
  args: {},
  handler: async (ctx): Promise<{ synced: number; failed: number; results: SyncResult[] }> => {
    const results: SyncResult[] = [];

    // 1. Sync ICS-connected closers (existing behavior)
    const icsClosers = await ctx.runQuery(internal.calendar.getClosersWithIcsUrl, {});
    for (const closer of icsClosers) {
      const result: { success: boolean; error?: string; syncedEvents?: number } =
        await ctx.runAction(api.calendar.syncCloserCalendar, {
          closerId: closer._id,
        });
      results.push({
        closerId: closer._id,
        email: closer.email,
        ...result,
      });
    }

    // 2. Sync Google Calendar-connected closers
    const googleClosers = await ctx.runQuery(
      internal.googleCalendar.getClosersWithGoogleCalendar,
      {}
    );
    for (const closer of googleClosers) {
      try {
        const result = await ctx.runAction(
          internal.googleCalendar.fetchGoogleCalendarEvents,
          { closerId: closer._id }
        );
        results.push({
          closerId: closer._id,
          email: closer.email,
          ...result,
        });
      } catch (error) {
        console.error(`Google Calendar sync failed for ${closer.email}:`, error);
        results.push({
          closerId: closer._id,
          email: closer.email,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      synced: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  },
});

// One-time action to clean up duplicates and re-sync all calendars
// Run this after deploying the timezone fix
export const cleanupAndResyncAll = action({
  args: {},
  handler: async (ctx): Promise<{
    duplicatesRemoved: number;
    calendarsResynced: number;
    syncFailures: number;
  }> => {
    // Step 1: Clean up existing duplicates
    const cleanupResult: { success: boolean; deletedCount: number } =
      await ctx.runMutation(internal.calendar.cleanupDuplicateEvents, {});
    console.log(`Cleaned up ${cleanupResult.deletedCount} duplicate events`);

    // Step 2: Re-sync all calendars with fixed timezone handling
    const syncResult: { synced: number; failed: number; results: SyncResult[] } =
      await ctx.runAction(api.calendar.syncAllCalendars, {});
    console.log(`Re-synced ${syncResult.synced} calendars`);

    return {
      duplicatesRemoved: cleanupResult.deletedCount,
      calendarsResynced: syncResult.synced,
      syncFailures: syncResult.failed,
    };
  },
});
