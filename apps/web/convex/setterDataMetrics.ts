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
  /** Phase 2 — appointments BOOKED by this setter where bookedAt falls
   *  in the window. Cancelled/Invalid statuses excluded. */
  appointmentCount: number;
  /** Phase 2 — of those appointments, how many resulted in Showed. */
  showedCount: number;
  /** Phase 2 — Showed / (Showed + No Show). null if no settled appts. */
  showRate: number | null;
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
  /** Phase 2 — team-wide appointment rollup. */
  totalAppointments: number;
  totalShowed: number;
  totalNoShow: number;
  /** Showed / (Showed + No Show). null if no settled appts in window. */
  showRate: number | null;
  /** Per-setter rows, sorted fastest avg-speed first. Setters with
   *  null avgSpeedMs (no dials in the window) are pushed to the end. */
  perSetter: ScorecardSetterRow[];
}

/**
 * Plain helper — exported so both internal queries (scorecard cron) AND
 * public queries (dashboard's getOverview) can reuse the same math.
 * Convex queries cannot call other queries via ctx.runQuery, so a
 * shared async helper is the only way to avoid duplicating logic.
 *
 * Both `rangeStart` and `rangeEnd` are Unix ms (UTC). Timezone-agnostic
 * by design — callers (e.g. the cron's "yesterday in team tz" calc)
 * own the boundary computation.
 */
export async function computeScorecard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  args: { teamId: string; rangeStart: number; rangeEnd: number },
): Promise<ScorecardData> {
    // Pull every lead whose dateAdded falls in [rangeStart, rangeEnd).
    // For a single team's daily window this is a small set (typical
    // ~50 leads/day). Cast collect() result since the loose ctx.db: any
    // type erases the inference Convex would give us.
    const leads: Doc<"setterLeads">[] = await ctx.db
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
    const reps: Doc<"setterReps">[] = await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .collect();
    const repNameByGhlUserId = new Map(reps.map((r) => [r.ghlUserId, r.name]));

    type AccumRow = ScorecardSetterRow & { _speeds: number[]; _noShowCount: number };
    const perSetterMap = new Map<string, AccumRow>();

    for (const lead of leads) {
      const setterId = lead.assignedToGhlUserId;
      if (!setterId) continue;

      let row = perSetterMap.get(setterId);
      if (row === undefined) {
        const created: AccumRow = {
          ghlUserId: setterId,
          name: repNameByGhlUserId.get(setterId) ?? "Unknown setter",
          leadCount: 0,
          dialCount: 0,
          connectedCount: 0,
          avgSpeedMs: null,
          appointmentCount: 0,
          showedCount: 0,
          showRate: null,
          _speeds: [],
          _noShowCount: 0,
        };
        perSetterMap.set(setterId, created);
        row = created;
      }

      row.leadCount += 1;
      row.dialCount += lead.dialCount;
      if (lead.isConnected) row.connectedCount += 1;
      if (typeof lead.firstDialAt === "number") {
        row._speeds.push(lead.firstDialAt - lead.dateAdded);
      }
    }

    // Phase 2 — Appointments aggregation. We attribute appointments by
    // bookedByGhlUserId (the setter who booked it), filtered by bookedAt
    // within the date range. Cancelled and Invalid don't count.
    const appts: Doc<"setterAppointments">[] = await ctx.db
      .query("setterAppointments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .collect();

    let totalAppointments = 0;
    let totalShowed = 0;
    let totalNoShow = 0;

    for (const apt of appts) {
      if (apt.bookedAt < args.rangeStart || apt.bookedAt >= args.rangeEnd) continue;
      if (apt.status === "Cancelled" || apt.status === "Invalid") continue;
      totalAppointments += 1;
      if (apt.status === "Showed") totalShowed += 1;
      else if (apt.status === "No Show") totalNoShow += 1;

      const setterId = apt.bookedByGhlUserId;
      if (!setterId) continue;
      let row = perSetterMap.get(setterId);
      if (row === undefined) {
        // Setter booked appointments but had no leads in window — still
        // include them in the leaderboard so their show-rate shows up.
        const created: AccumRow = {
          ghlUserId: setterId,
          name: repNameByGhlUserId.get(setterId) ?? "Unknown setter",
          leadCount: 0,
          dialCount: 0,
          connectedCount: 0,
          avgSpeedMs: null,
          appointmentCount: 0,
          showedCount: 0,
          showRate: null,
          _speeds: [],
          _noShowCount: 0,
        };
        perSetterMap.set(setterId, created);
        row = created;
      }
      row.appointmentCount += 1;
      if (apt.status === "Showed") row.showedCount += 1;
      else if (apt.status === "No Show") row._noShowCount += 1;
    }

    // Settled appointments = Showed + No Show. Confirmed/Unconfirmed in
    // the future are excluded — they haven't yielded an outcome yet.
    const settledTotal = totalShowed + totalNoShow;
    const showRate = settledTotal > 0 ? totalShowed / settledTotal : null;

    const perSetter: ScorecardSetterRow[] = Array.from(perSetterMap.values()).map((row) => {
      const avg =
        row._speeds.length > 0
          ? row._speeds.reduce((sum, x) => sum + x, 0) / row._speeds.length
          : null;
      // Per-setter show rate: Showed / (Showed + No Show), bounded to
      // this setter's bookings. Confirmed/Unconfirmed in the future are
      // excluded — they haven't settled. Null when no settled appts so
      // the UI shows "—" instead of a misleading 0% / 100% badge.
      const settled = row.showedCount + row._noShowCount;
      const setterShowRate = settled > 0 ? row.showedCount / settled : null;
      return {
        ghlUserId: row.ghlUserId,
        name: row.name,
        leadCount: row.leadCount,
        dialCount: row.dialCount,
        connectedCount: row.connectedCount,
        avgSpeedMs: avg,
        appointmentCount: row.appointmentCount,
        showedCount: row.showedCount,
        showRate: setterShowRate,
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
      totalAppointments,
      totalShowed,
      totalNoShow,
      showRate,
      perSetter,
    };
}

/**
 * Internal-query wrapper around computeScorecard. Used by the scorecard
 * cron (an action), which can only access query data via ctx.runQuery.
 */
export const getScorecardData = internalQuery({
  args: {
    teamId: v.id("teams"),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args): Promise<ScorecardData> => {
    return await computeScorecard(ctx, args);
  },
});
