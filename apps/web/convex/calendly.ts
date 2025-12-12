import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

const CALENDLY_API_BASE = "https://api.calendly.com";

// ============================================
// QUERIES
// ============================================

// Get Calendly connection status for settings page
export const getCalendlyStatus = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) return null;

    const team = await ctx.db.get(user.teamId);
    if (!team) return null;

    return {
      connected: !!team.calendlyAccessToken,
      connectedEmail: team.calendlyConnectedEmail,
      lastSyncAt: team.calendlyLastSyncAt,
    };
  },
});

// Get scheduled calls for the team
export const getScheduledCalls = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) return [];

    const now = Date.now();

    // Get all scheduled calls for the team in the future
    const scheduledCalls = await ctx.db
      .query("scheduledCalls")
      .withIndex("by_team_and_date", (q) => q.eq("teamId", user.teamId))
      .filter((q) =>
        q.and(
          q.gte(q.field("scheduledAt"), now),
          q.neq(q.field("status"), "cancelled")
        )
      )
      .order("asc")
      .collect();

    // Get closer info for each call
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    const closerMap = new Map(closers.map((c) => [c._id, c]));

    return scheduledCalls.map((call) => {
      const closer = call.closerId ? closerMap.get(call.closerId) : null;
      return {
        _id: call._id,
        prospectName: call.prospectName,
        prospectEmail: call.prospectEmail,
        scheduledAt: call.scheduledAt,
        meetingLink: call.meetingLink,
        source: call.source || "manual",
        closerId: call.closerId,
        closerName: closer?.name || null,
        closerEmail: closer?.email || null,
        closerInitials: closer?.name
          ? closer.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
          : null,
      };
    });
  },
});

// Internal query to get team by ID
export const getTeamById = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.teamId);
  },
});

// Internal query to find closer by email (case-insensitive)
export const findCloserByEmail = internalQuery({
  args: { teamId: v.id("teams"), email: v.string() },
  handler: async (ctx, args) => {
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const emailLower = args.email.toLowerCase();
    return closers.find((c) => c.email.toLowerCase() === emailLower) || null;
  },
});

// Internal query to find scheduled call by calendar event ID
export const findByCalendarEventId = internalQuery({
  args: { calendarEventId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("scheduledCalls")
      .withIndex("by_calendar_event", (q) => q.eq("calendarEventId", args.calendarEventId))
      .first();
  },
});

// ============================================
// MUTATIONS
// ============================================

// Connect Calendly (validate token and save)
export const connectCalendly = mutation({
  args: {
    clerkId: v.string(),
    accessToken: v.string(),
    userUri: v.string(),
    organizationUri: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Save Calendly credentials
    await ctx.db.patch(user.teamId, {
      calendlyAccessToken: args.accessToken,
      calendlyUserUri: args.userUri,
      calendlyOrganizationUri: args.organizationUri,
      calendlyConnectedEmail: args.email,
      calendlyLastSyncAt: Date.now(),
    });

    return { success: true, teamId: user.teamId };
  },
});

// Disconnect Calendly
export const disconnectCalendly = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Clear Calendly credentials
    await ctx.db.patch(user.teamId, {
      calendlyAccessToken: undefined,
      calendlyUserUri: undefined,
      calendlyOrganizationUri: undefined,
      calendlyWebhookId: undefined,
      calendlyConnectedEmail: undefined,
      calendlyLastSyncAt: undefined,
    });

    // Optionally delete synced scheduled calls from Calendly
    const scheduledCalls = await ctx.db
      .query("scheduledCalls")
      .withIndex("by_team_and_date", (q) => q.eq("teamId", user.teamId))
      .filter((q) => q.eq(q.field("source"), "calendly"))
      .collect();

    for (const call of scheduledCalls) {
      await ctx.db.delete(call._id);
    }

    return { success: true };
  },
});

// Save webhook ID after creating it
export const saveWebhookId = mutation({
  args: {
    clerkId: v.string(),
    webhookId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user.teamId, {
      calendlyWebhookId: args.webhookId,
    });

    return { success: true };
  },
});

// Update last sync timestamp
export const updateLastSync = mutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      calendlyLastSyncAt: Date.now(),
    });
  },
});

