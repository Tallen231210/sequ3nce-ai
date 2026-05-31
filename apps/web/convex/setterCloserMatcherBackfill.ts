"use node";

// ============================================================================
// One-shot backfill of prospectEmail / prospectPhone on the calls table.
//
// The matcher service in setterCloserMatcher.ts has a fallback path for
// rows whose denormalized identity is missing — it joins through
// scheduledCalls + calendarEvents on the fly. That keeps correctness
// independent of this backfill. But the fallback costs an extra DB read
// per unpopulated call, so running this once per team is worthwhile for
// teams with thousands of historical calls.
//
// Idempotent: rows that already have prospectEmail set are skipped. Safe
// to re-run anytime.
// ============================================================================

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Calls carry transcript + analysis blobs (~30-100KB each) so the V8 read
// budget caps the batch much lower than a "thin" table would. 25 × ~80KB
// + per-call closer-events fanout has comfortable headroom under 16 MiB.
const BATCH_SIZE = 25;
const MAX_CALLS_PER_INVOCATION = 2000;

export const backfillCallProspectIdentity = internalAction({
  args: {
    teamId: v.id("teams"),
    /** Cursor — startedAt timestamp to begin from. Omit for fresh run. */
    cursorStartedAt: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    inspected: number;
    patched: number;
    skipped: number;
    moreRemain: boolean;
  }> => {
    const { captureAndPersist } = await import("./lib/sentry");

    interface BatchRow {
      _id: string;
      startedAt: number | undefined;
      action: "skip-already-populated" | "patch" | "skip-no-derivation";
      derivedEmail: string | null;
      derivedPhone: string | null;
    }

    let inspected = 0;
    let patched = 0;
    let skipped = 0;
    let cursor: number = args.cursorStartedAt ?? 0;
    let done = false;

    try {
      while (inspected < MAX_CALLS_PER_INVOCATION && !done) {
        const batch: BatchRow[] = await ctx.runQuery(
          internal.setterCloserMatcherBackfillQuery.fetchUnpatchedBatch,
          {
            teamId: args.teamId,
            cursorStartedAt: cursor,
            limit: BATCH_SIZE,
          },
        );
        if (!batch || batch.length === 0) {
          done = true;
          break;
        }
        const payload: Array<{
          callId: string;
          prospectEmail: string | null;
          prospectPhone: string | null;
        }> = [];
        for (const row of batch) {
          inspected += 1;
          if (row.startedAt !== undefined) cursor = row.startedAt;
          if (row.action !== "patch") {
            skipped += 1;
            continue;
          }
          payload.push({
            callId: row._id,
            prospectEmail: row.derivedEmail,
            prospectPhone: row.derivedPhone,
          });
        }
        if (payload.length > 0) {
          await ctx.runMutation(
            internal.setterCloserMatcherBackfillQuery.patchBatch,
            { items: payload },
          );
          patched += payload.length;
        }
        if (batch.length < BATCH_SIZE) {
          done = true;
        }
      }

      const moreRemain = !done;
      if (moreRemain) {
        await ctx.scheduler.runAfter(
          0,
          internal.setterCloserMatcherBackfill.backfillCallProspectIdentity,
          { teamId: args.teamId, cursorStartedAt: cursor },
        );
      }
      return { inspected, patched, skipped, moreRemain };
    } catch (err) {
      const transient = isTransientReadError(err);
      await captureAndPersist(err, async () => {}, {
        feature: transient
          ? "backfillCallProspectIdentity.transient"
          : "backfillCallProspectIdentity",
        integration: "setter-data",
        extra: {
          teamId: String(args.teamId),
          cursorStartedAt: String(args.cursorStartedAt ?? 0),
        },
      });
      return { inspected, patched, skipped, moreRemain: false };
    }
  },
});

function isTransientReadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /16\s*MiB|too many|read limit|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
    msg,
  );
}
