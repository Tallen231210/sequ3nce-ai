import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// DEBUG: List all closers (for debugging)
export const listAllClosers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("closers").collect();
  },
});

// Activate a closer when they log in from the desktop app
export const activateCloserByEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!closer) {
      return { success: false, error: "Closer not found" };
    }

    // Only activate if currently pending
    if (closer.status === "pending") {
      await ctx.db.patch(closer._id, {
        status: "active",
        activatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

// Get closer info by email (used by desktop app for simple login)
export const getCloserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    // Find closer by email
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!closer) {
      return null;
    }

    // Only allow active or pending closers to log in
    if (closer.status === "deactivated") {
      return null;
    }

    // Get their team
    const team = await ctx.db.get(closer.teamId);

    return {
      closerId: closer._id,
      teamId: closer.teamId,
      name: closer.name,
      email: closer.email,
      status: closer.status,
      teamName: team?.name,
    };
  },
});

// Get the current closer's info by their Clerk ID (used by desktop app)
export const getMyCloserInfo = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // Find closer by clerkId
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!closer) {
      return null;
    }

    // Get their team
    const team = await ctx.db.get(closer.teamId);

    return {
      closerId: closer._id,
      teamId: closer.teamId,
      name: closer.name,
      email: closer.email,
      status: closer.status,
      teamName: team?.name,
    };
  },
});

// Link a Clerk ID to an existing closer (called when closer signs up)
export const linkClerkToCloser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if this clerkId is already linked to a closer
    const existingByClerk = await ctx.db
      .query("closers")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existingByClerk) {
      // Already linked, return their info
      const team = await ctx.db.get(existingByClerk.teamId);
      return {
        closerId: existingByClerk._id,
        teamId: existingByClerk.teamId,
        name: existingByClerk.name,
        teamName: team?.name,
        alreadyLinked: true,
      };
    }

    // Find closer by email (they were invited by admin)
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!closer) {
      // No invitation found for this email
      return { error: "no_invitation", message: "No invitation found for this email. Please contact your team admin." };
    }

    // Link the clerkId to this closer and activate them
    await ctx.db.patch(closer._id, {
      clerkId: args.clerkId,
      status: "active",
      activatedAt: Date.now(),
    });

    const team = await ctx.db.get(closer.teamId);

    return {
      closerId: closer._id,
      teamId: closer.teamId,
      name: closer.name,
      teamName: team?.name,
      alreadyLinked: false,
    };
  },
});

// Get all closers for a team
export const getClosers = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    // First get the user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return [];
    }

    // Get all closers for this team
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    return closers;
  },
});

// Get closer counts by status
export const getCloserCounts = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return { total: 0, active: 0, pending: 0, deactivated: 0 };
    }

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    return {
      total: closers.length,
      active: closers.filter((c) => c.status === "active").length,
      pending: closers.filter((c) => c.status === "pending").length,
      deactivated: closers.filter((c) => c.status === "deactivated").length,
    };
  },
});

// Add a new closer to the team
export const addCloser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Get the user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Check if closer with this email already exists in the team
    const existingCloser = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existingCloser && existingCloser.teamId === user.teamId) {
      throw new Error("You already added a closer with that email");
    }

    // Create the closer
    const closerId = await ctx.db.insert("closers", {
      email: args.email,
      name: args.name,
      teamId: user.teamId,
      status: "pending",
      calendarConnected: false,
      invitedAt: Date.now(),
    });

    return { closerId };
  },
});

// Remove a closer from the team
export const removeCloser = mutation({
  args: {
    clerkId: v.string(),
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    // Get the user to verify they own this team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get the closer
    const closer = await ctx.db.get(args.closerId);

    if (!closer) {
      throw new Error("Closer not found");
    }

    // Verify the closer belongs to the user's team
    if (closer.teamId !== user.teamId) {
      throw new Error("You don't have permission to remove this closer");
    }

    // Delete the closer
    await ctx.db.delete(args.closerId);

    return { success: true };
  },
});

