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
    const totalClosed = closedCalls.reduce((sum, c) => sum + (c.cashCollected || c.contractValue || c.dealValue || 0), 0);
    const leftOnTable = totalPitched - totalClosed;
    const closeRate = calls.length > 0 ? (closedCalls.length / calls.length) * 100 : 0;

    // Calculate previous period metrics
    const prevTotalPitched = prevCalls.reduce((sum, c) => sum + (c.contractValue || c.dealValue || 0), 0);
    const prevClosedCalls = prevCalls.filter((c) => c.outcome === "closed");
    const prevTotalClosed = prevClosedCalls.reduce((sum, c) => sum + (c.cashCollected || c.contractValue || c.dealValue || 0), 0);
    const prevCloseRate = prevCalls.length > 0 ? (prevClosedCalls.length / prevCalls.length) * 100 : 0;

    // Calculate trends
    const pitchedTrend = prevTotalPitched > 0 ? ((totalPitched - prevTotalPitched) / prevTotalPitched) * 100 : 0;
    const closedTrend = prevTotalClosed > 0 ? ((totalClosed - prevTotalClosed) / prevTotalClosed) * 100 : 0;
    const closeRateTrend = prevCloseRate > 0 ? closeRate - prevCloseRate : 0;

    return {
      totalPitched,
      totalClosed,
      leftOnTable,
      closeRate: Math.round(closeRate * 10) / 10,
      totalCalls: calls.length,
      closedCalls: closedCalls.length,
      trends: {
        pitched: Math.round(pitchedTrend * 10) / 10,
        closed: Math.round(closedTrend * 10) / 10,
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

    // Get lost calls (not_closed outcome)
    let lostCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", start).lte("createdAt", end)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "completed"),
          q.eq(q.field("outcome"), "not_closed")
        )
      )
      .collect();

    if (args.closerId) {
      lostCalls = lostCalls.filter((c) => c.closerId === args.closerId);
    }

    // Get previous period for trends
    let prevLostCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", prevStart).lte("createdAt", prevEnd)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "completed"),
          q.eq(q.field("outcome"), "not_closed")
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
      const value = call.contractValue || call.dealValue || 0;

      if (!objectionMap[objection]) {
        objectionMap[objection] = { lostAmount: 0, dealCount: 0 };
      }
      objectionMap[objection].lostAmount += value;
      objectionMap[objection].dealCount += 1;
    }

    for (const call of prevLostCalls) {
      const objection = call.primaryObjection || "unknown";
      const value = call.contractValue || call.dealValue || 0;

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
      totalLost: lostCalls.reduce((sum, c) => sum + (c.contractValue || c.dealValue || 0), 0),
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
      const lostCalls = closerCalls.filter((c) => c.outcome === "not_closed");

      const pitched = closerCalls.reduce((sum, c) => sum + (c.contractValue || c.dealValue || 0), 0);
      const closed = closedCalls.reduce((sum, c) => sum + (c.cashCollected || c.contractValue || c.dealValue || 0), 0);
      const lost = lostCalls.reduce((sum, c) => sum + (c.contractValue || c.dealValue || 0), 0);
      const closeRate = closerCalls.length > 0 ? (closedCalls.length / closerCalls.length) * 100 : 0;

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
        .reduce((sum, c) => sum + (c.contractValue || c.dealValue || 0), 0);

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

    // High-quality leads that were lost
    const highQualityLost = highQuality.filter((c) => c.outcome === "not_closed");
    const highQualityLostValue = highQualityLost.reduce((sum, c) => sum + (c.contractValue || c.dealValue || 0), 0);

    // Low-quality leads that were lost
    const lowQualityLost = lowQuality.filter((c) => c.outcome === "not_closed");
    const lowQualityLostValue = lowQualityLost.reduce((sum, c) => sum + (c.contractValue || c.dealValue || 0), 0);

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

// Get detection correlations (What's Happening on Calls)
export const getDetectionCorrelations = query({
  args: {
    teamId: v.id("teams"),
    dateRange: v.string(),
    closerId: v.optional(v.id("closers")),
  },
  handler: async (ctx, args) => {
    const { start, end } = getDateRangeTimestamps(args.dateRange as DateRange);

    // Get completed calls
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

    const totalCalls = calls.length;
    if (totalCalls === 0) {
      return {
        budget: { detectionRate: 0, closeRateWith: 0, closeRateWithout: 0 },
        timeline: { detectionRate: 0, closeRateWith: 0, closeRateWithout: 0 },
        decisionMaker: { detectionRate: 0, closeRateWith: 0, closeRateWithout: 0 },
        spouse: { detectionRate: 0, closeRateWith: 0, closeRateWithout: 0 },
        insights: [],
      };
    }

    // Budget detection analysis
    const budgetDetected = calls.filter((c) => c.budgetDiscussion?.detected);
    const budgetNotDetected = calls.filter((c) => !c.budgetDiscussion?.detected);
    const budgetCloseRate = budgetDetected.length > 0
      ? (budgetDetected.filter((c) => c.outcome === "closed").length / budgetDetected.length) * 100
      : 0;
    const budgetNoCloseRate = budgetNotDetected.length > 0
      ? (budgetNotDetected.filter((c) => c.outcome === "closed").length / budgetNotDetected.length) * 100
      : 0;

    // Timeline detection analysis
    const timelineDetected = calls.filter((c) => c.timelineUrgency?.detected);
    const timelineNotDetected = calls.filter((c) => !c.timelineUrgency?.detected);
    const timelineCloseRate = timelineDetected.length > 0
      ? (timelineDetected.filter((c) => c.outcome === "closed").length / timelineDetected.length) * 100
      : 0;
    const timelineNoCloseRate = timelineNotDetected.length > 0
      ? (timelineNotDetected.filter((c) => c.outcome === "closed").length / timelineNotDetected.length) * 100
      : 0;

    // Decision maker detection analysis
    const dmDetected = calls.filter((c) => c.decisionMakerDetection?.detected);
    const dmNotDetected = calls.filter((c) => !c.decisionMakerDetection?.detected);
    const dmCloseRate = dmDetected.length > 0
      ? (dmDetected.filter((c) => c.outcome === "closed").length / dmDetected.length) * 100
      : 0;
    const dmNoCloseRate = dmNotDetected.length > 0
      ? (dmNotDetected.filter((c) => c.outcome === "closed").length / dmNotDetected.length) * 100
      : 0;

    // Spouse mention analysis
    const spouseDetected = calls.filter((c) => c.spousePartnerMentions?.detected);
    const spouseNotDetected = calls.filter((c) => !c.spousePartnerMentions?.detected);
    const spouseCloseRate = spouseDetected.length > 0
      ? (spouseDetected.filter((c) => c.outcome === "closed").length / spouseDetected.length) * 100
      : 0;
    const spouseNoCloseRate = spouseNotDetected.length > 0
      ? (spouseNotDetected.filter((c) => c.outcome === "closed").length / spouseNotDetected.length) * 100
      : 0;

    // Generate insights for gaps
    const insights: string[] = [];

    const budgetRate = (budgetDetected.length / totalCalls) * 100;
    if (budgetRate < 50 && budgetCloseRate > budgetNoCloseRate + 10) {
      insights.push(`Budget is only discussed on ${Math.round(budgetRate)}% of calls — consider adding to required discovery`);
    }

    const timelineRate = (timelineDetected.length / totalCalls) * 100;
    if (timelineRate < 50 && timelineCloseRate > timelineNoCloseRate + 10) {
      insights.push(`Timeline is only uncovered on ${Math.round(timelineRate)}% of calls — drives higher close rates`);
    }

    return {
      budget: {
        detectionRate: Math.round((budgetDetected.length / totalCalls) * 100),
        closeRateWith: Math.round(budgetCloseRate),
        closeRateWithout: Math.round(budgetNoCloseRate),
      },
      timeline: {
        detectionRate: Math.round((timelineDetected.length / totalCalls) * 100),
        closeRateWith: Math.round(timelineCloseRate),
        closeRateWithout: Math.round(timelineNoCloseRate),
      },
      decisionMaker: {
        detectionRate: Math.round((dmDetected.length / totalCalls) * 100),
        closeRateWith: Math.round(dmCloseRate),
        closeRateWithout: Math.round(dmNoCloseRate),
      },
      spouse: {
        detectionRate: Math.round((spouseDetected.length / totalCalls) * 100),
        closeRateWith: Math.round(spouseCloseRate),
        closeRateWithout: Math.round(spouseNoCloseRate),
      },
      insights,
    };
  },
});

// Get objection overcome rate (Detection vs Outcome)
export const getObjectionOvercomeRate = query({
  args: {
    teamId: v.id("teams"),
    dateRange: v.string(),
    closerId: v.optional(v.id("closers")),
  },
  handler: async (ctx, args) => {
    const { start, end } = getDateRangeTimestamps(args.dateRange as DateRange);

    // Get completed calls
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

    // Track objections detected during call vs primary loss reason
    const objectionTypes = ["spouse_partner", "price_money", "timing", "need_to_think", "not_qualified"];

    const results = objectionTypes.map((objType) => {
      // Count calls where this objection was detected during the call
      const detectedCount = calls.filter((c) =>
        c.objectionsDetected?.some((obj) => {
          const t = obj.type.toLowerCase();
          return t === objType ||
                 t.includes(objType.replace("_", " ")) ||
                 t.includes(objType.replace("_", "/"));
        })
      ).length;

      // Count calls where this was the primary loss reason
      const lostToCount = calls.filter((c) =>
        c.outcome === "not_closed" && c.primaryObjection === objType
      ).length;

      // Calculate overcome rate
      const overcomeRate = detectedCount > 0
        ? ((detectedCount - lostToCount) / detectedCount) * 100
        : 0;

      return {
        objection: objType,
        objectionLabel: formatObjectionLabel(objType),
        detectedCount,
        lostToCount,
        overcomeRate: Math.round(overcomeRate),
      };
    });

    // Filter out objections with no detections
    const filteredResults = results.filter((r) => r.detectedCount > 0 || r.lostToCount > 0);

    // Sort by detected count descending
    filteredResults.sort((a, b) => b.detectedCount - a.detectedCount);

    // Generate insights
    const insights: string[] = [];
    for (const result of filteredResults) {
      if (result.overcomeRate >= 70 && result.detectedCount >= 5) {
        insights.push(
          `${result.objectionLabel} objections are detected on ${result.detectedCount} calls but only caused ${result.lostToCount} losses — your team is overcoming ${result.overcomeRate}% of them. Good.`
        );
      } else if (result.overcomeRate < 50 && result.detectedCount >= 3) {
        insights.push(
          `${result.objectionLabel} objections: ${result.overcomeRate}% overcome rate is low. Focus training here.`
        );
      }
    }

    return {
      objections: filteredResults,
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

    // SALES TEAM: Find objection trends
    const lostCalls = calls.filter((c) => c.outcome === "not_closed");
    const prevLostCalls = prevCalls.filter((c) => c.outcome === "not_closed");

    const objectionCounts: Record<string, { current: number; prev: number; value: number }> = {};

    for (const call of lostCalls) {
      const obj = call.primaryObjection || "unknown";
      if (!objectionCounts[obj]) objectionCounts[obj] = { current: 0, prev: 0, value: 0 };
      objectionCounts[obj].current += 1;
      objectionCounts[obj].value += call.contractValue || call.dealValue || 0;
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

    // SALES PROCESS: Check detection gaps
    const totalCalls = calls.length;
    if (totalCalls > 0) {
      const budgetRate = (calls.filter((c) => c.budgetDiscussion?.detected).length / totalCalls) * 100;
      if (budgetRate < 40) {
        recommendations.push({
          category: "SALES PROCESS",
          message: `Budget is only discussed on ${Math.round(budgetRate)}% of calls — add to required discovery`,
          priority: 80,
        });
      }

      const timelineRate = (calls.filter((c) => c.timelineUrgency?.detected).length / totalCalls) * 100;
      if (timelineRate < 40) {
        recommendations.push({
          category: "SALES PROCESS",
          message: `Timeline is only uncovered on ${Math.round(timelineRate)}% of calls — add to required discovery`,
          priority: 70,
        });
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
        totalLost += call.contractValue || call.dealValue || 0;
      }

      const topObj = Object.entries(objCounts).sort(([, a], [, b]) => b - a)[0];
      if (topObj && topObj[1] >= 3 && totalLost > 30000) {
        const objLost = closerCalls
          .filter((c) => c.primaryObjection === topObj[0])
          .reduce((sum, c) => sum + (c.contractValue || c.dealValue || 0), 0);

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
