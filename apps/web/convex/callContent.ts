// ============================================================================
// callContent — heavy-blob sibling table for the calls table.
//
// Holds the four large fields (transcriptText, summary, callAnalysis,
// ammoAnalysis) that used to live on calls. Splitting them off drops a
// calls row from ~97 KB to ~100 bytes, permanently fixing the 16 MiB
// per-query read limit for every team-wide scan. See the calls table
// comment in schema.ts and the plan in /Users/tylerallen/.claude/plans/
// for the full migration context.
//
// Read-path: callContent rows are fetched by callId via the by_call
// index whenever a single-call detail view (transcript, AI analysis,
// ammo polling) is rendered. Single-row reads are unconstrained by
// the 16 MiB scan limit.
//
// Write-path: every blob write in the codebase flows through
// upsertCallContent, which preserves the "don't shorten transcript"
// defensive guard from the old updateWebhookWithFallback path.
//
// Migration: the backfill action below walks every calls row, copies
// any populated blob fields into a callContent row, then patches the
// original calls row to set those fields to undefined. The patch is
// what actually frees the bytes on the calls row — removing a field
// from the schema alone wouldn't.
// ============================================================================

import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

interface ContentFields {
  transcriptText?: string;
  summary?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callAnalysis?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ammoAnalysis?: any;
}

/**
 * Plain TS helper — call from inside any mutation handler that needs
 * to write blob fields. Runs in the caller's transaction (no
 * round-trip). Preserves the "don't shorten transcript" defensive
 * guard from the old updateWebhookWithFallback path: if the incoming
 * transcriptText is shorter than what's already stored, the field is
 * dropped from the patch so the longer existing value wins.
 *
 * Idempotent: looks up by callId, patches if exists, inserts otherwise.
 */
export async function upsertCallContentTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  args: {
    callId: Id<"calls">;
    teamId: Id<"teams">;
    transcriptText?: string;
    summary?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callAnalysis?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ammoAnalysis?: any;
  },
): Promise<void> {
  const fields: ContentFields = {};
  if (args.transcriptText !== undefined) fields.transcriptText = args.transcriptText;
  if (args.summary !== undefined) fields.summary = args.summary;
  if (args.callAnalysis !== undefined) fields.callAnalysis = args.callAnalysis;
  if (args.ammoAnalysis !== undefined) fields.ammoAnalysis = args.ammoAnalysis;

  const existing = await ctx.db
    .query("callContent")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_call", (q: any) => q.eq("callId", args.callId))
    .first();

  if (existing) {
    if (
      fields.transcriptText !== undefined &&
      existing.transcriptText !== undefined &&
      fields.transcriptText.length < existing.transcriptText.length
    ) {
      delete fields.transcriptText;
    }
    await ctx.db.patch(existing._id, fields);
  } else {
    await ctx.db.insert("callContent", {
      callId: args.callId,
      teamId: args.teamId,
      ...fields,
    });
  }
}

/**
 * Plain TS helper — fetch the callContent row for a single call.
 * Returns null if none exists. Used by detail-page reads + the
 * commit-1 fallback path.
 */
export async function getContentForCallTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  callId: Id<"calls">,
): Promise<Doc<"callContent"> | null> {
  return await ctx.db
    .query("callContent")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_call", (q: any) => q.eq("callId", callId))
    .first();
}

/**
 * Convex internalMutation wrapper around upsertCallContentTx. Exposed
 * for callers that need to invoke via ctx.runMutation from an action
 * (e.g., the AI analysis action chain that writes from outside a
 * mutation context).
 */
export const upsertCallContent = internalMutation({
  args: {
    callId: v.id("calls"),
    teamId: v.id("teams"),
    transcriptText: v.optional(v.string()),
    summary: v.optional(v.string()),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callAnalysis: v.optional(v.any()),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ammoAnalysis: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<void> => {
    await upsertCallContentTx(ctx, args);
  },
});

/**
 * Get blob fields for a single call. Used by detail-page reads + the
 * commit-1 fallback path on the calls table.
 *
 * Returns null when no callContent row exists for the call (either
 * the call hasn't been backfilled yet, or it never had blob data —
 * e.g., a still-in-progress call). Callers fall back to the old
 * calls-row fields during the migration transition.
 */
export const getContentForCall = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args): Promise<Doc<"callContent"> | null> => {
    return await ctx.db
      .query("callContent")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_call", (q: any) => q.eq("callId", args.callId))
      .first();
  },
});

