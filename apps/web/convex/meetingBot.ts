import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================
// INTERNAL QUERIES (used by actions)
// ============================================

// Get a meeting bot by ID (internal, for actions)
export const getBotById = internalQuery({
  args: { botId: v.id("meetingBots") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.botId);
  },
});

// Get a closer by ID (internal, for actions)
export const getCloserById = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.closerId);
  },
});

// Get a team by ID (internal, for actions)
export const getTeamById = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.teamId);
  },
});

// ============================================
// INTERNAL MUTATIONS (used by actions)
// ============================================

// Insert a new meeting bot record (internal, called from createBot action)
export const insertBot = internalMutation({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    meetingUrl: v.string(),
    meetingTitle: v.optional(v.string()),
    prospectName: v.optional(v.string()),
    calendarEventId: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const botId = await ctx.db.insert("meetingBots", {
      closerId: args.closerId,
      teamId: args.teamId,
      meetingUrl: args.meetingUrl,
      meetingTitle: args.meetingTitle,
      prospectName: args.prospectName,
      calendarEventId: args.calendarEventId,
      scheduledAt: args.scheduledAt,
      status: "scheduled",
      source: args.source,
      createdAt: Date.now(),
    });
    return botId;
  },
});

// Update a meeting bot with the Meeting BaaS ID (internal, called from createBot action)
export const setBotMeetingBaasId = internalMutation({
  args: {
    botId: v.id("meetingBots"),
    meetingBaasId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.botId, {
      meetingBaasId: args.meetingBaasId,
    });
  },
});

// Mark a bot as failed (internal, called from actions on API error)
export const markBotFailed = internalMutation({
  args: {
    botId: v.id("meetingBots"),
    failureReason: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.botId, {
      status: "failed",
      failureReason: args.failureReason,
    });
  },
});

// Update bot status to cancelled (internal, called from cancelBot action)
export const markBotCancelled = internalMutation({
  args: {
    botId: v.id("meetingBots"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.botId, {
      status: "cancelled",
    });
  },
});

// ============================================
// ACTIONS (have network access for Meeting BaaS API calls)
// ============================================

