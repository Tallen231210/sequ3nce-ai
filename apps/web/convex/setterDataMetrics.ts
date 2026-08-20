import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { buildMatcherIndex, findCallsForLead } from "./setterCloserMatcher";
import { readDailyStatsRange, dayKeyOf, DAY_MS } from "./setterRollups";
import {
  buildBookingMatcherIndex,
  type MatchedBooking,
} from "./setterCloserBookings";

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

/**
 * Dashboard Phase 2 — per-setter dial cadence aggregation.
 * "Are they persistent or are they giving up too fast?"
 */
export interface ScorecardSetterCadence {
  /** Distinct leads this setter dialed in the date range. */
  leadsWithDials: number;
  /** Mean dials per lead, suppressed (null) when leadsWithDials < 5
   *  (small-sample noise). */
  avgDialsPerLead: number | null;
  /** Percent (0-1) of this setter's in-range leads that received ≥3
   *  dial attempts. Suppressed (null) when leadsWithDials < 5. */
  pctLeadsThreeOrMoreAttempts: number | null;
  /** Median (lastDial - firstDial) per lead, in days. Only computed for
   *  leads with ≥2 dials — single-dial leads have no "pattern." Null
   *  when no qualifying leads. */
  medianPursuitDays: number | null;
}

// --- Show-rate evidence waterfall + lead set rate (Phase: metrics revamp) ---
// Grace before an appointment is considered "settled" (prospect had their slot).
const SHOW_GRACE_MS = 24 * 60 * 60 * 1000;
// Closer-call match window around the appointment start. Tight on purpose:
// a wide window would mark an entire reschedule chain "showed" off one call.
const SHOW_MATCH_BEFORE_MS = 6 * 60 * 60 * 1000;
const SHOW_MATCH_AFTER_MS = 48 * 60 * 60 * 1000;
// A null-outcome completed recording must be at least this long to count as
// evidence the prospect showed ("joined, nobody came" stubs are no-shows).
const SHOW_RECORDING_MIN_SEC = 120;
// Tier-3 "no evidence → assume no-show" only applies when at least this share
// of settled appointments resolved via tiers 1-2 — one non-recording closer
// must not turn all their real shows into phantom no-shows.
const SHOW_ASSUME_COVERAGE = 0.6;
// Per-setter lead set rate suppressed below this many owned leads.
const LEAD_SET_RATE_MIN_LEADS = 5;

/**
 * Evidence-based show rate. Three-tier waterfall per settled appointment:
 *   1. CRM manual status (GHL "Showed"/"No Show") — trust when present.
 *   2. Closer-call evidence via the matcher: post-call form outcome first,
 *      then recording existence (with a duration floor).
 *   3. No evidence → assumed no-show, but ONLY above a coverage threshold;
 *      otherwise "unknown" and excluded from the denominator (null > lie).
 */
export interface ShowRateEvidence {
  available: boolean;
  activeClosers: number;
  /** Settled candidates: startTime in range + grace elapsed, not cancelled. */
  candidates: number;
  /** Resolved to showed-or-no-show (the denominator). */
  settled: number;
  showed: number;
  noShow: number;
  showRate: number | null;
  /** Share of candidates resolved by hard evidence (tiers 1-2). */
  coverage: number | null;
  breakdown: {
    fromStatus: number;
    fromForm: number;
    fromRecording: number;
    assumedNoShow: number;
    unknown: number;
  };
  perSetter: Array<{
    ghlUserId: string;
    settled: number;
    showed: number;
    showRate: number | null;
  }>;
}

export interface ScorecardSetterRow {
  ghlUserId: string;
  name: string;
  leadCount: number;
  /** Leads OWNED by this setter: CRM assignment, falling back to
   *  first-dialer attribution (setterLeads.firstDialByUserId). */
  ownedLeadCount: number;
  /** Of the owned leads, how many have ≥1 non-cancelled booking (ever). */
  ownedLeadsBooked: number;
  /** Lead set rate — ownedLeadsBooked / ownedLeadCount. Null when owned
   *  < LEAD_SET_RATE_MIN_LEADS or the team's flow is self_book (a setter
   *  doesn't "set" anything when prospects self-schedule). */
  leadSetRate: number | null;
  /** Evidence-based show rate over this setter's booked appointments. */
  evidenceSettled: number;
  evidenceShowRate: number | null;
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
  /** Dashboard Phase 2 — dial cadence aggregates. */
  cadence: ScorecardSetterCadence;
  /** Dashboard Phase 3 — dials needed to reach one connect. Lower = more
   *  efficient. Null when connectedCount < 3 (small sample) or === 0. */
  dialsPerConnect: number | null;
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
  /** Leads first-touched more than 7 days after arriving — excluded from the
   *  speed stats as revivals, and counted here so the trim is visible. */
  revivedLeadCount: number;
  /** Phase 2 — team-wide appointment rollup. */
  totalAppointments: number;
  totalShowed: number;
  totalNoShow: number;
  /** Showed / (Showed + No Show). null if no settled appts in window. */
  showRate: number | null;
  /** Company set rate — in-range leads with ≥1 non-cancelled booking. */
  leadsBooked: number;
  companySetRate: number | null;
  /** Evidence-based show rate (waterfall). Present only when the caller
   *  opted in (ScorecardOpts.evidence) — the Overview UI reads it from the
   *  dedicated getShowRateEvidence query instead. */
  showRateEvidence?: ShowRateEvidence;
  /** Cadence transparency: set when cadence was computed on a clamped
   *  window / a capped event sample instead of the full range. */
  cadenceClampedToDays?: number;
  cadenceSampled?: boolean;
  /** Per-setter rows, sorted fastest avg-speed first. Setters with
   *  null avgSpeedMs (no dials in the window) are pushed to the end. */
  perSetter: ScorecardSetterRow[];
  /**
   * Dashboard Phase 2 — show-rate computed from our own closer-side calls
   * table instead of GHL appointment objects. Works regardless of whether
   * the customer uses iClosed/Calendly/spreadsheet/GHL Calendar — we
   * match leads to closer calls by prospect email/phone (see
   * setterCloserMatcher). Null when the team has no active closers OR
   * the matcher found no matches.
   */
  closerSide: {
    matched: number;           // leads that matched at least one closer call
    showed: number;            // matched leads with at least one settled call != no_show/rescheduled
    closed: number;            // matched leads with at least one outcome === "closed"
    showRate: number | null;   // showed / matched, or null when matched === 0
    activeClosers: number;     // closers in "active" status on the team
    available: boolean;        // true when activeClosers > 0 AND matched > 0
    // Set when the closer-side computation was skipped/degraded — currently
    // fires on "range_too_wide" (calls table carries transcript blobs that
    // blow the 16 MiB read limit past ~60 days). UI shows the reason instead
    // of a generic "—".
    unavailableReason?: "range_too_wide";
  };
  /**
   * Dashboard Phase 4 — universal bookings rollup. Sources from
   * setterAppointments (GHL-native, when populated) or calendarEvents
   * (synced via Google Calendar OAuth, the universal fallback). Tier 2
   * stats only populate when the detected/overridden flow is
   * setter-driven or mixed — self-book flow customers (AICom) see
   * Tier 1 + the pre-call qualification rate prominently.
   */
  bookings: BookingsData;
}

