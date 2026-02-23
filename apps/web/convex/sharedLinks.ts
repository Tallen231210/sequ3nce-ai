import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────

/** Generate a URL-safe random token (16 characters, base36). */
function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

// ──────────────────────────────────────────────
// MUTATIONS
// ──────────────────────────────────────────────

/**
 * Create a public share link for a call recording.
 * Returns the generated token and full URL.
 */
export const createSharedLink = mutation({
  args: {
    callId: v.id("calls"),
    teamId: v.id("teams"),
    shareType: v.string(), // "full" | "clip"
    startSeconds: v.optional(v.number()),
    endSeconds: v.optional(v.number()),
    includeComments: v.boolean(),
    createdBy: v.string(),
    createdByType: v.string(), // "manager" | "closer"
  },
  handler: async (ctx, args) => {
    // Validate call exists and has a recording
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");
    if (!call.recordingUrl) throw new Error("Call has no recording to share");
    if (call.teamId !== args.teamId)
      throw new Error("Call does not belong to this team");

    // Validate share type
    if (args.shareType !== "full" && args.shareType !== "clip") {
      throw new Error("Invalid share type (must be 'full' or 'clip')");
    }

    // Validate clip times
    if (args.shareType === "clip") {
      if (args.startSeconds == null || args.endSeconds == null) {
        throw new Error("Clip shares require start and end times");
      }
      if (args.startSeconds < 0) {
        throw new Error("Start time cannot be negative");
      }
      if (args.startSeconds >= args.endSeconds) {
        throw new Error("Start time must be before end time");
      }
    }

    const token = generateToken();

    await ctx.db.insert("sharedLinks", {
      callId: args.callId,
      teamId: args.teamId,
      token,
      shareType: args.shareType,
      startSeconds:
        args.shareType === "clip" ? args.startSeconds : undefined,
      endSeconds:
        args.shareType === "clip" ? args.endSeconds : undefined,
      includeComments: args.includeComments,
      createdBy: args.createdBy,
      createdByType: args.createdByType,
      isActive: true,
      createdAt: Date.now(),
    });

    const url = `https://sequ3nce.ai/share/${token}`;
    return { token, url };
  },
});

/**
 * Toggle a shared link's active status (revoke / reactivate).
 */
export const toggleSharedLink = mutation({
  args: {
    linkId: v.id("sharedLinks"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Shared link not found");
    await ctx.db.patch(args.linkId, { isActive: args.isActive });
  },
});

// ──────────────────────────────────────────────
// QUERIES
// ──────────────────────────────────────────────

/**
 * Get all shared links for a specific call (for the manage-links list in the share dialog).
 */
export const getSharedLinksForCall = query({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("sharedLinks")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .order("desc")
      .collect();

    return links.map((link) => ({
      _id: link._id,
      token: link.token,
      shareType: link.shareType,
      startSeconds: link.startSeconds,
      endSeconds: link.endSeconds,
      includeComments: link.includeComments,
      isActive: link.isActive,
      createdAt: link.createdAt,
      url: `https://sequ3nce.ai/share/${link.token}`,
    }));
  },
});

/**
 * Look up a shared link by token and return all data needed for the public page.
 * Returns null if the link is not found or has been revoked.
 * Used by the HTTP endpoint that serves the public share page.
 */
export const getSharedLinkByToken = internalQuery({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the link by token
    const link = await ctx.db
      .query("sharedLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!link) return null;
    if (!link.isActive) return { revoked: true };

    // Get the call data
    const call = await ctx.db.get(link.callId);
    if (!call) return null;

    // Get closer name
    const closer = await ctx.db.get(call.closerId);
    const closerName = closer?.name ?? "Unknown";

    // Get transcript segments (capped at 5000 to prevent oversized responses for very long calls)
    const segments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_call_and_time", (q) => q.eq("callId", link.callId))
      .order("asc")
      .take(5000);

    // Get comments if enabled
    let comments: Array<{
      id: string;
      authorName: string;
      authorType: string;
      content: string;
      timestampSeconds: number | undefined;
      parentCommentId: string | undefined;
      createdAt: number;
    }> = [];
    if (link.includeComments) {
      const rawComments = await ctx.db
        .query("callComments")
        .withIndex("by_call_and_time", (q) => q.eq("callId", link.callId))
        .order("asc")
        .collect();
      comments = rawComments.map((c) => ({
        id: c._id,
        authorName: c.authorName,
        authorType: c.authorType,
        content: c.content,
        timestampSeconds: c.timestampSeconds,
        parentCommentId: c.parentCommentId,
        createdAt: c.createdAt,
      }));
    }

    return {
      revoked: false,
      callId: link.callId,
      shareType: link.shareType,
      startSeconds: link.startSeconds,
      endSeconds: link.endSeconds,
      includeComments: link.includeComments,
      call: {
        prospectName: call.prospectName ?? "Unknown Prospect",
        closerName,
        duration: call.duration,
        startedAt: call.startedAt,
        recordingUrl: call.recordingUrl,
        recordingType: call.recordingType ?? "audio",
      },
      transcript: segments.map((s) => ({
        speaker: s.speaker,
        text: s.text,
        timestamp: s.timestamp,
      })),
      comments,
    };
  },
});

