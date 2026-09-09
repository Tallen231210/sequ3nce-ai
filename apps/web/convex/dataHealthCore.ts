// ============================================================================
// Data health: how much of a week's bookings we can actually account for,
// and what is dragging that number down.
//
// The score is the share of due bookings where all three facts are known —
// where it came from (the booking link or a setter attached to it), who
// contacted it (a tag, Close activity, or a lead in Close saying nobody
// did), and whether the prospect showed (a logged outcome, the recording,
// or a post-call colour we watched change). Tyler's target: 90%. The drag
// lists are the inputs people control: tags, initials, recolouring, EODs.
//
// Pure. Fed by collectTeamBookings; benched in dataHealthBench.ts.
// ============================================================================

import { needsRecolor } from "./lib/calendarColorRules";
import { accuracyOf, type Accuracy, type RosterRef } from "./lib/setterTeamAttribution";
import type { BookingRecord } from "./setterTeamBookings";

export interface NamedCount {
  name: string;
  count: number;
}

export interface DataHealth {
  accuracy: Accuracy;
  lanes: { dm: number; outbound: number; confirmation: number; selfBookedUncontacted: number; unattributed: number };
  drags: {
    /** Self-booked funnel calls with no tag on the title, by closer. */
    untaggedSelfBooks: { total: number; byCloser: NamedCount[] };
    /** Outbound sets credited from Close activity only — the initials were missing, by setter. */
    missingInitials: { total: number; bySetter: NamedCount[] };
    /** Due bookings the closer never recoloured after the call, by closer. */
    notRecolored: { total: number; byCloser: NamedCount[] };
    /** Funnel bookings whose guest has no lead in Close. */
    leadMissing: number;
    /** Hand-made events with an outsider on them and nothing telling us who set them. */
    handMadeUntagged: number;
    /** The confirmation setter's unfiled working days this week. */
    eodMissed: Array<{ name: string; days: string[] }>;
  };
  followUps: number;
  bookings: number;
}

function tally(map: Map<string, number>, name: string): void {
  map.set(name, (map.get(name) ?? 0) + 1);
}

const sorted = (map: Map<string, number>): NamedCount[] =>
  Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

export function computeDataHealth(
  records: BookingRecord[],
  rosters: RosterRef[],
  eodDays: Array<{ rosterId: string; dayKey: string; filed: boolean }>,
): DataHealth {
  const sets = records.filter((r) => !r.isFollowUp);
  const nameOf = new Map(rosters.map((r) => [r.rosterId, r.name]));
  const lanes = { dm: 0, outbound: 0, confirmation: 0, selfBookedUncontacted: 0, unattributed: 0 };
  const untagged = new Map<string, number>();
  const missingInitials = new Map<string, number>();
  const notRecolored = new Map<string, number>();
  let leadMissing = 0;
  let handMadeUntagged = 0;

  for (const r of sets) {
    const c = r.classification;
    if (c.lane === "dm") lanes.dm += 1;
    else if (c.lane === "outbound") lanes.outbound += 1;
    else if (c.lane === "confirmation") lanes.confirmation += 1;
    else if (c.lane === "self_booked_uncontacted") lanes.selfBookedUncontacted += 1;
    else lanes.unattributed += 1;

    if (c.isFunnel && r.token === null) tally(untagged, r.closerName);
    if (c.lane === "outbound" && c.attributedBy === "crm_activity") {
      for (const id of c.creditRosterIds) tally(missingInitials, nameOf.get(id) ?? "setter");
    }
    if (c.isFunnel && !r.leadContactId) leadMissing += 1;
    if (r.eventName === null && c.lane === "unattributed") handMadeUntagged += 1;
  }
  for (const r of records) {
    if (r.verdict.due && needsRecolor(r.recolor)) tally(notRecolored, r.closerName);
  }

  const missedByRoster = new Map<string, string[]>();
  for (const d of eodDays) {
    if (d.filed) continue;
    const list = missedByRoster.get(d.rosterId) ?? [];
    list.push(d.dayKey);
    missedByRoster.set(d.rosterId, list);
  }

  return {
    accuracy: accuracyOf(sets.map((r) => ({ sourceKnown: r.classification.sourceKnown, contactKnown: r.classification.contactKnown, verdict: r.verdict }))),
    lanes,
    drags: {
      untaggedSelfBooks: { total: Array.from(untagged.values()).reduce((a, b) => a + b, 0), byCloser: sorted(untagged) },
      missingInitials: { total: Array.from(missingInitials.values()).reduce((a, b) => a + b, 0), bySetter: sorted(missingInitials) },
      notRecolored: { total: Array.from(notRecolored.values()).reduce((a, b) => a + b, 0), byCloser: sorted(notRecolored) },
      leadMissing,
      handMadeUntagged,
      eodMissed: Array.from(missedByRoster.entries()).map(([rosterId, days]) => ({ name: nameOf.get(rosterId) ?? "setter", days: days.sort() })),
    },
    followUps: records.length - sets.length,
    bookings: sets.length,
  };
}

/** "YYYY-MM-DD" arithmetic on day keys — the key IS the day, no timezone games. */
export function addDaysKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The Monday on or before a day key. */
export function weekStartKeyFor(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDaysKey(dayKey, -((dow + 6) % 7));
}

/** Mon..Sat of a week — the days a confirmation setter is expected to file. */
export function workingDaysOfWeek(weekStartKey: string, untilKey: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const k = addDaysKey(weekStartKey, i);
    if (k > untilKey) break;
    out.push(k);
  }
  return out;
}
