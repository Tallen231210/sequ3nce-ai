// ============================================================================
// callStats sidecar maintenance.
//
// Keeps `callStats` in sync with `calls` for the small subset of fields
// dashboard stats queries actually need. Lets getTeamStats / getCloserStats
// scan thousands of rows without paying the ~97 KB-per-call transcript-blob
// cost. See schema.ts for the table definition.
//
// Three entry points:
//   - upsertCallStats: call from any calls insert/patch that touches stat fields
//   - removeCallStats: call from calls delete
//   - backfillTeamCallStats (action): one-shot to populate historical rows
// ============================================================================

import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

interface StatFields {
  teamId: Id<"teams">;
  closerId: string;
  createdAt: number;
  status: string;
  outcome?: string;
  dealValue?: number;
  contractValue?: number;
  cashCollected?: number;
  duration?: number;
}

function extractStatFields(call: Doc<"calls">): StatFields {
  return {
    teamId: call.teamId,
    closerId: call.closerId,
    createdAt: call.createdAt,
    status: call.status,
    outcome: call.outcome,
    dealValue: call.dealValue,
    contractValue: call.contractValue,
    cashCollected: call.cashCollected,
    duration: call.duration,
  };
}

/**
 * Bring one call's sidecar row in line with the call.
 *
 * A PLAIN FUNCTION, so a mutation that just changed a call can call it inside
 * the same transaction. The row and the call it describes then cannot disagree,
 * even for a moment.
 *
 * This has to be called from every mutation that writes a field in
 * `extractStatFields`. The reconcile cron was supposed to make that
 * unnecessary — "drift-free without hooking every individual calls mutation
 * site", as its comment puts it — but it re-syncs calls by CREATION time, and
 * the fields that matter most arrive long after a call is created. A closer
 * fills in the post-call form hours later, or a manager corrects a figure next
 * week; by then the call is outside the window and its sidecar is frozen
 * forever.
 *
 * Found because a call closed at 2,000 of 6,800 never appeared in Collections:
 * the call had the money on it, its sidecar had nulls, and Collections reads
 * the sidecar.
 */
export async function syncCallStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  callId: Id<"calls">,
): Promise<void> {
  const call = await ctx.db.get(callId);
  if (!call) return;
  const fields = extractStatFields(call);
  const existing = await ctx.db
    .query("callStats")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_call", (q: any) => q.eq("callId", callId))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, fields);
  } else {
    await ctx.db.insert("callStats", { callId, ...fields });
  }
}

/** Idempotent upsert, for callers that need it as a mutation. */
export const upsertCallStats = internalMutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, args): Promise<void> => {
    await syncCallStats(ctx, args.callId);
  },
});

/**
 * Called from `calls` delete. Removes the sidecar row.
 */
export const removeCallStats = internalMutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("callStats")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_call", (q: any) => q.eq("callId", args.callId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/**
 * Backfill chunk: scans a slice of the calls table for one team and
 * upserts callStats for each. Bounded read so we never hit the 16 MiB
 * limit during backfill itself.
 *
 * Returns { processed, nextCursor } so the action can iterate without
 * losing its place. Uses _creationTime as the cursor since calls table
 * doesn't have an index we can paginate cheaply otherwise.
 */
export const backfillChunk = internalMutation({
  args: {
    teamId: v.id("teams"),
    beforeCreationTime: v.optional(v.number()),
    pageSize: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ processed: number; nextCursor: number | null }> => {
    // Order by createdAt descending via the by_team_and_date index, then
    // keep walking backward via the cursor. Smaller-than-cursor ensures
    // each chunk is disjoint from the prior chunk.
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

    const page = await q.take(args.pageSize);
    if (page.length === 0) {
      return { processed: 0, nextCursor: null };
    }

    let processed = 0;
    for (const call of page) {
      const fields = extractStatFields(call);
      const existing = await ctx.db
        .query("callStats")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_call", (q: any) => q.eq("callId", call._id))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("callStats", { callId: call._id, ...fields });
      }
      processed++;
    }

    const oldest = page[page.length - 1];
    return { processed, nextCursor: oldest.createdAt };
  },
});

/**
 * One-shot backfill for a single team. Walks the team's calls table
 * backward via createdAt, populating callStats in bounded chunks.
 *
 * pageSize is conservative — at ~97 KB/call, 150 rows ≈ 14.5 MiB,
 * which stays under the 16 MiB limit per mutation.
 */
