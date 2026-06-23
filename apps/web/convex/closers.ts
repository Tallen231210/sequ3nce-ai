import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import { api } from "./_generated/api";

// Simple password hashing using Web Crypto API (available in Convex runtime)
// In production, you might want to use a more robust solution
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
}



// Update lastSeenAt timestamp when closer's app polls for messages
// Called from HTTP endpoint to track "last active" status
export const updateLastSeenAt = internalMutation({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.closerId, {
      lastSeenAt: Date.now(),
    });
  },
});

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

// Get closer by ID (used for Slack notifications)
export const getCloserById = query({
  args: { closerId: v.string() },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId as any);
    return closer;
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

    // Normalize email to lowercase
    const email = args.email.trim().toLowerCase();

    // Check if closer with this email already exists in the team
    const existingCloser = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existingCloser && existingCloser.teamId === user.teamId) {
      throw new Error("You already added a closer with that email");
    }

    // Create the closer
    const closerId = await ctx.db.insert("closers", {
      email,
      name: args.name,
      teamId: user.teamId,
      status: "pending",
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
  calendarProvider?: string;

  // Primary stats
  closeRate: number; // percentage
  cashCollected: number; // Uses cashCollected field (upfront payments)
  callsTaken: number;
  avgCallLength: number; // in seconds

  // NEW: Split revenue metrics (only from calls with new fields)
  totalCashCollected: number; // Sum of cashCollected field (upfront payments)
  totalContractValue: number; // Sum of contractValue field (total commitments)
  avgContractValue: number; // Average contract size

  // Revenue per call / per sit
  revenuePerCallCash: number;
  revenuePerCallContract: number;
  revenuePerSitCash: number;
  revenuePerSitContract: number;
  revenuePerCallTrend: number | null;
  revenuePerSitTrend: number | null;

  // Secondary stats
  showRate: number; // percentage
  avgDealValue: number;
  followUpConversionRate: number; // percentage (for rescheduled -> closed)
  avgAmmoPerCall: number;
  talkToListenRatio: number | null; // null if not available

  // Time-based stats
  revenueThisWeek: number;
  revenueThisMonth: number;
  cashCollectedThisWeek: number; // NEW: Upfront payments this week
  cashCollectedThisMonth: number; // NEW: Upfront payments this month
  contractValueThisWeek: number; // NEW: Contract value this week
  contractValueThisMonth: number; // NEW: Contract value this month
  callsThisWeek: number;
  callsThisMonth: number;

  // Trend data (comparing current period to previous period)
  closeRateTrend: number | null; // positive = improvement, negative = decline
  cashCollectedTrend: number | null;
  contractValueTrend: number | null; // NEW
  callsTakenTrend: number | null;

  // For ranking
  rank: number;
}

// Get comprehensive stats for all closers on a team
export const getCloserStats = query({
  args: {
    clerkId: v.string(),
    dateRange: v.union(
      v.literal("today"),
      v.literal("this_week"),
      v.literal("this_month"),
      v.literal("last_30_days"),
      v.literal("all_time"),
      v.literal("custom")
    ),
    customStart: v.optional(v.number()),
    customEnd: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<CloserStats[]> => {
    try {
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
      case "custom":
        if (args.customStart != null && args.customEnd != null) {
          filterDate = args.customStart;
          const customDuration = args.customEnd - args.customStart;
          previousPeriodStart = args.customStart - customDuration;
          previousPeriodEnd = args.customStart;
        } else {
          filterDate = last30Days.getTime();
          previousPeriodStart = filterDate - 30 * 24 * 60 * 60 * 1000;
          previousPeriodEnd = filterDate;
        }
        break;
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

    // Handle "today" case for filterDate
    if (args.dateRange === "today") {
      filterDate = startOfToday.getTime();
      previousPeriodStart = filterDate - 24 * 60 * 60 * 1000;
      previousPeriodEnd = filterDate;
    }

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

    // Read from callStats sidecar — see comment in getTeamStats. Scans
    // are safe at any size because the sidecar has no transcript blobs.
    const scanFloor =
      args.dateRange === "all_time"
        ? 0
        : Math.min(
            filterDate,
            previousPeriodStart || filterDate,
            startOfWeek.getTime(),
            startOfMonth.getTime(),
          );
    const teamCalls = await ctx.db
      .query("callStats")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", user.teamId).gte("createdAt", scanFloor),
      )
      .collect();

    const callsByCloser = new Map<string, typeof teamCalls>();
    for (const c of teamCalls) {
      const list = callsByCloser.get(c.closerId);
      if (list) list.push(c);
      else callsByCloser.set(c.closerId, [c]);
    }

    // Calculate stats for each closer
    const closerStatsMap = new Map<string, CloserStats>();

    for (const closer of activeClosers) {
      const closerCalls = callsByCloser.get(closer._id) ?? [];

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

      // Completed calls in period (only count calls with outcome set - matches Completed Calls view)
      const completedCalls = periodCalls.filter((c) => c.status === "completed" && c.outcome != null);
      const prevCompletedCalls = prevPeriodCalls.filter((c) => c.status === "completed" && c.outcome != null);

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

      // Cash collected - uses the cashCollected field (upfront payments)
      const cashCollected = closedCalls.reduce((sum, c) => sum + (c.cashCollected || 0), 0);
      const prevCashCollected = prevClosedCalls.reduce((sum, c) => sum + (c.cashCollected || 0), 0);

      // NEW: Split metrics (only from calls with the new fields)
      const callsWithNewFields = closedCalls.filter((c) => c.contractValue !== undefined);
      const prevCallsWithNewFields = prevClosedCalls.filter((c) => c.contractValue !== undefined);

      const totalCashCollected = callsWithNewFields.reduce((sum, c) => sum + (c.cashCollected || 0), 0);
      const totalContractValue = callsWithNewFields.reduce((sum, c) => sum + (c.contractValue || 0), 0);
      const prevTotalContractValue = prevCallsWithNewFields.reduce((sum, c) => sum + (c.contractValue || 0), 0);

      const avgContractValue = callsWithNewFields.length > 0
        ? totalContractValue / callsWithNewFields.length
        : 0;

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

      // Revenue Per Call / Revenue Per Sit
      const nonNoShowCalls = completedCalls.filter((c) => c.outcome !== "no_show");
      const revenuePerCallCash = completedCalls.length > 0 ? Math.round(cashCollected / completedCalls.length) : 0;
      const revenuePerCallContract = completedCalls.length > 0 ? Math.round(totalContractValue / completedCalls.length) : 0;
      const revenuePerSitCash = nonNoShowCalls.length > 0 ? Math.round(cashCollected / nonNoShowCalls.length) : 0;
      const revenuePerSitContract = nonNoShowCalls.length > 0 ? Math.round(totalContractValue / nonNoShowCalls.length) : 0;

      // Revenue per call/sit trends (vs previous period)
      const prevNonNoShowCalls = prevCompletedCalls.filter((c) => c.outcome !== "no_show");
      const prevRPCCash = prevCompletedCalls.length > 0 ? prevCashCollected / prevCompletedCalls.length : 0;
      const prevRPSCash = prevNonNoShowCalls.length > 0 ? prevCashCollected / prevNonNoShowCalls.length : 0;
      const revenuePerCallTrend = prevRPCCash > 0
        ? Math.round(((revenuePerCallCash - prevRPCCash) / prevRPCCash) * 100)
        : null;
      const revenuePerSitTrend = prevRPSCash > 0
        ? Math.round(((revenuePerSitCash - prevRPSCash) / prevRPSCash) * 100)
        : null;

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

      // Legacy revenue (uses dealValue)
      const revenueThisWeek = weekClosedCalls.reduce((sum, c) => sum + (c.dealValue || 0), 0);
      const revenueThisMonth = monthClosedCalls.reduce((sum, c) => sum + (c.dealValue || 0), 0);

      // NEW: Split metrics for week/month (only from calls with new fields)
      const weekNewFieldCalls = weekClosedCalls.filter((c) => c.contractValue !== undefined);
      const monthNewFieldCalls = monthClosedCalls.filter((c) => c.contractValue !== undefined);

      const cashCollectedThisWeek = weekNewFieldCalls.reduce((sum, c) => sum + (c.cashCollected || 0), 0);
      const cashCollectedThisMonth = monthNewFieldCalls.reduce((sum, c) => sum + (c.cashCollected || 0), 0);
      const contractValueThisWeek = weekNewFieldCalls.reduce((sum, c) => sum + (c.contractValue || 0), 0);
      const contractValueThisMonth = monthNewFieldCalls.reduce((sum, c) => sum + (c.contractValue || 0), 0);

      // Calculate trends
      const closeRateTrend = prevCloseRate !== null && prevCloseRate > 0
        ? closeRate - prevCloseRate
        : null;

      const cashCollectedTrend = prevCashCollected > 0
        ? ((cashCollected - prevCashCollected) / prevCashCollected) * 100
        : null;

      // NEW: Contract value trend
      const contractValueTrend = prevTotalContractValue > 0
        ? ((totalContractValue - prevTotalContractValue) / prevTotalContractValue) * 100
        : null;

      const callsTakenTrend = prevCallsTaken > 0
        ? ((callsTaken - prevCallsTaken) / prevCallsTaken) * 100
        : null;

      closerStatsMap.set(closer._id, {
        closerId: closer._id,
        name: closer.name,
        email: closer.email,
        status: closer.status,
        calendarProvider: closer.calendarProvider,
        closeRate,
        cashCollected,
        callsTaken,
        avgCallLength,
        // NEW: Split metrics
        totalCashCollected,
        totalContractValue,
        avgContractValue,
        revenuePerCallCash,
        revenuePerCallContract,
        revenuePerSitCash,
        revenuePerSitContract,
        revenuePerCallTrend,
        revenuePerSitTrend,
        showRate,
        avgDealValue,
        followUpConversionRate,
        avgAmmoPerCall,
        talkToListenRatio,
        revenueThisWeek,
        revenueThisMonth,
        cashCollectedThisWeek,
        cashCollectedThisMonth,
        contractValueThisWeek,
        contractValueThisMonth,
        callsThisWeek: weekCalls.length,
        callsThisMonth: monthCalls.length,
        closeRateTrend,
        cashCollectedTrend,
        contractValueTrend,
        callsTakenTrend,
        rank: 0, // Will be set after sorting
      });
    }

    // Convert to array and sort by cash collected for ranking
    const statsArray = Array.from(closerStatsMap.values());
    statsArray.sort((a, b) => b.cashCollected - a.cashCollected);

    // Assign ranks (handle ties)
    let currentRank = 1;
    for (let i = 0; i < statsArray.length; i++) {
      if (i > 0 && statsArray[i].cashCollected < statsArray[i - 1].cashCollected) {
        currentRank = i + 1;
      }
      statsArray[i].rank = currentRank;
    }

    return statsArray;
    } catch (err) {
      // The most likely failure here is Convex's 16 MiB per-query read
      // limit on extreme-history teams (calls carry transcript + AI
      // analysis blobs). We log and return an empty array so the
      // dashboard renders an empty state instead of throwing into the
      // useQuery propagation chain and crashing the entire page —
      // same defensive pattern callReviews:getUnreadReplyCount uses.
      // TODO: long-term fix is splitting transcript + callAnalysis
      // off the calls table into a sibling table joined by callId so
      // stat queries don't pay the blob-read cost.
      console.error("[closers.getCloserStats] failed:", err);
      return [];
    }
  },
});

// Team aggregate stats interface
interface TeamStats {
  // Current period stats (legacy - uses dealValue)
  totalCashCollected: number;
  totalClosedDeals: number;
  totalCallsTaken: number;
  teamCloseRate: number;
  averageDealValue: number;
  showRate: number;

  // NEW: Split revenue metrics (only from calls with new fields)
  teamCashCollected: number; // Sum of cashCollected field (upfront payments)
  teamContractValue: number; // Sum of contractValue field (total commitments)
  avgContractValue: number; // Average contract size

  // Previous period stats for trends
  previousCashCollected: number;
  previousClosedDeals: number;
  previousCallsTaken: number;
  previousCloseRate: number;
  previousAverageDealValue: number;
  previousShowRate: number;
  previousContractValue: number; // NEW

  // Calculated trends (percentage change)
  cashCollectedTrend: number | null;
  closedDealsTrend: number | null;
  callsTakenTrend: number | null;
  closeRateTrend: number | null;
  averageDealValueTrend: number | null;
  showRateTrend: number | null;
  contractValueTrend: number | null; // NEW
}

// Get aggregate team stats
export const getTeamStats = query({
  args: {
    clerkId: v.string(),
    dateRange: v.union(
      v.literal("today"),
      v.literal("this_week"),
      v.literal("this_month"),
      v.literal("last_30_days"),
      v.literal("all_time"),
      v.literal("custom")
    ),
    customStart: v.optional(v.number()),
    customEnd: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<TeamStats | null> => {
    try {
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
      case "custom":
        if (args.customStart != null && args.customEnd != null) {
          filterDate = args.customStart;
          const customDuration = args.customEnd - args.customStart;
          previousPeriodStart = args.customStart - customDuration;
          previousPeriodEnd = args.customStart;
        } else {
          filterDate = last30Days.getTime();
          previousPeriodStart = filterDate - 30 * 24 * 60 * 60 * 1000;
          previousPeriodEnd = filterDate;
        }
        break;
      case "this_week":
        filterDate = startOfWeek.getTime();
        previousPeriodStart = filterDate - 7 * 24 * 60 * 60 * 1000;
        previousPeriodEnd = filterDate;
        break;
      case "this_month":
        filterDate = startOfMonth.getTime();
        const prevMonth2 = new Date(startOfMonth);
        prevMonth2.setMonth(prevMonth2.getMonth() - 1);
        previousPeriodStart = prevMonth2.getTime();
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

    // Handle "today" case for filterDate
    if (args.dateRange === "today") {
      filterDate = startOfToday.getTime();
      previousPeriodStart = filterDate - 24 * 60 * 60 * 1000;
      previousPeriodEnd = filterDate;
    }

    // Read from the callStats sidecar instead of the calls table. The
    // sidecar holds only the thin fields stats queries need (no
    // transcript / ammoAnalysis / callAnalysis blobs), so even "all_time"
    // scans on high-volume teams stay under Convex's 16 MiB per-query
    // read limit. Kept in sync by the call-stats-reconcile cron in
    // crons.ts (every 5 min, 2h window).
    const scanFloor =
      args.dateRange === "all_time"
        ? 0
        : Math.min(filterDate, previousPeriodStart || filterDate);
    const allCalls = await ctx.db
      .query("callStats")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", user.teamId).gte("createdAt", scanFloor),
      )
      .collect();

    // Current period calls
    const periodCalls = allCalls.filter((c) => c.createdAt >= filterDate);

    // Previous period calls (for trends)
    const prevPeriodCalls = args.dateRange !== "all_time"
      ? allCalls.filter(
          (c) => c.createdAt >= previousPeriodStart && c.createdAt < previousPeriodEnd
        )
      : [];

    // Current period stats (only count calls with outcome set - matches Completed Calls view)
    const completedCalls = periodCalls.filter((c) => c.status === "completed" && c.outcome != null);
    const closedCalls = completedCalls.filter((c) => c.outcome === "closed");

    // Legacy metrics (uses dealValue)
    const totalCashCollected = closedCalls.reduce((sum, c) => sum + (c.dealValue || 0), 0);
    const totalClosedDeals = closedCalls.length;
    const totalCallsTaken = completedCalls.length;
    const teamCloseRate = completedCalls.length > 0
      ? (closedCalls.length / completedCalls.length) * 100
      : 0;
    const averageDealValue = closedCalls.length > 0
      ? totalCashCollected / closedCalls.length
      : 0;

    // NEW: Split metrics (only from calls with new fields)
    const callsWithNewFields = closedCalls.filter((c) => c.contractValue !== undefined);
    const teamCashCollected = callsWithNewFields.reduce((sum, c) => sum + (c.cashCollected || 0), 0);
    const teamContractValue = callsWithNewFields.reduce((sum, c) => sum + (c.contractValue || 0), 0);
    const avgContractValue = callsWithNewFields.length > 0
      ? teamContractValue / callsWithNewFields.length
      : 0;

    // Show rate (scheduled calls that actually happened vs no-shows)
    const scheduledCalls = periodCalls.filter(
      (c) => c.status === "completed" || c.outcome === "no_show"
    );
    const actualCalls = scheduledCalls.filter((c) => c.status === "completed");
    const showRate = scheduledCalls.length > 0
      ? (actualCalls.length / scheduledCalls.length) * 100
      : 100;

    // Previous period stats (only count calls with outcome set)
    const prevCompletedCalls = prevPeriodCalls.filter((c) => c.status === "completed" && c.outcome != null);
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

    // NEW: Previous contract value (only from calls with new fields)
    const prevCallsWithNewFields = prevClosedCalls.filter((c) => c.contractValue !== undefined);
    const previousContractValue = prevCallsWithNewFields.reduce((sum, c) => sum + (c.contractValue || 0), 0);

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
      // NEW: Split metrics
      teamCashCollected,
      teamContractValue,
      avgContractValue,
      previousCashCollected,
      previousClosedDeals,
      previousCallsTaken,
      previousCloseRate,
      previousAverageDealValue,
      previousShowRate,
      previousContractValue,
      cashCollectedTrend: calculateTrend(totalCashCollected, previousCashCollected),
      closedDealsTrend: calculateTrend(totalClosedDeals, previousClosedDeals),
      callsTakenTrend: calculateTrend(totalCallsTaken, previousCallsTaken),
      closeRateTrend: calculateRateTrend(teamCloseRate, previousCloseRate),
      averageDealValueTrend: calculateTrend(averageDealValue, previousAverageDealValue),
      showRateTrend: calculateRateTrend(showRate, previousShowRate),
      contractValueTrend: calculateTrend(teamContractValue, previousContractValue),
    };
    } catch (err) {
      // Graceful degradation: log, return null. The Closer Stats tab
      // renders an empty state instead of crashing the route. Same
      // pattern as getCloserStats (commit f52e382).
      console.error("[getTeamStats] failed:", err);
      return null;
    }
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

// ==================== CLOSER AUTHENTICATION ====================

// Login a closer with email and password (for desktop app)
export const loginCloser = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const password = args.password.trim();
    console.log("[loginCloser] Attempting login for email:", email);

    // Find ALL closers with this email (might be in multiple teams)
    const closersWithEmail = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();

    if (closersWithEmail.length === 0) {
      console.log("[loginCloser] FAILED: No closer found with email:", email);
      return { success: false, error: "Invalid email or password" };
    }

    console.log("[loginCloser] Found", closersWithEmail.length, "closer(s) with this email");

    // Try to find a closer whose password matches
    let matchedCloser = null;
    for (const closer of closersWithEmail) {
      // Skip deactivated accounts
      if (closer.status === "deactivated") {
        console.log("[loginCloser] Skipping deactivated closer:", closer._id);
        continue;
      }

      // Skip if no password hash
      if (!closer.passwordHash) {
        console.log("[loginCloser] Skipping closer without password:", closer._id);
        continue;
      }

      // Try to verify password
      const isValid = await verifyPassword(password, closer.passwordHash);
      if (isValid) {
        matchedCloser = closer;
        console.log("[loginCloser] Password matched for closer:", closer._id);
        break;
      } else {
        console.log("[loginCloser] Password did not match for closer:", closer._id);
      }
    }

    if (!matchedCloser) {
      console.log("[loginCloser] FAILED: No matching password found for any closer with this email");
      return { success: false, error: "Invalid email or password" };
    }

    const closer = matchedCloser;
    console.log("[loginCloser] SUCCESS: Login verified for closer:", closer._id);

    // Update last login and activate if pending
    const updates: { lastLoginAt: number; status?: string; activatedAt?: number } = {
      lastLoginAt: Date.now(),
    };

    if (closer.status === "pending") {
      updates.status = "active";
      updates.activatedAt = Date.now();
    }

    await ctx.db.patch(closer._id, updates);

    // Get team info
    const team = await ctx.db.get(closer.teamId);

    return {
      success: true,
      closer: {
        closerId: closer._id,
        teamId: closer.teamId,
        name: closer.name,
        email: closer.email,
        status: updates.status || closer.status,
        teamName: team?.name,
      },
    };
  },
});