export type BookingFlowType =
  | "setter_drives"
  | "self_book"
  | "mixed"
  | "unknown";

export type BookingFlowOverride =
  | "auto"
  | "setter_drives"
  | "self_book"
  | "mixed";

export interface BookingsData {
  source: "setterAppointments" | "calendarEvents" | "none";
  total: number;
  futureScheduled: number;
  medianTimeToBookMs: number | null;
  byDayOfWeek: number[]; // length 7, [Sun..Sat]
  preCallQualificationRate: number | null;
  preCallQualifiedCount: number;
  perSetter: Array<{
    ghlUserId: string;
    name: string;
    bookingCount: number;
  }>;
  connectionsToBookingsRate: number | null;
  flowType: BookingFlowType;
  flowOverride: BookingFlowOverride;
  rangeClampedToDays?: number;
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
/**
 * Per-setter dial/connect counts for a rolling range. Rollup-backed when the
 * team's backfill has completed: full interior UTC days come from
 * setterDailyStats rows; the two partial edge days come from bounded raw
 * event reads (≤1 day each) — byte-identical totals to a full event scan,
 * without scanning the range's events. Legacy full scan for pre-backfill
 * teams. Key "" = unattributed.
 */
async function readDialConnectCounts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  args: {
    teamId: string;
    rangeStart: number;
    rangeEnd: number;
    rollupsReady: boolean;
  },
): Promise<Map<string, { dials: number; connects: number }>> {
  const counts = new Map<string, { dials: number; connects: number }>();
  const bump = (sid: string, kind: "dials" | "connects", n: number) => {
    if (n === 0) return;
    const row = counts.get(sid) ?? { dials: 0, connects: 0 };
    row[kind] += n;
    counts.set(sid, row);
  };

  const scanEvents = async (winStart: number, winEnd: number) => {
    if (winStart >= winEnd) return;
    for (const [type, kind] of [
      ["dial_outbound", "dials"],
      ["connected", "connects"],
    ] as const) {
      const events: Doc<"setterLeadEvents">[] = await ctx.db
        .query("setterLeadEvents")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_team_and_type_and_time", (q: any) =>
          q
            .eq("teamId", args.teamId)
            .eq("eventType", type)
            .gte("occurredAt", winStart)
            .lt("occurredAt", winEnd),
        )
        .collect();
      for (const e of events) bump(e.ghlUserId ?? "", kind, 1);
    }
  };

  if (!args.rollupsReady) {
    await scanEvents(args.rangeStart, args.rangeEnd);
    return counts;
  }

  // Interior full UTC days ↔ rollups; partial edge days ↔ raw events.
  const interiorStart = Math.ceil(args.rangeStart / DAY_MS) * DAY_MS;
  const interiorEnd = Math.floor(args.rangeEnd / DAY_MS) * DAY_MS;

  if (interiorStart >= interiorEnd) {
    // Range doesn't span a full UTC day — pure event scan (≤2 days).
    await scanEvents(args.rangeStart, args.rangeEnd);
    return counts;
  }

  const rows = await readDailyStatsRange(
    ctx,
    args.teamId,
    dayKeyOf(interiorStart),
    dayKeyOf(interiorEnd - DAY_MS),
  );
  for (const r of rows) {
    bump(r.setterId, "dials", r.dials);
    bump(r.setterId, "connects", r.connects);
  }
  await scanEvents(args.rangeStart, interiorStart);
  await scanEvents(interiorEnd, args.rangeEnd);
  return counts;
}

/**
 * Dial-cadence aggregation from raw dial events, with an explicit range
 * clamp + document cap so the scan can never blow the transaction budget.
 * Shared by computeScorecard (opt-in) and the public getCadence query.
 */
export async function computeCadence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  args: {
    teamId: string;
    rangeStart: number;
    rangeEnd: number;
    clampDays: number;
    cap: number;
  },
): Promise<{
  bySetter: Map<string, ScorecardSetterCadence>;
  clampedToDays?: number;
  sampled: boolean;
}> {
  const clampMs = args.clampDays * 24 * 60 * 60 * 1000;
  const start = Math.max(args.rangeStart, args.rangeEnd - clampMs);
  const clampedToDays = start > args.rangeStart ? args.clampDays : undefined;

  const events: Doc<"setterLeadEvents">[] = await ctx.db
    .query("setterLeadEvents")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_type_and_time", (q: any) =>
      q
        .eq("teamId", args.teamId)
        .eq("eventType", "dial_outbound")
        .gte("occurredAt", start)
        .lt("occurredAt", args.rangeEnd),
    )
    .take(args.cap);
  const sampled = events.length >= args.cap;

  interface PerLead {
    dialCount: number;
    firstDialAt: number;
    lastDialAt: number;
  }
  const map = new Map<string, Map<string, PerLead>>();
  for (const ev of events) {
    if (!ev.ghlUserId) continue;
    let leadMap = map.get(ev.ghlUserId);
    if (!leadMap) {
      leadMap = new Map();
      map.set(ev.ghlUserId, leadMap);
    }
    const existing = leadMap.get(ev.ghlContactId);
    if (existing) {
      existing.dialCount += 1;
      if (ev.occurredAt < existing.firstDialAt) existing.firstDialAt = ev.occurredAt;
      if (ev.occurredAt > existing.lastDialAt) existing.lastDialAt = ev.occurredAt;
    } else {
      leadMap.set(ev.ghlContactId, {
        dialCount: 1,
        firstDialAt: ev.occurredAt,
        lastDialAt: ev.occurredAt,
      });
    }
  }

  const bySetter = new Map<string, ScorecardSetterCadence>();
  for (const [setterId, leadMap] of map) {
    const values = Array.from(leadMap.values());
    const leadsWithDials = values.length;
    let avgDialsPerLead: number | null = null;
    let pctLeadsThreeOrMoreAttempts: number | null = null;
    if (leadsWithDials >= 5) {
      const totalDials = values.reduce((s, v) => s + v.dialCount, 0);
      avgDialsPerLead = totalDials / leadsWithDials;
      pctLeadsThreeOrMoreAttempts =
        values.filter((v) => v.dialCount >= 3).length / leadsWithDials;
    }
    const pursuitDays = values
      .filter((v) => v.dialCount >= 2)
      .map((v) => (v.lastDialAt - v.firstDialAt) / (24 * 60 * 60_000))
      .sort((a, b) => a - b);
    const medianPursuitDays =
      pursuitDays.length > 0
        ? pursuitDays[Math.floor(pursuitDays.length * 0.5)]
        : null;
    bySetter.set(setterId, {
      leadsWithDials,
      avgDialsPerLead,
      pctLeadsThreeOrMoreAttempts,
      medianPursuitDays,
    });
  }
  return { bySetter, clampedToDays, sampled };
}

