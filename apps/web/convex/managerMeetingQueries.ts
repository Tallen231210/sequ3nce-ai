import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveAuthUser } from "./setterGhlOauth";

/**
 * Reads for the Manager Mode tab.
 *
 * Every query here scopes to the signed-in manager, never to their team. One
 * manager does not see another's meetings — a one-to-one about someone's
 * performance is not team-readable, and the moment it is, managers start
 * guarding what they say and the recordings become worthless.
 */

export const listManagerMeetings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return [];

    const meetings = await ctx.db
      .query("managerMeetings")
      .withIndex("by_user_and_created", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(50);

    return meetings.map((m) => ({
      _id: m._id,
      title: m.title,
      startedAt: m.startedAt ?? null,
      endedAt: m.endedAt ?? null,
      duration: m.duration ?? null,
      status: m.status,
      hasRecording: !!m.recordingUrl,
      failureReason: m.failureReason ?? null,
    }));
  },
});

/**
 * One meeting, with whatever we've read off it.
 *
 * Analysis is deliberately nullable rather than defaulted. A meeting that
 * hasn't been read yet and one that produced nothing are different facts, and
 * the screen says which — an empty summary presented as a summary is how a
 * manager concludes the feature is broken.
 */
export const getManagerMeetingDetail = query({
  args: { clerkId: v.string(), meetingId: v.id("managerMeetings") },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;

    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) return null;
    // Scoped to the owner. A manager cannot open another manager's meeting by
    // guessing an id.
    if (meeting.userId !== user._id) return null;

    const analysis = await ctx.db
      .query("managerMeetingAnalysis")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .first();

    const transcript = await ctx.db
      .query("managerMeetingTranscripts")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .collect();
    transcript.sort((a, b) => a.startSeconds - b.startSeconds);

    return {
      _id: meeting._id,
      title: meeting.title,
      startedAt: meeting.startedAt ?? null,
      duration: meeting.duration ?? null,
      status: meeting.status,
      recordingUrl: meeting.recordingUrl ?? null,
      failureReason: meeting.failureReason ?? null,
      hasTranscript: transcript.length > 0,
      transcript: transcript.slice(0, 400).map((t) => ({
        speaker: t.speaker,
        text: t.text,
        startSeconds: t.startSeconds,
      })),
      analysis: analysis
        ? {
            kind: analysis.kind,
            summary: analysis.summary,
            topics: analysis.topics,
            actionItems: analysis.actionItems,
            agreements: analysis.agreements,
            candidateName: analysis.candidateName ?? null,
            role: analysis.role ?? null,
            talkingPoints: analysis.talkingPoints,
          }
        : null,
    };
  },
});

/**
 * What's coming up, so a manager can see what the bot will join before it
 * does — and keep it out of anything they'd rather it missed.
 */
export const listUpcomingManagerEvents = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return [];

    const now = Date.now();
    const events = await ctx.db
      .query("managerCalendarEvents")
      .withIndex("by_user_and_start", (q) =>
        q.eq("userId", user._id).gte("startTime", now),
      )
      .take(20);

    return events.map((e) => ({
      _id: e._id,
      title: e.title,
      startTime: e.startTime,
      endTime: e.endTime,
      // Whether a bot can attend at all. A meeting with no video link is on
      // the calendar but unrecordable, and saying so beats a silent absence.
      hasMeetingUrl: !!e.meetingUrl,
      excluded: e.excluded === true,
    }));
  },
});

/**
 * Delete a meeting and everything that hangs off it.
 *
 * This is the flip side of "kicking the bot keeps what was recorded": the
 * deliberate act that actually removes a recording. It takes the transcript,
 * the analysis, the clips and every share link with it — a share that outlives
 * its meeting would keep serving words the manager just chose to destroy.
 */
export const deleteManagerMeeting = mutation({
  args: { clerkId: v.string(), meetingId: v.id("managerMeetings") },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) return { deleted: false };
    if (String(meeting.userId) !== String(user._id)) {
      throw new ConvexError("Not your meeting");
    }

    const [transcripts, analyses, clips, shares] = await Promise.all([
      ctx.db
        .query("managerMeetingTranscripts")
        .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
        .collect(),
      ctx.db
        .query("managerMeetingAnalysis")
        .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
        .collect(),
      ctx.db
        .query("managerMeetingClips")
        .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
        .collect(),
      ctx.db
        .query("managerMeetingShares")
        .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
        .collect(),
    ]);
    for (const r of [...transcripts, ...analyses, ...clips, ...shares]) {
      await ctx.db.delete(r._id);
    }
    await ctx.db.delete(args.meetingId);

    return {
      deleted: true,
      removed: {
        transcriptSegments: transcripts.length,
        clips: clips.length,
        shareLinks: shares.length,
      },
    };
  },
});
