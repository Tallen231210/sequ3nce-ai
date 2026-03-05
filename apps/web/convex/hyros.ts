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
// HELPER FUNCTIONS
// ============================================

interface CallForTags {
  outcome?: string;
  leadQualityScore?: number;
  prospectWasDecisionMaker?: string;
  primaryObjection?: string;
  budgetDiscussion?: { detected: boolean; mentionCount: number; quotes: string[] };
  cashCollected?: number;
}

interface AmmoAnalysis {
  engagement?: { level: string; reason: string };
  beliefs?: Record<string, number>;
}

interface CallAnalysis {
  analysis?: {
    opening?: { score: string; summary: string };
    discovery?: { score: string; summary: string };
    presentation?: { score: string; summary: string };
    objectionHandling?: { score: string; summary: string };
    closing?: { score: string; summary: string };
  };
}

function buildHyrosTags(
  call: CallForTags,
  ammoAnalysis?: AmmoAnalysis | null,
  callAnalysis?: CallAnalysis | null
): string[] {
  const tags: string[] = ["sequ3nce"];

  if (call.outcome) {
    tags.push(`outcome_${call.outcome}`);
  }

  if (call.leadQualityScore) {
    const bucket =
      call.leadQualityScore >= 8 ? "high" : call.leadQualityScore >= 5 ? "medium" : "low";
    tags.push(`lead_quality_${bucket}`);
  }

  if (call.prospectWasDecisionMaker) {
    tags.push(`decision_maker_${call.prospectWasDecisionMaker}`);
  }

  if (call.primaryObjection) {
    tags.push(`objection_${call.primaryObjection}`);
  }

  if (ammoAnalysis?.engagement?.level) {
    tags.push(`engagement_${ammoAnalysis.engagement.level}`);
  }

  if (ammoAnalysis?.beliefs) {
    for (const [key, value] of Object.entries(ammoAnalysis.beliefs)) {
      if (typeof value === "number") {
        const bucket = value >= 70 ? "high" : value >= 40 ? "medium" : "low";
        tags.push(`${key}_${bucket}`);
      }
    }
  }

  if (callAnalysis?.analysis?.closing?.score) {
    tags.push(`closing_${callAnalysis.analysis.closing.score}`);
  }

  if (call.budgetDiscussion?.detected) {
    tags.push("budget_discussed");
  }

  if (call.cashCollected) {
    const range =
      call.cashCollected >= 10000
        ? "10k_plus"
        : call.cashCollected >= 5000
          ? "5k_10k"
          : call.cashCollected >= 1000
            ? "1k_5k"
            : "under_1k";
    tags.push(`deal_size_${range}`);
  }

  return tags;
}

// ============================================
// QUERIES (use auth context — no clerkId parameter)
// ============================================

/**
 * Get Hyros config for the user's team.
 */
export const getHyrosConfig = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return null;

    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team) return null;

    return {
      enabled: team.hyrosEnabled ?? false,
      hasApiKey: !!team.hyrosApiKey,
      connectedAt: team.hyrosConnectedAt,
    };
  },
});

/**
 * Get calls pending Hyros sync
 */
export const getPendingHyrosCalls = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const pendingCalls = calls.filter(
      (c) => c.status === "completed" && c.outcome && !c.hyrosSyncedAt
    );

    const results = await Promise.all(
      pendingCalls.map(async (call) => {
        const closer = await ctx.db.get(call.closerId);
        const closerName = closer?.name ?? "Unknown";

        let prospectEmail: string | null = null;
        if (call.calendarEventId) {
          const calEvent = await ctx.db.get(call.calendarEventId);
          if (calEvent?.attendees) {
            const prospect = calEvent.attendees.find((a) => !a.isOrganizer);
            if (prospect) {
              prospectEmail = prospect.email;
            }
          }
        }

        const tags = buildHyrosTags(
          call,
          call.ammoAnalysis as AmmoAnalysis | undefined,
          call.callAnalysis as CallAnalysis | undefined
        );

        return {
          _id: call._id,
          closerName,
          prospectName: call.prospectName ?? "Unknown",
          prospectEmail,
          hasEmail: !!prospectEmail,
          outcome: call.outcome!,
          cashCollected: call.cashCollected,
          contractValue: call.contractValue,
          duration: call.duration,
          completedAt: call.completedAt ?? call.endedAt,
          tags,
          hyrosSyncError: call.hyrosSyncError,
        };
      })
    );

    results.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return results;
  },
});

/**
 * Get recently synced calls (history)
 */
export const getHyrosSyncHistory = query({
  args: {
    teamId: v.id("teams"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.limit ?? 20;

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    const syncedCalls = calls
      .filter((c) => c.hyrosSyncedAt)
      .sort((a, b) => (b.hyrosSyncedAt ?? 0) - (a.hyrosSyncedAt ?? 0))
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
          hyrosSyncedAt: call.hyrosSyncedAt!,
        };
      })
    );

    return results;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Internal mutation to save Hyros config (called by hyrosActions.updateHyrosConfig after encrypting)
 */
export const saveHyrosConfigInternal = internalMutation({
  args: {
    teamId: v.id("teams"),
    patch: v.object({
      hyrosEnabled: v.boolean(),
      hyrosApiKey: v.optional(v.string()),
      hyrosConnectedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, args.patch);
    return { success: true };
  },
});

/**
 * Mark a call as successfully synced to Hyros
 */
export const markHyrosSynced = mutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      hyrosSyncedAt: Date.now(),
      hyrosSyncError: undefined,
    });
  },
});

/**
 * Mark a Hyros sync error on a call
 */
export const markHyrosSyncError = mutation({
  args: {
    callId: v.id("calls"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      hyrosSyncError: args.error,
    });
  },
});

// ============================================
// INTERNAL QUERIES
// ============================================

/**
 * Get user + team + call data needed for Hyros push
 */
export const getHyrosPushData = internalQuery({
  args: {
    clerkId: v.string(),
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return null;

    const team = await ctx.db.get(user.teamId);
    if (!team) return null;

    const call = await ctx.db.get(args.callId);
    if (!call) return null;

    let prospectEmail: string | null = null;
    let prospectNameFromCal: string | undefined;
    if (call.calendarEventId) {
      const calEvent = await ctx.db.get(call.calendarEventId);
      if (calEvent?.attendees) {
        const prospect = calEvent.attendees.find((a) => !a.isOrganizer);
        if (prospect) {
          prospectEmail = prospect.email;
          prospectNameFromCal = prospect.name;
        }
      }
    }

    return {
      user: { teamId: user.teamId },
      team: {
        name: team.name,
        hyrosEnabled: team.hyrosEnabled,
        hyrosApiKey: team.hyrosApiKey, // may be encrypted — action decrypts
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
        budgetDiscussion: call.budgetDiscussion,
        ammoAnalysis: call.ammoAnalysis,
        callAnalysis: call.callAnalysis,
        hyrosSyncedAt: call.hyrosSyncedAt,
      },
      prospectEmail,
      prospectNameFromCal,
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
