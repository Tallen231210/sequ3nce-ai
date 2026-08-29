import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";

// ============================================================================
// A manager's own calendar connection.
//
// Mirrors calendarOAuth.ts, with one difference that is the whole point: the
// identity here is a `users` row. Nothing in this file can read or write a
// closer, so a mistake here cannot reach the sales side of the product.
// ============================================================================

/** The bot is an Overwatch feature. Managers are gated the same as closers. */
function isOverwatch(tier: string | undefined | null): boolean {
  return tier === "overwatch";
}

export const getManagerCalendarState = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);

    return {
      userId: user._id,
      name: user.name ?? null,
      connected: !!user.googleCalendarRefreshToken,
      connectedAt: user.calendarConnectedAt ?? null,
      // "google_revoked" when Google killed the token — the connect card says
      // the connection expired rather than rendering as never-connected.
      disconnectReason: user.calendarDisconnectReason ?? null,
      autoJoin: user.managerAutoJoinEnabled ?? false,
      canConnect: isOverwatch(team?.productTier),
      /** Shown so a manager on the wrong plan is told why, not just refused. */
      tier: team?.productTier ?? null,
      // Mirrors getTeamBotName exactly — this is the name the UI promises
      // ("X joins every meeting"), so it must match what the bot joins as.
      botName:
        team?.managerMeetingBotName ??
        (user.name?.trim()
          ? `${user.name.trim().split(/\s+/)[0]}'s Sequ3nce MGMT`
          : "Sequ3nce MGMT"),
    };
  },
});

/** A nonce is worthless after ten minutes — long enough to click through
 *  Google's consent screen, short enough that a leaked URL is inert. */
const NONCE_TTL_MS = 10 * 60 * 1000;

/**
 * Mint a one-time token to start the Google flow.
 *
 * Called by the signed-in manager from their own browser, so the identity is
 * established here — once — and then travels through Google as the OAuth
 * `state`. The callback never has to be told whose calendar it is holding.
 */
export const startManagerCalendarConnect = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!isOverwatch(team?.productTier)) {
      throw new ConvexError("Manager Mode needs Overwatch");
    }

    const nonce = crypto.randomUUID().replace(/-/g, "");
    const now = Date.now();
    await ctx.db.insert("managerOAuthNonces", {
      nonce,
      userId: user._id,
      createdAt: now,
      expiresAt: now + NONCE_TTL_MS,
    });
    return { nonce };
  },
});

/**
 * Spend the nonce and store the refresh token.
 *
 * Public because the OAuth callback runs on our Next.js server and reaches
 * Convex through ConvexHttpClient, which cannot call internal functions. It is
 * safe to be public precisely because it takes no user id: the only way to
 * name a manager is to hold an unspent nonce that manager minted minutes ago.
 */
export const completeManagerCalendarConnect = mutation({
  args: { nonce: v.string(), refreshToken: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("managerOAuthNonces")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.nonce))
      .first();

    // All three failures answer the same way. Distinguishing "expired" from
    // "already used" from "never existed" only helps someone guessing.
    if (!row) throw new ConvexError("That connection link is no longer valid");
    if (row.usedAt) throw new ConvexError("That connection link is no longer valid");
    if (row.expiresAt < Date.now()) {
      throw new ConvexError("That connection link is no longer valid");
    }

    const user = await ctx.db.get(row.userId);
    if (!user) throw new ConvexError("No such manager");

    // Spend it first. If the patch below fails, the nonce is still burnt —
    // better a manager reconnects than a token stays replayable.
    await ctx.db.patch(row._id, { usedAt: Date.now() });

    await ctx.db.patch(row.userId, {
      googleCalendarRefreshToken: args.refreshToken,
      calendarProvider: "google",
      calendarConnectedAt: Date.now(),
      calendarDisconnectReason: undefined,
      // `?? true`, never a bare true. A manager who deliberately switched
      // recording off and later reconnects must not be silently switched back
      // on — the closer toggle learned this, and reconnecting is exactly when
      // it would happen.
      managerAutoJoinEnabled: user.managerAutoJoinEnabled ?? true,
    });
    return { success: true, userId: row.userId };
  },
});

export const disconnectManagerCalendar = mutation({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");

    // Deliberately leaves managerAutoJoinEnabled alone. Disconnecting is not
    // the same as saying "never record me", and clearing it would silently
    // re-enable recording on the next connect.
    await ctx.db.patch(user._id, {
      googleCalendarRefreshToken: undefined,
      calendarProvider: undefined,
      calendarConnectedAt: undefined,
      calendarOnboardingCompleted: undefined,
      // A deliberate disconnect is not an expiry.
      calendarDisconnectReason: undefined,
    });

    // Their upcoming events are meaningless without a token to refresh them,
    // and leaving them would make the tab show meetings no bot will attend.
    const events = await ctx.db
      .query("managerCalendarEvents")
      .withIndex("by_user_and_start", (q) => q.eq("userId", user._id))
      .collect();
    for (const e of events) await ctx.db.delete(e._id);

    return { success: true, clearedEvents: events.length };
  },
});

export const setManagerAutoJoin = mutation({
  args: { clerkId: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    await ctx.db.patch(user._id, { managerAutoJoinEnabled: args.enabled });
    return { success: true, enabled: args.enabled };
  },
});

/**
 * Every manager the scheduler should consider.
 *
 * Internal: it returns refresh tokens, which must never reach a browser.
 */
export const getManagersWithCalendars = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const out = [];
    for (const u of users) {
      if (!u.googleCalendarRefreshToken) continue;
      if (u.managerAutoJoinEnabled !== true) continue;
      const team = await ctx.db.get(u.teamId as Id<"teams">);
      if (!isOverwatch(team?.productTier)) continue;
      out.push({
        userId: u._id,
        teamId: u.teamId as Id<"teams">,
        name: u.name ?? u.email,
        refreshToken: u.googleCalendarRefreshToken,
      });
    }
    return out;
  },
});
