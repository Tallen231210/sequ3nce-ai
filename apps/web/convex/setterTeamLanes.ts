// ============================================================================
// From booking records to what the Setter Data tab shows: one column per lane
// to compare DM, outbound, Sophie and the untouched self-books; one row per
// person inside each lane; and the per-booking evidence for the drill.
//
// Pure. Sets exclude follow-up calls (a second call is not a new set); show
// rate is showed over showed-plus-no-show, so unknowns never drag it. A
// booking credited to two setters (an ambiguous tag) appears in both rows and
// once in the lane total.
// ============================================================================

import { recolorStateLabel } from "./lib/calendarColorRules";
import type { RosterRef, SetterLane, Verdict } from "./lib/setterTeamAttribution";
import type { BookingRecord } from "./setterTeamBookings";

export interface Tally {
  bookings: number;
  due: number;
  showed: number;
  noShow: number;
  rescheduled: number;
  unknown: number;
  showRatePct: number | null;
}

export interface LaneTotals extends Tally {
  lane: SetterLane;
  label: string;
}

export interface PersonRow extends Tally {
  id: string;
  name: string;
  /** Sets whose credit came from the title tag vs from Close activity only. */
  tagged: number;
  crmOnly: number;
}

export interface ConfirmationRow extends PersonRow {
  newSelfBooks: number;
  contacted: number;
  reached: number;
  coveragePct: number | null;
}

export interface DrillTouch {
  name: string;
  kind: "dial" | "sms";
  at: number;
  reached: boolean;
}

export interface DrillRecord {
  key: string;
  startTime: number;
  dayKey: string;
  closerName: string;
  title: string;
  eventName: string | null;
  lane: SetterLane;
  attributedBy: string;
  credit: string[];
  dmPerson: string | null;
  token: string | null;
  touches: DrillTouch[];
  verdict: Verdict;
  colour: string;
  leadInClose: boolean;
  isFollowUp: boolean;
}

export interface SetterTeamsView {
  comparison: LaneTotals[];
  dm: PersonRow[];
  outbound: PersonRow[];
  confirmation: ConfirmationRow[];
  selfBookedUncontacted: PersonRow[];
  unattributed: PersonRow[];
  funnel: { newSelfBooks: number; contacted: number; uncontacted: number; leadMissing: number };
  followUpsExcluded: number;
  records: DrillRecord[];
}

const LANE_LABEL: Record<SetterLane, string> = {
  dm: "DM setters",
  outbound: "Outbound setters",
  confirmation: "Confirmation (self-booked, contacted)",
  self_booked_uncontacted: "Self-booked, not contacted",
  unattributed: "Needs a look",
};
const LANE_ORDER: SetterLane[] = ["dm", "outbound", "confirmation", "self_booked_uncontacted", "unattributed"];

const emptyTally = (): Tally => ({ bookings: 0, due: 0, showed: 0, noShow: 0, rescheduled: 0, unknown: 0, showRatePct: null });

function add(t: Tally, r: BookingRecord): void {
  t.bookings += 1;
  if (!r.verdict.due) return;
  t.due += 1;
  if (r.verdict.result === "showed") t.showed += 1;
  else if (r.verdict.result === "no_show") t.noShow += 1;
  else if (r.verdict.result === "rescheduled") t.rescheduled += 1;
  else t.unknown += 1;
}

function finish<T extends Tally>(t: T): T {
  const known = t.showed + t.noShow;
  t.showRatePct = known > 0 ? Math.round((t.showed / known) * 100) : null;
  return t;
}

function rowFor(map: Map<string, PersonRow>, id: string, name: string): PersonRow {
  let row = map.get(id);
  if (!row) {
    row = { id, name, tagged: 0, crmOnly: 0, ...emptyTally() };
    map.set(id, row);
  }
  return row;
}

const sortRows = <T extends PersonRow>(rows: Map<string, T>): T[] =>
  Array.from(rows.values())
    .map(finish)
    .sort((a, b) => b.bookings - a.bookings || a.name.localeCompare(b.name));

