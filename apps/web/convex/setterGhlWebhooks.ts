import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

// Convex's `v.optional(v.string())` validator means "field absent" — it
// rejects explicit `null`. GHL freely sends null for unset fields like
// source, assignedTo, etc. Coerce null → undefined at every write site
// where we forward raw GHL fields to ctx.db.insert/patch.
function nn<T>(v: T | null | undefined): T | undefined {
  return v ?? undefined;
}

// GHL sometimes sends an object instead of a string for "user-id-shaped"
// fields when the appointment/opportunity was created by a third-party
// integration (e.g. Calendly returns `createdBy: {source: "calendly"}`).
// Our schema expects `v.optional(v.string())` for these fields, which
// rejects both null and non-string objects. Use this at every write site
// that forwards a GHL-supplied user id to ctx.db.insert/patch.
function nnStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

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
        case "AppointmentCreate":
        case "Appointment.Create":
          await handleAppointmentUpsert(ctx, ctxArgs, body, "create");
          break;
        case "AppointmentUpdate":
        case "Appointment.Update":
          await handleAppointmentUpsert(ctx, ctxArgs, body, "update");
          break;
        case "OpportunityCreate":
        case "Opportunity.Create":
          await handleOpportunityUpsert(ctx, ctxArgs, body, "create");
          break;
        case "OpportunityUpdate":
        case "Opportunity.Update":
        case "OpportunityStatusUpdate":
        case "Opportunity.StatusChanged":
          await handleOpportunityUpsert(ctx, ctxArgs, body, "update");
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

