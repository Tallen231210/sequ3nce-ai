import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  recordCallEvent,
  recordSmsEvent,
  type HandlerCtx,
} from "./setterGhlWebhooks";

// ============================================================================
// Setter Data — Close ingest mutations (V8 isolate).
//
// These batch a page of Close activities into the SAME normalized sink the
// GHL webhook path uses (recordCallEvent/recordSmsEvent — exported from
// setterGhlWebhooks). Close ids go straight into the string fields:
//   setterLeads identity (ghlContactId) = Close lead_id
//   rep attribution   (ghlUserId)       = Close call/sms user_id (the dialer)
//   dedup key         (ghlEventKey)     = "close:" + activity.id
// The sink handles lead lazy-create, dial/connect counters, the connection
// threshold + "connected" milestone, the SMS state machine, and dedup.
// ============================================================================

const closeCall = v.object({
  leadId: v.string(),
  direction: v.union(v.literal("inbound"), v.literal("outbound")),
  occurredAt: v.number(),
  durationSec: v.optional(v.number()),
  userId: v.optional(v.string()),
  id: v.string(),
  disposition: v.optional(v.string()),
});

const closeSms = v.object({
  leadId: v.string(),
  direction: v.union(v.literal("inbound"), v.literal("outbound")),
  occurredAt: v.number(),
  userId: v.optional(v.string()),
  id: v.string(),
});

export const ingestCloseCalls = internalMutation({
  args: {
    teamId: v.id("teams"),
    installationId: v.id("setterGhlInstallations"),
    locationId: v.string(),
    calls: v.array(closeCall),
  },
  handler: async (ctx, args) => {
    const hctx: HandlerCtx = {
      teamId: args.teamId,
      installationId: args.installationId,
      locationId: args.locationId,
    };
    for (const c of args.calls) {
      await recordCallEvent(ctx, hctx, {
        ghlContactId: c.leadId,
        direction: c.direction,
        occurredAt: c.occurredAt,
        durationSec: c.durationSec,
        ghlUserId: c.userId,
        ghlEventKey: `close:${c.id}`,
        conversationId: undefined,
        extraDetails: c.disposition ? { disposition: c.disposition } : undefined,
      });
    }
    return { processed: args.calls.length };
  },
});

export const ingestCloseSms = internalMutation({
  args: {
    teamId: v.id("teams"),
    installationId: v.id("setterGhlInstallations"),
    locationId: v.string(),
    messages: v.array(closeSms),
  },
  handler: async (ctx, args) => {
    const hctx: HandlerCtx = {
      teamId: args.teamId,
      installationId: args.installationId,
      locationId: args.locationId,
    };
    for (const m of args.messages) {
      await recordSmsEvent(ctx, hctx, {
        ghlContactId: m.leadId,
        direction: m.direction,
        occurredAt: m.occurredAt,
        ghlUserId: m.userId,
        ghlEventKey: `close:${m.id}`,
        conversationId: undefined,
      });
    }
    return { processed: args.messages.length };
  },
});

/** Set lastSyncedAt on the install (called at the end of a reconcile/backfill tick). */
export const touchCloseSync = internalMutation({
  args: { installationId: v.id("setterGhlInstallations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.installationId, { lastSyncedAt: Date.now() });
  },
});
