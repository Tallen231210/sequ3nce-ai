import { query } from "./_generated/server";
import { v } from "convex/values";

// Date range types
type DateRange = "this_week" | "last_7_days" | "this_month" | "last_30_days" | "last_90_days";

// Helper to get date range timestamps
function getDateRangeTimestamps(range: DateRange): { start: number; end: number; prevStart: number; prevEnd: number } {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  let start: number;
  let prevStart: number;

  switch (range) {
    case "this_week": {
      const dayOfWeek = new Date().getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      start = now - (daysToMonday * day);
      start = new Date(start).setHours(0, 0, 0, 0);
      prevStart = start - (7 * day);
      break;
    }
    case "last_7_days":
      start = now - (7 * day);
      prevStart = start - (7 * day);
      break;
    case "this_month": {
      const date = new Date();
      start = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
      prevStart = new Date(date.getFullYear(), date.getMonth() - 1, 1).getTime();
      break;
    }
    case "last_30_days":
      start = now - (30 * day);
      prevStart = start - (30 * day);
      break;
    case "last_90_days":
      start = now - (90 * day);
      prevStart = start - (90 * day);
      break;
    default:
      start = now - (30 * day);
      prevStart = start - (30 * day);
  }

  return {
    start,
    end: now,
    prevStart,
    prevEnd: start,
  };
}

// Get analytics summary (Money View)
export const getAnalyticsSummary = query({
  args: {
    teamId: v.id("teams"),
    dateRange: v.string(),
    closerId: v.optional(v.id("closers")),
    outcome: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { start, end, prevStart, prevEnd } = getDateRangeTimestamps(args.dateRange as DateRange);

    // Get all completed calls for this period
    let calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", start).lte("createdAt", end)
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    // Filter by closer if specified
    if (args.closerId) {
      calls = calls.filter((c) => c.closerId === args.closerId);
    }

    // Filter by outcome if specified (and not "all")
    if (args.outcome && args.outcome !== "all") {
      calls = calls.filter((c) => c.outcome === args.outcome);
    }

    // Get previous period calls for comparison
    let prevCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", prevStart).lte("createdAt", prevEnd)
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    if (args.closerId) {
      prevCalls = prevCalls.filter((c) => c.closerId === args.closerId);
    }

    // Calculate current period metrics
    const totalPitched = calls.reduce((sum, c) => sum + (c.contractValue || c.dealValue || 0), 0);
    const closedCalls = calls.filter((c) => c.outcome === "closed");
    // Total Closed: use contractValue only for consistency
    const totalClosed = closedCalls.reduce((sum, c) => sum + (c.contractValue || 0), 0);
    // Left on Table: sum of lost + follow_up deals (by objection)
    const lostOrFollowUpCalls = calls.filter((c) => c.outcome === "lost" || c.outcome === "follow_up");
    const leftOnTable = lostOrFollowUpCalls.reduce((sum, c) => sum + (c.contractValue || 0), 0);
    // Close Rate: only count calls with an outcome set (exclude null outcomes and no-shows)
    const callsWithOutcome = calls.filter((c) => c.outcome != null && c.outcome !== "no_show");
    const closeRate = callsWithOutcome.length > 0 ? (closedCalls.length / callsWithOutcome.length) * 100 : 0;

    // Calculate previous period metrics (same logic as current)
    const prevTotalPitched = prevCalls.reduce((sum, c) => sum + (c.contractValue || c.dealValue || 0), 0);
    const prevClosedCalls = prevCalls.filter((c) => c.outcome === "closed");
    const prevTotalClosed = prevClosedCalls.reduce((sum, c) => sum + (c.contractValue || 0), 0);
    const prevLostOrFollowUpCalls = prevCalls.filter((c) => c.outcome === "lost" || c.outcome === "follow_up");
    const prevLeftOnTable = prevLostOrFollowUpCalls.reduce((sum, c) => sum + (c.contractValue || 0), 0);
    const prevCallsWithOutcome = prevCalls.filter((c) => c.outcome != null && c.outcome !== "no_show");
    const prevCloseRate = prevCallsWithOutcome.length > 0 ? (prevClosedCalls.length / prevCallsWithOutcome.length) * 100 : 0;

    // Calculate trends
    const pitchedTrend = prevTotalPitched > 0 ? ((totalPitched - prevTotalPitched) / prevTotalPitched) * 100 : 0;
    const closedTrend = prevTotalClosed > 0 ? ((totalClosed - prevTotalClosed) / prevTotalClosed) * 100 : 0;
    const leftOnTableTrend = prevLeftOnTable > 0 ? ((leftOnTable - prevLeftOnTable) / prevLeftOnTable) * 100 : 0;
    const closeRateTrend = prevCloseRate > 0 ? closeRate - prevCloseRate : 0;

    return {
      totalPitched,
      totalClosed,
      leftOnTable,
      closeRate: Math.round(closeRate * 10) / 10,
      totalCalls: calls.length,
      closedCalls: closedCalls.length,
      lostOrFollowUpCalls: lostOrFollowUpCalls.length,
      trends: {
        pitched: Math.round(pitchedTrend * 10) / 10,
        closed: Math.round(closedTrend * 10) / 10,
        leftOnTable: Math.round(leftOnTableTrend * 10) / 10,
        closeRate: Math.round(closeRateTrend * 10) / 10,
      },
    };
  },
});

