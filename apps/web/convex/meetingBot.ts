import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Schedule a delayed fetch of the recording URL from Meeting BaaS API
export const scheduleRecordingFetch = internalMutation({
  args: {
    meetingBaasId: v.string(),
    delayMs: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(args.delayMs, internal.meetingBot.fetchBotRecording, {
      meetingBaasId: args.meetingBaasId,
      attempt: 1,
    });
  },
});

// Fetch recording URL from Meeting BaaS API and update bot + call records
export const fetchBotRecording = internalAction({
  args: {
    meetingBaasId: v.string(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const meetingBaasApiKey = process.env.MEETING_BAAS_API_KEY;
    if (!meetingBaasApiKey) {
      console.error(`[fetchBotRecording] MEETING_BAAS_API_KEY not configured`);
      return;
    }

    try {
      const response = await fetch(`https://api.meetingbaas.com/v2/bots/${args.meetingBaasId}`, {
        method: "GET",
        headers: {
          "x-meeting-baas-api-key": meetingBaasApiKey,
        },
      });

      if (!response.ok) {
        console.error(`[fetchBotRecording] API error: ${response.status} for bot ${args.meetingBaasId}`);
        // Retry up to 3 times with increasing delay
        if (args.attempt < 3) {
          await ctx.runMutation(internal.meetingBot.scheduleRecordingFetch, {
            meetingBaasId: args.meetingBaasId,
            delayMs: args.attempt * 60000, // 1min, 2min, 3min
          });
        }
        return;
      }

      const data = await response.json();
      console.log(`[fetchBotRecording] API response keys: ${Object.keys(data).join(", ")}`);
      console.log(`[fetchBotRecording] API response: ${JSON.stringify(data).substring(0, 2000)}`);

      // Extract recording URL from API response
      // Meeting BaaS v2 wraps response in { success, data: { video, audio, ... } }
      const botData = data.data || data;
      const recordingUrl = botData.video || botData.mp4 || botData.recording_url || botData.recording
        || botData.video_url || botData.mp4_url || botData.outputs?.recording_url || botData.outputs?.mp4
        || data.video || data.mp4 || data.recording_url || data.recording || data.video_url;

      if (!recordingUrl) {
        console.log(`[fetchBotRecording] No recording URL yet for ${args.meetingBaasId}, attempt ${args.attempt}`);
        // Retry with increasing delay
        if (args.attempt < 3) {
          await ctx.runMutation(internal.meetingBot.scheduleRecordingFetch, {
            meetingBaasId: args.meetingBaasId,
            delayMs: args.attempt * 60000,
          });
        } else {
          console.error(`[fetchBotRecording] Gave up fetching recording for ${args.meetingBaasId} after ${args.attempt} attempts`);
        }
        return;
      }

      console.log(`[fetchBotRecording] Found recording URL for ${args.meetingBaasId}: ${recordingUrl}`);

      // Update bot record
      await ctx.runMutation(api.meetingBot.updateBotStatus, {
        meetingBaasId: args.meetingBaasId,
        recordingUrl,
      });

      // Update linked call record
      const bot = await ctx.runQuery(api.meetingBot.getBotByMeetingBaasId, {
        meetingBaasId: args.meetingBaasId,
      });

      if (bot?.callId) {
        await ctx.runMutation(internal.meetingBot.updateCallRecordingUrl, {
          callId: bot.callId,
          recordingUrl,
        });
        console.log(`[fetchBotRecording] Updated call ${bot.callId} with recording URL`);
      }
    } catch (error) {
      console.error(`[fetchBotRecording] Error fetching recording:`, error);
      if (args.attempt < 3) {
        await ctx.runMutation(internal.meetingBot.scheduleRecordingFetch, {
          meetingBaasId: args.meetingBaasId,
          delayMs: args.attempt * 60000,
        });
      }
    }
  },
});

// Update call recording URL (internal, used by fetchBotRecording)
export const updateCallRecordingUrl = internalMutation({
  args: {
    callId: v.id("calls"),
    recordingUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      recordingUrl: args.recordingUrl,
    });
  },
});

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
        bot_image: "https://sequ3nce.ai/bot-avatar.png",
        entry_message: "This meeting is being recorded.",
        // v2 streaming config — 24kHz is Meeting BaaS default; good balance of quality and bandwidth
        streaming_enabled: true,
        streaming_config: {
          input_url: streamingUrl,
          output_url: streamingUrl,
          audio_frequency: 24000,
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
        bot_image: "https://sequ3nce.ai/bot-avatar.png",
        entry_message: "This meeting is being recorded.",
        // v2 streaming config — 24kHz is Meeting BaaS default; good balance of quality and bandwidth
        streaming_enabled: true,
        streaming_config: {
          input_url: streamingUrl,
          output_url: streamingUrl,
          audio_frequency: 24000,
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

// Activate a bot from the audio processor — sets status to "active" with joinedAt
// This is the PRIMARY mechanism for bot activation since Meeting BaaS v2 does NOT
// send a "meeting.started" or "bot.in_call" webhook event.
export const activateBotFromAudioProcessor = mutation({
  args: {
    botId: v.string(), // Our internal Convex meetingBots _id
  },
  handler: async (ctx, args) => {
    const botDocId = ctx.db.normalizeId("meetingBots", args.botId);
    if (!botDocId) {
      console.error(`[activateBot] Invalid bot ID: ${args.botId}`);
      return;
    }

    const bot = await ctx.db.get(botDocId);
    if (!bot) {
      console.error(`[activateBot] Bot not found: ${args.botId}`);
      return;
    }

    // Only activate if not already active/completed
    if (bot.status === "scheduled" || bot.status === "joining") {
      await ctx.db.patch(botDocId, {
        status: "active",
        joinedAt: Date.now(),
      });
      console.log(`[activateBot] Bot ${args.botId} activated (was: ${bot.status})`);
    } else {
      console.log(`[activateBot] Bot ${args.botId} already in status: ${bot.status}, skipping`);
    }
  },
});

// Mark a bot as "completed" when the audio processor WebSocket closes.
// This is the primary signal that a call has ended, since the Meeting BaaS v2
// webhook (bot.completed) may arrive late or not at all.
export const completeBotFromAudioProcessor = mutation({
  args: {
    botId: v.string(), // Our internal Convex meetingBots _id
  },
  handler: async (ctx, args) => {
    const botDocId = ctx.db.normalizeId("meetingBots", args.botId);
    if (!botDocId) {
      console.error(`[completeBotFromAudioProcessor] Invalid bot ID: ${args.botId}`);
      return;
    }

    const bot = await ctx.db.get(botDocId);
    if (!bot) {
      console.error(`[completeBotFromAudioProcessor] Bot not found: ${args.botId}`);
      return;
    }

    // Only transition if not already completed (webhook may have beaten us)
    if (bot.status === "completed") {
      console.log(`[completeBotFromAudioProcessor] Bot ${args.botId} already completed, skipping`);
      return;
    }

    await ctx.db.patch(botDocId, {
      status: "completed",
      endedAt: Date.now(),
    });
    console.log(`[completeBotFromAudioProcessor] Bot ${args.botId} marked as completed (was: ${bot.status})`);
  },
});

// Link an existing call (created by audio processor) to a meeting bot
// Called by the audio processor after it creates a call for a bot session
export const linkCallToBot = mutation({
  args: {
    botId: v.string(), // Our internal Convex meetingBots _id
    callId: v.string(), // The Convex calls _id from the audio processor
  },
  handler: async (ctx, args) => {
    // Normalize the bot ID
    const botDocId = ctx.db.normalizeId("meetingBots", args.botId);
    if (!botDocId) {
      console.error(`[linkCallToBot] Invalid bot ID: ${args.botId}`);
      return { success: false };
    }

    const bot = await ctx.db.get(botDocId);
    if (!bot) {
      console.error(`[linkCallToBot] Bot not found: ${args.botId}`);
      return { success: false };
    }

    // Update the bot record with the call ID
    const callDocId = ctx.db.normalizeId("calls", args.callId);
    if (callDocId) {
      await ctx.db.patch(botDocId, {
        callId: callDocId,
      });

      // Also update the call to reference the bot
      await ctx.db.patch(callDocId, {
        meetingBotId: botDocId,
        recordingType: "video",
      });

      console.log(`[linkCallToBot] Linked call ${args.callId} to bot ${args.botId}`);
      return { success: true };
    }

    console.error(`[linkCallToBot] Invalid call ID: ${args.callId}`);
    return { success: false };
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

    // Schedule AI summary generation with 60s delay to let transcript fully flush
    // (audio processor may still be writing transcript segments when bot completes)
    if (call.transcriptText) {
      await ctx.scheduler.runAfter(60000, api.ai.generateCallSummary, {
        callId: args.callId,
        transcript: call.transcriptText,
        outcome: call.outcome || "unknown",
        prospectName: call.prospectName || "Prospect",
      });
      console.log(`[completeCallFromBot] Scheduled AI summary for call ${args.callId}`);
    } else {
      // Transcript not ready yet — schedule a retry in 60 seconds
      await ctx.scheduler.runAfter(60000, internal.meetingBot.retrySummaryGeneration, {
        callId: args.callId,
        attempt: 1,
      });
      console.log(`[completeCallFromBot] Transcript not ready, scheduled retry for call ${args.callId}`);
    }

    console.log(`[completeCallFromBot] Call completed: ${args.callId}`);
    return { success: true };
  },
});

// Retry summary generation if transcript wasn't ready when bot completed
export const retrySummaryGeneration = internalAction({
  args: {
    callId: v.id("calls"),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const call = await ctx.runQuery(internal.meetingBot.getCallByIdInternal, {
      callId: args.callId,
    });

    if (!call) {
      console.error(`[retrySummaryGeneration] Call not found: ${args.callId}`);
      return;
    }

    if (call.transcriptText && call.transcriptText.trim().length > 50) {
      // Transcript is ready — generate summary
      await ctx.runAction(api.ai.generateCallSummary, {
        callId: args.callId,
        transcript: call.transcriptText,
        outcome: call.outcome || "unknown",
        prospectName: call.prospectName || "Prospect",
      });
      console.log(`[retrySummaryGeneration] Generated summary for call ${args.callId} on attempt ${args.attempt}`);
    } else if (args.attempt < 3) {
      // Retry again in 60 seconds (max 3 attempts)
      await ctx.runMutation(internal.meetingBot.scheduleRetry, {
        callId: args.callId,
        attempt: args.attempt + 1,
      });
      console.log(`[retrySummaryGeneration] Transcript still empty, scheduling attempt ${args.attempt + 1} for call ${args.callId}`);
    } else {
      console.log(`[retrySummaryGeneration] Gave up after ${args.attempt} attempts for call ${args.callId}`);
    }
  },
});

// Internal query to get call by ID (used by retrySummaryGeneration)
export const getCallByIdInternal = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.callId);
  },
});

