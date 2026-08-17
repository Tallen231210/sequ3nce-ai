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
      autoJoin: user.managerAutoJoinEnabled ?? false,
      canConnect: isOverwatch(team?.productTier),
      /** Shown so a manager on the wrong plan is told why, not just refused. */
      tier: team?.productTier ?? null,
      botName: team?.managerMeetingBotName ?? "Sequ3nce MGMT",
    };
  },
});

/**
 * Store the refresh token after Google hands it back.
 *
 * internalMutation on purpose — it takes a userId with no proof of identity,
 * so it must not be reachable from a browser. The OAuth callback is trusted to
 * call it because the userId came from the `state` parameter we ourselves set
 * when starting the flow.
 */
export const saveManagerGoogleConnection = internalMutation({
  args: { userId: v.id("users"), refreshToken: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new ConvexError("No such manager");

    await ctx.db.patch(args.userId, {
      googleCalendarRefreshToken: args.refreshToken,
      calendarProvider: "google",
      calendarConnectedAt: Date.now(),
      // `?? true`, never a bare true. A manager who deliberately switched
      // recording off and later reconnects their calendar must not be
      // silently switched back on — the closer toggle learned this the hard
      // way, and reconnecting is exactly when it would happen.
      managerAutoJoinEnabled: user.managerAutoJoinEnabled ?? true,
    });
    return { success: true };
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
