import { v } from "convex/values";
import { query, mutation, action, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================
// HYROS API CONFIG
// ============================================

const HYROS_API_BASE = "https://api.hyros.com";

// ============================================
// HELPER FUNCTIONS
// ============================================

function splitProspectName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

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

  // Outcome
  if (call.outcome) {
    tags.push(`outcome_${call.outcome}`);
  }

  // Lead quality (closer-rated 1-10)
  if (call.leadQualityScore) {
    const bucket =
      call.leadQualityScore >= 8 ? "high" : call.leadQualityScore >= 5 ? "medium" : "low";
    tags.push(`lead_quality_${bucket}`);
  }

  // Decision maker
  if (call.prospectWasDecisionMaker) {
    tags.push(`decision_maker_${call.prospectWasDecisionMaker}`);
  }

  // Primary objection
  if (call.primaryObjection) {
    tags.push(`objection_${call.primaryObjection}`);
  }

  // Engagement level (from ammo AI)
  if (ammoAnalysis?.engagement?.level) {
    tags.push(`engagement_${ammoAnalysis.engagement.level}`);
  }

  // Belief scores bucketed (from ammo AI)
  if (ammoAnalysis?.beliefs) {
    for (const [key, value] of Object.entries(ammoAnalysis.beliefs)) {
      if (typeof value === "number") {
        const bucket = value >= 70 ? "high" : value >= 40 ? "medium" : "low";
        tags.push(`${key}_${bucket}`);
      }
    }
  }

  // AI closing score
  if (callAnalysis?.analysis?.closing?.score) {
    tags.push(`closing_${callAnalysis.analysis.closing.score}`);
  }

  // Budget discussed
  if (call.budgetDiscussion?.detected) {
    tags.push("budget_discussed");
  }

  // Cash collected range
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
// QUERIES
// ============================================

/**
 * Get Hyros config for the team
 */
export const getHyrosConfig = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) return null;

    const team = await ctx.db.get(user.teamId);
    if (!team) return null;

    return {
      enabled: team.hyrosEnabled ?? false,
      hasApiKey: !!team.hyrosApiKey,
      connectedAt: team.hyrosConnectedAt,
    };
  },
});

/**
 * Get calls pending Hyros sync — completed calls with outcome but not yet pushed
 */
