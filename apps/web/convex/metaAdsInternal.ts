// V8 helpers for metaAdsConfig.ts (which is "use node"). Convex requires
// internalMutation/internalQuery to live outside Node runtime.

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const resolveUserTeam = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return null;
    return { teamId: String(user.teamId) };
  },
});

export const storeMetaCredentials = internalMutation({
  args: {
    teamId: v.id("teams"),
    encryptedToken: v.string(),
    adAccountId: v.string(),
    tokenExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId as Id<"teams">, {
      metaAdsAccessToken: args.encryptedToken,
      metaAdsAdAccountId: args.adAccountId,
      metaAdsConnectedAt: Date.now(),
      metaAdsTokenExpiresAt: args.tokenExpiresAt,
      metaAdsLastSyncError: undefined,
    });
  },
});

export const clearMetaCredentials = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      metaAdsAccessToken: undefined,
      metaAdsAdAccountId: undefined,
      metaAdsConnectedAt: undefined,
      metaAdsTokenExpiresAt: undefined,
      metaAdsLastSyncedAt: undefined,
      metaAdsLastSyncError: undefined,
    });
  },
});