export interface ScorecardOpts {
  /** Cadence needs raw dial-event scans — callers opt in with an explicit
   *  clamp + cap so the read can never blow the 32k-doc transaction budget.
   *  "none" (default) skips the event scan entirely; the Overview UI gets
   *  cadence from the dedicated getCadence query instead. */
  cadence?: "none" | { clampDays: number; cap: number };
  /** Evidence show-rate waterfall — extra bounded reads; the Overview UI
   *  gets it from the dedicated getShowRateEvidence query instead. */
  evidence?: boolean;
  /** Caller already read the in-range leads (getOverview needs them for its
   *  extras) — pass them through so the fat leads table is read ONCE per
   *  transaction, not twice. */
  preloadedLeads?: Doc<"setterLeads">[];
}

export async function computeScorecard(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  args: { teamId: string; rangeStart: number; rangeEnd: number },
  opts: ScorecardOpts = {},
): Promise<ScorecardData> {
    const cadenceOpt = opts.cadence ?? "none";

    // Team config first: flow-type gating + the rollup migration gate
    // (setterRollupsBackfilledAt) both need it before aggregation.
    const team = (await ctx.db.get(args.teamId as Id<"teams">)) as
      | Doc<"teams">
      | null;
    const flowTypeResolved = resolveFlowType(team);
    const rollupsReady = team?.setterRollupsBackfilledAt !== undefined;

    // Pull every lead whose dateAdded falls in [rangeStart, rangeEnd) —
    // unless the caller already read them (getOverview passes its copy so
    // the leads table is read once per transaction, not twice).
    const leads: Doc<"setterLeads">[] =
      opts.preloadedLeads ??
      (await ctx.db
        .query("setterLeads")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_team_and_date_added", (q: any) =>
          q
            .eq("teamId", args.teamId)
            .gte("dateAdded", args.rangeStart)
            .lt("dateAdded", args.rangeEnd),
        )
        .collect());

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
      .map((l) => normalizeSpeedToLeadMs(l.firstDialAt, l.dateAdded))
      .filter((ms): ms is number => ms !== null)
      .sort((a, b) => a - b);
    // Excluded ≠ hidden: revivals are reported alongside, so "we trimmed 12
    // anomalies" is a visible fact rather than silent surgery on the stats.
    const revivedLeadCount = dialedLeads.filter(
      (l) => l.firstDialAt - l.dateAdded > SPEED_TO_LEAD_ELIGIBILITY_MS,
    ).length;

    const avgSpeedMs =
      speedsMs.length > 0
        ? speedsMs.reduce((sum, x) => sum + x, 0) / speedsMs.length
        : null;
    const p50SpeedMs =
      speedsMs.length > 0 ? speedsMs[Math.floor(speedsMs.length * 0.5)] : null;
    const p90SpeedMs =
      speedsMs.length > 0 ? speedsMs[Math.floor(speedsMs.length * 0.9)] : null;

    // Per-setter aggregation. We need rep names — fetch the rep list
    // once and look up by ghlUserId. Guarded take: no realistic team has
    // 500+ reps; the guard keeps a pathological table from blowing budgets.
    const reps: Doc<"setterReps">[] = await ctx.db
      .query("setterReps")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .take(500);
    const repNameByGhlUserId = new Map(reps.map((r) => [r.ghlUserId, r.name]));

    type AccumRow = ScorecardSetterRow & {
      _speeds: number[];
      _noShowCount: number;
      _ownedLeads: Array<{ booked: boolean }>;
    };
    const perSetterMap = new Map<string, AccumRow>();

    // Helper: create-or-get a setter accumulator. Used by every aggregation
    // pass below — leads-assigned, dials-by-doer, connects-by-doer, and
    // appointments-by-booker — since each pass can independently surface a
    // setter who didn't appear in earlier passes.
    function ensureRow(setterId: string): AccumRow {
      let row = perSetterMap.get(setterId);
      if (row === undefined) {
        const created: AccumRow = {
          ghlUserId: setterId,
          name: repNameByGhlUserId.get(setterId) ?? "Unknown setter",
          leadCount: 0,
          ownedLeadCount: 0,
          ownedLeadsBooked: 0,
          leadSetRate: null,
          evidenceSettled: 0,
          evidenceShowRate: null,
          dialCount: 0,
          connectedCount: 0,
          avgSpeedMs: null,
          appointmentCount: 0,
          showedCount: 0,
          showRate: null,
          cadence: {
            leadsWithDials: 0,
            avgDialsPerLead: null,
            pctLeadsThreeOrMoreAttempts: null,
            medianPursuitDays: null,
          },
          dialsPerConnect: null,
          _speeds: [],
          _noShowCount: 0,
          _ownedLeads: [],
        };
        perSetterMap.set(setterId, created);
        row = created;
      }
      return row;
    }

    // Pass 1: lead-count attribution. `leadCount` stays assignment-only
    // (backward-compatible with existing dashboards). OWNERSHIP for the
    // lead set rate falls back to first-dialer attribution when the CRM
    // never assigned the lead — behavior beats a blank CRM field.
    for (const lead of leads) {
      const setterId = lead.assignedToGhlUserId;
      if (setterId) ensureRow(setterId).leadCount += 1;
      const owner =
        lead.assignedToGhlUserId ??
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (lead as any).firstDialByUserId;
      // "Booked" via the lead's appointmentCount snapshot (maintained by
      // recomputeLeadAppointmentCounts, excludes Cancelled/Invalid) — this
      // replaces the old ALL-TIME setterAppointments scan.
      if (owner) {
        ensureRow(owner)._ownedLeads.push({ booked: lead.appointmentCount > 0 });
      }
    }

    // Pass 2: dials + connects attribution by the actor. Rollup-backed
    // when the team's rollup backfill has completed (reads ≤ days×setters
    // docs at ANY range); legacy event scan otherwise (pre-backfill teams).
    const counts = await readDialConnectCounts(ctx, {
      teamId: args.teamId,
      rangeStart: args.rangeStart,
      rangeEnd: args.rangeEnd,
      rollupsReady,
    });
    for (const [setterId, c] of counts) {
      if (setterId === "") continue; // unattributed — excluded from per-setter rows (as before)
      const row = ensureRow(setterId);
      row.dialCount += c.dials;
      row.connectedCount += c.connects;
    }

    // Per-setter speed-to-lead from LEAD SNAPSHOTS (firstDialAt +
    // firstDialByUserId, maintained with min-time semantics in the sink) —
    // no event scan. Equivalent to the old event-join for in-range leads:
    // a lead added in-range can't have been first-dialed before rangeStart,
    // and dials after rangeEnd are excluded to match the old behavior.
    for (const lead of leads) {
      const by = (lead as any).firstDialByUserId as string | undefined;
      if (
        by !== undefined &&
        typeof lead.firstDialAt === "number" &&
        lead.firstDialAt < args.rangeEnd
      ) {
        // Same treatment as the team-level figure above.
        const speed = normalizeSpeedToLeadMs(lead.firstDialAt, lead.dateAdded);
        if (speed !== null) ensureRow(by)._speeds.push(speed);
      }
    }

    // Dashboard Phase 2 — dial cadence aggregation. Needs raw dial events;
    // callers opt in with an explicit clamp + cap (the Overview dashboard
    // uses the dedicated getCadence query instead).
    let cadenceClampedToDays: number | undefined;
    let cadenceSampled = false;
    let cadenceBySetter = new Map<string, ScorecardSetterCadence>();
    if (cadenceOpt !== "none") {
      const cadence = await computeCadence(ctx, {
        teamId: args.teamId,
        rangeStart: args.rangeStart,
        rangeEnd: args.rangeEnd,
        clampDays: cadenceOpt.clampDays,
        cap: cadenceOpt.cap,
      });
      cadenceClampedToDays = cadence.clampedToDays;
      cadenceSampled = cadence.sampled;
      cadenceBySetter = cadence.bySetter;
    }

    // Phase 2 — Appointments aggregation. Bookings with bookedAt in range,
    // read via the by_team_and_booked_at index — bounded by the range, NOT
    // the org's lifetime (the old all-time by_team collect grew forever).
    const rangeAppts: Doc<"setterAppointments">[] = await ctx.db
      .query("setterAppointments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_booked_at", (q: any) =>
        q
          .eq("teamId", args.teamId)
          .gte("bookedAt", args.rangeStart)
          .lt("bookedAt", args.rangeEnd),
      )
      .collect();

    let totalAppointments = 0;
    let totalShowed = 0;
    let totalNoShow = 0;

    for (const apt of rangeAppts) {
      if (apt.status === "Cancelled" || apt.status === "Invalid") continue;
      totalAppointments += 1;
      if (apt.status === "Showed") totalShowed += 1;
      else if (apt.status === "No Show") totalNoShow += 1;

      const setterId = apt.bookedByGhlUserId;
      if (!setterId) continue;
      const row = ensureRow(setterId);
      row.appointmentCount += 1;
      if (apt.status === "Showed") row.showedCount += 1;
      else if (apt.status === "No Show") row._noShowCount += 1;
    }

    // Settled appointments = Showed + No Show. Confirmed/Unconfirmed in
    // the future are excluded — they haven't yielded an outcome yet.
    const settledTotal = totalShowed + totalNoShow;
    const showRate = settledTotal > 0 ? totalShowed / settledTotal : null;

    // Lead → booking linkage for set rates, via the appointmentCount
    // snapshot on each lead (all-time, excludes Cancelled/Invalid — same
    // semantics as the old bookedContactIds set, zero appointment reads).
    const leadsBooked = leads.filter((l) => l.appointmentCount > 0).length;
    const companySetRate = totalLeads > 0 ? leadsBooked / totalLeads : null;

    // Evidence-based show rate (waterfall) — opt-in; it self-fetches
    // bounded, startTime-indexed candidates.
    const showRateEvidence = opts.evidence
      ? await computeShowRateEvidence(ctx, {
          teamId: args.teamId,
          rangeStart: args.rangeStart,
          rangeEnd: args.rangeEnd,
        })
      : undefined;
    const evidenceBySetter = new Map(
      (showRateEvidence?.perSetter ?? []).map((p) => [p.ghlUserId, p]),
    );

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

      // Per-setter cadence — from the shared computeCadence helper (only
      // populated when the caller opted into the event scan).
      const cadence: ScorecardSetterCadence = cadenceBySetter.get(
        row.ghlUserId,
      ) ?? {
        leadsWithDials: 0,
        avgDialsPerLead: null,
        pctLeadsThreeOrMoreAttempts: null,
        medianPursuitDays: null,
      };

      // Dials-per-connect — productivity ratio. Suppressed below 3
      // connects: with 1-2 connects, this ratio is too noisy to be
      // actionable (1 lucky connect drops it dramatically).
      const dialsPerConnect: number | null =
        row.connectedCount >= 3 ? row.dialCount / row.connectedCount : null;

      // Lead set rate: owned-lead conversion. Gated on flow type (self-book
      // funnels don't have setter-driven booking) and small samples.
      const ownedLeadCount = row._ownedLeads.length;
      const ownedLeadsBooked = row._ownedLeads.filter((l) => l.booked).length;
      const leadSetRate =
        flowTypeResolved === "self_book" ||
        ownedLeadCount < LEAD_SET_RATE_MIN_LEADS
          ? null
          : ownedLeadsBooked / ownedLeadCount;

      const evidence = evidenceBySetter.get(row.ghlUserId);

      return {
        ghlUserId: row.ghlUserId,
        name: row.name,
        leadCount: row.leadCount,
        ownedLeadCount,
        ownedLeadsBooked,
        leadSetRate,
        evidenceSettled: evidence?.settled ?? 0,
        evidenceShowRate: evidence?.showRate ?? null,
        dialCount: row.dialCount,
        connectedCount: row.connectedCount,
        avgSpeedMs: avg,
        appointmentCount: row.appointmentCount,
        showedCount: row.showedCount,
        showRate: setterShowRate,
        cadence,
        dialsPerConnect,
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

    // Closer-side show-rate. Uses our own calls table as ground truth so it
    // works for customers whose appointment data lives outside GHL (iClosed,
    // Calendly, spreadsheets — see `aicom-ghl-data-shape` memory).
    const closerSide = await computeCloserSideShowRate(ctx, {
      teamId: args.teamId,
      leads,
      rangeStart: args.rangeStart,
      rangeEnd: args.rangeEnd,
    });

    const bookings = await computeBookings(ctx, {
      teamId: args.teamId,
      rangeStart: args.rangeStart,
      rangeEnd: args.rangeEnd,
      team,
      perSetterNames: new Map(
        perSetter.map((s) => [s.ghlUserId, s.name]),
      ),
      connectedSetterLeadIds: new Set(
        leads.filter((l) => l.isConnected).map((l) => String(l._id)),
      ),
    });

    return {
      totalLeads,
      connectedLeads,
      connectedRate: totalLeads > 0 ? connectedLeads / totalLeads : null,
      untouchedLeads,
      avgSpeedMs,
      p50SpeedMs,
      p90SpeedMs,
      revivedLeadCount,
      totalAppointments,
      totalShowed,
      totalNoShow,
      showRate,
      leadsBooked,
      companySetRate,
      showRateEvidence,
      cadenceClampedToDays,
      cadenceSampled: cadenceSampled || undefined,
      perSetter,
      closerSide,
      bookings,
    };
}

