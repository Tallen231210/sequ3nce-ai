// ============================================================================
// Hyros Read Direction (Phase 5) — V8 internal helpers.
//
// Three responsibilities:
//   1. Audit-log inbound webhook payloads (insertWebhookEvent)
//   2. Parse + patch setterLeads from valid webhook events (dispatchEvent)
//   3. Orphan reconciliation — when a webhook lands BEFORE the matching
//      setterLead exists (rare but real), the event sits in the audit log
//      until handleContactUpsert / recordCallEvent fires for that email.
//      Then matchOrphanedHyrosEvents finds and processes them.
//
// The Node-runtime action layer (hyrosReadActions.ts) handles outbound API
// calls to Hyros (poll + backfill). This file is V8-only so DB writes stay
// cheap.
// ============================================================================

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { normalizeEmail } from "./setterCloserMatcher";

// Hyros webhook event types we recognize. Any other event type lands in
// the audit log and is silently skipped during dispatch (not an error).
const KNOWN_EVENT_TYPES = new Set([
  "lead.opted.in",
  "sale.attributed",
  "call.attributed",
  "lead.origin.assigned",
]);

// Hyros's actual source-object shape (verified live against AICom in May 2026):
// {
//   trafficSource: { id, name },     // e.g. { name: "youtube" } — THE attribution key
//   category: { id, name },          // e.g. { name: "video" } — was string in docs, actually object
//   goal: { id, name },              // e.g. { name: "all" }
//   sourceLinkAd: { adSourceId, name }, // e.g. { adSourceId: "HYROS_AD_ID_123", name: "BeginnersGuide..." }
//   sourceLinkId: string,
//   clickDate / UTCClickDate: ISO string,
//   tag: string, organic: boolean, disregarded: boolean
// }
// The docs claim a separate `adSource: { platform, adAccountId }` object; that
// doesn't appear in live responses. Platform is implicit in trafficSource.name.
interface HyrosSourceShape {
  trafficSource?: { id?: string; name?: string } | string;
  name?: string;
  tag?: string;
  goal?: { id?: string; name?: string } | string;
  category?: { id?: string; name?: string } | string;
  clickDate?: string | number;
  UTCClickDate?: string;
  organic?: boolean;
  sourceLinkId?: string;
  sourceLinkAd?: {
    id?: string;
    name?: string;
    adSourceId?: string;
  };
}

function pickName(field: unknown): string | undefined {
  if (typeof field === "string") return field || undefined;
  if (field && typeof field === "object") {
    const n = (field as { name?: unknown }).name;
    return typeof n === "string" && n ? n : undefined;
  }
  return undefined;
}

/**
 * Defensively parse a Hyros source object (from firstSource / lastSource
 * on lead.opted.in, the /leads endpoint, or per-item in attribution[]
 * arrays) into our denormalized string-only shape. Returns null if the
 * source object doesn't carry a usable trafficSource name.
 */
export function normalizeHyrosSource(
  raw: unknown,
): Doc<"setterLeads">["hyrosFirstSource"] | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as HyrosSourceShape;
  const trafficSource = pickName(s.trafficSource) ?? s.name ?? null;
  if (!trafficSource) return null;
  const clickDateRaw = s.clickDate ?? s.UTCClickDate;
  return {
    trafficSource,
    trafficSourceCategory: pickName(s.category),
    adSourceId: s.sourceLinkAd?.adSourceId,
    adSourcePlatform: undefined,
    adAccountId: undefined,
    sourceLinkId: s.sourceLinkId,
    sourceLinkName: s.sourceLinkAd?.name ?? s.name,
    sourceLinkAdId: s.sourceLinkAd?.id,
    clickDate:
      typeof clickDateRaw === "number"
        ? clickDateRaw
        : typeof clickDateRaw === "string"
          ? Date.parse(clickDateRaw) || undefined
          : undefined,
    organic: s.organic,
  };
}

