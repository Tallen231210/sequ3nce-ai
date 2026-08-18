import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { constantTimeEqual, hashSharePassword } from "./lib/shareSecurity";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// A playable recording URL, fetched fresh.
//
// Recall hands back a PRESIGNED S3 URL that expires about six hours after the
// meeting. Storing it and serving it later means a link that works this
// afternoon and 403s tomorrow — a share with a 30-day expiry would be dead the
// same day. The closer share path already refreshes on every view for exactly
// this reason (`meetingBot.refreshRecordingUrl`); this is the manager
// equivalent, keyed by share token rather than by call.
//
// An action rather than a query because it has to call Recall, and Convex
// queries cannot reach the network.
// ============================================================================

const RECALL_BASE = "https://us-west-2.recall.ai/api/v1";

export const getShareForRefresh = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("managerMeetingShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!share) return null;
    return {
      meetingId: share.meetingId,
      passwordHash: share.passwordHash ?? null,
      revokedAt: share.revokedAt ?? null,
      expiresAt: share.expiresAt ?? null,
    };
  },
});

/**
 * Fresh URL for a share link.
 *
 * Re-checks the gate rather than trusting that the page already passed it.
 * The page is client code; anyone can call this action directly with a bare
 * token, so a revoked or expired link must be refused here too — otherwise
 * revocation only removes the button, not the access.
 */
export const getFreshRecordingUrlByToken = action({
  args: { token: v.string(), password: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ recordingUrl: string | null }> => {
    const share: any = await ctx.runQuery(
      internal.managerShareRecording.getShareForRefresh,
      { token: args.token },
    );
    if (!share) return { recordingUrl: null };
    if (share.revokedAt) return { recordingUrl: null };
    if (share.expiresAt && share.expiresAt < Date.now()) {
      return { recordingUrl: null };
    }
    if (share.passwordHash) {
      if (!args.password) return { recordingUrl: null };
      const attempt = await hashSharePassword(args.password);
      if (!constantTimeEqual(share.passwordHash, attempt)) {
        return { recordingUrl: null };
      }
    }

    return await refresh(ctx, share.meetingId);
  },
});

/** Same refresh, for the manager looking at their own meeting. */
export const getFreshRecordingUrl = action({
  args: { clerkId: v.string(), meetingId: v.id("managerMeetings") },
  handler: async (ctx, args): Promise<{ recordingUrl: string | null }> => {
    const owns: any = await ctx.runQuery(
      internal.managerShareRecording.ownsMeeting,
      { clerkId: args.clerkId, meetingId: args.meetingId },
    );
    if (!owns) return { recordingUrl: null };
    return await refresh(ctx, args.meetingId);
  },
});

export const ownsMeeting = internalQuery({
  args: { clerkId: v.string(), meetingId: v.id("managerMeetings") },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return false;
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting) return false;
    return String(meeting.userId) === String(user._id);
  },
});

async function refresh(ctx: any, meetingId: any): Promise<{ recordingUrl: string | null }> {
  const meeting = await ctx.runQuery(
    internal.managerMeetingTranscript.getMeetingWithBot,
    { meetingId },
  );
  if (!meeting?.recallBotId) return { recordingUrl: null };

  const res = await fetch(`${RECALL_BASE}/bot/${meeting.recallBotId}/`, {
    headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` },
  });
  if (!res.ok) {
    // A dead refresh must not take the page down with it — the transcript and
    // the clip's words are still worth reading without the video.
    console.error(
      `[managerShareRecording] Recall ${res.status} for bot ${meeting.recallBotId}`,
    );
    return { recordingUrl: null };
  }

  const data: any = await res.json();
  const url =
    data.recordings?.[0]?.media_shortcuts?.video_mixed?.data?.download_url ?? null;

  if (url) {
    await ctx.runMutation(internal.managerMeetingTranscript.saveRecordingUrl, {
      meetingId,
      recordingUrl: url,
    });
  }
  return { recordingUrl: url };
}
