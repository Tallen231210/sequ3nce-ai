"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { ghlFetch } from "./setterGhlClient";

// ============================================================================
// Setter Data — Disposition Sync (Phase 3c, OAuth-flavored).
//
// Pushes post-call disposition data (outcome, lead quality, objection,
// deal value, etc.) to GHL contacts as custom fields + tags. Mirrors the
// behavior of the legacy ghlActions.syncCallToGhl action but uses the
// new OAuth tokens from setterGhlInstallations instead of the legacy
// per-team API key.
//
// Routing decision lives in ghlActions.syncCallToGhl: if the team has a
// setterGhlInstallations row AND setterDispositionSyncEnabled === true,
// it delegates here. Otherwise the legacy path runs as before.
// ============================================================================

// Same custom field keys as the legacy flow — keeps GHL data shape
// consistent for customers transitioning between paths.
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

export const syncCallToGhlOAuth = internalAction({
  args: { callId: v.id("calls") },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; error?: string; skipped?: boolean }> => {
    const data = await ctx.runQuery(internal.ghl.getGhlPushData, {
      callId: args.callId,
    });
    if (!data) {
      return { success: false, error: "Call or team not found" };
    }
    const { team, call, closerName, prospectEmail } = data;

    // Already synced (legacy or OAuth) — skip silently.
    if (call.ghlSyncedAt) {
      return { success: true, skipped: true };
    }

    if (!team.setterDispositionSyncEnabled) {
      return { success: false, error: "Disposition sync disabled" };
    }

    // Look up the OAuth installation. The routing layer in
    // ghlActions.syncCallToGhl already verified one exists, but we
    // re-check defensively in case state changed between routing and
    // execution.
    const installation = await ctx.runQuery(
      internal.setterGhlOauth.getInstallationByTeam,
      { teamId: team._id },
    );
    if (!installation || installation.status !== "active") {
      return { success: false, error: "No active OAuth installation" };
    }

    if (!prospectEmail) {
      await ctx.runMutation(api.ghl.markGhlSyncError, {
        callId: args.callId,
        error: "No prospect email found (requires Google Calendar with attendees)",
      });
      return { success: false, error: "No prospect email found" };
    }

    // Build custom fields payload — same shape as legacy.
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
    if (closerName) {
      customFields.push({
        key: GHL_FIELD_KEYS.closer,
        field_value: closerName,
      });
    }
    if (call.summary) {
      customFields.push({
        key: GHL_FIELD_KEYS.callSummary,
        field_value: call.summary.slice(0, 5000), // GHL custom-field length cap
      });
    }

    // Tags — same convention as legacy: outcome + lead-quality bucket.
    const tags: string[] = [];
    if (call.outcome) tags.push(`sequ3nce-${call.outcome.toLowerCase()}`);
    if (call.leadQualityScore !== undefined) {
      const bucket =
        call.leadQualityScore >= 8
          ? "hot"
          : call.leadQualityScore >= 5
            ? "warm"
            : "cold";
      tags.push(`sequ3nce-${bucket}`);
    }

    let ghlContactId: string | undefined;

    try {
      // 1. Upsert contact via /contacts/upsert. GHL matches on email by
      //    default — creates if no match, updates if found. Same endpoint
      //    the legacy flow uses.
      const upsertResp = await ghlFetch<{ contact?: { id?: string } }>(
        ctx,
        installation._id,
        "/contacts/upsert",
        {
          method: "POST",
          body: {
            locationId: installation.locationId,
            email: prospectEmail,
            customFields,
            tags,
          },
        },
      );
      ghlContactId = upsertResp.contact?.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[setterDispositionSync] Contact upsert failed:", message);
      await ctx.runMutation(api.ghl.markGhlSyncError, {
        callId: args.callId,
        error: `Contact upsert failed: ${message}`,
      });
      return { success: false, error: message };
    }

    // 2. Optional: append a contact note with the call summary. Only if
    //    the team has setterDataNotes enabled (mirrors legacy ghlAddNotes
    //    flag — we reuse it so customers don't have to re-toggle).
    if (team.ghlAddNotes && ghlContactId && call.summary) {
      try {
        await ghlFetch(
          ctx,
          installation._id,
          `/contacts/${ghlContactId}/notes`,
          {
            method: "POST",
            body: {
              userId: undefined,
              body: `Sequ3nce call summary (${new Date(call.completedAt ?? Date.now()).toLocaleString()}):\n\n${call.summary}`,
            },
          },
        );
      } catch (err) {
        // Notes are best-effort — don't fail the whole sync.
        console.warn(
          "[setterDispositionSync] Note creation failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    // Stamp success. Reuses the legacy markGhlSynced mutation —
    // ghlContactId on the call row is the source-of-truth either way.
    await ctx.runMutation(api.ghl.markGhlSynced, {
      callId: args.callId,
      contactId: ghlContactId,
    });

    return { success: true };
  },
});
