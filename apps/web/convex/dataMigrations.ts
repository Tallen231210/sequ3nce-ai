// One-off data fixes. NOT for general use — these mutations are written for a
// specific incident and run once via `npx convex run`. Each mutation should be
// dated and scoped narrowly to the records it touches.

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// 2026-05-01 — Merge fragmented Joey Demo call. The audio-processor created 3
// separate calls rows for one logical Recall meeting because of WebSocket
// disconnect/reconnect during the call. This mutation reassigns transcript
// segments and shareLinks from fragments 2 and 3 onto fragment 1, recomputes
// duration + talk-time from the unified segment set, optionally copies the
// full-meeting recording URL from a fragment, and marks the leftover fragments
// as "merged" so they're excluded from normal call queries.
//
// Idempotent: re-running on already-merged fragments is a no-op (segments and
// shareLinks already point at the primary, so the loops do nothing). Safe to
// retry. Run via:
//   npx convex run --prod dataMigrations:mergeFragmentedCall \
//     '{"primaryCallId":"<id1>","fragmentCallIds":["<id2>","<id3>"],"fullRecordingUrl":"<url>"}'
export const mergeFragmentedCall = internalMutation({
  args: {
    primaryCallId: v.id("calls"),
    fragmentCallIds: v.array(v.id("calls")),
    fullRecordingUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let movedSegments = 0;
    let movedShareLinks = 0;

    // 1. Reassign transcript segments from fragments → primary.
    for (const fragId of args.fragmentCallIds) {
      const segs = await ctx.db
        .query("transcriptSegments")
        .withIndex("by_call", (q) => q.eq("callId", fragId))
        .collect();
      for (const seg of segs) {
        await ctx.db.patch(seg._id, { callId: args.primaryCallId });
        movedSegments++;
      }
    }

    // 2. Reassign sharedLinks rows from fragments → primary so existing share
    //    links keep working (they'll now resolve to the merged transcript).
    for (const fragId of args.fragmentCallIds) {
      const links = await ctx.db
        .query("sharedLinks")
        .filter((q) => q.eq(q.field("callId"), fragId))
        .collect();
      for (const link of links) {
        await ctx.db.patch(link._id, { callId: args.primaryCallId });
        movedShareLinks++;
      }
    }

    // 3. Recompute duration + talk-time from the unified segment set.
    const allSegs = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_call", (q) => q.eq("callId", args.primaryCallId))
      .collect();
    let closerChars = 0;
    let prospectChars = 0;
    let maxTimestamp = 0;
    for (const s of allSegs) {
      if (s.speaker === "closer") closerChars += s.text.length;
      else prospectChars += s.text.length;
      if (s.timestamp > maxTimestamp) maxTimestamp = s.timestamp;
    }
    // 12.5 chars/sec is the same heuristic used by retrySummaryGeneration.
    const closerTalkTime = Math.round(closerChars / 12.5);
    const prospectTalkTime = Math.round(prospectChars / 12.5);

    // 4. Patch primary call with merged metadata.
    const patch: Record<string, unknown> = {
      duration: Math.round(maxTimestamp),
      closerTalkTime,
      prospectTalkTime,
    };
    if (args.fullRecordingUrl) {
      patch.recordingUrl = args.fullRecordingUrl;
    }
    await ctx.db.patch(args.primaryCallId, patch);

    // 5. Re-point any meetingBots row whose callId is a fragment onto the
    //    primary so refreshRecordingUrl (and any future on-demand refresh)
    //    targets the merged call.
    let movedBots = 0;
    for (const fragId of args.fragmentCallIds) {
      const fragBots = await ctx.db
        .query("meetingBots")
        .filter((q) => q.eq(q.field("callId"), fragId))
        .collect();
      for (const bot of fragBots) {
        await ctx.db.patch(bot._id, { callId: args.primaryCallId });
        movedBots++;
      }
    }

    // 6. Mark fragments as merged. Status "merged" excludes them from normal
    //    call queries (which filter for status in {scheduled, on_call, completed}).
    //    Notes preserves the audit trail.
    const mergeStamp = `[Merged into ${args.primaryCallId} on ${new Date().toISOString()}]`;
    for (const fragId of args.fragmentCallIds) {
      const frag = await ctx.db.get(fragId);
      if (!frag) continue;
      await ctx.db.patch(fragId, {
        status: "merged",
        notes: ((frag as { notes?: string }).notes || "") + "\n" + mergeStamp,
      });
    }

    return {
      movedSegments,
      movedShareLinks,
      movedBots,
      totalSegmentsAfter: allSegs.length,
      closerTalkTime,
      prospectTalkTime,
      duration: Math.round(maxTimestamp),
    };
  },
});