// Update closer status
export const updateCloserStatus = mutation({
  args: {
    clerkId: v.string(),
    closerId: v.id("closers"),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("deactivated")
    ),
  },
  handler: async (ctx, args) => {
    // Get the user to verify they own this team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Get the closer
    const closer = await ctx.db.get(args.closerId);

    if (!closer) {
      throw new Error("Closer not found");
    }

    // Verify the closer belongs to the user's team
    if (closer.teamId !== user.teamId) {
      throw new Error("You don't have permission to update this closer");
    }

    // Update the status
    const updates: { status: string; activatedAt?: number } = {
      status: args.status,
    };

    // Set activatedAt if activating
    if (args.status === "active" && closer.status !== "active") {
      updates.activatedAt = Date.now();
    }

    await ctx.db.patch(args.closerId, updates);

    return { success: true };
  },
});

// Helper type for closer stats
interface CloserStats {
  closerId: Id<"closers">;
  name: string;
  email: string;
  status: string;

  // Primary stats
  closeRate: number; // percentage
  cashCollected: number;
  callsTaken: number;
  avgCallLength: number; // in seconds

  // Secondary stats
  showRate: number; // percentage
  avgDealValue: number;
  followUpConversionRate: number; // percentage (for rescheduled -> closed)
  avgAmmoPerCall: number;
  talkToListenRatio: number | null; // null if not available

  // Time-based stats
  revenueThisWeek: number;
  revenueThisMonth: number;
  callsThisWeek: number;
  callsThisMonth: number;

  // Trend data (comparing current period to previous period)
  closeRateTrend: number | null; // positive = improvement, negative = decline
  cashCollectedTrend: number | null;
  callsTakenTrend: number | null;

  // For ranking
  rank: number;
}

