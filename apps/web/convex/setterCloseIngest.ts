import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  recordCallEvent,
  recordSmsEvent,
  upsertAppointment,
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

// ----------------------------------------------------------------------------
// Meetings → setterAppointments (via the shared upsertAppointment sink).
// Mapping decided in the plan: appointment id = Close activity id,
// contact = lead_id, bookedBy = created_by, assignedTo = user_id;
// upcoming/completed→Confirmed (Close "completed" = time passed, NOT showed),
// declined/canceled→Cancelled; raw status kept in providerStatus.
// ----------------------------------------------------------------------------

const closeMeeting = v.object({
  id: v.string(),
  leadId: v.string(),
  createdByUserId: v.optional(v.string()),
  assignedUserId: v.optional(v.string()),
  startTime: v.number(),
  endTime: v.optional(v.number()),
  status: v.union(v.literal("Confirmed"), v.literal("Cancelled")),
  providerStatus: v.string(),
  bookedAt: v.number(),
  lastUpdatedAt: v.number(),
  prospectEmail: v.optional(v.string()),
  prospectName: v.optional(v.string()),
});

export const ingestCloseMeetings = internalMutation({
  args: {
    teamId: v.id("teams"),
    installationId: v.id("setterGhlInstallations"),
    locationId: v.string(),
    meetings: v.array(closeMeeting),
  },
  handler: async (ctx, args) => {
    const hctx: HandlerCtx = {
      teamId: args.teamId,
      installationId: args.installationId,
      locationId: args.locationId,
    };
    for (const m of args.meetings) {
      await upsertAppointment(ctx, hctx, {
        appointmentId: m.id,
        contactId: m.leadId,
        bookedByUserId: m.createdByUserId,
        assignedToUserId: m.assignedUserId,
        startTime: m.startTime,
        endTime: m.endTime,
        status: m.status,
        providerStatus: m.providerStatus,
        bookedAt: m.bookedAt,
        lastUpdatedAt: m.lastUpdatedAt,
        prospectEmail: m.prospectEmail,
        prospectName: m.prospectName,
      });
    }
    return { processed: args.meetings.length };
  },
});

// ----------------------------------------------------------------------------
// Lead enrichment — fill name/email/phone on stub leads (lazy-created from
// dial activity) so the Leads tab shows names and the closer-call matcher
// can bind leads to recorded calls.
// ----------------------------------------------------------------------------

/**
 * Page of leads still missing a name, newest-first, with a dateAdded cursor.
 * `ghlContactId` is the Close lead id — the Node action GETs /lead/{id}.
 */
export const getLeadsNeedingEnrichment = internalQuery({
  args: {
    teamId: v.id("teams"),
    beforeDateAdded: v.optional(v.number()),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("setterLeads")
      .withIndex("by_team_and_date_added", (q) =>
        args.beforeDateAdded !== undefined
          ? q.eq("teamId", args.teamId).lt("dateAdded", args.beforeDateAdded)
          : q.eq("teamId", args.teamId),
      )
      .order("desc")
      .take(Math.min(args.limit, 200));
    const needing = page
      .filter((l) => l.name === undefined)
      .map((l) => ({ id: l._id, closeLeadId: l.ghlContactId }));
    return {
      needing,
      nextCursor: page.length > 0 ? page[page.length - 1].dateAdded : null,
      pageSize: page.length,
    };
  },
});

export const applyLeadEnrichment = internalMutation({
  args: {
    items: v.array(
      v.object({
        id: v.id("setterLeads"),
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const item of args.items) {
      const lead = await ctx.db.get(item.id);
      if (!lead) continue;
      // Fill blanks only — never overwrite CRM-synced values.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = {};
      if (lead.name === undefined && item.name) patch.name = item.name;
      if (lead.email === undefined && item.email) patch.email = item.email;
      if (lead.phone === undefined && item.phone) patch.phone = item.phone;
      if (Object.keys(patch).length > 0) await ctx.db.patch(item.id, patch);
    }
    return { processed: args.items.length };
  },
});
