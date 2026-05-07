"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ghlFetch } from "./setterGhlClient";

// ============================================================================
// Setter Data — REST sync actions.
//
// fastBackfill   — runs on install (and re-install). Pulls the last 90
//                  days of contacts + setter reps so the dashboard is
//                  immediately useful. Chunked + resumable to stay under
//                  Convex's 10-min action time limit.
//
// Note on architecture: the backfill flow synthesizes webhook-shaped
// audit rows and schedules the existing setterGhlWebhooks.dispatch
// mutation to process them. Same code path as live webhooks → no event
// upsert / snapshot logic duplicated, automatic dedup via ghlEventKey.
//
// Phase 1.6 scope: users + contacts only (lead skeletons). Historical
// messages (call durations, SMS history) come from webhooks going
// forward; the deep-backfill cron in Phase 1.7 fills in older messages
// asynchronously over the following hours.
// ============================================================================

const FAST_BACKFILL_DAYS = 90;
const CONTACTS_PAGE_SIZE = 100;

// Deep backfill walks one month per cron tick per installation. 12 total
// months gives us a year of history when combined with the fast-backfill
// 90-day window (months 0-3).
const DEEP_BACKFILL_TARGET_MONTHS = 12;
const DEEP_BACKFILL_BATCH_SIZE = 5; // max installations per cron tick
const APPROX_MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000;

// Reconciliation overlaps the polling window slightly (90 min for an
// hourly cron) so a webhook that arrived right before the previous
// reconcile tick is caught if it was somehow missed.
const RECONCILE_OVERLAP_MINUTES = 90;

// Per-invocation time budget. Convex caps actions at ~10 min; we yield
// well before that to give scheduling overhead breathing room.
const TIME_BUDGET_MS = 7 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionCtx = any;

// ----------------------------------------------------------------------------
// fastBackfill — internal action, chunked + resumable
// ----------------------------------------------------------------------------

