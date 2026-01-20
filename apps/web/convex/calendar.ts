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
      connected: !!closer.icsUrl,
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
      connected: !!closer.icsUrl,
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

    return events
      .filter((e) => e.startTime >= args.startDate && e.startTime <= args.endDate)
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

    // Filter by date range and closer
    const filteredEvents = events.filter(
      (e) =>
        e.startTime >= args.startDate &&
        e.startTime <= args.endDate &&
        targetCloserIds.includes(e.closerId)
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
      connected: !!closer.icsUrl,
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
    await ctx.db.patch(args.closerId, {
      icsUrl: url,
      calendarConnectedAt: Date.now(),
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
    });

    return { success: true, closerId: closer._id };
  },
});

// Disconnect calendar and delete all events
export const disconnectCalendar = mutation({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    // Clear ICS URL from closer
    await ctx.db.patch(args.closerId, {
      icsUrl: undefined,
      calendarConnectedAt: undefined,
      calendarLastSyncAt: undefined,
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

    await ctx.db.patch(closer._id, {
      icsUrl: undefined,
      calendarConnectedAt: undefined,
      calendarLastSyncAt: undefined,
    });

    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
      .collect();

    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    return { success: true, deletedEvents: events.length };
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

    const existingByUid = new Map(existingEvents.map((e) => [e.uid, e]));
    const incomingUids = new Set(args.events.map((e) => e.uid));

    // Upsert incoming events
    for (const event of args.events) {
      const existing = existingByUid.get(event.uid);
      if (existing) {
        // Update existing event
        await ctx.db.patch(existing._id, {
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
    // We keep past events to preserve history
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    for (const existing of existingEvents) {
      if (!incomingUids.has(existing.uid) && existing.startTime > oneDayAgo) {
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

// Internal: Get closer by ID for action
export const getCloserById = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.closerId);
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

    const startTime = parseIcsDate(dtstart);
    if (!startTime) continue;

    const endTime = dtend ? parseIcsDate(dtend) || startTime + 60 * 60 * 1000 : startTime + 60 * 60 * 1000; // Default 1 hour
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

// Extract a field from ICS content
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

// Parse ICS date format to Unix timestamp
function parseIcsDate(dateStr: string): number | null {
  // Remove any VALUE parameter prefix
  const cleanDate = dateStr.replace(/^.*:/, "");

  // Handle different formats:
  // DATE: 20240115
  // DATETIME: 20240115T093000
  // DATETIME with Z: 20240115T093000Z

  if (cleanDate.length === 8) {
    // DATE format (all day event)
    const year = parseInt(cleanDate.substring(0, 4));
    const month = parseInt(cleanDate.substring(4, 6)) - 1;
    const day = parseInt(cleanDate.substring(6, 8));
    return new Date(year, month, day).getTime();
  } else if (cleanDate.length >= 15) {
    // DATETIME format
    const year = parseInt(cleanDate.substring(0, 4));
    const month = parseInt(cleanDate.substring(4, 6)) - 1;
    const day = parseInt(cleanDate.substring(6, 8));
    const hour = parseInt(cleanDate.substring(9, 11));
    const minute = parseInt(cleanDate.substring(11, 13));
    const second = parseInt(cleanDate.substring(13, 15));

    if (cleanDate.endsWith("Z")) {
      // UTC time
      return Date.UTC(year, month, day, hour, minute, second);
    } else {
      // Local time (assume local timezone)
      return new Date(year, month, day, hour, minute, second).getTime();
    }
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

    if (!closer.icsUrl) {
      return { success: false, error: "No ICS URL configured for this closer" };
    }

    // Use the main sync action
    const result = await ctx.runAction(api.calendar.syncCloserCalendar, {
      closerId: closer._id,
    });
    return result;
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

// Sync all calendars (called by cron job)
export const syncAllCalendars = action({
  args: {},
  handler: async (ctx): Promise<{ synced: number; failed: number; results: SyncResult[] }> => {
    const closers = await ctx.runQuery(internal.calendar.getClosersWithIcsUrl, {});

    const results: SyncResult[] = [];
    for (const closer of closers) {
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

    return {
      synced: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  },
});
