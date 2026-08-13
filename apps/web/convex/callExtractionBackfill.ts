// ============================================================================
// Reading the calls that already happened.
//
// Every call before this feature went out has whatever the closer typed into
// the post-call form, which for RemoteStack was 17 times out of 100 and for
// CreateFreedom never. The rest are blank rows behind every chart.
//
// The dangerous part of a backfill here is not the reading, it's the waking up.
// Saving an outcome normally fires the completed-call notification, and that
// notification is not only a Slack post — it fans out to Discord and writes a
// contact, a tag and a note into the customer's own GoHighLevel CRM. Announcing
// a three-week-old call as if it just finished would be bad; writing a hundred
// of them into someone's CRM would be worse, and is not something we can take
// back. So every save here is silent, and that is the single most important
// line in this file.
//
// Batched and driven from outside rather than self-rescheduling: a chain that
// re-kicks itself is the one Convex pattern that has bitten this codebase
// hardest, and there is no reason to reach for it when a loop in a terminal
// does the same job visibly.
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Enough to make progress, small enough to stay well inside an action. */
const DEFAULT_BATCH = 8;

/** Between model calls, so a long run doesn't trip Anthropic's rate limit. */
const PAUSE_MS = 900;

function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Calls this team has that nobody ever answered.
 *
 * Deliberately excludes anything a human touched, anything already read, and
 * anything marked as not a sales call — the same gates the live path applies,
 * because a backfill that used looser rules than the feature would produce data
 * the feature itself would never have created.
 */
export const listBackfillCandidates = internalQuery({
  args: { teamId: v.id("teams"), limit: v.number() },
  handler: async (ctx, args): Promise<any> => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const candidates = calls.filter(
      (c) =>
        c.outcome == null &&
        c.outcomeSource == null &&
        c.classifiedAs !== "internal" &&
        c.status !== "active" &&
        c.extractionFailed == null,
    );

    // Oldest first, so a partial run leaves a clean waterline rather than holes.
    candidates.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

    return {
      total: calls.length,
      remaining: candidates.length,
      alreadyAnswered: calls.filter((c) => c.outcome != null).length,
      previouslyFailed: calls.filter((c) => c.extractionFailed != null).length,
      batch: candidates.slice(0, args.limit).map((c) => String(c._id)),
    };
  },
});

/**
 * Read one batch.
 *
 * `dryRun` reads and reports without writing a thing, which is how this gets
 * judged before it gets trusted.
 */
export const backfillTeam = internalAction({
  args: {
    teamId: v.id("teams"),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    const limit = args.limit ?? DEFAULT_BATCH;
    const survey: any = await ctx.runQuery(
      internal.callExtractionBackfill.listBackfillCandidates,
      { teamId: args.teamId, limit },
    );

    const results: any[] = [];
    let wrote = 0;
    let skipped = 0;

    for (const callId of survey.batch) {
      const preview: any = await ctx.runAction(
        internal.callExtractionRun.previewExtraction,
        { callId: callId as any },
      );

      if (!preview.ok) {
        skipped += 1;
        results.push({ callId, skipped: preview.reason });
        // Remember why, so the next batch doesn't retry the same dead call
        // forever and stall the run behind it.
        if (!args.dryRun) {
          await ctx.runMutation(
            internal.callExtractionRun.recordExtractionFailure,
            { callId: callId as any, reason: preview.reason },
          );
        }
        continue;
      }

      const d = preview.extracted;
      if (!args.dryRun) {
        const saved: any = await ctx.runMutation(
          internal.callExtractionRun.saveExtraction,
          { callId: callId as any, data: d, silent: true },
        );
        if (saved.written.length > 0) wrote += 1;
      }

      results.push({
        callId,
        outcome: d.outcome ?? null,
        contractValue: d.contractValue ?? null,
        cashCollected: d.cashCollected ?? null,
        primaryObjection: d.primaryObjection ?? d.objectionsOvercome ?? null,
        objections: d.objections ?? [],
      });

      await pause(PAUSE_MS);
    }

    return {
      dryRun: args.dryRun === true,
      teamTotal: survey.total,
      remainingBefore: survey.remaining,
      processed: survey.batch.length,
      wrote,
      skipped,
      results,
    };
  },
});
