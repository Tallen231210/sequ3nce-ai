// Analytics Step 2 — single query that aggregates the data needed by the
// inline-recommendation rule engine and returns the per-section + top-N
// bundle. The rules themselves live in `lib/recommendationRules.ts` so they
// stay pure / testable in isolation.

import { v } from "convex/values";
import { query } from "./_generated/server";
import { runAllRules, type RecommendationBundle } from "./lib/recommendationRules";
import { getDateRangeTimestamps, type DateRange } from "./lib/dateRanges";

export const getAnalyticsRecommendations = query({
  args: {
    teamId: v.id("teams"),
    dateRange: v.string(),
    closerId: v.optional(v.id("closers")),
    customStart: v.optional(v.number()),
    customEnd: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<RecommendationBundle> => {
    const { start, end, prevStart, prevEnd } = getDateRangeTimestamps(
      args.dateRange as DateRange,
      args.customStart,
      args.customEnd,
    );

    let currentCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", start).lte("createdAt", end),
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    let priorCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q
          .eq("teamId", args.teamId)
          .gte("createdAt", prevStart)
          .lte("createdAt", prevEnd),
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    if (args.closerId) {
      currentCalls = currentCalls.filter((c) => c.closerId === args.closerId);
      priorCalls = priorCalls.filter((c) => c.closerId === args.closerId);
    }

    const activeClosers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    return runAllRules({
      currentCalls,
      priorCalls,
      activeClosers,
      dateRange: args.dateRange,
      closerFilter: args.closerId ?? null,
    });
  },
});