export function buildSetterTeamsView(all: BookingRecord[], rosters: RosterRef[]): SetterTeamsView {
  const nameOf = new Map(rosters.map((r) => [r.rosterId, r.name]));
  const records = all.filter((r) => !r.isFollowUp);

  const lanes = new Map<SetterLane, LaneTotals>(
    LANE_ORDER.map((lane) => [lane, { lane, label: LANE_LABEL[lane], ...emptyTally() }]),
  );
  const dm = new Map<string, PersonRow>();
  const outbound = new Map<string, PersonRow>();
  const uncontacted = new Map<string, PersonRow>();
  const unattributed = new Map<string, PersonRow>();
  const confirmation = new Map<string, ConfirmationRow>();
  for (const r of rosters) {
    if (r.role === "confirmation") {
      confirmation.set(r.rosterId, {
        id: r.rosterId,
        name: r.name,
        tagged: 0,
        crmOnly: 0,
        newSelfBooks: 0,
        contacted: 0,
        reached: 0,
        coveragePct: null,
        ...emptyTally(),
      });
    }
  }
  let funnelNew = 0;
  let funnelContacted = 0;
  let funnelUncontacted = 0;
  let funnelLeadMissing = 0;

  for (const r of records) {
    const c = r.classification;
    add(lanes.get(c.lane)!, r);
    const credit = (row: PersonRow) => {
      add(row, r);
      if (c.attributedBy === "tag") row.tagged += 1;
      if (c.attributedBy === "crm_activity") row.crmOnly += 1;
    };
    if (c.lane === "dm") {
      const person = c.dmPerson ?? "no name on the link";
      credit(rowFor(dm, person, person));
    } else if (c.lane === "outbound") {
      for (const id of c.creditRosterIds) credit(rowFor(outbound, id, nameOf.get(id) ?? "setter"));
    } else if (c.lane === "self_booked_uncontacted") {
      credit(rowFor(uncontacted, r.closerId, r.closerName));
    } else if (c.lane === "unattributed") {
      const reason = unattributedReason(r);
      credit(rowFor(unattributed, reason, reason));
    }
    if (c.isFunnel && c.lane !== "outbound" && c.lane !== "dm") {
      funnelNew += 1;
      if (c.lane === "confirmation") funnelContacted += 1;
      else if (c.lane === "self_booked_uncontacted") funnelUncontacted += 1;
      else if (!r.leadContactId) funnelLeadMissing += 1;
      for (const row of confirmation.values()) {
        row.newSelfBooks += 1;
        if (c.lane === "confirmation" && c.creditRosterIds.includes(row.id)) {
          credit(row);
          const hers = r.touches.filter((t) => t.rosterId === row.id && t.afterBooking);
          if (hers.length > 0 || c.attributedBy === "tag") row.contacted += 1;
          if (hers.some((t) => t.reached)) row.reached += 1;
        }
      }
    }
  }
  for (const row of confirmation.values()) {
    row.coveragePct = row.newSelfBooks > 0 ? Math.round((row.contacted / row.newSelfBooks) * 100) : null;
  }

  return {
    comparison: LANE_ORDER.map((lane) => finish(lanes.get(lane)!)),
    dm: sortRows(dm),
    outbound: sortRows(outbound),
    confirmation: sortRows(confirmation),
    selfBookedUncontacted: sortRows(uncontacted),
    unattributed: sortRows(unattributed),
    funnel: { newSelfBooks: funnelNew, contacted: funnelContacted, uncontacted: funnelUncontacted, leadMissing: funnelLeadMissing },
    followUpsExcluded: all.length - records.length,
    records: all.map((r) => toDrill(r, nameOf)),
  };
}

function unattributedReason(r: BookingRecord): string {
  if (r.classification.isFunnel && !r.leadContactId) return "Funnel booking, lead not in Close";
  if (r.classification.isFunnel) return "Funnel booking touched by someone off the roster";
  if (r.eventName === null) return "No booking link, no tag, no Close touch";
  return "Booking link not in the team's word lists";
}

function toDrill(r: BookingRecord, nameOf: Map<string, string>): DrillRecord {
  return {
    key: r.key,
    startTime: r.startTime,
    dayKey: r.dayKey,
    closerName: r.closerName,
    title: r.displayTitle,
    eventName: r.eventName,
    lane: r.classification.lane,
    attributedBy: r.classification.attributedBy,
    credit: r.classification.creditRosterIds.map((id) => nameOf.get(id) ?? "setter"),
    dmPerson: r.classification.dmPerson,
    token: r.token,
    touches: r.touches.map((t) => ({
      name: (t.rosterId && nameOf.get(t.rosterId)) || "CRM user",
      kind: t.kind,
      at: t.at,
      reached: t.reached,
    })),
    verdict: r.verdict,
    colour: recolorStateLabel(r.recolor, r.colorId ?? undefined),
    leadInClose: r.leadContactId !== null,
    isFollowUp: r.isFollowUp,
  };
}
