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
import { elapsedWorkingMs } from "./setterFunnelResolve";
import type { BookingRecord } from "./setterTeamBookings";
import { loadLeadTouches } from "./setterTeamTouches";
import { percentiles, type Hours } from "./settersPageTeams";

/** Leads read per call, newest first; a wider window than this is reported as partial. */
const LEAD_TAKE = 1_000;
/** A first activity this close to the lead's creation means the dial created the lead. */
const STUB_WINDOW_MS = 5 * 60 * 1000;

/**
 * A lead with no real arrival time: Close created it from the first dial (or
 * we inferred its date from the first activity we saw). Counted, never timed.
 */
export function isStubLead(lead: { dateAdded: number; dateAddedInferred?: boolean; firstDialAt?: number; firstSmsOutboundAt?: number }): boolean {
  if (lead.dateAddedInferred === true) return true;
  const firstActivity = Math.min(lead.firstDialAt ?? Infinity, lead.firstSmsOutboundAt ?? Infinity);
  return Number.isFinite(firstActivity) && Math.abs(firstActivity - lead.dateAdded) <= STUB_WINDOW_MS;
}

export type SpeedNote = "no arrival time" | "never contacted" | "touched before arrival" | "contacted, time unknown" | null;

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
}

export interface SpeedSummary {
  count: number;
  medianWorkingMs: number | null;
  p90WorkingMs: number | null;
  noArrivalCount: number;
  neverContactedCount: number;
  /** Credited by the calendar tag alone — contacted, but Close holds no time for it. */
  untimedCount: number;
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
}

function summarise(rows: SpeedLeadRow[], clipped: number, unread: number): SpeedSummary {
  const timed = rows.filter((r) => r.workingMs !== null).map((r) => r.workingMs as number);
  const { median, p90 } = percentiles(timed);
  return {
    count: timed.length,
    medianWorkingMs: median,
    p90WorkingMs: p90,
    noArrivalCount: rows.filter((r) => r.note === "no arrival time" || r.note === "touched before arrival").length,
    neverContactedCount: rows.filter((r) => r.note === "never contacted").length,
    untimedCount: rows.filter((r) => r.note === "contacted, time unknown").length,
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
): Promise<OutboundSpeed> {
  const truncated: string[] = [];
  const leads: Doc<"setterLeads">[] = await ctx.db
    .query("setterLeads")
    .withIndex("by_team_and_date_added", (q) => q.eq("teamId", teamId).gte("dateAdded", startMs).lt("dateAdded", endMs))
    .order("desc")
    .take(LEAD_TAKE);
  if (leads.length >= LEAD_TAKE) truncated.push(`leads (newest ${LEAD_TAKE})`);
  const live = leads.filter((l) => l.isInternal !== true);
  const touches = await loadLeadTouches(ctx, teamId, live.map((l) => l.ghlContactId), startMs, nowMs);
  truncated.push(...touches.truncated);
  const byCrm = new Map(setters.map((s) => [s.crmUserId, s]));

  const rows: SpeedLeadRow[] = [];
  let clipped = 0;
  let unread = 0;
  for (const lead of live) {
    if (touches.unread.has(lead.ghlContactId)) {
      unread += 1;
      continue;
    }
    if (touches.clipped.has(lead.ghlContactId)) {
      clipped += 1;
      continue;
    }
    const base = {
      leadId: lead.ghlContactId,
      leadName: lead.name || lead.email || "lead",
      arrivedAt: lead.dateAdded,
    };
    if (isStubLead(lead)) {
      rows.push({ ...base, firstTouchAt: null, byRosterId: null, byName: null, workingMs: null, elapsedMs: null, note: "no arrival time" });
      continue;
    }
    const first = (touches.byContact.get(lead.ghlContactId)?.touches ?? [])
      .filter((t) => byCrm.has(t.crmUserId))
      .sort((a, b) => a.at - b.at)[0];
    if (!first) {
      rows.push({ ...base, firstTouchAt: null, byRosterId: null, byName: null, workingMs: null, elapsedMs: null, note: "never contacted" });
      continue;
    }
    const by = byCrm.get(first.crmUserId)!;
    if (first.at < lead.dateAdded) {
      rows.push({ ...base, firstTouchAt: first.at, byRosterId: by.rosterId, byName: by.name, workingMs: null, elapsedMs: null, note: "touched before arrival" });
      continue;
    }
    rows.push({
      ...base,
      firstTouchAt: first.at,
      byRosterId: by.rosterId,
      byName: by.name,
      workingMs: elapsedWorkingMs(lead.dateAdded, first.at, hours),
      elapsedMs: first.at - lead.dateAdded,
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
      rows.push({ ...base, firstTouchAt: null, byRosterId: null, byName: null, workingMs: null, elapsedMs: null, note: "no arrival time" });
      continue;
    }
    const first = r.touches.filter((t) => t.rosterId === rosterId && t.afterBooking).sort((a, b) => a.at - b.at)[0];
    if (!first) {
      const taggedToHer = r.classification.attributedBy === "tag" && r.classification.creditRosterIds.includes(rosterId);
      rows.push({ ...base, firstTouchAt: null, byRosterId: taggedToHer ? rosterId : null, byName: taggedToHer ? name : null, workingMs: null, elapsedMs: null, note: taggedToHer ? "contacted, time unknown" : "never contacted" });
      continue;
    }
    rows.push({ ...base, firstTouchAt: first.at, byRosterId: rosterId, byName: name, workingMs: elapsedWorkingMs(r.bookedAt, first.at, hours), elapsedMs: first.at - r.bookedAt, note: null });
  }
  return rows;
}

export function confirmationSpeedDays(rows: SpeedLeadRow[], tz: string, slowestFirst: boolean): { days: SpeedDay[]; summary: SpeedSummary } {
  return { days: groupByDay(rows, tz, 0, 0, slowestFirst), summary: summarise(rows, 0, 0) };
}
