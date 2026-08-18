import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import {
  generateShareToken,
  hashSharePassword,
  constantTimeEqual,
} from "./lib/shareSecurity";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Cutting a training out of a manager's meeting, and sharing it.
//
// Nothing here touches `highlights` or `sharedLinks`. Those are reached by the
// public share page, compliance links and B2C shares, and teaching all of them
// that a "call" might be a manager meeting risks a customer-facing page to
// save a table.
// ============================================================================

/** Long enough to be worth watching, short enough to be a clip. */
const MIN_CLIP_SECONDS = 3;
const MAX_CLIP_SECONDS = 20 * 60;

async function ownMeeting(ctx: any, clerkId: string, meetingId: Id<"managerMeetings">) {
  const user = await resolveAuthUser(ctx, clerkId);
  if (!user) throw new ConvexError("Not authorised");
  const meeting = await ctx.db.get(meetingId);
  if (!meeting) throw new ConvexError("That meeting no longer exists");
  // Scoped to the owner. A manager cannot clip another manager's one-to-one.
  if (String(meeting.userId) !== String(user._id)) {
    throw new ConvexError("Not your meeting");
  }
  return { user, meeting };
}

export const createClip = mutation({
  args: {
    clerkId: v.string(),
    meetingId: v.id("managerMeetings"),
    title: v.string(),
    notes: v.optional(v.string()),
    startSeconds: v.number(),
    endSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const { user, meeting } = await ownMeeting(ctx, args.clerkId, args.meetingId);

    const title = args.title.trim();
    if (!title) throw new ConvexError("Give the clip a title");
    if (title.length > 200) throw new ConvexError("That title is too long");

    const len = args.endSeconds - args.startSeconds;
    if (len < MIN_CLIP_SECONDS) throw new ConvexError("That clip is too short");
    if (len > MAX_CLIP_SECONDS) throw new ConvexError("That clip is too long");
    if (args.startSeconds < 0) throw new ConvexError("Clip starts before the meeting");

    // Capture the words at cut time. A clip that reads on its own survives the
    // recording expiring, and it's what makes a training list skimmable.
    const segments = await ctx.db
      .query("managerMeetingTranscripts")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .collect();
    const inRange = segments
      .filter((s) => s.startSeconds >= args.startSeconds && s.startSeconds <= args.endSeconds)
      .sort((a, b) => a.startSeconds - b.startSeconds)
      .map((s) => `${s.speaker}: ${s.text}`)
      .join("\n");

    const clipId = await ctx.db.insert("managerMeetingClips", {
      meetingId: args.meetingId,
      userId: user._id,
      teamId: meeting.teamId,
      title,
      notes: args.notes?.trim() || undefined,
      startSeconds: args.startSeconds,
      endSeconds: args.endSeconds,
      transcriptText: inRange || undefined,
      createdAt: Date.now(),
    });
    return { clipId };
  },
});

export const listClipsForMeeting = query({
  args: { clerkId: v.string(), meetingId: v.id("managerMeetings") },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return [];
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting || String(meeting.userId) !== String(user._id)) return [];

    const clips = await ctx.db
      .query("managerMeetingClips")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .collect();

    return clips.map((c) => ({
      _id: c._id,
      title: c.title,
      notes: c.notes ?? null,
      startSeconds: c.startSeconds,
      endSeconds: c.endSeconds,
      transcriptText: c.transcriptText ?? null,
      inPlaylist: !!c.playlistId,
    }));
  },
});

/**
 * Every clip this manager has cut, newest first, with its links.
 *
 * The Clips tab answers "what have I actually made, and who did I send it to" —
 * which needs the share links alongside, not a separate lookup per clip.
 */
export const listAllClips = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return [];

    const clips = await ctx.db
      .query("managerMeetingClips")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(200);

    const out = [];
    for (const c of clips) {
      const meeting = await ctx.db.get(c.meetingId);
      const shares = await ctx.db
        .query("managerMeetingShares")
        .withIndex("by_meeting", (q) => q.eq("meetingId", c.meetingId))
        .collect();

      out.push({
        _id: c._id,
        meetingId: c.meetingId,
        title: c.title,
        notes: c.notes ?? null,
        startSeconds: c.startSeconds,
        endSeconds: c.endSeconds,
        transcriptText: c.transcriptText ?? null,
        createdAt: c.createdAt,
        meetingTitle: meeting?.title ?? "Meeting",
        links: shares
          .filter((s) => !s.revokedAt && String(s.clipId) === String(c._id))
          .map((s) => ({
            _id: s._id,
            token: s.token,
            hasPassword: !!s.passwordHash,
            expiresAt: s.expiresAt ?? null,
            viewCount: s.viewCount,
          })),
      });
    }
    return out;
  },
});