export const fastBackfill = internalAction({
  args: {
    installationId: v.id("setterGhlInstallations"),
    // State machine cursor — undefined on first call, then carried via
    // scheduler.runAfter recursion until backfill completes.
    phase: v.optional(
      v.union(
        v.literal("users"),
        v.literal("contacts"),
        v.literal("appointments"),
        v.literal("complete"),
      ),
    ),
    contactsPage: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const phase = args.phase ?? "users";

    // Verify installation is still active before doing any work — customer
    // could have disconnected between scheduler invocations.
    const installation = await ctx.runQuery(
      internal.setterGhlOauth.getInstallationById,
      { installationId: args.installationId },
    );
    if (!installation) {
      console.error("[fastBackfill] Installation not found:", args.installationId);
      return;
    }
    if (installation.status !== "active") {
      console.warn(
        `[fastBackfill] Installation status is ${installation.status} — aborting`,
      );
      return;
    }

    try {
      if (phase === "users") {
        await syncUsersAndLocation(ctx, args.installationId, installation.locationId);
        // Move to contacts phase.
        await ctx.scheduler.runAfter(0, internal.setterGhlSync.fastBackfill, {
          installationId: args.installationId,
          phase: "contacts",
          contactsPage: 1,
        });
        return;
      }

      if (phase === "contacts") {
        const result = await syncContactsPage(ctx, {
          installationId: args.installationId,
          locationId: installation.locationId,
          teamId: installation.teamId,
          page: args.contactsPage ?? 1,
        });

        if (!result.hasMore) {
          // All pages done — move to appointments phase.
          await ctx.scheduler.runAfter(0, internal.setterGhlSync.fastBackfill, {
            installationId: args.installationId,
            phase: "appointments",
          });
          return;
        }

        // Check time budget before continuing.
        const elapsed = Date.now() - startedAt;
        if (elapsed > TIME_BUDGET_MS) {
          // Reschedule with next page, fresh time budget.
          await ctx.scheduler.runAfter(1000, internal.setterGhlSync.fastBackfill, {
            installationId: args.installationId,
            phase: "contacts",
            contactsPage: result.nextPage,
          });
          return;
        }

        // Same invocation, recurse to next page (cheap — Convex batches
        // tail calls through scheduler.runAfter(0) without a wait).
        await ctx.scheduler.runAfter(0, internal.setterGhlSync.fastBackfill, {
          installationId: args.installationId,
          phase: "contacts",
          contactsPage: result.nextPage,
        });
        return;
      }

      if (phase === "appointments") {
        // GHL's calendar events endpoint returns the full date-range result
        // in a single response (no per-page cursor in the same way as
        // contacts/search). For typical orgs in 90 days that's a few
        // hundred rows — well within a single action invocation.
        // If a customer ever has 10k+ appointments in 90 days, we can
        // chunk by date here without changing the dispatch flow.
        await syncAppointmentsRange(ctx, {
          installationId: args.installationId,
          locationId: installation.locationId,
          teamId: installation.teamId,
          rangeStartMs: Date.now() - FAST_BACKFILL_DAYS * 24 * 60 * 60 * 1000,
          // Pull future appointments through 60 days out so booked-but-
          // not-yet-occurred slots are visible immediately.
          rangeEndMs: Date.now() + 60 * 24 * 60 * 60 * 1000,
        });
        await ctx.scheduler.runAfter(0, internal.setterGhlSync.fastBackfill, {
          installationId: args.installationId,
          phase: "complete",
        });
        return;
      }

      if (phase === "complete") {
        await ctx.runMutation(internal.setterGhlSyncMutations.markFastBackfillComplete, {
          installationId: args.installationId,
        });
        console.log(
          `[fastBackfill] Complete for installation ${args.installationId}`,
        );
        return;
      }
    } catch (err) {
      // Don't crash the whole sync on transient errors. Log and stop;
      // the next cron-driven reconcile pass will pick up where we left
      // off (since fastBackfillCompletedAt is still null).
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[fastBackfill] Error in phase=${phase}:`,
        message,
        err,
      );
    }
  },
});

// ----------------------------------------------------------------------------
// Phase: users (+ location metadata)
// ----------------------------------------------------------------------------

interface GhlUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  roles?: { type?: string };
}

interface GhlUsersResponse {
  users?: GhlUser[];
}

interface GhlLocationResponse {
  location?: {
    id?: string;
    name?: string;
  };
}

async function syncUsersAndLocation(
  ctx: ActionCtx,
  installationId: string,
  locationId: string,
): Promise<void> {
  // Fetch + cache the location's display name (not on the OAuth token
  // response). Best-effort — if it fails, we keep going; the UI just
  // won't show a location label until the next reconcile.
  try {
    const locationResp = await ghlFetch<GhlLocationResponse>(
      ctx,
      installationId as never,
      `/locations/${locationId}`,
    );
    if (locationResp.location?.name) {
      await ctx.runMutation(
        internal.setterGhlSyncMutations.patchInstallationLocationName,
        {
          installationId: installationId as never,
          locationName: locationResp.location.name,
        },
      );
    }
  } catch (err) {
    console.warn("[fastBackfill] Could not fetch location metadata:", err);
  }

  // Fetch sub-account users. Endpoint accepts a locationId filter.
  const usersResp = await ghlFetch<GhlUsersResponse>(
    ctx,
    installationId as never,
    "/users/",
    { query: { locationId } },
  );
  const users = usersResp.users ?? [];

  // Look up the team id once (we'll attribute every rep to this team).
  const installation = await ctx.runQuery(
    internal.setterGhlOauth.getInstallationById,
    { installationId: installationId as never },
  );
  if (!installation) return;

  for (const user of users) {
    if (!user.id) continue;
    const name = user.name || joinName(user.firstName, user.lastName) || user.email || user.id;
    await ctx.runMutation(internal.setterGhlSyncMutations.upsertSetterRep, {
      teamId: installation.teamId,
      ghlUserId: user.id,
      name,
      email: user.email,
      phone: user.phone,
      ghlRole: user.roles?.type,
    });
  }
}

function joinName(first?: string, last?: string): string | undefined {
  const parts = [first, last].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

// ----------------------------------------------------------------------------
// Phase: contacts
// ----------------------------------------------------------------------------

interface GhlContact {
  id: string;
  contactName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  tags?: string[];
  assignedTo?: string;
  dateAdded?: string;
}

interface GhlContactsSearchResponse {
  contacts: GhlContact[];
  total?: number;
}

interface SyncContactsPageArgs {
  installationId: string;
  locationId: string;
  teamId: string;
  page: number;
}

interface SyncContactsPageResult {
  hasMore: boolean;
  nextPage: number;
  processed: number;
}

async function syncContactsPage(
  ctx: ActionCtx,
  args: SyncContactsPageArgs,
): Promise<SyncContactsPageResult> {
  const since = new Date(Date.now() - FAST_BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const response = await ghlFetch<GhlContactsSearchResponse>(
    ctx,
    args.installationId as never,
    "/contacts/search",
    {
      method: "POST",
      body: {
        locationId: args.locationId,
        filters: [
          {
            field: "dateAdded",
            operator: "gte",
            value: since,
          },
        ],
        sort: [{ field: "dateAdded", direction: "desc" }],
        pageSize: CONTACTS_PAGE_SIZE,
        page: args.page,
      },
    },
  );

  const contacts = response.contacts ?? [];

  // Synthesize a Contact.Create webhook for each contact and route it
  // through the existing dispatch pipeline. Same code path as a real
  // webhook → automatic idempotency, snapshot updates, audit trail.
  for (const contact of contacts) {
    if (!contact.id) continue;

    const syntheticPayload = {
      type: "Contact.Create",
      locationId: args.locationId,
      contact: {
        id: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        name: contact.contactName,
        email: contact.email,
        phone: contact.phone,
        source: contact.source,
        tags: contact.tags,
        assignedTo: contact.assignedTo,
        dateAdded: contact.dateAdded,
      },
    };

    const auditId = await ctx.runMutation(
      internal.setterGhlWebhooks.recordIncomingWebhook,
      {
        locationId: args.locationId,
        eventType: "Contact.Create",
        ghlEventId: undefined,
        // Backfill events are trusted (they came from our own REST call,
        // not an unverified webhook), so signatureValid=true.
        signatureValid: true,
        processed: false,
        payload: syntheticPayload,
        teamId: args.teamId as never,
      },
    );

    await ctx.scheduler.runAfter(0, internal.setterGhlWebhooks.dispatch, {
      auditId,
    });
  }

  // GHL's contacts/search returns `total` so we can compute hasMore
  // accurately. If absent, fall back to "did this page return a full
  // batch?" heuristic — still correct unless the API ever returns a
  // partial last page that happens to equal pageSize (edge case we
  // catch on the next page anyway).
  const totalSoFar = (args.page - 1) * CONTACTS_PAGE_SIZE + contacts.length;
  const hasMore =
    typeof response.total === "number"
      ? totalSoFar < response.total
      : contacts.length === CONTACTS_PAGE_SIZE;

  return {
    hasMore,
    nextPage: args.page + 1,
    processed: contacts.length,
  };
}

// ============================================================================
// deepBackfillStep — cron-driven, extends history backward month-by-month
// ============================================================================
//
// Runs every 30 min (registered in crons.ts). Each tick picks up to 5
// installations whose fast backfill has completed but who haven't yet
// reached 12 months of deep history. For each, it pulls one additional
// month's worth of contacts and dispatches them through the webhook
// pipeline. Eventually each installation hits month 12 and is marked
// complete; the cron stops selecting it.
//
// Phase 1 scope: contacts only (lead skeletons). Historical messages
// arrive from webhooks for the post-install timeline, and a future
// dedicated cron can backfill historical messages if needed.
// ============================================================================

export const deepBackfillStep = internalAction({
  args: {},
  handler: async (ctx) => {
    const candidates = await ctx.runQuery(
      internal.setterGhlOauth.getInstallationsNeedingDeepBackfill,
      { limit: DEEP_BACKFILL_BATCH_SIZE },
    );

    if (candidates.length === 0) {
      return { processed: 0 };
    }

    let processed = 0;
    for (const installation of candidates) {
      const lastMonth = installation.deepBackfillLastCompletedMonth ?? 3;
      const nextMonth = lastMonth + 1;
      try {
        await syncMonthOfContacts(ctx, {
          installationId: installation._id,
          locationId: installation.locationId,
          teamId: installation.teamId,
          monthIndex: nextMonth,
        });
        await ctx.runMutation(internal.setterGhlSyncMutations.advanceDeepBackfill, {
          installationId: installation._id,
          completedMonth: nextMonth,
        });
        processed++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[deepBackfillStep] Error for installation ${installation._id} at month ${nextMonth}:`,
          message,
        );
        // Stamp the error so future ticks skip this installation until
        // a manual recovery clears it.
        await ctx.runMutation(internal.setterGhlSyncMutations.setDeepBackfillError, {
          installationId: installation._id,
          errorMessage: `Month ${nextMonth}: ${message}`,
        });
      }
    }

    return { processed };
  },
});

