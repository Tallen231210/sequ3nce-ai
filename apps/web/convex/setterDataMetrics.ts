import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { buildMatcherIndex, findCallsForLead } from "./setterCloserMatcher";
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
  /** Phase 2 — team-wide appointment rollup. */
  totalAppointments: number;
  totalShowed: number;
  totalNoShow: number;
  /** Showed / (Showed + No Show). null if no settled appts in window. */
  showRate: number | null;
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
        };
        perSetterMap.set(setterId, created);
        row = created;
      }
      return row;
    }

    // Pass 1: lead-count attribution. Lead assignment in GHL is how
    // managers think about "this setter owns this lead" — keep counting
    // leads by assignment.
    for (const lead of leads) {
      const setterId = lead.assignedToGhlUserId;
      if (!setterId) continue;
      ensureRow(setterId).leadCount += 1;
    }

    // Build a ghlContactId → dateAdded lookup for the in-range leads so
    // we can compute per-setter speed-to-lead from dial events below.
    const leadDateByContactId = new Map<string, number>();
    for (const lead of leads) {
      leadDateByContactId.set(lead.ghlContactId, lead.dateAdded);
    }

    // Pass 2: dials + connects attribution by the actor (ghlUserId on
    // the event), NOT by lead assignment. This fixes a bug where setters
    // who dial leads they aren't assigned to — including unassigned
    // leads, which is most of them for inbound-Calendly funnels —
    // showed up as having made zero dials.
    const dialEvents: Doc<"setterLeadEvents">[] = await ctx.db
      .query("setterLeadEvents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_type_and_time", (q: any) =>
        q
          .eq("teamId", args.teamId)
          .eq("eventType", "dial_outbound")
          .gte("occurredAt", args.rangeStart)
          .lt("occurredAt", args.rangeEnd),
      )
      .collect();

    const connectedEvents: Doc<"setterLeadEvents">[] = await ctx.db
      .query("setterLeadEvents")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_type_and_time", (q: any) =>
        q
          .eq("teamId", args.teamId)
          .eq("eventType", "connected")
          .gte("occurredAt", args.rangeStart)
          .lt("occurredAt", args.rangeEnd),
      )
      .collect();

    // Earliest dial per contact, attributed to whoever placed it. Powers
    // per-setter speed-to-lead (we credit the dialer who first reached
    // the lead, not whoever the lead happened to be assigned to).
    const firstDialByContact = new Map<
      string,
      { ghlUserId: string; occurredAt: number }
    >();

    for (const ev of dialEvents) {
      if (!ev.ghlUserId) continue;
      ensureRow(ev.ghlUserId).dialCount += 1;

      const existing = firstDialByContact.get(ev.ghlContactId);
      if (!existing || ev.occurredAt < existing.occurredAt) {
        firstDialByContact.set(ev.ghlContactId, {
          ghlUserId: ev.ghlUserId,
          occurredAt: ev.occurredAt,
        });
      }
    }

    for (const ev of connectedEvents) {
      if (!ev.ghlUserId) continue;
      ensureRow(ev.ghlUserId).connectedCount += 1;
    }

    // Speed-to-lead: for each first-dial-on-a-lead, attribute the gap
    // (lead.dateAdded → first dial) to the dialer. Only counts leads
    // whose dateAdded is in the same window (matches the team-level
    // speed-to-lead calculation done above).
    for (const [ghlContactId, first] of firstDialByContact) {
      const dateAdded = leadDateByContactId.get(ghlContactId);
      if (dateAdded === undefined) continue;
      ensureRow(first.ghlUserId)._speeds.push(first.occurredAt - dateAdded);
    }

    // Dashboard Phase 2 — dial cadence aggregation. For each setter, group
    // their dial events by lead (ghlContactId) and compute per-lead stats.
    // The aggregator is keyed by (setter, lead) so multiple setters dialing
    // the same lead get independent metrics.
    interface PerLeadCadence {
      dialCount: number;
      firstDialAt: number;
      lastDialAt: number;
    }
    const cadenceMap = new Map<string, Map<string, PerLeadCadence>>();
    for (const ev of dialEvents) {
      if (!ev.ghlUserId) continue;
      let leadMap = cadenceMap.get(ev.ghlUserId);
      if (!leadMap) {
        leadMap = new Map();
        cadenceMap.set(ev.ghlUserId, leadMap);
      }
      const existing = leadMap.get(ev.ghlContactId);
      if (existing) {
        existing.dialCount += 1;
        if (ev.occurredAt < existing.firstDialAt) {
          existing.firstDialAt = ev.occurredAt;
        }
        if (ev.occurredAt > existing.lastDialAt) {
          existing.lastDialAt = ev.occurredAt;
        }
      } else {
        leadMap.set(ev.ghlContactId, {
          dialCount: 1,
          firstDialAt: ev.occurredAt,
          lastDialAt: ev.occurredAt,
        });
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
      const row = ensureRow(setterId);
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

      // Per-setter cadence aggregation. Pull from the cadenceMap built
      // above. Small-sample suppression for the rate-style metrics.
      const leadMap = cadenceMap.get(row.ghlUserId) ?? new Map();
      const leadCadenceValues: PerLeadCadence[] = Array.from(leadMap.values());
      const leadsWithDials = leadCadenceValues.length;

      let avgDialsPerLead: number | null = null;
      let pctLeadsThreeOrMoreAttempts: number | null = null;
      if (leadsWithDials >= 5) {
        const totalDials = leadCadenceValues.reduce(
          (s, v) => s + v.dialCount,
          0,
        );
        avgDialsPerLead = totalDials / leadsWithDials;
        pctLeadsThreeOrMoreAttempts =
          leadCadenceValues.filter((v) => v.dialCount >= 3).length /
          leadsWithDials;
      }

      const pursuitDays: number[] = leadCadenceValues
        .filter((v) => v.dialCount >= 2)
        .map((v) => (v.lastDialAt - v.firstDialAt) / (24 * 60 * 60_000));
      pursuitDays.sort((a, b) => a - b);
      const medianPursuitDays =
        pursuitDays.length > 0
          ? pursuitDays[Math.floor(pursuitDays.length * 0.5)]
          : null;

      const cadence: ScorecardSetterCadence = {
        leadsWithDials,
        avgDialsPerLead,
        pctLeadsThreeOrMoreAttempts,
        medianPursuitDays,
      };

      // Dials-per-connect — productivity ratio. Suppressed below 3
      // connects: with 1-2 connects, this ratio is too noisy to be
      // actionable (1 lucky connect drops it dramatically).
      const dialsPerConnect: number | null =
        row.connectedCount >= 3 ? row.dialCount / row.connectedCount : null;

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

    const team = (await ctx.db.get(args.teamId as Id<"teams">)) as
      | Doc<"teams">
      | null;
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
      totalAppointments,
      totalShowed,
      totalNoShow,
      showRate,
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

  // Pre-call qualification + per-setter attribution. Both need per-contact
  // event lookups. Batch the reads to avoid blowing the 16 MiB limit on
  // teams with lots of bookings.
  //
  // Pre-call: fetch all dial_outbound + sms_outbound events for the team
  // in the booking-range lookback window, group by ghlContactId →
  // earliest event timestamp. Then check per-booking in memory.
  const BOOKING_LOOKBACK_MS = 60 * 24 * 60 * 60_000;
  const lookbackStart = args.rangeStart - BOOKING_LOOKBACK_MS;
  const [dials, smsOut] = await Promise.all([
    ctx.db
      .query("setterLeadEvents")
      .withIndex("by_team_and_type_and_time", (q: any) =>
        q
          .eq("teamId", args.teamId)
          .eq("eventType", "dial_outbound")
          .gte("occurredAt", lookbackStart)
          .lt("occurredAt", args.rangeEnd),
      )
      .take(50_000),
    ctx.db
      .query("setterLeadEvents")
      .withIndex("by_team_and_type_and_time", (q: any) =>
        q
          .eq("teamId", args.teamId)
          .eq("eventType", "sms_outbound")
          .gte("occurredAt", lookbackStart)
          .lt("occurredAt", args.rangeEnd),
      )
      .take(50_000),
  ]);
  const earliestTouchByContact = new Map<string, number>();
  for (const ev of [...dials, ...smsOut] as Array<{
    ghlContactId: string;
    occurredAt: number;
  }>) {
    const prev = earliestTouchByContact.get(ev.ghlContactId);
    if (prev === undefined || ev.occurredAt < prev) {
      earliestTouchByContact.set(ev.ghlContactId, ev.occurredAt);
    }
  }

  let preCallQualifiedCount = 0;
  for (const booking of matcher.bookings) {
    const earliest = earliestTouchByContact.get(booking.ghlContactId);
    if (earliest !== undefined && earliest < booking.calendarEventCreationTime) {
      preCallQualifiedCount++;
    }
  }
  const preCallQualificationRate =
    total > 0 ? preCallQualifiedCount / total : null;

  // Per-setter attribution. Group dial events by ghlContactId → first dialer
  // (the lead's primary setter, same pattern as firstDialByContact above).
  // For booked leads, count credit per primary setter.
  const firstDialerByContact = new Map<string, string>();
  for (const ev of dials as Array<{
    ghlContactId: string;
    ghlUserId?: string;
    occurredAt: number;
  }>) {
    if (!ev.ghlUserId) continue;
    const existing = firstDialerByContact.get(ev.ghlContactId);
    if (!existing) firstDialerByContact.set(ev.ghlContactId, ev.ghlUserId);
  }
  const perSetterCounts = new Map<string, number>();
  for (const booking of matcher.bookings) {
    const setterId =
      firstDialerByContact.get(booking.ghlContactId) ??
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