// ============================================================================
// Dashboard Phase 4 — bookings computation
// ============================================================================

async function computeBookings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  args: {
    teamId: string;
    rangeStart: number;
    rangeEnd: number;
    team: Doc<"teams"> | null;
    perSetterNames: Map<string, string>;
    connectedSetterLeadIds: Set<string>;
  },
): Promise<BookingsData> {
  const empty: BookingsData = {
    source: "none",
    total: 0,
    futureScheduled: 0,
    medianTimeToBookMs: null,
    byDayOfWeek: [0, 0, 0, 0, 0, 0, 0],
    preCallQualificationRate: null,
    preCallQualifiedCount: 0,
    perSetter: [],
    connectionsToBookingsRate: null,
    flowType: resolveFlowType(args.team),
    flowOverride: (args.team?.setterBookingFlowOverride ?? "auto") as BookingFlowOverride,
  };

  // Source 1: setterAppointments (GHL-native). Use if there are ≥10 in range.
  const apptSamples = (await ctx.db
    .query("setterAppointments")
    .withIndex("by_team_and_start_time", (q: any) =>
      q
        .eq("teamId", args.teamId)
        .gte("startTime", args.rangeStart)
        .lt("startTime", args.rangeEnd),
    )
    .take(11)) as Doc<"setterAppointments">[];

  if (apptSamples.length >= 10) {
    return computeBookingsFromGhlAppointments(ctx, args, empty);
  }

  // Source 2: calendarEvents (universal fallback).
  return computeBookingsFromCalendarEvents(ctx, args, empty);
}

