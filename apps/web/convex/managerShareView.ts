import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { constantTimeEqual, hashSharePassword } from "./lib/shareSecurity";

// ============================================================================
// The recipient's side of a manager share link.
//
// Public and unauthenticated by design — whoever holds the link can view it.
// Split from managerMeetingClips.ts because the rules are the opposite: that
// file refuses everything that isn't the owner, this one deliberately serves
// strangers, and mixing the two is how a share query quietly becomes a way to
// read any meeting by id.
//
// Everything here is scoped by TOKEN, never by an id the caller supplies.
// ============================================================================

type ShareDenial = "not_found" | "revoked" | "expired" | "password_required";

/**
 * What a link resolves to, before any content is handed over.
 *
 * Deliberately says nothing about the meeting until the gate is passed — not
 * the title, not the rep's name. A one-to-one's title is often "1:1 — Nick",
 * which on a password-protected link would leak the very thing the password
 * exists to protect.
 */
export const resolveShare = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("managerMeetingShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!share) return { ok: false as const, reason: "not_found" as ShareDenial };
    if (share.revokedAt) return { ok: false as const, reason: "revoked" as ShareDenial };
    if (share.expiresAt && share.expiresAt < Date.now()) {
      return { ok: false as const, reason: "expired" as ShareDenial };
    }
    if (share.passwordHash) {
      return { ok: false as const, reason: "password_required" as ShareDenial };
    }

    return await buildPayload(ctx, share);
  },
});

/**
 * Same thing, for a link that has a password.
 *
 * A mutation rather than a query so the attempt can be counted — a query
 * can't write, and a password gate nobody can observe being hammered isn't
 * much of a gate.
 */
export const resolveShareWithPassword = mutation({
  args: { token: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("managerMeetingShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!share) return { ok: false as const, reason: "not_found" as ShareDenial };
    if (share.revokedAt) return { ok: false as const, reason: "revoked" as ShareDenial };
    if (share.expiresAt && share.expiresAt < Date.now()) {
      return { ok: false as const, reason: "expired" as ShareDenial };
    }

    if (share.passwordHash) {
      const attempt = await hashSharePassword(args.password);
      if (!constantTimeEqual(share.passwordHash, attempt)) {
        return { ok: false as const, reason: "password_required" as ShareDenial };
      }
    }

    // Counted here rather than in the query, because this is the point at
    // which someone actually saw it.
    await ctx.db.patch(share._id, {
      viewCount: share.viewCount + 1,
      lastViewedAt: Date.now(),
    });

    return await buildPayload(ctx, share);
  },
});

/** Count a view of a link that had no password to pass. */
export const recordShareView = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("managerMeetingShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!share || share.revokedAt) return { counted: false };
    if (share.expiresAt && share.expiresAt < Date.now()) return { counted: false };

    await ctx.db.patch(share._id, {
      viewCount: share.viewCount + 1,
      lastViewedAt: Date.now(),
    });
    return { counted: true };
  },
});

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The content behind the gate.
 *
 * A clip share hands over ONLY the clip — its range, its title, its words. Not
 * the meeting's summary, not its other clips, not the full transcript. A
 * manager cutting a two-minute coaching moment out of a one-to-one is sharing
 * two minutes, and the link must not quietly carry the other fifty-eight.
 */
async function buildPayload(ctx: any, share: any) {
  const meeting = await ctx.db.get(share.meetingId);
  if (!meeting) return { ok: false as const, reason: "not_found" as ShareDenial };

  if (share.clipId) {
    const clip = await ctx.db.get(share.clipId);
    if (!clip) return { ok: false as const, reason: "not_found" as ShareDenial };
    return {
      ok: true as const,
      kind: "clip" as const,
      title: clip.title,
      notes: clip.notes ?? null,
      recordingUrl: meeting.recordingUrl ?? null,
      startSeconds: clip.startSeconds,
      endSeconds: clip.endSeconds,
      transcriptText: clip.transcriptText ?? null,
      metAt: meeting.startedAt ?? meeting.createdAt,
    };
  }

  const segments = await ctx.db
    .query("managerMeetingTranscripts")
    .withIndex("by_meeting", (q: any) => q.eq("meetingId", share.meetingId))
    .collect();

  // A whole-meeting share is the full record on purpose — the summary and
  // what was agreed travel with it. (Clip shares above deliberately don't:
  // a clip is two minutes, not the meeting.)
  const analysis = await ctx.db
    .query("managerMeetingAnalysis")
    .withIndex("by_meeting", (q: any) => q.eq("meetingId", share.meetingId))
    .first();

  return {
    ok: true as const,
    kind: "meeting" as const,
    title: meeting.title,
    notes: null,
    recordingUrl: meeting.recordingUrl ?? null,
    startSeconds: null,
    endSeconds: null,
    duration: meeting.duration ?? null,
    metAt: meeting.startedAt ?? meeting.createdAt,
    analysis: analysis
      ? {
          summary: analysis.summary,
          topics: analysis.topics ?? [],
          agreements: (analysis.agreements ?? []).map((a: any) => ({
            who: a.who,
            what: a.what,
          })),
          actionItems: (analysis.actionItems ?? []).map((t: any) => ({
            who: t.who,
            what: t.what,
          })),
          talkingPoints: analysis.talkingPoints ?? [],
        }
      : null,
    transcript: segments
      .sort((a: any, b: any) => a.startSeconds - b.startSeconds)
      .map((s: any) => ({
        speaker: s.speaker,
        text: s.text,
        startSeconds: s.startSeconds,
      })),
  };
}
