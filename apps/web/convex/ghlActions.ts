"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { encryptApiKey, decryptApiKey } from "./lib/encrypt";
import { captureAndPersist } from "./lib/sentry";

// ============================================
// GHL API CONFIG
// ============================================

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

// Standard custom field keys we push to GHL contacts
const GHL_FIELD_KEYS = {
  callOutcome: "sequ3nce_call_outcome",
  leadQuality: "sequ3nce_lead_quality",
  objection: "sequ3nce_objection",
  decisionMaker: "sequ3nce_decision_maker",
  dealValue: "sequ3nce_deal_value",
  lastCallDate: "sequ3nce_last_call_date",
  callSummary: "sequ3nce_call_summary",
  closer: "sequ3nce_closer",
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

async function makeGhlRequest(
  path: string,
  apiKey: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Response> {
  return fetch(`${GHL_API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Version: GHL_API_VERSION,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

function buildGhlTags(call: {
  outcome?: string;
  leadQualityScore?: number;
  primaryObjection?: string;
}): string[] {
  const tags: string[] = ["sequ3nce_call_completed"];

  if (call.outcome) {
    tags.push(`sequ3nce_${call.outcome}`);
  }

  if (call.leadQualityScore !== undefined) {
    if (call.leadQualityScore >= 7) tags.push("sequ3nce_qualified");
    if (call.leadQualityScore < 5) tags.push("sequ3nce_not_qualified");
  }

  if (call.primaryObjection) {
    const normalized = call.primaryObjection.toLowerCase().replace(/\s+/g, "_");
    tags.push(`sequ3nce_objection_${normalized}`);
  }

  return tags;
}

function buildGhlNote(data: {
  closerName: string;
  outcome: string;
  summary?: string;
  primaryObjection?: string;
  cashCollected?: number;
  completedAt?: number;
}): string {
  const date = data.completedAt
    ? new Date(data.completedAt).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Unknown date";

  const lines: string[] = [
    "--- Sequ3nce Call Summary ---",
    `Date: ${date}`,
    `Closer: ${data.closerName}`,
    `Outcome: ${data.outcome}`,
  ];

  if (data.cashCollected) {
    lines.push(`Cash Collected: $${data.cashCollected.toLocaleString()}`);
  }
  if (data.primaryObjection) {
    lines.push(`Primary Objection: ${data.primaryObjection}`);
  }
  if (data.summary) {
    lines.push(`\nAI Summary:\n${data.summary}`);
  }

  return lines.join("\n");
}

// ============================================
// ACTIONS (Node.js runtime — can use crypto)
// ============================================

/**
 * Update GHL configuration for the team.
 * Encrypts API key before storing. Uses auth context.
 */
export const updateGhlConfig = action({
  args: {
    apiKey: v.optional(v.string()),
    locationId: v.optional(v.string()),
    enabled: v.boolean(),
    createContacts: v.optional(v.boolean()),
    addNotes: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.runQuery(api.teams.getMyUser, {
      clerkId: identity.subject,
    });
    if (!user) throw new Error("User not found");

    const team = await ctx.runQuery(internal.ghl.getTeamById, {
      teamId: user.teamId,
    });
    if (!team) throw new Error("Team not found");

    // Validate input lengths
    if (args.apiKey !== undefined && args.apiKey.length > 500) {
      throw new Error("API key too long");
    }
    if (args.locationId !== undefined && args.locationId.length > 100) {
      throw new Error("Location ID too long");
    }

    const patch: Record<string, unknown> = {
      ghlEnabled: args.enabled,
    };

    // Encrypt API key before storing
    if (args.apiKey !== undefined) {
      patch.ghlApiKey = args.apiKey ? encryptApiKey(args.apiKey) : "";
    }
    if (args.locationId !== undefined) patch.ghlLocationId = args.locationId;
    if (args.createContacts !== undefined) patch.ghlCreateContacts = args.createContacts;
    if (args.addNotes !== undefined) patch.ghlAddNotes = args.addNotes;

    // Set connectedAt when first enabling with a key
    if (args.enabled && (args.apiKey || team.ghlApiKey) && !team.ghlConnectedAt) {
      patch.ghlConnectedAt = Date.now();
    }

    // Clear connectedAt if disabling and removing key
    if (!args.enabled && args.apiKey === "") {
      patch.ghlConnectedAt = undefined;
    }

    await ctx.runMutation(internal.ghl.saveGhlConfigInternal, {
      teamId: user.teamId,
      patch: {
        ghlEnabled: patch.ghlEnabled as boolean,
        ghlApiKey: patch.ghlApiKey as string | undefined,
        ghlLocationId: patch.ghlLocationId as string | undefined,
        ghlCreateContacts: patch.ghlCreateContacts as boolean | undefined,
        ghlAddNotes: patch.ghlAddNotes as boolean | undefined,
        ghlConnectedAt: patch.ghlConnectedAt as number | undefined,
      },
    });

    return { success: true };
  },
});

/**
 * Test GHL API connection with provided credentials.
 * Auth context required.
 */
export const testGhlConnection = action({
  args: {
    apiKey: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; error?: string; locationId?: string; locationName?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { success: false, error: "Not authenticated" };

    try {
      // Auto-detect location ID from the API key
      const locResponse = await makeGhlRequest("/locations/search", args.apiKey);

      if (locResponse.status === 401 || locResponse.status === 403) {
        return {
          success: false,
          error: "Invalid API key. Check your GHL Private Integration Token.",
        };
      }
      if (!locResponse.ok) {
        const errorText = await locResponse.text();
        return {
          success: false,
          error: `GHL API error: ${locResponse.status}${errorText ? ` - ${errorText}` : ""}`,
        };
      }

      const locData = await locResponse.json();
      const locations = locData.locations;

      if (!locations || locations.length === 0) {
        return {
          success: false,
          error: "No sub-account found for this API key. Make sure the token has 'locations.readonly' permission.",
        };
      }

      const locationId = locations[0].id;
      const locationName = locations[0].name;

      // Verify we can actually read contacts for this location
      const verifyResponse = await makeGhlRequest(
        `/locations/${locationId}/customFields`,
        args.apiKey
      );

      if (!verifyResponse.ok) {
        return {
          success: false,
          error: `Connected but cannot access location data. Check API key permissions.`,
        };
      }

      return { success: true, locationId, locationName };
    } catch (error) {
      return { success: false, error: `Connection failed: ${String(error)}` };
    }
  },
});

/**
 * Auto-sync a call to GHL — triggered after AI summary generation.
 * Decrypts API key before use.
 */
export const syncCallToGhl = internalAction({
  args: { callId: v.id("calls") },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    try {
      const data = await ctx.runQuery(internal.ghl.getGhlPushData, {
        callId: args.callId,
      });

      if (!data) {
        return { success: false, error: "Call or team not found" };
      }

      const { team, call, closerName, prospectEmail } = data;

      // Already synced (legacy or OAuth) — skip silently before any
      // routing decision so duplicate scheduler invocations are no-ops.
      if (call.ghlSyncedAt) {
        return { success: true };
      }

      // Phase 3c routing — if the team has the GHL Marketplace App
      // installed AND the new disposition-sync flag is on, delegate to
      // the OAuth flow. Otherwise fall through to the legacy API-key
      // path below for backward compat with existing customers.
      if (team.setterDispositionSyncEnabled) {
        const installation = await ctx.runQuery(
          internal.setterGhlOauth.getInstallationByTeam,
          { teamId: team._id },
        );
        if (installation && installation.status === "active") {
          return await ctx.runAction(
            internal.setterGhlDispositionSync.syncCallToGhlOAuth,
            { callId: args.callId },
          );
        }
        // Flag is on but no install — fall through to legacy if it's
        // configured, otherwise return an explicit error so the UI
        // can surface "you flipped the toggle but never installed".
      }

      // Skip if legacy GHL not configured
      if (!team.ghlEnabled || !team.ghlApiKey || !team.ghlLocationId) {
        return { success: false, error: "GHL not configured" };
      }

      // Need email to find/create contact
      if (!prospectEmail) {
        await ctx.runMutation(api.ghl.markGhlSyncError, {
          callId: args.callId,
          error: "No prospect email found (requires Google Calendar with attendees)",
        });
        return {
          success: false,
          error: "No prospect email found",
        };
      }

      // Decrypt API key (handles both encrypted and plaintext for backward-compat)
      const apiKey = decryptApiKey(team.ghlApiKey);
      const errors: string[] = [];
      let contactId: string | undefined;

      // --- 1. Upsert contact with custom fields ---
      try {
        const customFields: Array<{ key: string; field_value: string }> = [];

        if (call.outcome) {
          customFields.push({
            key: GHL_FIELD_KEYS.callOutcome,
            field_value: call.outcome,
          });
        }
        if (call.leadQualityScore !== undefined) {
          customFields.push({
            key: GHL_FIELD_KEYS.leadQuality,
            field_value: String(call.leadQualityScore),
          });
        }
        if (call.primaryObjection) {
          customFields.push({
            key: GHL_FIELD_KEYS.objection,
            field_value: call.primaryObjection,
          });
        }
        if (call.prospectWasDecisionMaker) {
          customFields.push({
            key: GHL_FIELD_KEYS.decisionMaker,
            field_value: call.prospectWasDecisionMaker,
          });
        }
        if (call.cashCollected !== undefined) {
          customFields.push({
            key: GHL_FIELD_KEYS.dealValue,
            field_value: String(call.cashCollected),
          });
        }
        if (call.completedAt) {
          customFields.push({
            key: GHL_FIELD_KEYS.lastCallDate,
            field_value: new Date(call.completedAt).toISOString().split("T")[0],
          });
        }
        if (call.summary) {
          customFields.push({
            key: GHL_FIELD_KEYS.callSummary,
            field_value: call.summary.slice(0, 1000),
          });
        }
        customFields.push({
          key: GHL_FIELD_KEYS.closer,
          field_value: closerName,
        });

        const upsertBody: Record<string, unknown> = {
          locationId: team.ghlLocationId,
          email: prospectEmail,
          name: call.prospectName ?? "Unknown",
          customFields,
        };

        const contactResp = await makeGhlRequest("/contacts/upsert", apiKey, {
          method: "POST",
          body: upsertBody,
        });

        if (!contactResp.ok) {
          const text = await contactResp.text();
          errors.push(`Contact upsert failed: ${contactResp.status} ${text}`);
        } else {
          const contactData = await contactResp.json();
          contactId = contactData.contact?.id;
        }
      } catch (e) {
        await captureAndPersist(
          e,
          async () => {
            errors.push(`Contact upsert error: ${String(e)}`);
          },
          {
            feature: "syncCallToGhl:contactUpsert",
            integration: "ghl-legacy",
            extra: { callId: args.callId },
          },
        );
      }

      // --- 2. Add tags ---
      if (contactId) {
        try {
          const tags = buildGhlTags(call);
          const tagResp = await makeGhlRequest(
            `/contacts/${contactId}/tags`,
            apiKey,
            { method: "POST", body: { tags } }
          );
          if (!tagResp.ok) {
            const text = await tagResp.text();
            errors.push(`Tag add failed: ${tagResp.status} ${text}`);
          }
        } catch (e) {
          await captureAndPersist(
            e,
            async () => {
              errors.push(`Tag add error: ${String(e)}`);
            },
            {
              feature: "syncCallToGhl:tagAdd",
              integration: "ghl-legacy",
              extra: { callId: args.callId, contactId },
            },
          );
        }
      }

      // --- 3. Add note ---
      if (contactId && team.ghlAddNotes) {
        try {
          const noteBody = buildGhlNote({
            closerName,
            outcome: call.outcome ?? "unknown",
            summary: call.summary,
            primaryObjection: call.primaryObjection,
            cashCollected: call.cashCollected,
            completedAt: call.completedAt,
          });

          const noteResp = await makeGhlRequest(
            `/contacts/${contactId}/notes`,
            apiKey,
            { method: "POST", body: { body: noteBody } }
          );
          if (!noteResp.ok) {
            const text = await noteResp.text();
            errors.push(`Note add failed: ${noteResp.status} ${text}`);
          }
        } catch (e) {
          await captureAndPersist(
            e,
            async () => {
              errors.push(`Note add error: ${String(e)}`);
            },
            {
              feature: "syncCallToGhl:noteAdd",
              integration: "ghl-legacy",
              extra: { callId: args.callId, contactId },
            },
          );
        }
      }

      // --- 4. Mark result ---
      if (errors.length > 0) {
        await ctx.runMutation(api.ghl.markGhlSyncError, {
          callId: args.callId,
          error: errors.join("; "),
        });
        return { success: false, error: errors.join("; ") };
      }

      await ctx.runMutation(api.ghl.markGhlSynced, {
        callId: args.callId,
        contactId,
      });
      return { success: true };
    } catch (error) {
      console.error("[GHL] Unexpected error syncing call:", error);
      try {
        await ctx.runMutation(api.ghl.markGhlSyncError, {
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
 * Retry a failed GHL sync. Uses auth context.
 */
export const retryGhlSync = action({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { success: false, error: "Not authenticated" };

    const user = await ctx.runQuery(api.teams.getMyUser, {
      clerkId: identity.subject,
    });
    if (!user) return { success: false, error: "User not found" };

    // Clear existing error before retry
    await ctx.runMutation(api.ghl.markGhlSyncError, {
      callId: args.callId,
      error: "",
    });

    // Re-run the sync
    return await ctx.runAction(internal.ghlActions.syncCallToGhl, {
      callId: args.callId,
    });
  },
});
