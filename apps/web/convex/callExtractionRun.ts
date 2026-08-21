// ============================================================================
// Running extraction against a call, and storing the result.
//
// Split from callExtraction.ts the same way compliance is split: the model call
// and its guards are pure and testable, this file owns the database.
//
// The rules that matter, all of them about not destroying something true:
//   - Never overwrite a value a human gave us. A closer's answer outranks ours
//     permanently, and absent provenance means human, because every call that
//     predates this was filled in by one.
//   - Write into the SAME fields the form wrote into, so no screen downstream
//     has to change and no historical data has to move.
//   - Sync the callStats sidecar in the same breath, or Collections and closer
//     stats keep showing the old number — the exact failure fixed on
//     2026-08-12, see [[callstats-sidecar-never-synced]].
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { renderTranscript } from "./complianceReview";
import { runCallExtraction, MIN_TRANSCRIPT_CHARS } from "./callExtraction";
import { syncCallStats } from "./callStats";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Long enough for three attempts, short enough that a dead run frees the call. */
const CLAIM_TTL_MS = 10 * 60 * 1000;

/**
 * Everything extraction needs, plus everything that decides whether it should
 * run at all.
 */
export const getExtractionContext = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args): Promise<any> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;

    const content = await ctx.db
      .query("callContent")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .first();

    // Segments, not transcriptText: they carry the correct speaker labels and
    // real timestamps, and on at least one real call transcriptText's labels
    // are simply wrong. See [[speaker-labels-stale-copy]].
    const segments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_call_and_time", (q) => q.eq("callId", args.callId))
      .collect();

    return {
      teamId: String(call.teamId),
      classifiedAs: call.classifiedAs ?? null,
      status: call.status,
      // Absent provenance means a human, because every call older than this
      // feature was filled in by one.
      hasHumanAnswer:
        call.outcome != null && call.outcomeSource !== "ai",
      alreadyExtracted: call.outcomeSource === "ai",
      existing: {
        outcome: call.outcome ?? null,
        cashCollected: call.cashCollected ?? null,
        contractValue: call.contractValue ?? null,
        primaryObjection: call.primaryObjection ?? null,
        objectionsOvercome: call.objectionsOvercome ?? null,
      },
      meetingBotId: call.meetingBotId ?? null,
      transcript:
        segments.length > 0
          ? renderTranscript(
              segments.map((s) => ({
                timestamp: s.timestamp,
                speaker: s.speaker,
                text: s.text,
              })),
            )
          : content?.transcriptText ?? "",
    };
  },
});

/**
 * Kept only so a browser tab left open from before this became universal
 * doesn't call a function that no longer exists.
 *
 * Reading the call IS how the product works now — there is no per-team switch
 * and no way to turn it off, so this answers true for everyone. Delete it once
 * no stale client could plausibly still be asking.
 *
 * @deprecated
 */
export const isExtractionEnabled = query({
  args: { teamId: v.id("teams") },
  handler: async (): Promise<boolean> => true,
});

/** Take the call, or report that someone else already has. */
export const claimExtraction = internalMutation({
  args: { callId: v.id("calls"), force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<boolean> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return false;
    const startedAt = call.extractionStartedAt;
    const fresh =
      typeof startedAt === "number" && Date.now() - startedAt < CLAIM_TTL_MS;
    if (fresh && !args.force) return false;
    await ctx.db.patch(args.callId, { extractionStartedAt: Date.now() });
    return true;
  },
});

/**
 * Store what was extracted.
 *
 * Field by field, and only where nothing is there. A partially-filled call —
 * closer typed the cash but not the outcome — keeps the cash and gains the
 * outcome.
 */
