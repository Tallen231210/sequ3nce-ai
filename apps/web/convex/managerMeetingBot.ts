import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MANAGER_BOT_AVATAR_JPEG_B64 } from "./managerBotAvatar";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Send the MGMT bot to a manager's meeting.
//
// Much smaller than the closer equivalent because the hard parts don't apply:
// no attribution (the meeting belongs to whoever's calendar it is) and no
// cross-participant dedup (one manager per calendar). What remains is the
// three things the closer bot got wrong, kept deliberately.
// ============================================================================

const RECALL_BASE = "https://us-west-2.recall.ai/api/v1";

export const getEvent = internalQuery({
  args: { calendarEventId: v.id("managerCalendarEvents") },
  handler: async (ctx, args) => await ctx.db.get(args.calendarEventId),
});

export const getBotForEvent = internalQuery({
  args: { calendarEventId: v.id("managerCalendarEvents") },
  handler: async (ctx, args) =>
    await ctx.db
      .query("managerMeetingBots")
      .withIndex("by_calendar_event", (q) =>
        q.eq("calendarEventId", args.calendarEventId),
      )
      .first(),
});

export const getBotByRecallId = internalQuery({
  args: { recallBotId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("managerMeetingBots")
      .withIndex("by_recall_bot_id", (q) => q.eq("recallBotId", args.recallBotId))
      .first(),
});

export const getTeamBotName = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    return team?.managerMeetingBotName ?? "Sequ3nce MGMT";
  },
});

/** How many bots one manager may have in a day. A runaway detector, not a
 *  budget — a manager with more than this many meetings has a bigger problem. */
export const countBotsToday = internalQuery({
  args: { userId: v.id("users"), since: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("managerMeetingBots")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return rows.filter((r) => r.createdAt >= args.since).length;
  },
});

export const recordBot = internalMutation({
  args: {
    userId: v.id("users"),
    teamId: v.id("teams"),
    calendarEventId: v.id("managerCalendarEvents"),
    recallBotId: v.string(),
    meetingUrl: v.string(),
    meetingTitle: v.string(),
    scheduledStartTime: v.number(),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("managerMeetingBots", {
      ...args,
      status: "scheduled",
      createdAt: Date.now(),
    }),
});

export const markCancelled = internalMutation({
  args: { botId: v.id("managerMeetingBots"), reason: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.botId, {
      status: "cancelled",
      failureReason: args.reason,
      endedAt: Date.now(),
    });
  },
});

export const createManagerBot = internalAction({
  args: { calendarEventId: v.id("managerCalendarEvents") },
  handler: async (
    ctx,
    args,
  ): Promise<{ botId?: string; skipped?: string }> => {
    const ev = await ctx.runQuery(internal.managerMeetingBot.getEvent, {
      calendarEventId: args.calendarEventId,
    });
    if (!ev) return { skipped: "event no longer exists" };
    if (ev.excluded === true) return { skipped: "manager excluded this meeting" };
    if (!ev.meetingUrl) return { skipped: "no video link on the event" };

    // Dedup on the calendar EVENT, never the meeting URL. RemoteStack ran 14
    // different meetings through one personal Zoom room, and URL-keyed dedup
    // skipped 13 of them as duplicates. A manager's own recurring room has
    // exactly the same shape.
    const existing = await ctx.runQuery(internal.managerMeetingBot.getBotForEvent, {
      calendarEventId: args.calendarEventId,
    });
    if (existing) return { skipped: "already has a bot" };

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const todayCount = await ctx.runQuery(internal.managerMeetingBot.countBotsToday, {
      userId: ev.userId,
      since: dayAgo,
    });
    const DAILY_CAP = 20;
    if (todayCount >= DAILY_CAP) {
      // Loudly, because silence here means a runaway costs money unnoticed.
      console.error(
        `[managerBot] DAILY CAP HIT for manager ${ev.userId}: ` +
          `${todayCount} bots in 24h, refusing more`,
      );
      return { skipped: `daily cap of ${DAILY_CAP} reached` };
    }

    const botName = await ctx.runQuery(internal.managerMeetingBot.getTeamBotName, {
      teamId: ev.teamId as Id<"teams">,
    });

    const res = await fetch(`${RECALL_BASE}/bot/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.RECALL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        meeting_url: ev.meetingUrl,
        bot_name: botName,
        // Without join_at the bot dispatches immediately and sits in an empty
        // room until it times out. This is almost certainly why the closer
        // auto-join was disabled for eight months.
        join_at: new Date(ev.startTime).toISOString(),
        automatic_video_output: {
          in_call_recording: {
            kind: "jpeg" as const,
            b64_data: MANAGER_BOT_AVATAR_JPEG_B64,
          },
          in_call_not_recording: {
            kind: "jpeg" as const,
            b64_data: MANAGER_BOT_AVATAR_JPEG_B64,
          },
        },
        automatic_leave: {
          everyone_left_timeout: 15,
          // Ten minutes for a scheduled bot. A manager running late to their
          // own one-to-one shouldn't lose the recording.
          noone_joined_timeout: 600,
        },
        // Without this Recall records video and produces NO transcript at all
        // — the transcript shortcut comes back null and there is nothing to
        // fetch. Found by testing rather than review: the bot recorded
        // perfectly and the transcript was simply never generated.
        recording_config: {
          retention: { type: "forever" as const },
          video_mixed_layout: "gallery_view_v2",
          transcript: {
            diarization: {
              // Who said what. For a one-to-one that's the whole point —
              // "the manager said" and "the rep said" are different facts.
              use_separate_streams_when_available: true,
            },
            provider: {
              recallai_streaming: {
                language_code: "en",
                mode: "prioritize_low_latency",
              },
            },
          },
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`Recall rejected the bot: ${res.status} ${await res.text()}`);
    }
    const bot = await res.json();

    await ctx.runMutation(internal.managerMeetingBot.recordBot, {
      userId: ev.userId,
      teamId: ev.teamId as Id<"teams">,
      calendarEventId: args.calendarEventId,
      recallBotId: bot.id,
      meetingUrl: ev.meetingUrl,
      meetingTitle: ev.title,
      scheduledStartTime: ev.startTime,
    });
    return { botId: bot.id };
  },
});

/**
 * Pull a bot back when its meeting moves or disappears.
 *
 * Recall is told as well as our own record, or the bot still turns up to a
 * meeting nobody is holding.
 */
export const cancelManagerBot = internalAction({
  args: { botId: v.id("managerMeetingBots"), recallBotId: v.string(), reason: v.string() },
  handler: async (ctx, args): Promise<{ cancelled: boolean }> => {
    try {
      await fetch(`${RECALL_BASE}/bot/${args.recallBotId}/`, {
        method: "DELETE",
        headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
      });
    } catch (err) {
      // Recall may already have retired it. Our record still has to be right.
      console.warn(`[managerBot] Recall delete failed for ${args.recallBotId}:`, err);
    }
    await ctx.runMutation(internal.managerMeetingBot.markCancelled, {
      botId: args.botId,
      reason: args.reason,
    });
    return { cancelled: true };
  },
});