function resolveFlowType(team: Doc<"teams"> | null): BookingFlowType {
  if (!team) return "unknown";
  const override = team.setterBookingFlowOverride;
  if (override && override !== "auto") return override as BookingFlowType;
  return (team.setterBookingFlowDetected as BookingFlowType) ?? "unknown";
}

async function computeBookingsFromGhlAppointments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  args: {
    teamId: string;
    rangeStart: number;
    rangeEnd: number;
    team: Doc<"teams"> | null;
    perSetterNames: Map<string, string>;
    connectedSetterLeadIds: Set<string>;
  },
  base: BookingsData,
): Promise<BookingsData> {
  const tz = args.team?.timezone || "America/New_York";
  const allAppts = (await ctx.db
    .query("setterAppointments")
    .withIndex("by_team_and_start_time", (q: any) =>
      q
        .eq("teamId", args.teamId)
        .gte("startTime", args.rangeStart)
        .lt("startTime", args.rangeEnd),
    )
    .collect()) as Doc<"setterAppointments">[];

  const valid = allAppts.filter(
    (a) => a.status !== "Cancelled" && a.status !== "Invalid",
  );

  const total = valid.length;
  const now = Date.now();
  const futureScheduled = valid.filter((a) => a.startTime > now).length;

  // Time-to-book is from the lead's dateAdded (need to look up). Skip — we'd
  // need a setterLeads join keyed by ghlContactId which is doable but adds
  // a per-appointment read. For the GHL appointments source we have
  // bookedAt directly, but no easy dateAdded lookup. Mark as null for v1.
  const medianTimeToBookMs: number | null = null;

  const byDayOfWeek = [0, 0, 0, 0, 0, 0, 0];
  for (const a of valid) {
    const dow = dayOfWeekInTz(a.bookedAt, tz);
    byDayOfWeek[dow]++;
  }

  // Per-setter attribution from bookedByGhlUserId (when present).
  const bookingsByUser = new Map<string, number>();
  for (const a of valid) {
    if (!a.bookedByGhlUserId) continue;
    bookingsByUser.set(
      a.bookedByGhlUserId,
      (bookingsByUser.get(a.bookedByGhlUserId) ?? 0) + 1,
    );
  }
  const perSetter = Array.from(bookingsByUser.entries())
    .map(([ghlUserId, bookingCount]) => ({
      ghlUserId,
      name: args.perSetterNames.get(ghlUserId) ?? "Unknown setter",
      bookingCount,
    }))
    .sort((a, b) => b.bookingCount - a.bookingCount);

  return {
    ...base,
    source: "setterAppointments",
    total,
    futureScheduled,
    medianTimeToBookMs,
    byDayOfWeek,
    // setterAppointments doesn't easily expose pre-call qualification
    // (would require joining setterLeadEvents per appointment). Leave
    // unset for the GHL path; surfaces only on calendarEvents path for v1.
    preCallQualificationRate: null,
    preCallQualifiedCount: 0,
    perSetter,
  };
}

async function computeBookingsFromCalendarEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  args: {
    teamId: string;
    rangeStart: number;
    rangeEnd: number;
    team: Doc<"teams"> | null;
    perSetterNames: Map<string, string>;
    connectedSetterLeadIds: Set<string>;
  },
  base: BookingsData,
): Promise<BookingsData> {
  const tz = args.team?.timezone || "America/New_York";
  const matcher = await buildBookingMatcherIndex(
    ctx,
    args.teamId as Id<"teams">,
    args.rangeStart,
    args.rangeEnd,
  );

  if (matcher.bookings.length === 0) {
    return {
      ...base,
      source: matcher.externalAttendeeEventCount > 0 ? "calendarEvents" : "none",
      rangeClampedToDays: matcher.rangeClampedToDays,
    };
  }

  const total = matcher.bookings.length;
  const now = Date.now();
  const futureScheduled = matcher.bookings.filter(
    (b) => b.startTime > now,
  ).length;

  // Time-to-book — median of (creationTime - dateAdded). Outlier cap at
  // 90 days to suppress historical sync artifacts where the event existed
  // before Sequ3nce was connected.
  const TIME_TO_BOOK_CAP_MS = 90 * 24 * 60 * 60_000;
  const speeds = matcher.bookings
    .map((b) => b.calendarEventCreationTime - b.leadDateAdded)
    .filter((d) => d >= 0 && d <= TIME_TO_BOOK_CAP_MS)
    .sort((a, b) => a - b);
  const medianTimeToBookMs =
    speeds.length > 0 ? speeds[Math.floor(speeds.length * 0.5)] : null;

  const byDayOfWeek = [0, 0, 0, 0, 0, 0, 0];
  for (const b of matcher.bookings) {
    const dow = dayOfWeekInTz(b.calendarEventCreationTime, tz);
    byDayOfWeek[dow]++;
  }

  // Pre-call qualification + per-setter attribution — from LEAD SNAPSHOTS.
  // Each matched booking carries its setterLeadId, so we read the lead docs
  // (bounded by the bookings count) instead of scanning the team's dial+SMS
  // events over a 60-day lookback with two take(50_000)s — which was the
  // single worst read in the metrics path (65-130k docs at 90d on the
  // largest org, past the 32k/transaction scan limit on its own).
  // firstDialAt / firstSmsOutboundAt / firstDialByUserId are maintained with
  // min-time semantics in the sink and repaired by the rollup backfill.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadById = new Map<string, any>();
  for (const b of matcher.bookings) {
    const key = String(b.setterLeadId);
    if (!leadById.has(key)) {
      leadById.set(key, await ctx.db.get(b.setterLeadId));
    }
  }

  let preCallQualifiedCount = 0;
  for (const booking of matcher.bookings) {
    const lead = leadById.get(String(booking.setterLeadId));
    if (!lead) continue;
    const earliest = Math.min(
      lead.firstDialAt ?? Infinity,
      lead.firstSmsOutboundAt ?? Infinity,
    );
    if (earliest < booking.calendarEventCreationTime) {
      preCallQualifiedCount++;
    }
  }
  const preCallQualificationRate =
    total > 0 ? preCallQualifiedCount / total : null;

  // Per-setter attribution: the lead's first dialer (snapshot), falling
  // back to CRM assignment — same semantics as the old event-derived map.
  const perSetterCounts = new Map<string, number>();
  for (const booking of matcher.bookings) {
    const lead = leadById.get(String(booking.setterLeadId));
    const setterId =
      (lead?.firstDialByUserId as string | undefined) ??
      booking.leadAssignedToGhlUserId ??
      null;
    if (!setterId) continue;
    perSetterCounts.set(
      setterId,
      (perSetterCounts.get(setterId) ?? 0) + 1,
    );
  }
  const perSetter = Array.from(perSetterCounts.entries())
    .map(([ghlUserId, bookingCount]) => ({
      ghlUserId,
      name: args.perSetterNames.get(ghlUserId) ?? "Unknown setter",
      bookingCount,
    }))
    .sort((a, b) => b.bookingCount - a.bookingCount);

  // Connections → bookings %: matched leads with ≥1 connection AND ≥1 booking
  // divided by matched leads with ≥1 connection.
  const bookedLeadIds = new Set(
    matcher.bookings.map((b) => String(b.setterLeadId)),
  );
  const connectedCount = args.connectedSetterLeadIds.size;
  const connectedAndBookedCount = Array.from(
    args.connectedSetterLeadIds,
  ).filter((id) => bookedLeadIds.has(id)).length;
  const connectionsToBookingsRate =
    connectedCount > 0 ? connectedAndBookedCount / connectedCount : null;

  return {
    ...base,
    source: "calendarEvents",
    total,
    futureScheduled,
    medianTimeToBookMs,
    byDayOfWeek,
    preCallQualificationRate,
    preCallQualifiedCount,
    perSetter,
    connectionsToBookingsRate,
    rangeClampedToDays: matcher.rangeClampedToDays,
  };
}

function dayOfWeekInTz(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).formatToParts(new Date(ts));
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<
    string,
    number
  >)[wd];
}

// 14-day forward window: a lead added on day 0 may have a closer call
// anywhere from immediately to ~2 weeks out. Wider than that and we start
// matching unrelated future calls; narrower and we miss legitimate
// followups.
const CLOSER_MATCH_LOOKAHEAD_MS = 14 * 24 * 60 * 60 * 1000;