// Get lost deals breakdown by objection type
export const getLostDealsByObjection = query({
  args: {
    teamId: v.id("teams"),
    dateRange: v.string(),
    closerId: v.optional(v.id("closers")),
  },
  handler: async (ctx, args) => {
    const { start, end, prevStart, prevEnd } = getDateRangeTimestamps(args.dateRange as DateRange);

    // Get lost calls (lost OR follow_up outcomes)
    let lostCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", start).lte("createdAt", end)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "completed"),
          q.or(
            q.eq(q.field("outcome"), "lost"),
            q.eq(q.field("outcome"), "follow_up")
          )
        )
      )
      .collect();

    if (args.closerId) {
      lostCalls = lostCalls.filter((c) => c.closerId === args.closerId);
    }

    // Get previous period for trends (lost OR follow_up)
    let prevLostCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", prevStart).lte("createdAt", prevEnd)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "completed"),
          q.or(
            q.eq(q.field("outcome"), "lost"),
            q.eq(q.field("outcome"), "follow_up")
          )
        )
      )
      .collect();

    if (args.closerId) {
      prevLostCalls = prevLostCalls.filter((c) => c.closerId === args.closerId);
    }

    // Group by primary objection
    const objectionMap: Record<string, { lostAmount: number; dealCount: number }> = {};
    const prevObjectionMap: Record<string, { lostAmount: number; dealCount: number }> = {};

    for (const call of lostCalls) {
      const objection = call.primaryObjection || "unknown";
      // Use contractValue only for consistency
      const value = call.contractValue || 0;

      if (!objectionMap[objection]) {
        objectionMap[objection] = { lostAmount: 0, dealCount: 0 };
      }
      objectionMap[objection].lostAmount += value;
      objectionMap[objection].dealCount += 1;
    }

    for (const call of prevLostCalls) {
      const objection = call.primaryObjection || "unknown";
      const value = call.contractValue || 0;

      if (!prevObjectionMap[objection]) {
        prevObjectionMap[objection] = { lostAmount: 0, dealCount: 0 };
      }
      prevObjectionMap[objection].lostAmount += value;
      prevObjectionMap[objection].dealCount += 1;
    }

    // Convert to array with trends
    const objections = Object.entries(objectionMap).map(([objection, data]) => {
      const prevData = prevObjectionMap[objection] || { lostAmount: 0, dealCount: 0 };
      const trend = prevData.lostAmount > 0
        ? ((data.lostAmount - prevData.lostAmount) / prevData.lostAmount) * 100
        : 0;

      return {
        objection,
        objectionLabel: formatObjectionLabel(objection),
        lostAmount: data.lostAmount,
        dealCount: data.dealCount,
        trend: Math.round(trend * 10) / 10,
      };
    });

    // Sort by lost amount descending
    objections.sort((a, b) => b.lostAmount - a.lostAmount);

    // Find top problem areas (trending up significantly)
    const problemAreas = objections
      .filter((o) => o.trend > 20 && o.dealCount >= 2)
      .slice(0, 2)
      .map((o) => o.objectionLabel);

    return {
      objections,
      totalLost: lostCalls.reduce((sum, c) => sum + (c.contractValue || 0), 0),
      totalDeals: lostCalls.length,
      problemAreas,
    };
  },
});

