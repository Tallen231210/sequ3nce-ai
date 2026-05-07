import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

// ============================================================================
// Setter Data — pure metrics queries.
//
// Queries here are the building blocks for both the daily scorecard
// notification and the dashboard UI. They do all the aggregation work
// in Convex (V8 isolate) and return plain data shapes that callers can
// format into Slack blocks, JSX, CSV exports, etc.
//
// Every query is admin-scoped via the `teamId` arg + the auth check the
// caller is responsible for performing. These are internal queries —
// public read paths live in setterData.ts (Phase 1.9) and do their own
// auth before fanning out.
// ============================================================================

export interface ScorecardSetterRow {
  ghlUserId: string;
  name: string;
  leadCount: number;
  dialCount: number;
  connectedCount: number;
  /** Average ms from lead.dateAdded → lead.firstDialAt for this setter's
   *  leads in the window. null if the setter had no dialed leads. */
  avgSpeedMs: number | null;
}

export interface ScorecardData {
  totalLeads: number;
  connectedLeads: number;
  /** connectedLeads / totalLeads, in [0,1]. Null when totalLeads = 0. */
  connectedRate: number | null;
  untouchedLeads: number;
  /** Speed-to-lead percentiles in ms. null when no leads were dialed. */
  avgSpeedMs: number | null;
  p50SpeedMs: number | null;
  p90SpeedMs: number | null;
  /** Per-setter rows, sorted fastest avg-speed first. Setters with
   *  null avgSpeedMs (no dials in the window) are pushed to the end. */
  perSetter: ScorecardSetterRow[];
}

/**
 * Compute scorecard aggregates for a team over a date range. Both
 * `rangeStart` and `rangeEnd` are Unix ms (UTC). The "yesterday in
 * team timezone" calculation lives in the caller — this query is
 * timezone-agnostic and just operates on the bounds it's given.
 */
export const getScorecardData = internalQuery({
  args: {
    teamId: v.id("teams"),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args): Promise<ScorecardData> => {
    // Pull every lead whose dateAdded falls in [rangeStart, rangeEnd).
    // For a single team's daily window this is a small set (typical
    // ~50 leads/day).
    const leads = await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date_added", (q: any) =>
        q
          .eq("teamId", args.teamId)
          .gte("dateAdded", args.rangeStart)
          .lt("dateAdded", args.rangeEnd),
      )
      .collect();

    const totalLeads = leads.length;
    const connectedLeads = leads.filter((l) => l.isConnected).length;
    const untouchedLeads = leads.filter(
      (l) => l.dialCount === 0 && l.smsOutboundCount === 0,
    ).length;

    // Speed-to-lead percentiles. Only count leads that actually got dialed
    // — otherwise we'd be averaging "infinity" for never-touched leads.
    const dialedLeads = leads.filter(
      (l): l is Doc<"setterLeads"> & { firstDialAt: number } =>
        typeof l.firstDialAt === "number",
    );
    const speedsMs = dialedLeads
      .map((l) => l.firstDialAt - l.dateAdded)
      .sort((a, b) => a - b);

    const avgSpeedMs =
      speedsMs.length > 0
        ? speedsMs.reduce((sum, x) => sum + x, 0) / speedsMs.length
        : null;
    const p50SpeedMs =
      speedsMs.length > 0 ? speedsMs[Math.floor(speedsMs.length * 0.5)] : null;
    const p90SpeedMs =
      speedsMs.length > 0 ? speedsMs[Math.floor(speedsMs.length * 0.9)] : null;

    // Per-setter aggregation. We need rep names — fetch the rep list
    // once and look up by ghlUserId.
    const reps = await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .collect();
    const repNameByGhlUserId = new Map(reps.map((r) => [r.ghlUserId, r.name]));

    const perSetterMap = new Map<string, ScorecardSetterRow & { _speeds: number[] }>();

    for (const lead of leads) {
      const setterId = lead.assignedToGhlUserId;
      if (!setterId) continue;

      let row = perSetterMap.get(setterId);
      if (!row) {
        row = {
          ghlUserId: setterId,
          name: repNameByGhlUserId.get(setterId) ?? "Unknown setter",
          leadCount: 0,
          dialCount: 0,
          connectedCount: 0,
          avgSpeedMs: null,
          _speeds: [],
        };
        perSetterMap.set(setterId, row);
      }

      row.leadCount += 1;
      row.dialCount += lead.dialCount;
      if (lead.isConnected) row.connectedCount += 1;
      if (typeof lead.firstDialAt === "number") {
        row._speeds.push(lead.firstDialAt - lead.dateAdded);
      }
    }

    const perSetter: ScorecardSetterRow[] = Array.from(perSetterMap.values()).map((row) => {
      const avg =
        row._speeds.length > 0
          ? row._speeds.reduce((sum, x) => sum + x, 0) / row._speeds.length
          : null;
      return {
        ghlUserId: row.ghlUserId,
        name: row.name,
        leadCount: row.leadCount,
        dialCount: row.dialCount,
        connectedCount: row.connectedCount,
        avgSpeedMs: avg,
      };
    });

    // Sort by avg speed ascending (fastest first); setters with no
    // dialed leads (avgSpeedMs = null) sort to the bottom.
    perSetter.sort((a, b) => {
      if (a.avgSpeedMs === null && b.avgSpeedMs === null) return 0;
      if (a.avgSpeedMs === null) return 1;
      if (b.avgSpeedMs === null) return -1;
      return a.avgSpeedMs - b.avgSpeedMs;
    });

    return {
      totalLeads,
      connectedLeads,
      connectedRate: totalLeads > 0 ? connectedLeads / totalLeads : null,
      untouchedLeads,
      avgSpeedMs,
      p50SpeedMs,
      p90SpeedMs,
      perSetter,
    };
  },
});
