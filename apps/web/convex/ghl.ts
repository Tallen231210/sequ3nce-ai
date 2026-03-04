import { v } from "convex/values";
import { query, mutation, action, internalAction, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

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

  // Outcome tags
  if (call.outcome) {
    tags.push(`sequ3nce_${call.outcome}`);
  }

  // Quality tags
  if (call.leadQualityScore !== undefined) {
    if (call.leadQualityScore >= 7) tags.push("sequ3nce_qualified");
    if (call.leadQualityScore < 5) tags.push("sequ3nce_not_qualified");
  }

  // Objection tags
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
  recordingUrl?: string;
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
  if (data.recordingUrl) {
    lines.push(`\nRecording: ${data.recordingUrl}`);
  }

  return lines.join("\n");
}

// ============================================
// QUERIES
// ============================================

/**
 * Get GHL config for the team
 */
export const getGhlConfig = query({
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

    // Get calls that have been synced OR have sync errors
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
 * Update GHL configuration for the team
 */
export const updateGhlConfig = mutation({
  args: {
    clerkId: v.string(),
    apiKey: v.optional(v.string()),
    locationId: v.optional(v.string()),
    enabled: v.boolean(),
    createContacts: v.optional(v.boolean()),
    addNotes: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) throw new Error("User not found");

    const team = await ctx.db.get(user.teamId);
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

    if (args.apiKey !== undefined) patch.ghlApiKey = args.apiKey;
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

    await ctx.db.patch(user.teamId, patch);
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
// INTERNAL QUERIES (for actions to resolve data)
// ============================================

/**
 * Get team + call + closer data needed for GHL sync (single query to reduce round-trips)
 */
export const getGhlPushData = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;

    const team = await ctx.db.get(call.teamId);
    if (!team) return null;

    // Resolve closer name
    const closer = await ctx.db.get(call.closerId);
    const closerName = closer?.name ?? "Unknown";

    // Resolve prospect email from calendar event attendees
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
        ghlApiKey: team.ghlApiKey,
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

// ============================================
// ACTIONS (GHL API calls)
// ============================================

/**
 * Test GHL API connection with provided credentials
 */
export const testGhlConnection = action({
  args: {
    clerkId: v.string(),
    apiKey: v.string(),
    locationId: v.string(),
  },
  handler: async (_ctx, args): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await makeGhlRequest(
        `/locations/${args.locationId}/customFields`,
        args.apiKey
      );

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: "Invalid API key. Check your GHL settings.",
        };
      }
      if (response.status === 404) {
        return {
          success: false,
          error: "Location not found. Check your Location ID.",
        };
      }
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `GHL API error: ${response.status}${errorText ? ` - ${errorText}` : ""}`,
        };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: `Connection failed: ${String(error)}` };
    }
  },
});

/**
 * Auto-sync a call to GHL — triggered after AI summary generation
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

      // Skip if GHL not configured
      if (!team.ghlEnabled || !team.ghlApiKey || !team.ghlLocationId) {
        return { success: false, error: "GHL not configured" };
      }

      // Already synced — skip silently
      if (call.ghlSyncedAt) {
        return { success: true };
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

      const apiKey = team.ghlApiKey;
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
        errors.push(`Contact upsert error: ${String(e)}`);
      }

      // --- 2. Add tags (only if we got a contact ID) ---
      if (contactId) {
        try {
          const tags = buildGhlTags(call);
          const tagResp = await makeGhlRequest(
            `/contacts/${contactId}/tags`,
            apiKey,
            {
              method: "POST",
              body: { tags },
            }
          );
          if (!tagResp.ok) {
            const text = await tagResp.text();
            errors.push(`Tag add failed: ${tagResp.status} ${text}`);
          }
        } catch (e) {
          errors.push(`Tag add error: ${String(e)}`);
        }
      }

      // --- 3. Add note (only if enabled and contact found) ---
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
            {
              method: "POST",
              body: { body: noteBody },
            }
          );
          if (!noteResp.ok) {
            const text = await noteResp.text();
            errors.push(`Note add failed: ${noteResp.status} ${text}`);
          }
        } catch (e) {
          errors.push(`Note add error: ${String(e)}`);
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
 * Retry a failed GHL sync — public action for the retry button
 */
export const retryGhlSync = action({
  args: {
    clerkId: v.string(),
    callId: v.id("calls"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Verify user exists and belongs to a team
    const user = await ctx.runQuery(api.teams.getMyUser, {
      clerkId: args.clerkId,
    });
    if (!user) return { success: false, error: "User not found" };

    // Clear existing error before retry
    await ctx.runMutation(api.ghl.markGhlSyncError, {
      callId: args.callId,
      error: "",
    });

    // Re-run the sync
    return await ctx.runAction(internal.ghl.syncCallToGhl, {
      callId: args.callId,
    });
  },
});

