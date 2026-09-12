// ============================================================================
// Pure page logic over booking records: the team strip (one column per team
// type), per-person booking rows with money, DM people from configuration,
// and the confirmation setter's response time. Reads nothing; the queries in
// settersPageQueries feed it records from the attribution engine.
// ============================================================================

import type { BookingRecord } from "./setterTeamBookings";
import { emptyTally, showRateOf, type LaneTotals, type PersonRow, type ConfirmationRow } from "./setterTeamLanes";
import type { RosterRef } from "./lib/setterTeamAttribution";
import { elapsedWorkingMsOrNull, type defaultBusinessHours } from "./setterFunnelResolve";
import { TEAM_ORDER, type SetterTeamType } from "./settersPageLabels";

export type Hours = ReturnType<typeof defaultBusinessHours>;

export interface DmPerson {
  name: string;
  linkName: string;
  active: boolean;
}

export interface Money {
  closes: number;
  cash: number;
}

export interface TeamStripColumn extends Money {
  team: SetterTeamType;
  label: string;
  bookings: number;
  showed: number;
  noShow: number;
  /** Moved to another time. Its own outcome: the prospect neither showed nor ghosted. */
  rescheduled: number;
  unknown: number;
  showRatePct: number | null;
  /** Finished calls, and how many of them have an outcome — the show rate's footing. */
  due: number;
  outcomeKnown: number;
  /** Confirmation only: self-booked funnel calls contacted over all of them. */
  coverage: { contacted: number; newSelfBooks: number; pct: number | null } | null;
}

export interface OutboundBookingRow extends PersonRow, Money {
  rosterId: string;
  active: boolean;
  linked: boolean;
}

export interface DmRow extends Money {
  linkName: string;
  name: string;
  configured: boolean;
  active: boolean;
  bookings: number;
  /** Finished calls — the show rate's footing. */
  due: number;
  showed: number;
  noShow: number;
  unknown: number;
  showRatePct: number | null;
}

export interface ConfirmationBookingRow extends ConfirmationRow, Money {
  rosterId: string;
  active: boolean;
  linked: boolean;
}

const LANE_OF: Record<SetterTeamType, BookingRecord["classification"]["lane"]> = {
  dm: "dm",
  outbound: "outbound",
  confirmation: "confirmation",
  unlabeled: "unattributed",
};

/** Money over EVERY record in a lane — follow-up closes count, as the EOD's "calls closed" does. */
function moneyWhere(records: BookingRecord[], keep: (r: BookingRecord) => boolean): Money {
  let closes = 0;
  let cash = 0;
  for (const r of records) {
    if (!keep(r) || !r.closed) continue;
    closes += 1;
    cash += r.cash;
  }
  return { closes, cash };
}