/**
 * @deprecated Use `addCloserViaMagicLink` instead. Kept for emergency
 * / legacy API consumers. The manager UI no longer surfaces this path.
 * New closers should be magic-link only — no password at rest.
 */
export const addCloserWithPassword = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    password: v.string(),
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

    const email = args.email.trim().toLowerCase();

    // Check if closer with this email already exists in the team
    const existingCloser = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existingCloser && existingCloser.teamId === user.teamId) {
      throw new Error("You already added a closer with that email");
    }

    // Validate password
    if (args.password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    // Hash the password
    const passwordHash = await hashPassword(args.password);

    // Create the closer with password
    const closerId = await ctx.db.insert("closers", {
      email,
      name: args.name,
      teamId: user.teamId,
      status: "pending",
      passwordHash,
      invitedAt: Date.now(),
    });

    return { closerId };
  },
});

/**
 * Manager-facing add-closer mutation. Creates the closer record (no
 * passwordHash) and schedules a magic-link email so the closer can
 * sign in immediately. Used by /dashboard/team's add form.
 *
 * Email send is fire-and-forget — failures are logged inside the
 * action but don't roll back the closer creation. Manager can always
 * use the "Resend sign-in link" dropdown action.
 */
export const addCloserViaMagicLink = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args): Promise<{ closerId: Id<"closers"> }> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) throw new Error("User not found");

    const email = args.email.trim().toLowerCase();
    if (!email || !args.name.trim()) {
      throw new Error("Name and email are required");
    }
    // Validate before insert — otherwise the closer record gets
    // created but the magic-link send silently no-ops on its own
    // EMAIL_REGEX check inside the action, leaving the manager with
    // a "success" toast and a broken closer record.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Please enter a valid email address");
    }

    const existing = await ctx.db
      .query("closers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing && existing.teamId === user.teamId) {
      throw new Error("You already added a closer with that email");
    }

    const closerId = await ctx.db.insert("closers", {
      email,
      name: args.name.trim(),
      teamId: user.teamId,
      status: "pending",
      invitedAt: Date.now(),
    });

    // Fire the magic-link email asynchronously. We use scheduler instead
    // of awaiting so the mutation returns instantly; the email lands a
    // moment later.
    await ctx.scheduler.runAfter(0, api.closerMagicLink.requestCloserMagicLink, {
      email,
    });

    return { closerId };
  },
});