interface SyncMonthArgs {
  installationId: string;
  locationId: string;
  teamId: string;
  monthIndex: number; // 4..12 — month 0 = "now", monthN = "N months ago"
}

async function syncMonthOfContacts(ctx: ActionCtx, args: SyncMonthArgs): Promise<void> {
  const now = Date.now();
  const windowEnd = now - (args.monthIndex - 1) * APPROX_MS_PER_MONTH;
  const windowStart = now - args.monthIndex * APPROX_MS_PER_MONTH;

  const startIso = new Date(windowStart).toISOString();
  const endIso = new Date(windowEnd).toISOString();

  let page = 1;
  // Soft cap on pages per month per tick — we only need to be done by
  // the time DEEP_BACKFILL_TARGET_MONTHS × 30min < 6h, well within
  // budget even for the largest customers.
  const MAX_PAGES_PER_MONTH = 50;

  while (page <= MAX_PAGES_PER_MONTH) {
    const response = await ghlFetch<GhlContactsSearchResponse>(
      ctx,
      args.installationId as never,
      "/contacts/search",
      {
        method: "POST",
        body: {
          locationId: args.locationId,
          filters: [
            { field: "dateAdded", operator: "gte", value: startIso },
            { field: "dateAdded", operator: "lt", value: endIso },
          ],
          sort: [{ field: "dateAdded", direction: "desc" }],
          pageSize: CONTACTS_PAGE_SIZE,
          page,
        },
      },
    );

    const contacts = response.contacts ?? [];

    for (const contact of contacts) {
      if (!contact.id) continue;
      const auditId = await ctx.runMutation(
        internal.setterGhlWebhooks.recordIncomingWebhook,
        {
          locationId: args.locationId,
          eventType: "Contact.Create",
          ghlEventId: undefined,
          signatureValid: true,
          processed: false,
          payload: {
            type: "Contact.Create",
            locationId: args.locationId,
            contact: {
              id: contact.id,
              firstName: contact.firstName,
              lastName: contact.lastName,
              name: contact.contactName,
              email: contact.email,
              phone: contact.phone,
              source: contact.source,
              tags: contact.tags,
              assignedTo: contact.assignedTo,
              dateAdded: contact.dateAdded,
            },
          },
          teamId: args.teamId as never,
        },
      );
      await ctx.scheduler.runAfter(0, internal.setterGhlWebhooks.dispatch, {
        auditId,
      });
    }

    const totalSoFar = (page - 1) * CONTACTS_PAGE_SIZE + contacts.length;
    const hasMore =
      typeof response.total === "number"
        ? totalSoFar < response.total
        : contacts.length === CONTACTS_PAGE_SIZE;
    if (!hasMore) break;
    page++;
  }

  // Also sync appointments within this month's window. Same date filter
  // applies to GHL's calendar events. Synthesizes Appointment.Create
  // payloads + dispatches through the webhook pipeline.
  await syncAppointmentsRange(ctx, {
    installationId: args.installationId,
    locationId: args.locationId,
    teamId: args.teamId,
    rangeStartMs: windowStart,
    rangeEndMs: windowEnd,
  });
}

