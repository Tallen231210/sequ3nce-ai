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
      v.union(v.literal("users"), v.literal("contacts"), v.literal("complete")),
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
          // All pages done — move to complete phase.
          await ctx.scheduler.runAfter(0, internal.setterGhlSync.fastBackfill, {
            installationId: args.installationId,
            phase: "complete",
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
