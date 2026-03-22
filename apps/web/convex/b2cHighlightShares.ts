import { v } from "convex/values";
import { mutation, internalQuery } from "./_generated/server";

// ==================== Helpers ====================
// (Copied from sharedLinks.ts — these are unexported private helpers)

function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

async function hashSharePassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ==================== Mutations ====================

// Create a share link for a highlight clip
export const createShare = mutation({
  args: {
    clipId: v.id("b2cHighlightClips"),
    userId: v.id("b2cUsers"),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clip = await ctx.db.get(args.clipId);
    if (!clip) throw new Error("Clip not found");
    if (clip.userId !== args.userId) throw new Error("Not authorized");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const token = generateToken();
    const hasPassword = !!args.password;
    const passwordHash = args.password
      ? await hashSharePassword(args.password)
      : undefined;

    const shareId = await ctx.db.insert("b2cHighlightShares", {
      clipId: args.clipId,
      userId: args.userId,
      token,
      isActive: true,
      hasPassword,
      passwordHash,
      createdAt: Date.now(),
    });

    return { token, shareId };
  },
});

// Revoke a share link
export const revokeShare = mutation({
  args: {
    shareId: v.id("b2cHighlightShares"),
    userId: v.id("b2cUsers"),
  },
  handler: async (ctx, args) => {
    const share = await ctx.db.get(args.shareId);
    if (!share) throw new Error("Share not found");
    if (share.userId !== args.userId) throw new Error("Not authorized");

    await ctx.db.patch(args.shareId, { isActive: false });
    return { success: true };
  },
});

// ==================== Queries ====================

// Get active shares for a clip (for share modal)
export const getSharesByClip = internalQuery({
  args: { clipId: v.id("b2cHighlightClips") },
  handler: async (ctx, args) => {
    const shares = await ctx.db
      .query("b2cHighlightShares")
      .withIndex("by_clip", (q) => q.eq("clipId", args.clipId))
      .collect();

    return shares
      .filter((s) => s.isActive)
      .map((s) => ({
        _id: s._id,
        token: s.token,
        hasPassword: s.hasPassword,
        createdAt: s.createdAt,
        isActive: s.isActive,
      }));
  },
});

// Get share data by token (for public page)
export const getShareByToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("b2cHighlightShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!share || !share.isActive) return null;

    const clip = await ctx.db.get(share.clipId);
    if (!clip) return null;

    const user = await ctx.db.get(share.userId);
    if (!user) return null;

    // Get call for recording URL
    const call = await ctx.db.get(clip.callId);

    return {
      shareId: share._id,
      hasPassword: share.hasPassword,
      clipId: clip._id,
      label: clip.label,
      startTime: clip.startTime,
      endTime: clip.endTime,
      isFullCall: clip.isFullCall,
      blurRegion: clip.blurRegion,
      callId: clip.callId,
      recordingUrl: call?.recordingUrl ?? null,
      closerName: user.name,
      profileSlug: user.profileSlug ?? null,
    };
  },
});

// Verify password for a share
export const verifySharePassword = internalQuery({
  args: {
    token: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("b2cHighlightShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!share || !share.isActive || !share.passwordHash) {
      return { valid: false };
    }

    return { valid: constantTimeEqual(share.passwordHash, args.passwordHash) };
  },
});
