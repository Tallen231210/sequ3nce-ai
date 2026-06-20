// ============================================================================
// One-off backfill — populate firstSeenAt = _creationTime on existing
// setterReps rows. Runs idempotently; safe to invoke multiple times.
//
// After Phase 2 ships, this file can be deleted — the GHL sync mutation
// sets firstSeenAt: now on every new insert, so going forward every row
// has the field populated at creation.
// ============================================================================

import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

export const backfillFirstSeenAtChunk = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ patched: number; remaining: number }> => {
    // Bounded scan — should be small (one row per active setter per team).
    const sample = (await ctx.db
      .query("setterReps")
      .take(500)) as Doc<"setterReps">[];
    let patched = 0;
    for (const r of sample) {
      if (r.firstSeenAt !== undefined) continue;
      await ctx.db.patch(r._id, { firstSeenAt: r._creationTime });
      patched += 1;
    }
    return { patched, remaining: sample.length === 500 ? -1 : 0 };
  },
});

export const backfillFirstSeenAt = internalAction({
  args: {},
  handler: async (ctx): Promise<{ totalPatched: number; pages: number }> => {
    let totalPatched = 0;
    let pages = 0;
    while (true) {
      const r = (await ctx.runMutation(
        internal.setterScorecardBackfill.backfillFirstSeenAtChunk,
        {},
      )) as { patched: number; remaining: number };
      pages += 1;
      totalPatched += r.patched;
      // Mutation patches everything it touches in a chunk; if `patched`
      // is 0, we're done.
      if (r.patched === 0) break;
      // Guard rail
      if (pages > 100) break;
    }
    return { totalPatched, pages };
  },
});