// Create a meeting bot for a calendar event
export const createBot = action({
  args: {
    meetingUrl: v.string(),
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    meetingTitle: v.optional(v.string()),
    prospectName: v.optional(v.string()),
    calendarEventId: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ botId: Id<"meetingBots">; meetingBaasId: string }> => {
    // 1. Create the meetingBot record with status "scheduled"
    const botId: Id<"meetingBots"> = await ctx.runMutation(internal.meetingBot.insertBot, {
      closerId: args.closerId,
      teamId: args.teamId,
      meetingUrl: args.meetingUrl,
      meetingTitle: args.meetingTitle,
      prospectName: args.prospectName,
      calendarEventId: args.calendarEventId,
      scheduledAt: args.scheduledAt,
      source: "calendar",
    });

    // 2. Get team info for bot name configuration
    const team = await ctx.runQuery(internal.meetingBot.getTeamById, {
      teamId: args.teamId,
    });

    const botName = team?.meetingBotName || "Sequ3nce.ai";

    // 3. Get closer info for Zoom OAuth credentials (if applicable)
    const closer = await ctx.runQuery(internal.meetingBot.getCloserById, {
      closerId: args.closerId,
    });

    // 4. Call Meeting BaaS API to create the bot
    const meetingBaasApiKey = process.env.MEETING_BAAS_API_KEY;
    if (!meetingBaasApiKey) {
      await ctx.runMutation(internal.meetingBot.markBotFailed, {
        botId,
        failureReason: "MEETING_BAAS_API_KEY not configured",
      });
      throw new Error("MEETING_BAAS_API_KEY not configured");
    }

    try {
      // Build streaming URL with query params so audio processor can identify the call
      const streamingUrl = `wss://amusing-charm-production.up.railway.app/meetingbaas?botId=${botId}&closerId=${args.closerId}&teamId=${args.teamId}${args.prospectName ? `&prospectName=${encodeURIComponent(args.prospectName)}` : ""}`;

      const webhookUrl = `${process.env.CONVEX_SITE_URL}/webhooks/meetingbaas`;

      const requestBody: Record<string, any> = {
        meeting_url: args.meetingUrl,
        bot_name: botName,
        bot_image: "https://sequ3nce.ai/icon.png",
        entry_message: "This meeting is being recorded.",
        // v2 streaming config — request 16kHz to match our Speechmatics config
        streaming_enabled: true,
        streaming_config: {
          input_url: streamingUrl,
          output_url: streamingUrl,
          audio_frequency: 16000,
        },
        // v2 transcription config
        transcription_enabled: true,
        transcription_config: {
          provider: "gladia",
        },
        // v2 callback/webhook config
        callback_enabled: true,
        callback_config: {
          url: webhookUrl,
          method: "POST",
        },
      };

      // For Zoom meetings, include Zoom OAuth credentials if available
      const isZoomMeeting = args.meetingUrl.includes("zoom.us") || args.meetingUrl.includes("zoom.com");
      if (isZoomMeeting && closer?.zoomAccessToken && closer?.zoomRefreshToken) {
        requestBody.zoom_config = {
          credential_id: closer.zoomAccessToken,
          credential_user_id: closer.zoomRefreshToken,
        };
      }

      console.log(`[createBot] Request body: ${JSON.stringify(requestBody)}`);

      const response = await fetch("https://api.meetingbaas.com/v2/bots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-meeting-baas-api-key": meetingBaasApiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const failureReason = `Meeting BaaS API error: ${response.status} ${errorText}`;
        console.error(`[createBot] ${failureReason}`);

        await ctx.runMutation(internal.meetingBot.markBotFailed, {
          botId,
          failureReason,
        });
        throw new Error(failureReason);
      }

      const data = await response.json();
      console.log(`[createBot] Meeting BaaS response: ${JSON.stringify(data)}`);
      const rawBotId = data?.bot_id || data?.data?.bot_id || data?.id || data?.data?.id || "";
      const meetingBaasId = rawBotId ? String(rawBotId) : "";

      if (!meetingBaasId) {
        console.warn(`[createBot] Could not extract bot_id from response: ${JSON.stringify(data)}`);
      }

      // 5. Update the meetingBot record with the Meeting BaaS ID
      if (meetingBaasId) {
        await ctx.runMutation(internal.meetingBot.setBotMeetingBaasId, {
          botId,
          meetingBaasId,
        });
      }

      console.log(`[createBot] Bot created successfully: ${botId}, meetingBaasId: ${meetingBaasId}`);
      return { botId, meetingBaasId };
    } catch (error) {
      // If it's already our handled error, rethrow
      if (error instanceof Error && error.message.startsWith("Meeting BaaS API error:")) {
        throw error;
      }

      const failureReason = error instanceof Error ? error.message : "Unknown error creating bot";
      console.error(`[createBot] Failed: ${failureReason}`);

      await ctx.runMutation(internal.meetingBot.markBotFailed, {
        botId,
        failureReason,
      });
      throw error;
    }
  },
});

// Cancel a meeting bot
export const cancelBot = action({
  args: {
    botId: v.id("meetingBots"),
  },
  handler: async (ctx, args) => {
    // 1. Read the meetingBot record
    const bot = await ctx.runQuery(internal.meetingBot.getBotById, {
      botId: args.botId,
    });

    if (!bot) {
      throw new Error("Meeting bot not found");
    }

    if (bot.status === "cancelled" || bot.status === "completed") {
      console.log(`[cancelBot] Bot ${args.botId} already ${bot.status}, skipping`);
      return { success: true, alreadyCancelled: true };
    }

    // 2. Call Meeting BaaS API to cancel/remove the bot
    if (bot.meetingBaasId) {
      const meetingBaasApiKey = process.env.MEETING_BAAS_API_KEY;
      if (!meetingBaasApiKey) {
        throw new Error("MEETING_BAAS_API_KEY not configured");
      }

      try {
        const response = await fetch(`https://api.meetingbaas.com/v2/bots/${bot.meetingBaasId}`, {
          method: "DELETE",
          headers: {
            "x-meeting-baas-api-key": meetingBaasApiKey,
          },
        });

        if (!response.ok && response.status !== 404) {
          const errorText = await response.text();
          console.error(`[cancelBot] Meeting BaaS API error: ${response.status} ${errorText}`);
          // Continue with local cancellation even if API call fails
        }
      } catch (error) {
        console.error(`[cancelBot] Failed to call Meeting BaaS API:`, error);
        // Continue with local cancellation even if API call fails
      }
    }

    // 3. Update status to "cancelled"
    await ctx.runMutation(internal.meetingBot.markBotCancelled, {
      botId: args.botId,
    });

    console.log(`[cancelBot] Bot ${args.botId} cancelled successfully`);
    return { success: true };
  },
});

