import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { BOT_AVATAR_JPEG_B64 } from "./botAvatar";
import { getContentForCallTx } from "./callContent";
import { classifyMeeting } from "./fathomClassify";
import { extractProspectFromTitle } from "./lib/extractProspectFromTitle";

// Schedule a delayed fetch of the recording URL from Recall.ai API
export const scheduleRecordingFetch = internalMutation({
  args: {
    recallBotId: v.optional(v.string()),
    delayMs: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.recallBotId) {
      await ctx.scheduler.runAfter(args.delayMs, internal.meetingBot.fetchBotRecording, {
        recallBotId: args.recallBotId,
        attempt: 1,
      });
    }
  },
});

// Fetch recording URL from Recall.ai API and update bot + call records
export const fetchBotRecording = internalAction({
  args: {
    recallBotId: v.string(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    const recallApiKey = process.env.RECALL_API_KEY;
    if (!recallApiKey) {
      console.error(`[fetchBotRecording] RECALL_API_KEY not configured`);
      return;
    }

    try {
      const response = await fetch(
        `https://us-west-2.recall.ai/api/v1/bot/${args.recallBotId}/`,
        {
          headers: {
            "Authorization": `Token ${recallApiKey}`,
          },
        }
      );

      if (!response.ok) {
        console.error(`[fetchBotRecording] Recall API error: ${response.status} for bot ${args.recallBotId}`);
        if (args.attempt < 3) {
          await ctx.runMutation(internal.meetingBot.scheduleRecordingFetch, {
            recallBotId: args.recallBotId,
            delayMs: args.attempt * 30000, // 30s, 60s, 90s (Recall is faster than MBaaS)
          });
        }
        return;
      }

      const data = await response.json();
      console.log(`[fetchBotRecording] Recall API response keys: ${Object.keys(data).join(", ")}`);
      console.log(`[fetchBotRecording] Recall API response: ${JSON.stringify(data).substring(0, 2000)}`);

      // Extract recording URL from Recall.ai response
      const recordingUrl = data.recordings?.[0]?.media_shortcuts?.video_mixed?.data?.download_url;

      if (!recordingUrl) {
        console.log(`[fetchBotRecording] No recording URL yet for ${args.recallBotId}, attempt ${args.attempt}`);
        if (args.attempt < 3) {
          await ctx.runMutation(internal.meetingBot.scheduleRecordingFetch, {
            recallBotId: args.recallBotId,
            delayMs: args.attempt * 30000,
          });
        } else {
          console.error(`[fetchBotRecording] Gave up fetching recording for ${args.recallBotId} after ${args.attempt} attempts`);
        }
        return;
      }

      // Calculate duration from bot status changes if available
      const statusChanges = data.status_changes || [];
      let recordingDuration: number | undefined;
      const joinedEvent = statusChanges.find((sc: any) => sc.code === "in_call_recording");
      const doneEvent = statusChanges.find((sc: any) => sc.code === "done");
      if (joinedEvent && doneEvent) {
        recordingDuration = Math.round(
          (new Date(doneEvent.created_at).getTime() - new Date(joinedEvent.created_at).getTime()) / 1000
        );
      }

      console.log(`[fetchBotRecording] Found recording URL for ${args.recallBotId}: ${recordingUrl}, duration: ${recordingDuration || "unknown"}s`);

      // Update bot record
      await ctx.runMutation(api.meetingBot.updateBotStatus, {
        recallBotId: args.recallBotId,
        recordingUrl,
        ...(recordingDuration && { recordingDuration }),
      });

      // Update linked call record
      const bot = await ctx.runQuery(api.meetingBot.getBotByRecallId, {
        recallBotId: args.recallBotId,
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
          recallBotId: args.recallBotId,
          delayMs: args.attempt * 30000,
        });
      }
      await ctx.scheduler.runAfter(0, internal.lib.sentry.captureFromIsolate, {
        message: error instanceof Error ? error.message : String(error),
        feature: "fetchBotRecording",
        integration: "recall",
        extra: { recallBotId: args.recallBotId, attempt: args.attempt },
      });
    }
  },
});

/**
 * Refresh a recording URL by re-fetching from Recall.ai API.
 * Recording data is stored permanently on Recall, but download URLs expire after ~24h.
 * This action fetches a fresh URL and updates the stored records.
 */
export const refreshRecordingUrl = action({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args): Promise<{ recordingUrl: string | null }> => {
    const recallApiKey = process.env.RECALL_API_KEY;
    if (!recallApiKey) {
      throw new Error("RECALL_API_KEY not configured");
    }

    // Find the meeting bot linked to this call
    const bots = await ctx.runQuery(internal.meetingBot.getBotsByCallId, {
      callId: args.callId,
    });

    const bot = bots?.[0];
    if (!bot?.recallBotId) {
      // No Recall bot — might be a legacy recording or audio-only call
      const call = await ctx.runQuery(internal.meetingBot.getCallByIdInternal, { callId: args.callId });
      return { recordingUrl: (call as any)?.recordingUrl ?? null };
    }

    // Fetch fresh URL from Recall.ai
    const response: Response = await fetch(
      `https://us-west-2.recall.ai/api/v1/bot/${bot.recallBotId}/`,
      {
        headers: { "Authorization": `Token ${recallApiKey}` },
      }
    );

    if (!response.ok) {
      console.error(`[refreshRecordingUrl] Recall API error: ${response.status} for bot ${bot.recallBotId}`);
      throw new Error(`Failed to fetch recording from Recall.ai (HTTP ${response.status})`);
    }

    const data: any = await response.json();
    const recordingUrl: string | undefined = data.recordings?.[0]?.media_shortcuts?.video_mixed?.data?.download_url;

    if (!recordingUrl) {
      console.error(`[refreshRecordingUrl] No recording URL in Recall response for bot ${bot.recallBotId}`);
      const call = await ctx.runQuery(internal.meetingBot.getCallByIdInternal, { callId: args.callId });
      return { recordingUrl: (call as any)?.recordingUrl ?? null };
    }

    // Update the stored URL on both bot and call records
    await ctx.runMutation(internal.meetingBot.updateCallRecordingUrl, {
      callId: args.callId,
      recordingUrl,
    });

    await ctx.runMutation(internal.meetingBot.updateBotRecordingUrl, {
      recallBotId: bot.recallBotId,
      recordingUrl,
    });

    return { recordingUrl };
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
// Check if an active bot already exists for a given meeting URL + closer
// Used by createBot to prevent duplicate bots when user clicks "Join" multiple times
/**
 * Is a bot already covering this meeting?
 *
 * The unit is the MEETING, not the link and not the closer. Getting that wrong
 * broke this in both directions at once:
 *
 * TOO LOOSE — it matched on closerId, so a bot booked under one closer was
 * invisible to another. Since auto-join's attribution is provisional, the
 * closer who books it often isn't the closer who clicks "Join & Record", and
 * two bots walked into the same call.
 *
 * TOO TIGHT — it matched on meetingUrl, and people reuse links. One team has
 * FOURTEEN meetings sharing a single personal Zoom room and three more sharing
 * a recurring Meet link. Keyed on the URL, the first meeting of the day books a
 * bot and the other thirteen look like duplicates of it. Not "two bots in a
 * call" but "no bot at all", which is worse for being invisible.
 *
 * So: when we know which calendar event this is, that IS the identity. Fall
 * back to the link only when there is no event — QuickBot, someone pasting a
 * URL — and then only against bots happening around now, because the same
 * personal room hosts a different meeting every hour.
 */
export const findActiveBotForMeeting = internalQuery({
  args: {
    closerId: v.id("closers"),
    meetingUrl: v.string(),
    teamId: v.optional(v.id("teams")),
    calendarEventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // "scheduled" is booked but waiting; "joining" and "active" are on their
    // way in or already there. Note "active" — the previous code looked for
    // "in_call", which nothing has ever set, so a bot sitting in a live call
    // was invisible to this check and clicking the button twice sent a second.
    const LIVE = ["scheduled", "joining", "active"];

    // A calendar event names one meeting, unambiguously. Team-wide, because
    // whose bot it is doesn't change whether the meeting is covered.
    if (args.calendarEventId) {
      const forEvent = await ctx.db
        .query("meetingBots")
        .withIndex("by_calendar_event", (q) =>
          q.eq("calendarEventId", args.calendarEventId),
        )
        .collect();
      const live = forEvent.find(
        (b) =>
          LIVE.includes(b.status) &&
          (!args.teamId || String(b.teamId) === String(args.teamId)),
      );
      return live ?? null;
    }

    // No event to key on. Match the link, but only against meetings happening
    // near this one — otherwise a personal room's 9am booking suppresses its
    // 10am one.
    const NEARBY_MS = 2 * 60 * 60 * 1000;
    const now = Date.now();

    const candidates = args.teamId
      ? await ctx.db
          .query("meetingBots")
          .withIndex("by_team", (q) => q.eq("teamId", args.teamId!))
          .order("desc")
          .take(200)
      : await ctx.db
          .query("meetingBots")
          .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
          .order("desc")
          .take(200);

    const match = candidates.find((b) => {
      if (b.meetingUrl !== args.meetingUrl) return false;
      if (!LIVE.includes(b.status)) return false;
      // Already in the room — definitely the same meeting.
      if (b.status === "joining" || b.status === "active") return true;
      // Scheduled: only if it's for roughly now.
      if (typeof b.scheduledAt !== "number") return true;
      return Math.abs(b.scheduledAt - now) <= NEARBY_MS;
    });

    return match ?? null;
  },
});

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
    closerName: v.optional(v.string()),
    closerIsHost: v.optional(v.boolean()),
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
      closerName: args.closerName,
      closerIsHost: args.closerIsHost,
      createdAt: Date.now(),
    });
    return botId;
  },
});

