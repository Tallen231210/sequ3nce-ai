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

/**
 * Register Zoom credentials with Meeting BaaS.
 * Meeting BaaS requires Zoom OAuth credentials (AES-256-GCM encrypted)
 * to join Zoom meetings as a bot. This is mandatory for OBF (One Button to
 * Join) compliance with Zoom's API terms.
 *
 * This action:
 * 1. Reads the closer's Zoom tokens
 * 2. Calls Meeting BaaS /v2/zoom-credentials endpoint with encrypted tokens
 * 3. Meeting BaaS stores these for bot joining
 */
export const registerZoomCredentialsWithMeetingBaas = action({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    // Get the closer record
    const closer = await ctx.runQuery(internal.zoomOAuth.getCloserById, {
      closerId: args.closerId,
    });

    if (!closer) {
      throw new Error("Closer not found");
    }

    if (!closer.zoomAccessToken || !closer.zoomRefreshToken) {
      throw new Error("No Zoom connection found. Please connect Zoom first.");
    }

    const apiKey = process.env.MEETING_BAAS_API_KEY;
    if (!apiKey) {
      throw new Error("Meeting BaaS API key not configured");
    }

    try {
      // TODO: Implement AES-256-GCM encryption of Zoom tokens before sending
      // to Meeting BaaS. The encryption key/method will be provided by
      // Meeting BaaS documentation.
      //
      // Placeholder API call:
      const response = await fetch("https://api.meetingbaas.com/v2/zoom-credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          // TODO: These tokens should be AES-256-GCM encrypted
          // before being sent to Meeting BaaS
          access_token: closer.zoomAccessToken,
          refresh_token: closer.zoomRefreshToken,
          // TODO: Add any additional required fields (e.g., closer identifier, encryption metadata)
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[ZoomOAuth] Meeting BaaS API error:", response.status, errorText);
        throw new Error(`Meeting BaaS API error: ${response.status}`);
      }

      const data = await response.json();
      console.log("[ZoomOAuth] Zoom credentials registered with Meeting BaaS for closer:", args.closerId);

      return {
        success: true,
      };
    } catch (error) {
      console.error("[ZoomOAuth] Failed to register Zoom credentials with Meeting BaaS:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