// Internal mutation to upsert a scheduled call
export const upsertScheduledCall = internalMutation({
  args: {
    teamId: v.id("teams"),
    calendarEventId: v.string(),
    prospectName: v.optional(v.string()),
    prospectEmail: v.optional(v.string()),
    scheduledAt: v.number(),
    meetingLink: v.optional(v.string()),
    closerId: v.optional(v.id("closers")),
    calendlyInviteeUri: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if this event already exists
    const existing = await ctx.db
      .query("scheduledCalls")
      .withIndex("by_calendar_event", (q) => q.eq("calendarEventId", args.calendarEventId))
      .first();

    if (existing) {
      // Update existing record
      await ctx.db.patch(existing._id, {
        prospectName: args.prospectName,
        prospectEmail: args.prospectEmail,
        scheduledAt: args.scheduledAt,
        meetingLink: args.meetingLink,
        closerId: args.closerId,
        calendlyInviteeUri: args.calendlyInviteeUri,
        syncedAt: Date.now(),
        status: "scheduled",
      });
      return { updated: true, id: existing._id };
    } else {
      // Create new record
      const id = await ctx.db.insert("scheduledCalls", {
        teamId: args.teamId,
        calendarEventId: args.calendarEventId,
        prospectName: args.prospectName,
        prospectEmail: args.prospectEmail,
        scheduledAt: args.scheduledAt,
        meetingLink: args.meetingLink,
        closerId: args.closerId,
        calendlyInviteeUri: args.calendlyInviteeUri,
        syncedAt: Date.now(),
        source: "calendly",
        status: "scheduled",
      });
      return { created: true, id };
    }
  },
});

// Internal mutation to cancel a scheduled call
export const cancelScheduledCall = internalMutation({
  args: { calendarEventId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("scheduledCalls")
      .withIndex("by_calendar_event", (q) => q.eq("calendarEventId", args.calendarEventId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "cancelled",
        syncedAt: Date.now(),
      });
      return { success: true };
    }
    return { success: false, reason: "Event not found" };
  },
});

