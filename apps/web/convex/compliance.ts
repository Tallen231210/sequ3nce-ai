// ============================================================================
// Compliance review.
//
// A business writes a paragraph saying what's fine to say on their calls and
// what isn't. We read the transcript against it and report what may conflict.
//
// The rejected version, for anyone tempted to build it: source the actual FTC
// guidance for every industry a customer might be in. It never finishes, the
// documents change constantly, and it still wouldn't say what THIS business
// cares about. Their own paragraph is simpler and more accurate.
//
// THREE RULES THIS IS BUILT ON, all of which are about not causing harm:
//
// 1. It reviews the CONVERSATION, not the person. Partly because transcripts
//    sometimes swap closer and prospect, and flagging a rep for the prospect's
//    words would destroy trust in this instantly. But mostly because it's more
//    correct: if a prospect says "so this is guaranteed income, right?" and the
//    closer doesn't correct them, that is a problem too — arguably a worse one.
//
// 2. It never asserts a violation. Findings say what was said and which rule it
//    may touch, with a quote and a timestamp so a human decides in ten seconds.
//    If we tell a customer a call is "9/10 compliant" and they later face a
//    complaint, our number becomes part of their story.
//
// 3. It is quiet when there is nothing to say. An alert that fires on every
//    call is one nobody reads, including on the day it matters.
//
// The model call itself lives in complianceReview.ts, along with everything
// that can go wrong when it's made.
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { renderTranscript, runComplianceReview } from "./complianceReview";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Below this there isn't enough conversation to judge.
 *
 * Matches the existing analysis guard. Auto-join means no-shows now produce
 * calls — one recent example was 101 characters of a voicemail greeting — and
 * scoring those would fill the channel with findings about nothing.
 */
const MIN_TRANSCRIPT_CHARS = 200;

/**
 * How long a claim on a call is honoured before another trigger may take it.
 *
 * Long enough to cover three attempts with backoff against a slow API, short
 * enough that a run killed mid-flight doesn't block that call for the rest of
 * its life.
 */
const CLAIM_TTL_MS = 10 * 60 * 1000;

/**
 * What the model actually reads.
 *
 * Segments when we have them: they preserve who spoke and in what order, which
 * is what the "uncorrected claim" rule depends on — you cannot tell that a
 * claim went uncorrected without seeing the reply that followed it.
 *
 * Falls back to `transcriptText` for calls with no stored segments (older
 * calls, and any source that doesn't produce them). Those reviews still work;
 * their findings just won't carry timestamps, because there is nothing
 * trustworthy to derive one from.
 */
function transcriptForModel(
  segments: { timestamp: number; speaker: string; text: string }[],
  fallback: string,
): string {
  if (segments.length === 0) return fallback;
  return renderTranscript(segments);
}

export const getReviewContext = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args): Promise<any> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;
    const team = await ctx.db.get(call.teamId);

    const content = await ctx.db
      .query("callContent")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .first();

    // Segments are the better source: they carry real timestamps and speaker
    // labels from the recording, and on at least one real call the labels in
    // `transcriptText` are simply wrong — the opening line by the closer is
    // rendered there as "Prospect:". Kept in call order.
    const segments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_call_and_time", (q) => q.eq("callId", args.callId))
      .collect();

    return {
      teamId: String(call.teamId),
      enabled: team?.complianceEnabled === true,
      rules: team?.complianceRules ?? "",
      transcript: content?.transcriptText ?? "",
      segments: segments.map((s) => ({
        timestamp: s.timestamp,
        speaker: s.speaker,
        text: s.text,
      })),
      alreadyReviewed: !!content?.complianceReview,
      duration: call.duration ?? null,
      // A team meeting is not a sales call and shouldn't be judged as one.
      classifiedAs: call.classifiedAs ?? null,
      prospectName: call.prospectName ?? null,
    };
  },
});

/**
 * Take the call, or report that someone else already has.
 *
 * Convex mutations are transactional, so the read and the write here can't
 * interleave with another attempt's. That is the whole point — two schedulers
 * racing on the same call would otherwise both see "not started".
 */
