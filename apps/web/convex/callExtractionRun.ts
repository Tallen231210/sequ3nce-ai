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
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
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
    const team = await ctx.db.get(call.teamId);

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
      enabled: team?.aiExtractionEnabled === true,
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
 * Turn extraction on or off for one team.
 *
 * Per team and off by default, because switching it on makes Collections report
 * MORE outstanding balances. That's the point — and also the way this could
 * chase a customer for money they already paid, so it gets proved on one team
 * at a time rather than everywhere at once.
 */
export const setAiExtraction = internalMutation({
  args: { teamId: v.id("teams"), enabled: v.boolean() },
  handler: async (ctx, args): Promise<{ ok: boolean; team?: string }> => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return { ok: false };
    await ctx.db.patch(args.teamId, { aiExtractionEnabled: args.enabled });
    return { ok: true, team: team.name };
  },
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
  args: { callId: v.id("calls"), data: v.any() },
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

    patch.outcomeSource = "ai";
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
    if (!info.enabled) return { ok: false, reason: "extraction is off for this team" };
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

    return { ok: true, written: saved.written, data: result.data };
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
