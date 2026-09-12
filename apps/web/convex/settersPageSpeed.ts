// ============================================================================
// Speed to lead, per lead: how long each lead waited for the FIRST touch by
// one of this team's own setters, in working hours. Automated texts (no
// user), closers and the confirmation setter never stop the outbound clock.
// A lead whose Close record was created by the dial itself has no arrival
// time and is counted, never averaged. Results are grouped by the day the
// lead arrived, then per setter; medians are nearest-rank.
// ============================================================================

import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { dayKeyInTz } from "./closerPerformance";
import { elapsedWorkingMsOrNull } from "./setterFunnelResolve";
import type { BookingRecord } from "./setterTeamBookings";
import { loadLeadTouches } from "./setterTeamTouches";
import { guestEmailOf } from "./setterTeamBookingHelpers";
import { percentiles, type Hours } from "./settersPageTeams";

/** Leads read per call, newest first; a wider window than this is reported as partial. */
const LEAD_TAKE = 1_000;
/** A first activity this close to the lead's creation means the dial created the lead. */
const STUB_WINDOW_MS = 5 * 60 * 1000;

/**
 * A lead with no real arrival time: Close created it from the first dial (or
 * we inferred its date from the first activity we saw). Counted, never timed.
 */
export function isStubLead(lead: { dateAdded: number; dateAddedInferred?: boolean; firstDialAt?: number; firstDialByUserId?: string }): boolean {
  if (lead.dateAddedInferred === true) return true;
  // Only a person's dial creates a lead this way. An automated welcome text
  // seconds after creation is normal and says nothing about arrival.
  if (!lead.firstDialByUserId || lead.firstDialAt === undefined) return false;
  return Math.abs(lead.firstDialAt - lead.dateAdded) <= STUB_WINDOW_MS;
}

export type SpeedNote = "no arrival time" | "never contacted" | "touched before arrival" | "contacted, time unknown" | "self-booked" | null;

export interface SpeedLeadRow {
  leadId: string;
  leadName: string;
  arrivedAt: number;
  firstTouchAt: number | null;
  byRosterId: string | null;
  byName: string | null;
  workingMs: number | null;
  elapsedMs: number | null;
  note: SpeedNote;
  /** Dials this lead got from the setter who touched it first, in the range — cadence per lead. */
  dials: number;
}

export interface SpeedSummary {
  count: number;
  medianWorkingMs: number | null;
  p90WorkingMs: number | null;
  /** The same leads on the wall clock — a lead that lands at 9pm and is called at 9:05am is 0 working hours and 12 clock hours. */
  medianElapsedMs: number | null;
  noArrivalCount: number;
  neverContactedCount: number;
  /** Credited by the calendar tag alone — contacted, but Close holds no time for it. */
  untimedCount: number;
  /** Leads that booked themselves in the range — the confirmation team's, not an outbound setter's to chase. */
  selfBookedCount: number;
  clippedCount: number;
  unreadCount: number;
}

export interface SpeedDay extends SpeedSummary {
  dayKey: string;
  leads: SpeedLeadRow[];
}

export interface SetterRef {
  rosterId: string;
  name: string;
  crmUserId: string;
  /** This person's own working window, when we know it. Falls back to the team's. */
  hours?: Hours | null;
}

function summarise(rows: SpeedLeadRow[], clipped: number, unread: number): SpeedSummary {
  const timedRows = rows.filter((r) => r.workingMs !== null);
  const { median, p90 } = percentiles(timedRows.map((r) => r.workingMs as number));
  const elapsed = percentiles(timedRows.map((r) => r.elapsedMs as number)).median;
  return {
    count: timedRows.length,
    medianWorkingMs: median,
    p90WorkingMs: p90,
    medianElapsedMs: elapsed,
    noArrivalCount: rows.filter((r) => r.note === "no arrival time" || r.note === "touched before arrival").length,
    neverContactedCount: rows.filter((r) => r.note === "never contacted").length,
    untimedCount: rows.filter((r) => r.note === "contacted, time unknown").length,
    selfBookedCount: rows.filter((r) => r.note === "self-booked").length,
    clippedCount: clipped,
    unreadCount: unread,
  };
}

