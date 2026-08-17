import { v } from "convex/values";
import { query } from "./_generated/server";
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