export const saveExtraction = internalMutation({
  args: {
    callId: v.id("calls"),
    data: v.any(),
    /**
     * Suppress the completed-call notification. Set by the backfill.
     *
     * That notification is not just a Slack post: it also fans out to Discord
     * and writes a contact, a tag and a note into the customer's own GoHighLevel
     * CRM (slack.ts, at the end of sendCallCompletedNotification). Reading a
     * three-week-old call is no reason to announce it as if it just happened,
     * and no reason at all to touch their CRM.
     */
    silent: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ written: string[] }> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { written: [] };

    // A human's answer is final. Re-checked here rather than trusted from the
    // action, because the closer may have submitted while the model was running.
    const humanAnswered = call.outcome != null && call.outcomeSource !== "ai";
    if (humanAnswered) return { written: [] };

    const d = args.data as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const written: string[] = [];

    for (const field of [
      "outcome",
      "cashCollected",
      "contractValue",
      "primaryObjection",
      "objections",
      "objectionsOvercome",
    ] as const) {
      const value = d[field];
      if (value === undefined || value === null) continue;
      if ((call as any)[field] != null) continue; // never clobber
      patch[field] = value;
      written.push(field);
    }

    if (written.length === 0) {
      await ctx.db.patch(args.callId, { extractionStartedAt: undefined });
      return { written: [] };
    }

    // Claim only what nobody has claimed.
    //
    // The early return above catches a human who set the OUTCOME. It misses one
    // who set only the money — a closer typing cash collected during the 60-90
    // seconds this takes to run. Their figure survives (nothing is clobbered)
    // but the provenance would flip to "ai", so the number they typed themselves
    // comes back marked as read off the recording, wearing the AI badge and
    // counting as unconfirmed on the coverage metric. Never downgrade a person
    // to a machine.
    const humanTouched =
      call.outcomeSource === "closer" || call.outcomeSource === "manager";
    if (!humanTouched) patch.outcomeSource = "ai";
    patch.extractionFailed = undefined;
    patch.extractionStartedAt = undefined;
    await ctx.db.patch(args.callId, patch);

    // Collections, closer stats and the team board all read the sidecar rather
    // than this row. Without this the money is on the call and invisible
    // everywhere it's meant to count.
    await syncCallStats(ctx, args.callId);

    // Stop the desktop app asking for a form we've just filled in. The prompt
    // is gated on this flag, not on the call's outcome, so filling the outcome
    // alone would leave it nagging.
    if (call.meetingBotId && written.includes("outcome")) {
      const bot = await ctx.db.get(call.meetingBotId);
      if (bot && bot.questionnaireCompleted !== true) {
        await ctx.db.patch(call.meetingBotId, { questionnaireCompleted: true });
      }
    }

    // Send the summary now rather than letting it sit out the wait.
    //
    // That notification is held five minutes so a closer has time to submit the
    // form before it goes out half-empty. Once we've read the outcome ourselves
    // there is nothing left to wait for, so this takes the same early-fire path
    // the closer's own submission takes (calls.ts, completeCallWithOutcome):
    // cancel the pending job, fire immediately, and let the dedup record stop a
    // double-send if the timer had already gone off.
    if (written.includes("outcome") && !args.silent) {
      const alreadySent = await ctx.db
        .query("slackNotifications")
        .withIndex("by_call_and_type", (q) =>
          q.eq("callId", args.callId).eq("type", "call_completed"),
        )
        .first();

      if (!alreadySent) {
        if (call.pendingNotificationJobId) {
          try {
            await ctx.scheduler.cancel(
              call.pendingNotificationJobId as Id<"_scheduled_functions">,
            );
          } catch {
            // Already fired — the dedup record above will stop a duplicate.
          }
        }
        await ctx.scheduler.runAfter(
          0,
          internal.slack.sendCallCompletedNotification,
          { callId: args.callId },
        );
        console.log(
          `[CallExtraction] Early-fired the summary for ${args.callId} — we read the outcome`,
        );
      }
    }

    return { written };
  },
});

export const recordExtractionFailure = internalMutation({
  args: { callId: v.id("calls"), reason: v.string() },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return;
    await ctx.db.patch(args.callId, {
      extractionFailed: args.reason.slice(0, 300),
      extractionStartedAt: undefined,
    });
  },
});

/**
 * Extract one call.
 *
 * Scheduled from `generateCallAnalysis`, the one place every transcript source
 * funnels through — bot, Fathom, desktop and speaker re-verification.
 */
/**
 * The extraction read the call and it was not a sales call. Stamp it the
 * same way the manual not-a-sales-call control does — classifiedAs
 * "internal", out of Completed Calls (status "unclassified"), out of the
 * stats (countsTowardStats false, sidecar synced). Without this stamp a
 * bot-recorded team meeting wears the "Pending" badge forever and pollutes
 * every closer metric.
 *
 * Never overrides a human: a closer or manager who said "this IS a sales
 * call" outranks the model.
 */
export const markNonSalesFromExtraction = internalMutation({
  args: { callId: v.id("calls"), callType: v.string() },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return { stamped: false };
    if (call.classifiedBy === "closer" || call.classifiedBy === "manager") {
      return { stamped: false };
    }
    if (call.outcome != null) return { stamped: false };
    await ctx.db.patch(args.callId, {
      classifiedAs: "internal",
      classifiedBy: "auto",
      countsTowardStats: false,
      status: "unclassified",
    });
    await syncCallStats(ctx, args.callId);
    console.log(
      `[CallExtraction] ${args.callId} read as "${args.callType}" — marked not-a-sales-call`,
    );
    return { stamped: true };
  },
});