function groupByDay(rows: SpeedLeadRow[], tz: string, clipped: number, unread: number, slowestFirst: boolean): SpeedDay[] {
  const byDay = new Map<string, SpeedLeadRow[]>();
  for (const r of rows) {
    const key = dayKeyInTz(r.arrivedAt, tz);
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  const order = (a: SpeedLeadRow, b: SpeedLeadRow) =>
    slowestFirst ? (b.workingMs ?? -1) - (a.workingMs ?? -1) : a.arrivedAt - b.arrivedAt;
  return Array.from(byDay.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dayKey, leads]) => ({ dayKey, leads: [...leads].sort(order), ...summarise(leads, clipped, unread) }));
}

export interface OutboundSpeed {
  rows: SpeedLeadRow[];
  clipped: number;
  unread: number;
  truncated: string[];
}

const BOOKED_TAKE = 8_000;

/** Guests who booked themselves in [startMs, endMs) — by normalised email — so they leave the outbound cohort. */
/** Guest email → the earliest time that guest booked in the range. */
async function bookedAtByEmail(ctx: QueryCtx, teamId: Id<"teams">, startMs: number, endMs: number): Promise<{ bookedAt: Map<string, number>; truncated: boolean }> {
  const rows = await ctx.db
    .query("calendarEvents")
    .withIndex("by_team_and_booked_at", (q) => q.eq("teamId", teamId).gte("bookedAt", startMs).lt("bookedAt", endMs))
    .take(BOOKED_TAKE);
  const bookedAt = new Map<string, number>();
  for (const e of rows) {
    const g = guestEmailOf([e]);
    if (!g) continue;
    const at = e.bookedAt ?? e._creationTime;
    bookedAt.set(g, Math.min(bookedAt.get(g) ?? Infinity, at));
  }
  return { bookedAt, truncated: rows.length >= BOOKED_TAKE };
}

/**
 * Outbound leads created in [startMs, endMs): first touch by any of `setters`.
 * One range read on leads, one per-lead read on their Close activity.
 */
export async function outboundSpeed(
  ctx: QueryCtx,
  teamId: Id<"teams">,
  setters: SetterRef[],
  hours: Hours,
  startMs: number,
  endMs: number,
  nowMs: number,
  connectSec: number,
): Promise<OutboundSpeed> {
  const truncated: string[] = [];
  const leads: Doc<"setterLeads">[] = await ctx.db
    .query("setterLeads")
    .withIndex("by_team_and_date_added", (q) => q.eq("teamId", teamId).gte("dateAdded", startMs).lt("dateAdded", endMs))
    .order("desc")
    .take(LEAD_TAKE);
  if (leads.length >= LEAD_TAKE) truncated.push(`leads (newest ${LEAD_TAKE})`);
  const live = leads.filter((l) => l.isInternal !== true);
  // A lead that booked itself BEFORE any outbound setter touched it is the
  // confirmation team's and never counts against an outbound setter's speed.
  // A lead the setter reached first and then booked is theirs — and timed.
  const booked = await bookedAtByEmail(ctx, teamId, startMs, endMs);
  if (booked.truncated) truncated.push("booked events");
  const touches = await loadLeadTouches(ctx, teamId, live.map((l) => l.ghlContactId), startMs, nowMs, connectSec);
  truncated.push(...touches.truncated);
  const byCrm = new Map(setters.map((s) => [s.crmUserId, s]));

  const rows: SpeedLeadRow[] = [];
  let clipped = 0;
  let unread = 0;
  const none = { firstTouchAt: null, byRosterId: null, byName: null, workingMs: null, elapsedMs: null, dials: 0 };
  for (const lead of live) {
    const base = {
      leadId: lead.ghlContactId,
      leadName: lead.name || lead.email || "lead",
      arrivedAt: lead.dateAdded,
    };
    const selfBookedAt = lead.emailNorm ? booked.bookedAt.get(lead.emailNorm) : undefined;
    if (touches.unread.has(lead.ghlContactId)) {
      unread += 1;
      continue;
    }
    if (touches.clipped.has(lead.ghlContactId)) {
      clipped += 1;
      continue;
    }
    const mine = (touches.byContact.get(lead.ghlContactId)?.touches ?? []).filter((t) => byCrm.has(t.crmUserId)).sort((a, b) => a.at - b.at);
    const first = mine[0];
    // "Self-booked" is the more telling reason, so it is checked before the
    // arrival-time stub: a lead that booked itself is the confirmation
    // team's whether or not Close knows when it arrived.
    if (selfBookedAt !== undefined && (!first || first.at > selfBookedAt)) {
      rows.push({ ...base, ...none, note: "self-booked" });
      continue;
    }
    if (isStubLead(lead)) {
      rows.push({ ...base, ...none, note: "no arrival time" });
      continue;
    }
    if (!first) {
      rows.push({ ...base, ...none, note: "never contacted" });
      continue;
    }
    const by = byCrm.get(first.crmUserId)!;
    // Their own hours if we have them: a setter in London or on an evening
    // shift is measured against their day, not the team's assumed one.
    const theirHours = by.hours ?? hours;
    const dials = mine.filter((t) => t.kind === "dial" && t.crmUserId === first.crmUserId).length;
    if (first.at < lead.dateAdded) {
      rows.push({ ...base, firstTouchAt: first.at, byRosterId: by.rosterId, byName: by.name, workingMs: null, elapsedMs: null, dials, note: "touched before arrival" });
      continue;
    }
    rows.push({
      ...base,
      firstTouchAt: first.at,
      byRosterId: by.rosterId,
      byName: by.name,
      workingMs: elapsedWorkingMsOrNull(lead.dateAdded, first.at, theirHours),
      elapsedMs: first.at - lead.dateAdded,
      dials,
      note: null,
    });
  }
  return { rows, clipped, unread, truncated };
}

