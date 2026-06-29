// Analytics Step 2 — single query that aggregates the data needed by the
// inline-recommendation rule engine and returns the per-section + top-N
// bundle. The rules themselves live in `lib/recommendationRules.ts` so they
// stay pure / testable in isolation.

import { v } from "convex/values";
import { query } from "./_generated/server";
import { runAllRules, type RecommendationBundle } from "./lib/recommendationRules";

// Date-range helper shape mirrors what `analytics.ts` uses. Duplicated locally
// (small function) instead of restructuring `analytics.ts` to export it —
// keeps Step 2 isolated and easy to revert if needed.
type DateRange =
  | "today"
  | "this_week"
  | "last_7_days"
  | "this_month"
  | "last_30_days"
  | "last_90_days"
  | "custom";

function getDateRangeTimestamps(
  range: DateRange,
  customStart?: number,
  customEnd?: number,
): { start: number; end: number; prevStart: number; prevEnd: number } {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  if (range === "custom" && customStart != null && customEnd != null) {
    const duration = customEnd - customStart;
    return {
      start: customStart,
      end: customEnd,
      prevStart: customStart - duration,
      prevEnd: customStart,
    };
  }

  let start: number;
  let prevStart: number;

  switch (range) {
    case "today": {
      const d = new Date();
      start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      prevStart = start - day;
      break;
    }
    case "this_week": {
      const dayOfWeek = new Date().getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      start = now - daysToMonday * day;
      start = new Date(start).setHours(0, 0, 0, 0);
      prevStart = start - 7 * day;
      break;
    }
    case "last_7_days":
      start = now - 7 * day;
      prevStart = start - 7 * day;
      break;
    case "this_month": {
      const date = new Date();
      start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
      prevStart = new Date(
        date.getFullYear(),
        date.getMonth() - 1,
        1,
      ).getTime();
      break;
    }
    case "last_30_days":
      start = now - 30 * day;
      prevStart = start - 30 * day;
      break;
    case "last_90_days":
      start = now - 90 * day;
      prevStart = start - 90 * day;
      break;
    default:
      start = now - 30 * day;
      prevStart = start - 30 * day;
  }

  return { start, end: now, prevStart, prevEnd: start };
}

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