// ----------------------------------------------------------------------------
// Phase: appointments
// ----------------------------------------------------------------------------

interface GhlAppointment {
  id?: string;
  contactId?: string;
  calendarId?: string;
  createdBy?: string;
  assignedUserId?: string;
  userId?: string;
  startTime?: string | number;
  endTime?: string | number;
  appointmentStatus?: string;
  status?: string;
  dateAdded?: string | number;
  dateUpdated?: string | number;
}

interface GhlCalendarEventsResponse {
  events?: GhlAppointment[];
}

interface SyncAppointmentsRangeArgs {
  installationId: string;
  locationId: string;
  teamId: string;
  rangeStartMs: number;
  rangeEndMs: number;
}

/**
 * Fetch all calendar events for a location in a date range and
 * dispatch each as a synthetic Appointment.Create webhook. Idempotency
 * at the dispatch level (handler dedupes by ghlAppointmentId) means
 * re-running this for an overlapping range is a no-op for already-known
 * appointments and an upsert for any with newer status changes.
 *
 * GHL's calendar events endpoint returns the full result in one response
 * for typical date ranges. For very large ranges with thousands of
 * events we'd need to chunk by date — punted until we see a customer
 * actually hit it.
 */
async function syncAppointmentsRange(
  ctx: ActionCtx,
  args: SyncAppointmentsRangeArgs,
): Promise<void> {
  const response = await ghlFetch<GhlCalendarEventsResponse>(
    ctx,
    args.installationId as never,
    "/calendars/events",
    {
      query: {
        locationId: args.locationId,
        startTime: args.rangeStartMs,
        endTime: args.rangeEndMs,
      },
    },
  );

  const events = response.events ?? [];

  for (const event of events) {
    if (!event.id || !event.contactId) continue;

    const auditId = await ctx.runMutation(
      internal.setterGhlWebhooks.recordIncomingWebhook,
      {
        locationId: args.locationId,
        eventType: "Appointment.Create",
        ghlEventId: undefined,
        signatureValid: true,
        processed: false,
        payload: {
          type: "Appointment.Create",
          locationId: args.locationId,
          appointment: {
            id: event.id,
            contactId: event.contactId,
            calendarId: event.calendarId,
            createdBy: event.createdBy,
            assignedUserId: event.assignedUserId,
            userId: event.userId,
            startTime: event.startTime,
            endTime: event.endTime,
            appointmentStatus: event.appointmentStatus ?? event.status,
            status: event.status,
            dateAdded: event.dateAdded,
            dateUpdated: event.dateUpdated,
          },
        },
        teamId: args.teamId as never,
      },
    );
    await ctx.scheduler.runAfter(0, internal.setterGhlWebhooks.dispatch, {
      auditId,
    });
  }
}