export const backfillTeamCallStats = internalAction({
  args: {
    teamId: v.id("teams"),
    pageSize: v.optional(v.number()),
    maxRows: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ teamId: string; processed: number; pages: number }> => {
    const pageSize = args.pageSize ?? 150;
    const maxRows = args.maxRows ?? 1_000_000;
    let cursor: number | null = null;
    let processed = 0;
    let pages = 0;
    while (processed < maxRows) {
      const result = (await ctx.runMutation(
        internal.callStats.backfillChunk,
        {
          teamId: args.teamId,
          beforeCreationTime: cursor ?? undefined,
          pageSize,
        },
      )) as { processed: number; nextCursor: number | null };
      pages++;
      processed += result.processed;
      if (result.nextCursor === null || result.processed < pageSize) break;
      cursor = result.nextCursor;
    }
    return { teamId: String(args.teamId), processed, pages };
  },
});

/**
 * Backfill ALL teams. Iterates teams + calls backfillTeamCallStats for
 * each. Use sparingly — for one-time migration only.
 */
export const backfillAllTeamsCallStats = internalAction({
  args: { pageSize: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ teamsProcessed: number; totalRows: number }> => {
    const teams = (await ctx.runQuery(
      internal.callStats.listTeamIds,
      {},
    )) as Array<Id<"teams">>;
    let totalRows = 0;
    for (const teamId of teams) {
      const r = (await ctx.runAction(
        internal.callStats.backfillTeamCallStats,
        { teamId, pageSize: args.pageSize },
      )) as { processed: number };
      totalRows += r.processed;
    }
    return { teamsProcessed: teams.length, totalRows };
  },
});

export const listTeamIds = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"teams">>> => {
    const all = await ctx.db.query("teams").collect();
    return all.map((t) => t._id);
  },
});

/**
 * Periodic reconcile cron entrypoint. Re-syncs callStats for every call
 * created in the last `windowHours` for every team. Chunked at 100 rows
 * per mutation to stay under the 16 MiB read limit on high-volume teams.
 *
 * Runs every 5 minutes (see crons.ts) — keeps the dashboard stats within
 * 5 minutes of real-time without needing to hook every individual calls
 * mutation site (drift-prone). Covers inserts, patches (outcome set,
 * status changes), and field updates uniformly.
 */
export const reconcileRecentCallStats = internalAction({
  args: { windowHours: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ teamsScanned: number; rowsSynced: number }> => {
    const windowMs = (args.windowHours ?? 1) * 60 * 60 * 1000;
    const sinceCreatedAt = Date.now() - windowMs;
    const teams = (await ctx.runQuery(
      internal.callStats.listTeamIds,
      {},
    )) as Array<Id<"teams">>;
    let rowsSynced = 0;
    for (const teamId of teams) {
      let cursor: number | null = null;
      while (true) {
        const r = (await ctx.runMutation(
          internal.callStats.reconcileChunk,
          {
            teamId,
            sinceCreatedAt,
            beforeCreationTime: cursor ?? undefined,
            pageSize: 100,
          },
        )) as { processed: number; nextCursor: number | null };
        rowsSynced += r.processed;
        if (r.nextCursor === null || r.processed < 100) break;
        cursor = r.nextCursor;
      }
    }
    return { teamsScanned: teams.length, rowsSynced };
  },
});

/**
 * Reconcile chunk: scans calls created at >= sinceCreatedAt for one team,
 * walks backward through createdAt via cursor. Per-call upsert into
 * callStats. Bounded to 100 rows per call to stay under the read limit.
 */
export const reconcileChunk = internalMutation({
  args: {
    teamId: v.id("teams"),
    sinceCreatedAt: v.number(),
    beforeCreationTime: v.optional(v.number()),
    pageSize: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ processed: number; nextCursor: number | null }> => {
    const q = ctx.db
      .query("calls")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date", (q: any) => {
        let r = q.eq("teamId", args.teamId).gte("createdAt", args.sinceCreatedAt);
        if (args.beforeCreationTime !== undefined) {
          r = r.lt("createdAt", args.beforeCreationTime);
        }
        return r;
      })
      .order("desc");

    const page = await q.take(args.pageSize);
    if (page.length === 0) return { processed: 0, nextCursor: null };

    for (const call of page) {
      const fields = extractStatFields(call);
      const existing = await ctx.db
        .query("callStats")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_call", (q: any) => q.eq("callId", call._id))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert("callStats", { callId: call._id, ...fields });
      }
    }
    const oldest = page[page.length - 1];
    return { processed: page.length, nextCursor: oldest.createdAt };
  },
});