export const claimReview = internalMutation({
  args: { callId: v.id("calls"), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<boolean> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return false;

    const startedAt = call.complianceReviewStartedAt;
    const fresh =
      typeof startedAt === "number" && Date.now() - startedAt < CLAIM_TTL_MS;
    // A manual re-run is a person waiting on an answer, and always wins.
    if (fresh && !args.force) return false;

    await ctx.db.patch(args.callId, { complianceReviewStartedAt: Date.now() });
    return true;
  },
});

export const saveReview = internalMutation({
  args: { callId: v.id("calls"), teamId: v.id("teams"), review: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("callContent")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { complianceReview: args.review });
    } else {
      await ctx.db.insert("callContent", {
        callId: args.callId,
        teamId: args.teamId,
        complianceReview: args.review,
      });
    }

    // Denormalised onto the call so the Completed Calls list can sort and filter
    // without opening callContent for all 100 rows. See the note in schema.ts.
    await ctx.db.patch(args.callId, {
      complianceScore: args.review.score,
      complianceFindingCount: args.review.findings?.length ?? 0,
      complianceReviewFailed: undefined,
    });
  },
});

/** Recorded so a review that never happened is visible rather than absent. */
export const recordReviewFailure = internalMutation({
  args: { callId: v.id("calls"), reason: v.string() },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return;
    await ctx.db.patch(args.callId, {
      complianceReviewFailed: args.reason.slice(0, 300),
      // Released immediately so the next trigger — or the manager's button —
      // can try again without waiting out the claim.
      complianceReviewStartedAt: undefined,
    });
  },
});

/**
 * Wipe every trace of compliance from one call.
 *
 * For the case where a review should never have existed on a call — a customer
 * asking for one to be removed, or a bad record left behind by testing. Without
 * this the only way to clear a stored failure is to make a successful review
 * happen, which is impossible on a team that has since switched compliance off.
 */
export const clearComplianceState = internalMutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { cleared: false };

    await ctx.db.patch(args.callId, {
      complianceScore: undefined,
      complianceFindingCount: undefined,
      complianceReviewFailed: undefined,
      complianceReviewStartedAt: undefined,
    });

    const content = await ctx.db
      .query("callContent")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .first();
    if (content?.complianceReview) {
      await ctx.db.patch(content._id, { complianceReview: undefined });
    }

    return { cleared: true };
  },
});

/**
 * Review one call.
 *
 * `force` re-runs a call that already has a review — the "Review again" button
 * for when a manager has edited the rules and wants an old call looked at
 * again. Editing the rules deliberately does NOT re-score history on its own: a
 * compliance record that changes retroactively is worse than one that is merely
 * incomplete.
 */
