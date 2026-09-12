"use node";

// ============================================================================
// Does our copy of Close match Close?
//
// Every speed-to-lead figure rests on two stored numbers: when the lead landed
// (setterLeads.dateAdded) and when someone first called it
// (setterLeadEvents.occurredAt). Both were written by our sync, so checking
// them against each other proves nothing — a late webhook or a dropped call
// event would shift every downstream number identically and invisibly.
//
// This asks Close directly for the same facts and prints the difference.
// Read-only: no writes, no mutations, nothing scheduled.
//
//   npx convex run --prod setterCloseVerify:verifyAgainstClose \
//     '{"teamId":"...","days":14,"limit":12}'
// ============================================================================

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { closeFetch } from "./setterCloseClient";
import { decryptApiKey } from "./lib/encrypt";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Earliest outbound call or text Close itself holds for this lead. */
async function closeFirstTouch(key: string, leadId: string): Promise<number | null> {
  let earliest: number | null = null;
  for (const path of ["/activity/call/", "/activity/sms/"]) {
    const page: any = await closeFetch(key, path, {
      query: { lead_id: leadId, _limit: 100, _fields: "id,direction,date_created" },
    });
    for (const row of page.data || []) {
      if (row.direction && row.direction !== "outbound" && row.direction !== "outgoing") continue;
      const at = Date.parse(row.date_created);
      if (!Number.isFinite(at)) continue;
      if (earliest === null || at < earliest) earliest = at;
    }
  }
  return earliest;
}

export const verifyAgainstClose = internalAction({
  args: { teamId: v.id("teams"), days: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<any> => {
    const installs: any[] = await ctx.runQuery(internal.setterCloseInstall.getCloseInstallationsForReconcile, {});
    let key: string | null = null;
    for (const inst of installs) {
      const install: any = await ctx.runQuery(internal.setterGhlOauth.getInstallationById, { installationId: inst.installationId });
      if (install && String(install.teamId) === String(args.teamId) && install.provider === "close" && install.status === "active") {
        key = decryptApiKey(install.accessToken);
        break;
      }
    }
    if (!key) return { error: "no active Close connection for that team" };

    const sample: any[] = await ctx.runQuery(internal.setterCloseVerifyData.sampleForVerify, {
      teamId: args.teamId,
      days: args.days ?? 14,
      limit: args.limit ?? 12,
    });

    const rows: any[] = [];
    for (const s of sample) {
      try {
        const lead: any = await closeFetch(key, `/lead/${s.leadId}/`, { query: { _fields: "id,display_name,date_created" } });
        const theirArrival = Date.parse(lead.date_created);
        const theirFirstTouch = await closeFirstTouch(key, s.leadId);
        rows.push({
          lead: s.name ?? lead.display_name ?? s.leadId,
          ourArrival: s.ourArrival,
          theirArrival: Number.isFinite(theirArrival) ? theirArrival : null,
          arrivalDriftSec: Number.isFinite(theirArrival) ? Math.round((s.ourArrival - theirArrival) / 1000) : null,
          ourFirstTouch: s.ourFirstTouch,
          theirFirstTouch,
          touchDriftSec: s.ourFirstTouch !== null && theirFirstTouch !== null ? Math.round((s.ourFirstTouch - theirFirstTouch) / 1000) : null,
          weMissedTouches: s.ourFirstTouch === null && theirFirstTouch !== null,
        });
      } catch (err) {
        rows.push({ lead: s.name ?? s.leadId, error: err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120) });
      }
    }
    const drifts = rows.map((r) => r.arrivalDriftSec).filter((d): d is number => typeof d === "number");
    const touchDrifts = rows.map((r) => r.touchDriftSec).filter((d): d is number => typeof d === "number");
    const worst = (xs: number[]) => (xs.length ? xs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a)) : null);
    return {
      checked: rows.length,
      arrivalExact: drifts.filter((d) => Math.abs(d) <= 60).length,
      worstArrivalDriftSec: worst(drifts),
      firstTouchExact: touchDrifts.filter((d) => Math.abs(d) <= 60).length,
      worstTouchDriftSec: worst(touchDrifts),
      touchesWeNeverIngested: rows.filter((r) => r.weMissedTouches).length,
      rows,
    };
  },
});
