"use node";

// ============================================================================
// Setter Data — Close backfill (Node runtime).
//
// closeFastBackfill: a self-rescheduling state machine (mirrors the GHL
// fastBackfill shape) that pulls the last 90 days of Close activity into the
// normalized Setter-Data pipeline so a freshly-connected team's dashboard
// populates within minutes. Phases: users → calls → sms → complete.
//
// Scale: activities are paged NEWEST-FIRST via a backward date cursor
// (date_created__lt) inside a 90-day window — never a deep _skip over the
// (125k-lead) org. Dedup on "close:<activity.id>" makes re-runs idempotent.
// Close is on its OWN scheduling; the GHL crons already exclude provider=close.
// ============================================================================

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { closeFetch } from "./setterCloseClient";
import { decryptApiKey } from "./lib/encrypt";
import { captureAndPersist } from "./lib/sentry";

/* eslint-disable @typescript-eslint/no-explicit-any */

const WINDOW_DAYS = 90;
const PAGE = 100;
const TIME_BUDGET_MS = 6 * 60 * 1000;
const CALL_FIELDS = "id,lead_id,user_id,direction,duration,disposition,date_created";
const SMS_FIELDS = "id,lead_id,user_id,direction,date_created";
const MEETING_FIELDS =
  "id,lead_id,user_id,created_by,starts_at,ends_at,status,date_created,date_updated,attendees";
// Leads enriched per closeFetch page during the enrich phase (each needs its
// own GET /lead/{id}, so keep batches modest for rate-limit headroom).
const ENRICH_QUERY_PAGE = 100;

const PHASE = v.union(
  v.literal("users"),
  v.literal("calls"),
  v.literal("sms"),
  v.literal("meetings"),
  v.literal("enrich"),
  v.literal("complete"),
);

// Activity-phase config: which endpoint each phase crawls and what follows it.
const ACTIVITY_PHASES = {
  calls: { path: "/activity/call/", fields: CALL_FIELDS, next: "sms" },
  sms: { path: "/activity/sms/", fields: SMS_FIELDS, next: "meetings" },
  meetings: { path: "/activity/meeting/", fields: MEETING_FIELDS, next: "enrich" },
} as const;

const RECONCILE_OVERLAP_MS = 90 * 60 * 1000;
const MAX_BACKFILL_RETRIES = 5;

function dir(d: unknown): "inbound" | "outbound" {
  return d === "inbound" ? "inbound" : "outbound";
}

// Transient = worth retrying (rate limit, 5xx, network blip). A hard error
// (auth, 4xx) is not — mark the install errored so it surfaces + stops.
// Without this, one blip mid-crawl would mark the install errored and stall
// the whole backfill (the reconcile cron only picks up COMPLETED backfills).
function isTransientCloseError(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    /close api (429|500|502|503|504)\b/.test(m) ||
    m.includes("failed after retries") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("enotfound") ||
    m.includes("eai_again") ||
    m.includes("fetch failed") ||
    m.includes("socket hang up")
  );
}

function mapCall(r: any) {
  return {
    leadId: r.lead_id,
    direction: dir(r.direction),
    occurredAt: Date.parse(r.date_created),
    durationSec: typeof r.duration === "number" ? r.duration : undefined,
    userId: r.user_id ?? undefined,
    id: r.id,
    disposition: r.disposition ?? undefined,
  };
}

function mapSms(r: any) {
  return {
    leadId: r.lead_id,
    direction: dir(r.direction),
    occurredAt: Date.parse(r.date_created),
    userId: r.user_id ?? undefined,
    id: r.id,
  };
}

function mapMeeting(r: any) {
  // Prospect = the attendee who isn't the organizer and has no Close user id.
  // NEVER take the organizer/closer's email — patching it onto the lead would
  // bind the lead to every one of that closer's recorded calls in the matcher.
  const prospect = (r.attendees || []).find(
    (a: any) => a && a.is_organizer === false && !a.user_id && a.email,
  );
  const s = String(r.status ?? "");
  // Close "completed" only means the scheduled time passed — the show signal
  // comes from the metrics-layer waterfall, so both map to "Confirmed".
  const cancelled = s.includes("declined") || s.includes("cancel");
  return {
    id: r.id,
    leadId: r.lead_id,
    createdByUserId: r.created_by ?? undefined,
    assignedUserId: r.user_id ?? undefined,
    startTime: Date.parse(r.starts_at),
    endTime: r.ends_at ? Date.parse(r.ends_at) : undefined,
    status: (cancelled ? "Cancelled" : "Confirmed") as "Cancelled" | "Confirmed",
    providerStatus: s || "unknown",
    bookedAt: Date.parse(r.date_created),
    lastUpdatedAt: r.date_updated ? Date.parse(r.date_updated) : Date.parse(r.date_created),
    prospectEmail: prospect?.email ?? undefined,
    prospectName: prospect?.name ?? undefined,
  };
}

