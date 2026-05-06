import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// Setter Data — GoHighLevel webhook event handlers.
//
// The HTTP handler in http.ts verifies the Ed25519 signature, persists the
// raw payload to setterWebhookEvents, then schedules `dispatch` here to do
// the actual work asynchronously. This file is the event router + the
// per-type handlers that mutate setterLeads / setterLeadEvents.
//
// Idempotency: every handler checks ghlEventKey (or analogous business key)
// before inserting events. GHL retries on non-2xx, and our cron-driven
// reconciliation re-processes missed events too. Duplicate processing
// becomes a no-op rather than a data corruption.
// ============================================================================

// ----------------------------------------------------------------------------
// Audit row I/O — called by the httpAction layer in http.ts.
// ----------------------------------------------------------------------------

/**
 * Record an incoming webhook event to the audit log. Called from the
 * httpAction immediately after signature verification (success OR failure)
 * so we have a forensic trail of every request that reached us.
 *
 * For invalid-signature requests, signatureValid=false and processed=true
 * (no further processing happens). For valid requests, processed=false
 * and the dispatch mutation flips it to true once handling completes.
 */
export const recordIncomingWebhook = internalMutation({
  args: {
    locationId: v.string(),
    eventType: v.string(),
    ghlEventId: v.optional(v.string()),
    signatureValid: v.boolean(),
    processed: v.boolean(),
    payload: v.any(),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("setterWebhookEvents", {
      teamId: args.teamId,
      locationId: args.locationId,
      ghlEventId: args.ghlEventId,
      receivedAt: Date.now(),
      eventType: args.eventType,
      signatureValid: args.signatureValid,
      processed: args.processed,
      payload: args.payload,
    });
  },
});

// ----------------------------------------------------------------------------
// MAIN ENTRY: dispatch — switches on event type and routes to handlers.
// ----------------------------------------------------------------------------

/**
 * Process a previously-recorded webhook event. Called via
 * `ctx.scheduler.runAfter(0, ...)` from the httpAction so the HTTP response
 * returns 200 immediately while we do the work asynchronously.
 */