// Get closer performance breakdown
export const getCloserPerformanceBreakdown = query({
  args: {
    teamId: v.id("teams"),
    dateRange: v.string(),
  },
  handler: async (ctx, args) => {
    const { start, end } = getDateRangeTimestamps(args.dateRange as DateRange);

    // Get all closers for this team
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    // Get all completed calls in date range
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", start).lte("createdAt", end)
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    // Build breakdown per closer
    const breakdown = closers.map((closer) => {
      const closerCalls = calls.filter((c) => c.closerId === closer._id);
      const closedCalls = closerCalls.filter((c) => c.outcome === "closed");
      const lostCalls = closerCalls.filter((c) => c.outcome === "lost" || c.outcome === "follow_up");

      const pitched = closerCalls.reduce((sum, c) => sum + (c.contractValue || c.dealValue || 0), 0);
      // Use contractValue only for closed deals
      const closed = closedCalls.reduce((sum, c) => sum + (c.contractValue || 0), 0);
      const lost = lostCalls.reduce((sum, c) => sum + (c.contractValue || 0), 0);
      // Close rate: exclude no-shows from denominator
      const callsExcludingNoShows = closerCalls.filter((c) => c.outcome !== "no_show");
      const closeRate = callsExcludingNoShows.length > 0 ? (closedCalls.length / callsExcludingNoShows.length) * 100 : 0;

      // Find top objection for lost deals
      const objectionCounts: Record<string, number> = {};
      for (const call of lostCalls) {
        const obj = call.primaryObjection || "unknown";
        objectionCounts[obj] = (objectionCounts[obj] || 0) + 1;
      }

      const topObjection = Object.entries(objectionCounts)
        .sort(([, a], [, b]) => b - a)[0];

      const topObjectionLostCount = lostCalls.filter((c) => c.primaryObjection === topObjection?.[0]).length;
      const topObjectionLostAmount = lostCalls
        .filter((c) => c.primaryObjection === topObjection?.[0])
        .reduce((sum, c) => sum + (c.contractValue || 0), 0);

      return {
        closerId: closer._id,
        closerName: closer.name,
        pitched,
        closed,
        lost,
        closeRate: Math.round(closeRate * 10) / 10,
        totalCalls: closerCalls.length,
        topObjection: topObjection ? formatObjectionLabel(topObjection[0]) : null,
        topObjectionCount: topObjection ? topObjection[1] : 0,
        topObjectionLostAmount,
      };
    });

    // Sort by lost amount descending (who's losing the most)
    breakdown.sort((a, b) => b.lost - a.lost);

    // Generate insights for problem patterns
    const insights: string[] = [];
    for (const closer of breakdown) {
      if (closer.topObjectionLostAmount > 20000 && closer.topObjectionCount >= 3) {
        insights.push(
          `${closer.closerName} lost $${(closer.topObjectionLostAmount / 1000).toFixed(0)}k to ${closer.topObjection} objections — consider training`
        );
      }
    }

    return {
      breakdown,
      insights,
    };
  },
});

