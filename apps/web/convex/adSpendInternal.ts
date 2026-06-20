// V8 helpers for adSpend.ts (which is "use node"). Convex requires
// internalMutation/internalQuery to live outside Node runtime.

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const getMetaCredentials = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (
    ctx,
    args,
  ): Promise<{ metaAccessToken?: string; metaAdAccountId?: string } | null> => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;
    return {
      metaAccessToken: team.metaAdsAccessToken,
      metaAdAccountId: team.metaAdsAdAccountId,
    };
  },
});

export const upsertSpendDay = internalMutation({
  args: {
    teamId: v.id("teams"),
    date: v.string(),
    platform: v.string(),
    adAccountId: v.optional(v.string()),
    adSourceId: v.optional(v.string()),
    sourceLinkName: v.optional(v.string()),
    spendCents: v.number(),
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    source: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = args.adSourceId
      ? await ctx.db
          .query("adSpendDaily")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .withIndex("by_ad_source_and_date", (q: any) =>
            q.eq("adSourceId", args.adSourceId).eq("date", args.date),
          )
          .filter((q) => q.eq(q.field("teamId"), args.teamId))
          .first()
      : null;

    if (existing) {
      await ctx.db.patch(existing._id, {
        spendCents: args.spendCents,
        impressions: args.impressions,
        clicks: args.clicks,
        sourceLinkName: args.sourceLinkName,
        ingestedAt: Date.now(),
      });
      return false;
    }

    await ctx.db.insert("adSpendDaily", {
      teamId: args.teamId,
      date: args.date,
      platform: args.platform,
      adAccountId: args.adAccountId,
      adSourceId: args.adSourceId,
      sourceLinkName: args.sourceLinkName,
      spendCents: args.spendCents,
      impressions: args.impressions,
      clicks: args.clicks,
      source: args.source,
      ingestedAt: Date.now(),
    });
    return true;
  },
});

export const recordMetaSyncSuccess = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      metaAdsLastSyncedAt: Date.now(),
      metaAdsLastSyncError: undefined,
    });
  },
});

export const recordMetaSyncError = internalMutation({
  args: { teamId: v.id("teams"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      metaAdsLastSyncError: args.error,
    });
  },
});

export const listTeamsWithMetaConnected = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Id<"teams">>> => {
    const all = await ctx.db.query("teams").collect();
    return all
      .filter((t) => !!t.metaAdsAccessToken && !!t.metaAdsAdAccountId)
      .map((t) => t._id);
  },
});
