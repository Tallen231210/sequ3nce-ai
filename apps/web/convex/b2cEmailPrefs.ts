import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { b2cUserByToken } from "./calendarOAuth";
import { verifyUnsubscribeToken } from "./b2cEmail";

// ============================================================================
// "Email me updates" — the one switch every non-transactional B2C email
// honors (b2cEmail.ts). Read/set by the app through the session token (same
// discipline as the auto-join switch), and flipped by the unsubscribe link
// with an HMAC token so nobody can unsubscribe someone else.
// ============================================================================

export const getForToken = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ ok?: boolean; enabled?: boolean; needsRelogin?: boolean }> => {
    const user = await b2cUserByToken(ctx, args.sessionToken);
    if (!user) return { needsRelogin: true };
    return { ok: true, enabled: user.emailNotificationsOptOut !== true };
  },
});

export const setForToken = internalMutation({
  args: { sessionToken: v.string(), enabled: v.boolean() },
  handler: async (ctx, args): Promise<{ ok?: boolean; enabled?: boolean; needsRelogin?: boolean }> => {
    const user = await b2cUserByToken(ctx, args.sessionToken);
    if (!user) return { needsRelogin: true };
    await ctx.db.patch(user._id, { emailNotificationsOptOut: !args.enabled });
    return { ok: true, enabled: args.enabled };
  },
});

export const checkUnsubscribeToken = internalQuery({
  args: { userId: v.string(), token: v.string() },
  handler: async (ctx, args): Promise<{ valid: boolean; name?: string }> => {
    const id = ctx.db.normalizeId("b2cUsers", args.userId);
    if (!id) return { valid: false };
    const user = await ctx.db.get(id);
    if (!user) return { valid: false };
    const valid = await verifyUnsubscribeToken(id, args.token);
    return valid ? { valid: true, name: user.name } : { valid: false };
  },
});

export const unsubscribeWithToken = internalMutation({
  args: { userId: v.string(), token: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const id = ctx.db.normalizeId("b2cUsers", args.userId);
    if (!id) return { ok: false };
    const user = await ctx.db.get(id);
    if (!user) return { ok: false };
    if (!(await verifyUnsubscribeToken(id, args.token))) return { ok: false };
    await ctx.db.patch(id, { emailNotificationsOptOut: true });
    return { ok: true };
  },
});