export interface HandlerCtx {
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
      assignedToGhlUserId: nnStr(contact.assignedTo) ?? existing.assignedToGhlUserId,
      lastSyncedAt: now,
    });
    return;
  }

  await ctx.db.insert("setterLeads", {
    teamId: args.teamId,
    ghlContactId,
    name: nn(contact.name) ?? buildName(contact),
    email: nn(contact.email),
    phone: nn(contact.phone),
    dateAdded,
    source: nn(contact.source),
    sourceDetail: nn(contact.sourceDetail),
    tags: nn(contact.tags),
    assignedToGhlUserId: nnStr(contact.assignedTo),
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

// ----------------------------------------------------------------------------
// Appointments — Phase 2
// ----------------------------------------------------------------------------

const VALID_APPOINTMENT_STATUSES = [
  "Confirmed",
  "Showed",
  "No Show",
  "Cancelled",
  "Invalid",
  "Unconfirmed",
] as const;
type AppointmentStatus = (typeof VALID_APPOINTMENT_STATUSES)[number];

function isValidAppointmentStatus(s: unknown): s is AppointmentStatus {
  return (
    typeof s === "string" &&
    VALID_APPOINTMENT_STATUSES.includes(s as AppointmentStatus)
  );
}

async function handleAppointmentUpsert(
  ctx: MutationCtx,
  args: HandlerCtx,
  body: GhlWebhookBody,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _kind: "create" | "update",
): Promise<void> {
  // GHL's appointment payload shape varies a bit between Create and Update —
  // sometimes the data is at body.appointment, sometimes top-level. Try both.
  const apt = (body.appointment ?? body) as GhlAppointmentPayload;
  const ghlAppointmentId = apt.id || apt.appointmentId;
  if (!ghlAppointmentId) {
    throw new Error("Appointment webhook missing appointment id");
  }

  const ghlContactId = apt.contactId;
  if (!ghlContactId) {
    throw new Error("Appointment webhook missing contactId");
  }

  // Default to "Confirmed" if GHL doesn't send a status — happens on
  // some Create events. Update events always have one.
  const rawStatus = apt.appointmentStatus ?? apt.status ?? "Confirmed";
  const status: AppointmentStatus = isValidAppointmentStatus(rawStatus)
    ? rawStatus
    : "Confirmed";

  const startTime = parseTimestamp(apt.startTime) ?? Date.now();
  const endTime = parseTimestamp(apt.endTime);
  const lastUpdatedAt = parseTimestamp(apt.dateUpdated) ?? Date.now();
  const bookedAt = parseTimestamp(apt.dateAdded) ?? lastUpdatedAt;

  // Upsert the appointment row. Idempotency: lookup by
  // (teamId, ghlAppointmentId) — same key used to dedupe redeliveries.
  const existing = await findAppointment(ctx, args.teamId, ghlAppointmentId);

  let prevStatus: AppointmentStatus | null = null;
  if (existing) {
    prevStatus = isValidAppointmentStatus(existing.status)
      ? existing.status
      : null;
    await ctx.db.patch(existing._id, {
      ghlContactId,
      ghlCalendarId: nnStr(apt.calendarId) ?? existing.ghlCalendarId,
      bookedByGhlUserId: nnStr(apt.createdBy) ?? existing.bookedByGhlUserId,
      assignedToGhlUserId:
        nnStr(apt.assignedUserId) ??
        nnStr(apt.userId) ??
        existing.assignedToGhlUserId,
      startTime,
      endTime,
      status,
      lastUpdatedAt,
    });
  } else {
    await ctx.db.insert("setterAppointments", {
      teamId: args.teamId,
      ghlAppointmentId,
      ghlContactId,
      ghlCalendarId: nnStr(apt.calendarId),
      bookedByGhlUserId: nnStr(apt.createdBy),
      assignedToGhlUserId: nnStr(apt.assignedUserId) ?? nnStr(apt.userId),
      startTime,
      endTime,
      status,
      bookedAt,
      lastUpdatedAt,
    });
  }

  // Emit a lead event for the timeline. New appointments → "appointment_booked";
  // status changes → "appointment_status_change". The lead-events table
  // is the source of truth for the drilldown timeline.
  const lead = await ensureLead(ctx, args.teamId, ghlContactId);
  if (!existing) {
    await ctx.db.insert("setterLeadEvents", {
      teamId: args.teamId,
      ghlContactId,
      setterLeadId: lead._id,
      eventType: "appointment_booked",
      occurredAt: bookedAt,
      ghlUserId: nnStr(apt.createdBy),
      details: {
        ghlAppointmentId,
        calendarId: apt.calendarId,
        startTime,
        status,
      },
      ghlEventKey: `appt-booked:${ghlAppointmentId}`,
    });
  } else if (prevStatus !== status) {
    await ctx.db.insert("setterLeadEvents", {
      teamId: args.teamId,
      ghlContactId,
      setterLeadId: lead._id,
      eventType: "appointment_status_change",
      occurredAt: lastUpdatedAt,
      ghlUserId: nnStr(apt.createdBy),
      details: {
        ghlAppointmentId,
        from: prevStatus,
        to: status,
      },
      // Include status in the dedup key — handlers deduplicate on the
      // exact transition so a redelivered Update is a no-op but a fresh
      // Update from a different state is recorded.
      ghlEventKey: `appt-status:${ghlAppointmentId}:${status}:${lastUpdatedAt}`,
    });
  }

  // Recompute lead snapshot counts from the current setterAppointments rows.
  // Cheap (typical lead has < 3 appointments), keeps the snapshot in sync
  // even when GHL reorders status events.
  await recomputeLeadAppointmentCounts(ctx, args.teamId, ghlContactId);
}

async function findAppointment(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  ghlAppointmentId: string,
) {
  return await ctx.db
    .query("setterAppointments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_appointment_id", (q: any) =>
      q.eq("teamId", teamId).eq("ghlAppointmentId", ghlAppointmentId),
    )
    .first();
}

async function recomputeLeadAppointmentCounts(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  ghlContactId: string,
): Promise<void> {
  const lead = await findLead(ctx, teamId, ghlContactId);
  if (!lead) return;

  const appts = await ctx.db
    .query("setterAppointments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_contact", (q: any) =>
      q.eq("teamId", teamId).eq("ghlContactId", ghlContactId),
    )
    .collect();

  let appointmentCount = 0;
  let showedCount = 0;
  let noShowCount = 0;
  for (const a of appts) {
    // Cancelled / Invalid don't count toward booking activity.
    if (a.status === "Cancelled" || a.status === "Invalid") continue;
    appointmentCount += 1;
    if (a.status === "Showed") showedCount += 1;
    else if (a.status === "No Show") noShowCount += 1;
  }

  await ctx.db.patch(lead._id, {
    appointmentCount,
    showedCount,
    noShowCount,
    lastActivityAt: maxTime(lead.lastActivityAt, Date.now()),
  });
}

// ----------------------------------------------------------------------------
// Opportunities — Phase 3
// ----------------------------------------------------------------------------

async function handleOpportunityUpsert(
  ctx: MutationCtx,
  args: HandlerCtx,
  body: GhlWebhookBody,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _kind: "create" | "update",
): Promise<void> {
  // GHL's opportunity payloads vary across event versions. Check both
  // body.opportunity and top-level for the data we need.
  const opp = (body.opportunity ?? body) as GhlOpportunityPayload;
  const ghlOpportunityId = opp.id || opp.opportunityId;
  if (!ghlOpportunityId) {
    throw new Error("Opportunity webhook missing opportunity id");
  }

  const ghlContactId = opp.contactId;
  if (!ghlContactId) {
    throw new Error("Opportunity webhook missing contactId");
  }

  const ghlPipelineId = opp.pipelineId;
  const ghlStageId = opp.pipelineStageId || opp.stageId;
  if (!ghlPipelineId || !ghlStageId) {
    throw new Error("Opportunity webhook missing pipelineId or stageId");
  }

  const status = opp.status || "open";
  const monetaryValue = typeof opp.monetaryValue === "number"
    ? opp.monetaryValue
    : undefined;
  const dateAdded = parseTimestamp(opp.dateAdded) ?? Date.now();
  const lastUpdatedAt = parseTimestamp(opp.dateUpdated) ?? Date.now();

  // Upsert the opportunity, recording stage transition if stageId changed.
  const existing = await findOpportunity(ctx, args.teamId, ghlOpportunityId);

  if (existing) {
    const stageChanged = existing.ghlStageId !== ghlStageId;
    await ctx.db.patch(existing._id, {
      ghlContactId,
      ghlPipelineId,
      ghlStageId,
      status,
      monetaryValue,
      assignedToGhlUserId: nnStr(opp.assignedTo) ?? existing.assignedToGhlUserId,
      name: nn(opp.name) ?? existing.name,
      source: nn(opp.source) ?? existing.source,
      lastUpdatedAt,
    });

    if (stageChanged) {
      // Log the transition. fromStageId comes from the existing row;
      // duration is the time between the previous transition (or
      // dateAdded if first transition) and now.
      const prevTransitionAt = await getLatestTransitionTimestamp(
        ctx,
        args.teamId,
        ghlOpportunityId,
      );
      const previousStageStartedAt = prevTransitionAt ?? existing.dateAdded;
      const durationSec = Math.max(
        0,
        Math.floor((lastUpdatedAt - previousStageStartedAt) / 1000),
      );

      await ctx.db.insert("setterStageTransitions", {
        teamId: args.teamId,
        ghlOpportunityId,
        ghlContactId,
        ghlPipelineId,
        fromStageId: existing.ghlStageId,
        toStageId: ghlStageId,
        transitionedAt: lastUpdatedAt,
        durationInPreviousStageSec: durationSec,
        triggeredByGhlUserId: nnStr(opp.assignedTo),
      });
    }
  } else {
    await ctx.db.insert("setterOpportunities", {
      teamId: args.teamId,
      ghlOpportunityId,
      ghlContactId,
      ghlPipelineId,
      ghlStageId,
      status,
      monetaryValue,
      assignedToGhlUserId: nnStr(opp.assignedTo),
      name: nn(opp.name),
      source: nn(opp.source),
      dateAdded,
      lastUpdatedAt,
    });

    // Record the initial "stage entry" so durationInPreviousStageSec
    // works correctly on the first transition out of this stage.
    await ctx.db.insert("setterStageTransitions", {
      teamId: args.teamId,
      ghlOpportunityId,
      ghlContactId,
      ghlPipelineId,
      fromStageId: undefined,
      toStageId: ghlStageId,
      transitionedAt: dateAdded,
      durationInPreviousStageSec: undefined,
      triggeredByGhlUserId: nnStr(opp.assignedTo),
    });
  }

  // Emit a lead-event for the timeline so opportunity moves show up
  // alongside dials/SMS/appointments in the lead drilldown.
  const lead = await ensureLead(ctx, args.teamId, ghlContactId);
  await ctx.db.insert("setterLeadEvents", {
    teamId: args.teamId,
    ghlContactId,
    setterLeadId: lead._id,
    eventType: "opportunity_stage_change",
    occurredAt: lastUpdatedAt,
    ghlUserId: nnStr(opp.assignedTo),
    details: {
      ghlOpportunityId,
      ghlPipelineId,
      ghlStageId,
      status,
      monetaryValue,
    },
    ghlEventKey: `opp:${ghlOpportunityId}:${ghlStageId}:${lastUpdatedAt}`,
  });
}

async function findOpportunity(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  ghlOpportunityId: string,
) {
  return await ctx.db
    .query("setterOpportunities")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_opp_id", (q: any) =>
      q.eq("teamId", teamId).eq("ghlOpportunityId", ghlOpportunityId),
    )
    .first();
}

async function getLatestTransitionTimestamp(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  ghlOpportunityId: string,
): Promise<number | null> {
  const last = await ctx.db
    .query("setterStageTransitions")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_opportunity", (q: any) =>
      q.eq("teamId", teamId).eq("ghlOpportunityId", ghlOpportunityId),
    )
    .order("desc")
    .first();
  return last?.transitionedAt ?? null;
}

