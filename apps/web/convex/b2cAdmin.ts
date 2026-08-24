import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Internal admin tooling for the pre-launch community cleanup. NOTHING in
// this file is reachable over HTTP — run via `npx convex run --prod`.
//
//   npx convex run --prod b2cAdmin:purgeB2cAccount '{"email":"x","dryRun":true}'
//
// The purge walks in three phases (see b2cAdminPurge.ts /
// b2cAdminPurgeFinal.ts): calls in batches (transcript segments can run to
// hundreds of rows per call), then community content with counter repair,
// then relationships + files + roots. dryRun performs the identical walk and
// reports identical counts without deleting anything.
// ============================================================================

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

export const purgeB2cAccount = internalAction({
  args: {
    email: v.string(),
    dryRun: v.boolean(),
  },
  handler: async (ctx, args) => {
    const merged: Record<string, number> = {};
    const warnings: string[] = [];
    const fold = (report: Record<string, number>) => {
      for (const [k, n] of Object.entries(report)) merged[k] = (merged[k] ?? 0) + n;
    };

    // Phase 1: calls, batched until drained (a dry run reports one batch's
    // walk plus the total call count — it never loops, since nothing shrinks).
    let totalCalls = 0;
    for (let i = 0; i < 200; i++) {
      const r: any = await ctx.runMutation(internal.b2cAdminPurge.purgeCallsBatch, {
        email: args.email,
        dryRun: args.dryRun,
        batch: 4,
      });
      fold(r.report ?? {});
      totalCalls = r.totalCalls ?? totalCalls;
      if (args.dryRun || r.remaining === 0) break;
    }
    if (args.dryRun && totalCalls > 4) {
      warnings.push(`dry run walked 4 of ${totalCalls} calls — child counts scale accordingly`);
    }

    // Phase 2: community content + counters.
    const sweeps: any = await ctx.runMutation(internal.b2cAdminPurge.purgeUserSweeps, {
      email: args.email,
      dryRun: args.dryRun,
    });
    fold(sweeps.report ?? {});
    warnings.push(...(sweeps.warnings ?? []));

    // Phase 3: relationships, files, closer/team rows, scheduled jobs, roots.
    const final: any = await ctx.runMutation(internal.b2cAdminPurgeFinal.purgeRelationsAndRoots, {
      email: args.email,
      dryRun: args.dryRun,
    });
    fold(final.report ?? {});
    warnings.push(...(final.warnings ?? []));

    // GHL contact cleanup — best-effort, never fails the purge.
    let ghl = "no contact recorded";
    if (final.ghlContactId) {
      if (args.dryRun) {
        ghl = `would delete GHL contact ${final.ghlContactId}`;
      } else {
        const token = process.env.GHL_PIT_TOKEN;
        if (!token) {
          ghl = `GHL_PIT_TOKEN unset — delete contact ${final.ghlContactId} manually`;
        } else {
          try {
            const res = await fetch(`${GHL_API_BASE}/contacts/${final.ghlContactId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}`, Version: GHL_API_VERSION },
            });
            ghl = res.ok
              ? `GHL contact ${final.ghlContactId} deleted`
              : `GHL delete returned ${res.status} — remove contact ${final.ghlContactId} manually`;
          } catch {
            ghl = `GHL unreachable — remove contact ${final.ghlContactId} manually`;
          }
        }
      }
    }

    return {
      email: args.email,
      mode: args.dryRun ? "DRY RUN — nothing deleted" : "PURGED",
      counts: merged,
      ghl,
      warnings,
    };
  },
});