// ============================================================================
// reconcile — hourly safety net
// ============================================================================
//
// Webhooks can be missed (GHL retries 3x then gives up; network blips
// happen; our deploys briefly drop in-flight events). An hourly pass
// fetches all contacts modified in the last 90 minutes and routes them
// through the same dispatch pipeline. Idempotency at the lead-events
// level (ghlEventKey) means re-processing is safe.
// ============================================================================

export const reconcile = internalAction({
  args: {},
  handler: async (ctx) => {
    const installations = await ctx.runQuery(
      internal.setterGhlOauth.getInstallationsForReconcile,
      {},
    );
    if (installations.length === 0) return { processed: 0 };

    let processed = 0;
    for (const installation of installations) {
      try {
        await reconcileInstallation(ctx, installation);
        await ctx.runMutation(
          internal.setterGhlSyncMutations.markInstallationSynced,
          { installationId: installation._id },
        );
        processed++;
      } catch (err) {
        // Reconcile errors are non-fatal — log and skip; next tick retries.
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[reconcile] Error for installation ${installation._id}:`,
          message,
        );
      }
    }
    return { processed };
  },
});

/**
 * Per-installation reconcile variant for the Settings-tab "Refresh now"
 * button. Same logic as reconcile() but scoped to a single team so one
 * customer's manual refresh doesn't sweep every other customer's data.
 */
export const reconcileSingleInstallation = internalAction({
  args: {
    installationId: v.id("setterGhlInstallations"),
  },
  handler: async (ctx, args) => {
    const installation = await ctx.runQuery(
      internal.setterGhlOauth.getInstallationById,
      { installationId: args.installationId },
    );
    if (!installation) {
      console.warn(
        "[reconcileSingleInstallation] Installation not found:",
        args.installationId,
      );
      return { processed: 0 };
    }
    if (installation.status !== "active") {
      console.warn(
        `[reconcileSingleInstallation] Installation status is ${installation.status} — skipping`,
      );
      return { processed: 0 };
    }

    try {
      await reconcileInstallation(ctx, installation);
      await ctx.runMutation(
        internal.setterGhlSyncMutations.markInstallationSynced,
        { installationId: installation._id },
      );
      return { processed: 1 };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[reconcileSingleInstallation] Error for ${installation._id}:`,
        message,
      );
      throw err; // surface to UI via mutation rejection
    }
  },
});