async function computeCloserSideShowRate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  args: {
    teamId: string;
    leads: Doc<"setterLeads">[];
    rangeStart: number;
    rangeEnd: number;
  },
): Promise<ScorecardData["closerSide"]> {
  const empty: ScorecardData["closerSide"] = {
    matched: 0,
    showed: 0,
    closed: 0,
    showRate: null,
    activeClosers: 0,
    available: false,
  };

  // Count active closers — used by the UI to decide between empty-state
  // copy ("connect Desktop to enable this view") vs the populated stats.
  const closersAll = await ctx.db
    .query("closers")
    .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
    .collect();
  const activeClosers = closersAll.filter(
    (c: { status?: string }) => c.status === "active",
  ).length;

  if (activeClosers === 0 || args.leads.length === 0) {
    return { ...empty, activeClosers };
  }

  // The 60-day cap and the transcript-blob try/catch that used to live
  // here are gone — heavy fields moved off the calls table into the
  // callContent sibling, so the matcher's call scan is no longer
  // size-bounded by transcript length. Any range is safe.
  const index = await buildMatcherIndex(
    ctx,
    args.teamId as Id<"teams">,
    args.rangeStart,
    args.rangeEnd + CLOSER_MATCH_LOOKAHEAD_MS,
  );

  let matched = 0;
  let showed = 0;
  let closed = 0;
  for (const lead of args.leads) {
    const calls = findCallsForLead(index, {
      email: lead.email,
      phone: lead.phone,
    });
    if (calls.length === 0) continue;
    matched += 1;
    // Showed = at least one settled call that wasn't a no-show or reschedule.
    if (
      calls.some(
        (c) =>
          c.status === "completed" &&
          c.outcome != null &&
          c.outcome !== "no_show" &&
          c.outcome !== "rescheduled",
      )
    ) {
      showed += 1;
    }
    if (calls.some((c) => c.outcome === "closed")) closed += 1;
  }

  return {
    matched,
    showed,
    closed,
    showRate: matched > 0 ? showed / matched : null,
    activeClosers,
    available: matched > 0,
  };
}

/**
 * Evidence-based show rate — the three-tier waterfall over settled
 * appointments (see ShowRateEvidence). Provider-agnostic: GHL appointments
 * arrive with manual statuses (tier 1 often resolves), Close meetings all
 * arrive "Confirmed" (tiers 2-3 do the work via closer-call evidence).
 */
export async function computeShowRateEvidence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  args: {
    teamId: string;
    rangeStart: number;
    rangeEnd: number;
  },
): Promise<ShowRateEvidence> {
  const now = Date.now();
  const breakdown = {
    fromStatus: 0,
    fromForm: 0,
    fromRecording: 0,
    assumedNoShow: 0,
    unknown: 0,
  };

  // Candidates: startTime (NOT bookedAt — numbers must not mutate weeks
  // later as future bookings settle) in range, grace elapsed, not cancelled.
  // Read via the startTime index — bounded by the range, never all-time.
  const inRange: Doc<"setterAppointments">[] = await ctx.db
    .query("setterAppointments")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team_and_start_time", (q: any) =>
      q
        .eq("teamId", args.teamId)
        .gte("startTime", args.rangeStart)
        .lt("startTime", args.rangeEnd),
    )
    .collect();
  const candidates = inRange.filter(
    (a) =>
      a.status !== "Cancelled" &&
      a.status !== "Invalid" &&
      a.startTime <= now - SHOW_GRACE_MS,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const closersAll = await ctx.db
    .query("closers")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
    .collect();
  const activeClosers = closersAll.filter(
    (c: { status?: string }) => c.status === "active",
  ).length;

  if (candidates.length === 0) {
    return {
      available: false,
      activeClosers,
      candidates: 0,
      settled: 0,
      showed: 0,
      noShow: 0,
      showRate: null,
      coverage: null,
      breakdown,
      perSetter: [],
    };
  }

  type Res = "showed" | "noShow" | "unknown";
  const resolution = new Map<string, Res>();

  // ---- Tier 1: CRM manual status --------------------------------------
  const unresolved: Doc<"setterAppointments">[] = [];
  for (const a of candidates) {
    if (a.status === "Showed") {
      resolution.set(a._id, "showed");
      breakdown.fromStatus++;
    } else if (a.status === "No Show") {
      resolution.set(a._id, "noShow");
      breakdown.fromStatus++;
    } else {
      unresolved.push(a);
    }
  }

  // ---- Tier 2: closer-call evidence (form outcome, then recording) ----
  if (activeClosers > 0 && unresolved.length > 0) {
    const contactIds = Array.from(new Set(unresolved.map((a) => a.ghlContactId)));
    const leadByContact = new Map<string, Doc<"setterLeads"> | null>();
    for (const cid of contactIds) {
      const lead = await ctx.db
        .query("setterLeads")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_team_and_ghl_contact_id", (q: any) =>
          q.eq("teamId", args.teamId).eq("ghlContactId", cid),
        )
        .first();
      leadByContact.set(cid, lead);
    }

    const minStart = Math.min(...unresolved.map((a) => a.startTime));
    const maxStart = Math.max(...unresolved.map((a) => a.startTime));
    const index = await buildMatcherIndex(
      ctx,
      args.teamId as Id<"teams">,
      minStart - SHOW_MATCH_BEFORE_MS,
      maxStart + SHOW_MATCH_AFTER_MS,
    );

    const apptsByContact = new Map<string, Doc<"setterAppointments">[]>();
    for (const a of unresolved) {
      const list = apptsByContact.get(a.ghlContactId) ?? [];
      list.push(a);
      apptsByContact.set(a.ghlContactId, list);
    }

    for (const [cid, list] of apptsByContact) {
      const lead = leadByContact.get(cid);
      if (!lead) continue;
      // Candidate calls for this lead: the closer either completed the call
      // or explicitly logged it as a no-show.
      const calls = findCallsForLead(index, {
        email: lead.email,
        phone: lead.phone,
      })
        .filter((c) => c.status === "completed" || c.status === "no_show")
        .sort((x, y) => (x.createdAt ?? 0) - (y.createdAt ?? 0));
      if (calls.length === 0) continue;

      // Greedy 1:1 assignment: each appointment (chronological) claims the
      // nearest unconsumed call inside its window. One call can never mark
      // two appointments of a reschedule chain "showed".
      const consumed = new Set<string>();
      for (const a of [...list].sort((x, y) => x.startTime - y.startTime)) {
        let best: Doc<"calls"> | null = null;
        let bestDist = Infinity;
        for (const c of calls) {
          if (consumed.has(c._id)) continue;
          const t = c.startedAt ?? c.createdAt ?? 0;
          if (
            t < a.startTime - SHOW_MATCH_BEFORE_MS ||
            t > a.startTime + SHOW_MATCH_AFTER_MS
          ) {
            continue;
          }
          const dist = Math.abs(t - a.startTime);
          if (dist < bestDist) {
            best = c;
            bestDist = dist;
          }
        }
        if (!best) continue;
        consumed.add(best._id);

        if (best.status === "no_show" || best.outcome === "no_show") {
          resolution.set(a._id, "noShow");
          breakdown.fromForm++;
        } else if (best.outcome === "rescheduled") {
          // The meeting moved — neither showed nor no-show for THIS slot.
          resolution.set(a._id, "unknown");
          breakdown.unknown++;
        } else if (best.outcome != null) {
          resolution.set(a._id, "showed");
          breakdown.fromForm++;
        } else if ((best.duration ?? 0) >= SHOW_RECORDING_MIN_SEC) {
          // No form answer, but a real recording exists — evidence they showed.
          resolution.set(a._id, "showed");
          breakdown.fromRecording++;
        } else {
          // Recording stub: closer joined, prospect never did.
          resolution.set(a._id, "noShow");
          breakdown.fromRecording++;
        }
      }
    }
  }

  // Coverage = share of candidates resolved by hard evidence (tiers 1-2).
  const resolvedByEvidence = Array.from(resolution.values()).filter(
    (r) => r !== "unknown",
  ).length;
  const coverage = resolvedByEvidence / candidates.length;

  // ---- Tier 3: no evidence → assumed no-show (coverage-gated) ---------
  for (const a of candidates) {
    if (resolution.has(a._id)) continue;
    if (activeClosers > 0 && coverage >= SHOW_ASSUME_COVERAGE) {
      resolution.set(a._id, "noShow");
      breakdown.assumedNoShow++;
    } else {
      resolution.set(a._id, "unknown");
      breakdown.unknown++;
    }
  }

  // ---- Rollup ----------------------------------------------------------
  let showed = 0;
  let noShow = 0;
  const per = new Map<string, { settled: number; showed: number }>();
  for (const a of candidates) {
    const r = resolution.get(a._id);
    if (r === undefined || r === "unknown") continue;
    if (r === "showed") showed++;
    else noShow++;
    const sid = a.bookedByGhlUserId;
    if (!sid) continue;
    const p = per.get(sid) ?? { settled: 0, showed: 0 };
    p.settled++;
    if (r === "showed") p.showed++;
    per.set(sid, p);
  }
  const settled = showed + noShow;

  return {
    available: settled > 0,
    activeClosers,
    candidates: candidates.length,
    settled,
    showed,
    noShow,
    showRate: settled > 0 ? showed / settled : null,
    coverage,
    breakdown,
    perSetter: Array.from(per.entries()).map(([ghlUserId, p]) => ({
      ghlUserId,
      settled: p.settled,
      showed: p.showed,
      showRate: p.settled > 0 ? p.showed / p.settled : null,
    })),
  };
}

