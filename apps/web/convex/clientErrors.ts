import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Helper to truncate strings to prevent abuse
function truncate(str: string | undefined, maxLength: number): string | undefined {
  if (!str) return str;
  return str.length > maxLength ? str.slice(0, maxLength) + "...[truncated]" : str;
}

// Log a client error from the desktop app
// NOTE: This endpoint is intentionally unauthenticated because errors may occur
// before/during login. Input is validated and truncated to prevent abuse.
export const logError = mutation({
  args: {
    closerEmail: v.optional(v.string()),
    errorType: v.string(),
    errorMessage: v.string(),
    errorStack: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    platform: v.optional(v.string()),
    osVersion: v.optional(v.string()),
    architecture: v.optional(v.string()),
    screenPermission: v.optional(v.string()),
    microphonePermission: v.optional(v.string()),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Validate errorType is a reasonable value (prevent spam with garbage)
    const validErrorTypes = [
      "capture_failed",
      "capture_exception",
      "dom_exception_NotAllowedError",
      "dom_exception_NotFoundError",
      "dom_exception_AbortError",
      "permission_denied",
      "connection_error",
      "unknown",
    ];
    const errorType = validErrorTypes.includes(args.errorType)
      ? args.errorType
      : "unknown";

    // Try to find the closer by email to get their IDs
    // Only process if email looks valid (basic spam prevention)
    let closerId = undefined;
    let teamId = undefined;

    if (args.closerEmail && args.closerEmail.includes("@") && args.closerEmail.length < 100) {
      const closer = await ctx.db
        .query("closers")
        .withIndex("by_email", (q) => q.eq("email", args.closerEmail!))
        .first();

      if (closer) {
        closerId = closer._id;
        teamId = closer.teamId;
      }
    }

    // Truncate all string fields to prevent database bloat from abuse
    await ctx.db.insert("clientErrors", {
      closerId,
      teamId,
      closerEmail: truncate(args.closerEmail, 100),
      errorType,
      errorMessage: truncate(args.errorMessage, 500) || "No message",
      errorStack: truncate(args.errorStack, 2000),
      appVersion: truncate(args.appVersion, 20),
      platform: truncate(args.platform, 20),
      osVersion: truncate(args.osVersion, 50),
      architecture: truncate(args.architecture, 20),
      screenPermission: truncate(args.screenPermission, 20),
      microphonePermission: truncate(args.microphonePermission, 20),
      context: truncate(args.context, 500),
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// Get recent errors (for admin viewing via Convex dashboard only)
// NOTE: These are internal functions - view errors directly in Convex dashboard
// Data tab -> clientErrors table for production debugging
export const getRecentErrors = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit || 50, 100); // Cap at 100

    const errors = await ctx.db
      .query("clientErrors")
      .order("desc")
      .take(limit);

    // Enrich with closer names
    const enrichedErrors = await Promise.all(
      errors.map(async (error) => {
        let closerName = undefined;
        if (error.closerId) {
          const closer = await ctx.db.get(error.closerId);
          closerName = closer?.name;
        }
        return {
          ...error,
          closerName,
        };
      })
    );

    return enrichedErrors;
  },
});

// Get errors for a specific closer (internal use)
export const getErrorsByCloser = query({
  args: {
    closerEmail: v.string(),
  },
  handler: async (ctx, args) => {
    // Basic validation
    if (!args.closerEmail || !args.closerEmail.includes("@")) {
      return [];
    }

    // Find closer
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.closerEmail))
      .first();

    if (!closer) {
      return [];
    }

    const errors = await ctx.db
      .query("clientErrors")
      .withIndex("by_closer", (q) => q.eq("closerId", closer._id))
      .order("desc")
      .take(20);

    return errors;
  },
});