// Store closer name on bot record for webhook transcript speaker identification
export const updateBotCloserName = internalMutation({
  args: {
    botId: v.id("meetingBots"),
    closerName: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.botId, { closerName: args.closerName });
  },
});

// Pin Recall's participant.id of the closer onto the bot row. Idempotent — once
// pinned, later high-confidence decisions don't overwrite it. The webhook handler
// uses this to lock per-call speaker labeling consistency: once we've confidently
// identified the closer's participant.id, every subsequent segment for that call
// inherits the same label without re-running the decision tree.
export const pinCloserParticipantId = internalMutation({
  args: {
    botId: v.id("meetingBots"),
    closerParticipantId: v.union(v.number(), v.string()),
  },
  handler: async (ctx, args) => {
    const bot = await ctx.db.get(args.botId);
    if (!bot || bot.closerParticipantId !== undefined) return;
    await ctx.db.patch(args.botId, { closerParticipantId: args.closerParticipantId });
  },
});

// Called by the audio processor (public mutation, no auth required — botId is
// the secret) when it sees the closer-matching participant in participant_events.join.
// Idempotent — first call wins; subsequent calls are no-ops. Returns true if pinned
// (or already pinned), false on bad botId. Best-effort: failures shouldn't crash
// the audio processor's call session.
export const pinCloserParticipantIdFromAudioProcessor = mutation({
  args: {
    botId: v.string(), // Convex meetingBots._id (string form — audio processor passes via WebSocket session metadata)
    closerParticipantId: v.union(v.number(), v.string()),
    participantName: v.optional(v.string()), // For logging only
    source: v.optional(v.string()), // "host_match" | "first_non_host" — for telemetry
  },
  handler: async (ctx, args) => {
    const botDocId = ctx.db.normalizeId("meetingBots", args.botId);
    if (!botDocId) {
      console.error(`[pinCloserFromAudio] Invalid bot ID: ${args.botId}`);
      return { success: false, reason: "invalid_bot_id" };
    }
    const bot = await ctx.db.get(botDocId);
    if (!bot) {
      console.error(`[pinCloserFromAudio] Bot not found: ${args.botId}`);
      return { success: false, reason: "bot_not_found" };
    }
    if (bot.closerParticipantId !== undefined) {
      // Already pinned — idempotent success.
      return { success: true, alreadyPinned: true };
    }
    await ctx.db.patch(botDocId, { closerParticipantId: args.closerParticipantId });
    console.log(
      `[pinCloserFromAudio] Pinned participantId=${args.closerParticipantId} as closer for bot ${args.botId} ` +
        `(name="${args.participantName ?? "?"}", source=${args.source ?? "?"}, closerIsHost=${bot.closerIsHost})`,
    );
    return { success: true, alreadyPinned: false };
  },
});

// Exposes bot's closer-host config + name patterns to the audio processor so it
// can deterministically pick the closer from participant_events.join. Public query
// because the audio processor uses anonymous HTTP. botId is the access token.
export const getBotConfigForAudioProcessor = query({
  args: { botId: v.string() },
  handler: async (ctx, args) => {
    const botDocId = ctx.db.normalizeId("meetingBots", args.botId);
    if (!botDocId) return null;
    const bot = await ctx.db.get(botDocId);
    if (!bot) return null;
    const team = await ctx.db.get(bot.teamId);
    return {
      closerIsHost: bot.closerIsHost ?? true, // Default to true preserves legacy scheduled-call behavior on bots created before this field existed
      closerName: bot.closerName ?? null,
      botName: team?.meetingBotName ?? "Sequ3nce.ai",
      closerParticipantId: bot.closerParticipantId ?? null,
    };
  },
});

// Update a meeting bot with the Recall.ai bot UUID
export const setBotRecallId = internalMutation({
  args: {
    botId: v.id("meetingBots"),
    recallBotId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.botId, {
      recallBotId: args.recallBotId,
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
// ACTIONS (have network access for Recall.ai API calls)
// ============================================

// Create a meeting bot for a calendar event (via Recall.ai API)
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
  handler: async (ctx, args): Promise<{ botId: Id<"meetingBots">; recallBotId: string }> => {
    // 0. Dedup — is this meeting already covered?
    //
    // Keyed on the calendar event when we have one, so a closer clicking
    // "Join & Record" on a meeting auto-join already booked reuses that bot
    // instead of sending a second — even though the two were attributed to
    // different closers.
    const existingBot = await ctx.runQuery(internal.meetingBot.findActiveBotForMeeting, {
      closerId: args.closerId,
      meetingUrl: args.meetingUrl,
      teamId: args.teamId,
      ...(args.calendarEventId ? { calendarEventId: args.calendarEventId } : {}),
    });
    if (existingBot) {
      console.log(`[createBot] Reusing existing bot ${existingBot._id} (recallBotId: ${existingBot.recallBotId}) for ${args.meetingUrl}`);
      return { botId: existingBot._id, recallBotId: existingBot.recallBotId || "" };
    }

    // 1. Create the meetingBot record with status "scheduled"
    // closerIsHost=true: scheduled calls = closer scheduled meeting = is the host.
    // decideSpeaker uses this to match Recall's participant.is_host correctly.
    const botId: Id<"meetingBots"> = await ctx.runMutation(internal.meetingBot.insertBot, {
      closerId: args.closerId,
      teamId: args.teamId,
      meetingUrl: args.meetingUrl,
      meetingTitle: args.meetingTitle,
      prospectName: args.prospectName,
      calendarEventId: args.calendarEventId,
      scheduledAt: args.scheduledAt,
      source: "calendar",
      closerIsHost: true,
    });

    // 2. Get team info for bot name configuration
    const team = await ctx.runQuery(internal.meetingBot.getTeamById, {
      teamId: args.teamId,
    });

    const botName = team?.meetingBotName || "Sequ3nce.ai";

    // Look up closer's name for speaker identification in transcripts
    const closer = await ctx.runQuery(internal.meetingBot.getCloserById, {
      closerId: args.closerId,
    });
    const closerName = closer?.name;

    // Store closerName on bot record for webhook transcript speaker identification
    if (closerName) {
      await ctx.runMutation(internal.meetingBot.updateBotCloserName, {
        botId,
        closerName,
      });
    }

    // 3. Call Recall.ai API to create the bot
    const recallApiKey = process.env.RECALL_API_KEY;
    if (!recallApiKey) {
      await ctx.runMutation(internal.meetingBot.markBotFailed, {
        botId,
        failureReason: "RECALL_API_KEY not configured",
      });
      throw new Error("RECALL_API_KEY not configured");
    }

    try {
      // Build WebSocket URL for audio processor (Recall.ai connects to this)
      const streamingUrl = `wss://amusing-charm-production.up.railway.app/recall?botId=${botId}&closerId=${args.closerId}&teamId=${args.teamId}${closerName ? `&closerName=${encodeURIComponent(closerName)}` : ""}${args.prospectName ? `&prospectName=${encodeURIComponent(args.prospectName)}` : ""}`;

      // When should it turn up?
      //
      // We stored `scheduledAt` on our own record and never told Recall about
      // it, so every bot was dispatched the moment it was created. That is
      // right for "Join & Record" — the closer clicks as they walk into the
      // call — and catastrophic for auto-join, which books up to 24 hours
      // ahead: the bot would walk into an empty room a day early, wait out its
      // no-one-joined timeout, leave, and be long gone by the time the meeting
      // actually started. Billed, and worse than useless.
      //
      // Recall wants at least ten minutes' notice to guarantee a scheduled bot
      // arrives on time. Anything sooner is an ad-hoc join, so we omit join_at
      // and let it dispatch now — preserving click-to-record exactly as it is.
      const JOIN_AT_MIN_LEAD_MS = 10 * 60 * 1000;
      const joinAt =
        typeof args.scheduledAt === "number" &&
        args.scheduledAt - Date.now() >= JOIN_AT_MIN_LEAD_MS
          ? new Date(args.scheduledAt).toISOString()
          : undefined;

      const requestBody = {
        meeting_url: args.meetingUrl,
        bot_name: botName,
        ...(joinAt ? { join_at: joinAt } : {}),
        automatic_video_output: {
          in_call_recording: {
            kind: "jpeg" as const,
            b64_data: BOT_AVATAR_JPEG_B64,
          },
          in_call_not_recording: {
            kind: "jpeg" as const,
            b64_data: BOT_AVATAR_JPEG_B64,
          },
        },
        automatic_leave: {
          everyone_left_timeout: 15,    // 15 seconds — enough for WiFi reconnects, fast exit after real call ends
          // How long to wait for a human.
          //
          // Five minutes was right when a closer clicked "Join & Record" on
          // their way in — someone was already there. A scheduled bot arrives
          // exactly on the hour, and sales calls routinely start a few minutes
          // late, so five minutes would abandon calls that were about to
          // happen. Ten costs a few idle minutes and saves the recording.
          noone_joined_timeout: joinAt ? 600 : 300,
        },
        recording_config: {
          retention: { type: "forever" as const },
          video_mixed_layout: "gallery_view_v2",
          video_mixed_participant_video_when_screenshare: "beside",
          transcript: {
            diarization: {
              use_separate_streams_when_available: true,
            },
            provider: {
              recallai_streaming: {
                language_code: "en",
                mode: "prioritize_low_latency",
              },
            },
          },
          audio_mixed_raw: {},
          realtime_endpoints: [
            {
              type: "websocket" as const,
              url: streamingUrl,
              events: [
                "audio_mixed_raw.data",
                "transcript.data",
                "participant_events.join",
                "participant_events.leave",
              ],
            },
            {
              type: "webhook" as const,
              url: `https://ideal-ram-982.convex.site/recall-transcript-webhook?token=${process.env.RECALL_TRANSCRIPT_WEBHOOK_SECRET}`,
              events: [
                "transcript.data",
              ],
            },
          ],
        },
      };

      console.log(`[createBot] Recall.ai request body: ${JSON.stringify(requestBody).substring(0, 500)}...`);

      const response = await fetch("https://us-west-2.recall.ai/api/v1/bot/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${recallApiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const failureReason = `Recall.ai API error: ${response.status} ${errorText}`;
        console.error(`[createBot] ${failureReason}`);

        await ctx.runMutation(internal.meetingBot.markBotFailed, {
          botId,
          failureReason,
        });
        throw new Error(failureReason);
      }

      const data = await response.json();
      console.log(`[createBot] Recall.ai response: ${JSON.stringify(data)}`);
      const recallBotId = data?.id || "";

      if (!recallBotId) {
        console.warn(`[createBot] Could not extract bot id from Recall response: ${JSON.stringify(data)}`);
      }

      // 4. Update the meetingBot record with the Recall.ai bot UUID
      if (recallBotId) {
        await ctx.runMutation(internal.meetingBot.setBotRecallId, {
          botId,
          recallBotId,
        });
      }

      console.log(`[createBot] Bot created successfully: ${botId}, recallBotId: ${recallBotId}`);
      return { botId, recallBotId };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Recall.ai API error:")) {
        await ctx.scheduler.runAfter(0, internal.lib.sentry.captureFromIsolate, {
          message: error instanceof Error ? error.message : String(error),
          feature: "createBot",
          integration: "recall",
          extra: { botId },
        });
        throw error;
      }

      const failureReason = error instanceof Error ? error.message : "Unknown error creating bot";
      console.error(`[createBot] Failed: ${failureReason}`);

      await ctx.runMutation(internal.meetingBot.markBotFailed, {
        botId,
        failureReason,
      });
      await ctx.scheduler.runAfter(0, internal.lib.sentry.captureFromIsolate, {
        message: error instanceof Error ? error.message : String(error),
        feature: "createBot",
        integration: "recall",
        extra: { botId },
      });
      throw error;
    }
  },
});

// User manually ends call — marks bot as "ended_by_user" so desktop poll stops showing it
export const endCallManually = mutation({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const bots = await ctx.db
      .query("meetingBots")
      .withIndex("by_closer_and_status", (q) => q.eq("closerId", args.closerId).eq("status", "active"))
      .collect();

    for (const bot of bots) {
      await ctx.db.patch(bot._id, { status: "ended_by_user" });
    }

    return { success: true, endedCount: bots.length };
  },
});

