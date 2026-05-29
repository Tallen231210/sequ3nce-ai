// Mutations + queries for the setterCallTranscripts table. Runs in
// Convex's V8 isolate (no "use node") so we can keep ai.ts's Node-runtime
// actions thin — they delegate every DB touch to mutations here.

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";

/**
 * Read a single transcript row by id. Used by the fetch + summarize
 * actions to load context before doing work.
 */
export const getTranscriptRow = internalQuery({
  args: { rowId: v.id("setterCallTranscripts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.rowId);
  },
});

/**
 * Insert a new pending transcript row for a freshly-discovered
 * dial/call event. Idempotent: if a row already exists for this
 * (teamId, ghlMessageId) we return its id without inserting again.
 *
 * Called by recordCallEvent in setterGhlWebhooks.ts right after the
 * setterLeadEvents insert.
 */
export const upsertPendingTranscript = internalMutation({
  args: {
    teamId: v.id("teams"),
    ghlContactId: v.string(),
    ghlMessageId: v.string(),
    direction: v.union(v.literal("outbound"), v.literal("inbound")),
    occurredAt: v.number(),
    durationSec: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("setterCallTranscripts")
      .withIndex("by_team_and_message", (q) =>
        q.eq("teamId", args.teamId).eq("ghlMessageId", args.ghlMessageId),
      )
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("setterCallTranscripts", {
      teamId: args.teamId,
      ghlContactId: args.ghlContactId,
      ghlMessageId: args.ghlMessageId,
      direction: args.direction,
      occurredAt: args.occurredAt,
      durationSec: args.durationSec,
      transcriptionStatus: "pending",
      fetchAttempts: 0,
    });
  },
});

/**
 * Persist a successful transcript fetch — raw JSON + computed
 * talk-time stats. Called from fetchAndProcessTranscript.
 */
export const markTranscriptAvailable = internalMutation({
  args: {
    rowId: v.id("setterCallTranscripts"),
    transcriptJson: v.string(),
    setterTalkTimeSec: v.optional(v.number()),
    prospectTalkTimeSec: v.optional(v.number()),
    setterSpeakerIndex: v.optional(v.union(v.literal(0), v.literal(1))),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rowId);
    if (!row) return;
    await ctx.db.patch(args.rowId, {
      transcriptionStatus: "available",
      transcriptJson: args.transcriptJson,
      setterTalkTimeSec: args.setterTalkTimeSec,
      prospectTalkTimeSec: args.prospectTalkTimeSec,
      setterSpeakerIndex: args.setterSpeakerIndex,
      fetchedAt: Date.now(),
      fetchAttempts: (row.fetchAttempts ?? 0) + 1,
      lastFetchError: undefined,
    });
  },
});

/**
 * Mark a row as not_available — GHL returned 400 "Transcription does
 * not exist", or the transcript came back empty. Never retried.
 */
export const markTranscriptNotAvailable = internalMutation({
  args: { rowId: v.id("setterCallTranscripts") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rowId);
    if (!row) return;
    await ctx.db.patch(args.rowId, {
      transcriptionStatus: "not_available",
      fetchedAt: Date.now(),
      fetchAttempts: (row.fetchAttempts ?? 0) + 1,
      lastFetchError: undefined,
    });
  },
});

/**
 * Mark a row as failed — transient upstream error. The reconcile cron
 * will retry by querying by_team_and_status until fetchAttempts hits
 * the cap.
 */
export const markTranscriptFailed = internalMutation({
  args: {
    rowId: v.id("setterCallTranscripts"),
    lastFetchError: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rowId);
    if (!row) return;
    await ctx.db.patch(args.rowId, {
      transcriptionStatus: "failed",
      fetchAttempts: (row.fetchAttempts ?? 0) + 1,
      lastFetchError: args.lastFetchError,
    });
  },
});

/**
 * Save the AI summary onto an available transcript row.
 */
export const markTranscriptSummary = internalMutation({
  args: {
    rowId: v.id("setterCallTranscripts"),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rowId);
    if (!row) return;
    await ctx.db.patch(args.rowId, {
      aiSummary: args.summary,
      aiSummaryAt: Date.now(),
    });
  },
});

/**
 * Find transcript rows that need a retry. Used by the reconcile cron
 * pass added to setterGhlSync.reconcileInstallation. Returns:
 *   - failed rows (retry the fetch)
 *   - available rows without an aiSummary that are >15min old (retry
 *     the summary — the action probably hit a transient Anthropic error)
 *
 * Bounded — caller schedules each, but we cap how many we return to
 * avoid a runaway retry storm on a long-broken install.
 */
export const listTranscriptsNeedingRetry = internalQuery({
  args: {
    teamId: v.id("teams"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const FIFTEEN_MIN_MS = 15 * 60 * 1000;
    const summaryGraceAt = Date.now() - FIFTEEN_MIN_MS;

    const failed = await ctx.db
      .query("setterCallTranscripts")
      .withIndex("by_team_and_status", (q) =>
        q.eq("teamId", args.teamId).eq("transcriptionStatus", "failed"),
      )
      .take(args.limit);

    const available = await ctx.db
      .query("setterCallTranscripts")
      .withIndex("by_team_and_status", (q) =>
        q.eq("teamId", args.teamId).eq("transcriptionStatus", "available"),
      )
      .take(args.limit * 2);

    const summaryRetries = available.filter(
      (r) => !r.aiSummary && (r.fetchedAt ?? 0) < summaryGraceAt,
    );

    return {
      fetchRetries: failed.map((r) => r._id),
      summaryRetries: summaryRetries.slice(0, args.limit).map((r) => r._id),
    };
  },
});

/**
 * Public query: given a transcript row id, return the full raw JSON
 * plus the speaker mapping. Backs the "Show full transcript" expand in
 * the UI. Returned separately from the list query so the activity
 * timeline payload stays small.
 */
export const getCallTranscript = query({
  args: { rowId: v.id("setterCallTranscripts") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rowId);
    if (!row) return null;
    return {
      transcriptJson: row.transcriptJson ?? null,
      setterSpeakerIndex: row.setterSpeakerIndex ?? null,
      direction: row.direction,
      durationSec: row.durationSec,
      aiSummary: row.aiSummary,
    };
  },
});