// Create a quick bot (manual, not from calendar)
export const createQuickBot = action({
  args: {
    meetingUrl: v.string(),
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    prospectName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ botId: Id<"meetingBots">; meetingBaasId: string }> => {
    // 1. Create the meetingBot record with status "scheduled" and source "quick_bot"
    const botId: Id<"meetingBots"> = await ctx.runMutation(internal.meetingBot.insertBot, {
      closerId: args.closerId,
      teamId: args.teamId,
      meetingUrl: args.meetingUrl,
      prospectName: args.prospectName,
      source: "quick_bot",
    });

    // 2. Get team info for bot name configuration
    const team = await ctx.runQuery(internal.meetingBot.getTeamById, {
      teamId: args.teamId,
    });

    const botName = team?.meetingBotName || "Sequ3nce.ai";

    // 3. Get closer info for Zoom OAuth credentials (if applicable)
    const closer = await ctx.runQuery(internal.meetingBot.getCloserById, {
      closerId: args.closerId,
    });

    // 4. Call Meeting BaaS API to create the bot
    const meetingBaasApiKey = process.env.MEETING_BAAS_API_KEY;
    if (!meetingBaasApiKey) {
      await ctx.runMutation(internal.meetingBot.markBotFailed, {
        botId,
        failureReason: "MEETING_BAAS_API_KEY not configured",
      });
      throw new Error("MEETING_BAAS_API_KEY not configured");
    }

    try {
      // Build streaming URL with query params so audio processor can identify the call
      const streamingUrl = `wss://amusing-charm-production.up.railway.app/meetingbaas?botId=${botId}&closerId=${args.closerId}&teamId=${args.teamId}${args.prospectName ? `&prospectName=${encodeURIComponent(args.prospectName)}` : ""}`;

      const webhookUrl = `${process.env.CONVEX_SITE_URL}/webhooks/meetingbaas`;

      const requestBody: Record<string, any> = {
        meeting_url: args.meetingUrl,
        bot_name: botName,
        bot_image: "https://sequ3nce.ai/icon.png",
        entry_message: "This meeting is being recorded.",
        // v2 streaming config — request 16kHz to match our Speechmatics config
        streaming_enabled: true,
        streaming_config: {
          input_url: streamingUrl,
          output_url: streamingUrl,
          audio_frequency: 16000,
        },
        // v2 transcription config
        transcription_enabled: true,
        transcription_config: {
          provider: "gladia",
        },
        // v2 callback/webhook config
        callback_enabled: true,
        callback_config: {
          url: webhookUrl,
          method: "POST",
        },
      };

      // For Zoom meetings, include Zoom OAuth credentials if available
      const isZoomMeeting = args.meetingUrl.includes("zoom.us") || args.meetingUrl.includes("zoom.com");
      if (isZoomMeeting && closer?.zoomAccessToken && closer?.zoomRefreshToken) {
        requestBody.zoom_config = {
          credential_id: closer.zoomAccessToken,
          credential_user_id: closer.zoomRefreshToken,
        };
      }

      console.log(`[createQuickBot] Request body: ${JSON.stringify(requestBody)}`);

      const response = await fetch("https://api.meetingbaas.com/v2/bots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-meeting-baas-api-key": meetingBaasApiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const failureReason = `Meeting BaaS API error: ${response.status} ${errorText}`;
        console.error(`[createQuickBot] ${failureReason}`);

        await ctx.runMutation(internal.meetingBot.markBotFailed, {
          botId,
          failureReason,
        });
        throw new Error(failureReason);
      }

      const data = await response.json();
      console.log(`[createQuickBot] Meeting BaaS response: ${JSON.stringify(data)}`);
      const rawBotId = data?.bot_id || data?.data?.bot_id || data?.id || data?.data?.id || "";
      const meetingBaasId = rawBotId ? String(rawBotId) : "";

      // 5. Update the meetingBot record with the Meeting BaaS ID
      await ctx.runMutation(internal.meetingBot.setBotMeetingBaasId, {
        botId,
        meetingBaasId: meetingBaasId,
      });

      console.log(`[createQuickBot] Bot created successfully: ${botId}, meetingBaasId: ${meetingBaasId}`);
      return { botId, meetingBaasId };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Meeting BaaS API error:")) {
        throw error;
      }

      const failureReason = error instanceof Error ? error.message : "Unknown error creating bot";
      console.error(`[createQuickBot] Failed: ${failureReason}`);

      await ctx.runMutation(internal.meetingBot.markBotFailed, {
        botId,
        failureReason,
      });
      throw error;
    }
  },
});