// Schedule a retry for summary generation
export const scheduleRetry = internalMutation({
  args: {
    callId: v.id("calls"),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(60000, internal.meetingBot.retrySummaryGeneration, {
      callId: args.callId,
      attempt: args.attempt,
    });
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

// Get active bots (actually in the meeting) for a closer
export const getActiveBots = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const bots = await ctx.db
      .query("meetingBots")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .filter((q) => q.eq(q.field("status"), "active"))
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
        // NOTE: This cron is disabled — bots are now created on-demand via "Join & Record"
        for (const event of eligibleEvents) {
          if (existingBotEventIds.includes(event.uid)) continue;
          if (!event.meetingUrl) continue;

          try {
            await ctx.runAction(api.meetingBot.createBot, {
              meetingUrl: event.meetingUrl,
              closerId: closer.closerId,
              teamId: closer.teamId,
              meetingTitle: event.title,
              prospectName: event.title,
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
// This is a mutation (not query) because it performs stale bot cleanup as a side effect.
export const getActiveCallForCloserBot = mutation({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;

    // Find bots that are active OR recently scheduled (within last 10 minutes)
    const allBots = await ctx.db
      .query("meetingBots")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "active"),
          q.and(
            q.eq(q.field("status"), "scheduled"),
            q.gte(q.field("_creationTime"), tenMinutesAgo)
          )
        )
      )
      .collect();

    // Auto-cleanup stale bots before returning results
    for (const bot of allBots) {
      if (bot.status === "scheduled" && bot._creationTime < tenMinutesAgo) {
        await ctx.db.patch(bot._id, { status: "completed", endedAt: Date.now() });
        console.log(`[getActiveCallForCloserBot] Cleaned up stale scheduled bot: ${bot._id}`);
      }
      if (bot.status === "active" && (bot.joinedAt || bot._creationTime) < threeHoursAgo) {
        await ctx.db.patch(bot._id, { status: "completed", endedAt: Date.now() });
        console.log(`[getActiveCallForCloserBot] Cleaned up stale active bot: ${bot._id}`);
      }
    }

    // Filter to non-stale bots only
    const validBots = allBots.filter((bot) => {
      if (bot.status === "scheduled" && bot._creationTime < tenMinutesAgo) return false;
      if (bot.status === "active" && (bot.joinedAt || bot._creationTime) < threeHoursAgo) return false;
      return true;
    });

    if (validBots.length === 0) {
      return { hasActiveCall: false };
    }

    // Prefer active over scheduled
    const bot = validBots.find((b) => b.status === "active") || validBots[0];
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
      closerTalkTime: call.closerTalkTime,
      prospectTalkTime: call.prospectTalkTime,
      summary: call.summary,
      transcriptText: call.transcriptText,
    }));
  },
});

