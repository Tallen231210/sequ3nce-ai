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
      calendarDisconnectReason: undefined,
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
      calendarDisconnectReason: undefined,
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
      // A deliberate disconnect is not an expiry.
      calendarDisconnectReason: undefined,
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

/**
 * B2C (Personal app) auto-join switch — read and write.
 *
 * Same standard as the B2B pair above: this switch decides whether a bot
 * sits in someone's meetings, so it authenticates by the app-session bearer
 * token minted at login (b2cUsers.sessionTokenHash), never by a
 * client-supplied id. Sessions from app versions predating the token simply
 * get { needsRelogin: true } — one fresh login upgrades them.
 */
async function b2cUserByToken(ctx: any, sessionToken: string) {
  if (!sessionToken || sessionToken.length < 32) return null;
  const data = new TextEncoder().encode(sessionToken);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hash = Array.from(new Uint8Array(digest))
    .map((b: number) => b.toString(16).padStart(2, "0"))
    .join("");
  const users = await ctx.db
    .query("b2cUsers")
    .withIndex("by_session_token_hash", (q: any) => q.eq("sessionTokenHash", hash))
    .collect();
  return users[0] ?? null;
}

export const autoJoinForB2c = internalMutation({
  args: { sessionToken: v.string(), enabled: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<any> => {
    const user = await b2cUserByToken(ctx, args.sessionToken);
    if (!user) return { needsRelogin: true };

    const closer = await ctx.db
      .query("closers")
      .withIndex("by_team", (q: any) => q.eq("teamId", user.personalWorkspaceId))
      .first();
    if (!closer) return { error: "Account data is corrupted." };

    if (typeof args.enabled === "boolean") {
      await ctx.db.patch(closer._id, { autoJoinEnabled: args.enabled });
    }
    // Re-read: `closer` above predates the patch and would echo stale state.
    const fresh = await ctx.db.get(closer._id);

    const cals = await ctx.db
      .query("b2cCalendars")
      .withIndex("by_closer", (q: any) => q.eq("closerId", closer._id))
      .collect();
    const STALE_MS = 48 * 60 * 60 * 1000;
    const hasLiveCalendar = cals.some(
      (c: any) =>
        c.isEnabled &&
        !c.syncError &&
        c.lastSyncAt !== undefined &&
        Date.now() - c.lastSyncAt < STALE_MS,
    );
    return {
      ok: true,
      enabled: (fresh as any)?.autoJoinEnabled === true,
      hasLiveCalendar,
    };
  },
});
