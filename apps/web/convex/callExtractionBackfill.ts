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

/**
 * How many of a team's calls one survey looks at.
 *
 * Well under Convex's 32k-document transaction ceiling, and far above any real
 * team today — the largest has a few hundred. Exists so that when a team does
 * outgrow it, the run reports a truncated window rather than throwing.
 */
const MAX_SCAN = 8000;

function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Failures that will still be failures tomorrow.
 *
 * A call with no transcript has nothing to read and never will unless one
 * arrives; a model call that gave up after three attempts may simply have hit a
 * rate limit while 180 other calls were queued behind it. Marking both the same
 * way means one bad minute quietly excludes a batch of perfectly readable calls
 * from every future run — and because the survey then reports zero remaining,
 * it looks exactly like success.
 *
 * Matched on substrings rather than an enum because these strings come from
 * several layers; a reason we don't recognise is treated as retryable, which
 * fails towards doing the work again rather than towards silently dropping it.
 */
const PERMANENT_FAILURES = [
  "too short",
  "call not found",
  "internal meeting",
  "already answered",
  "already extracted",
  "extraction is off",
];

function isPermanent(reason: string | undefined): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  return PERMANENT_FAILURES.some((p) => r.includes(p));
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
  args: {
    teamId: v.id("teams"),
    limit: v.number(),
    /**
     * Also pick up calls that failed for a reason which might not hold next
     * time. See PERMANENT_FAILURES.
     */
    includeRetryable: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    // Bounded, not .collect(). A transaction dies at 32k documents, and this
    // reads every call a team has ever had — the one query here guaranteed to
    // grow forever. Hitting that ceiling would throw mid-run rather than
    // degrade, so take a fixed window instead.
    //
    // The index is (teamId, _creationTime), so this is the OLDEST calls, which
    // is the order a backfill wants anyway. Each pass fills in outcomes and the
    // window moves on, so repeated runs still converge.
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .take(MAX_SCAN);

    const candidates = calls.filter(
      (c) =>
        c.outcome == null &&
        c.outcomeSource == null &&
        c.classifiedAs !== "internal" &&
        c.status !== "active" &&
        (c.extractionFailed == null ||
          (args.includeRetryable === true && !isPermanent(c.extractionFailed))),
    );

    // Oldest first, so a partial run leaves a clean waterline rather than holes.
    candidates.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

    // Grouped so a run can be judged rather than just counted — "43 skipped"
    // hides the difference between 43 calls with no transcript and 43 calls
    // that hit a rate limit.
    // An array, not a keyed object: these strings carry punctuation Convex
    // won't accept as a field name, and a report that throws is worse than
    // one that's slightly more awkward to read.
    const byReason = new Map<string, { retryable: boolean; count: number }>();
    for (const c of calls) {
      if (!c.extractionFailed) continue;
      const key = c.extractionFailed.slice(0, 80);
      const seen = byReason.get(key);
      if (seen) seen.count += 1;
      else byReason.set(key, { retryable: !isPermanent(c.extractionFailed), count: 1 });
    }
    const failureReasons = [...byReason.entries()]
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => b.count - a.count);

    return {
      total: calls.length,
      remaining: candidates.length,
      alreadyAnswered: calls.filter((c) => c.outcome != null).length,
      previouslyFailed: calls.filter((c) => c.extractionFailed != null).length,
      // Loud on purpose. A survey that silently examined only part of a team
      // would report "0 remaining" and read exactly like finishing.
      scanTruncated: calls.length === MAX_SCAN,
      failureReasons,
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
    /** Re-attempt calls whose earlier failure might not repeat. */
    includeRetryable: v.optional(v.boolean()),
    /** Required to write. Deliberately not defaulted — see the handler. */
    confirmWrite: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<any> => {
    const limit = args.limit ?? DEFAULT_BATCH;

    // Writing history has to be asked for explicitly.
    //
    // This used to check a per-team opt-in, which is gone — reading calls is
    // simply how the product works now. But the reason the check existed hasn't
    // gone anywhere: the live path only ever touches calls as they happen,
    // whereas this rewrites months of a real customer's history in one go, and
    // the only thing standing between the right team and the wrong one is a
    // 32-character id pasted into a terminal.
    //
    // So a dry run needs nothing, and a write needs someone to have said so in
    // the same breath.
    if (!args.dryRun && args.confirmWrite !== true) {
      return {
        ok: false,
        reason:
          "this rewrites a real team's history — pass confirmWrite: true, or dryRun: true to see what it would do",
      };
    }

    const survey: any = await ctx.runQuery(
      internal.callExtractionBackfill.listBackfillCandidates,
      { teamId: args.teamId, limit, includeRetryable: args.includeRetryable },
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