export const closeFastBackfill = internalAction({
  args: {
    installationId: v.id("setterGhlInstallations"),
    phase: v.optional(PHASE),
    // Backward date cursor for calls/sms (date_created__lt).
    cursor: v.optional(v.string()),
    // Consecutive transient-error retries for this step (reset on progress).
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const startedAt = Date.now();
    const install: any = await ctx.runQuery(
      internal.setterGhlOauth.getInstallationById,
      { installationId: args.installationId },
    );
    // Guard: disconnected / wrong provider / errored between reschedules.
    if (!install || install.provider !== "close" || install.status !== "active") {
      console.warn("[closeFastBackfill] install missing/not-active/not-close — aborting");
      return;
    }

    const phase = (args.phase ?? "users") as
      | "users"
      | "calls"
      | "sms"
      | "meetings"
      | "enrich"
      | "complete";
    const key = decryptApiKey(install.accessToken);
    const base = {
      teamId: install.teamId,
      installationId: args.installationId,
      locationId: install.locationId as string,
    };
    const windowStartISO = new Date(
      Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    try {
      if (phase === "users") {
        let skip = 0;
        for (;;) {
          const page: any = await closeFetch(key, "/user/", {
            query: { _limit: PAGE, _skip: skip },
          });
          const users: any[] = page.data || [];
          for (const u of users) {
            const name =
              [u.first_name, u.last_name].filter(Boolean).join(" ") ||
              u.email ||
              "Unknown";
            await ctx.runMutation(internal.setterGhlSyncMutations.upsertSetterRep, {
              teamId: install.teamId,
              ghlUserId: u.id,
              name,
              email: u.email ?? undefined,
            });
          }
          if (!page.has_more || users.length === 0) break;
          skip += users.length;
          if (Date.now() - startedAt > TIME_BUDGET_MS) break;
        }
        await ctx.scheduler.runAfter(0, internal.setterCloseSync.closeFastBackfill, {
          installationId: args.installationId,
          phase: "calls",
        });
        return;
      }

      if (phase === "calls" || phase === "sms" || phase === "meetings") {
        const { path, fields, next } = ACTIVITY_PHASES[phase];
        let cursor = args.cursor;

        for (;;) {
          const query: any = {
            _limit: PAGE,
            _fields: fields,
            date_created__gte: windowStartISO,
          };
          if (cursor) query.date_created__lt = cursor;

          const page: any = await closeFetch(key, path, { query });
          const rows: any[] = (page.data || []).filter((r: any) =>
            phase === "meetings" ? r.lead_id && r.starts_at : r.lead_id,
          );

          if (rows.length > 0) {
            if (phase === "calls") {
              await ctx.runMutation(internal.setterCloseIngest.ingestCloseCalls, {
                ...base,
                calls: rows.map(mapCall),
              });
            } else if (phase === "sms") {
              await ctx.runMutation(internal.setterCloseIngest.ingestCloseSms, {
                ...base,
                messages: rows.map(mapSms),
              });
            } else {
              await ctx.runMutation(internal.setterCloseIngest.ingestCloseMeetings, {
                ...base,
                meetings: rows.map(mapMeeting),
              });
            }
          }

          // Advance the backward cursor to the OLDEST date in the page (min,
          // not last — don't assume server ordering). ISO strings compare
          // chronologically. Dedup absorbs any boundary overlap.
          const allDates = (page.data || [])
            .map((r: any) => r.date_created)
            .filter(Boolean) as string[];
          const nextCursor =
            allDates.length > 0 ? allDates.reduce((a, b) => (a < b ? a : b)) : cursor;

          const noProgress = nextCursor === cursor;
          if (!page.has_more || (page.data || []).length === 0 || noProgress) {
            await ctx.scheduler.runAfter(0, internal.setterCloseSync.closeFastBackfill, {
              installationId: args.installationId,
              phase: next,
            });
            return;
          }
          cursor = nextCursor;

          if (Date.now() - startedAt > TIME_BUDGET_MS) {
            await ctx.scheduler.runAfter(1000, internal.setterCloseSync.closeFastBackfill, {
              installationId: args.installationId,
              phase,
              cursor,
            });
            return;
          }
        }
      }

      if (phase === "enrich") {
        // Fill name/email/phone on stub leads via GET /lead/{id}. Cursor is
        // the dateAdded paging position (stringified for the shared cursor arg).
        let cursor: number | undefined = args.cursor ? Number(args.cursor) : undefined;

        for (;;) {
          const batch: any = await ctx.runQuery(
            internal.setterCloseIngest.getLeadsNeedingEnrichment,
            {
              teamId: install.teamId,
              beforeDateAdded: cursor,
              limit: ENRICH_QUERY_PAGE,
            },
          );

          const items: any[] = [];
          for (const l of batch.needing) {
            try {
              const lead: any = await closeFetch(key, `/lead/${l.closeLeadId}/`, {
                query: { _fields: "id,display_name,contacts" },
              });
              const c = (lead.contacts || [])[0] || {};
              items.push({
                id: l.id,
                name: c.name || lead.display_name || undefined,
                email: c.emails?.[0]?.email ?? undefined,
                phone: c.phones?.[0]?.phone ?? undefined,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (/Close API 404/.test(msg)) {
                // Lead deleted in Close — mark it so we don't refetch forever.
                items.push({ id: l.id, name: "(removed from Close)" });
              } else {
                throw err; // transient — outer retry resumes at this cursor
              }
            }
          }
          if (items.length > 0) {
            await ctx.runMutation(internal.setterCloseIngest.applyLeadEnrichment, {
              items,
            });
          }

          if (batch.pageSize === 0 || batch.nextCursor === null) {
            await ctx.scheduler.runAfter(0, internal.setterCloseSync.closeFastBackfill, {
              installationId: args.installationId,
              phase: "complete",
            });
            return;
          }
          cursor = batch.nextCursor;

          if (Date.now() - startedAt > TIME_BUDGET_MS) {
            await ctx.scheduler.runAfter(1000, internal.setterCloseSync.closeFastBackfill, {
              installationId: args.installationId,
              phase,
              cursor: String(cursor),
            });
            return;
          }
        }
      }

      if (phase === "complete") {
        await ctx.runMutation(internal.setterGhlSyncMutations.markFastBackfillComplete, {
          installationId: args.installationId,
        });
        console.log("[closeFastBackfill] complete", args.installationId);
        return;
      }
    } catch (err) {
      const attempt = args.attempt ?? 0;
      // Transient blip → retry the same step with backoff instead of marking
      // the install errored (which would permanently stall the crawl).
      if (isTransientCloseError(err) && attempt < MAX_BACKFILL_RETRIES) {
        console.warn(
          `[closeFastBackfill] transient error phase=${phase} attempt=${attempt + 1}/${MAX_BACKFILL_RETRIES}:`,
          err instanceof Error ? err.message : String(err),
        );
        await ctx.scheduler.runAfter(
          Math.min(30000 * (attempt + 1), 120000),
          internal.setterCloseSync.closeFastBackfill,
          {
            installationId: args.installationId,
            phase,
            cursor: args.cursor,
            attempt: attempt + 1,
          },
        );
        return;
      }
      // Hard error, or retries exhausted → surface it and stop.
      await captureAndPersist(
        err,
        async () => {
          await ctx.runMutation(internal.setterGhlOauth.markInstallationError, {
            installationId: args.installationId,
            errorMessage: `closeFastBackfill phase=${phase}: ${
              err instanceof Error ? err.message : String(err)
            }`.slice(0, 500),
          });
        },
        {
          feature: `closeFastBackfill:${phase}`,
          integration: "close",
          extra: { installationId: args.installationId, attempt },
        },
      );
    }
  },
});

// ----------------------------------------------------------------------------
// closeReconcile — ongoing freshness (cron). Polls each active Close install
// for activity since lastSyncedAt (with overlap); dedup absorbs the overlap.
// Bounded (small incremental window) — not the full 90-day crawl.
// ----------------------------------------------------------------------------

async function reconcilePath(
  ctx: any,
  key: string,
  base: any,
  kind: "calls" | "sms" | "meetings",
  sinceISO: string,
): Promise<void> {
  const { path, fields } = ACTIVITY_PHASES[kind];
  // Meetings reconcile on date_updated: status transitions (upcoming →
  // completed/declined) bump date_updated, not date_created — polling
  // date_created would miss every status change. Calls/SMS are immutable
  // once created, so date_created is correct for them.
  const dateFilter =
    kind === "meetings" ? "date_updated__gte" : "date_created__gte";
  // Generous cap: a normal reconcile window (~30-120 min) is small; this only
  // bounds a pathological catch-up. If we ever hit it, LOG (don't silently
  // drop) so we know to shorten the cadence / build webhooks.
  const MAX_PAGES = 100;
  let skip = 0;
  let p = 0;
  for (; p < MAX_PAGES; p++) {
    const page: any = await closeFetch(key, path, {
      query: { _limit: PAGE, _fields: fields, [dateFilter]: sinceISO, _skip: skip },
    });
    const all: any[] = page.data || [];
    const rows = all.filter((r) =>
      kind === "meetings" ? r.lead_id && r.starts_at : r.lead_id,
    );
    if (rows.length > 0) {
      if (kind === "calls") {
        await ctx.runMutation(internal.setterCloseIngest.ingestCloseCalls, {
          ...base,
          calls: rows.map(mapCall),
        });
      } else if (kind === "sms") {
        await ctx.runMutation(internal.setterCloseIngest.ingestCloseSms, {
          ...base,
          messages: rows.map(mapSms),
        });
      } else {
        await ctx.runMutation(internal.setterCloseIngest.ingestCloseMeetings, {
          ...base,
          meetings: rows.map(mapMeeting),
        });
      }
    }
    if (!page.has_more || all.length === 0) break;
    skip += all.length;
  }
  if (p >= MAX_PAGES) {
    console.warn(
      `[closeReconcile] hit MAX_PAGES on ${path} since ${sinceISO} — window too large; some activity may be deferred to the next tick.`,
    );
  }
}

/**
 * Reconcile tail: enrich a bounded batch of the newest still-nameless stub
 * leads (created by fresh dial activity since the backfill's enrich phase).
 * Per-item errors are skipped, not thrown — a transient blip retries next
 * tick; a 404 (lead deleted in Close) is marked so it isn't refetched forever.
 */
async function enrichNewLeads(ctx: any, key: string, teamId: any): Promise<void> {
  const batch: any = await ctx.runQuery(
    internal.setterCloseIngest.getLeadsNeedingEnrichment,
    { teamId, limit: 200 },
  );
  const items: any[] = [];
  for (const l of batch.needing.slice(0, 50)) {
    try {
      const lead: any = await closeFetch(key, `/lead/${l.closeLeadId}/`, {
        query: { _fields: "id,display_name,contacts" },
      });
      const c = (lead.contacts || [])[0] || {};
      items.push({
        id: l.id,
        name: c.name || lead.display_name || undefined,
        email: c.emails?.[0]?.email ?? undefined,
        phone: c.phones?.[0]?.phone ?? undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Close API 404/.test(msg)) {
        items.push({ id: l.id, name: "(removed from Close)" });
      }
      // else: skip — transient, retried on the next tick
    }
  }
  if (items.length > 0) {
    await ctx.runMutation(internal.setterCloseIngest.applyLeadEnrichment, { items });
  }
}

export const closeReconcile = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const installs = await ctx.runQuery(
      internal.setterCloseInstall.getCloseInstallationsForReconcile,
      {},
    );
    for (const inst of installs) {
      try {
        const install: any = await ctx.runQuery(
          internal.setterGhlOauth.getInstallationById,
          { installationId: inst.installationId },
        );
        if (!install || install.provider !== "close" || install.status !== "active") continue;
        const key = decryptApiKey(install.accessToken);
        const base = {
          teamId: install.teamId,
          installationId: inst.installationId,
          locationId: install.locationId as string,
        };
        const since =
          (inst.lastSyncedAt ?? Date.now() - 2 * 60 * 60 * 1000) - RECONCILE_OVERLAP_MS;
        const sinceISO = new Date(since).toISOString();
        await reconcilePath(ctx, key, base, "calls", sinceISO);
        await reconcilePath(ctx, key, base, "sms", sinceISO);
        await reconcilePath(ctx, key, base, "meetings", sinceISO);
        await enrichNewLeads(ctx, key, install.teamId);
        await ctx.runMutation(internal.setterCloseIngest.touchCloseSync, {
          installationId: inst.installationId,
        });
      } catch (err) {
        await captureAndPersist(err, async () => {}, {
          feature: "closeReconcile",
          integration: "close",
          extra: { installationId: inst.installationId },
        });
      }
    }
  },
});
