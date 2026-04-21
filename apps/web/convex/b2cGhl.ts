"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ==================== Constants ====================

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const TAG_LEAD_CAPTURED = "b2c-lead-captured";
const TAG_SIGNED_UP = "b2c-signed-up";
const FETCH_TIMEOUT_MS = 15_000;

// ==================== Helpers ====================

/**
 * Normalize a phone number to E.164 format as best we can for US-based leads.
 * Returns null if we can't confidently format it — caller should skip or fail fast.
 *
 * Rules:
 *  - If input already starts with "+" and has ≥8 digits total → return cleaned
 *  - Else strip non-digits:
 *    - 10 digits → prefix "+1"
 *    - 11 digits starting with "1" → prefix "+"
 *    - Anything else → null
 */
function toE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
    return null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

function readGhlEnv(): { token: string; locationId: string } {
  const token = process.env.GHL_PIT_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) {
    throw new Error(
      "GHL_PIT_TOKEN / GHL_LOCATION_ID env vars not set in Convex"
    );
  }
  return { token, locationId };
}

async function ghlFetch(
  path: string,
  init: { method: "POST" | "GET"; body?: unknown; token: string }
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${GHL_API_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${init.token}`,
        Version: GHL_API_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      // non-JSON response is fine
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

// ==================== Public actions ====================
// (Internal DB helpers live in b2cGhlInternal.ts — required because this file
// uses "use node" runtime which doesn't allow queries/mutations.)

/**
 * Sync a lead row to GHL: upsert the contact with the `b2c-lead-captured` tag.
 * Called from b2cLeads.saveLead after insert/update, and from a retry cron.
 *
 * Failure mode is non-fatal to the caller — the lead row is already in our DB,
 * GHL sync status just gets flipped to "failed" + a cron will retry.
 */
export const syncLeadToGHL = action({
  args: { leadId: v.id("b2cLeads") },
  handler: async (ctx, args): Promise<{ synced: boolean; error?: string }> => {
    const lead = await ctx.runQuery(internal.b2cGhlInternal.getLead, { leadId: args.leadId });
    if (!lead) return { synced: false, error: "Lead not found" };
    if (lead.ghlSyncStatus === "synced") return { synced: true };

    let env;
    try {
      env = readGhlEnv();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "env error";
      await ctx.runMutation(internal.b2cGhlInternal.markLeadFailed, {
        leadId: args.leadId,
        error: msg,
      });
      return { synced: false, error: msg };
    }

    const e164 = toE164(lead.phone);
    // Upsert the contact WITHOUT passing `tags` — on upsert, `tags` would
    // REPLACE the whole tag set and could clobber an existing `b2c-signed-up`
    // if this is a returning user. Append the lead-captured tag separately via
    // POST /contacts/{id}/tags so we never wipe pre-existing tags.
    const upsertBody: Record<string, unknown> = {
      locationId: env.locationId,
      email: lead.email,
      source: lead.source ? `sequ3nce.ai landing — ${lead.source}` : "sequ3nce.ai landing",
    };
    if (e164) upsertBody.phone = e164;
    if (lead.firstName) upsertBody.firstName = lead.firstName;
    if (lead.lastName) upsertBody.lastName = lead.lastName;

    const res = await ghlFetch("/contacts/upsert", {
      method: "POST",
      body: upsertBody,
      token: env.token,
    });

    if (!res.ok) {
      const errMsg = `GHL upsert failed: status=${res.status} ${
        res.error ?? JSON.stringify(res.data)?.slice(0, 200) ?? ""
      }`;
      await ctx.runMutation(internal.b2cGhlInternal.markLeadFailed, {
        leadId: args.leadId,
        error: errMsg,
      });
      return { synced: false, error: errMsg };
    }

    const contactId =
      (res.data as { contact?: { id?: string } } | null)?.contact?.id ?? null;
    if (!contactId) {
      const errMsg = "GHL upsert returned no contact id";
      await ctx.runMutation(internal.b2cGhlInternal.markLeadFailed, {
        leadId: args.leadId,
        error: errMsg,
      });
      return { synced: false, error: errMsg };
    }

    // Append the lead-captured tag. This endpoint adds to the existing tag set
    // rather than replacing it — safe for returning users.
    const tagRes = await ghlFetch(`/contacts/${contactId}/tags`, {
      method: "POST",
      body: { tags: [TAG_LEAD_CAPTURED] },
      token: env.token,
    });
    if (!tagRes.ok) {
      const errMsg = `GHL tag append failed: status=${tagRes.status}`;
      await ctx.runMutation(internal.b2cGhlInternal.markLeadFailed, {
        leadId: args.leadId,
        error: errMsg,
      });
      return { synced: false, error: errMsg };
    }

    await ctx.runMutation(internal.b2cGhlInternal.markLeadSynced, {
      leadId: args.leadId,
      ghlContactId: contactId,
    });
    return { synced: true };
  },
});

/**
 * Fire-on-signup: when a user creates a B2C account, upsert the contact by
 * email and APPEND the `b2c-signed-up` tag (via /contacts/{id}/tags so we
 * don't clobber the lead-captured tag).
 */
export const syncSignupToGHL = action({
  args: { email: v.string(), phone: v.optional(v.string()), name: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ synced: boolean; error?: string }> => {
    let env;
    try {
      env = readGhlEnv();
    } catch (err) {
      return { synced: false, error: err instanceof Error ? err.message : "env error" };
    }

    const email = args.email.trim().toLowerCase();
    const e164 = args.phone ? toE164(args.phone) : null;

    // Upsert by email — idempotent, safe to re-run. Note: on upsert, `tags`
    // REPLACES the whole tag set. We intentionally DON'T pass tags here
    // (avoid clobbering lead-captured), then append signed-up via a second call.
    const upsertBody: Record<string, unknown> = {
      locationId: env.locationId,
      email,
      source: "sequ3nce personal app signup",
    };
    if (e164) upsertBody.phone = e164;
    if (args.name) upsertBody.firstName = args.name.split(/\s+/)[0] || args.name;

    const upsert = await ghlFetch("/contacts/upsert", {
      method: "POST",
      body: upsertBody,
      token: env.token,
    });
    if (!upsert.ok) {
      return {
        synced: false,
        error: `GHL upsert failed: status=${upsert.status}`,
      };
    }
    const contactId =
      (upsert.data as { contact?: { id?: string } } | null)?.contact?.id ?? null;
    if (!contactId) return { synced: false, error: "no contact id returned" };

    // Append signed-up tag without clobbering existing tags
    const tagRes = await ghlFetch(`/contacts/${contactId}/tags`, {
      method: "POST",
      body: { tags: [TAG_SIGNED_UP] },
      token: env.token,
    });
    if (!tagRes.ok) {
      return {
        synced: false,
        error: `GHL tag append failed: status=${tagRes.status}`,
      };
    }

    // If we have a matching b2cLeads row, update its ghlContactId so future
    // lead syncs don't create a duplicate.
    const existingLead = await ctx.runQuery(internal.b2cGhlInternal.getLeadByEmail, { email });
    if (existingLead && !existingLead.ghlContactId) {
      await ctx.runMutation(internal.b2cGhlInternal.markLeadSynced, {
        leadId: existingLead._id as Id<"b2cLeads">,
        ghlContactId: contactId,
      });
    }

    return { synced: true };
  },
});

/**
 * Cron-called retry sweep — picks up failed + stuck-pending leads and re-runs
 * syncLeadToGHL for each.
 */
export const retryFailedLeadSyncs = action({
  args: {},
  handler: async (ctx): Promise<{ retried: number }> => {
    // "Stuck pending" = still pending after 5 minutes
    const staleBefore = Date.now() - 5 * 60 * 1000;
    const rows = await ctx.runQuery(internal.b2cGhlInternal.listLeadsNeedingRetry, {
      staleBeforeMs: staleBefore,
    });
    for (const lead of rows) {
      try {
        await ctx.runAction(api.b2cGhl.syncLeadToGHL, { leadId: lead._id });
      } catch {
        // Non-fatal; row stays in failed/pending state, next cron tick retries
      }
    }
    return { retried: rows.length };
  },
});