// Backfill code (chunked per-team migration of the four heavy fields)
// is preserved here behind escape-hatch type casts so it compiles
// against the trimmed calls schema. The fields it references are
// removed in commit 2; the casts let the helper keep working when
// run against rows that still carry the legacy data. After the final
// purge run, this code is dead and can be deleted in a follow-up.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CallWithLegacy = Doc<"calls"> & { transcriptText?: any; summary?: any; callAnalysis?: any; ammoAnalysis?: any };
export const backfillChunk = internalMutation({
  args: {
    teamId: v.id("teams"),
    beforeCreationTime: v.optional(v.number()),
    pageSize: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ processed: number; migrated: number; nextCursor: number | null }> => {
    const q = ctx.db
      .query("calls")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date", (q: any) => {
        const eq = q.eq("teamId", args.teamId);
        return args.beforeCreationTime
          ? eq.lt("createdAt", args.beforeCreationTime)
          : eq;
      })
      .order("desc");

    const page = (await q.take(args.pageSize)) as CallWithLegacy[];
    if (page.length === 0) return { processed: 0, migrated: 0, nextCursor: null };

    let migrated = 0;
    for (const call of page) {
      const hasAnyBlob =
        call.transcriptText !== undefined ||
        call.summary !== undefined ||
        call.callAnalysis !== undefined ||
        call.ammoAnalysis !== undefined;
      if (!hasAnyBlob) continue;

      const existing = await ctx.db
        .query("callContent")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_call", (q: any) => q.eq("callId", call._id))
        .first();

      const fields: ContentFields = {};
      if (call.transcriptText !== undefined) fields.transcriptText = call.transcriptText;
      if (call.summary !== undefined) fields.summary = call.summary;
      if (call.callAnalysis !== undefined) fields.callAnalysis = call.callAnalysis;
      if (call.ammoAnalysis !== undefined) fields.ammoAnalysis = call.ammoAnalysis;

      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("callContent", {
          callId: call._id,
          teamId: call.teamId,
          ...fields,
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ctx.db.patch(call._id, {
        transcriptText: undefined,
        summary: undefined,
        callAnalysis: undefined,
        ammoAnalysis: undefined,
      } as any);
      migrated += 1;
    }

    const oldest = page[page.length - 1];
    return { processed: page.length, migrated, nextCursor: oldest.createdAt };
  },
});

export const backfillTeamCallContent = internalAction({
  args: {
    teamId: v.id("teams"),
    pageSize: v.optional(v.number()),
    maxRows: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ teamId: string; processed: number; migrated: number; pages: number }> => {
    const pageSize = args.pageSize ?? 100;
    const maxRows = args.maxRows ?? 1_000_000;
    let cursor: number | null = null;
    let processed = 0;
    let migrated = 0;
    let pages = 0;
    while (processed < maxRows) {
      const result = (await ctx.runMutation(
        internal.callContent.backfillChunk,
        {
          teamId: args.teamId,
          beforeCreationTime: cursor ?? undefined,
          pageSize,
        },
      )) as { processed: number; migrated: number; nextCursor: number | null };
      pages += 1;
      processed += result.processed;
      migrated += result.migrated;
      if (result.nextCursor === null || result.processed < pageSize) break;
      cursor = result.nextCursor;
    }
    return { teamId: String(args.teamId), processed, migrated, pages };
  },
});

export const listTeamIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"teams">>> => {
    const all = await ctx.db.query("teams").collect();
    return all.map((t) => t._id);
  },
});

export const backfillAllTeamsCallContent = internalAction({
  args: { pageSize: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ teamsProcessed: number; totalMigrated: number }> => {
    const teams = (await ctx.runQuery(
      internal.callContent.listTeamIds,
      {},
    )) as Array<Id<"teams">>;
    let totalMigrated = 0;
    for (const teamId of teams) {
      const r = (await ctx.runAction(
        internal.callContent.backfillTeamCallContent,
        { teamId, pageSize: args.pageSize },
      )) as { migrated: number };
      totalMigrated += r.migrated;
    }
    return { teamsProcessed: teams.length, totalMigrated };
  },
});

export const countUnmigratedCalls = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ scanned: number; remaining: number }> => {
    const sample = (await ctx.db
      .query("calls")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .take(500)) as CallWithLegacy[];
    let remaining = 0;
    for (const c of sample) {
      if (
        c.transcriptText !== undefined ||
        c.summary !== undefined ||
        c.callAnalysis !== undefined ||
        c.ammoAnalysis !== undefined
      ) {
        remaining += 1;
      }
    }
    return { scanned: sample.length, remaining };
  },
});
