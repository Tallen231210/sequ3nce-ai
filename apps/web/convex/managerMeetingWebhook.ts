import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// What happens to a manager's bot as its meeting runs.
//
// Kept out of http.ts deliberately — that file is already enormous and every
// closer bot event flows through it. Manager handling lives here so the two
// can't be confused, and so this file can be read on its own.
// ============================================================================

/**
 * Reasons a bot produced no recording, and none of them is an error.
 *
 * Three of E2's calls last week ended exactly this way — the bot waited
 * twenty minutes in a Google Meet lobby and left. Our records said
 * "completed" with no reason attached, which reads as "the meeting happened
 * and produced nothing" rather than "nobody let the bot in".
 */
const NOT_A_RECORDING: Record<string, string> = {
  bot_kicked_from_call: "removed from the meeting",
  bot_kicked_from_waiting_room: "not admitted",
  timeout_exceeded_waiting_room: "waited to be admitted, nobody let it in",
  timeout_exceeded_noone_joined: "nobody joined the meeting",
};

export const applyEvent = internalMutation({
  args: {
    recallBotId: v.string(),
    event: v.string(),
    subCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const bot = await ctx.db
      .query("managerMeetingBots")
      .withIndex("by_recall_bot_id", (q) => q.eq("recallBotId", args.recallBotId))
      .first();
    if (!bot) return { handled: false, reason: "no such manager bot" };

    const now = Date.now();

    switch (args.event) {
      case "bot.joining_call": {
        await ctx.db.patch(bot._id, { status: "joining" });
        return { handled: true, status: "joining" };
      }

      case "bot.in_waiting_room": {
        // Not a state of its own — the bot is still trying. Recorded only so
        // the reason is available if it later times out there.
        return { handled: true, status: "waiting" };
      }

      case "bot.in_call_recording":
      case "bot.in_call_not_recording": {
        if (bot.meetingId) {
          await ctx.db.patch(bot._id, { status: "active", joinedAt: bot.joinedAt ?? now });
          return { handled: true, status: "active" };
        }
        // The meeting record is created on first join rather than at schedule
        // time, so a bot that never gets in leaves no meeting behind — an
        // empty row in the recordings list is worse than an absence.
        const meetingId = await ctx.db.insert("managerMeetings", {
          userId: bot.userId,
          teamId: bot.teamId,
          calendarEventId: bot.calendarEventId,
          title: bot.meetingTitle,
          meetingUrl: bot.meetingUrl,
          startedAt: now,
          status: "recording",
          createdAt: now,
        });
        await ctx.db.patch(bot._id, {
          status: "active",
          joinedAt: now,
          meetingId,
        });
        return { handled: true, status: "active", meetingId };
      }

      case "bot.call_ended": {
        const reason = args.subCode ? NOT_A_RECORDING[args.subCode] : undefined;
        await ctx.db.patch(bot._id, {
          status: "completed",
          endedAt: now,
          failureReason: reason ?? args.subCode ?? undefined,
        });

        if (bot.meetingId) {
          const meeting = await ctx.db.get(bot.meetingId);
          await ctx.db.patch(bot.meetingId, {
            endedAt: now,
            status: reason ? "failed" : "completed",
            failureReason: reason,
            duration:
              meeting?.startedAt != null
                ? Math.round((now - meeting.startedAt) / 1000)
                : undefined,
          });
        } else if (reason) {
          // Never joined, so there's no meeting to annotate. Record why on the
          // bot so the tab can say what happened instead of showing nothing.
          await ctx.db.patch(bot._id, { failureReason: reason });
        }
        return { handled: true, status: "completed", reason: reason ?? null };
      }

      case "bot.done": {
        return { handled: true, status: "done", meetingId: bot.meetingId ?? null };
      }

      default:
        return { handled: true, status: `ignored ${args.event}` };
    }
  },
});

/**
 * Action wrapper. The webhook needs to schedule the transcript fetch after
 * `bot.done`, which a mutation cannot do on its own.
 */
export const applyManagerBotEvent = internalAction({
  args: {
    recallBotId: v.string(),
    event: v.string(),
    subCode: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ handled: boolean }> => {
    const result: any = await ctx.runMutation(
      internal.managerMeetingWebhook.applyEvent,
      args,
    );

    // Recall only has the recording and transcript once it says done. Asking
    // earlier returns a bot with no recordings and an empty transcript, which
    // we would then store as though they were real.
    if (args.event === "bot.done" && result?.meetingId) {
      await ctx.scheduler.runAfter(
        0,
        internal.managerMeetingTranscript.fetchManagerRecording,
        { meetingId: result.meetingId },
      );
      await ctx.scheduler.runAfter(
        0,
        internal.managerMeetingTranscript.fetchManagerTranscript,
        { meetingId: result.meetingId },
      );
    }
    return { handled: !!result?.handled };
  },
});
