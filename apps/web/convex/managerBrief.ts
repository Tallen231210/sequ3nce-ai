import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// The brief: what to raise in the meeting you're about to walk into.
//
// Two things go in it. What this rep's numbers are doing, which comes from the
// same engine as the rep cards. And what was agreed last time you spoke, which
// comes from the previous meeting's analysis.
//
// The second is the part nothing else can do. Opening a one-to-one with "last
// week you said you'd pitch on every call, and your offer rate since is 25%"
// requires holding both halves, and we do.
// ============================================================================

/** How far ahead counts as "next". Beyond this it isn't a brief, it's a diary. */
const NEXT_WINDOW_MS = 12 * 60 * 60 * 1000;

export const getNextMeetingBrief = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;

    const now = Date.now();
    const events = await ctx.db
      .query("managerCalendarEvents")
      .withIndex("by_user_and_start", (q) =>
        q.eq("userId", user._id).gte("startTime", now - 15 * 60 * 1000),
      )
      .take(10);

    // Slightly in the past is deliberate: a manager opening this two minutes
    // after a meeting started still wants the brief for it.
    const next = events
      .filter((e) => e.startTime <= now + NEXT_WINDOW_MS)
      .sort((a, b) => a.startTime - b.startTime)[0];

    if (!next) return { meeting: null };

    const repId = next.taggedCloserId ?? next.matchedCloserId ?? null;
    const rep = repId ? await ctx.db.get(repId) : null;

    // What was agreed the last time this manager met this rep.
    let lastAgreements: Array<{ what: string; measurable: boolean }> = [];
    let lastMetAt: number | null = null;

    if (repId) {
      const past = await ctx.db
        .query("managerMeetings")
        .withIndex("by_user_and_created", (q) => q.eq("userId", user._id))
        .order("desc")
        .take(40);

      for (const m of past) {
        if (!m.calendarEventId) continue;
        const ev = await ctx.db.get(m.calendarEventId);
        const evRep = ev?.taggedCloserId ?? ev?.matchedCloserId ?? null;
        if (!evRep || String(evRep) !== String(repId)) continue;

        const analysis = await ctx.db
          .query("managerMeetingAnalysis")
          .withIndex("by_meeting", (q) => q.eq("meetingId", m._id))
          .first();
        if (!analysis) continue;

        lastAgreements = analysis.agreements.map((a) => ({
          what: a.what,
          measurable: a.measurable,
        }));
        lastMetAt = m.startedAt ?? m.createdAt;
        break; // most recent only — older ones are history, not a brief
      }
    }

    return {
      meeting: {
        eventId: next._id,
        title: next.title,
        startTime: next.startTime,
        hasMeetingUrl: !!next.meetingUrl,
        excluded: next.excluded === true,
      },
      rep: rep
        ? {
            closerId: rep._id,
            name: rep.name ?? "Unknown",
            // How we worked out who this is with, so a wrong guess is
            // correctable rather than mysterious.
            identifiedBy: next.taggedCloserId ? "you" : next.matchedBy ?? null,
          }
        : null,
      lastMetAt,
      lastAgreements,
    };
  },
});

/**
 * Tell us who a meeting is actually with.
 *
 * Needed because only 16% of real calendar events name attendees, so the brief
 * will regularly not know. Asking is better than guessing — a brief addressed
 * to the wrong rep is worse than none, because the manager believes it.
 */
export const tagMeetingRep = mutation({
  args: {
    clerkId: v.string(),
    eventId: v.id("managerCalendarEvents"),
    closerId: v.union(v.id("closers"), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");

    const ev = await ctx.db.get(args.eventId);
    if (!ev) throw new ConvexError("That meeting is no longer on your calendar");
    if (String(ev.userId) !== String(user._id)) {
      throw new ConvexError("Not your meeting");
    }

    await ctx.db.patch(args.eventId, {
      taggedCloserId: args.closerId ?? undefined,
    });
    return { success: true };
  },
});

/** Keep the bot out of one meeting, without switching recording off entirely. */
export const setMeetingExcluded = mutation({
  args: {
    clerkId: v.string(),
    eventId: v.id("managerCalendarEvents"),
    excluded: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");

    const ev = await ctx.db.get(args.eventId);
    if (!ev) throw new ConvexError("That meeting is no longer on your calendar");
    if (String(ev.userId) !== String(user._id)) {
      throw new ConvexError("Not your meeting");
    }

    await ctx.db.patch(args.eventId, { excluded: args.excluded });
    return { success: true, excluded: args.excluded };
  },
});

/** Reps the manager can tag a meeting against. */
export const listTaggableReps = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return [];
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId as Id<"teams">))
      .take(200);
    return closers
      .filter((c) => c.status === "active")
      .map((c) => ({ closerId: c._id, name: c.name ?? "Unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