// Set or update a closer's password (called by manager)
export const setCloserPassword = mutation({
  args: {
    clerkId: v.string(),
    closerId: v.id("closers"),
    password: v.string(),
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

    // Validate password
    if (args.password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    // Hash and update the password
    const passwordHash = await hashPassword(args.password);
    await ctx.db.patch(args.closerId, { passwordHash });

    return { success: true };
  },
});

// Closer changes their own password (from desktop app)
export const changeCloserPassword = mutation({
  args: {
    closerId: v.id("closers"),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);

    if (!closer) {
      return { success: false, error: "Closer not found" };
    }

    if (!closer.passwordHash) {
      return { success: false, error: "No password set" };
    }

    // Verify current password
    const isValid = await verifyPassword(args.currentPassword, closer.passwordHash);
    if (!isValid) {
      return { success: false, error: "Current password is incorrect" };
    }

    // Validate new password
    if (args.newPassword.length < 6) {
      return { success: false, error: "New password must be at least 6 characters" };
    }

    // Hash and update the password
    const passwordHash = await hashPassword(args.newPassword);
    await ctx.db.patch(args.closerId, { passwordHash });

    return { success: true };
  },
});

// Check if a closer has a password set (for UI purposes)
export const closerHasPassword = query({
  args: { closerId: v.id("closers") },
  handler: async (ctx, args) => {
    const closer = await ctx.db.get(args.closerId);
    return closer ? !!closer.passwordHash : false;
  },
});

