import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";

// ============================================
// QUERIES
// ============================================

/**
 * Get closer by ID. Public so the OAuth callback (ConvexHttpClient) can read teamId
 * for creating b2cCalendar records.
 */
export const getCloserById = query({
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
      // Auto-join defaults ON the moment a calendar is connected.
      //
      // It used to default off, one closer enabled by hand at a time, which was
      // right while the bot was being proved out. It stopped being right the
      // first time a team onboarded without us: E2 Influencers had four closers
      // active with calendars connected, the correct tier, and no recordings at
      // all — because nobody knew a switch existed. There is no UI for it and
      // never was, so they could not have turned it on if they had known.
      //
      // Connecting your work calendar to a call-recording product is not an
      // accident, so consent is better read from that act than from a second
      // hidden one. The closer keeps an explicit opt-out on their dashboard.
      //
      // `?? true` rather than `true`: a closer who deliberately switched it OFF
      // and later reconnects their calendar must not have it silently switched
      // back on.
      autoJoinEnabled: closer.autoJoinEnabled ?? true,
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
      // Same default as Google — see saveGoogleCalendarConnection.
      autoJoinEnabled: closer.autoJoinEnabled ?? true,
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

/**
 * Read and write a closer's own recording switch.
 *
 * Internal, and reached only through the /closer/autoJoin HTTP route, which
 * resolves the caller from their session token first.
 *
 * The first version of this was a PUBLIC mutation taking a closerId and
 * trusting it. Every other closer feature does the same today — the codebase
 * has a documented, accepted habit of trusting client-supplied ids — but this
 * particular switch decides whether a bot sits in someone's meetings, and
 * "anyone can turn on recording for anyone" is not a debt worth adding to.
 */
export const setAutoJoinForCloser = internalMutation({
  args: { closerId: v.id("closers"), enabled: v.boolean() },
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string }> => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return { ok: false, reason: "Closer not found." };

    const team = await ctx.db.get(closer.teamId);
    const tier =
      (team as any)?.productTierOverride ?? (team as any)?.productTier ?? null;
    // Repeated rather than inherited: storing `true` on a team without the bot
    // leaves a switch reading ON while nothing records, which is worse than a
    // clear no.
    if (args.enabled && tier !== "overwatch") {
      return { ok: false, reason: "Recording isn't part of your team's plan." };
    }

    await ctx.db.patch(args.closerId, { autoJoinEnabled: args.enabled });
    return { ok: true };
  },
});

export const readAutoJoinForCloser = internalQuery({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args): Promise<any> => {
    const closer = await ctx.db.get(args.closerId);
    if (!closer) return null;
    const team = await ctx.db.get(closer.teamId);
    const tier =
      (team as any)?.productTierOverride ?? (team as any)?.productTier ?? null;
    return {
      enabled: (closer as any).autoJoinEnabled === true,
      // Two different reasons the switch can do nothing, and they need
      // different words: one is a plan limit, the other a step they skipped.
      available: tier === "overwatch",
      hasCalendar:
        !!(closer as any).icsUrl ||
        !!(closer as any).googleCalendarRefreshToken ||
        !!(closer as any).microsoftCalendarRefreshToken,
    };
  },
});