/** Per-setter summaries from one outbound pass — the card numbers. */
export function speedBySetter(speed: OutboundSpeed, setters: SetterRef[]): Map<string, SpeedSummary> {
  const out = new Map<string, SpeedSummary>();
  for (const s of setters) {
    const mine = speed.rows.filter((r) => r.byRosterId === s.rosterId);
    out.set(s.rosterId, summarise(mine, speed.clipped, speed.unread));
  }
  return out;
}

/** One outbound setter's leads, by arrival day — the drawer. Never-contacted leads belong to nobody and stay in the totals only. */
export function speedDaysFor(speed: OutboundSpeed, rosterId: string, tz: string, slowestFirst: boolean): { days: SpeedDay[]; summary: SpeedSummary } {
  const mine = speed.rows.filter((r) => r.byRosterId === rosterId);
  return { days: groupByDay(mine, tz, speed.clipped, speed.unread, slowestFirst), summary: summarise(mine, speed.clipped, speed.unread) };
}

/** The confirmation setter: from the self-booking to her first touch after it. Records must be the booked-in-range cohort. */
export function confirmationSpeedRows(records: BookingRecord[], rosterId: string, name: string, hours: Hours): SpeedLeadRow[] {
  const rows: SpeedLeadRow[] = [];
  for (const r of records) {
    if (r.isFollowUp || !r.classification.isFunnel || r.classification.lane === "outbound" || r.classification.lane === "dm") continue;
    const base = { leadId: r.key, leadName: r.displayTitle, arrivedAt: r.bookedAt ?? r.startTime };
    if (r.bookedAt === null || r.bookedAtInferred) {
      rows.push({ ...base, firstTouchAt: null, byRosterId: null, byName: null, workingMs: null, elapsedMs: null, dials: 0, note: "no arrival time" });
      continue;
    }
    const hers = r.touches.filter((t) => t.rosterId === rosterId && t.afterBooking).sort((a, b) => a.at - b.at);
    const first = hers[0];
    const dials = hers.filter((t) => t.kind === "dial").length;
    if (!first) {
      const taggedToHer = r.classification.attributedBy === "tag" && r.classification.creditRosterIds.includes(rosterId);
      rows.push({ ...base, firstTouchAt: null, byRosterId: taggedToHer ? rosterId : null, byName: taggedToHer ? name : null, workingMs: null, elapsedMs: null, dials: 0, note: taggedToHer ? "contacted, time unknown" : "never contacted" });
      continue;
    }
    rows.push({ ...base, firstTouchAt: first.at, byRosterId: rosterId, byName: name, workingMs: elapsedWorkingMsOrNull(r.bookedAt, first.at, hours), elapsedMs: first.at - r.bookedAt, dials, note: null });
  }
  return rows;
}

export function confirmationSpeedDays(rows: SpeedLeadRow[], tz: string, slowestFirst: boolean): { days: SpeedDay[]; summary: SpeedSummary } {
  return { days: groupByDay(rows, tz, 0, 0, slowestFirst), summary: summarise(rows, 0, 0) };
}