export const reviewCall = internalAction({
  args: {
    callId: v.id("calls"),
    force: v.optional(v.boolean()),
    /**
     * The caller's copy of the transcript, when it has one.
     *
     * `generateCallAnalysis` is handed the transcript directly and runs before
     * some paths have written `callContent`. Taking it as an argument removes
     * the ordering question entirely rather than betting on which write lands
     * first.
     */
    transcript: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const info = await ctx.runQuery(internal.compliance.getReviewContext, {
      callId: args.callId,
    });
    if (!info) return { ok: false, reason: "call not found" };
    if (!info.enabled) return { ok: false, reason: "compliance is off for this team" };
    if (!info.rules.trim()) {
      return { ok: false, reason: "no rules written yet — nothing to judge against" };
    }
    if (info.classifiedAs === "internal") {
      return { ok: false, reason: "internal meeting, not a sales call" };
    }
    if (info.alreadyReviewed && !args.force) {
      // Scored once, stored once. An LLM asked the same question twice gives
      // two answers, and a compliance number that drifts is worse than useless.
      return { ok: false, reason: "already reviewed" };
    }

    const transcript = (args.transcript ?? info.transcript ?? "").trim();
    if (transcript.length < MIN_TRANSCRIPT_CHARS) {
      return { ok: false, reason: "transcript too short to judge" };
    }

    // Claimed AFTER the cheap checks, so a call that was never going to be
    // reviewed doesn't get marked as in-progress.
    const claimed = await ctx.runMutation(internal.compliance.claimReview, {
      callId: args.callId,
      force: args.force,
    });
    if (!claimed) {
      return { ok: false, reason: "another review is already running for this call" };
    }

    const outcome = await runComplianceReview({
      rules: info.rules,
      transcript: transcriptForModel(info.segments, transcript),
      segments: info.segments,
    });

    if (!outcome.ok) {
      console.error(
        `[Compliance] Review failed for call ${args.callId} after ${outcome.attempts} attempts: ${outcome.reason}`,
      );
      await ctx.runMutation(internal.compliance.recordReviewFailure, {
        callId: args.callId,
        reason: outcome.reason,
      });
      // A review that silently never happens is the failure this whole feature
      // can least afford, and it leaves no trace anyone would notice. Page us.
      //
      // Wrapped because failing to REPORT a failure must not turn a recorded,
      // retryable failure into an unhandled one — the record above is what the
      // manager sees, and it is already written by this point.
      try {
        await ctx.runAction(internal.lib.sentry.captureFromIsolate, {
          message: `Compliance review failed: ${outcome.reason}`,
          feature: "compliance",
          integration: "anthropic",
          extra: { teamId: String(info.teamId), callId: String(args.callId) },
        });
      } catch (reportingError) {
        console.error("[Compliance] Could not report failure:", reportingError);
      }
      return { ok: false, reason: outcome.reason };
    }

    const review = {
      ...outcome.review,
      // Kept so a score stays explicable after the rules are edited.
      rulesUsed: info.rules,
      reviewedAt: Date.now(),
    };

    await ctx.runMutation(internal.compliance.saveReview, {
      callId: args.callId,
      teamId: info.teamId as Id<"teams">,
      review,
    });

    // Silent when clean. A channel that only ever speaks up when something is
    // worth reading is one people still open in six months.
    //
    // A forced re-run never alerts: it happens because a manager is sitting on
    // the call page looking at it, and posting the same findings back into the
    // channel they came from is noise.
    if (review.findings.length > 0 && !args.force) {
      await ctx.scheduler.runAfter(
        0,
        internal.complianceNotifications.sendComplianceAlert,
        { callId: args.callId, review },
      );
    }

    return { ok: true, review };
  },
});

/**
 * Try it on a real transcript without storing anything.
 *
 * The point of this is to see whether the rules a business wrote actually
 * produce sensible findings BEFORE it starts posting into their channel. Rules
 * that are too vague produce noise; too specific and it misses things. That is
 * a conversation to have with a customer, and this is what makes it concrete.
 *
 * Goes through exactly the same code as the real review. A preview that
 * succeeded where the real path failed would be worse than no preview at all.
 */
export const previewReview = internalAction({
  args: { callId: v.id("calls"), rules: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const info = await ctx.runQuery(internal.compliance.getReviewContext, {
      callId: args.callId,
    });
    if (!info) return { ok: false, reason: "call not found" };

    const transcript = (info.transcript ?? "").trim();
    if (transcript.length < MIN_TRANSCRIPT_CHARS) {
      return {
        ok: false,
        reason: `That call has only ${transcript.length} characters of transcript — too short to judge.`,
      };
    }

    const outcome = await runComplianceReview({
      rules: args.rules,
      transcript: transcriptForModel(info.segments, transcript),
      segments: info.segments,
    });

    if (!outcome.ok) {
      console.error(
        `[Compliance] Preview failed for call ${args.callId}: ${outcome.reason}`,
      );
      return { ok: false, reason: outcome.reason };
    }

    return {
      ok: true,
      transcriptChars: transcript.length,
      attempts: outcome.attempts,
      review: outcome.review,
    };
  },
});
