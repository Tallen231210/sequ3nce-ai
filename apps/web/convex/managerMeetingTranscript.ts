import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Fetch a manager meeting's transcript from Recall.
//
// Stored in managerMeetingTranscripts rather than transcriptSegments, which
// keys on `callId: v.id("calls")` and physically cannot hold a manager
// meeting. Widening that pointer is deliberate later work.
// ============================================================================

const RECALL_BASE = "https://us-west-2.recall.ai/api/v1";

export const getMeetingWithBot = internalQuery({
  args: { meetingId: v.id("managerMeetings") },
  handler: async (ctx, args) => {
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) return null;

    const bots = await ctx.db
      .query("managerMeetingBots")
      .withIndex("by_user", (q) => q.eq("userId", meeting.userId))
      .collect();
    const bot = bots.find((b) => b.meetingId === args.meetingId);

    return {
      userId: meeting.userId,
      recallBotId: bot?.recallBotId ?? null,
    };
  },
});

export const saveSegments = internalMutation({
  args: {
    meetingId: v.id("managerMeetings"),
    userId: v.id("users"),
    segments: v.array(
      v.object({
        speaker: v.string(),
        text: v.string(),
        startSeconds: v.number(),
        endSeconds: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    // Replace rather than append. Recall can deliver bot.done more than once,
    // and a doubled transcript is worse than a missing one — it reads as the
    // manager saying everything twice.
    const existing = await ctx.db
      .query("managerMeetingTranscripts")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    for (const s of args.segments) {
      await ctx.db.insert("managerMeetingTranscripts", {
        meetingId: args.meetingId,
        userId: args.userId,
        ...s,
      });
    }
    return { saved: args.segments.length, replaced: existing.length };
  },
});

export const saveRecordingUrl = internalMutation({
  args: { meetingId: v.id("managerMeetings"), recordingUrl: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.meetingId, { recordingUrl: args.recordingUrl });
    return { saved: true };
  },
});

/**
 * Fetch the recording once Recall has finished processing it.
 *
 * Same shape the closer side reads — `recordings[0].media_shortcuts
 * .video_mixed.data.download_url`. Called on bot.done, which is when Recall
 * says the file exists; asking earlier returns a bot with no recordings on it.
 */
export const fetchManagerRecording = internalAction({
  args: { meetingId: v.id("managerMeetings") },
  handler: async (ctx, args): Promise<{ recordingUrl: string | null }> => {
    const meeting = await ctx.runQuery(
      internal.managerMeetingTranscript.getMeetingWithBot,
      { meetingId: args.meetingId },
    );
    if (!meeting?.recallBotId) return { recordingUrl: null };

    const res = await fetch(`${RECALL_BASE}/bot/${meeting.recallBotId}/`, {
      headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
    });
    if (!res.ok) {
      throw new Error(`Recall bot fetch failed: ${res.status}`);
    }
    const data: any = await res.json();
    const url =
      data.recordings?.[0]?.media_shortcuts?.video_mixed?.data?.download_url;

    if (!url) {
      // Legitimate for a meeting nobody joined, or one that produced nothing.
      // Not an error, and not worth throwing over.
      console.log(`[managerRecording] No recording on bot ${meeting.recallBotId}`);
      return { recordingUrl: null };
    }

    await ctx.runMutation(internal.managerMeetingTranscript.saveRecordingUrl, {
      meetingId: args.meetingId,
      recordingUrl: url,
    });
    return { recordingUrl: url };
  },
});

export const fetchManagerTranscript = internalAction({
  args: { meetingId: v.id("managerMeetings") },
  handler: async (ctx, args): Promise<{ segments: number }> => {
    const meeting = await ctx.runQuery(
      internal.managerMeetingTranscript.getMeetingWithBot,
      { meetingId: args.meetingId },
    );
    if (!meeting?.recallBotId) return { segments: 0 };

    // NOT /bot/{id}/transcript/ — that endpoint is retired and answers 400
    // with "this is a legacy endpoint". The transcript now hangs off the
    // recording as a media shortcut with a signed download URL, the same way
    // the video does.
    const botRes = await fetch(`${RECALL_BASE}/bot/${meeting.recallBotId}/`, {
      headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
    });
    if (!botRes.ok) {
      throw new Error(`Recall bot fetch failed: ${botRes.status}`);
    }
    const botData: any = await botRes.json();
    const transcriptUrl =
      botData.recordings?.[0]?.media_shortcuts?.transcript?.data?.download_url;

    if (!transcriptUrl) {
      // Null when the meeting was silent, or when the bot was created without
      // a transcript provider. Both are legitimately "nothing to store".
      console.log(
        `[managerTranscript] No transcript on bot ${meeting.recallBotId}`,
      );
      return { segments: 0 };
    }

    const res = await fetch(transcriptUrl);
    if (!res.ok) {
      throw new Error(`Transcript download failed: ${res.status}`);
    }
    const raw = await res.json();

    // Recall returns one entry per speaker turn, each carrying word-level
    // timings. Collapsing to turns is what makes a transcript readable, and
    // the first and last word give the range a clip would need.
    const segments = (Array.isArray(raw) ? raw : []).flatMap((turn: any) => {
      const words = turn.words ?? [];
      if (words.length === 0) return [];
      return [
        {
          // The meeting platform tells Recall who this is — each participant
          // has their own audio stream, so this is a lookup rather than
          // acoustic guesswork, and it works identically on a group call.
          // `turn.speaker` does not exist; reading it gave every line
          // "Unknown" on the first real recording.
          speaker: turn.participant?.name ?? "Unknown",
          text: words.map((w: any) => w.text).join(" "),
          startSeconds: words[0]?.start_timestamp?.relative ?? 0,
          endSeconds: words[words.length - 1]?.end_timestamp?.relative ?? undefined,
        },
      ];
    });

    if (segments.length === 0) return { segments: 0 };

    await ctx.runMutation(internal.managerMeetingTranscript.saveSegments, {
      meetingId: args.meetingId,
      userId: meeting.userId,
      segments,
    });

    // Read the meeting once its words exist. Scheduled rather than awaited so
    // a model outage delays the summary without losing the transcript.
    await ctx.scheduler.runAfter(
      0,
      internal.managerMeetingAnalysisRun.analyseManagerMeeting,
      { meetingId: args.meetingId },
    );

    return { segments: segments.length };
  },
});
