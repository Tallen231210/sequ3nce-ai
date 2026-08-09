import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getContentForCallTx } from "./callContent";

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

/** SHA-256 hash a password string, returning hex. */
async function hashSharePassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison to prevent timing attacks. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ──────────────────────────────────────────────
// MUTATIONS
// ──────────────────────────────────────────────

/**
 * Create a public share link for a call recording.
 * Returns the generated token, full URL, and linkId.
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
    accessType: v.optional(v.string()), // "full_access" | "compliance"
    password: v.optional(v.string()),   // plaintext password (hashed before storage)
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

    // Validate access type
    const accessType = args.accessType || "full_access";
    if (accessType !== "full_access" && accessType !== "compliance") {
      throw new Error("Invalid access type (must be 'full_access' or 'compliance')");
    }

    // Validate password length
    if (args.password && args.password.length > 128) {
      throw new Error("Password too long (max 128 characters)");
    }

    const token = generateToken();

    // Hash password if provided
    const passwordHash = args.password
      ? await hashSharePassword(args.password)
      : undefined;

    const linkId = await ctx.db.insert("sharedLinks", {
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
      accessType,
      passwordHash,
    });

    const url = `https://sequ3nce.ai/share/${token}`;
    return { token, url, linkId };
  },
});

/**
 * The share link a compliance alert points at.
 *
 * REUSED, never re-minted. Every one of these is a public URL that plays the
 * whole call to anyone holding it, so a call that gets reviewed twice must not
 * leave two live links behind — the set of exposed URLs should grow with the
 * number of flagged calls, not with the number of times we looked at them.
 *
 * Tyler chose a public link over an authenticated one knowing the trade: it
 * opens instantly on a phone with no sign-in, which is where a manager actually
 * reads Slack. The cost is that forwarding the message forwards the recording,
 * on exactly the calls that have something on them.
 *
 * Returns null when there's nothing shareable — a call with no recording of our
 * own, e.g. anything that came from an outside recorder. The alert falls back
 * to the dashboard link rather than going out without one.
 */
export const getOrCreateComplianceShareLink = internalMutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, args): Promise<{ url: string } | null> => {
    const call = await ctx.db.get(args.callId);
    if (!call?.recordingUrl) return null;

    const existing = await ctx.db
      .query("sharedLinks")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();

    const reusable = existing.find(
      (l) => l.isActive && l.shareType === "full" && l.createdBy === COMPLIANCE_CREATOR,
    );
    if (reusable) return { url: `https://sequ3nce.ai/share/${reusable.token}` };

    const token = generateToken();
    await ctx.db.insert("sharedLinks", {
      callId: args.callId,
      teamId: call.teamId,
      token,
      shareType: "full",
      // Off deliberately. Internal review comments are a conversation between
      // managers about a rep, and this link can reach anyone.
      includeComments: false,
      createdBy: COMPLIANCE_CREATOR,
      createdByType: "manager",
      isActive: true,
      createdAt: Date.now(),
      // Full rather than the redacted "compliance" type — the whole point is
      // hearing the moment the finding quotes, and a redacted transcript would
      // hide the words the alert is about.
      accessType: "full_access",
    });

    return { url: `https://sequ3nce.ai/share/${token}` };
  },
});

/** Marks links minted by the alert, so they can be found and reused or revoked. */
const COMPLIANCE_CREATOR = "compliance-alert";

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

/**
 * Store an AI-redacted transcript on a shared link (called after redaction action completes).
 */
export const storeRedactedTranscript = internalMutation({
  args: {
    linkId: v.id("sharedLinks"),
    redactedTranscript: v.array(v.object({
      speaker: v.string(),
      text: v.string(),
      timestamp: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.get(args.linkId);
    if (!link) throw new Error("Shared link not found");
    await ctx.db.patch(args.linkId, {
      redactedTranscript: args.redactedTranscript,
    });
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
      accessType: link.accessType || "full_access",
      hasPassword: !!link.passwordHash,
      url: `https://sequ3nce.ai/share/${link.token}`,
    }));
  },
});

/**
 * Get transcript segments for a call (used before AI redaction).
 */
export const getTranscriptForRedaction = internalQuery({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const segments = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_call_and_time", (q) => q.eq("callId", args.callId))
      .order("asc")
      .take(5000);

    return segments.map((s) => ({
      speaker: s.speaker,
      text: s.text,
      timestamp: s.timestamp,
    }));
  },
});

/**
 * Verify a password against a shared link's stored hash.
 * Returns { valid: true } or { valid: false }.
 */
export const verifySharedLinkPassword = internalQuery({
  args: {
    token: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("sharedLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!link || !link.passwordHash) return { valid: false };
    return { valid: constantTimeEqual(link.passwordHash, args.passwordHash) };
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

    const accessType = link.accessType || "full_access";
    const hasPassword = !!link.passwordHash;

    // Get the call data
    const call = await ctx.db.get(link.callId);
    if (!call) return null;

    // Get closer name
    const closer = await ctx.db.get(call.closerId);
    const closerName = closer?.name ?? "Unknown";

    // For compliance links, use redacted transcript if available
    let transcript: Array<{ speaker: string; text: string; timestamp: number }>;
    if (accessType === "compliance" && link.redactedTranscript) {
      transcript = link.redactedTranscript;
    } else {
      // Get transcript segments (capped at 5000 to prevent oversized responses for very long calls)
      const segments = await ctx.db
        .query("transcriptSegments")
        .withIndex("by_call_and_time", (q) => q.eq("callId", link.callId))
        .order("asc")
        .take(5000);
      transcript = segments.map((s) => ({
        speaker: s.speaker,
        text: s.text,
        timestamp: s.timestamp,
      }));
    }

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

    const content = await getContentForCallTx(ctx, link.callId);

    return {
      revoked: false,
      callId: link.callId,
      shareType: link.shareType,
      startSeconds: link.startSeconds,
      endSeconds: link.endSeconds,
      includeComments: link.includeComments,
      accessType,
      hasPassword,
      call: {
        prospectName: call.prospectName ?? "Unknown Prospect",
        closerName,
        duration: call.duration,
        startedAt: call.startedAt,
        recordingUrl: call.recordingUrl,
        recordingType: call.recordingType ?? "audio",
        summary: content?.summary,
        callAnalysis: content?.callAnalysis,
        closerTalkTime: call.closerTalkTime,
        prospectTalkTime: call.prospectTalkTime,
        outcome: call.outcome,
      },
      chapters: content?.callAnalysis?.chapters ?? undefined,
      transcript,
      comments,
    };
  },
});