export const dispatch = internalMutation({
  args: {
    auditId: v.id("setterWebhookEvents"),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const audit = await ctx.db.get(args.auditId);
    if (!audit) {
      console.error("[GHL Webhook] dispatch: audit row not found", args.auditId);
      return;
    }

    if (audit.processed) {
      // Already processed — duplicate scheduler invocation, no-op.
      return;
    }

    // Resolve which Sequ3nce team owns this GHL location. Webhook payloads
    // carry locationId, not teamId, so we look up here. If the install row
    // doesn't exist yet (race during fresh install) or has been deleted
    // (post-disconnect), we mark the audit row processed with a note and
    // drop the event. Reconciliation will catch any genuinely missed data.
    const installation = await ctx.db
      .query("setterGhlInstallations")
      .withIndex("by_location", (q) => q.eq("locationId", audit.locationId))
      .first();

    if (!installation) {
      await ctx.db.patch(args.auditId, {
        processed: true,
        processingError: "No installation matches locationId — orphaned event",
        processingDurationMs: Date.now() - startedAt,
      });
      return;
    }

    if (installation.status === "uninstalled") {
      // Customer uninstalled but GHL is still firing late events. Drop them.
      await ctx.db.patch(args.auditId, {
        processed: true,
        processingError: "Installation is uninstalled — event dropped",
        processingDurationMs: Date.now() - startedAt,
      });
      return;
    }

    // Backfill the teamId on the audit row if it wasn't set at HTTP-layer time.
    if (!audit.teamId) {
      await ctx.db.patch(args.auditId, { teamId: installation.teamId });
    }

    const ctxArgs: HandlerCtx = {
      teamId: installation.teamId,
      installationId: installation._id,
      locationId: audit.locationId,
    };

    try {
      const body = audit.payload as GhlWebhookBody;

      switch (body.type) {
        case "INSTALL":
          await handleInstall(ctx, ctxArgs, body);
          break;
        case "UNINSTALL":
          await handleUninstall(ctx, ctxArgs);
          break;
        case "ContactCreate":
        case "Contact.Create":
        case "ContactUpdate":
        case "Contact.Update":
          await handleContactUpsert(ctx, ctxArgs, body);
          break;
        case "OutboundMessage":
          await handleOutboundMessage(ctx, ctxArgs, body);
          break;
        case "InboundMessage":
          await handleInboundMessage(ctx, ctxArgs, body);
          break;
        default:
          // Unsubscribed / future / unknown event types — record but don't
          // fail. We may add handlers later as scope expands.
          await ctx.db.patch(args.auditId, {
            processed: true,
            processingError: `Unhandled event type: ${body.type}`,
            processingDurationMs: Date.now() - startedAt,
          });
          return;
      }

      await ctx.db.patch(args.auditId, {
        processed: true,
        processingDurationMs: Date.now() - startedAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[GHL Webhook] dispatch error:", message, err);
      await ctx.db.patch(args.auditId, {
        processed: true,
        processingError: message,
        processingDurationMs: Date.now() - startedAt,
      });
    }
  },
});

// ----------------------------------------------------------------------------
// Per-event handlers
// ----------------------------------------------------------------------------

interface HandlerCtx {
  teamId: Id<"teams">;
  installationId: Id<"setterGhlInstallations">;
  locationId: string;
}

// Convex's mutation ctx is too narrow to type cleanly across handlers;
// use a permissive shape and rely on runtime correctness. This matches
// how ghl.ts handles the same problem.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutationCtx = any;

async function handleInstall(
  ctx: MutationCtx,
  args: HandlerCtx,
  _body: GhlWebhookBody,
): Promise<void> {
  // Most installs flow through our OAuth callback (which already wrote the
  // installation row). The INSTALL webhook can also fire on app-side
  // installs that bypass our redirect — but in those cases we wouldn't
  // have tokens. For now we just no-op: the OAuth callback is the
  // authoritative install path, and any INSTALL webhook arriving after
  // that just confirms what we already know.
  // If GHL ever ships tokens directly on the INSTALL webhook (newer
  // marketplace app feature), we'd handle that here.
  console.log("[GHL Webhook] INSTALL received for", args.locationId);
}

async function handleUninstall(
  ctx: MutationCtx,
  args: HandlerCtx,
): Promise<void> {
  await ctx.db.patch(args.installationId, { status: "uninstalled" });
  console.log("[GHL Webhook] UNINSTALL processed for", args.locationId);
}

async function handleContactUpsert(
  ctx: MutationCtx,
  args: HandlerCtx,
  body: GhlWebhookBody,
): Promise<void> {
  // Contact data can be at body.contact OR at the top level (GHL has been
  // inconsistent across event versions). Try both.
  const contact = (body.contact ?? body) as GhlContactPayload;
  const ghlContactId = contact.id || contact.contactId;
  if (!ghlContactId) {
    throw new Error("Contact webhook missing contact id");
  }

  const existing = await findLead(ctx, args.teamId, ghlContactId);
  const now = Date.now();
  const dateAdded = parseTimestamp(contact.dateAdded) ?? existing?.dateAdded ?? now;

  if (existing) {
    await ctx.db.patch(existing._id, {
      name: contact.name ?? buildName(contact) ?? existing.name,
      email: contact.email ?? existing.email,
      phone: contact.phone ?? existing.phone,
      source: contact.source ?? existing.source,
      sourceDetail: contact.sourceDetail ?? existing.sourceDetail,
      tags: contact.tags ?? existing.tags,
      assignedToGhlUserId: contact.assignedTo ?? existing.assignedToGhlUserId,
      lastSyncedAt: now,
    });
    return;
  }

  await ctx.db.insert("setterLeads", {
    teamId: args.teamId,
    ghlContactId,
    name: contact.name ?? buildName(contact),
    email: contact.email,
    phone: contact.phone,
    dateAdded,
    source: contact.source,
    sourceDetail: contact.sourceDetail,
    tags: contact.tags,
    assignedToGhlUserId: contact.assignedTo,
    assignedToName: undefined,
    dialCount: 0,
    firstDialAt: undefined,
    lastDialAt: undefined,
    smsOutboundCount: 0,
    smsInboundCount: 0,
    smsStatus: "none",
    isConnected: false,
    connectedAt: undefined,
    connectedCallDurationSec: undefined,
    appointmentCount: 0,
    showedCount: 0,
    noShowCount: 0,
    lastActivityAt: undefined,
    lastSyncedAt: now,
  });
}

async function handleOutboundMessage(
  ctx: MutationCtx,
  args: HandlerCtx,
  body: GhlWebhookBody,
): Promise<void> {
  const msg = body as GhlMessagePayload;
  const ghlContactId = msg.contactId;
  if (!ghlContactId) {
    throw new Error("OutboundMessage missing contactId");
  }

  const occurredAt = parseTimestamp(msg.dateAdded) ?? Date.now();

  if (msg.messageType === "CALL") {
    await recordCallEvent(ctx, args, {
      ghlContactId,
      direction: "outbound",
      occurredAt,
      durationSec: msg.callDuration,
      ghlUserId: msg.userId,
      ghlEventKey: msg.messageId ? `msg:${msg.messageId}` : undefined,
      conversationId: msg.conversationId,
    });
  } else if (msg.messageType === "SMS") {
    await recordSmsEvent(ctx, args, {
      ghlContactId,
      direction: "outbound",
      occurredAt,
      ghlUserId: msg.userId,
      ghlEventKey: msg.messageId ? `msg:${msg.messageId}` : undefined,
      conversationId: msg.conversationId,
    });
  }
  // Other outbound message types (Email, Voicemail, etc.) — ignored in v1
  // beyond the audit log.
}

async function handleInboundMessage(
  ctx: MutationCtx,
  args: HandlerCtx,
  body: GhlWebhookBody,
): Promise<void> {
  const msg = body as GhlMessagePayload;
  const ghlContactId = msg.contactId;
  if (!ghlContactId) {
    throw new Error("InboundMessage missing contactId");
  }

  const occurredAt = parseTimestamp(msg.dateAdded) ?? Date.now();

  if (msg.messageType === "CALL") {
    await recordCallEvent(ctx, args, {
      ghlContactId,
      direction: "inbound",
      occurredAt,
      durationSec: msg.callDuration,
      ghlUserId: msg.userId,
      ghlEventKey: msg.messageId ? `msg:${msg.messageId}` : undefined,
      conversationId: msg.conversationId,
    });
  } else if (msg.messageType === "SMS") {
    await recordSmsEvent(ctx, args, {
      ghlContactId,
      direction: "inbound",
      occurredAt,
      ghlUserId: msg.userId,
      ghlEventKey: msg.messageId ? `msg:${msg.messageId}` : undefined,
      conversationId: msg.conversationId,
    });
  }
}

// ----------------------------------------------------------------------------
// Event recording + snapshot updates
// ----------------------------------------------------------------------------

interface CallEventArgs {
  ghlContactId: string;
  direction: "inbound" | "outbound";
  occurredAt: number;
  durationSec: number | undefined;
  ghlUserId: string | undefined;
  ghlEventKey: string | undefined;
  conversationId: string | undefined;
}

async function recordCallEvent(
  ctx: MutationCtx,
  args: HandlerCtx,
  ev: CallEventArgs,
): Promise<void> {
  // Idempotency: skip if we've already recorded this exact GHL message id.
  if (ev.ghlEventKey && (await isDuplicateEvent(ctx, ev.ghlEventKey))) {
    return;
  }

  const lead = await ensureLead(ctx, args.teamId, ev.ghlContactId);
  const team = await ctx.db.get(args.teamId);
  const connectionThresholdSec = team?.setterConnectionThresholdSec ?? 60;
  const durationSec = ev.durationSec ?? 0;
  const isConnect = ev.direction === "outbound" && durationSec >= connectionThresholdSec;

  await ctx.db.insert("setterLeadEvents", {
    teamId: args.teamId,
    ghlContactId: ev.ghlContactId,
    setterLeadId: lead._id,
    eventType: ev.direction === "outbound" ? "dial_outbound" : "call_inbound",
    occurredAt: ev.occurredAt,
    ghlUserId: ev.ghlUserId,
    details: {
      callDurationSec: durationSec,
      conversationId: ev.conversationId,
    },
    ghlEventKey: ev.ghlEventKey,
  });

  // Outbound call → bump dial counters + maybe flip isConnected.
  if (ev.direction === "outbound") {
    const becameConnected = !lead.isConnected && isConnect;
    await ctx.db.patch(lead._id, {
      dialCount: lead.dialCount + 1,
      firstDialAt: lead.firstDialAt ?? ev.occurredAt,
      lastDialAt: maxTime(lead.lastDialAt, ev.occurredAt),
      lastActivityAt: maxTime(lead.lastActivityAt, ev.occurredAt),
      ...(becameConnected
        ? {
            isConnected: true,
            connectedAt: ev.occurredAt,
            connectedCallDurationSec: durationSec,
          }
        : {}),
    });

    if (becameConnected) {
      // Also drop a "connected" milestone event for clean time-series queries.
      await ctx.db.insert("setterLeadEvents", {
        teamId: args.teamId,
        ghlContactId: ev.ghlContactId,
        setterLeadId: lead._id,
        eventType: "connected",
        occurredAt: ev.occurredAt,
        ghlUserId: ev.ghlUserId,
        details: { callDurationSec: durationSec },
        ghlEventKey: ev.ghlEventKey ? `${ev.ghlEventKey}:connected` : undefined,
      });
    }
  } else {
    await ctx.db.patch(lead._id, {
      lastActivityAt: maxTime(lead.lastActivityAt, ev.occurredAt),
    });
  }
}

interface SmsEventArgs {
  ghlContactId: string;
  direction: "inbound" | "outbound";
  occurredAt: number;
  ghlUserId: string | undefined;
  ghlEventKey: string | undefined;
  conversationId: string | undefined;
}

async function recordSmsEvent(
  ctx: MutationCtx,
  args: HandlerCtx,
  ev: SmsEventArgs,
): Promise<void> {
  if (ev.ghlEventKey && (await isDuplicateEvent(ctx, ev.ghlEventKey))) {
    return;
  }

  const lead = await ensureLead(ctx, args.teamId, ev.ghlContactId);

  await ctx.db.insert("setterLeadEvents", {
    teamId: args.teamId,
    ghlContactId: ev.ghlContactId,
    setterLeadId: lead._id,
    eventType: ev.direction === "outbound" ? "sms_outbound" : "sms_inbound",
    occurredAt: ev.occurredAt,
    ghlUserId: ev.ghlUserId,
    details: {
      conversationId: ev.conversationId,
    },
    ghlEventKey: ev.ghlEventKey,
  });

  // smsStatus state machine:
  //   none → sent (on first outbound)
  //   sent → replied (on first inbound after an outbound)
  //   replied → replied (sticky)
  let nextStatus = lead.smsStatus;
  if (ev.direction === "outbound" && lead.smsStatus === "none") {
    nextStatus = "sent";
  } else if (ev.direction === "inbound" && lead.smsStatus === "sent") {
    nextStatus = "replied";
  }

  await ctx.db.patch(lead._id, {
    smsOutboundCount: lead.smsOutboundCount + (ev.direction === "outbound" ? 1 : 0),
    smsInboundCount: lead.smsInboundCount + (ev.direction === "inbound" ? 1 : 0),
    smsStatus: nextStatus,
    lastActivityAt: maxTime(lead.lastActivityAt, ev.occurredAt),
  });
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function findLead(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  ghlContactId: string,
): Promise<Doc<"setterLeads"> | null> {
  return await ctx.db
    .query("setterLeads")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_ghl_contact_id", (q: any) =>
      q.eq("teamId", teamId).eq("ghlContactId", ghlContactId),
    )
    .first();
}

/**
 * Find the lead, or create a stub if Contact.Create hasn't fired yet.
 * Webhook ordering across event types isn't guaranteed by GHL; an
 * OutboundMessage can arrive before the matching ContactCreate.
 */
async function ensureLead(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  ghlContactId: string,
): Promise<Doc<"setterLeads">> {
  const existing = await findLead(ctx, teamId, ghlContactId);
  if (existing) return existing;

  const now = Date.now();
  const id = await ctx.db.insert("setterLeads", {
    teamId,
    ghlContactId,
    name: undefined,
    email: undefined,
    phone: undefined,
    dateAdded: now,
    source: undefined,
    sourceDetail: undefined,
    tags: undefined,
    assignedToGhlUserId: undefined,
    assignedToName: undefined,
    dialCount: 0,
    firstDialAt: undefined,
    lastDialAt: undefined,
    smsOutboundCount: 0,
    smsInboundCount: 0,
    smsStatus: "none",
    isConnected: false,
    connectedAt: undefined,
    connectedCallDurationSec: undefined,
    appointmentCount: 0,
    showedCount: 0,
    noShowCount: 0,
    lastActivityAt: undefined,
    lastSyncedAt: now,
  });
  const created = await ctx.db.get(id);
  if (!created) throw new Error("Failed to create stub lead");
  return created;
}

async function isDuplicateEvent(ctx: MutationCtx, ghlEventKey: string): Promise<boolean> {
  const dup = await ctx.db
    .query("setterLeadEvents")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_ghl_event_key", (q: any) => q.eq("ghlEventKey", ghlEventKey))
    .first();
  return dup !== null;
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : undefined;
  }
  return undefined;
}

function maxTime(a: number | undefined, b: number): number {
  return a === undefined ? b : Math.max(a, b);
}

function buildName(contact: GhlContactPayload): string | undefined {
  const parts = [contact.firstName, contact.lastName].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

// ----------------------------------------------------------------------------
// Payload type shapes (loose — GHL is inconsistent across versions).
// ----------------------------------------------------------------------------

interface GhlWebhookBody {
  type: string;
  locationId?: string;
  contact?: GhlContactPayload;
  // Top-level fields for InboundMessage / OutboundMessage events
  contactId?: string;
  conversationId?: string;
  messageId?: string;
  messageType?: string;
  userId?: string;
  callDuration?: number;
  callStatus?: string;
  direction?: string;
  dateAdded?: string | number;
  // Catch-all for fields we don't care about
  [key: string]: unknown;
}

interface GhlContactPayload {
  id?: string;
  contactId?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  sourceDetail?: string;
  tags?: string[];
  assignedTo?: string;
  dateAdded?: string | number;
}

interface GhlMessagePayload extends GhlWebhookBody {
  contactId?: string;
  messageId?: string;
  messageType?: string;
  userId?: string;
  callDuration?: number;
  conversationId?: string;
  dateAdded?: string | number;
}
