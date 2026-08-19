import { v, ConvexError } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { upsertCallContentTx } from "./callContent";

// ============================================================================
// Flip every Closer ↔ Prospect label on a call, because a human said so.
//
// Exists because the automation lost twice in one morning on calls where
// every available signal pointed the right way — a closer quick-botting her
// own meeting made her the host, the host-heuristic labelled the prospect as
// closer, and the verifier either 429'd (no retry) or blessed a partial
// transcript. The people ON the call know instantly which way is right; this
// gives them the one-click correction instead of a support thread.
//
// A human flip is FINAL for automation: it stamps the bot as verified so the
// post-call verifier never "corrects" it back.
// ============================================================================

/**
 * The core swap. Everything that encodes who-is-who moves together:
 * segments, the flat transcriptText copy, the talk-time split, and the pin.
 * Swapping one without the others recreates the stale-copy bug that took
 * months to find the first time.
 */
export async function applySpeakerSwapTx(
  ctx: MutationCtx,
  callId: Id<"calls">,
  flippedBy: string,
): Promise<{ segmentsFlipped: number }> {
  const call = await ctx.db.get(callId);
  if (!call) throw new ConvexError("That call no longer exists");

  const segments = await ctx.db
    .query("transcriptSegments")
    .withIndex("by_call_and_time", (q) => q.eq("callId", callId))
    .collect();
  if (segments.length === 0) {
    throw new ConvexError("This call has no transcript to flip");
  }

  for (const s of segments) {
    await ctx.db.patch(s._id, {
      speaker: s.speaker === "closer" ? "prospect" : "closer",
    });
  }

  // The flat copy is a SECOND copy of the transcript with its own labels.
  // Segments are the source of truth; rewrite the copy from them.
  const canonical = segments
    .map((s) => `${s.speaker === "closer" ? "Prospect" : "Closer"}: ${s.text}`)
    .join("\n");
  await upsertCallContentTx(ctx, {
    callId,
    teamId: call.teamId,
    transcriptText: canonical,
  });

  await ctx.db.patch(callId, {
    closerTalkTime: call.prospectTalkTime,
    prospectTalkTime: call.closerTalkTime,
    speakerLabelsFlippedAt: Date.now(),
    speakerLabelsFlippedBy: flippedBy,
  });

  // Automation stands down: the verifier's "already verified" guard now
  // protects the human's decision. Also move the pin to the other
  // participant where one was set, so anything reading it agrees.
  if (call.meetingBotId) {
    const bot = await ctx.db.get(call.meetingBotId);
    if (bot) {
      await ctx.db.patch(call.meetingBotId, {
        speakerVerifiedAt: Date.now(),
      });
    }
  }

  // The summary and analysis were written against the wrong labels —
  // "the closer never asked for the sale" reads very differently when the
  // closer was labelled prospect. Regenerate both from the corrected
  // transcript.
  await ctx.scheduler.runAfter(0, internal.ai.generateCallSummary, {
    callId,
    transcript: canonical,
    outcome: call.outcome,
    prospectName: call.prospectName,
  });
  await ctx.scheduler.runAfter(5000, internal.ai.generateCallAnalysis, {
    callId,
    transcript: canonical,
    outcome: call.outcome,
    prospectName: call.prospectName,
    duration: call.duration,
  });

  return { segmentsFlipped: segments.length };
}

/** Manager flip, from the web dashboard. */
export const swapSpeakerLabelsAsManager = mutation({
  args: { clerkId: v.string(), callId: v.id("calls") },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) throw new ConvexError("Not authorised");
    const call = await ctx.db.get(args.callId);
    if (!call || String(call.teamId) !== String(user.teamId)) {
      throw new ConvexError("Not your team's call");
    }
    return await applySpeakerSwapTx(ctx, args.callId, `manager:${user._id}`);
  },
});

/** Closer flip, via the closer web app's HTTP layer. */
export const swapSpeakerLabelsAsCloser = internalMutation({
  args: { closerId: v.id("closers"), callId: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || String(call.closerId) !== String(args.closerId)) {
      throw new ConvexError("Not your call");
    }
    return await applySpeakerSwapTx(ctx, args.callId, `closer:${args.closerId}`);
  },
});

/** One-off repair path for support — same swap, no auth party. */
export const swapSpeakerLabelsInternal = internalMutation({
  args: { callId: v.id("calls"), reason: v.string() },
  handler: async (ctx, args) =>
    await applySpeakerSwapTx(ctx, args.callId, `internal:${args.reason}`),
});
