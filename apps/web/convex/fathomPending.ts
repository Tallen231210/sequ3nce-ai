// ============================================================================
// "Why is my board empty?"
//
// A team connects Fathom, we import the month, and the manager opens Team
// Performance expecting to see it. They see nothing, because an imported call
// carries no outcome and nothing without an outcome can be counted — the whole
// point of the historical rule.
//
// That's correct behaviour with a terrible first impression. The board isn't
// broken and the import didn't fail; the calls are sitting with the closers.
// Nothing said so, which meant the most likely reading was "this doesn't work".
//
// So say it, by name, with a count.
// ============================================================================

import { v } from "convex/values";
import { query } from "./_generated/server";

export const getPendingOutcomes = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    // Bounded by date, not by a row count.
    //
    // "The 500 most recent" sounds equivalent but isn't: a busy team can fill
    // that in a few weeks, and the calls we most want to flag — a month of
    // freshly imported history — would fall off the end silently. A date range
    // costs the same read budget and can't quietly stop working as a customer
    // grows.
    //
    // Ninety days because a backfill only ever covers the current month, and a
    // call still unanswered from six months ago isn't news a manager can act
    // on today.
    const since = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", since),
      )
      .take(2000);

    // Waiting on a person: recorded by Fathom, not counted yet, and not
    // something a closer has already told us was an internal meeting.
    const pending = calls.filter(
      (c) =>
        c.source === "fathom" &&
        c.status === "unclassified" &&
        c.classifiedAs !== "internal",
    );
    if (pending.length === 0) {
      return { total: 0, byCloser: [], oldestAt: null };
    }

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .take(500);
    const nameById = new Map(closers.map((c) => [String(c._id), c.name]));

    const counts = new Map<string, number>();
    let oldestAt: number | null = null;
    for (const call of pending) {
      const key = String(call.closerId);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const at = call.startedAt ?? call.createdAt;
      if (oldestAt === null || at < oldestAt) oldestAt = at;
    }

    return {
      total: pending.length,
      // Named, and worst first. A manager chasing this needs to know who to
      // talk to, not just that a number exists.
      byCloser: Array.from(counts.entries())
        .map(([closerId, count]) => ({
          closerId,
          name: nameById.get(closerId) ?? "Unknown",
          count,
        }))
        .sort((a, b) => b.count - a.count),
      oldestAt,
    };
  },
});
