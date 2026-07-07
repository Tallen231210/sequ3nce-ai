"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ghlFetch } from "./setterGhlClient";
import { captureAndPersist } from "./lib/sentry";

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

/**
 * Distinguish "transient" GHL-side failures (502/503/504/524, 429,
 * network resets) from hard failures that need user attention (auth
 * dead, scope revoked, malformed response). Transient errors get
 * Sentry-captured but DON'T mark the install as `status: "error"` —
 * the cron will retry on the next tick and most likely succeed.
 *
 * Real-world case: AICom's install on 2026-05-26 hit a 524 from
 * GHL's /opportunities/search (Cloudflare gateway timeout on a large
 * dataset). Before this distinction existed, the install got stuck
 * in error state forever because the hourly cron's filter excluded
 * status="error" installs from retry. Now: transient errors stay
 * transient, hard errors still escalate.
 */
function isTransientGhlError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // GHL upstream HTTP 5xx / Cloudflare gateway errors
  if (/GHL API 5\d\d/.test(msg)) return true;
  // GHL rate limit (retry honor already lives in ghlFetch, but a
  // post-retry 429 can still surface — treat as transient).
  if (/GHL API 429/.test(msg)) return true;
  // GHL's search service sometimes surfaces ITS OWN internal failure as a
  // 400 HttpException ("Error occurred while searching for contact" +
  // traceId) — a 500 wearing a 400's clothes. Verified transient on
  // Remotestack 2026-07-06: the byte-identical request replayed 200 an
  // hour after this 400 marked the install errored. Our request isn't
  // malformed; their infra hiccuped.
  if (
    /GHL API 400/.test(msg) &&
    /Error occurred while searching|"name":"HttpException"/.test(msg)
  ) {
    return true;
  }
  // Generic fetch failures from Node's runtime (DNS, connection
  // reset, timeout). Common when GHL or our network has a blip.
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(msg))
    return true;
  return false;
}

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
        v.literal("messages"),
        v.literal("appointments"),
        v.literal("opportunities"),
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
          // All pages done — move to messages phase (calls + SMS).
          // Messages run BEFORE appointments because the dashboard's
          // primary KPIs (speed-to-lead, dial counts, connection rate)
          // are message-driven.
          await ctx.scheduler.runAfter(0, internal.setterGhlSync.fastBackfill, {
            installationId: args.installationId,
            phase: "messages",
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

      if (phase === "messages") {
        // Pull call + SMS messages from GHL's conversations/messages
        // REST API. Webhooks alone are not a complete source of truth —
        // observed in a per-contact audit against AICom's install,
        // ~30% of TYPE_CALL messages in GHL's conversation history
        // never reached our dispatch path via OutboundMessage /
        // InboundMessage webhooks. Synthesize the same webhook payload
        // shape so dispatch routes through handleOutboundMessage /
        // handleInboundMessage → recordCallEvent / recordSmsEvent,
        // which already dedupe on ghlEventKey: msg:<messageId>.
        await syncMessagesRange(ctx, {
          installationId: args.installationId,
          locationId: installation.locationId,
          teamId: installation.teamId,
          rangeStartMs: Date.now() - FAST_BACKFILL_DAYS * 24 * 60 * 60 * 1000,
          rangeEndMs: Date.now(),
        });
        await ctx.scheduler.runAfter(0, internal.setterGhlSync.fastBackfill, {
          installationId: args.installationId,
          phase: "appointments",
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
          phase: "opportunities",
        });
        return;
      }

      if (phase === "opportunities") {
        // First sync pipeline metadata (cheap, infrequent), then walk
        // opportunities across all known pipelines. GHL's opportunities/
        // search is per-pipeline.
        await syncPipelines(ctx, args.installationId, installation);
        await syncOpportunitiesAllPipelines(ctx, {
          installationId: args.installationId,
          locationId: installation.locationId,
          teamId: installation.teamId,
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
      // Persist the error so it's visible in the UI (Settings tab
      // banner), in support queries, and to the hourly reconcile cron
      // which will retry. Without this, fastBackfill failures were
      // logged to ephemeral console output and then forgotten — the
      // dashboard would show "connected, no data" with no explanation.
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[fastBackfill] Error in phase=${phase}:`,
        message,
        err,
      );
      await captureAndPersist(
        err,
        async () => {
          await ctx.runMutation(internal.setterGhlOauth.markInstallationError, {
            installationId: args.installationId,
            errorMessage: `fastBackfill phase=${phase}: ${message}`.slice(0, 500),
          });
        },
        {
          feature: "fastBackfill",
          integration: "ghl-marketplace",
          extra: { phase, installationId: args.installationId },
        },
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
            // GHL's contacts/search v2 range operator expects ms-epoch
            // numbers, not ISO strings. ISO strings return 422
            // "Invalid value for 'range' operator for 'dateAdded' field".
            field: "dateAdded",
            operator: "range",
            value: {
              gte: Date.now() - FAST_BACKFILL_DAYS * 24 * 60 * 60 * 1000,
              lte: Date.now(),
            },
          },
        ],
        sort: [{ field: "dateAdded", direction: "desc" }],
        // GHL's contacts/search renamed pageSize → pageLimit. Sending
        // pageSize now returns 422 "property pageSize should not exist".
        pageLimit: CONTACTS_PAGE_SIZE,
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
            {
              // GHL's v2 only accepts the "range" operator for date
              // fields — "gte" / "lt" return 422. Value is a {gte,lte}
              // object of ms-epoch numbers (not ISO strings).
              field: "dateAdded",
              operator: "range",
              value: { gte: windowStart, lte: windowEnd },
            },
          ],
          sort: [{ field: "dateAdded", direction: "desc" }],
          // GHL's contacts/search renamed pageSize → pageLimit. Sending
        // pageSize now returns 422 "property pageSize should not exist".
        pageLimit: CONTACTS_PAGE_SIZE,
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

  // And the call/SMS messages for this month's window. Catches anything
  // the OutboundMessage / InboundMessage webhooks missed during the
  // historical month. Dedupes against existing rows by msg:<messageId>.
  await syncMessagesRange(ctx, {
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
  // GHL's /calendars/events REQUIRES one of userId / calendarId /
  // groupId — locationId alone returns 422. We loop per setter rep
  // (already in the DB from the users phase) so each appointment
  // is automatically attributed to its assigned user.
  const userIds = await ctx.runQuery(
    internal.setterGhlSyncMutations.listRepGhlUserIdsForTeam,
    { teamId: args.teamId as never },
  );

  if (userIds.length === 0) {
    // No reps in the DB yet — appointments phase has nothing to scope
    // a per-user query on. Skip silently; next fast backfill (after
    // users phase runs again) will pick up appointments.
    console.warn(
      "[syncAppointmentsRange] No setter reps for team — skipping appointments phase",
    );
    return;
  }

  const events: GhlAppointment[] = [];
  for (const userId of userIds) {
    try {
      const response = await ghlFetch<GhlCalendarEventsResponse>(
        ctx,
        args.installationId as never,
        "/calendars/events",
        {
          query: {
            locationId: args.locationId,
            userId,
            startTime: args.rangeStartMs,
            endTime: args.rangeEndMs,
          },
        },
      );
      events.push(...(response.events ?? []));
    } catch (err) {
      // Per-user failures shouldn't kill the whole appointments phase
      // for the rest of the team. Log and continue; the next
      // reconcile tick retries.
      console.error(
        `[syncAppointmentsRange] Failed to fetch events for userId=${userId}:`,
        err,
      );
    }
  }

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

// ----------------------------------------------------------------------------
// Phase: messages (calls + SMS) — REST pull to supplement webhooks
// ----------------------------------------------------------------------------

interface GhlConversationSummary {
  id?: string;
  contactId?: string;
  lastMessageDate?: number;
}

interface GhlConversationSearchResponse {
  conversations?: GhlConversationSummary[];
  total?: number;
}

interface GhlConversationMessage {
  id?: string;
  type?: number;
  messageType?: string;
  direction?: string;
  dateAdded?: string | number;
  contactId?: string;
  conversationId?: string;
  userId?: string;
  callDuration?: number;
  body?: string;
}

interface GhlMessagesResponse {
  messages?: { messages?: GhlConversationMessage[]; nextPage?: boolean };
}

interface SyncMessagesRangeArgs {
  installationId: string;
  locationId: string;
  teamId: string;
  rangeStartMs: number;
  rangeEndMs: number;
}

// Cap how much work a single sync invocation does. These bounds avoid
// the case where a customer with thousands of stale conversations
// blows past Convex's 10-min action timeout. Anything that doesn't
// fit gets caught by the next reconcile tick — the dedup key means
// re-running is safe.
const MESSAGES_MAX_CONVERSATIONS = 500;
const MESSAGES_PER_CONVERSATION_LIMIT = 100;
const MESSAGES_CONVERSATIONS_PAGE_SIZE = 100;

/**
 * Pull TYPE_CALL + TYPE_SMS messages from GHL's conversations/messages
 * REST API for a given date window, then synthesize Outbound/Inbound
 * Message webhook payloads and dispatch them through the same handler
 * pipeline that real webhooks use. This catches calls/SMS that GHL's
 * webhook delivery missed — observed in a per-contact audit against
 * the AICom install, ~30% of TYPE_CALL messages in conversation
 * history never reached us via the OutboundMessage / InboundMessage
 * webhooks.
 *
 * Idempotency: dispatch's recordCallEvent / recordSmsEvent dedupe by
 * ghlEventKey = "msg:<messageId>" via the by_ghl_event_key index, so
 * messages already captured by the webhook path are silent no-ops
 * here.
 *
 * Field mapping nit: the conversation REST API returns messageType as
 * "TYPE_CALL" / "TYPE_SMS", while live webhooks send "CALL" / "SMS".
 * We normalize to the webhook shape before recording so the dispatch
 * handler sees the same payload regardless of source.
 */
async function syncMessagesRange(
  ctx: ActionCtx,
  args: SyncMessagesRangeArgs,
): Promise<void> {
  // 1. Page through conversations sorted by last_message_date desc.
  //    Stop when last_message_date crosses below the window floor.
  const conversations: GhlConversationSummary[] = [];
  let startAfter: string | undefined = undefined;
  let conversationPagesFetched = 0;

  outer: while (conversations.length < MESSAGES_MAX_CONVERSATIONS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = {
      locationId: args.locationId,
      sortBy: "last_message_date",
      sort: "desc",
      limit: MESSAGES_CONVERSATIONS_PAGE_SIZE,
    };
    if (startAfter) query.startAfter = startAfter;

    let resp: GhlConversationSearchResponse;
    try {
      resp = await ghlFetch<GhlConversationSearchResponse>(
        ctx,
        args.installationId as never,
        "/conversations/search",
        { query },
      );
    } catch (err) {
      // Surface for the catch-and-persist wrapper in fastBackfill —
      // the messages phase will be retried on the next reconcile tick.
      throw new Error(
        `[syncMessagesRange] conversations/search failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const page = resp.conversations ?? [];
    if (page.length === 0) break;

    let crossedFloor = false;
    for (const c of page) {
      conversations.push(c);
      if (
        c.lastMessageDate !== undefined &&
        c.lastMessageDate < args.rangeStartMs
      ) {
        crossedFloor = true;
      }
      if (conversations.length >= MESSAGES_MAX_CONVERSATIONS) break outer;
    }

    if (crossedFloor) break;

    conversationPagesFetched++;
    const lastId = page[page.length - 1]?.id;
    if (!lastId || lastId === startAfter) break;
    startAfter = lastId;
  }

  console.log(
    `[syncMessagesRange] team=${args.teamId} conversations=${conversations.length} (${conversationPagesFetched} pages) window=${new Date(args.rangeStartMs).toISOString()}..${new Date(args.rangeEndMs).toISOString()}`,
  );

  // 2. For each conversation, pull messages and dispatch the ones in
  //    range. We bound messages-per-conversation to keep worst-case
  //    work predictable; if a contact has more than this in the window
  //    we'll catch the older ones on the next reconcile (the message
  //    dedup index makes that safe).
  let dispatched = 0;
  let skippedOutOfWindow = 0;
  let skippedWrongType = 0;
  let skippedNoId = 0;

  for (const conv of conversations) {
    if (!conv.id) continue;

    let messages: GhlConversationMessage[] = [];
    try {
      const resp = await ghlFetch<GhlMessagesResponse>(
        ctx,
        args.installationId as never,
        `/conversations/${conv.id}/messages`,
        { query: { limit: MESSAGES_PER_CONVERSATION_LIMIT } },
      );
      messages = resp.messages?.messages ?? [];
    } catch (err) {
      // Per-conversation failures don't kill the whole phase. Most
      // common cause is a conversation that got deleted between the
      // search and the messages call.
      console.error(
        `[syncMessagesRange] messages fetch failed for conversation=${conv.id}:`,
        err,
      );
      continue;
    }

    for (const m of messages) {
      // Normalize messageType to the webhook shape ("CALL" / "SMS").
      // The REST API returns "TYPE_CALL" / "TYPE_SMS"; numeric `type`
      // fields are also possible (25 = call, 1/2 = SMS) so check both.
      let normalizedType: "CALL" | "SMS" | null = null;
      if (
        m.messageType === "TYPE_CALL" ||
        m.messageType === "CALL" ||
        (typeof m.type === "number" && m.type === 25)
      ) {
        normalizedType = "CALL";
      } else if (
        m.messageType === "TYPE_SMS" ||
        m.messageType === "SMS" ||
        (typeof m.type === "number" && (m.type === 1 || m.type === 2))
      ) {
        normalizedType = "SMS";
      }
      if (!normalizedType) {
        skippedWrongType++;
        continue;
      }

      if (!m.id) {
        skippedNoId++;
        continue;
      }

      const dateMs =
        typeof m.dateAdded === "string"
          ? Date.parse(m.dateAdded)
          : (m.dateAdded as number | undefined);
      if (
        dateMs === undefined ||
        Number.isNaN(dateMs) ||
        dateMs < args.rangeStartMs ||
        dateMs > args.rangeEndMs
      ) {
        skippedOutOfWindow++;
        continue;
      }

      const contactId = m.contactId ?? conv.contactId;
      if (!contactId) {
        // Without a contactId the dispatch handler throws — skip rather
        // than create a useless audit row.
        skippedNoId++;
        continue;
      }

      const isInbound = m.direction === "inbound";
      const eventType = isInbound ? "InboundMessage" : "OutboundMessage";

      const auditId = await ctx.runMutation(
        internal.setterGhlWebhooks.recordIncomingWebhook,
        {
          locationId: args.locationId,
          eventType,
          ghlEventId: undefined,
          signatureValid: true,
          processed: false,
          payload: {
            type: eventType,
            locationId: args.locationId,
            contactId,
            messageId: m.id,
            messageType: normalizedType,
            userId: m.userId,
            callDuration: m.callDuration,
            conversationId: m.conversationId ?? conv.id,
            dateAdded: m.dateAdded,
            direction: m.direction,
          },
          teamId: args.teamId as never,
        },
      );
      await ctx.scheduler.runAfter(0, internal.setterGhlWebhooks.dispatch, {
        auditId,
      });
      dispatched++;
    }
  }

  console.log(
    `[syncMessagesRange] team=${args.teamId} dispatched=${dispatched} skippedOutOfWindow=${skippedOutOfWindow} skippedWrongType=${skippedWrongType} skippedNoId=${skippedNoId}`,
  );
}

// ----------------------------------------------------------------------------
// Phase: opportunities + pipelines (Phase 3)
// ----------------------------------------------------------------------------

interface GhlPipelineStage {
  id?: string;
  name?: string;
  position?: number;
}

interface GhlPipeline {
  id?: string;
  name?: string;
  stages?: GhlPipelineStage[];
}

interface GhlPipelinesResponse {
  pipelines?: GhlPipeline[];
}

interface GhlOpportunity {
  id?: string;
  contactId?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  status?: string;
  monetaryValue?: number;
  assignedTo?: string;
  name?: string;
  source?: string;
  dateAdded?: string;
  dateUpdated?: string;
}

interface GhlOpportunitySearchResponse {
  opportunities?: GhlOpportunity[];
  meta?: { total?: number; nextPage?: number; currentPage?: number };
}

interface InstallationLite {
  locationId: string;
  teamId: string;
}

/**
 * Sync pipeline metadata. GHL returns all pipelines for a location in one
 * call. We upsert each into setterPipelines so the funnel UI can render
 * stage names without per-render API hits.
 */
async function syncPipelines(
  ctx: ActionCtx,
  installationId: string,
  installation: InstallationLite,
): Promise<string[]> {
  const response = await ghlFetch<GhlPipelinesResponse>(
    ctx,
    installationId as never,
    "/opportunities/pipelines",
    { query: { locationId: installation.locationId } },
  );
  const pipelines = response.pipelines ?? [];

  const pipelineIds: string[] = [];
  for (const p of pipelines) {
    if (!p.id) continue;
    const stages = (p.stages ?? [])
      .filter((s): s is { id: string; name?: string; position?: number } => !!s.id)
      .map((s, idx) => ({
        ghlStageId: s.id,
        name: s.name || `Stage ${idx + 1}`,
        position: typeof s.position === "number" ? s.position : idx,
      }));
    await ctx.runMutation(internal.setterGhlSyncMutations.upsertPipeline, {
      teamId: installation.teamId as never,
      ghlPipelineId: p.id,
      name: p.name || "Pipeline",
      stages,
    });
    pipelineIds.push(p.id);
  }
  return pipelineIds;
}

interface SyncOpportunitiesArgs {
  installationId: string;
  locationId: string;
  teamId: string;
}

/**
 * Walk every pipeline and dispatch every opportunity in it as a synthetic
 * Opportunity.Create webhook. Same architectural pattern as contacts +
 * appointments: dispatch handles dedup via the existing webhook handler.
 */
async function syncOpportunitiesAllPipelines(
  ctx: ActionCtx,
  args: SyncOpportunitiesArgs,
): Promise<void> {
  // First fetch the pipelines list. We could read from setterPipelines
  // (just synced) but going to the source avoids a runQuery hop.
  const pipelinesResp = await ghlFetch<GhlPipelinesResponse>(
    ctx,
    args.installationId as never,
    "/opportunities/pipelines",
    { query: { locationId: args.locationId } },
  );
  const pipelines = pipelinesResp.pipelines ?? [];

  for (const pipeline of pipelines) {
    if (!pipeline.id) continue;
    await syncOpportunitiesForPipeline(ctx, args, pipeline.id);
  }
}

async function syncOpportunitiesForPipeline(
  ctx: ActionCtx,
  args: SyncOpportunitiesArgs,
  pipelineId: string,
): Promise<void> {
  let page = 1;
  const PAGE_SIZE = 100;
  const MAX_PAGES_PER_PIPELINE = 50; // 5,000 opportunities per pipeline cap

  while (page <= MAX_PAGES_PER_PIPELINE) {
    const response = await ghlFetch<GhlOpportunitySearchResponse>(
      ctx,
      args.installationId as never,
      "/opportunities/search",
      {
        query: {
          location_id: args.locationId,
          pipeline_id: pipelineId,
          limit: PAGE_SIZE,
          page,
        },
      },
    );
    const opps = response.opportunities ?? [];
    if (opps.length === 0) break;

    for (const opp of opps) {
      if (!opp.id || !opp.contactId || !opp.pipelineId) continue;
      const auditId = await ctx.runMutation(
        internal.setterGhlWebhooks.recordIncomingWebhook,
        {
          locationId: args.locationId,
          eventType: "Opportunity.Create",
          ghlEventId: undefined,
          signatureValid: true,
          processed: false,
          payload: {
            type: "Opportunity.Create",
            locationId: args.locationId,
            opportunity: {
              id: opp.id,
              contactId: opp.contactId,
              pipelineId: opp.pipelineId,
              pipelineStageId: opp.pipelineStageId,
              status: opp.status,
              monetaryValue: opp.monetaryValue,
              assignedTo: opp.assignedTo,
              name: opp.name,
              source: opp.source,
              dateAdded: opp.dateAdded,
              dateUpdated: opp.dateUpdated,
            },
          },
          teamId: args.teamId as never,
        },
      );
      await ctx.scheduler.runAfter(0, internal.setterGhlWebhooks.dispatch, {
        auditId,
      });
    }

    const totalSoFar = (page - 1) * PAGE_SIZE + opps.length;
    const hasMore =
      typeof response.meta?.total === "number"
        ? totalSoFar < response.meta.total
        : opps.length === PAGE_SIZE;
    if (!hasMore) break;
    page++;
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
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[reconcile] Error for installation ${installation._id}:`,
          message,
        );
        if (isTransientGhlError(err)) {
          // GHL had a hiccup (524 / 503 / 429 / network reset). Earlier
          // phases that ran before the throw already wrote their data.
          // Capture to Sentry for visibility but DON'T mark the install
          // as error — the next reconcile tick will retry, and the
          // user-facing banner stays clean. The install record was
          // already auto-healed (status active, errorMessage cleared)
          // by any prior successful reconcile via markInstallationSynced.
          await captureAndPersist(err, async () => {}, {
            feature: "reconcile.transient",
            integration: "ghl-marketplace",
            extra: { installationId: installation._id, message },
          });
        } else if (installation.status === "error") {
          // Already errored (this sweep retries errored installs so they can
          // self-heal). It failed again — refresh the persisted message via
          // the clobber-protected mark, but DON'T re-capture to Sentry:
          // a genuinely dead install would otherwise page us every hour.
          await ctx.runMutation(internal.setterGhlOauth.markInstallationError, {
            installationId: installation._id,
            errorMessage: `reconcile: ${message}`.slice(0, 500),
          });
        } else {
          // Hard error TRANSITION (active → error) — auth dead, scope
          // revoked, malformed response, schema validation failure. Mark
          // the install so the customer can see something needs attention,
          // and capture once at the transition.
          await captureAndPersist(
            err,
            async () => {
              await ctx.runMutation(internal.setterGhlOauth.markInstallationError, {
                installationId: installation._id,
                errorMessage: `reconcile: ${message}`.slice(0, 500),
              });
            },
            {
              feature: "reconcile",
              integration: "ghl-marketplace",
              extra: { installationId: installation._id },
            },
          );
        }
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
    // Don't short-circuit on status==="error" — the whole point of the
    // user clicking "Refresh now" from the UI is to recover from a
    // stuck error state. If the underlying issue was transient, this
    // reconcile attempt succeeds and markInstallationSynced clears the
    // banner. If it's a hard error (auth dead), the catch below
    // re-records it.
    if (installation.status === "uninstalled") {
      console.warn(
        `[reconcileSingleInstallation] Installation uninstalled — skipping`,
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
      if (isTransientGhlError(err)) {
        // Transient — Sentry-capture only, don't touch install state.
        // Throw so the manual-refresh UI shows the user something
        // went wrong (so they don't think the click did nothing); the
        // next cron tick will retry.
        await captureAndPersist(err, async () => {}, {
          feature: "reconcileSingleInstallation.transient",
          integration: "ghl-marketplace",
          extra: { installationId: installation._id, message },
        });
      } else {
        // Hard error — persist before re-throwing so the install
        // record reflects the failure for support / UI banner.
        await captureAndPersist(
          err,
          async () => {
            await ctx.runMutation(internal.setterGhlOauth.markInstallationError, {
              installationId: installation._id,
              errorMessage: `manual reconcile: ${message}`.slice(0, 500),
            });
          },
          {
            feature: "reconcileSingleInstallation",
            integration: "ghl-marketplace",
            extra: { installationId: installation._id },
          },
        );
      }
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
            {
              // GHL's v2 only accepts the "range" operator for date
              // fields — "gte" returns 422 "Invalid Operator". Value
              // is {gte,lte} ms-epoch numbers (not ISO strings).
              field: "dateUpdated",
              operator: "range",
              value: { gte: since, lte: Date.now() },
            },
          ],
          sort: [{ field: "dateUpdated", direction: "desc" }],
          // GHL's contacts/search renamed pageSize → pageLimit. Sending
        // pageSize now returns 422 "property pageSize should not exist".
        pageLimit: CONTACTS_PAGE_SIZE,
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

  // Reconcile call + SMS messages in the same overlap window. Catches
  // any OutboundMessage / InboundMessage webhook deliveries that
  // failed since the last reconcile tick. recordCallEvent /
  // recordSmsEvent dedupe by msg:<messageId> so re-running is safe.
  await syncMessagesRange(ctx, {
    installationId: installation._id,
    locationId: installation.locationId,
    teamId: installation.teamId,
    rangeStartMs: since,
    rangeEndMs: Date.now(),
  });

  // Also walk pipelines + opportunities. Pipeline metadata refresh is
  // cheap; opportunities re-walk catches any stage transitions that
  // webhooks missed. Dispatch dedupes by ghlEventKey on
  // setterStageTransitions so re-processing is safe.
  await syncOpportunitiesAllPipelines(ctx, {
    installationId: installation._id,
    locationId: installation.locationId,
    teamId: installation.teamId,
  });

  // Pick up any transcript fetches that failed transiently (network /
  // 5xx) AND any successful fetches whose AI summary attempt failed.
  // Bounded so a long-broken install doesn't flood the scheduler.
  const TRANSCRIPT_RETRY_LIMIT = 50;
  const retries = await ctx.runQuery(
    internal.setterCallTranscriptsMutations.listTranscriptsNeedingRetry,
    { teamId: installation.teamId, limit: TRANSCRIPT_RETRY_LIMIT },
  );
  for (const rowId of retries.fetchRetries) {
    await ctx.scheduler.runAfter(0, internal.ai.fetchAndProcessTranscript, {
      transcriptRowId: rowId,
    });
  }
  for (const rowId of retries.summaryRetries) {
    await ctx.scheduler.runAfter(0, internal.ai.generateSetterCallSummary, {
      transcriptRowId: rowId,
    });
  }
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