// ----------------------------------------------------------------------------
// Calls / SMS — Phase 1
// ----------------------------------------------------------------------------

export interface CallEventArgs {
  ghlContactId: string;
  direction: "inbound" | "outbound";
  occurredAt: number;
  durationSec: number | undefined;
  ghlUserId: string | undefined;
  ghlEventKey: string | undefined;
  conversationId: string | undefined;
  // Optional extra fields merged into the event `details` (e.g. Close's
  // `disposition`). GHL callers don't pass this — additive, no behavior change.
  extraDetails?: Record<string, unknown>;
}

// Exported so provider adapters (e.g. setterCloseIngest) can feed the same
// normalized sink — dial counting, connection threshold, dedup, lead
// lazy-create — instead of reimplementing it. The functions don't validate
// provider origin; they take string IDs + a dedup key.
export async function recordCallEvent(
  ctx: MutationCtx,
  args: HandlerCtx,
  ev: CallEventArgs,
): Promise<void> {
  // Ensure a pending transcript row exists for this call BEFORE the
  // dedup early-return. Reason: when syncMessagesRange replays
  // historical messages via the dispatch pipeline, the call event row
  // is already in setterLeadEvents (dedup hit) and the rest of this
  // function short-circuits — but we still need the transcript fetch
  // to be scheduled for those historical calls. The upsert is keyed
  // by (teamId, ghlMessageId) so duplicates don't accumulate.
  if (ev.ghlEventKey?.startsWith("msg:")) {
    const ghlMessageId = ev.ghlEventKey.slice(4);
    const existingTranscriptRow = await ctx.db
      .query("setterCallTranscripts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_message", (q: any) =>
        q.eq("teamId", args.teamId).eq("ghlMessageId", ghlMessageId),
      )
      .first();
    let transcriptRowId = existingTranscriptRow?._id;
    if (!transcriptRowId) {
      transcriptRowId = await ctx.db.insert("setterCallTranscripts", {
        teamId: args.teamId,
        ghlContactId: ev.ghlContactId,
        ghlMessageId,
        direction: ev.direction,
        occurredAt: ev.occurredAt,
        durationSec: ev.durationSec,
        transcriptionStatus: "pending",
        fetchAttempts: 0,
      });
    }
    if (
      !existingTranscriptRow ||
      existingTranscriptRow.transcriptionStatus === "pending" ||
      existingTranscriptRow.transcriptionStatus === "failed"
    ) {
      await ctx.scheduler.runAfter(0, internal.ai.fetchAndProcessTranscript, {
        transcriptRowId,
      });
    }
  }

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
      ...(ev.extraDetails ?? {}),
    },
    ghlEventKey: ev.ghlEventKey,
  });

  // Outbound call → bump dial counters + maybe flip isConnected.
  if (ev.direction === "outbound") {
    const becameConnected = !lead.isConnected && isConnect;
    // Capture first-dial transition BEFORE the patch so we can fire the
    // speed-to-lead Slack ping. lead.firstDialAt is set on first dial via
    // `?? ev.occurredAt` below, so reading the old value here gives us
    // the truth about whether this is a brand-new lead's first dial.
    // recordCallEvent only runs for call events; direction=outbound is
    // sufficient to identify dial_outbound here.
    const isFirstDialTransition =
      lead.firstDialAt === undefined && ev.ghlUserId !== undefined;

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

export interface SmsEventArgs {
  ghlContactId: string;
  direction: "inbound" | "outbound";
  occurredAt: number;
  ghlUserId: string | undefined;
  ghlEventKey: string | undefined;
  conversationId: string | undefined;
}

export async function recordSmsEvent(
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
export async function ensureLead(
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

export async function isDuplicateEvent(ctx: MutationCtx, ghlEventKey: string): Promise<boolean> {
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
  appointment?: GhlAppointmentPayload;
  opportunity?: GhlOpportunityPayload;
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

interface GhlOpportunityPayload {
  id?: string;
  opportunityId?: string;
  contactId?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  stageId?: string;
  status?: string;
  monetaryValue?: number;
  assignedTo?: string;
  name?: string;
  source?: string;
  dateAdded?: string | number;
  dateUpdated?: string | number;
}

interface GhlAppointmentPayload {
  id?: string;
  appointmentId?: string;
  contactId?: string;
  calendarId?: string;
  // GHL uses different field names depending on webhook version. We
  // probe both — `createdBy` on newer payloads, `userId` on older ones.
  createdBy?: string;
  assignedUserId?: string;
  userId?: string;
  startTime?: string | number;
  endTime?: string | number;
  // GHL sometimes calls this `appointmentStatus`, sometimes plain `status`.
  appointmentStatus?: string;
  status?: string;
  dateAdded?: string | number;
  dateUpdated?: string | number;
}