export const deleteClip = mutation({
  args: { clerkId: v.string(), clipId: v.id("managerMeetingClips") },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    const clip = await ctx.db.get(args.clipId);
    if (!clip) return { deleted: false };
    if (String(clip.userId) !== String(user._id)) {
      throw new ConvexError("Not your clip");
    }

    // Any share pointing at this clip dies with it, or the link keeps working
    // against something that no longer exists.
    const shares = await ctx.db
      .query("managerMeetingShares")
      .withIndex("by_meeting", (q) => q.eq("meetingId", clip.meetingId))
      .collect();
    for (const s of shares) {
      if (s.clipId && String(s.clipId) === String(args.clipId)) {
        await ctx.db.patch(s._id, { revokedAt: Date.now() });
      }
    }

    await ctx.db.delete(args.clipId);
    return { deleted: true };
  },
});

/** Days a link lives unless told otherwise. */
const DEFAULT_EXPIRY_DAYS = 30;

export const createShare = mutation({
  args: {
    clerkId: v.string(),
    meetingId: v.id("managerMeetings"),
    clipId: v.optional(v.id("managerMeetingClips")),
    /** Plain text. Hashed here — the client never decides what gets stored. */
    password: v.optional(v.string()),
    expiryDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user, meeting } = await ownMeeting(ctx, args.clerkId, args.meetingId);

    if (args.expiryDays !== undefined) {
      if (!Number.isFinite(args.expiryDays) || args.expiryDays < 0 || args.expiryDays > 365) {
        throw new ConvexError("Expiry must be between 0 and 365 days");
      }
    }
    const days = args.expiryDays ?? DEFAULT_EXPIRY_DAYS;

    const password = args.password?.trim();
    if (password !== undefined && password.length > 0 && password.length < 4) {
      throw new ConvexError("Use at least 4 characters");
    }
    const passwordHash = password ? await hashSharePassword(password) : undefined;

    const token = generateShareToken();
    await ctx.db.insert("managerMeetingShares", {
      token,
      meetingId: args.meetingId,
      clipId: args.clipId,
      userId: user._id,
      teamId: meeting.teamId,
      passwordHash,
      // 0 days means no expiry — allowed, but never the default. A link to a
      // conversation about someone's performance shouldn't outlive the reason
      // it was sent.
      expiresAt: days === 0 ? undefined : Date.now() + days * 86_400_000,
      viewCount: 0,
      createdAt: Date.now(),
    });
    return { token };
  },
});

export const listShares = query({
  args: { clerkId: v.string(), meetingId: v.id("managerMeetings") },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return [];
    const meeting = await ctx.db.get(args.meetingId);
    if (!meeting || String(meeting.userId) !== String(user._id)) return [];

    const shares = await ctx.db
      .query("managerMeetingShares")
      .withIndex("by_meeting", (q) => q.eq("meetingId", args.meetingId))
      .collect();

    return shares
      .filter((s) => !s.revokedAt)
      .map((s) => ({
        _id: s._id,
        token: s.token,
        clipId: s.clipId ?? null,
        hasPassword: !!s.passwordHash,
        expiresAt: s.expiresAt ?? null,
        // Whether anyone opened it. Worth knowing before assuming they did.
        viewCount: s.viewCount,
        lastViewedAt: s.lastViewedAt ?? null,
      }));
  },
});

export const revokeShare = mutation({
  args: { clerkId: v.string(), shareId: v.id("managerMeetingShares") },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    const share = await ctx.db.get(args.shareId);
    if (!share) return { revoked: false };
    if (String(share.userId) !== String(user._id)) {
      throw new ConvexError("Not your link");
    }
    await ctx.db.patch(args.shareId, { revokedAt: Date.now() });
    return { revoked: true };
  },
});