/**
 * Internal-query wrapper around computeScorecard. Used by the scorecard
 * cron (an action), which can only access query data via ctx.runQuery.
 */
/**
 * How long the team took to first dial a lead, or null when that can't be
 * answered honestly.
 *
 * A first dial can legitimately land BEFORE the CRM says the lead was created.
 * Two systems are stamping two clocks, and when a setter dials the instant a
 * lead arrives, the dialer's message can beat the CRM's contact record by a
 * few seconds. Measured on a live account: 199 leads negative by under five
 * minutes, 164 of them by under a minute. Those are the FASTEST responses the
 * team has.
 *
 * An earlier version of this simply dropped every negative. That quietly threw
 * away 238 of the last week's 255 dialed leads — all the good ones — and
 * averaged the stragglers, reporting 17 hours for a team that often dials in
 * seconds. Discarding data is not neutral when the data isn't randomly
 * distributed.
 *
 * So: clamp small negatives to zero, which is what they mean. Beyond the
 * tolerance the creation date itself is wrong (the other 237 on that account
 * were off by a median of six days, later repaired from the CRM), and a wrong
 * date can't produce a right answer — those are excluded rather than guessed
 * at.
 */
const SPEED_TO_LEAD_SKEW_TOLERANCE_MS = 5 * 60_000;

/**
 * A first touch later than this after the lead arrived is not "response
 * speed" — it's a REVIVAL of a lead that went cold, a different event.
 * Without this window one six-month-old lead dialed today adds ~4,380
 * hours to the average and quietly wrecks it (Tyler's exact concern), and
 * the metric never settles: an old lead's first dial retroactively changes
 * a month that had already closed.
 */
export const SPEED_TO_LEAD_ELIGIBILITY_MS = 7 * 24 * 60 * 60_000;

export function normalizeSpeedToLeadMs(
  firstDialAt: number,
  dateAdded: number,
): number | null {
  const delta = firstDialAt - dateAdded;
  if (delta > SPEED_TO_LEAD_ELIGIBILITY_MS) return null; // a revival, not a response
  if (delta >= 0) return delta;
  if (-delta <= SPEED_TO_LEAD_SKEW_TOLERANCE_MS) return 0;
  return null;
}

export const getScorecardData = internalQuery({
  args: {
    teamId: v.id("teams"),
    rangeStart: v.number(),
    rangeEnd: v.number(),
    // Optional opt-ins (see ScorecardOpts) — the cron omits them (1-day
    // windows don't render cadence/evidence); tests + ad-hoc runs use them.
    cadenceClampDays: v.optional(v.number()),
    cadenceCap: v.optional(v.number()),
    evidence: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ScorecardData> => {
    return await computeScorecard(
      ctx,
      { teamId: args.teamId, rangeStart: args.rangeStart, rangeEnd: args.rangeEnd },
      {
        cadence:
          args.cadenceClampDays !== undefined
            ? { clampDays: args.cadenceClampDays, cap: args.cadenceCap ?? 25_000 }
            : "none",
        evidence: args.evidence ?? false,
      },
    );
  },
});