// Assign a closer to a scheduled call
export const assignCloser = mutation({
  args: {
    clerkId: v.string(),
    scheduledCallId: v.id("scheduledCalls"),
    closerId: v.optional(v.id("closers")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const scheduledCall = await ctx.db.get(args.scheduledCallId);
    if (!scheduledCall || scheduledCall.teamId !== user.teamId) {
      throw new Error("Scheduled call not found");
    }

    await ctx.db.patch(args.scheduledCallId, {
      closerId: args.closerId,
    });

    return { success: true };
  },
});

// ============================================
// ACTIONS (for external API calls)
// ============================================

// Validate Calendly token and get user info
export const validateToken = action({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    try {
      const response = await fetch(`${CALENDLY_API_BASE}/users/me`, {
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Calendly API error:", error);
        return { valid: false, error: "Invalid token" };
      }

      const data = await response.json();
      return {
        valid: true,
        userUri: data.resource.uri,
        organizationUri: data.resource.current_organization,
        email: data.resource.email,
        name: data.resource.name,
      };
    } catch (error) {
      console.error("Error validating Calendly token:", error);
      return { valid: false, error: "Failed to connect to Calendly" };
    }
  },
});

// Sync scheduled events from Calendly
export const syncEvents = action({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<{ synced: number; errors: number; total: number }> => {
    // Get team info
    const user = await ctx.runQuery(internal.calendly.getUserByClerkId, { clerkId: args.clerkId });
    if (!user) {
      throw new Error("User not found");
    }

    const team = await ctx.runQuery(internal.calendly.getTeamById, { teamId: user.teamId });
    if (!team || !team.calendlyAccessToken) {
      throw new Error("Calendly not connected");
    }

    // Get events for next 14 days
    const now = new Date();
    const minTime = now.toISOString();
    const maxTime = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch scheduled events from Calendly
    const eventsUrl = new URL(`${CALENDLY_API_BASE}/scheduled_events`);
    eventsUrl.searchParams.set("user", team.calendlyUserUri!);
    eventsUrl.searchParams.set("min_start_time", minTime);
    eventsUrl.searchParams.set("max_start_time", maxTime);
    eventsUrl.searchParams.set("status", "active");
    eventsUrl.searchParams.set("count", "100");

    const eventsResponse: Response = await fetch(eventsUrl.toString(), {
      headers: {
        Authorization: `Bearer ${team.calendlyAccessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!eventsResponse.ok) {
      const error = await eventsResponse.text();
      console.error("Error fetching Calendly events:", error);
      throw new Error("Failed to fetch events from Calendly");
    }

    const eventsData: { collection?: Array<{ uri: string; start_time: string; event_memberships?: Array<{ user_email?: string }>; location?: { join_url?: string } }> } = await eventsResponse.json();
    const events = eventsData.collection || [];

    let synced = 0;
    let errors = 0;

    for (const event of events) {
      try {
        // Get invitees for this event
        const inviteesUrl = `${event.uri}/invitees`;
        const inviteesResponse = await fetch(inviteesUrl, {
          headers: {
            Authorization: `Bearer ${team.calendlyAccessToken}`,
            "Content-Type": "application/json",
          },
        });

        let prospectName: string | undefined;
        let prospectEmail: string | undefined;
        let inviteeUri: string | undefined;

        if (inviteesResponse.ok) {
          const inviteesData = await inviteesResponse.json();
          const invitees = inviteesData.collection || [];

          // Get the first invitee (the prospect)
          if (invitees.length > 0) {
            const invitee = invitees[0];
            prospectName = invitee.name;
            prospectEmail = invitee.email;
            inviteeUri = invitee.uri;
          }
        }

        // Try to match the event host to a closer
        let closerId: string | undefined;

        // Get event memberships to find the host
        if (event.event_memberships) {
          for (const membership of event.event_memberships) {
            if (membership.user_email) {
              const closer = await ctx.runQuery(internal.calendly.findCloserByEmail, {
                teamId: user.teamId,
                email: membership.user_email,
              });
              if (closer) {
                closerId = closer._id;
                break;
              }
            }
          }
        }

        // Extract meeting link
        const meetingLink = event.location?.join_url || undefined;

        // Upsert the scheduled call
        await ctx.runMutation(internal.calendly.upsertScheduledCall, {
          teamId: user.teamId,
          calendarEventId: event.uri,
          prospectName,
          prospectEmail,
          scheduledAt: new Date(event.start_time).getTime(),
          meetingLink,
          closerId: closerId as any,
          calendlyInviteeUri: inviteeUri,
        });

        synced++;
      } catch (error) {
        console.error("Error syncing event:", error);
        errors++;
      }
    }

    // Update last sync timestamp
    await ctx.runMutation(internal.calendly.updateLastSyncInternal, { teamId: user.teamId });

    return { synced, errors, total: events.length };
  },
});

// Internal query to get user by clerkId
export const getUserByClerkId = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
  },
});

// Internal mutation to update last sync
export const updateLastSyncInternal = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      calendlyLastSyncAt: Date.now(),
    });
  },
});

// Create webhook subscription in Calendly
export const createWebhook = action({
  args: {
    clerkId: v.string(),
    webhookUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; webhookId: string }> => {
    const user = await ctx.runQuery(internal.calendly.getUserByClerkId, { clerkId: args.clerkId });
    if (!user) {
      throw new Error("User not found");
    }

    const team = await ctx.runQuery(internal.calendly.getTeamById, { teamId: user.teamId });
    if (!team || !team.calendlyAccessToken) {
      throw new Error("Calendly not connected");
    }

    // Create webhook subscription
    const response: Response = await fetch(`${CALENDLY_API_BASE}/webhook_subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${team.calendlyAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: args.webhookUrl,
        events: ["invitee.created", "invitee.canceled"],
        organization: team.calendlyOrganizationUri,
        scope: "organization",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Error creating Calendly webhook:", error);
      throw new Error("Failed to create webhook");
    }

    const data: { resource: { uri: string } } = await response.json();
    const webhookId: string = data.resource.uri;

    // Save webhook ID
    await ctx.runMutation(internal.calendly.saveWebhookIdInternal, {
      teamId: user.teamId,
      webhookId,
    });

    return { success: true, webhookId };
  },
});

// Internal mutation to save webhook ID
export const saveWebhookIdInternal = internalMutation({
  args: {
    teamId: v.id("teams"),
    webhookId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      calendlyWebhookId: args.webhookId,
    });
  },
});

// Delete webhook subscription from Calendly
export const deleteWebhook = action({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.calendly.getUserByClerkId, { clerkId: args.clerkId });
    if (!user) {
      throw new Error("User not found");
    }

    const team = await ctx.runQuery(internal.calendly.getTeamById, { teamId: user.teamId });
    if (!team || !team.calendlyAccessToken || !team.calendlyWebhookId) {
      return { success: true }; // Nothing to delete
    }

    try {
      const response = await fetch(team.calendlyWebhookId, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${team.calendlyAccessToken}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        console.error("Error deleting webhook:", await response.text());
      }
    } catch (error) {
      console.error("Error deleting webhook:", error);
    }

    return { success: true };
  },
});