// Get lead quality analysis
export const getLeadQualityAnalysis = query({
  args: {
    teamId: v.id("teams"),
    dateRange: v.string(),
    closerId: v.optional(v.id("closers")),
  },
  handler: async (ctx, args) => {
    const { start, end, prevStart, prevEnd } = getDateRangeTimestamps(args.dateRange as DateRange);

    // Get completed calls with lead quality scores
    let calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", start).lte("createdAt", end)
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    if (args.closerId) {
      calls = calls.filter((c) => c.closerId === args.closerId);
    }

    // Get previous period for comparison
    let prevCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", prevStart).lte("createdAt", prevEnd)
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    if (args.closerId) {
      prevCalls = prevCalls.filter((c) => c.closerId === args.closerId);
    }

    // Calculate average lead quality score
    const callsWithScore = calls.filter((c) => c.leadQualityScore !== undefined);
    const avgScore = callsWithScore.length > 0
      ? callsWithScore.reduce((sum, c) => sum + (c.leadQualityScore || 0), 0) / callsWithScore.length
      : 0;

    const prevCallsWithScore = prevCalls.filter((c) => c.leadQualityScore !== undefined);
    const prevAvgScore = prevCallsWithScore.length > 0
      ? prevCallsWithScore.reduce((sum, c) => sum + (c.leadQualityScore || 0), 0) / prevCallsWithScore.length
      : 0;

    const scoreTrend = prevAvgScore > 0 ? ((avgScore - prevAvgScore) / prevAvgScore) * 100 : 0;

    // Distribution buckets
    const lowQuality = callsWithScore.filter((c) => (c.leadQualityScore || 0) <= 4);
    const mediumQuality = callsWithScore.filter((c) => (c.leadQualityScore || 0) >= 5 && (c.leadQualityScore || 0) <= 6);
    const highQuality = callsWithScore.filter((c) => (c.leadQualityScore || 0) >= 7);

    // High-quality leads that were lost (lost or follow_up outcomes)
    const highQualityLost = highQuality.filter((c) => c.outcome === "lost" || c.outcome === "follow_up");
    const highQualityLostValue = highQualityLost.reduce((sum, c) => sum + (c.contractValue || 0), 0);

    // Low-quality leads that were lost (lost or follow_up outcomes)
    const lowQualityLost = lowQuality.filter((c) => c.outcome === "lost" || c.outcome === "follow_up");
    const lowQualityLostValue = lowQualityLost.reduce((sum, c) => sum + (c.contractValue || 0), 0);

    // Decision maker analysis
    const nonDecisionMakerCalls = calls.filter((c) => c.prospectWasDecisionMaker === "no");
    const nonDecisionMakerPercent = calls.length > 0
      ? (nonDecisionMakerCalls.length / calls.length) * 100
      : 0;

    // Generate insights
    const insights: string[] = [];

    // Check if losing good leads
    const highQualityCloseRate = highQuality.length > 0
      ? (highQuality.filter((c) => c.outcome === "closed").length / highQuality.length) * 100
      : 0;

    if (highQualityLost.length >= 3 && highQualityCloseRate < 60) {
      insights.push("You're losing good leads. This is a sales issue, not a marketing issue.");
    }

    // Check if lead quality is the problem
    const lowQualityPercent = callsWithScore.length > 0
      ? (lowQuality.length / callsWithScore.length) * 100
      : 0;

    if (lowQualityPercent > 40) {
      insights.push("Lead quality is the problem. Talk to marketing.");
    }

    // Check decision maker issue
    if (nonDecisionMakerPercent > 30) {
      insights.push(`${Math.round(nonDecisionMakerPercent)}% of calls were with non-decision makers. Qualify for decision maker earlier.`);
    }

    return {
      avgScore: Math.round(avgScore * 10) / 10,
      scoreTrend: Math.round(scoreTrend * 10) / 10,
      distribution: {
        low: { count: lowQuality.length, label: "1-4" },
        medium: { count: mediumQuality.length, label: "5-6" },
        high: { count: highQuality.length, label: "7-10" },
      },
      highQualityLost: {
        count: highQualityLost.length,
        value: highQualityLostValue,
      },
      lowQualityLost: {
        count: lowQualityLost.length,
        value: lowQualityLostValue,
      },
      nonDecisionMakerPercent: Math.round(nonDecisionMakerPercent),
      insights,
    };
  },
});

