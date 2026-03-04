import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ============================================
// AUTH HELPER
// ============================================

async function resolveAuthUser(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> }; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const clerkId = identity.subject;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId))
    .first();

  return user;
}

// ============================================
// QUERIES (use auth context — no clerkId parameter)
// ============================================

/**
 * Get GHL config for the authenticated user's team.
 */
export const getGhlConfig = query({
  args: {
    // Deprecated — kept for backward compat with old frontend deploys
    clerkId: v.optional(v.string()),
  },
  handler: async (ctx) => {
    const user = await resolveAuthUser(ctx);
    if (!user) return null;

    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team) return null;

    return {
      enabled: team.ghlEnabled ?? false,
      hasApiKey: !!team.ghlApiKey,
      hasLocationId: !!team.ghlLocationId,
      connectedAt: team.ghlConnectedAt,
      createContacts: team.ghlCreateContacts ?? true,
      addNotes: team.ghlAddNotes ?? true,
    };
  },
});

/**
 * Get sync history — recently synced and failed calls
 */
export const getGhlSyncHistory = query({
  args: {
    teamId: v.id("teams"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.limit ?? 50;

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const syncedCalls = calls
      .filter((c) => c.ghlSyncedAt || c.ghlSyncError)
      .sort(
        (a, b) =>
          (b.ghlSyncedAt ?? b.completedAt ?? 0) -
          (a.ghlSyncedAt ?? a.completedAt ?? 0)
      )
      .slice(0, maxResults);

    const results = await Promise.all(
      syncedCalls.map(async (call) => {
        const closer = await ctx.db.get(call.closerId);
        return {
          _id: call._id,
          closerName: closer?.name ?? "Unknown",
          prospectName: call.prospectName ?? "Unknown",
          outcome: call.outcome ?? "unknown",
          cashCollected: call.cashCollected,
          ghlSyncedAt: call.ghlSyncedAt,
          ghlSyncError: call.ghlSyncError,
          ghlContactId: call.ghlContactId,
          completedAt: call.completedAt,
        };
      })
    );

    return results;
  },
});

/**
 * Get sync stats for status bar
 */
export const getGhlSyncStats = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const syncedToday = calls.filter(
      (c) => c.ghlSyncedAt && c.ghlSyncedAt >= todayMs
    ).length;

    const recentFailures = calls.filter(
      (c) => c.ghlSyncError && !c.ghlSyncedAt
    ).length;

    const totalSynced = calls.filter((c) => c.ghlSyncedAt).length;

    return { syncedToday, recentFailures, totalSynced };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Internal mutation to save GHL config (called by ghlActions.updateGhlConfig after encrypting)
 */
export const saveGhlConfigInternal = internalMutation({
  args: {
    teamId: v.id("teams"),
    patch: v.object({
      ghlEnabled: v.boolean(),
      ghlApiKey: v.optional(v.string()),
      ghlLocationId: v.optional(v.string()),
      ghlCreateContacts: v.optional(v.boolean()),
      ghlAddNotes: v.optional(v.boolean()),
      ghlConnectedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, args.patch);
    return { success: true };
  },
});

/**
 * Mark a call as successfully synced to GHL
 */
export const markGhlSynced = mutation({
  args: {
    callId: v.id("calls"),
    contactId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      ghlSyncedAt: Date.now(),
      ghlSyncError: undefined,
      ghlContactId: args.contactId,
    });
  },
});

/**
 * Mark a GHL sync error on a call
 */
export const markGhlSyncError = mutation({
  args: {
    callId: v.id("calls"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      ghlSyncError: args.error,
    });
  },
});

// ============================================
// INTERNAL QUERIES
// ============================================

/**
 * Get team + call + closer data needed for GHL sync
 */
export const getGhlPushData = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;

    const team = await ctx.db.get(call.teamId);
    if (!team) return null;

    const closer = await ctx.db.get(call.closerId);
    const closerName = closer?.name ?? "Unknown";

    let prospectEmail: string | null = null;
    if (call.calendarEventId) {
      const calEvent = await ctx.db.get(call.calendarEventId);
      if (calEvent?.attendees) {
        const prospect = calEvent.attendees.find(
          (a: { isOrganizer?: boolean }) => !a.isOrganizer
        );
        if (prospect) {
          prospectEmail = (prospect as { email: string }).email;
        }
      }
    }

    return {
      team: {
        _id: team._id,
        ghlEnabled: team.ghlEnabled,
        ghlApiKey: team.ghlApiKey, // may be encrypted — action decrypts
        ghlLocationId: team.ghlLocationId,
        ghlCreateContacts: team.ghlCreateContacts ?? true,
        ghlAddNotes: team.ghlAddNotes ?? true,
      },
      call: {
        _id: call._id,
        teamId: call.teamId,
        outcome: call.outcome,
        prospectName: call.prospectName,
        cashCollected: call.cashCollected,
        contractValue: call.contractValue,
        leadQualityScore: call.leadQualityScore,
        prospectWasDecisionMaker: call.prospectWasDecisionMaker,
        primaryObjection: call.primaryObjection,
        summary: call.summary,
        completedAt: call.completedAt,
        ghlSyncedAt: call.ghlSyncedAt,
      },
      closerName,
      prospectEmail,
    };
  },
});

/**
 * Get team by ID (for actions that need team data)
 */
export const getTeamById = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.teamId);
  },
});