// ============================================
// MUTATIONS
// ============================================

// Update bot status from webhook events (called by webhook route)
export const updateBotStatus = mutation({
  args: {
    meetingBaasId: v.string(),
    status: v.optional(v.string()),
    callId: v.optional(v.id("calls")),
    joinedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    recordingUrl: v.optional(v.string()),
    recordingDuration: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    questionnaireCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Find bot by meetingBaasId index
    const bot = await ctx.db
      .query("meetingBots")
      .withIndex("by_meeting_baas_id", (q) => q.eq("meetingBaasId", args.meetingBaasId))
      .first();

    if (!bot) {
      console.error(`[updateBotStatus] Bot not found for meetingBaasId: ${args.meetingBaasId}`);
      return { success: false, error: "Bot not found" };
    }

    // Build patch object with only provided fields
    const patch: Record<string, any> = {};
    if (args.status !== undefined) patch.status = args.status;
    if (args.callId !== undefined) patch.callId = args.callId;
    if (args.joinedAt !== undefined) patch.joinedAt = args.joinedAt;
    if (args.endedAt !== undefined) patch.endedAt = args.endedAt;
    if (args.recordingUrl !== undefined) patch.recordingUrl = args.recordingUrl;
    if (args.recordingDuration !== undefined) patch.recordingDuration = args.recordingDuration;
    if (args.failureReason !== undefined) patch.failureReason = args.failureReason;
    if (args.questionnaireCompleted !== undefined) patch.questionnaireCompleted = args.questionnaireCompleted;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(bot._id, patch);
    }

    return { success: true, botId: bot._id };
  },
});

// Create a call record when meeting bot joins a call
export const createCallFromBot = mutation({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    meetingBotId: v.id("meetingBots"),
    prospectName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const callId = await ctx.db.insert("calls", {
      closerId: args.closerId,
      teamId: args.teamId,
      prospectName: args.prospectName,
      status: "on_call",
      recordingType: "video",
      meetingBotId: args.meetingBotId,
      startedAt: Date.now(),
      speakerCount: 2,
      createdAt: Date.now(),
    });

    console.log(`[createCallFromBot] Call created: ${callId} for bot: ${args.meetingBotId}`);
    return callId;
  },
});

// Mark a call as completed when meeting bot finishes
export const completeCallFromBot = mutation({
  args: {
    callId: v.id("calls"),
    endedAt: v.number(),
    recordingUrl: v.optional(v.string()),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) {
      console.error(`[completeCallFromBot] Call not found: ${args.callId}`);
      return { success: false, error: "Call not found" };
    }

    await ctx.db.patch(args.callId, {
      status: "completed",
      endedAt: args.endedAt,
      ...(args.recordingUrl && { recordingUrl: args.recordingUrl }),
      ...(args.duration && { duration: args.duration }),
    });

    console.log(`[completeCallFromBot] Call completed: ${args.callId}`);
    return { success: true };
  },
});