// ----------------------------------------------------------------------------
// Closer Unit Economics (Phase 1) — getCloserRoi
//
// For each closer, attribute the ad spend on leads they personally ran to
// the cash collected + contract value from those same calls. ROI = cash /
// spend.
//
// Attribution algorithm:
//   1. Find every completed call this closer ran in the range
//   2. Trace each call back to its setterLead (email/phone match)
//   3. Look up the lead's Hyros adSourceId
//   4. Fair-share that ad's spend across all leads it produced in the
//      booking week (so high-volume ads don't get over-attributed)
//   5. Sum per-closer
//
// No-shows: the user explicitly wants closer ROI to NOT include ad spend
// on leads where the closer was the assigned-but-didn't-run. That's a
// business loss (counted in teamWide.noShowDragSpend) but not a closer
// penalty.
// ----------------------------------------------------------------------------

export const getCloserRoi = query({
  args: {
    clerkId: v.string(),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    // Authenticate + scope to team
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return null;
    const teamId = user.teamId;

    // Step 1: pull completed calls in range via callStats (lean — no
    // transcript blobs). callStats has closerId, outcome, cashCollected,
    // contractValue, status, createdAt — everything we need.
    const callStatsInRange: Doc<"callStats">[] = await ctx.db
      .query("callStats")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date", (q: any) =>
        q
          .eq("teamId", teamId)
          .gte("createdAt", args.rangeStart)
          .lt("createdAt", args.rangeEnd),
      )
      .collect();

    // Index by closerId for per-closer rollup
    interface CloserAccum {
      closerId: string;
      closerName: string;
      callsRun: number;
      spendCents: number;
      cashCollected: number;
      contractValue: number;
      closedCount: number;
      lostCount: number;
      followUpCount: number;
      callIds: Id<"calls">[];   // for reverse-lookup
    }
    const closerAccum = new Map<string, CloserAccum>();

    // Pull closer roster once for name lookups
    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const closerNameById = new Map(closers.map((c) => [String(c._id), c.name]));

    function ensure(closerId: string): CloserAccum {
      let row = closerAccum.get(closerId);
      if (!row) {
        row = {
          closerId,
          closerName: closerNameById.get(closerId) ?? "Unknown closer",
          callsRun: 0,
          spendCents: 0,
          cashCollected: 0,
          contractValue: 0,
          closedCount: 0,
          lostCount: 0,
          followUpCount: 0,
          callIds: [],
        };
        closerAccum.set(closerId, row);
      }
      return row;
    }

    // Pre-pass: bucket calls by closer + collect call IDs for setterLead
    // reverse-lookup. Track no-show drag at team level separately.
    let noShowCallCount = 0;
    for (const cs of callStatsInRange) {
      if (cs.status === "no_show") {
        noShowCallCount += 1;
        continue; // no-shows don't count toward closer ROI
      }
      if (cs.status !== "completed") continue;
      const row = ensure(cs.closerId);
      row.callsRun += 1;
      row.cashCollected += cs.cashCollected ?? 0;
      row.contractValue += cs.contractValue ?? 0;
      row.callIds.push(cs.callId);
      if (cs.outcome === "closed") row.closedCount += 1;
      else if (cs.outcome === "lost" || cs.outcome === "not_closed")
        row.lostCount += 1;
      else if (cs.outcome === "follow_up") row.followUpCount += 1;
    }

    // Step 2 + 3 + 4: spend attribution. For each call → fetch the
    // matching lead via prospectEmail/prospectPhone → fetch the lead's
    // hyrosFirstSource.adSourceId → look up that ad's spend that week
    // → fair-share across leads-from-that-ad-that-week.
    //
    // To keep this efficient on high-volume teams:
    //   - Pull all setterLeads in the team in one scan, build email/
    //     phone indices in memory.
    //   - Pull all calls referenced (via getCalls-by-ids) to get
    //     prospectEmail / prospectPhone.
    //   - Group spend lookups by (adSourceId, week) to dedupe queries.

    const allCalls = (await Promise.all(
      Array.from(closerAccum.values())
        .flatMap((c) => c.callIds)
        .map((cid) => ctx.db.get(cid)),
    )) as Array<Doc<"calls"> | null>;
    const callById = new Map<string, Doc<"calls"> | null>(
      allCalls.map((c) => [String(c?._id ?? ""), c]),
    );

    // Build email/phone → lead index across the team. Bounded — most
    // teams have <10k leads. Lean callStats made our 16MB worries
    // permanent history but setterLeads are small docs.
    const teamLeads: Doc<"setterLeads">[] = await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .collect();
    const normalize = (s: string | null | undefined) =>
      (s ?? "").trim().toLowerCase();
    const leadByEmail = new Map<string, Doc<"setterLeads">>();
    const leadByPhone = new Map<string, Doc<"setterLeads">>();
    for (const l of teamLeads) {
      if (l.email) leadByEmail.set(normalize(l.email), l);
      if (l.phone) leadByPhone.set(normalize(l.phone), l);
    }

    // For each call: find matching lead, capture (adSourceId, week)
    // for spend lookup.
    function isoWeek(d: Date): string {
      // ISO week: YYYY-Www (we use it as a deduplication key, not a
      // strict ISO standard — Sun-start "week of" works fine).
      const year = d.getUTCFullYear();
      const start = Date.UTC(year, 0, 1);
      const w = Math.floor((d.getTime() - start) / (7 * 24 * 60 * 60_000));
      return `${year}-W${String(w).padStart(2, "0")}`;
    }

    interface CallAttribution {
      callId: string;
      closerId: string;
      adSourceId: string;
      weekKey: string;
      weekStart: number;
      weekEnd: number;
    }
    const attributions: CallAttribution[] = [];
    let leadsWithoutAttribution = 0;
    for (const [closerId, row] of closerAccum) {
      for (const cid of row.callIds) {
        const call = callById.get(String(cid));
        if (!call) continue;
        const emailKey = normalize(call.prospectEmail);
        const phoneKey = normalize(call.prospectPhone);
        const lead =
          (emailKey && leadByEmail.get(emailKey)) ||
          (phoneKey && leadByPhone.get(phoneKey));
        if (!lead || !lead.hyrosFirstSource?.adSourceId) {
          leadsWithoutAttribution += 1;
          continue;
        }
        const callDate = new Date(call.createdAt);
        const weekKey = isoWeek(callDate);
        // Week boundaries in UTC ms
        const weekStart =
          callDate.getTime() - (callDate.getUTCDay() * 24 * 60 * 60_000);
        const weekEnd = weekStart + 7 * 24 * 60 * 60_000;
        attributions.push({
          callId: String(cid),
          closerId,
          adSourceId: lead.hyrosFirstSource.adSourceId,
          weekKey,
          weekStart,
          weekEnd,
        });
      }
    }

    // For each unique (adSourceId, week) combo: pull spend for the week
    // + count how many leads from that ad arrived that week (for fair-
    // share denominator).
    interface AdWeekSpend {
      spendCents: number;
      leadsThatWeek: number;
    }
    const adWeekCache = new Map<string, AdWeekSpend>();
    for (const a of attributions) {
      const key = `${a.adSourceId}|${a.weekKey}`;
      if (adWeekCache.has(key)) continue;

      // Sum spend for this ad over the week
      const spendRows = await ctx.db
        .query("adSpendDaily")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_ad_source_and_date", (q: any) =>
          q.eq("adSourceId", a.adSourceId),
        )
        .collect();
      const weekStartISO = new Date(a.weekStart).toISOString().slice(0, 10);
      const weekEndISO = new Date(a.weekEnd).toISOString().slice(0, 10);
      const spendCents = spendRows
        .filter((r) => r.date >= weekStartISO && r.date < weekEndISO)
        .reduce((s, r) => s + r.spendCents, 0);

      // Count leads from this ad in this week (fair-share denominator)
      const leadsThatWeek = teamLeads.filter(
        (l) =>
          l.hyrosFirstSource?.adSourceId === a.adSourceId &&
          l.dateAdded >= a.weekStart &&
          l.dateAdded < a.weekEnd,
      ).length;

      adWeekCache.set(key, {
        spendCents,
        leadsThatWeek: Math.max(1, leadsThatWeek), // avoid /0
      });
    }

    // Apply attribution to closer accumulators
    for (const a of attributions) {
      const key = `${a.adSourceId}|${a.weekKey}`;
      const aw = adWeekCache.get(key)!;
      const fairShare = aw.spendCents / aw.leadsThatWeek;
      const row = closerAccum.get(a.closerId);
      if (row) row.spendCents += fairShare;
    }

    // Team-wide totals
    let teamSpendCents = 0;
    let teamCash = 0;
    let teamContract = 0;
    for (const r of closerAccum.values()) {
      teamSpendCents += r.spendCents;
      teamCash += r.cashCollected;
      teamContract += r.contractValue;
    }

    // No-show drag — team-level. For each no-show, spend share is the
    // same fair-share math but doesn't go to any closer.
    let noShowDragCents = 0;
    for (const cs of callStatsInRange) {
      if (cs.status !== "no_show") continue;
      const call = (await ctx.db.get(cs.callId)) as Doc<"calls"> | null;
      if (!call) continue;
      const emailKey = normalize(call.prospectEmail);
      const phoneKey = normalize(call.prospectPhone);
      const lead =
        (emailKey && leadByEmail.get(emailKey)) ||
        (phoneKey && leadByPhone.get(phoneKey));
      if (!lead || !lead.hyrosFirstSource?.adSourceId) continue;
      const callDate = new Date(call.createdAt);
      const weekStart =
        callDate.getTime() - (callDate.getUTCDay() * 24 * 60 * 60_000);
      const weekEnd = weekStart + 7 * 24 * 60 * 60_000;
      const key = `${lead.hyrosFirstSource.adSourceId}|${isoWeek(callDate)}`;
      let aw = adWeekCache.get(key);
      if (!aw) {
        // Pull spend for this lookup if not cached
        const spendRows = await ctx.db
          .query("adSpendDaily")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .withIndex("by_ad_source_and_date", (q: any) =>
            q.eq("adSourceId", lead.hyrosFirstSource!.adSourceId!),
          )
          .collect();
        const wsISO = new Date(weekStart).toISOString().slice(0, 10);
        const weISO = new Date(weekEnd).toISOString().slice(0, 10);
        const spendCents = spendRows
          .filter((r) => r.date >= wsISO && r.date < weISO)
          .reduce((s, r) => s + r.spendCents, 0);
        const leadsThatWeek = teamLeads.filter(
          (l) =>
            l.hyrosFirstSource?.adSourceId === lead.hyrosFirstSource!.adSourceId &&
            l.dateAdded >= weekStart &&
            l.dateAdded < weekEnd,
        ).length;
        aw = { spendCents, leadsThatWeek: Math.max(1, leadsThatWeek) };
        adWeekCache.set(key, aw);
      }
      noShowDragCents += aw.spendCents / aw.leadsThatWeek;
    }

    // Coverage percentage — what fraction of called leads had ad
    // attribution we could spend-attribute
    const totalCalls = Array.from(closerAccum.values()).reduce(
      (s, r) => s + r.callsRun,
      0,
    );
    const spendCoveragePct =
      totalCalls > 0
        ? Math.round(((totalCalls - leadsWithoutAttribution) / totalCalls) * 100)
        : 0;

    // Build per-closer rows
    const rows = Array.from(closerAccum.values())
      .map((r) => {
        const spendUsd = r.spendCents / 100;
        return {
          closerId: r.closerId,
          closerName: r.closerName,
          callsRun: r.callsRun,
          spendUsd,
          cashCollected: r.cashCollected,
          contractValue: r.contractValue,
          roiCash: spendUsd > 0 ? r.cashCollected / spendUsd : null,
          roiContract: spendUsd > 0 ? r.contractValue / spendUsd : null,
          avgDealCash: r.closedCount > 0 ? r.cashCollected / r.closedCount : 0,
          avgDealContract:
            r.closedCount > 0 ? r.contractValue / r.closedCount : 0,
          closedCount: r.closedCount,
          lostCount: r.lostCount,
          followUpCount: r.followUpCount,
        };
      })
      .sort((a, b) => {
        // Default sort: worst ROI first (where the manager should look).
        // Null ROI rows (no spend) go to the bottom.
        if (a.roiCash === null && b.roiCash === null) return 0;
        if (a.roiCash === null) return 1;
        if (b.roiCash === null) return -1;
        return a.roiCash - b.roiCash;
      });

    // Check spend connection state for the empty-state branch
    const team = (await ctx.db.get(teamId)) as Doc<"teams"> | null;
    const spendSource: "meta_ads" | "unknown" = team?.metaAdsAccessToken
      ? "meta_ads"
      : "unknown";

    return {
      teamWide: {
        totalSpendUsd: teamSpendCents / 100,
        totalCashCollected: teamCash,
        totalContractValue: teamContract,
        blendedRoiCash: teamSpendCents > 0 ? teamCash / (teamSpendCents / 100) : null,
        blendedRoiContract:
          teamSpendCents > 0 ? teamContract / (teamSpendCents / 100) : null,
        noShowDragUsd: noShowDragCents / 100,
        noShowCallCount,
        leadsTotal: teamLeads.filter(
          (l) => l.dateAdded >= args.rangeStart && l.dateAdded < args.rangeEnd,
        ).length,
        callsTotal: totalCalls,
      },
      rowsByCloser: rows,
      spendSource,
      spendCoveragePct,
      windowDays: Math.round((args.rangeEnd - args.rangeStart) / (24 * 60 * 60_000)),
      hasSpendData: teamSpendCents > 0,
    };
  },
});
