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
 * Save Google Calendar OAuth connection on a closer record.
 * Called after the OAuth callback exchanges the authorization code for tokens.
 */
export const saveGoogleCalendarConnection = mutation({
  args: {
    closerId: v.id("closers"),
    refreshToken: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) {
      throw new Error("Closer not found");
    }

    await ctx.db.patch(args.closerId, {
      googleCalendarRefreshToken: args.refreshToken,
      calendarProvider: "google",
      calendarConnectedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Save Microsoft/Outlook Calendar OAuth connection on a closer record.
 * Called after the OAuth callback exchanges the authorization code for tokens.
 */
export const saveMicrosoftCalendarConnection = mutation({
  args: {
    closerId: v.id("closers"),
    refreshToken: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) {
      throw new Error("Closer not found");
    }

    await ctx.db.patch(args.closerId, {
      microsoftCalendarRefreshToken: args.refreshToken,
      calendarProvider: "microsoft",
      calendarConnectedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Disconnect calendar integration from a closer.
 * Clears all calendar OAuth fields (refresh tokens, provider, onboarding).
 */
export const disconnectCalendar = mutation({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) {
      throw new Error("Closer not found");
    }

    await ctx.db.patch(args.closerId, {
      googleCalendarRefreshToken: undefined,
      microsoftCalendarRefreshToken: undefined,
      calendarProvider: undefined,
      calendarConnectedAt: undefined,
      calendarOnboardingCompleted: undefined,
    });

    return { success: true };
  },
});

/**
 * Mark calendar onboarding as completed for a closer.
 * Called after the closer has finished the bot setup flow.
 */
export const markOnboardingCompleted = mutation({
  args: {
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) {
      throw new Error("Closer not found");
    }

    await ctx.db.patch(args.closerId, {
      calendarOnboardingCompleted: true,
    });

    return { success: true };
  },
});

// ============================================
// INTERNAL MUTATIONS (for actions)
// ============================================