// Get real objection analysis from user-submitted form data
export const getObjectionAnalysis = query({
  args: {
    teamId: v.id("teams"),
    dateRange: v.string(),
    closerId: v.optional(v.id("closers")),
  },
  handler: async (ctx, args) => {
    const { start, end } = getDateRangeTimestamps(args.dateRange as DateRange);

    // Get all completed calls in the period
    let calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", start).lte("createdAt", end)
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    if (args.closerId) {
      calls = calls.filter((c) => c.closerId === args.closerId);
    }

    // Split by outcome
    const lostCalls = calls.filter((c) => c.outcome === "lost" || c.outcome === "follow_up");
    const closedCalls = calls.filter((c) => c.outcome === "closed");

    // 1. Objections that caused losses (from primaryObjection on lost/follow_up)
    const lostByObjection: Record<string, { count: number; value: number }> = {};
    for (const call of lostCalls) {
      const objection = call.primaryObjection || "unknown";
      if (!lostByObjection[objection]) {
        lostByObjection[objection] = { count: 0, value: 0 };
      }
      lostByObjection[objection].count += 1;
      lostByObjection[objection].value += call.contractValue || 0;
    }

    // 2. Objections that were overcome (from objectionsOvercome on closed deals)
    const overcomeByObjection: Record<string, { count: number; value: number }> = {};
    for (const call of closedCalls) {
      const objection = call.objectionsOvercome || "none";
      if (!overcomeByObjection[objection]) {
        overcomeByObjection[objection] = { count: 0, value: 0 };
      }
      overcomeByObjection[objection].count += 1;
      overcomeByObjection[objection].value += call.contractValue || 0;
    }

    // 3. Calculate overcome rates per objection type
    // Overcome rate = overcome / (lost + overcome) for each objection type
    const allObjectionTypes = new Set([
      ...Object.keys(lostByObjection),
      ...Object.keys(overcomeByObjection),
    ]);

    // Remove 'unknown' and 'none' from comparison (they're special cases)
    allObjectionTypes.delete("unknown");
    allObjectionTypes.delete("none");

    const overcomeRates: Record<string, number> = {};
    for (const objType of allObjectionTypes) {
      const lost = lostByObjection[objType]?.count || 0;
      const overcome = overcomeByObjection[objType]?.count || 0;
      const total = lost + overcome;
      if (total > 0) {
        overcomeRates[objType] = Math.round((overcome / total) * 100);
      }
    }

    // Format for display - sort by lost value
    const lostObjections = Object.entries(lostByObjection)
      .filter(([key]) => key !== "unknown")
      .map(([objection, data]) => ({
        objection,
        objectionLabel: formatObjectionLabel(objection),
        count: data.count,
        value: data.value,
        overcomeRate: overcomeRates[objection] ?? null,
      }))
      .sort((a, b) => b.value - a.value);

    // Format overcome objections - sort by value
    const overcomeObjections = Object.entries(overcomeByObjection)
      .map(([objection, data]) => ({
        objection,
        objectionLabel: objection === "none" ? "No Objection" : formatObjectionLabel(objection),
        count: data.count,
        value: data.value,
      }))
      .sort((a, b) => b.value - a.value);

    // Generate insights based on real data
    const insights: string[] = [];

    // Highlight no-objection closes (great leads or great selling)
    const noObjectionCloses = overcomeByObjection["none"];
    if (noObjectionCloses && noObjectionCloses.count >= 3 && closedCalls.length > 0) {
      const noObjPercent = Math.round((noObjectionCloses.count / closedCalls.length) * 100);
      if (noObjPercent >= 30) {
        insights.push(
          `${noObjPercent}% of closes had no objection to overcome — great leads or smooth selling!`
        );
      }
    }

    // Find objections with low overcome rate
    for (const [objType, rate] of Object.entries(overcomeRates)) {
      const lost = lostByObjection[objType]?.count || 0;
      if (rate < 40 && lost >= 3) {
        const lostValue = lostByObjection[objType]?.value || 0;
        insights.push(
          `${formatObjectionLabel(objType)} objections: only ${rate}% overcome rate — $${Math.round(lostValue / 1000)}k lost. Focus training here.`
        );
      }
    }

    // Find objections with high overcome rate (positive)
    for (const [objType, rate] of Object.entries(overcomeRates)) {
      const overcome = overcomeByObjection[objType]?.count || 0;
      if (rate >= 60 && overcome >= 3) {
        insights.push(
          `${formatObjectionLabel(objType)} objections: ${rate}% overcome rate — team handles these well.`
        );
      }
    }

    return {
      lostObjections,
      overcomeObjections,
      overcomeRates,
      totalLost: lostCalls.length,
      totalClosed: closedCalls.length,
      totalLostValue: lostCalls.reduce((sum, c) => sum + (c.contractValue || 0), 0),
      totalClosedValue: closedCalls.reduce((sum, c) => sum + (c.contractValue || 0), 0),
      insights,
    };
  },
});