// Exclude a calendar event from meeting bot auto-join
export const excludeCalendarEvent = mutation({
  args: {
    closerId: v.id("closers"),
    calendarEventId: v.string(),
    eventTitle: v.optional(v.string()),
    isRecurring: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if already excluded
    const existing = await ctx.db
      .query("excludedCalendarEvents")
      .withIndex("by_closer_and_event", (q) =>
        q.eq("closerId", args.closerId).eq("calendarEventId", args.calendarEventId)
      )
      .first();

    if (existing) {
      console.log(`[excludeCalendarEvent] Event already excluded: ${args.calendarEventId}`);
      return { success: true, alreadyExcluded: true };
    }

    await ctx.db.insert("excludedCalendarEvents", {
      closerId: args.closerId,
      calendarEventId: args.calendarEventId,
      eventTitle: args.eventTitle,
      isRecurring: args.isRecurring,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// Remove an excluded calendar event (re-enable meeting bot for it)
export const removeExcludedEvent = mutation({
  args: {
    closerId: v.id("closers"),
    calendarEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const excluded = await ctx.db
      .query("excludedCalendarEvents")
      .withIndex("by_closer_and_event", (q) =>
        q.eq("closerId", args.closerId).eq("calendarEventId", args.calendarEventId)
      )
      .first();

    if (!excluded) {
      console.log(`[removeExcludedEvent] Event not found in exclusions: ${args.calendarEventId}`);
      return { success: false, error: "Excluded event not found" };
    }

    await ctx.db.delete(excluded._id);
    return { success: true };
  },
});

// ============================================
// QUERIES
// ============================================

// Get active bots (joining or active) for a closer
export const getActiveBots = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const bots = await ctx.db
      .query("meetingBots")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("status"), "joining")
        )
      )
      .collect();

    return bots;
  },
});

// Get upcoming bots (scheduled within next 24 hours) for a closer
export const getUpcomingBots = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const twentyFourHoursFromNow = now + 24 * 60 * 60 * 1000;

    const bots = await ctx.db
      .query("meetingBots")
      .withIndex("by_closer_and_status", (q) =>
        q.eq("closerId", args.closerId).eq("status", "scheduled")
      )
      .collect();

    // Filter to only bots scheduled within the next 24 hours
    return bots.filter(
      (bot) =>
        bot.scheduledAt !== undefined &&
        bot.scheduledAt >= now &&
        bot.scheduledAt <= twentyFourHoursFromNow
    );
  },
});

// Get the bot linked to a specific call
export const getBotForCall = query({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || !call.meetingBotId) {
      return null;
    }

    return await ctx.db.get(call.meetingBotId);
  },
});

// Get completed bots where questionnaire has not been filled out
export const getPendingQuestionnaires = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const completedBots = await ctx.db
      .query("meetingBots")
      .withIndex("by_closer_and_status", (q) =>
        q.eq("closerId", args.closerId).eq("status", "completed")
      )
      .collect();

    // Filter to bots where questionnaire is not completed
    return completedBots.filter((bot) => bot.questionnaireCompleted !== true);
  },
});

// Get all excluded calendar events for a closer
export const getExcludedEvents = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("excludedCalendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();
  },
});

// Get a bot by its Meeting BaaS ID (used by webhook route)
export const getBotByMeetingBaasId = query({
  args: { meetingBaasId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("meetingBots")
      .withIndex("by_meeting_baas_id", (q) => q.eq("meetingBaasId", args.meetingBaasId))
      .first();
  },
});

// Get a call by ID (used by webhook route to check call status)
export const getCallById = query({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.callId);
  },
});

// Check if a team has meeting bot enabled
export const isMeetingBotEnabled = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return false;

    return team.meetingBotEnabled === true;
  },
});

// ============================================
// AUTO-SCHEDULE BOTS (Cron Job Support)
// ============================================

// Internal query: Get all closers with connected calendars on bot-enabled teams
// Uses the existing ICS feed-based calendar system (no OAuth required)
export const getClosersWithCalendars = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Get all teams with meeting bot enabled
    const allTeams = await ctx.db.query("teams").collect();
    const botEnabledTeams = allTeams.filter((t) => t.meetingBotEnabled === true);

    if (botEnabledTeams.length === 0) return [];

    const results: Array<{
      closerId: Id<"closers">;
      teamId: Id<"teams">;
      meetingPlatform?: string;
    }> = [];

    for (const team of botEnabledTeams) {
      // Find active closers who have an ICS feed URL connected
      const closers = await ctx.db
        .query("closers")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "active"),
            q.neq(q.field("icsUrl"), undefined)
          )
        )
        .collect();

      for (const closer of closers) {
        if (closer.icsUrl) {
          results.push({
            closerId: closer._id,
            teamId: team._id,
            meetingPlatform: closer.meetingPlatform,
          });
        }
      }
    }

    return results;
  },
});

// Internal query: Get upcoming calendar events for a closer (next 24 hours)
export const getUpcomingCalendarEvents = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const twentyFourHoursFromNow = now + 24 * 60 * 60 * 1000;

    // Get calendar events with meeting URLs in the next 24 hours
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .filter((q) =>
        q.and(
          q.gte(q.field("startTime"), now),
          q.lte(q.field("startTime"), twentyFourHoursFromNow),
          q.neq(q.field("meetingUrl"), undefined)
        )
      )
      .collect();

    return events;
  },
});