// Cancel a meeting bot (via Recall.ai API)
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

    // 2. Call Recall.ai API to cancel/remove the bot
    if (bot.recallBotId) {
      const recallApiKey = process.env.RECALL_API_KEY;
      if (!recallApiKey) {
        throw new Error("RECALL_API_KEY not configured");
      }

      try {
        // Try leave_call first (for in-call bots)
        const leaveResponse = await fetch(
          `https://us-west-2.recall.ai/api/v1/bot/${bot.recallBotId}/leave_call/`,
          {
            method: "POST",
            headers: { "Authorization": `Token ${recallApiKey}` },
          }
        );

        if (!leaveResponse.ok) {
          // If bot hasn't joined yet (400), try DELETE for scheduled bots
          if (leaveResponse.status === 400 || leaveResponse.status === 405) {
            const deleteResponse = await fetch(
              `https://us-west-2.recall.ai/api/v1/bot/${bot.recallBotId}/`,
              {
                method: "DELETE",
                headers: { "Authorization": `Token ${recallApiKey}` },
              }
            );
            if (!deleteResponse.ok && deleteResponse.status !== 404) {
              const errorText = await deleteResponse.text();
              console.error(`[cancelBot] Recall.ai DELETE error: ${deleteResponse.status} ${errorText}`);
            }
          } else if (leaveResponse.status !== 404) {
            const errorText = await leaveResponse.text();
            console.error(`[cancelBot] Recall.ai leave_call error: ${leaveResponse.status} ${errorText}`);
          }
        }
      } catch (error) {
        console.error(`[cancelBot] Failed to call Recall.ai API:`, error);
        // Continue with local cancellation even if API call fails
        await ctx.scheduler.runAfter(0, internal.lib.sentry.captureFromIsolate, {
          message: error instanceof Error ? error.message : String(error),
          feature: "cancelBot",
          integration: "recall",
          extra: { botId: args.botId, recallBotId: bot.recallBotId },
        });
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

// Create a quick bot (manual, not from calendar) via Recall.ai API
export const createQuickBot = action({
  args: {
    meetingUrl: v.string(),
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    prospectName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ botId: Id<"meetingBots">; recallBotId: string }> => {
    // 1. Create the meetingBot record with status "scheduled" and source "quick_bot"
    // closerIsHost=false: QuickBot = closer pasted external Zoom URL = joining as guest,
    // not host. decideSpeaker uses this to match Recall's participant.is_host correctly.
    const botId: Id<"meetingBots"> = await ctx.runMutation(internal.meetingBot.insertBot, {
      closerId: args.closerId,
      teamId: args.teamId,
      meetingUrl: args.meetingUrl,
      prospectName: args.prospectName,
      source: "quick_bot",
      closerIsHost: false,
    });

    // 2. Get team info for bot name configuration
    const team = await ctx.runQuery(internal.meetingBot.getTeamById, {
      teamId: args.teamId,
    });

    const botName = team?.meetingBotName || "Sequ3nce.ai";

    // Look up closer's name for speaker identification in transcripts
    const closer = await ctx.runQuery(internal.meetingBot.getCloserById, {
      closerId: args.closerId,
    });
    const closerName = closer?.name;

    // Store closerName on bot record for webhook transcript speaker identification
    if (closerName) {
      await ctx.runMutation(internal.meetingBot.updateBotCloserName, {
        botId,
        closerName,
      });
    }

    // 3. Call Recall.ai API to create the bot
    const recallApiKey = process.env.RECALL_API_KEY;
    if (!recallApiKey) {
      await ctx.runMutation(internal.meetingBot.markBotFailed, {
        botId,
        failureReason: "RECALL_API_KEY not configured",
      });
      throw new Error("RECALL_API_KEY not configured");
    }

    try {
      // Build WebSocket URL for audio processor (Recall.ai connects to this)
      const streamingUrl = `wss://amusing-charm-production.up.railway.app/recall?botId=${botId}&closerId=${args.closerId}&teamId=${args.teamId}${closerName ? `&closerName=${encodeURIComponent(closerName)}` : ""}${args.prospectName ? `&prospectName=${encodeURIComponent(args.prospectName)}` : ""}`;

      const requestBody = {
        meeting_url: args.meetingUrl,
        bot_name: botName,
        automatic_video_output: {
          in_call_recording: {
            kind: "jpeg" as const,
            b64_data: BOT_AVATAR_JPEG_B64,
          },
          in_call_not_recording: {
            kind: "jpeg" as const,
            b64_data: BOT_AVATAR_JPEG_B64,
          },
        },
        automatic_leave: {
          everyone_left_timeout: 15,    // 15 seconds — enough for WiFi reconnects, fast exit after real call ends
          noone_joined_timeout: 300,    // 5 minutes — don't waste bot if nobody joins
        },
        recording_config: {
          retention: { type: "forever" as const },
          video_mixed_layout: "gallery_view_v2",
          video_mixed_participant_video_when_screenshare: "beside",
          transcript: {
            diarization: {
              use_separate_streams_when_available: true,
            },
            provider: {
              recallai_streaming: {
                language_code: "en",
                mode: "prioritize_low_latency",
              },
            },
          },
          audio_mixed_raw: {},
          realtime_endpoints: [
            {
              type: "websocket" as const,
              url: streamingUrl,
              events: [
                "audio_mixed_raw.data",
                "transcript.data",
                "participant_events.join",
                "participant_events.leave",
              ],
            },
            {
              type: "webhook" as const,
              url: `https://ideal-ram-982.convex.site/recall-transcript-webhook?token=${process.env.RECALL_TRANSCRIPT_WEBHOOK_SECRET}`,
              events: [
                "transcript.data",
              ],
            },
          ],
        },
      };

      console.log(`[createQuickBot] Recall.ai request body: ${JSON.stringify(requestBody).substring(0, 500)}...`);

      const response = await fetch("https://us-west-2.recall.ai/api/v1/bot/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Token ${recallApiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const failureReason = `Recall.ai API error: ${response.status} ${errorText}`;
        console.error(`[createQuickBot] ${failureReason}`);

        await ctx.runMutation(internal.meetingBot.markBotFailed, {
          botId,
          failureReason,
        });
        throw new Error(failureReason);
      }

      const data = await response.json();
      console.log(`[createQuickBot] Recall.ai response: ${JSON.stringify(data)}`);
      const recallBotId = data?.id || "";

      // 4. Update the meetingBot record with the Recall.ai bot UUID
      await ctx.runMutation(internal.meetingBot.setBotRecallId, {
        botId,
        recallBotId,
      });

      console.log(`[createQuickBot] Bot created successfully: ${botId}, recallBotId: ${recallBotId}`);
      return { botId, recallBotId };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Recall.ai API error:")) {
        await ctx.scheduler.runAfter(0, internal.lib.sentry.captureFromIsolate, {
          message: error instanceof Error ? error.message : String(error),
          feature: "createQuickBot",
          integration: "recall",
          extra: { botId },
        });
        throw error;
      }

      const failureReason = error instanceof Error ? error.message : "Unknown error creating bot";
      console.error(`[createQuickBot] Failed: ${failureReason}`);

      await ctx.runMutation(internal.meetingBot.markBotFailed, {
        botId,
        failureReason,
      });
      await ctx.scheduler.runAfter(0, internal.lib.sentry.captureFromIsolate, {
        message: error instanceof Error ? error.message : String(error),
        feature: "createQuickBot",
        integration: "recall",
        extra: { botId },
      });
      throw error;
    }
  },
});

// ============================================
// MUTATIONS
// ============================================

// Update bot status from webhook events (called by Recall.ai webhook route)
export const updateBotStatus = mutation({
  args: {
    recallBotId: v.optional(v.string()),
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
    let bot = null;
    if (args.recallBotId) {
      bot = await ctx.db
        .query("meetingBots")
        .withIndex("by_recall_bot_id", (q) => q.eq("recallBotId", args.recallBotId))
        .first();
    }

    if (!bot) {
      console.error(`[updateBotStatus] Bot not found for recallBotId: ${args.recallBotId}`);
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
/**
 * Sales call, or a meeting the bot walked into?
 *
 * Answered from the calendar event the bot was scheduled against: if anyone on
 * it works outside this company, it's a sales call.
 *
 * Returns null when we genuinely can't tell — no linked event, or an event with
 * no attendees, which is common on Calendly-style booking calendars. Null means
 * "leave it alone", i.e. behave exactly as before this existed. Guessing
 * "internal" on thin evidence would silently delete real calls from a
 * customer's numbers, which is far worse than counting one standup.
 */
async function classifyBotCall(
  ctx: { db: any },
  args: {
    teamId: Id<"teams">;
    closerId: Id<"closers">;
    meetingBotId: Id<"meetingBots">;
  },
): Promise<{ classification: string; countsTowardStats: boolean } | null> {
  const bot = await ctx.db.get(args.meetingBotId);
  if (!bot?.calendarEventId) return null;

  const event = await ctx.db
    .query("calendarEvents")
    .withIndex("by_closer_and_uid", (q: any) =>
      q.eq("closerId", args.closerId).eq("uid", bot.calendarEventId),
    )
    .first();

  const attendees: Array<{ email?: string }> = event?.attendees ?? [];
  const inviteeEmails = attendees
    .map((a) => (a.email ?? "").trim())
    .filter(Boolean);

  // No attendees on the event tells us nothing either way — their booking
  // calendars routinely carry none.
  if (inviteeEmails.length === 0) return null;

  const closer = await ctx.db.get(args.closerId);

  // Everyone we know works here. Closers and managers both: a call between a
  // closer and their own manager is not a sale.
  const teamEmails = new Set<string>();
  const closers = await ctx.db
    .query("closers")
    .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
    .collect();
  for (const c of closers) {
    if (c.email) teamEmails.add(c.email.trim().toLowerCase());
    if (c.fathomEmail) teamEmails.add(c.fathomEmail.trim().toLowerCase());
  }
  const users = await ctx.db
    .query("users")
    .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
    .collect();
  for (const u of users) {
    if (u.email) teamEmails.add(u.email.trim().toLowerCase());
  }

  const verdict = classifyMeeting({
    inviteeEmails,
    ...(closer?.email ? { recorderEmail: closer.email } : {}),
    ...(closer?.name ? { recorderName: closer.name } : {}),
    teamEmails,
  });

  // "unsure" carries countsTowardStats: false, which is right — we surface it
  // for a human rather than quietly counting or quietly hiding it.
  return {
    classification: verdict.classification,
    countsTowardStats: verdict.countsTowardStats,
  };
}

/**
 * This one didn't turn out to be a call.
 *
 * The bot was removed from the room, or nobody ever arrived. Under auto-join
 * both are ordinary: removing the bot IS how a closer declines a meeting, so
 * this fires whenever someone doesn't want a standup recorded.
 *
 * Never deletes. The recording is evidence the meeting happened and wasn't for
 * us — a manager wondering why a call vanished is a worse problem than a row
 * they can see and ignore. It simply stops counting: `countsTowardStats: false`
 * plus `unclassified`, the same resting state a Fathom call gets when we can't
 * stand behind it. A human can put it back from the call itself.
 */
export const markCallNotCounted = internalMutation({
  args: {
    callId: v.id("calls"),
    reason: v.union(v.literal("bot_removed"), v.literal("nobody_joined")),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { updated: false };

    // A closer who has already told us what this call was outranks us. If they
    // filled in an outcome, they meant it, and a late webhook must not undo it.
    if (call.outcome) return { updated: false };
    if (call.classifiedBy === "closer") return { updated: false };

    await ctx.db.patch(args.callId, {
      status: "unclassified",
      countsTowardStats: false,
      classifiedAs: args.reason === "bot_removed" ? "internal" : "unsure",
      classifiedBy: "auto",
    });
    return { updated: true };
  },
});

export const createCallFromBot = mutation({
  args: {
    closerId: v.id("closers"),
    teamId: v.id("teams"),
    meetingBotId: v.id("meetingBots"),
    prospectName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Title-parser fallback: when the desktop couldn't extract a prospect
    // name (typical for Calendly-style sub-calendar events that have an
    // auto-generated "<Prospect> and <Bookee>" title but no attendees), try
    // server-side from bot.meetingTitle + the team's active closer names.
    //
    // We pass ALL team closer names (not just the logged-in closer) because
    // some teams share calendars and any closer can take any open meeting.
    // The parser uses team-closer matching to disambiguate when possible
    // and falls back to a Calendly-format heuristic for off-team bookees
    // (e.g., a business owner whose calendar the team is sharing).
    //
    // Only fires when the caller passed nothing — never overrides a real
    // name. Same patch is also written back to bot.prospectName for
    // downstream consumers that read from the bot record directly.
    let prospectName = args.prospectName?.trim() || undefined;
    if (!prospectName) {
      const bot = await ctx.db.get(args.meetingBotId);
      if (bot?.meetingTitle) {
        const teamClosers = await ctx.db
          .query("closers")
          .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
          .filter((q) => q.eq(q.field("status"), "active"))
          .collect();
        const closerNames = teamClosers
          .map((c) => c.name)
          .filter((n): n is string => typeof n === "string" && n.length > 0);
        const parsed = extractProspectFromTitle(bot.meetingTitle, {
          closerNames,
        });
        if (parsed) {
          prospectName = parsed;
          await ctx.db.patch(args.meetingBotId, { prospectName: parsed });
          console.log(
            `[createCallFromBot] Recovered prospectName "${parsed}" from meetingTitle "${bot.meetingTitle}" for bot ${args.meetingBotId}`,
          );
        }
      }
    }

    // Is this a sales call, or a team meeting the bot walked into?
    //
    // Nothing asked this before, because a bot only ever joined a call someone
    // deliberately pointed it at. Auto-join changes that: it sends a bot to
    // everything on the calendar, so standups and one-to-ones now arrive here
    // too. Left unclassified they count, and a daily standup lands in the
    // close-rate denominator for ever.
    //
    // Same rule and same code as Fathom uses — outsiders on the call mean
    // sales, nobody outside means internal. `fathomClassify` is named for
    // where it was first needed, not for what it knows.
    const verdict = await classifyBotCall(ctx, {
      teamId: args.teamId,
      closerId: args.closerId,
      meetingBotId: args.meetingBotId,
    });

    const callId = await ctx.db.insert("calls", {
      closerId: args.closerId,
      teamId: args.teamId,
      prospectName,
      status: "on_call",
      recordingType: "video",
      meetingBotId: args.meetingBotId,
      startedAt: Date.now(),
      speakerCount: 2,
      createdAt: Date.now(),
      ...(verdict
        ? {
            classifiedAs: verdict.classification,
            classifiedBy: "auto",
            countsTowardStats: verdict.countsTowardStats,
          }
        : {}),
    });

    console.log(`[createCallFromBot] Call created: ${callId} for bot: ${args.meetingBotId}`);

    // Schedule call started notification (Slack + Discord) with 2s delay
    // to let dedup check work if updateCallStatus also triggers a notification
    await ctx.scheduler.runAfter(2000, internal.slack.sendCallStartedNotification, {
      callId,
    });

    return callId;
  },
});

/**
 * One-shot backfill for the "Unknown Prospect" bug introduced by multi-cal
 * sub-calendar subscriptions. Patches existing calls whose prospectName is
 * null/undefined/"" but whose linked bot has a `meetingTitle` we can parse.
 *
 * Run via `npx convex run --prod meetingBot:backfillMissingProspectNames
 *   '{"dryRun": true}'` first to see what would change, then with
 *   `dryRun: false` to actually patch.
 *
 * Bounded: scans `calls.by_team` for each team in chunks. For Gianni's team
 * today this is ~10 affected rows. Safe to re-run; the predicate excludes
 * already-named calls so successive runs are no-ops.
 */
export const backfillMissingProspectNames = internalAction({
  args: {
    dryRun: v.boolean(),
    // Optional team scope. Default: all teams. When debugging a single
    // customer pass their teamId; production sweep leaves it null.
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args): Promise<{ scanned: number; patched: number; samples: string[] }> => {
    const result = await ctx.runMutation(
      internal.meetingBot.backfillMissingProspectNamesInternal,
      { dryRun: args.dryRun, teamId: args.teamId },
    );
    console.log(
      `[backfillMissingProspectNames] dryRun=${args.dryRun} scanned=${result.scanned} ${args.dryRun ? "would_patch" : "patched"}=${result.patched}`,
    );
    return result;
  },
});

export const backfillMissingProspectNamesInternal = internalMutation({
  args: {
    dryRun: v.boolean(),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    // Find candidate calls. Scope by team if provided; otherwise sweep the
    // index. We page over the whole index even at scale because the calls
    // main row is light (~100 bytes after the callContent split).
    const baseQuery = args.teamId
      ? ctx.db
          .query("calls")
          .withIndex("by_team", (q) => q.eq("teamId", args.teamId!))
      : ctx.db.query("calls");

    const calls = await baseQuery.collect();
    let scanned = 0;
    let patched = 0;
    const samples: string[] = [];

    // Cache team-closer-name lists per team since the backfill can span
    // many teams in one run. One query per team is plenty.
    const teamClosersCache = new Map<string, string[]>();
    const getTeamCloserNames = async (teamId: Id<"teams">): Promise<string[]> => {
      const key = teamId as unknown as string;
      const cached = teamClosersCache.get(key);
      if (cached) return cached;
      const closers = await ctx.db
        .query("closers")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect();
      const names = closers
        .map((c) => c.name)
        .filter((n): n is string => typeof n === "string" && n.length > 0);
      teamClosersCache.set(key, names);
      return names;
    };

    for (const call of calls) {
      const hasName =
        typeof call.prospectName === "string" && call.prospectName.trim() !== "";
      if (hasName) continue;
      if (!call.meetingBotId) continue;
      scanned++;

      const bot = await ctx.db.get(call.meetingBotId);
      if (!bot?.meetingTitle) continue;

      const closerNames = await getTeamCloserNames(call.teamId);
      if (closerNames.length === 0) continue;

      const parsed = extractProspectFromTitle(bot.meetingTitle, {
        closerNames,
      });
      if (!parsed) continue;

      if (samples.length < 10) {
        samples.push(
          `${call._id}: "${bot.meetingTitle}" → "${parsed}"`,
        );
      }

      patched++;
      if (args.dryRun) continue;

      await ctx.db.patch(call._id, { prospectName: parsed });
      if (
        typeof bot.prospectName !== "string" ||
        bot.prospectName.trim() === ""
      ) {
        await ctx.db.patch(bot._id, { prospectName: parsed });
      }
    }

    return { scanned, patched, samples };
  },
});

// Activate a bot from the audio processor — sets status to "active" with joinedAt.
// The WebSocket connection is the primary signal that the bot has joined the call.
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
// This immediately triggers the macOS app's post-call questionnaire flow.
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

    // Only transition if active or ended_by_user (webhook may have beaten us)
    if (bot.status !== "active" && bot.status !== "ended_by_user") {
      console.log(`[completeBotFromAudioProcessor] Bot ${args.botId} status is ${bot.status}, skipping`);
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

// Mark a call as completed when meeting bot finishes (internal only — called from webhook handler)
export const completeCallFromBot = internalMutation({
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

    // Idempotent: skip if already completed (bot.call_ended and bot.done may both call this)
    if (call.status === "completed") {
      console.log(`[completeCallFromBot] Call already completed, skipping: ${args.callId}`);
      return { success: true };
    }

    // Bug 3 fix — duration accuracy.
    // Use Recall's authoritative bot timestamps (bot.joinedAt → bot.endedAt) as the
    // canonical wall-clock duration for the call. This is what Tyler wants: timer
    // matches the bot's actual in-meeting time, not the audio processor's WebSocket
    // session time (which can drift on reconnects). Falls back to the existing
    // duration value if either bot timestamp is missing (legacy bots, dispatch
    // failed mid-flight, or non-bot calls).
    let canonicalDuration: number | undefined = args.duration;
    if (call.meetingBotId) {
      const bot = await ctx.db.get(call.meetingBotId);
      if (bot?.joinedAt && bot?.endedAt && bot.endedAt > bot.joinedAt) {
        canonicalDuration = Math.floor((bot.endedAt - bot.joinedAt) / 1000);
      }
    }

    await ctx.db.patch(args.callId, {
      status: "completed",
      endedAt: args.endedAt,
      ...(args.recordingUrl && { recordingUrl: args.recordingUrl }),
      ...(canonicalDuration && { duration: canonicalDuration }),
    });

    // Schedule AI summary generation with 60s delay to let transcript fully flush
    // Only schedule if not already generated (user may have submitted form first)
    // Blobs live on the callContent sibling post-migration.
    const content = await getContentForCallTx(ctx, args.callId);
    if (content?.transcriptText) {
      if (!content.summary) {
        await ctx.scheduler.runAfter(60000, internal.ai.generateCallSummary, {
          callId: args.callId,
          transcript: content.transcriptText,
          outcome: call.outcome || "unknown",
          prospectName: call.prospectName || "Prospect",
        });
      }
      if (!content.callAnalysis) {
        await ctx.scheduler.runAfter(65000, internal.ai.generateCallAnalysis, {
          callId: args.callId,
          transcript: content.transcriptText,
          outcome: call.outcome || "unknown",
          prospectName: call.prospectName || "Prospect",
          duration: call.duration,
        });
      }
      if (!content.summary || !content.callAnalysis) {
        console.log(`[completeCallFromBot] Scheduled AI for call ${args.callId} (summary: ${!content.summary}, analysis: ${!content.callAnalysis})`);
      } else {
        console.log(`[completeCallFromBot] AI already generated for call ${args.callId}, skipping`);
      }
    } else {
      // Transcript not ready — only schedule retry if AI hasn't already been generated
      if (!content?.summary && !content?.callAnalysis) {
        await ctx.scheduler.runAfter(60000, internal.meetingBot.retrySummaryGeneration, {
          callId: args.callId,
          attempt: 1,
        });
        console.log(`[completeCallFromBot] Transcript not ready, scheduled retry for call ${args.callId}`);
      }
    }

    // Post-completion ground-truth check against Recall's authoritative
    // participant list. Scheduled at +90s — after the +60/+65s AI scheduling
    // above so the verifier sees a stable state. If labels were wrong (pin
    // landed on the prospect, closer joined under multiple ids after
    // dropping/rejoining, etc.) the verifier relabels segments and re-runs
    // AI with the corrected transcript. For correctly labeled calls (the
    // common case) it returns "verified_no_change" with one Recall API call.
    // See apps/web/convex/speakerVerification.ts for the full algorithm.
    if (call.meetingBotId) {
      await ctx.scheduler.runAfter(
        90000,
        internal.speakerVerification.verifyClosersByRecallApi,
        { botId: call.meetingBotId },
      );

      // And put the call on the right closer.
      //
      // Auto-join books a bot from a calendar, and a calendar cannot say whose
      // call it is — shared team booking diaries mean the entry sits under one
      // name for a call somebody else is running. The transcript can say,
      // because it records who actually turned up and who did the talking.
      //
      // Slightly after the verifier, so the two aren't racing for the same
      // Recall transcript. Refuses to move anything it isn't sure about, and
      // never overrules a closer who has already answered for the call.
      await ctx.scheduler.runAfter(
        120000,
        internal.callAttribution.reattributeCall,
        { callId: args.callId },
      );
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

    // Always prefer webhook segments — they have correct speaker labels.
    // The audio processor's fullTranscript can have wrong speaker identification.
    const segments = await ctx.runQuery(internal.calls.getTranscriptSegmentsInternal, {
      callId: args.callId,
    });
    let transcript: string;
    if (segments && segments.length > 0) {
      transcript = segments
        .map((s: { speaker: string; text: string }) => `${s.speaker === "closer" ? "Closer" : "Prospect"}: ${s.text}`)
        .join("\n");
      // Save the correctly-labeled transcript to the call record
      await ctx.runMutation(internal.calls.writeTranscriptText, {
        callId: args.callId,
        transcriptText: transcript,
      });
      // Recalculate talk time from segments (audio processor's values may be wrong)
      let closerChars = 0;
      let prospectChars = 0;
      for (const s of segments) {
        if (s.speaker === "closer") closerChars += s.text.length;
        else prospectChars += s.text.length;
      }
      const closerTalkTime = Math.round(closerChars / 12.5);
      const prospectTalkTime = Math.round(prospectChars / 12.5);
      await ctx.runMutation(internal.calls.updateTalkTimeInternal, {
        callId: args.callId,
        closerTalkTime,
        prospectTalkTime,
      });
      console.log(`[retrySummaryGeneration] Assembled transcript from ${segments.length} segments for call ${args.callId}`);
    } else {
      // No segments — fall back to audio processor's transcript
      transcript = call.transcriptText || "";
    }

    if (transcript && transcript.trim().length > 50) {
      // Transcript is ready — generate summary + deep analysis
      // Only generate if not already done (user form or earlier retry may have triggered it)
      if (!call.summary) {
        try {
          await ctx.runAction(internal.ai.generateCallSummary, {
            callId: args.callId,
            transcript,
            outcome: call.outcome || "unknown",
            prospectName: call.prospectName || "Prospect",
          });
        } catch (e) {
          console.error(`[retrySummaryGeneration] Summary failed for call ${args.callId}:`, e);
        }
      }
      if (!call.callAnalysis) {
        try {
          await ctx.runAction(internal.ai.generateCallAnalysis, {
            callId: args.callId,
            transcript,
            outcome: call.outcome || "unknown",
            prospectName: call.prospectName || "Prospect",
            duration: call.duration,
          });
        } catch (e) {
          console.error(`[retrySummaryGeneration] Analysis failed for call ${args.callId}:`, e);
        }
      }
      console.log(`[retrySummaryGeneration] Generated summary + analysis for call ${args.callId} on attempt ${args.attempt}`);
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

// Internal query to get call by ID (used by retrySummaryGeneration).
// Includes callContent blob fields merged into the returned shape so
// callers can reach `.transcriptText`, `.summary`, `.callAnalysis`,
// `.ammoAnalysis` without doing a second round-trip.
export const getCallByIdInternal = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;
    const content = await getContentForCallTx(ctx, args.callId);
    return {
      ...call,
      transcriptText: content?.transcriptText,
      summary: content?.summary,
      callAnalysis: content?.callAnalysis,
      ammoAnalysis: content?.ammoAnalysis,
    };
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

    // Filter to bots where questionnaire is not completed AND that have a linked call
    // Bots without a callId can't have questionnaires filled out
    return completedBots.filter(
      (bot) => bot.questionnaireCompleted !== true && bot.callId
    );
  },
});

// Dismiss pending questionnaires for bots that have no linked call record
export const dismissOrphanedQuestionnaires = mutation({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const completedBots = await ctx.db
      .query("meetingBots")
      .withIndex("by_closer_and_status", (q) =>
        q.eq("closerId", args.closerId).eq("status", "completed")
      )
      .collect();

    let dismissed = 0;
    for (const bot of completedBots) {
      if (bot.questionnaireCompleted !== true && !bot.callId) {
        await ctx.db.patch(bot._id, { questionnaireCompleted: true });
        dismissed++;
      }
    }
    return { dismissed };
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

// Get a bot's existing linked callId (used by audio processor for reconnection)
// If the bot already has a call record, returns it so the audio processor can
// resume the existing call instead of creating a duplicate.
//
// Resume policy (architectural fix for Bug 2 — call fragmentation):
//   1. Bot itself is still active in Recall → ALWAYS return the existing callId,
//      regardless of how stale call.status looks. The bot is the source of truth;
//      a transient WebSocket close should never split the recording.
//   2. Bot is terminal (completed/failed/etc.) — fall through to the legacy
//      auto-completed dedup window, now widened from 2 → 30 minutes for safety.
//
// Recall's bot.call_ended / bot.done webhooks are the only authority on
// terminal call.status now (see saveCallArtifactsFromAudioProcessor); this query
// just exposes the bot's truth to the audio processor on reconnect.
const BOT_ACTIVE_STATUSES = new Set([
  "scheduled",
  "joining",
  "active",
  "ended_by_user",
  "in_waiting_room",
]);
const AUTO_COMPLETE_DEDUP_WINDOW_MS = 30 * 60 * 1000; // 30 min — widened from 2 min

export const getBotCallId = query({
  args: { botId: v.string() },
  handler: async (ctx, args) => {
    const botDocId = ctx.db.normalizeId("meetingBots", args.botId);
    if (!botDocId) return null;

    const bot = await ctx.db.get(botDocId);
    if (!bot || !bot.callId) return null;

    const call = await ctx.db.get(bot.callId);
    if (!call) return null;

    // Bot is still in the meeting per Recall — always resume into this call.
    // This is the primary fix for fragmentation: even if call.status="completed"
    // got set by some race, the bot says it's still recording, so any new
    // WebSocket connection MUST resume into the existing call record.
    if (BOT_ACTIVE_STATUSES.has(bot.status)) {
      return { callId: bot.callId.toString(), botActive: true };
    }

    // Bot ended cleanly but call hasn't transitioned yet — still resume.
    if (call.status !== "completed") {
      return { callId: bot.callId.toString() };
    }

    // Bot is terminal AND call is completed. Belt-and-suspenders dedup window
    // for tail-end race conditions (bot.call_ended just fired as audio processor
    // was reconnecting).
    const dedupCutoff = Date.now() - AUTO_COMPLETE_DEDUP_WINDOW_MS;
    const wasAutoCompleted =
      (call as { wasAutoCompleted?: boolean }).wasAutoCompleted === true ||
      call.notes?.includes("[Auto-completed: new call started]");
    if (wasAutoCompleted && call.endedAt && call.endedAt > dedupCutoff) {
      return { callId: bot.callId.toString(), wasAutoCompleted: true };
    }

    return null;
  },
});

// Get bots by callId (internal, used by refreshRecordingUrl)
export const getBotsByCallId = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("meetingBots")
      .filter((q) => q.eq(q.field("callId"), args.callId))
      .collect();
  },
});

// Update bot recording URL (internal, used by refreshRecordingUrl)
export const updateBotRecordingUrl = internalMutation({
  args: { recallBotId: v.string(), recordingUrl: v.string() },
  handler: async (ctx, args) => {
    const bot = await ctx.db
      .query("meetingBots")
      .withIndex("by_recall_bot_id", (q) => q.eq("recallBotId", args.recallBotId))
      .first();
    if (bot) {
      await ctx.db.patch(bot._id, { recordingUrl: args.recordingUrl });
    }
  },
});

// Get a bot by its Recall.ai bot UUID (used by Recall webhook route)
export const getBotByRecallId = query({
  args: { recallBotId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("meetingBots")
      .withIndex("by_recall_bot_id", (q) => q.eq("recallBotId", args.recallBotId))
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

// Meeting bot is enabled for all teams (launched v2.0.0)
export const isMeetingBotEnabled = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return false;
    return true;
  },
});

// ============================================
// AUTO-SCHEDULE BOTS (Cron Job Support)
// ============================================

/**
 * Closers whose calendars we may send a bot to.
 *
 * Two things were wrong here, and together they are why auto-join has done
 * nothing since February.
 *
 * TIER: this took EVERY team, under a comment saying "meeting bot is enabled
 * for everyone". That was true before the three tiers existed and has been
 * false since July — the bot is Overwatch only. Left alone, switching the cron
 * back on would put our bot into Fathom customers' calls, recording alongside
 * a recorder they already pay for.
 *
 * CALENDAR: it required `icsUrl`, the legacy feed field. Google Calendar OAuth
 * landed two weeks after this was disabled and is now how closers connect —
 * 17 of them, none of whom this could see. Any connected calendar counts.
 */
export const getClosersWithCalendars = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Loudly, if we ever outgrow this — the same cap and the same reasoning as
    // listOverviewTeams. A silent truncation means a customer's calls quietly
    // stop being recorded with nothing to notice.
    const CAP = 500;
    const allTeams = await ctx.db.query("teams").take(CAP);
    if (allTeams.length === CAP) {
      console.error(
        `[autoSchedule] hit the ${CAP}-team cap — some teams are being ` +
          `skipped. This needs an index on productTier.`,
      );
    }

    // A pinned tier wins over the billed one, exactly as it does everywhere
    // else: comped and internal accounts rely on the override.
    const botTeams = allTeams.filter(
      (t) => (t.productTierOverride ?? t.productTier) === "overwatch",
    );

    if (botTeams.length === 0) return [];

    const results: Array<{
      closerId: Id<"closers">;
      teamId: Id<"teams">;
      meetingPlatform?: string;
      email: string;
    }> = [];

    for (const team of botTeams) {
      const closers = await ctx.db
        .query("closers")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect();

      for (const closer of closers) {
        // Any calendar, however it was connected. Checking one mechanism is
        // what broke this.
        const hasCalendar =
          !!closer.icsUrl ||
          !!closer.googleCalendarRefreshToken ||
          !!closer.microsoftCalendarRefreshToken;

        if (!hasCalendar) continue;

        results.push({
          closerId: closer._id,
          teamId: team._id,
          meetingPlatform: closer.meetingPlatform,
          // Needed to work out who owns a meeting that several closers can
          // see. Their calendars are labelled by address.
          email: closer.email,
        });
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
/**
 * Bots booked for meetings that no longer exist, or have moved.
 *
 * Only a problem once bots are scheduled automatically. Someone clicking
 * "Join & Record" is present at the meeting by definition; a bot booked from a
 * calendar a day ahead can outlive the meeting that justified it — and then it
 * turns up in an empty room, records nothing, and bills for the privilege.
 *
 * Deliberately narrow: only bots this sweep created (`source: "calendar"`) and
 * only ones still waiting to join. A bot already in a call is somebody's live
 * meeting and none of our business.
 */
export const findOrphanedScheduledBots = internalQuery({
  args: {},
  handler: async (
    ctx,
  ): Promise<Array<{ botId: Id<"meetingBots">; reason: string; title?: string }>> => {
    const now = Date.now();
    const orphans: Array<{ botId: Id<"meetingBots">; reason: string; title?: string }> = [];

    const scheduled = await ctx.db
      .query("meetingBots")
      .filter((q) => q.eq(q.field("status"), "scheduled"))
      .take(1000);

    // A team's tier can change between a bot being booked and the meeting
    // happening. Bots booked yesterday must not turn up for a team that is no
    // longer paying for them — and would be recording alongside Fathom if they
    // moved to Oversight.
    const tierCache = new Map<string, boolean>();
    const stillEntitled = async (teamId: Id<"teams">): Promise<boolean> => {
      const key = String(teamId);
      const cached = tierCache.get(key);
      if (cached !== undefined) return cached;
      const team = await ctx.db.get(teamId);
      const ok =
        (team?.productTierOverride ?? team?.productTier) === "overwatch";
      tierCache.set(key, ok);
      return ok;
    };

    for (const bot of scheduled) {
      if (bot.source !== "calendar") continue;
      if (!bot.calendarEventId) continue;

      if (!(await stillEntitled(bot.teamId))) {
        orphans.push({
          botId: bot._id,
          reason: "team no longer on a plan that includes the bot",
          ...(bot.meetingTitle ? { title: bot.meetingTitle } : {}),
        });
        continue;
      }

      const event = await ctx.db
        .query("calendarEvents")
        .withIndex("by_closer_and_uid", (q) =>
          q.eq("closerId", bot.closerId).eq("uid", bot.calendarEventId!),
        )
        .first();

      if (!event) {
        orphans.push({
          botId: bot._id,
          reason: "meeting no longer on the calendar",
          ...(bot.meetingTitle ? { title: bot.meetingTitle } : {}),
        });
        continue;
      }

      // Google keeps cancelled events visible with a "Canceled:" prefix rather
      // than removing them, so the row still being there proves nothing.
      if (/^cancell?ed:/i.test(event.title ?? "")) {
        orphans.push({
          botId: bot._id,
          reason: "meeting cancelled",
          ...(bot.meetingTitle ? { title: bot.meetingTitle } : {}),
        });
        continue;
      }

      // Moved. The bot is booked against a time that is no longer the meeting;
      // cancelling frees the sweep to schedule a fresh one for the new slot.
      if (
        typeof bot.scheduledAt === "number" &&
        Math.abs(event.startTime - bot.scheduledAt) > 5 * 60 * 1000
      ) {
        orphans.push({
          botId: bot._id,
          reason: "meeting moved",
          ...(bot.meetingTitle ? { title: bot.meetingTitle } : {}),
        });
        continue;
      }

      // Long past its start and still never joined — Recall isn't coming.
      if (typeof bot.scheduledAt === "number" && now - bot.scheduledAt > 6 * 60 * 60 * 1000) {
        orphans.push({
          botId: bot._id,
          reason: "never joined, well past start",
          ...(bot.meetingTitle ? { title: bot.meetingTitle } : {}),
        });
      }
    }

    return orphans;
  },
});

/**
 * Whose meeting is this, when several closers can see it?
 *
 * Only matters for attribution — exactly one bot goes either way, and that is
 * the part that had to be fixed.
 *
 * ATTRIBUTION HERE IS PROVISIONAL, ON PURPOSE. I tried to derive the owner
 * from the calendar and the calendar cannot answer it. Two rules were tested
 * against real data and both were wrong more often than right:
 *
 *  - "whoever has it on their own Primary calendar" — being INVITED to a
 *    meeting also puts it in your diary, so Primary means "this is in my
 *    diary", never "this is mine".
 *  - "the subscription label names the owner" — it names a CALENDAR. That team
 *    books every closer's calls onto shared calendars named after one person
 *    (`nick@`, `nick2@`), so the label says Nick for calls that are Gianni's.
 *    One meeting titled for Gianni sat on Nick's Primary and carried Nick's
 *    label. Both signals point at the wrong human.
 *
 * Matching the closer's name in the meeting title WOULD work for that
 * customer — their titles are "Prospect and Closer" — and would silently stop
 * working for anyone whose booking tool words things differently. Not worth
 * building on.
 *
 * So: pick deterministically, and let the truth arrive later. Who actually
 * took the call is knowable after it happens, from Recall's participant list —
 * the same source `speakerVerification` already uses to pin the closer. Until
 * that runs, a human can correct it on the call itself.
 *
 * Preferring someone who holds the meeting in their own diary is a weak signal
 * but not a harmful one: they were at least invited.
 */
function pickMeetingOwner<
  T extends { closerEmail: string; calendarLabel?: string },
>(candidates: T[]): T {
  const primary = candidates.find(
    (c) => (c.calendarLabel ?? "").trim().toLowerCase() === "primary",
  );
  return primary ?? candidates[0];
}

/**
 * Send a bot to every upcoming meeting on an Overwatch closer's calendar.
 *
 * internalAction, not action. This spends money — every bot it schedules is
 * billed — and it was previously callable by anyone holding the deployment URL.
 *
 * `dryRun` reports what it WOULD schedule without scheduling anything. The
 * failure mode of this job is a bot appearing uninvited in a paying customer's
 * sales call, so the scoping gets proven against real data before the cron is
 * ever switched on.
 */
export const autoScheduleBotsForAllClosers = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    scheduled: number;
    cancelled: number;
    dryRun: boolean;
    wouldSchedule: Array<{ team: string; closer: string; title: string; startsAt: string }>;
  }> => {
    // 1. Get all closers with connected calendars on bot-enabled teams
    const closers = await ctx.runQuery(internal.meetingBot.getClosersWithCalendars);

    const dryRun = args.dryRun === true;
    const wouldSchedule: Array<{
      team: string;
      closer: string;
      title: string;
      startsAt: string;
    }> = [];

    if (closers.length === 0) {
      console.log("[autoSchedule] No closers with calendars on bot-enabled teams");
      return { scheduled: 0, cancelled: 0, dryRun, wouldSchedule };
    }

    let totalScheduled = 0;

    // ------------------------------------------------------------------
    // Pass 1 — collect every candidate, keyed by the meeting itself.
    //
    // The duplicate guard used to be per closer, which is wrong: a team where
    // everyone subscribes to everyone's calendar sees the SAME meeting on
    // several calendars, and each would get its own bot. Measured on the one
    // Overwatch customer: 43 bots for 13 real meetings — two or three
    // notetakers walking into the same Zoom call, billed three times.
    //
    // The meeting is the unit, not the closer.
    // ------------------------------------------------------------------
    type Candidate = {
      closerId: Id<"closers">;
      teamId: Id<"teams">;
      closerEmail: string;
      title: string;
      startTime: number;
      meetingUrl: string;
      uid: string;
      calendarLabel?: string;
      alreadyHasBot: boolean;
    };

    const byMeeting = new Map<string, Candidate[]>();

    for (const closer of closers) {
      try {
        const events = await ctx.runQuery(internal.meetingBot.getUpcomingCalendarEvents, {
          closerId: closer.closerId,
        });
        if (events.length === 0) continue;

        const excludedEventIds = await ctx.runQuery(internal.meetingBot.getExcludedEventIds, {
          closerId: closer.closerId,
        });

        const eligibleEvents = events.filter(
          (event: { uid: string; title?: string; isAllDay?: boolean }) => {
            if (excludedEventIds.includes(event.uid)) return false;

            // Google leaves cancelled meetings on the calendar with a
            // "Canceled:" prefix rather than removing them. Seen in the dry
            // run: a bot would have been sent to "Canceled: Mario Aguirre and
            // Nick Rowe". The orphan sweep catches these afterwards, which is
            // no use — by then we've already booked it.
            if (/^cancell?ed:/i.test(event.title ?? "")) return false;

            // An all-day entry with a link is a placeholder, not a meeting at
            // a time. Sending a bot to one means a bot at midnight.
            if (event.isAllDay === true) return false;

            return true;
          },
        );
        if (eligibleEvents.length === 0) continue;

        const existingBotEventIds = await ctx.runQuery(internal.meetingBot.getExistingBotsForEvents, {
          closerId: closer.closerId,
          eventIds: eligibleEvents.map((e: { uid: string }) => e.uid),
        });

        for (const event of eligibleEvents) {
          if (!event.meetingUrl) continue;
          // Keyed by team as well as uid: two teams could in principle carry
          // the same calendar id, and one team's bot must never satisfy
          // another team's meeting.
          const key = `${closer.teamId}|${event.uid}`;
          const list = byMeeting.get(key) ?? [];
          list.push({
            closerId: closer.closerId,
            teamId: closer.teamId,
            closerEmail: closer.email,
            title: event.title,
            startTime: event.startTime,
            meetingUrl: event.meetingUrl,
            uid: event.uid,
            calendarLabel: event.calendarLabel,
            alreadyHasBot: existingBotEventIds.includes(event.uid),
          });
          byMeeting.set(key, list);
        }
      } catch (error) {
        console.error(`[autoSchedule] Error processing closer ${closer.closerId}:`, error);
      }
    }

    // ------------------------------------------------------------------
    // Pass 2 — one bot each, for whoever the meeting actually belongs to.
    // ------------------------------------------------------------------
    for (const [key, candidates] of byMeeting) {
      // Somebody's bot already covers this meeting.
      if (candidates.some((c) => c.alreadyHasBot)) continue;

      const owner = pickMeetingOwner(candidates);

      if (dryRun) {
        wouldSchedule.push({
          team: String(owner.teamId),
          closer: String(owner.closerId),
          title: owner.title,
          startsAt: new Date(owner.startTime).toISOString(),
        });
        continue;
      }

      try {
        await ctx.runAction(api.meetingBot.createBot, {
          meetingUrl: owner.meetingUrl,
          closerId: owner.closerId,
          teamId: owner.teamId,
          meetingTitle: owner.title,
          prospectName: owner.title,
          calendarEventId: owner.uid,
          scheduledAt: owner.startTime,
        });

        totalScheduled++;
        console.log(
          `[autoSchedule] Scheduled bot for ${owner.closerId}: "${owner.title}" ` +
            `at ${new Date(owner.startTime).toISOString()}` +
            (candidates.length > 1
              ? ` (visible to ${candidates.length} closers, one bot sent)`
              : ""),
        );
      } catch (error) {
        console.error(`[autoSchedule] Failed to schedule bot for meeting ${key}:`, error);
      }
    }

    // ------------------------------------------------------------------
    // Pass 3 — call off bots whose meeting has gone.
    //
    // Same sweep because it's the same failure: a bot nobody is expecting.
    // Scheduling one for a meeting that no longer exists costs money and puts
    // a notetaker in an empty room.
    // ------------------------------------------------------------------
    const orphans = await ctx.runQuery(internal.meetingBot.findOrphanedScheduledBots, {});
    let cancelled = 0;
    for (const orphan of orphans) {
      if (dryRun) {
        console.log(
          `[autoSchedule] DRY RUN — would cancel "${orphan.title ?? orphan.botId}" (${orphan.reason})`,
        );
        continue;
      }
      try {
        await ctx.runAction(api.meetingBot.cancelBot, { botId: orphan.botId });
        cancelled++;
        console.log(
          `[autoSchedule] Cancelled bot for "${orphan.title ?? orphan.botId}" — ${orphan.reason}`,
        );
      } catch (error) {
        console.error(`[autoSchedule] Failed to cancel bot ${orphan.botId}:`, error);
      }
    }

    console.log(
      dryRun
        ? `[autoSchedule] DRY RUN — would schedule ${wouldSchedule.length} bot(s), ` +
            `cancel ${orphans.length}`
        : `[autoSchedule] Scheduled ${totalScheduled}, cancelled ${cancelled}`,
    );
    return { scheduled: totalScheduled, cancelled, dryRun, wouldSchedule };
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

    // Skip onboarding if already completed OR if calendar is already connected
    if (closer.calendarOnboardingCompleted === true) return false;
    if (closer.icsUrl) return false;
    if (closer.googleCalendarRefreshToken) return false;

    return true;
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
      botId: bot.recallBotId,
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

    // Over-fetch to account for filtered-out in-progress calls
    const allCalls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .order("desc")
      .take(maxResults + 10);

    // Only show finished calls — exclude active/waiting/scheduled calls
    // that have no recording, summary, or transcript yet.
    //
    // "unclassified" is a finished Fathom call we aren't sure was a sales
    // call. It is shown but deliberately left out of every stats query, which
    // narrows to "completed". Hiding it instead would mean nobody could ever
    // confirm it, and a closer would just see a call go missing.
    const calls = allCalls
      .filter(
        (c) =>
          c.status === "completed" ||
          c.status === "no_show" ||
          c.status === "unclassified",
      )
      .slice(0, maxResults);

    // Pull blob fields from callContent siblings — one row each.
    const callsWithContent = await Promise.all(
      calls.map(async (call) => ({
        call,
        content: await getContentForCallTx(ctx, call._id),
      })),
    );

    return callsWithContent.map(({ call, content }) => ({
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
      summary: content?.summary,
      // Only send a short preview — full transcript fetched on demand via getTranscriptSegments
      transcriptText: content?.transcriptText
        ? content.transcriptText.slice(0, 500) + (content.transcriptText.length > 500 ? "..." : "")
        : undefined,
      flaggedForReview: call.flaggedForReview,
      reviewStatus: call.reviewStatus,
      commentCount: call.commentCount,
      callAnalysis: content?.callAnalysis,
      // Where it came from, and whether we're confident it was a sales call.
      // Additive — the bot's own calls have none of these set, and every
      // existing reader ignores fields it doesn't know about.
      source: call.source,
      externalShareUrl: call.externalShareUrl,
      classifiedAs: call.classifiedAs,
      classifiedBy: call.classifiedBy,
      countsTowardStats: call.countsTowardStats,
      isHistorical: call.isHistorical,
    }));
  },
});

// Get closer dashboard stats (personal stats + team comparison)
export const getCloserDashboardStats = query({
  args: {
    closerId: v.id("closers"),
    period: v.string(), // "today" | "week" | "month" | "last30" | "custom"
    customStart: v.optional(v.number()),
    customEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return {};

    const now = Date.now();
    let periodStart: number;
    let periodEnd: number = now;

    if (args.period === "custom" && args.customStart != null && args.customEnd != null) {
      periodStart = args.customStart;
      periodEnd = args.customEnd;
    } else if (args.period === "today") {
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

    // Calculate previous period start for trend comparison
    // For custom ranges, previous period = same duration immediately before start
    let prevPeriodStart: number;
    if (args.period === "custom" && args.customStart != null && args.customEnd != null) {
      const duration = args.customEnd - args.customStart;
      prevPeriodStart = args.customStart - duration;
    } else if (args.period === "today") {
      prevPeriodStart = periodStart - 24 * 60 * 60 * 1000;
    } else if (args.period === "month") {
      const prevMonth = new Date(periodStart);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      prevPeriodStart = prevMonth.getTime();
    } else if (args.period === "last30") {
      prevPeriodStart = periodStart - 30 * 24 * 60 * 60 * 1000;
    } else {
      prevPeriodStart = periodStart - 7 * 24 * 60 * 60 * 1000;
    }

    // Get this closer's ALL calls (for both current and previous period)
    const allCloserCalls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .filter((q) => q.gte(q.field("startedAt"), prevPeriodStart))
      .collect();

    const myCalls = allCloserCalls.filter((c) => (c.startedAt || 0) >= periodStart && (c.startedAt || 0) <= periodEnd);
    const prevCalls = allCloserCalls.filter((c) => (c.startedAt || 0) >= prevPeriodStart && (c.startedAt || 0) < periodStart);

    const myCompleted = myCalls.filter((c) => c.status === "completed" || c.endedAt);
    const myClosed = myCompleted.filter((c) => c.outcome === "closed" || c.outcome === "closed_won");
    const myCloseRate = myCompleted.length > 0 ? (myClosed.length / myCompleted.length) * 100 : 0;
    const myCash = myCompleted.reduce((sum, c) => sum + (c.cashCollected || 0), 0);

    // Previous period stats for trends
    const prevCompleted = prevCalls.filter((c) => c.status === "completed" || c.endedAt);
    const prevClosed = prevCompleted.filter((c) => c.outcome === "closed" || c.outcome === "closed_won");
    const prevCash = prevCompleted.reduce((sum, c) => sum + (c.cashCollected || 0), 0);
    const prevContractValue = prevClosed.reduce((sum, c) => sum + (c.contractValue || 0), 0);
    const prevNonNoShow = prevCompleted.filter((c) => c.outcome !== "no_show");

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

    // Revenue Per Call / Revenue Per Sit
    const myNonNoShow = myCompleted.filter((c) => c.outcome !== "no_show");
    const revenuePerCallCash = myCompleted.length > 0 ? Math.round(myCash / myCompleted.length) : 0;
    const revenuePerCallContract = myCompleted.length > 0 ? Math.round(totalContractValue / myCompleted.length) : 0;
    const revenuePerSitCash = myNonNoShow.length > 0 ? Math.round(myCash / myNonNoShow.length) : 0;
    const revenuePerSitContract = myNonNoShow.length > 0 ? Math.round(totalContractValue / myNonNoShow.length) : 0;

    // Previous period revenue per call/sit for trends
    const prevRevenuePerCallCash = prevCompleted.length > 0 ? Math.round(prevCash / prevCompleted.length) : 0;
    const prevRevenuePerSitCash = prevNonNoShow.length > 0 ? Math.round(prevCash / prevNonNoShow.length) : 0;

    // Trend: percentage change (positive = improvement)
    const revenuePerCallTrend = prevRevenuePerCallCash > 0
      ? Math.round(((revenuePerCallCash - prevRevenuePerCallCash) / prevRevenuePerCallCash) * 100)
      : null;
    const revenuePerSitTrend = prevRevenuePerSitCash > 0
      ? Math.round(((revenuePerSitCash - prevRevenuePerSitCash) / prevRevenuePerSitCash) * 100)
      : null;

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
    let teamTotalNonNoShow = 0;

    for (const tc of teamClosers) {
      const tcCalls = await ctx.db
        .query("calls")
        .withIndex("by_closer", (q) => q.eq("closerId", tc._id))
        .filter((q) => q.gte(q.field("startedAt"), periodStart))
        .collect();
      const tcCompleted = tcCalls.filter((c) => c.status === "completed" || c.endedAt);
      const tcClosed = tcCompleted.filter((c) => c.outcome === "closed" || c.outcome === "closed_won");
      const tcNonNoShow = tcCompleted.filter((c) => c.outcome !== "no_show");
      teamTotalCalls += tcCalls.length;
      teamTotalCompleted += tcCompleted.length;
      teamTotalClosed += tcClosed.length;
      teamTotalNonNoShow += tcNonNoShow.length;
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

    // Team revenue per call/sit averages
    const teamAvgRevenuePerCallCash = teamTotalCompleted > 0 ? Math.round(teamTotalCash / teamTotalCompleted) : 0;
    const teamAvgRevenuePerCallContract = teamTotalCompleted > 0 ? Math.round(teamTotalContractValue / teamTotalCompleted) : 0;
    const teamAvgRevenuePerSitCash = teamTotalNonNoShow > 0 ? Math.round(teamTotalCash / teamTotalNonNoShow) : 0;
    const teamAvgRevenuePerSitContract = teamTotalNonNoShow > 0 ? Math.round(teamTotalContractValue / teamTotalNonNoShow) : 0;

    return {
      callsThisPeriod: myCalls.length,
      closeRate: Math.round(myCloseRate * 10) / 10,
      cashCollected: myCash,
      avgCallDuration: Math.round(avgCallDuration),
      avgTalkRatio: Math.round(avgTalkRatio * 10) / 10,
      totalContractValue: Math.round(totalContractValue),
      revenuePerCallCash,
      revenuePerCallContract,
      revenuePerSitCash,
      revenuePerSitContract,
      revenuePerCallTrend,
      revenuePerSitTrend,
      teamAvgCloseRate: Math.round(teamAvgCloseRate * 10) / 10,
      teamAvgCash: Math.round(teamAvgCash),
      teamAvgCalls: Math.round(teamAvgCalls * 10) / 10,
      teamAvgDuration: Math.round(teamAvgDuration),
      teamAvgTalkRatio: Math.round(teamAvgTalkRatio * 10) / 10,
      teamAvgContractValue: Math.round(teamAvgContractValue),
      teamAvgRevenuePerCallCash,
      teamAvgRevenuePerCallContract,
      teamAvgRevenuePerSitCash,
      teamAvgRevenuePerSitContract,
      teamSize: teamClosers.length,
    };
  },
});