// Get comprehensive stats for all closers on a team
export const getCloserStats = query({
  args: {
    clerkId: v.string(),
    dateRange: v.union(
      v.literal("this_week"),
      v.literal("this_month"),
      v.literal("last_30_days"),
      v.literal("all_time")
    ),
  },
  handler: async (ctx, args): Promise<CloserStats[]> => {
    // Get the user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return [];
    }

    // Get all active closers for this team
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    const activeClosers = closers.filter(
      (c) => c.status === "active" || c.status === "pending"
    );

    if (activeClosers.length === 0) {
      return [];
    }

    // Calculate date ranges
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday

    const startOfMonth = new Date(startOfToday);
    startOfMonth.setDate(1);

    const last30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // Determine the filter date based on dateRange
    let filterDate: number;
    let previousPeriodStart: number;
    let previousPeriodEnd: number;

    switch (args.dateRange) {
      case "this_week":
        filterDate = startOfWeek.getTime();
        previousPeriodStart = filterDate - 7 * 24 * 60 * 60 * 1000;
        previousPeriodEnd = filterDate;
        break;
      case "this_month":
        filterDate = startOfMonth.getTime();
        const prevMonth = new Date(startOfMonth);
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        previousPeriodStart = prevMonth.getTime();
        previousPeriodEnd = filterDate;
        break;
      case "last_30_days":
        filterDate = last30Days.getTime();
        previousPeriodStart = filterDate - 30 * 24 * 60 * 60 * 1000;
        previousPeriodEnd = filterDate;
        break;
      case "all_time":
      default:
        filterDate = 0;
        previousPeriodStart = 0;
        previousPeriodEnd = 0;
        break;
    }

    // Get all calls for the team
    const allCalls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    // Get all ammo for the team
    const allAmmo = await ctx.db
      .query("ammo")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    // Create ammo count per call map
    const ammoPerCall = new Map<string, number>();
    for (const ammo of allAmmo) {
      const current = ammoPerCall.get(ammo.callId) || 0;
      ammoPerCall.set(ammo.callId, current + 1);
    }

    // Calculate stats for each closer
    const closerStatsMap = new Map<string, CloserStats>();

    for (const closer of activeClosers) {
      // Filter calls for this closer
      const closerCalls = allCalls.filter((c) => c.closerId === closer._id);

      // Current period calls
      const periodCalls = closerCalls.filter(
        (c) => c.createdAt >= filterDate
      );

      // Previous period calls (for trends)
      const prevPeriodCalls = args.dateRange !== "all_time"
        ? closerCalls.filter(
            (c) => c.createdAt >= previousPeriodStart && c.createdAt < previousPeriodEnd
          )
        : [];

      // Completed calls in period
      const completedCalls = periodCalls.filter((c) => c.status === "completed");
      const prevCompletedCalls = prevPeriodCalls.filter((c) => c.status === "completed");

      // Closed deals
      const closedCalls = completedCalls.filter((c) => c.outcome === "closed");
      const prevClosedCalls = prevCompletedCalls.filter((c) => c.outcome === "closed");

      // Calculate close rate
      const closeRate = completedCalls.length > 0
        ? (closedCalls.length / completedCalls.length) * 100
        : 0;
      const prevCloseRate = prevCompletedCalls.length > 0
        ? (prevClosedCalls.length / prevCompletedCalls.length) * 100
        : null;

      // Cash collected
      const cashCollected = closedCalls.reduce((sum, c) => sum + (c.dealValue || 0), 0);
      const prevCashCollected = prevClosedCalls.reduce((sum, c) => sum + (c.dealValue || 0), 0);

      // Calls taken
      const callsTaken = completedCalls.length;
      const prevCallsTaken = prevCompletedCalls.length;

      // Average call length
      const callsWithDuration = completedCalls.filter((c) => c.duration && c.duration > 0);
      const avgCallLength = callsWithDuration.length > 0
        ? callsWithDuration.reduce((sum, c) => sum + (c.duration || 0), 0) / callsWithDuration.length
        : 0;

      // Show rate (scheduled calls that actually happened vs no-shows)
      const scheduledCalls = periodCalls.filter(
        (c) => c.status === "completed" || c.outcome === "no_show"
      );
      const actualCalls = scheduledCalls.filter((c) => c.status === "completed");
      const showRate = scheduledCalls.length > 0
        ? (actualCalls.length / scheduledCalls.length) * 100
        : 100; // Default to 100% if no scheduled calls

      // Average deal value
      const avgDealValue = closedCalls.length > 0
        ? cashCollected / closedCalls.length
        : 0;

      // Follow-up conversion rate (rescheduled -> eventually closed)
      // We'll approximate this by looking at calls marked as rescheduled
      // In practice, this would need a more complex tracking system
      const rescheduledCalls = periodCalls.filter((c) => c.outcome === "rescheduled");
      const followUpConversionRate = 0; // Placeholder - needs additional tracking

      // Average ammo per call
      const callAmmos = completedCalls.map((c) => ammoPerCall.get(c._id) || 0);
      const avgAmmoPerCall = callAmmos.length > 0
        ? callAmmos.reduce((sum, count) => sum + count, 0) / callAmmos.length
        : 0;

      // Talk-to-listen ratio (would need transcript analysis)
      // For now, we'll leave it as null since we don't have speaker-level data
      const talkToListenRatio: number | null = null;

      // Time-based stats (always calculate from actual week/month regardless of filter)
      const weekCalls = closerCalls.filter((c) => c.createdAt >= startOfWeek.getTime() && c.status === "completed");
      const monthCalls = closerCalls.filter((c) => c.createdAt >= startOfMonth.getTime() && c.status === "completed");

      const weekClosedCalls = weekCalls.filter((c) => c.outcome === "closed");
      const monthClosedCalls = monthCalls.filter((c) => c.outcome === "closed");

      const revenueThisWeek = weekClosedCalls.reduce((sum, c) => sum + (c.dealValue || 0), 0);
      const revenueThisMonth = monthClosedCalls.reduce((sum, c) => sum + (c.dealValue || 0), 0);

      // Calculate trends
      const closeRateTrend = prevCloseRate !== null && prevCloseRate > 0
        ? closeRate - prevCloseRate
        : null;

      const cashCollectedTrend = prevCashCollected > 0
        ? ((cashCollected - prevCashCollected) / prevCashCollected) * 100
        : null;

      const callsTakenTrend = prevCallsTaken > 0
        ? ((callsTaken - prevCallsTaken) / prevCallsTaken) * 100
        : null;

      closerStatsMap.set(closer._id, {
        closerId: closer._id,
        name: closer.name,
        email: closer.email,
        status: closer.status,
        closeRate,
        cashCollected,
        callsTaken,
        avgCallLength,
        showRate,
        avgDealValue,
        followUpConversionRate,
        avgAmmoPerCall,
        talkToListenRatio,
        revenueThisWeek,
        revenueThisMonth,
        callsThisWeek: weekCalls.length,
        callsThisMonth: monthCalls.length,
        closeRateTrend,
        cashCollectedTrend,
        callsTakenTrend,
        rank: 0, // Will be set after sorting
      });
    }

    // Convert to array and sort by close rate for ranking
    const statsArray = Array.from(closerStatsMap.values());
    statsArray.sort((a, b) => b.closeRate - a.closeRate);

    // Assign ranks (handle ties)
    let currentRank = 1;
    for (let i = 0; i < statsArray.length; i++) {
      if (i > 0 && statsArray[i].closeRate < statsArray[i - 1].closeRate) {
        currentRank = i + 1;
      }
      statsArray[i].rank = currentRank;
    }

    return statsArray;
  },
});

