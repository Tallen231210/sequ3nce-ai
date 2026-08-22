import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// B2C post-call dispositions: what still needs the closer's confirmation.
//
// The B2B side stopped asking humans for forms entirely (its pending-count
// endpoint hard-returns 0 — a deliberate decision at http.ts:4917 that
// silently killed the Personal app's badge too). Personal KEEPS the form:
// the Money Bells leaderboard is fed exclusively by the form's success path,
// and a human-confirmed number is worth more than an extracted one. So B2C
// gets its own endpoints, and "pending" means: completed sales call, nothing
// human-confirmed yet — INCLUDING calls the AI already filled, because an
// AI-filled close that's never confirmed silently skips the leaderboard.
// ============================================================================

const PENDING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // don't nag about ancient history
const MIN_DURATION_SECONDS = 120; // sub-2-minute calls aren't sales calls to disposition

function isPending(call: any): boolean {
  if (call.status !== "completed") return false;
  if (call.classifiedAs === "internal") return false;
  if ((call.duration ?? 0) < MIN_DURATION_SECONDS) return false;
  // Human-confirmed = done (closer form, or a manager on the shared backend).
  // AI-filled or empty = still needs the closer.
  return call.outcomeSource !== "closer" && call.outcomeSource !== "manager";
}

/** Badge + list for the in-app form queue. */
export const getPendingDispositions = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - PENDING_WINDOW_MS;
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .order("desc")
      .take(200);

    const pending = calls.filter(
      (c: any) => (c.startedAt ?? c._creationTime) >= cutoff && isPending(c),
    );
    return {
      count: pending.length,
      calls: pending.slice(0, 25).map((c: any) => ({
        callId: c._id,
        prospectName: c.prospectName ?? null,
        startedAt: c.startedAt ?? c._creationTime,
        duration: c.duration ?? 0,
        aiFilled: c.outcomeSource === "ai",
      })),
    };
  },
});

/** Current disposition fields for one call — the form's prefill source. */
export const getCallDisposition = query({
  args: { callId: v.id("calls"), closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || String((call as any).closerId) !== String(args.closerId)) {
      return null; // not yours = not visible
    }
    const c = call as any;
    return {
      outcome: c.outcome ?? null,
      outcomeSource: c.outcomeSource ?? null,
      cashCollected: c.cashCollected ?? null,
      contractValue: c.contractValue ?? null,
      pitchedValue: c.pitchedValue ?? null,
      primaryObjection: c.primaryObjection ?? null,
      objections: c.objections ?? null,
      objectionsOvercome: c.objectionsOvercome ?? null,
      leadQualityScore: c.leadQualityScore ?? null,
      prospectWasDecisionMaker: c.prospectWasDecisionMaker ?? null,
      prospectName: c.prospectName ?? null,
      notes: c.notes ?? null,
    };
  },
});