/**
 * Hash payload string for dedup. Convex V8 doesn't expose crypto.subtle
 * synchronously, so use a simple polynomial hash. Good enough for dedup
 * of replayed webhook deliveries (collisions are vanishingly rare and
 * non-catastrophic — second delivery would just be processed again).
 */
function hashPayload(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

/**
 * Insert raw webhook payload into the audit log BEFORE any parsing. This
 * is the cheap "never lose data" path. Dedup hash so a retried delivery
 * becomes a no-op.
 */
export const insertWebhookEvent = internalMutation({
  args: {
    teamId: v.optional(v.id("teams")),
    eventType: v.string(),
    rawPayload: v.string(),
    signatureValid: v.boolean(),
    receivedAt: v.number(),
  },
  handler: async (ctx, args): Promise<{ id: Id<"hyrosWebhookEvents"> | null; duplicate: boolean }> => {
    const payloadHash = hashPayload(args.rawPayload);
    const existing = await ctx.db
      .query("hyrosWebhookEvents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_payload_hash", (q: any) => q.eq("payloadHash", payloadHash))
      .first();
    if (existing) {
      return { id: existing._id, duplicate: true };
    }
    const id = await ctx.db.insert("hyrosWebhookEvents", {
      teamId: args.teamId,
      eventType: args.eventType,
      rawPayload: args.rawPayload,
      signatureValid: args.signatureValid,
      receivedAt: args.receivedAt,
      processed: false,
      payloadHash,
    });
    return { id, duplicate: false };
  },
});

/**
 * Parse a previously-audited webhook event and patch the matching
 * setterLead. Failures land on the audit row's processError column AND
 * Sentry — the row stays as `processed: false` so we can replay after
 * fixing the parser.
 */
export const dispatchEvent = internalMutation({
  args: {
    eventId: v.id("hyrosWebhookEvents"),
  },
  handler: async (ctx, args): Promise<void> => {
    const row = await ctx.db.get(args.eventId);
    if (!row) return;
    if (row.processed) return;
    if (!row.signatureValid) {
      await ctx.db.patch(args.eventId, {
        processed: true,
        processError: "signature_invalid",
      });
      return;
    }
    if (!KNOWN_EVENT_TYPES.has(row.eventType)) {
      await ctx.db.patch(args.eventId, {
        processed: true,
        processError: undefined,
      });
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(row.rawPayload);
    } catch (err) {
      await ctx.db.patch(args.eventId, {
        processed: false, // leave for replay
        processError: `json_parse: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw err;
    }

    // All four event types carry { lead: { email } } per docs. Defensive
    // pick — fall back to other plausible field paths if the top-level
    // shape isn't exactly what we expect.
    const email = normalizeEmail(
      parsed?.lead?.email ?? parsed?.email ?? null,
    );
    if (!email) {
      await ctx.db.patch(args.eventId, {
        processed: true,
        processError: "no_email_in_payload",
      });
      return;
    }
    if (!row.teamId) {
      await ctx.db.patch(args.eventId, {
        processed: true,
        processError: "no_team_id_resolved",
      });
      return;
    }

    // Find the matching setterLead by normalized email. Uses the by_team
    // collect path — same constraint as setterCloserBookings; the read is
    // bounded per team.
    const leads = await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", row.teamId))
      .collect();
    const matched = leads.find(
      (l) => normalizeEmail(l.email) === email,
    );
    if (!matched) {
      // Orphan — stay processed:false so a later matchOrphanedHyrosEvents
      // pass can reconcile when the lead row gets created.
      await ctx.db.patch(args.eventId, {
        processError: "orphan_no_lead",
        // leave processed:false intentionally
      });
      return;
    }

    // Extract attribution from the event-specific shape.
    const firstSource =
      normalizeHyrosSource(parsed?.firstSource) ??
      normalizeHyrosSource(parsed?.attribution?.[0]) ??
      null;
    const lastSource =
      normalizeHyrosSource(parsed?.lastSource) ??
      (parsed?.attribution?.length
        ? normalizeHyrosSource(
            parsed.attribution[parsed.attribution.length - 1],
          )
        : null) ??
      null;

    if (!firstSource && !lastSource) {
      await ctx.db.patch(args.eventId, {
        processed: true,
        processError: "no_source_extracted",
      });
      // Mark the lead as known-but-unattributed so we don't keep polling.
      await ctx.db.patch(matched._id, {
        hyrosAttributionStatus: "not_found",
        hyrosAttributionFetchedAt: Date.now(),
      });
      return;
    }

    await ctx.db.patch(matched._id, {
      ...(firstSource ? { hyrosFirstSource: firstSource } : {}),
      ...(lastSource ? { hyrosLastSource: lastSource } : {}),
      hyrosAttributionStatus: "found",
      hyrosAttributionFetchedAt: Date.now(),
    });
    await ctx.db.patch(args.eventId, {
      processed: true,
      processError: undefined,
    });
  },
});

/**
 * Reconciliation pass — fired from handleContactUpsert AND recordCallEvent
 * after a new setterLead surfaces. Looks for orphaned audit-log rows
 * whose email matches the new lead and processes them.
 */
export const matchOrphanedHyrosEvents = internalMutation({
  args: {
    teamId: v.id("teams"),
    setterLeadEmail: v.string(),
  },
  handler: async (ctx, args): Promise<{ matched: number }> => {
    const email = normalizeEmail(args.setterLeadEmail);
    if (!email) return { matched: 0 };
    // Scan unprocessed orphans for this team. Bounded — orphan count
    // should be small (it's a race-condition signal, not a steady state).
    const orphans = await ctx.db
      .query("hyrosWebhookEvents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_received_at", (q: any) =>
        q.eq("teamId", args.teamId),
      )
      .order("desc")
      .take(200);
    let matched = 0;
    for (const orphan of orphans) {
      if (orphan.processed) continue;
      if (orphan.processError !== "orphan_no_lead") continue;
      try {
        const parsed = JSON.parse(orphan.rawPayload);
        const orphanEmail = normalizeEmail(
          parsed?.lead?.email ?? parsed?.email ?? null,
        );
        if (orphanEmail === email) {
          // Schedule the same dispatch path. Now that the lead exists,
          // it'll patch instead of returning "orphan_no_lead".
          await ctx.scheduler.runAfter(
            0,
            internal.hyrosRead.dispatchEvent,
            { eventId: orphan._id },
          );
          matched++;
        }
      } catch {
        // Bad JSON — leave alone for the existing parse-error path.
      }
    }
    return { matched };
  },
});

/**
 * Diagnostic query — returns recent webhook events for the team. Used by
 * the /dashboard/hyros-sync/diagnostics page.
 */
export const recentWebhookEvents = internalQuery({
  args: {
    teamId: v.id("teams"),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("hyrosWebhookEvents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_received_at", (q: any) =>
        q.eq("teamId", args.teamId),
      )
      .order("desc")
      .take(args.limit);
    return events.map((e) => ({
      id: String(e._id),
      eventType: e.eventType,
      receivedAt: e.receivedAt,
      signatureValid: e.signatureValid,
      processed: e.processed,
      processError: e.processError,
    }));
  },
});

/**
 * Diagnostic query — Hyros coverage stats for the team. Used by the
 * diagnostics page and by the BookingsPanel's "X% attributed" caption.
 */
export const hyrosCoverageForTeam = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const leads = await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .collect();
    let withAttribution = 0;
    let pending = 0;
    let notFound = 0;
    for (const lead of leads) {
      if (lead.hyrosAttributionStatus === "found") withAttribution++;
      else if (lead.hyrosAttributionStatus === "pending") pending++;
      else if (lead.hyrosAttributionStatus === "not_found") notFound++;
    }
    return {
      totalLeads: leads.length,
      withAttribution,
      pending,
      notFound,
    };
  },
});
