// ============================================================================
// "Was this a sales call?"
//
// One rule, two doors. A closer can correct their own call; a manager can
// correct any call on their team. Both go through `applyClassification` so the
// two answers can never mean different things to the numbers.
//
// This exists because of auto-join. When a closer had to click Join & Record,
// every recorded call was one they meant to record. Bots joining the calendar
// by themselves record standups, one-to-ones and interviews too, and without a
// way to say so those land in the close-rate denominator and quietly make a
// team's numbers worse than their selling.
//
// Kicking the bot out is the other way to say no, and it was the only one that
// existed. It only works if someone remembers before the meeting starts.
// ============================================================================

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { syncCallStats } from "./callStats";

/**
 * Apply the answer. Assumes the caller has already earned the right to give it.
 *
 * Extracted from `fathom.reclassifyCall`, which had been the only path in and
 * therefore only ever ran for Fathom calls. Nothing in it was Fathom-specific.
 */
export async function applyClassification(
  ctx: MutationCtx,
  call: Doc<"calls">,
  isSalesCall: boolean,
  decidedBy: "closer" | "manager",
): Promise<{ success: boolean; error?: string }> {
  // Also checks the status agrees. Without that last clause a row whose status
  // had drifted from its classification would take this early exit and never be
  // repaired — the same drift that was letting a call marked internal go on
  // being counted.
  const alreadyRight =
    call.classifiedBy === decidedBy &&
    call.countsTowardStats === isSalesCall &&
    call.status === (isSalesCall ? "completed" : "unclassified");
  if (alreadyRight) return { success: true };

  await ctx.db.patch(call._id, {
    classifiedAs: isSalesCall ? "sales" : "internal",
    classifiedBy: decidedBy,
    countsTowardStats: isSalesCall,
    // The half that actually moves the numbers.
    status: isSalesCall ? "completed" : "unclassified",
  });

  // `status` is one of the fields the stats sidecar mirrors, and marking a call
  // internal changes it. Without this a call taken out of the numbers here
  // would go on counting in every screen that reads the sidecar.
  await syncCallStats(ctx, call._id);

  // Only on the way up, and only once — a call flipped back and forth must not
  // queue a fresh summary every time.
  if (isSalesCall && !call.countsTowardStats) {
    const content = await ctx.db
      .query("callContent")
      .withIndex("by_call", (q) => q.eq("callId", call._id))
      .first();
    if (content?.transcriptText) {
      await ctx.scheduler.runAfter(0, internal.ai.generateCallSummary, {
        callId: call._id,
        transcript: content.transcriptText,
        ...(call.prospectName ? { prospectName: call.prospectName } : {}),
      });
      await ctx.scheduler.runAfter(0, internal.ai.generateCallAnalysis, {
        callId: call._id,
        transcript: content.transcriptText,
        ...(call.prospectName ? { prospectName: call.prospectName } : {}),
        ...(call.duration !== undefined ? { duration: call.duration } : {}),
      });
    }
  }

  return { success: true };
}

/**
 * The manager's door, from the dashboard call page.
 *
 * A manager can correct any call on their own team — unlike a closer, who is
 * held to their own. Managers are the ones looking at the board when the
 * numbers seem wrong, and telling them to go and ask the closer to fix it is
 * how a correction never gets made.
 */
export const setCallSalesClassification = mutation({
  args: {
    clerkId: v.string(),
    callId: v.id("calls"),
    isSalesCall: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return { success: false, error: "Not authorised." };
    if (user.role !== "admin" && user.role !== "manager") {
      return { success: false, error: "Only managers can change this." };
    }

    const call = await ctx.db.get(args.callId);
    if (!call) return { success: false, error: "That call no longer exists." };
    // Scoped server-side from the caller's own identity — the client never
    // supplies a team, so a call id from another team is rejected rather than
    // silently actioned.
    if (String(call.teamId) !== String(user.teamId as Id<"teams">)) {
      return { success: false, error: "That call isn't on your team." };
    }

    return await applyClassification(ctx, call, args.isSalesCall, "manager");
  },
});
