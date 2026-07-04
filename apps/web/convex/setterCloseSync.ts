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

const PHASE = v.union(
  v.literal("users"),
  v.literal("calls"),
  v.literal("sms"),
  v.literal("complete"),
);

const RECONCILE_OVERLAP_MS = 90 * 60 * 1000;

function dir(d: unknown): "inbound" | "outbound" {
  return d === "inbound" ? "inbound" : "outbound";
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

export const closeFastBackfill = internalAction({
  args: {
    installationId: v.id("setterGhlInstallations"),
    phase: v.optional(PHASE),
    // Backward date cursor for calls/sms (date_created__lt).
    cursor: v.optional(v.string()),
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

      if (phase === "calls" || phase === "sms") {
        const path = phase === "calls" ? "/activity/call/" : "/activity/sms/";
        const fields = phase === "calls" ? CALL_FIELDS : SMS_FIELDS;
        let cursor = args.cursor;

        for (;;) {
          const query: any = {
            _limit: PAGE,
            _fields: fields,
            date_created__gte: windowStartISO,
          };
          if (cursor) query.date_created__lt = cursor;

          const page: any = await closeFetch(key, path, { query });
          const rows: any[] = (page.data || []).filter((r: any) => r.lead_id);

          if (rows.length > 0) {
            if (phase === "calls") {
              await ctx.runMutation(internal.setterCloseIngest.ingestCloseCalls, {
                ...base,
                calls: rows.map(mapCall),
              });
            } else {
              await ctx.runMutation(internal.setterCloseIngest.ingestCloseSms, {
                ...base,
                messages: rows.map(mapSms),
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
            const next = phase === "calls" ? "sms" : "complete";
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

      if (phase === "complete") {
        await ctx.runMutation(internal.setterGhlSyncMutations.markFastBackfillComplete, {
          installationId: args.installationId,
        });
        console.log("[closeFastBackfill] complete", args.installationId);
        return;
      }
    } catch (err) {
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
          extra: { installationId: args.installationId },
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
  path: string,
  fields: string,
  sinceISO: string,
  isCall: boolean,
): Promise<void> {
  const MAX_PAGES = 30;
  let skip = 0;
  for (let p = 0; p < MAX_PAGES; p++) {
    const page: any = await closeFetch(key, path, {
      query: { _limit: PAGE, _fields: fields, date_created__gte: sinceISO, _skip: skip },
    });
    const all: any[] = page.data || [];
    const rows = all.filter((r) => r.lead_id);
    if (rows.length > 0) {
      if (isCall) {
        await ctx.runMutation(internal.setterCloseIngest.ingestCloseCalls, {
          ...base,
          calls: rows.map(mapCall),
        });
      } else {
        await ctx.runMutation(internal.setterCloseIngest.ingestCloseSms, {
          ...base,
          messages: rows.map(mapSms),
        });
      }
    }
    if (!page.has_more || all.length === 0) break;
    skip += all.length;
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
        await reconcilePath(ctx, key, base, "/activity/call/", CALL_FIELDS, sinceISO, true);
        await reconcilePath(ctx, key, base, "/activity/sms/", SMS_FIELDS, sinceISO, false);
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