// Get all analytics for recommendations generation
export const getRecommendations = query({
  args: {
    teamId: v.id("teams"),
    dateRange: v.string(),
  },
  handler: async (ctx, args) => {
    const { start, end, prevStart, prevEnd } = getDateRangeTimestamps(args.dateRange as DateRange);

    // Get all completed calls
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", start).lte("createdAt", end)
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    const prevCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", prevStart).lte("createdAt", prevEnd)
      )
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const recommendations: Array<{ category: string; message: string; priority: number }> = [];

    // SALES TEAM: Find objection trends (lost or follow_up outcomes)
    const lostCalls = calls.filter((c) => c.outcome === "lost" || c.outcome === "follow_up");
    const prevLostCalls = prevCalls.filter((c) => c.outcome === "lost" || c.outcome === "follow_up");

    const objectionCounts: Record<string, { current: number; prev: number; value: number }> = {};

    for (const call of lostCalls) {
      const obj = call.primaryObjection || "unknown";
      if (!objectionCounts[obj]) objectionCounts[obj] = { current: 0, prev: 0, value: 0 };
      objectionCounts[obj].current += 1;
      objectionCounts[obj].value += call.contractValue || 0;
    }

    for (const call of prevLostCalls) {
      const obj = call.primaryObjection || "unknown";
      if (!objectionCounts[obj]) objectionCounts[obj] = { current: 0, prev: 0, value: 0 };
      objectionCounts[obj].prev += 1;
    }

    // Find trending up objections
    for (const [obj, counts] of Object.entries(objectionCounts)) {
      if (counts.current >= 3 && counts.prev > 0) {
        const trend = ((counts.current - counts.prev) / counts.prev) * 100;
        if (trend > 20) {
          recommendations.push({
            category: "SALES TEAM",
            message: `Train on ${formatObjectionLabel(obj)} objections — $${Math.round(counts.value / 1000)}k lost, up ${Math.round(trend)}% from last period`,
            priority: counts.value,
          });
        }
      }
    }

    // CLOSER-SPECIFIC: Find individual problem patterns
    for (const closer of closers) {
      const closerCalls = lostCalls.filter((c) => c.closerId === closer._id);
      const objCounts: Record<string, number> = {};
      let totalLost = 0;

      for (const call of closerCalls) {
        const obj = call.primaryObjection || "unknown";
        objCounts[obj] = (objCounts[obj] || 0) + 1;
        totalLost += call.contractValue || 0;
      }

      const topObj = Object.entries(objCounts).sort(([, a], [, b]) => b - a)[0];
      if (topObj && topObj[1] >= 3 && totalLost > 30000) {
        const objLost = closerCalls
          .filter((c) => c.primaryObjection === topObj[0])
          .reduce((sum, c) => sum + (c.contractValue || 0), 0);

        recommendations.push({
          category: "CLOSER-SPECIFIC",
          message: `${closer.name} needs ${formatObjectionLabel(topObj[0])} training — lost $${Math.round(objLost / 1000)}k this period`,
          priority: objLost,
        });
      }
    }

    // LEAD QUALITY: Check average score trend
    const callsWithScore = calls.filter((c) => c.leadQualityScore !== undefined);
    const prevCallsWithScore = prevCalls.filter((c) => c.leadQualityScore !== undefined);

    if (callsWithScore.length > 0 && prevCallsWithScore.length > 0) {
      const avgScore = callsWithScore.reduce((sum, c) => sum + (c.leadQualityScore || 0), 0) / callsWithScore.length;
      const prevAvgScore = prevCallsWithScore.reduce((sum, c) => sum + (c.leadQualityScore || 0), 0) / prevCallsWithScore.length;
      const scoreTrend = ((avgScore - prevAvgScore) / prevAvgScore) * 100;

      if (scoreTrend < -10) {
        recommendations.push({
          category: "LEAD QUALITY",
          message: `Lead quality score down ${Math.abs(Math.round(scoreTrend))}% — review lead sources with marketing`,
          priority: 60,
        });
      }
    }

    // Sort by priority and take top 5
    recommendations.sort((a, b) => b.priority - a.priority);

    return recommendations.slice(0, 5).map((r) => ({
      category: r.category,
      message: r.message,
    }));
  },
});

