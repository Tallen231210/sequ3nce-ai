"use node";

// Sentry helper for Convex Node-runtime actions. Pairs persist-to-record
// (the existing pattern for surfacing failures in the UI) with a Sentry
// captureException so a human is also paged via Sentry's alerts.
//
// Why both: persisting to the install/team record is what makes the
// dashboard banner work and what reconcile crons retry off. Sentry on
// top of that is what fires the email/Slack alert so we don't have to
// be staring at a customer's dashboard to know something broke.
//
// Compatibility note: validated in a spike on 2026-05-19. @sentry/node
// imports + initializes + flushes cleanly inside Convex's Node runtime;
// see git history for the spike file if the question comes up again.

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import type { CaptureContext } from "@sentry/core";

// Singleton init — Convex isolates may reuse this module across actions,
// so we want at most one init call per isolate. Storing the resolved
// Sentry module on the promise itself lets concurrent callers await
// the same init without racing.
//
// Stored as `unknown` instead of `typeof SentryNode` because importing
// the type from "@sentry/node" forces the whole module into the V8
// isolate at type-check time; the dynamic import inside init() is
// intentional to keep V8-isolate-runtime actions that pull in lib/
// helpers (transitively) from breaking.
let sentryPromise: Promise<unknown> | null = null;

interface MinimalSentry {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: unknown, ctx?: CaptureContext) => string;
  flush: (timeoutMs?: number) => Promise<boolean>;
}

async function getSentry(): Promise<MinimalSentry | null> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;

  if (!sentryPromise) {
    sentryPromise = (async () => {
      const Sentry = (await import("@sentry/node")) as unknown as MinimalSentry;
      Sentry.init({
        dsn,
        environment: process.env.SENTRY_ENVIRONMENT ?? "production",
        // Tag every event from this runtime so the dashboard can filter
        // Convex events out of the Next.js-dominated `sequ3nce-web` stream.
        initialScope: { tags: { runtime: "convex" } },
        // Skip auto-instrumentation — Convex's sandbox doesn't host the
        // perf-hooks / http-instrumentation APIs the default integrations
        // depend on. We only need the bare capture/flush path.
        defaultIntegrations: false,
        integrations: [],
      });
      return Sentry;
    })().catch((err) => {
      // Init failed (network, bad DSN, Convex sandbox change) — swallow
      // and return null. Future calls retry init.
      console.error("[Sentry] init failed:", err);
      sentryPromise = null;
      return null;
    });
  }

  return (await sentryPromise) as MinimalSentry | null;
}

interface CaptureContextArgs {
  feature?: string;
  integration?: string;
  extra?: Record<string, unknown>;
}

/**
 * Persist a failure to the database first (must-not-lose), then push
 * it to Sentry (best-effort). The persist call runs no matter what
 * happens to Sentry; the Sentry call won't throw out to the caller.
 *
 * Use this from inside any Convex action catch block that today calls
 * a `markInstallationError`-style mutation. Replace:
 *
 *   await ctx.runMutation(internal.X.markError, { ... });
 *
 * With:
 *
 *   await captureAndPersist(err, async () => {
 *     await ctx.runMutation(internal.X.markError, { ... });
 *   }, { feature: "fastBackfill:contacts", integration: "ghl-marketplace" });
 *
 * The order (persist → capture) matters because Convex actions are
 * short-lived and Sentry's flush can block up to several seconds; we
 * never want to lose the dashboard-visible record if Sentry hangs.
 */
export async function captureAndPersist(
  err: unknown,
  persistFn: () => Promise<void>,
  context?: CaptureContextArgs,
): Promise<void> {
  // 1. Persist first. If THIS throws we let it propagate — the install
  //    record is the source of truth for UI visibility.
  await persistFn();

  // 2. Best-effort Sentry push. Any failure here is a Sentry problem,
  //    not a data problem; we already persisted.
  try {
    const Sentry = await getSentry();
    if (!Sentry) return;

    const tags: Record<string, string> = {};
    if (context?.feature) tags.feature = context.feature;
    if (context?.integration) tags.integration = context.integration;

    Sentry.captureException(err, {
      tags,
      extra: context?.extra,
    });

    // Convex actions terminate as soon as the handler returns, so any
    // queued transport requests get killed. Flush blocks until the
    // queue drains (or times out at 3s — generous for our event volume).
    await Sentry.flush(3000);
  } catch (sentryErr) {
    console.error("[Sentry] captureAndPersist failed:", sentryErr);
  }
}

/**
 * V8-isolate friendly bridge: schedule this internal action from a
 * mutation/query catch block to fire Sentry without needing @sentry/node
 * in the V8 sandbox. Errors aren't serializable across the scheduler
 * boundary, so the caller passes the already-stringified message.
 *
 * Pattern in V8 isolate:
 *
 *   } catch (err) {
 *     await ctx.db.patch(rowId, { lastError: String(err) }); // persist
 *     await ctx.scheduler.runAfter(0, internal.lib.sentry.captureFromIsolate, {
 *       message: err instanceof Error ? err.message : String(err),
 *       feature: "<function name>",
 *       integration: "<integration>",
 *     });
 *   }
 *
 * The action returns immediately; persistence in the V8 isolate is what
 * makes the failure visible to the UI, Sentry on top of it just paged
 * someone.
 */
export const captureFromIsolate = internalAction({
  args: {
    message: v.string(),
    feature: v.optional(v.string()),
    integration: v.optional(v.string()),
    extra: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    try {
      const Sentry = await getSentry();
      if (!Sentry) return;

      const tags: Record<string, string> = {};
      if (args.feature) tags.feature = args.feature;
      if (args.integration) tags.integration = args.integration;

      Sentry.captureException(new Error(args.message), {
        tags,
        extra: args.extra,
      });
      await Sentry.flush(3000);
    } catch (sentryErr) {
      console.error("[Sentry] captureFromIsolate failed:", sentryErr);
    }
  },
});