export const extractCall = internalAction({
  args: {
    callId: v.id("calls"),
    force: v.optional(v.boolean()),
    transcript: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const info = await ctx.runQuery(
      internal.callExtractionRun.getExtractionContext,
      { callId: args.callId },
    );
    if (!info) return { ok: false, reason: "call not found" };
    if (info.classifiedAs === "internal") {
      return { ok: false, reason: "internal meeting, not a sales call" };
    }
    if (info.hasHumanAnswer) {
      return { ok: false, reason: "a human already answered this call" };
    }
    if (info.alreadyExtracted && !args.force) {
      return { ok: false, reason: "already extracted" };
    }

    const transcript = (args.transcript ?? info.transcript ?? "").trim();
    if (transcript.length < MIN_TRANSCRIPT_CHARS) {
      // Recorded, not just returned: an unmarked early exit re-qualifies for
      // the nightly repair sweep forever — the transcript will be exactly as
      // short tomorrow.
      await ctx.runMutation(
        internal.callExtractionRun.recordExtractionFailure,
        { callId: args.callId, reason: `transcript is ${transcript.length} chars — too short` },
      );
      return { ok: false, reason: "transcript too short to read" };
    }

    const claimed = await ctx.runMutation(
      internal.callExtractionRun.claimExtraction,
      { callId: args.callId, force: args.force },
    );
    if (!claimed) return { ok: false, reason: "another extraction is running" };

    const result = await runCallExtraction({ transcript });

    if (!result.ok) {
      console.error(
        `[CallExtraction] Failed for ${args.callId} after ${result.attempts}: ${result.reason}`,
      );
      await ctx.runMutation(
        internal.callExtractionRun.recordExtractionFailure,
        { callId: args.callId, reason: result.reason },
      );
      return { ok: false, reason: result.reason };
    }

    // Non-sales calls get STAMPED, not silently skipped. Before this, a
    // bot-recorded team meeting produced `written: []` and stayed "Pending"
    // in Completed Calls forever, counting toward every closer metric.
    if (result.data.callType && result.data.callType !== "sales") {
      const stamped = await ctx.runMutation(
        internal.callExtractionRun.markNonSalesFromExtraction,
        { callId: args.callId, callType: result.data.callType },
      );
      return { ok: true, written: [], stamped, data: result.data };
    }

    const saved = await ctx.runMutation(
      internal.callExtractionRun.saveExtraction,
      { callId: args.callId, data: result.data },
    );

    console.log(
      `[CallExtraction] ${args.callId}: wrote ${saved.written.join(", ") || "nothing"}` +
        (result.data.discarded.length
          ? ` | discarded: ${result.data.discarded.join("; ")}`
          : ""),
    );

    // Read fine, but the call never stated an outcome. Mark it so the
    // nightly repair sweep doesn't re-read the same transcript forever —
    // the words won't change overnight. (A human or a forced re-run can
    // still answer it.)
    if (!saved.written.includes("outcome")) {
      await ctx.runMutation(
        internal.callExtractionRun.recordExtractionFailure,
        { callId: args.callId, reason: "read ok — no outcome was stated on the call" },
      );
    }

    return { ok: true, written: saved.written, data: result.data };
  },
});

/**
 * Read a transcript passed in directly, storing nothing and touching no call.
 *
 * Objection classification is the part that needs testing against situations
 * rather than against whichever calls happen to exist — a spouse objection that
 * the salesperson probes until it turns out to be price is common in the room
 * and rare in any given sample of twelve. This makes those cases testable
 * without waiting for one to occur.
 *
 * Internal, so it is a bench tool and not an endpoint anything can call.
 */
export const previewExtractionText = internalAction({
  args: { transcript: v.string() },
  handler: async (_ctx, args): Promise<any> => {
    const result = await runCallExtraction({ transcript: args.transcript });
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, attempts: result.attempts, extracted: result.data };
  },
});

/**
 * Read a call without storing anything.
 *
 * The whole point is being able to judge extraction against real transcripts
 * before it writes a number that decides whether a customer gets chased for
 * money. Ignores the team switch deliberately, so a team can be assessed before
 * it's turned on.
 */
export const previewExtraction = internalAction({
  args: { callId: v.id("calls") },
  handler: async (ctx, args): Promise<any> => {
    const info = await ctx.runQuery(
      internal.callExtractionRun.getExtractionContext,
      { callId: args.callId },
    );
    if (!info) return { ok: false, reason: "call not found" };

    const transcript = (info.transcript ?? "").trim();
    if (transcript.length < MIN_TRANSCRIPT_CHARS) {
      return {
        ok: false,
        reason: `transcript is ${transcript.length} chars — too short`,
        existing: info.existing,
      };
    }

    const result = await runCallExtraction({ transcript });
    if (!result.ok) return { ok: false, reason: result.reason };

    return {
      ok: true,
      attempts: result.attempts,
      transcriptChars: transcript.length,
      extracted: result.data,
      // So a dry run can be read as "what would change", not just "what it said".
      existing: info.existing,
      classifiedAs: info.classifiedAs,
    };
  },
});
