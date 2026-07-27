// ============================================================================
// "Which of my calls still need an outcome?"
//
// The bot knew when a call ended, because it was in the call — so it could put
// the form in front of the closer at the one moment they were guaranteed to be
// at their desk. Fathom records without us, and the call turns up later. Nobody
// is prompted, and nothing asks.
//
// That gap is not cosmetic. Outcome and cash collected are the only source of
// close rate and revenue on the board, so without this the whole tier produces
// transcripts and no numbers.
//
// The answer is a queue: show the closer what's outstanding and let them clear
// it in a batch, which is how closers actually work — nobody fills in a form
// between back-to-back calls.
// ============================================================================

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/** More than this in one sitting isn't a queue, it's a wall. */
const MAX_QUEUE = 25;

/**
 * Calls waiting on the closer to say how they went.
 *
 * Deliberately excludes anything they've already marked as an internal
 * meeting: they've told us it isn't a sales call, and asking for its outcome
 * would be asking the same question twice in a different costume.
 *
 * Not bounded by date. A backfill only ever covers the current month, so the
 * queue is naturally bounded for a real account, and a call from three weeks
 * ago still deserves an answer rather than silently never counting.
 */
export const getCallsNeedingOutcome = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .order("desc")
      .take(200);

    const waiting = calls.filter(
      (c) =>
        c.source === "fathom" &&
        !c.outcome &&
        c.classifiedAs !== "internal" &&
        // No duration means we could neither trust Fathom's end time nor find
        // a transcript to derive one from — so there is nothing here for the
        // closer to recognise the call by. Asking about a blank row is worse
        // than not asking.
        c.duration !== undefined,
    );

    return {
      total: waiting.length,
      calls: waiting.slice(0, MAX_QUEUE).map((c) => ({
        _id: c._id,
        prospectName: c.prospectName ?? "Untitled call",
        startedAt: c.startedAt ?? c.createdAt,
        duration: c.duration,
        externalShareUrl: c.externalShareUrl,
        // So the queue can say why it's asking, and the closer can dismiss a
        // team meeting without opening the form at all.
        classifiedAs: c.classifiedAs,
        isHistorical: c.isHistorical === true,
      })),
    };
  },
});