// Internal query: Get existing bots for a closer's calendar events (to avoid duplicates)
export const getExistingBotsForEvents = internalQuery({
  args: {
    closerId: v.id("closers"),
    eventIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existingBots: string[] = [];

    for (const eventId of args.eventIds) {
      const bot = await ctx.db
        .query("meetingBots")
        .withIndex("by_calendar_event", (q) => q.eq("calendarEventId", eventId))
        .first();

      if (bot && bot.status !== "cancelled" && bot.status !== "failed") {
        existingBots.push(eventId);
      }
    }

    return existingBots;
  },
});

// Internal query: Get excluded events for a closer
export const getExcludedEventIds = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const excluded = await ctx.db
      .query("excludedCalendarEvents")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .collect();

    return excluded.map((e) => e.calendarEventId);
  },
});

/**
 * Auto-schedule bots for all closers with connected calendars.
 * This action is called by a cron job every 15 minutes.
 * It checks calendar events in the next 24 hours and creates bots
 * for meetings that have video conference URLs.
 */
export const autoScheduleBotsForAllClosers = action({
  args: {},
  handler: async (ctx) => {
    // 1. Get all closers with connected calendars on bot-enabled teams
    const closers = await ctx.runQuery(internal.meetingBot.getClosersWithCalendars);

    if (closers.length === 0) {
      console.log("[autoSchedule] No closers with calendars on bot-enabled teams");
      return { scheduled: 0 };
    }

    let totalScheduled = 0;

    for (const closer of closers) {
      try {
        // 2. Get upcoming calendar events with meeting URLs
        const events = await ctx.runQuery(internal.meetingBot.getUpcomingCalendarEvents, {
          closerId: closer.closerId,
        });

        if (events.length === 0) continue;

        // 3. Get excluded events
        const excludedEventIds = await ctx.runQuery(internal.meetingBot.getExcludedEventIds, {
          closerId: closer.closerId,
        });

        // 4. Filter out excluded events
        const eligibleEvents = events.filter(
          (event: { uid: string; meetingUrl?: string; title: string; startTime: number }) => !excludedEventIds.includes(event.uid)
        );

        if (eligibleEvents.length === 0) continue;

        // 5. Get existing bots to avoid duplicates
        const eventIds = eligibleEvents.map((e: { uid: string }) => e.uid);
        const existingBotEventIds = await ctx.runQuery(internal.meetingBot.getExistingBotsForEvents, {
          closerId: closer.closerId,
          eventIds,
        });

        // 6. Schedule bots for new events
        for (const event of eligibleEvents) {
          if (existingBotEventIds.includes(event.uid)) continue;
          if (!event.meetingUrl) continue;

          try {
            await ctx.runAction(api.meetingBot.createBot, {
              meetingUrl: event.meetingUrl,
              closerId: closer.closerId,
              teamId: closer.teamId,
              meetingTitle: event.title,
              prospectName: event.title, // Default to event title as prospect name
              calendarEventId: event.uid,
              scheduledAt: event.startTime,
            });

            totalScheduled++;
            console.log(`[autoSchedule] Scheduled bot for ${closer.closerId}: "${event.title}" at ${new Date(event.startTime).toISOString()}`);
          } catch (error) {
            console.error(`[autoSchedule] Failed to schedule bot for event ${event.uid}:`, error);
          }
        }
      } catch (error) {
        console.error(`[autoSchedule] Error processing closer ${closer.closerId}:`, error);
      }
    }

    console.log(`[autoSchedule] Total bots scheduled: ${totalScheduled}`);
    return { scheduled: totalScheduled };
  },
});

// ============================================
// QUERIES & MUTATIONS FOR DESKTOP APP HTTP ROUTES
// ============================================

// Check if a closer needs calendar onboarding
export const needsCalendarOnboarding = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return false;

    // Check if the closer's team has meeting bot enabled
    const team = await ctx.db.get(closer.teamId);
    if (!team || !team.meetingBotEnabled) return false;

    // Needs onboarding if they haven't completed it yet
    return closer.calendarOnboardingCompleted !== true;
  },
});

