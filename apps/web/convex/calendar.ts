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
      connected: !!closer.googleCalendarRefreshToken,
      provider: closer.calendarProvider || null,
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
      connected: !!closer.googleCalendarRefreshToken,
      provider: closer.calendarProvider || null,
      connectedAt: closer.calendarConnectedAt,
      lastSynced: closer.calendarLastSyncAt,
      // "google_revoked" when Google killed the token — lets the connect card
      // say "your connection expired" instead of looking never-connected.
      disconnectReason: closer.calendarDisconnectReason ?? null,
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
      connected: !!closer.googleCalendarRefreshToken,
      provider: closer.calendarProvider || null,
      lastSynced: closer.calendarLastSyncAt,
    }));
  },
});

// ============================================
// MUTATIONS
// ============================================

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
      // A deliberate disconnect is not an expiry — never show "expired" after
      // the closer chose to disconnect.
      calendarDisconnectReason: undefined,
    });

    // Coaching-call schedule rows are in-app references (booked calls), not
    // calendar-synced — a calendar disconnect must not erase them.
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
      .collect();

    let deletedEvents = 0;
    for (const event of events) {
      if (event.coachingCallId) continue;
      await ctx.db.delete(event._id);
      deletedEvents++;
    }

    // B2C multi-calendar rows carry their OWN OAuth tokens — if they survive
    // the disconnect, the 15-min sync cron re-imports the old account's
    // events as ghosts (bitten 2026-09-02). Delete the connections outright.
    const b2cCals = await ctx.db
      .query("b2cCalendars")
      .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
      .collect();
    for (const cal of b2cCals) {
      await ctx.db.delete(cal._id);
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
      deletedEvents,
      deletedCalendars: b2cCals.length,
      deletedSubscriptions: subs.length,
    };
  },
});

// ============================================
// INTERNAL MUTATIONS (for syncing)
// ============================================

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

// Sync all calendars (called by cron job) — Google Calendar API
export const syncAllCalendars = action({
  args: {},
  handler: async (ctx): Promise<{ synced: number; failed: number; results: SyncResult[] }> => {
    const results: SyncResult[] = [];

    // Sync Google Calendar-connected closers
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


// One-off migration (2026-09-02): ICS feed connections are removed from the
// product. Clears every lingering icsUrl; closers whose ONLY connection was
// the ICS feed get full disconnect semantics (events purged, coaching-call
// rows preserved) so their stale feed events don't ghost forever.
export const clearLegacyIcsConnections = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allClosers = await ctx.db.query("closers").collect();
    const cleared: string[] = [];
    const fullyDisconnected: string[] = [];
    for (const closer of allClosers) {
      if (!closer.icsUrl) continue;
      const hasOAuth =
        !!closer.googleCalendarRefreshToken || !!closer.microsoftCalendarRefreshToken;
      if (hasOAuth) {
        await ctx.db.patch(closer._id, { icsUrl: undefined });
        cleared.push(closer.email);
        continue;
      }
      await ctx.db.patch(closer._id, {
        icsUrl: undefined,
        calendarConnectedAt: undefined,
        calendarLastSyncAt: undefined,
        calendarProvider: undefined,
      });
      const events = await ctx.db
        .query("calendarEvents")
        .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
        .collect();
      for (const e of events) {
        if (e.coachingCallId) continue;
        await ctx.db.delete(e._id);
      }
      fullyDisconnected.push(closer.email);
    }
    return { cleared, fullyDisconnected };
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
