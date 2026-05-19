"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { encryptApiKey, decryptApiKey } from "./lib/encrypt";
import { captureAndPersist } from "./lib/sentry";

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
// ACTIONS (Node.js runtime — can use crypto)
// ============================================

/**
 * Update Hyros configuration for the team.
 * Encrypts API key before storing. Uses auth context.
 */
export const updateHyrosConfig = action({
  args: {
    clerkId: v.string(),
    apiKey: v.optional(v.string()),
    enabled: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const user = await ctx.runQuery(api.teams.getMyUser, {
      clerkId: args.clerkId,
    });
    if (!user) throw new Error("User not found");

    const team = await ctx.runQuery(internal.hyros.getTeamById, {
      teamId: user.teamId,
    });
    if (!team) throw new Error("Team not found");

    const savePatch: {
      hyrosEnabled: boolean;
      hyrosApiKey?: string;
      hyrosConnectedAt?: number;
    } = {
      hyrosEnabled: args.enabled,
    };

    // Encrypt API key before storing
    if (args.apiKey !== undefined) {
      savePatch.hyrosApiKey = args.apiKey ? encryptApiKey(args.apiKey) : "";
    }

    // Set connectedAt when first enabling with a key
    if (args.enabled && (args.apiKey || team.hyrosApiKey) && !team.hyrosConnectedAt) {
      savePatch.hyrosConnectedAt = Date.now();
    }

    await ctx.runMutation(internal.hyros.saveHyrosConfigInternal, {
      teamId: user.teamId,
      patch: savePatch,
    });

    return { success: true };
  },
});

/**
 * Test Hyros API connection with the provided key.
 * Auth context required.
 */
export const testHyrosConnection = action({
  args: {
    clerkId: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {

    try {
      // Try both auth header styles — official docs say Bearer, but some
      // Hyros accounts use a custom API-Key header instead
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // First try Bearer token (official docs)
      headers["Authorization"] = `Bearer ${args.apiKey}`;
      let response = await fetch(`${HYROS_API_BASE}/v1/leads`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: "test@sequ3nce.ai",
          tags: ["sequ3nce_connection_test"],
        }),
      });

      // If Bearer fails with 401/403, try API-Key header
      if (response.status === 401 || response.status === 403) {
        delete headers["Authorization"];
        headers["API-Key"] = args.apiKey;
        response = await fetch(`${HYROS_API_BASE}/v1/leads`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            email: "test@sequ3nce.ai",
            tags: ["sequ3nce_connection_test"],
          }),
        });
      }

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
 * Push a single call's data to Hyros.
 * Uses auth context. Decrypts API key.
 */
export const pushCallToHyros = action({
  args: {
    clerkId: v.string(),
    callId: v.id("calls"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    try {
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

      // Decrypt API key (handles both encrypted and plaintext for backward-compat)
      const apiKey = decryptApiKey(team.hyrosApiKey);
      // Try Bearer first; fall back to API-Key header if 401/403
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };

      const tags = buildHyrosTags(
        call as CallForTags,
        call.ammoAnalysis as AmmoAnalysis | undefined,
        call.callAnalysis as CallAnalysis | undefined
      );

      const prospectName = call.prospectName || prospectNameFromCal || "Unknown";
      const { firstName, lastName } = splitProspectName(prospectName);

      const errors: string[] = [];

      // 1. Upsert lead
      try {
        const leadBody = JSON.stringify({
          email: prospectEmail,
          firstName,
          lastName,
          tags,
          source: "sequ3nce",
        });
        let leadResponse = await fetch(`${HYROS_API_BASE}/v1/leads`, {
          method: "POST",
          headers,
          body: leadBody,
        });
        // If Bearer auth fails, switch to API-Key header for all remaining calls
        if (leadResponse.status === 401 || leadResponse.status === 403) {
          delete headers["Authorization"];
          headers["API-Key"] = apiKey;
          leadResponse = await fetch(`${HYROS_API_BASE}/v1/leads`, {
            method: "POST",
            headers,
            body: leadBody,
          });
        }
        if (!leadResponse.ok) {
          const text = await leadResponse.text();
          errors.push(`Lead upsert failed: ${leadResponse.status} ${text}`);
        }
      } catch (e) {
        await captureAndPersist(
          e,
          async () => {
            errors.push(`Lead upsert error: ${String(e)}`);
          },
          {
            feature: "pushCallToHyros:leadUpsert",
            integration: "hyros",
            extra: { callId: args.callId },
          },
        );
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
        await captureAndPersist(
          e,
          async () => {
            errors.push(`Call creation error: ${String(e)}`);
          },
          {
            feature: "pushCallToHyros:callCreation",
            integration: "hyros",
            extra: { callId: args.callId },
          },
        );
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
          await captureAndPersist(
            e,
            async () => {
              errors.push(`Sale creation error: ${String(e)}`);
            },
            {
              feature: "pushCallToHyros:saleCreation",
              integration: "hyros",
              extra: { callId: args.callId },
            },
          );
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
        await captureAndPersist(
          e,
          async () => {
            errors.push(`Event creation error: ${String(e)}`);
          },
          {
            feature: "pushCallToHyros:eventCreation",
            integration: "hyros",
            extra: { callId: args.callId },
          },
        );
      }

      // Mark sync result
      if (errors.length > 0) {
        await ctx.runMutation(api.hyros.markHyrosSyncError, {
          callId: args.callId,
          error: errors.join("; "),
        });
        return { success: false, error: errors.join("; ") };
      }

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
 * Batch push multiple calls to Hyros.
 * Uses auth context.
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
      const result = await ctx.runAction(api.hyrosActions.pushCallToHyros, {
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