/** Median and p90 by nearest rank; null on an empty list. */
export function percentiles(values: number[]): { median: number | null; p90: number | null } {
  if (values.length === 0) return { median: null, p90: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return { median: at(0.5), p90: at(0.9) };
}

export function teamStrip(
  comparison: LaneTotals[],
  records: BookingRecord[],
  labels: Record<SetterTeamType, string>,
  funnel: { newSelfBooks: number; contacted: number },
): TeamStripColumn[] {
  const byLane = new Map(comparison.map((c) => [c.lane, c]));
  return TEAM_ORDER.map((team) => {
    const lane = LANE_OF[team];
    // The confirmation column is every self-book the confirmation setter
    // handled OR nobody did — a miss is still hers — so the four columns
    // add up to every booking in the range.
    const lanes: Array<typeof lane> = team === "confirmation" ? [lane, "self_booked_uncontacted"] : [lane];
    const parts = lanes.map((l) => byLane.get(l)).filter((x): x is LaneTotals => !!x);
    const sum = (pick: (t: LaneTotals) => number) => parts.reduce((n, t) => n + pick(t), 0);
    const showed = sum((t) => t.showed);
    const noShow = sum((t) => t.noShow);
    const due = sum((t) => t.due);
    return {
      team,
      label: labels[team],
      bookings: sum((t) => t.bookings),
      showed,
      noShow,
      rescheduled: sum((t) => t.rescheduled),
      unknown: sum((t) => t.unknown),
      /** Finished calls, and how many of them have an outcome — the show rate's footing. */
      due,
      outcomeKnown: showed + noShow,
      showRatePct: showRateOf({ due, showed, noShow }),
      ...moneyWhere(records, (r) => lanes.includes(r.classification.lane)),
      coverage:
        team === "confirmation"
          ? {
              contacted: funnel.contacted,
              newSelfBooks: funnel.newSelfBooks,
              pct: funnel.newSelfBooks > 0 ? Math.round((funnel.contacted / funnel.newSelfBooks) * 100) : null,
            }
          : null,
    };
  });
}

export function outboundRows(rows: PersonRow[], records: BookingRecord[], rosters: RosterRef[]): OutboundBookingRow[] {
  const byId = new Map(rosters.map((r) => [r.rosterId, r]));
  // Every active booking-role setter gets a row, bookings or not — a new
  // setter's dials, sets and speed have nowhere to show otherwise.
  const present = new Set(rows.map((r) => r.id));
  const seeded: PersonRow[] = [
    ...rows,
    ...rosters.filter((r) => r.role === "booking" && r.active && !present.has(r.rosterId)).map((r) => ({ id: r.rosterId, name: r.name, tagged: 0, crmOnly: 0, claimed: 0, ...emptyTally() })),
  ];
  return seeded.map((row) => {
    const roster = byId.get(row.id);
    return {
      ...row,
      rosterId: row.id,
      active: roster?.active !== false,
      linked: !!roster?.crmUserId,
      ...moneyWhere(records, (r) => r.classification.lane === "outbound" && r.classification.creditRosterIds.includes(row.id)),
    };
  });
}

/**
 * DM rows come from configuration first (a person with no bookings still
 * shows), then any booking-link name nobody configured, flagged so the
 * manager can add it. Matching is case-insensitive on the link name.
 */
export function dmRows(rows: PersonRow[], records: BookingRecord[], people: DmPerson[]): DmRow[] {
  const rowByLink = new Map(rows.map((r) => [r.id.toLowerCase(), r]));
  const out: DmRow[] = [];
  const seen = new Set<string>();
  const money = (link: string) =>
    moneyWhere(records, (r) => r.classification.lane === "dm" && (r.classification.dmPerson ?? "no name on the link").toLowerCase() === link);
  for (const p of people) {
    const link = p.linkName.toLowerCase();
    seen.add(link);
    const r = rowByLink.get(link);
    out.push({
      linkName: link,
      name: p.name,
      configured: true,
      active: p.active,
      bookings: r?.bookings ?? 0,
      due: r?.due ?? 0,
      showed: r?.showed ?? 0,
      noShow: r?.noShow ?? 0,
      unknown: r?.unknown ?? 0,
      showRatePct: r?.showRatePct ?? null,
      ...money(link),
    });
  }
  for (const r of rows) {
    const link = r.id.toLowerCase();
    if (seen.has(link)) continue;
    out.push({ linkName: link, name: r.name, configured: false, active: true, bookings: r.bookings, due: r.due, showed: r.showed, noShow: r.noShow, unknown: r.unknown, showRatePct: r.showRatePct, ...money(link) });
  }
  return out;
}

export function confirmationRows(rows: ConfirmationRow[], records: BookingRecord[], rosters: RosterRef[]): ConfirmationBookingRow[] {
  const byId = new Map(rosters.map((r) => [r.rosterId, r]));
  return rows.map((row) => {
    const roster = byId.get(row.id);
    return {
      ...row,
      rosterId: row.id,
      active: roster?.active !== false,
      linked: !!roster?.crmUserId,
      ...moneyWhere(records, (r) => r.classification.lane === "confirmation" && r.classification.creditRosterIds.includes(row.id)),
    };
  });
}

/** The confirmation setter's first touch after each self-booking, in working hours. */
export function responseTimes(records: BookingRecord[], rosterId: string, hours: Hours): number[] {
  const out: number[] = [];
  for (const r of records) {
    if (r.isFollowUp || r.bookedAt === null || r.bookedAtInferred) continue;
    if (!r.classification.isFunnel || r.classification.lane === "outbound" || r.classification.lane === "dm") continue;
    const first = r.touches.filter((t) => t.rosterId === rosterId && t.afterBooking).sort((a, b) => a.at - b.at)[0];
    if (!first) continue;
    const ms = elapsedWorkingMsOrNull(r.bookedAt, first.at, hours);
    if (ms !== null) out.push(ms);
  }
  return out;
}
