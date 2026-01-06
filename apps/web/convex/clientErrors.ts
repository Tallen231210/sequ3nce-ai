import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Log a client error from the desktop app
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
    // Try to find the closer by email to get their IDs
    let closerId = undefined;
    let teamId = undefined;

    if (args.closerEmail) {
      const closer = await ctx.db
        .query("closers")
        .withIndex("by_email", (q) => q.eq("email", args.closerEmail!))
        .first();

      if (closer) {
        closerId = closer._id;
        teamId = closer.teamId;
      }
    }

    await ctx.db.insert("clientErrors", {
      closerId,
      teamId,
      closerEmail: args.closerEmail,
      errorType: args.errorType,
      errorMessage: args.errorMessage,
      errorStack: args.errorStack,
      appVersion: args.appVersion,
      platform: args.platform,
      osVersion: args.osVersion,
      architecture: args.architecture,
      screenPermission: args.screenPermission,
      microphonePermission: args.microphonePermission,
      context: args.context,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// Get recent errors (for admin viewing)
export const getRecentErrors = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;

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

// Get errors for a specific closer
export const getErrorsByCloser = query({
  args: {
    closerEmail: v.string(),
  },
  handler: async (ctx, args) => {
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
