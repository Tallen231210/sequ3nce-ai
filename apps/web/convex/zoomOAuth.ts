import { v } from "convex/values";
import { mutation, action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";

// ============================================
// INTERNAL QUERIES
// ============================================

/**
 * Get closer by ID for use in actions
 */
export const getCloserById = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.closerId);
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Save Zoom OAuth connection on a closer record.
 * Called after the Zoom OAuth callback exchanges the authorization code for tokens.
 */
export const saveZoomConnection = mutation({
  args: {
    closerId: v.id("closers"),
    accessToken: v.string(),
    refreshToken: v.string(),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) {
      throw new Error("Closer not found");
    }

    await ctx.db.patch(args.closerId, {
      zoomAccessToken: args.accessToken,
      zoomRefreshToken: args.refreshToken,
      zoomConnectedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Disconnect Zoom integration from a closer.
 * Clears all Zoom OAuth fields.
 */
export const disconnectZoom = mutation({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) {
      throw new Error("Closer not found");
    }

    await ctx.db.patch(args.closerId, {
      zoomAccessToken: undefined,
      zoomRefreshToken: undefined,
      zoomConnectedAt: undefined,
    });

    return { success: true };
  },
});

// ============================================
// ACTIONS (external API calls)
// ============================================