// Team aggregate stats interface
interface TeamStats {
  // Current period stats
  totalCashCollected: number;
  totalClosedDeals: number;
  totalCallsTaken: number;
  teamCloseRate: number;
  averageDealValue: number;
  showRate: number;
  // Previous period stats for trends
  previousCashCollected: number;
  previousClosedDeals: number;
  previousCallsTaken: number;
  previousCloseRate: number;
  previousAverageDealValue: number;
  previousShowRate: number;
  // Calculated trends (percentage change)
  cashCollectedTrend: number | null;
  closedDealsTrend: number | null;
  callsTakenTrend: number | null;
  closeRateTrend: number | null;
  averageDealValueTrend: number | null;
  showRateTrend: number | null;
}

// Get aggregate team stats
export const getTeamStats = query({
  args: {
    clerkId: v.string(),
    dateRange: v.union(
      v.literal("this_week"),
      v.literal("this_month"),
      v.literal("last_30_days"),
      v.literal("all_time")
    ),
  },
  handler: async (ctx, args): Promise<TeamStats | null> => {
    // Get the user to find their team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return null;
    }

    // Calculate date ranges
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday

    const startOfMonth = new Date(startOfToday);
    startOfMonth.setDate(1);

    const last30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);

    // Determine the filter date based on dateRange
    let filterDate: number;
    let previousPeriodStart: number;
    let previousPeriodEnd: number;

    switch (args.dateRange) {
      case "this_week":
        filterDate = startOfWeek.getTime();
        previousPeriodStart = filterDate - 7 * 24 * 60 * 60 * 1000;
        previousPeriodEnd = filterDate;
        break;
      case "this_month":
        filterDate = startOfMonth.getTime();
        const prevMonth = new Date(startOfMonth);
        prevMonth.setMonth(prevMonth.getMonth() - 1);
        previousPeriodStart = prevMonth.getTime();
        previousPeriodEnd = filterDate;
        break;
      case "last_30_days":
        filterDate = last30Days.getTime();
        previousPeriodStart = filterDate - 30 * 24 * 60 * 60 * 1000;
        previousPeriodEnd = filterDate;
        break;
      case "all_time":
      default:
        filterDate = 0;
        previousPeriodStart = 0;
        previousPeriodEnd = 0;
        break;
    }

    // Get all calls for the team
    const allCalls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", user.teamId))
      .collect();

    // Current period calls
    const periodCalls = allCalls.filter((c) => c.createdAt >= filterDate);

    // Previous period calls (for trends)
    const prevPeriodCalls = args.dateRange !== "all_time"
      ? allCalls.filter(
          (c) => c.createdAt >= previousPeriodStart && c.createdAt < previousPeriodEnd
        )
      : [];

    // Current period stats
    const completedCalls = periodCalls.filter((c) => c.status === "completed");
    const closedCalls = completedCalls.filter((c) => c.outcome === "closed");

    const totalCashCollected = closedCalls.reduce((sum, c) => sum + (c.dealValue || 0), 0);
    const totalClosedDeals = closedCalls.length;
    const totalCallsTaken = completedCalls.length;
    const teamCloseRate = completedCalls.length > 0
      ? (closedCalls.length / completedCalls.length) * 100
      : 0;
    const averageDealValue = closedCalls.length > 0
      ? totalCashCollected / closedCalls.length
      : 0;

    // Show rate (scheduled calls that actually happened vs no-shows)
    const scheduledCalls = periodCalls.filter(
      (c) => c.status === "completed" || c.outcome === "no_show"
    );
    const actualCalls = scheduledCalls.filter((c) => c.status === "completed");
    const showRate = scheduledCalls.length > 0
      ? (actualCalls.length / scheduledCalls.length) * 100
      : 100;

    // Previous period stats
    const prevCompletedCalls = prevPeriodCalls.filter((c) => c.status === "completed");
    const prevClosedCalls = prevCompletedCalls.filter((c) => c.outcome === "closed");

    const previousCashCollected = prevClosedCalls.reduce((sum, c) => sum + (c.dealValue || 0), 0);
    const previousClosedDeals = prevClosedCalls.length;
    const previousCallsTaken = prevCompletedCalls.length;
    const previousCloseRate = prevCompletedCalls.length > 0
      ? (prevClosedCalls.length / prevCompletedCalls.length) * 100
      : 0;
    const previousAverageDealValue = prevClosedCalls.length > 0
      ? previousCashCollected / prevClosedCalls.length
      : 0;

    // Previous show rate
    const prevScheduledCalls = prevPeriodCalls.filter(
      (c) => c.status === "completed" || c.outcome === "no_show"
    );
    const prevActualCalls = prevScheduledCalls.filter((c) => c.status === "completed");
    const previousShowRate = prevScheduledCalls.length > 0
      ? (prevActualCalls.length / prevScheduledCalls.length) * 100
      : 100;

    // Calculate percentage change trends (only if we have previous data)
    const calculateTrend = (current: number, previous: number): number | null => {
      if (args.dateRange === "all_time") return null;
      if (previous === 0) {
        // If previous is 0 and current > 0, show as positive (but can't calculate percentage)
        return current > 0 ? 100 : null;
      }
      return ((current - previous) / previous) * 100;
    };

    // For rate trends, use the difference in points rather than percentage change
    const calculateRateTrend = (current: number, previous: number): number | null => {
      if (args.dateRange === "all_time") return null;
      if (previous === 0 && current === 0) return null;
      return current - previous; // Points difference
    };

    return {
      totalCashCollected,
      totalClosedDeals,
      totalCallsTaken,
      teamCloseRate,
      averageDealValue,
      showRate,
      previousCashCollected,
      previousClosedDeals,
      previousCallsTaken,
      previousCloseRate,
      previousAverageDealValue,
      previousShowRate,
      cashCollectedTrend: calculateTrend(totalCashCollected, previousCashCollected),
      closedDealsTrend: calculateTrend(totalClosedDeals, previousClosedDeals),
      callsTakenTrend: calculateTrend(totalCallsTaken, previousCallsTaken),
      closeRateTrend: calculateRateTrend(teamCloseRate, previousCloseRate),
      averageDealValueTrend: calculateTrend(averageDealValue, previousAverageDealValue),
      showRateTrend: calculateRateTrend(showRate, previousShowRate),
    };
  },
});

// Get live call status for closers (who is on a call right now)
export const getCloserLiveStatus = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return {};
    }

    // Get live calls (waiting or on_call)
    const liveCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_status", (q) =>
        q.eq("teamId", user.teamId).eq("status", "on_call")
      )
      .collect();

    const waitingCalls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_status", (q) =>
        q.eq("teamId", user.teamId).eq("status", "waiting")
      )
      .collect();

    // Map closer ID to their current call status
    const liveStatusMap: Record<string, "on_call" | "waiting"> = {};

    for (const call of liveCalls) {
      liveStatusMap[call.closerId] = "on_call";
    }

    for (const call of waitingCalls) {
      if (!liveStatusMap[call.closerId]) {
        liveStatusMap[call.closerId] = "waiting";
      }
    }

    return liveStatusMap;
  },
});