interface InstallationDoc {
  _id: string;
  locationId: string;
  teamId: string;
}

async function reconcileInstallation(
  ctx: ActionCtx,
  installation: InstallationDoc,
): Promise<void> {
  const since = Date.now() - RECONCILE_OVERLAP_MINUTES * 60 * 1000;
  const sinceIso = new Date(since).toISOString();

  // Filter on dateUpdated rather than dateAdded so we catch contacts
  // that were modified (assignment changes, tag additions, etc.) since
  // the last reconcile.
  let page = 1;
  const MAX_PAGES = 20; // safety cap — typical orgs see <500 modifications/90min

  while (page <= MAX_PAGES) {
    const response = await ghlFetch<GhlContactsSearchResponse>(
      ctx,
      installation._id as never,
      "/contacts/search",
      {
        method: "POST",
        body: {
          locationId: installation.locationId,
          filters: [
            { field: "dateUpdated", operator: "gte", value: sinceIso },
          ],
          sort: [{ field: "dateUpdated", direction: "desc" }],
          pageSize: CONTACTS_PAGE_SIZE,
          page,
        },
      },
    );
    const contacts = response.contacts ?? [];

    for (const contact of contacts) {
      if (!contact.id) continue;
      const auditId = await ctx.runMutation(
        internal.setterGhlWebhooks.recordIncomingWebhook,
        {
          locationId: installation.locationId,
          eventType: "Contact.Update",
          ghlEventId: undefined,
          signatureValid: true,
          processed: false,
          payload: {
            type: "Contact.Update",
            locationId: installation.locationId,
            contact: {
              id: contact.id,
              firstName: contact.firstName,
              lastName: contact.lastName,
              name: contact.contactName,
              email: contact.email,
              phone: contact.phone,
              source: contact.source,
              tags: contact.tags,
              assignedTo: contact.assignedTo,
              dateAdded: contact.dateAdded,
            },
          },
          teamId: installation.teamId as never,
        },
      );
      await ctx.scheduler.runAfter(0, internal.setterGhlWebhooks.dispatch, {
        auditId,
      });
    }

    const totalSoFar = (page - 1) * CONTACTS_PAGE_SIZE + contacts.length;
    const hasMore =
      typeof response.total === "number"
        ? totalSoFar < response.total
        : contacts.length === CONTACTS_PAGE_SIZE;
    if (!hasMore) break;
    page++;
  }

  // Also reconcile appointments updated in the same window. Catches any
  // status transitions (Confirmed → Showed / No Show) that webhooks
  // missed. The dispatch dedupes on transition so re-running is safe.
  // Window extends 30 days into the future so reconcile picks up newly-
  // booked appointments scheduled in advance.
  await syncAppointmentsRange(ctx, {
    installationId: installation._id,
    locationId: installation.locationId,
    teamId: installation.teamId,
    rangeStartMs: since,
    rangeEndMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
}

// ============================================================================
// pruneWebhookAudit — daily, deletes setterWebhookEvents older than 30 days
// ============================================================================

const AUDIT_RETENTION_DAYS = 30;
const AUDIT_PRUNE_BATCH_SIZE = 1000;

export const pruneWebhookAudit = internalAction({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    // Loop until a batch is non-full, signalling we've drained the
    // expired rows. Capped at 50 batches per run as a safety net so a
    // runaway audit table can't tie up the cron forever.
    let totalDeleted = 0;
    for (let i = 0; i < 50; i++) {
      const result = await ctx.runMutation(
        internal.setterGhlSyncMutations.pruneOldWebhookEvents,
        { olderThan: cutoff, limit: AUDIT_PRUNE_BATCH_SIZE },
      );
      totalDeleted += result.deleted;
      if (result.deleted < AUDIT_PRUNE_BATCH_SIZE) break;
    }
    if (totalDeleted > 0) {
      console.log(`[pruneWebhookAudit] Deleted ${totalDeleted} expired audit rows`);
    }
    return { deleted: totalDeleted };
  },
});