export const getPendingHyrosCalls = query({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    // Get all completed calls for this team that haven't been synced
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();

    // Filter to completed calls with outcome but not yet synced to Hyros
    const pendingCalls = calls.filter(
      (c) => c.status === "completed" && c.outcome && !c.hyrosSyncedAt
    );

    // Resolve closer names and prospect emails
    const results = await Promise.all(
      pendingCalls.map(async (call) => {
        // Get closer name
        const closer = await ctx.db.get(call.closerId);
        const closerName = closer?.name ?? "Unknown";

        // Find prospect email from linked calendar event
        let prospectEmail: string | null = null;
        if (call.calendarEventId) {
          const calEvent = await ctx.db.get(call.calendarEventId);
          if (calEvent?.attendees) {
            // Find the first attendee who isn't the organizer (likely the prospect)
            const prospect = calEvent.attendees.find((a) => !a.isOrganizer);
            if (prospect) {
              prospectEmail = prospect.email;
            }
          }
        }

        // Build preview tags
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

    // Sort by completedAt descending (most recent first)
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

    // Filter to synced calls
    const syncedCalls = calls
      .filter((c) => c.hyrosSyncedAt)
      .sort((a, b) => (b.hyrosSyncedAt ?? 0) - (a.hyrosSyncedAt ?? 0))
      .slice(0, maxResults);

    // Resolve closer names
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
 * Update Hyros configuration for the team
 */
export const updateHyrosConfig = mutation({
  args: {
    clerkId: v.string(),
    apiKey: v.optional(v.string()),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    const team = await ctx.db.get(user.teamId);
    if (!team) {
      throw new Error("Team not found");
    }

    const patch: Record<string, unknown> = {
      hyrosEnabled: args.enabled,
    };

    // Only update API key if provided (allows toggling enabled without resending key)
    if (args.apiKey !== undefined) {
      patch.hyrosApiKey = args.apiKey;
    }

    // Set connectedAt when first enabling with a key
    if (args.enabled && (args.apiKey || team.hyrosApiKey) && !team.hyrosConnectedAt) {
      patch.hyrosConnectedAt = Date.now();
    }

    // Clear connectedAt if disabling and removing key
    if (!args.enabled && args.apiKey === "") {
      patch.hyrosConnectedAt = undefined;
    }

    await ctx.db.patch(user.teamId, patch);

    return { success: true };
  },
});

// ============================================
// INTERNAL QUERIES (for actions to resolve data)
// ============================================

/**
 * Get user + team + call data needed for Hyros push (single query to reduce round-trips)
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

    // Resolve prospect email from calendar event
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
        hyrosApiKey: team.hyrosApiKey,
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

// ============================================
// ACTIONS (Hyros API calls)
// ============================================

/**
 * Test Hyros API connection with the provided key
 */
export const testHyrosConnection = action({
  args: {
    clerkId: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    try {
      // Try fetching leads with a limit of 1 to test the API key
      const response = await fetch(`${HYROS_API_BASE}/v1/leads?limit=1`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401 || response.status === 403) {
        return { success: false, error: "Invalid API key. Check your Hyros API settings." };
      }

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Hyros API error: ${response.status}${errorText ? ` - ${errorText}` : ""}`,
        };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: `Connection failed: ${String(error)}` };
    }
  },
});

/**
 * Push a single call's data to Hyros
 */
export const pushCallToHyros = action({
  args: {
    clerkId: v.string(),
    callId: v.id("calls"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    try {
      // Get all data in one query
      const data = await ctx.runQuery(internal.hyros.getHyrosPushData, {
        clerkId: args.clerkId,
        callId: args.callId,
      });

      if (!data) {
        return { success: false, error: "User, team, or call not found" };
      }

      const { team, call, prospectEmail, prospectNameFromCal } = data;

      if (!team.hyrosEnabled || !team.hyrosApiKey) {
        return { success: false, error: "Hyros is not configured" };
      }

      // Verify call belongs to this team
      if (call.teamId !== data.user.teamId) {
        return { success: false, error: "Call does not belong to your team" };
      }

      // Check if already synced
      if (call.hyrosSyncedAt) {
        return { success: false, error: "Call already synced to Hyros" };
      }

      if (!prospectEmail) {
        await ctx.runMutation(api.hyros.markHyrosSyncError, {
          callId: args.callId,
          error: "No prospect email found (requires Google Calendar with attendees)",
        });
        return {
          success: false,
          error: "No prospect email found. Connect Google Calendar with attendees to enable Hyros attribution.",
        };
      }

      const apiKey = team.hyrosApiKey;
      const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };

      // Build tags
      const tags = buildHyrosTags(
        call as CallForTags,
        call.ammoAnalysis as AmmoAnalysis | undefined,
        call.callAnalysis as CallAnalysis | undefined
      );

      // Parse name
      const prospectName = call.prospectName || prospectNameFromCal || "Unknown";
      const { firstName, lastName } = splitProspectName(prospectName);

      const errors: string[] = [];

      // 1. Upsert lead
      try {
        const leadResponse = await fetch(`${HYROS_API_BASE}/v1/leads`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            email: prospectEmail,
            firstName,
            lastName,
            tags,
            source: "sequ3nce",
          }),
        });
        if (!leadResponse.ok) {
          const text = await leadResponse.text();
          errors.push(`Lead upsert failed: ${leadResponse.status} ${text}`);
        }
      } catch (e) {
        errors.push(`Lead upsert error: ${String(e)}`);
      }

      // 2. Create call record
      const isQualified = call.outcome === "closed" || call.outcome === "follow_up";
      try {
        const callResponse = await fetch(`${HYROS_API_BASE}/v1/calls`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            email: prospectEmail,
            name: "sequ3nce_sales_call",
            qualified: isQualified,
          }),
        });
        if (!callResponse.ok) {
          const text = await callResponse.text();
          errors.push(`Call creation failed: ${callResponse.status} ${text}`);
        }
      } catch (e) {
        errors.push(`Call creation error: ${String(e)}`);
      }

      // 3. Create sale (only for closed deals)
      if (call.outcome === "closed" && call.cashCollected) {
        try {
          const saleResponse = await fetch(`${HYROS_API_BASE}/v1/sales`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              email: prospectEmail,
              amount: call.cashCollected,
              product: team.name || "Sales Call",
            }),
          });
          if (!saleResponse.ok) {
            const text = await saleResponse.text();
            errors.push(`Sale creation failed: ${saleResponse.status} ${text}`);
          }
        } catch (e) {
          errors.push(`Sale creation error: ${String(e)}`);
        }
      }

      // 4. Create custom event
      const eventName =
        call.outcome === "closed"
          ? "call_closed"
          : call.outcome === "follow_up"
            ? "call_follow_up"
            : call.outcome === "no_show"
              ? "call_no_show"
              : "call_not_closed";

      try {
        const eventResponse = await fetch(`${HYROS_API_BASE}/v1/events`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            email: prospectEmail,
            event: eventName,
          }),
        });
        if (!eventResponse.ok) {
          const text = await eventResponse.text();
          errors.push(`Event creation failed: ${eventResponse.status} ${text}`);
        }
      } catch (e) {
        errors.push(`Event creation error: ${String(e)}`);
      }

      // Mark sync result
      if (errors.length > 0) {
        await ctx.runMutation(api.hyros.markHyrosSyncError, {
          callId: args.callId,
          error: errors.join("; "),
        });
        return { success: false, error: errors.join("; ") };
      }

      // Success — mark synced
      await ctx.runMutation(api.hyros.markHyrosSynced, { callId: args.callId });
      return { success: true };
    } catch (error) {
      console.error("[Hyros] Unexpected error pushing call:", error);
      try {
        await ctx.runMutation(api.hyros.markHyrosSyncError, {
          callId: args.callId,
          error: String(error),
        });
      } catch {
        // Ignore mutation error during error handling
      }
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Batch push multiple calls to Hyros
 */
export const batchPushToHyros = action({
  args: {
    clerkId: v.string(),
    callIds: v.array(v.id("calls")),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ pushed: number; failed: number; errors: string[] }> => {
    let pushed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const callId of args.callIds) {
      const result = await ctx.runAction(api.hyros.pushCallToHyros, {
        clerkId: args.clerkId,
        callId,
      });

      if (result.success) {
        pushed++;
      } else {
        failed++;
        errors.push(`${callId}: ${result.error}`);
      }
    }

    return { pushed, failed, errors };
  },
});

// ============================================
// INTERNAL MUTATIONS (for actions to call)
// ============================================

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