// Get active bot call for a closer (for the Active Call View)
export const getActiveCallForCloserBot = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    // Find active or joining bots for this closer
    const bots = await ctx.db
      .query("meetingBots")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("status"), "joining")
        )
      )
      .collect();

    if (bots.length === 0) {
      return { hasActiveCall: false };
    }

    const bot = bots[0];
    return {
      hasActiveCall: true,
      botId: bot.meetingBaasId,     // Meeting BaaS ID for kick/cancel API
      convexBotId: bot._id,         // Convex ID for internal queries
      callId: bot.callId,
      meetingTitle: bot.meetingTitle,
      prospectName: bot.prospectName,
      status: bot.status,
    };
  },
});

// Save meeting platform preference for a closer
export const saveMeetingPlatform = mutation({
  args: {
    closerId: v.id("closers"),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) {
      throw new Error("Closer not found");
    }

    await ctx.db.patch(args.closerId, {
      meetingPlatform: args.platform,
    });

    return { success: true };
  },
});

// Get call history for a closer (for Call History view)
export const getCallHistoryForCloser = query({
  args: {
    closerId: v.id("closers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.limit ?? 50;

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .order("desc")
      .take(maxResults);

    return calls.map((call) => ({
      _id: call._id,
      prospectName: call.prospectName,
      status: call.status,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      duration: call.duration,
      recordingUrl: call.recordingUrl,
      recordingType: call.recordingType,
      outcome: call.outcome,
      cashCollected: call.cashCollected,
      contractValue: call.contractValue,
      meetingBotId: call.meetingBotId,
    }));
  },
});

// Get closer dashboard stats (personal stats + team comparison)
export const getCloserDashboardStats = query({
  args: {
    closerId: v.id("closers"),
    period: v.string(), // "week" | "month"
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return {};

    const now = Date.now();
    let periodStart: number;
    if (args.period === "month") {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      periodStart = d.getTime();
    } else {
      // Default to week
      const d = new Date();
      d.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
      d.setHours(0, 0, 0, 0);
      periodStart = d.getTime();
    }

    // Get this closer's calls in the period
    const myCalls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .filter((q) => q.gte(q.field("startedAt"), periodStart))
      .collect();

    const myCompleted = myCalls.filter((c) => c.status === "completed" || c.endedAt);
    const myClosed = myCompleted.filter((c) => c.outcome === "closed_won");
    const myCloseRate = myCompleted.length > 0 ? (myClosed.length / myCompleted.length) * 100 : 0;
    const myCash = myCompleted.reduce((sum, c) => sum + (c.cashCollected || 0), 0);

    // Get all team closers for comparison
    const teamClosers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", closer.teamId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    let teamTotalCalls = 0;
    let teamTotalCompleted = 0;
    let teamTotalClosed = 0;
    let teamTotalCash = 0;

    for (const tc of teamClosers) {
      const tcCalls = await ctx.db
        .query("calls")
        .withIndex("by_closer", (q) => q.eq("closerId", tc._id))
        .filter((q) => q.gte(q.field("startedAt"), periodStart))
        .collect();
      const tcCompleted = tcCalls.filter((c) => c.status === "completed" || c.endedAt);
      const tcClosed = tcCompleted.filter((c) => c.outcome === "closed_won");
      teamTotalCalls += tcCalls.length;
      teamTotalCompleted += tcCompleted.length;
      teamTotalClosed += tcClosed.length;
      teamTotalCash += tcCompleted.reduce((sum, c) => sum + (c.cashCollected || 0), 0);
    }

    const teamCount = teamClosers.length || 1;
    const teamAvgCloseRate = teamTotalCompleted > 0 ? (teamTotalClosed / teamTotalCompleted) * 100 : 0;
    const teamAvgCash = teamTotalCash / teamCount;
    const teamAvgCalls = teamTotalCalls / teamCount;

    return {
      callsThisPeriod: myCalls.length,
      closeRate: Math.round(myCloseRate * 10) / 10,
      cashCollected: myCash,
      teamAvgCloseRate: Math.round(teamAvgCloseRate * 10) / 10,
      teamAvgCash: Math.round(teamAvgCash),
      teamAvgCalls: Math.round(teamAvgCalls * 10) / 10,
      teamSize: teamClosers.length,
    };
  },
});