// Helper function to format objection labels
function formatObjectionLabel(objection: string): string {
  const labels: Record<string, string> = {
    spouse_partner: "Spouse/Partner",
    price_money: "Price/Money",
    timing: "Timing",
    need_to_think: "Need to think about it",
    not_qualified: "Not qualified / Bad lead",
    logistics: "Logistics",
    competitor: "Went with competitor",
    no_show_ghosted: "No-show / Ghosted",
    other: "Other",
    unknown: "Unknown",
  };

  return labels[objection] || objection;
}

// Debug query to check objection prediction accuracy
export const getObjectionPredictionAccuracy = query({
  args: {},
  handler: async (ctx) => {
    // Get all completed calls that have both ammoAnalysis and primaryObjection
    const calls = await ctx.db
      .query("calls")
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    // Filter to calls with both prediction and actual
    const callsWithBoth = calls.filter(
      (c) => c.ammoAnalysis?.objectionPrediction?.length && c.primaryObjection
    );

    // Filter to lost/not_closed calls only (where objection matters)
    const lostCalls = callsWithBoth.filter(
      (c) => c.outcome === "not_closed" || c.outcome === "lost" || c.outcome === "follow_up"
    );

    let exactMatches = 0;
    let top3Matches = 0;
    const details: Array<{
      callId: string;
      predicted: string[];
      actual: string;
      matched: boolean;
    }> = [];

    for (const call of lostCalls) {
      const predictions = call.ammoAnalysis?.objectionPrediction || [];
      const actual = call.primaryObjection;

      // Sort by probability (highest first)
      const sortedPredictions = [...predictions].sort((a, b) => b.probability - a.probability);
      const topPrediction = sortedPredictions[0]?.type;
      const top3Predictions = sortedPredictions.slice(0, 3).map((p) => p.type);

      // Normalize for comparison (handle naming differences)
      const normalizeType = (t: string) => {
        const mappings: Record<string, string[]> = {
          spouse_partner: ["spouse", "spouse_partner"],
          price_money: ["money", "price_money", "price"],
          timing: ["time", "timing", "bad_timing"],
          need_to_think: ["think_about_it", "need_to_think"],
        };
        for (const [canonical, variants] of Object.entries(mappings)) {
          if (variants.includes(t)) return canonical;
        }
        return t;
      };

      const normalizedActual = normalizeType(actual || "");
      const normalizedTop = normalizeType(topPrediction || "");
      const normalizedTop3 = top3Predictions.map(normalizeType);

      const isExactMatch = normalizedTop === normalizedActual;
      const isTop3Match = normalizedTop3.includes(normalizedActual);

      if (isExactMatch) exactMatches++;
      if (isTop3Match) top3Matches++;

      details.push({
        callId: call._id,
        predicted: sortedPredictions.map((p) => `${p.type}(${p.probability}%)`),
        actual: actual || "none",
        matched: isExactMatch,
      });
    }

    const totalWithData = lostCalls.length;
    const exactAccuracy = totalWithData > 0 ? Math.round((exactMatches / totalWithData) * 100) : 0;
    const top3Accuracy = totalWithData > 0 ? Math.round((top3Matches / totalWithData) * 100) : 0;

    return {
      summary: {
        totalCompletedCalls: calls.length,
        callsWithAmmoAnalysis: calls.filter((c) => c.ammoAnalysis).length,
        callsWithPrimaryObjection: calls.filter((c) => c.primaryObjection).length,
        lostCallsWithBothFields: totalWithData,
        exactMatchAccuracy: `${exactAccuracy}%`,
        top3Accuracy: `${top3Accuracy}%`,
      },
      breakdown: {
        exactMatches,
        top3Matches,
        totalAnalyzed: totalWithData,
      },
      sampleDetails: details.slice(0, 10), // First 10 for inspection
    };
  },
});