// Get closer dashboard stats (personal stats + team comparison)
export const getCloserDashboardStats = query({
  args: {
    closerId: v.id("closers"),
    period: v.string(), // "today" | "week" | "month" | "last30"
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return {};

    const now = Date.now();
    let periodStart: number;
    if (args.period === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      periodStart = d.getTime();
    } else if (args.period === "month") {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      periodStart = d.getTime();
    } else if (args.period === "last30") {
      periodStart = now - 30 * 24 * 60 * 60 * 1000;
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
    const myClosed = myCompleted.filter((c) => c.outcome === "closed" || c.outcome === "closed_won");
    const myCloseRate = myCompleted.length > 0 ? (myClosed.length / myCompleted.length) * 100 : 0;
    const myCash = myCompleted.reduce((sum, c) => sum + (c.cashCollected || 0), 0);

    // Compute avg call duration (seconds)
    const myDurations = myCompleted.filter((c) => c.duration && c.duration > 0).map((c) => c.duration!);
    const avgCallDuration = myDurations.length > 0 ? myDurations.reduce((a, b) => a + b, 0) / myDurations.length : 0;

    // Compute avg talk ratio
    const myTalkCalls = myCompleted.filter((c) => c.closerTalkTime && c.prospectTalkTime && (c.closerTalkTime + c.prospectTalkTime) > 0);
    const avgTalkRatio = myTalkCalls.length > 0
      ? myTalkCalls.reduce((sum, c) => sum + (c.closerTalkTime! / (c.closerTalkTime! + c.prospectTalkTime!)) * 100, 0) / myTalkCalls.length
      : 0;

    // Compute total contract value from closed deals
    const totalContractValue = myClosed.reduce((sum, c) => sum + (c.contractValue || 0), 0);

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
    let teamTotalDuration = 0;
    let teamDurationCount = 0;
    let teamTotalTalkRatio = 0;
    let teamTalkRatioCount = 0;
    let teamTotalContractValue = 0;

    for (const tc of teamClosers) {
      const tcCalls = await ctx.db
        .query("calls")
        .withIndex("by_closer", (q) => q.eq("closerId", tc._id))
        .filter((q) => q.gte(q.field("startedAt"), periodStart))
        .collect();
      const tcCompleted = tcCalls.filter((c) => c.status === "completed" || c.endedAt);
      const tcClosed = tcCompleted.filter((c) => c.outcome === "closed" || c.outcome === "closed_won");
      teamTotalCalls += tcCalls.length;
      teamTotalCompleted += tcCompleted.length;
      teamTotalClosed += tcClosed.length;
      teamTotalCash += tcCompleted.reduce((sum, c) => sum + (c.cashCollected || 0), 0);
      teamTotalContractValue += tcClosed.reduce((sum, c) => sum + (c.contractValue || 0), 0);

      // Duration
      const tcDurations = tcCompleted.filter((c) => c.duration && c.duration > 0);
      teamTotalDuration += tcDurations.reduce((sum, c) => sum + c.duration!, 0);
      teamDurationCount += tcDurations.length;

      // Talk ratio
      const tcTalkCalls = tcCompleted.filter((c) => c.closerTalkTime && c.prospectTalkTime && (c.closerTalkTime + c.prospectTalkTime) > 0);
      teamTotalTalkRatio += tcTalkCalls.reduce((sum, c) => sum + (c.closerTalkTime! / (c.closerTalkTime! + c.prospectTalkTime!)) * 100, 0);
      teamTalkRatioCount += tcTalkCalls.length;
    }

    const teamCount = teamClosers.length || 1;
    const teamAvgCloseRate = teamTotalCompleted > 0 ? (teamTotalClosed / teamTotalCompleted) * 100 : 0;
    const teamAvgCash = teamTotalCash / teamCount;
    const teamAvgCalls = teamTotalCalls / teamCount;
    const teamAvgDuration = teamDurationCount > 0 ? teamTotalDuration / teamDurationCount : 0;
    const teamAvgTalkRatio = teamTalkRatioCount > 0 ? teamTotalTalkRatio / teamTalkRatioCount : 0;
    const teamAvgContractValue = teamTotalContractValue / teamCount;

    return {
      callsThisPeriod: myCalls.length,
      closeRate: Math.round(myCloseRate * 10) / 10,
      cashCollected: myCash,
      avgCallDuration: Math.round(avgCallDuration),
      avgTalkRatio: Math.round(avgTalkRatio * 10) / 10,
      totalContractValue: Math.round(totalContractValue),
      teamAvgCloseRate: Math.round(teamAvgCloseRate * 10) / 10,
      teamAvgCash: Math.round(teamAvgCash),
      teamAvgCalls: Math.round(teamAvgCalls * 10) / 10,
      teamAvgDuration: Math.round(teamAvgDuration),
      teamAvgTalkRatio: Math.round(teamAvgTalkRatio * 10) / 10,
      teamAvgContractValue: Math.round(teamAvgContractValue),
      teamSize: teamClosers.length,
    };
  },
});
