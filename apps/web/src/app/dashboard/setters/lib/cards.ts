// ============================================================================
// Card view-models: the three page subscriptions merged per person. Every
// metric carries the measured number and, where the setter files one, the
// filed number, so the card can show both and mark the drift. Pure.
// ============================================================================

import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../../../convex/_generated/api";

export type BookingsData = NonNullable<FunctionReturnType<typeof api.settersPageQueries.getSettersBookings>>;
export type SetsData = NonNullable<FunctionReturnType<typeof api.settersPageQueries.getSettersSets>>;
export type ActivityData = NonNullable<FunctionReturnType<typeof api.settersPageQueries.getSettersActivity>>;
export type SpeedData = NonNullable<FunctionReturnType<typeof api.settersPageQueries.getSettersSpeed>>;
export type CadenceData = NonNullable<FunctionReturnType<typeof api.settersPageQueries.getSettersCadence>>;
export type CrossCheckData = NonNullable<FunctionReturnType<typeof api.setterEodCrossCheck.getSettersCrossCheck>>;
export type RosterCheck = CrossCheckData["byRoster"][number];

export type Format = "int" | "pct" | "money" | "hours" | "ratio" | "days";

export interface MetricVM {
  key: string;
  label: string;
  hint: string;
  measured: number | null;
  /** A small line under the value — the count behind a percentage, for instance "41 of 62". */
  detail?: string | null;
  /** What the setter typed on their EOD for the same range; undefined when the form has no such box. */
  filed?: number | null;
  format: Format;
  /** Measured and filed both known and different. */
  drift: boolean;
}

export interface CardVM {
  key: string;
  rosterId: string | null;
  dmLinkName: string | null;
  name: string;
  team: "dm" | "outbound" | "confirmation";
  active: boolean;
  linked: boolean;
  configured: boolean;
  note: string | null;
  metrics: MetricVM[];
  /** EOD filing over the range: days owed, days filed, days whose numbers sat outside tolerance of Close / the calendar. Null for DM setters and while loading. */
  consistency: { daysDue: number; daysFiled: number; daysFlagged: number; flagCount: number } | null;
}

const G = {
  dials: { label: "Dials", hint: "Outbound calls in Close, every attempt. Filed: dials." },
  connects: { label: "Connects", hint: "Answered calls at or over the team's connect threshold (settings). Filed: pick ups." },
  held90: { label: "Held 90s+", hint: "Of their connects, the share that ran past 90 seconds — a sign they can keep someone talking once they have them. Counts every day in the range, filed or not." },
  texts: { label: "Texts", hint: "Outbound texts sent in Close." },
  sets: { label: "Sets", hint: "Bookings made in the range credited to the setter. Filed: sets." },
  onCal: { label: "On calendar", hint: "Credited bookings whose call falls in the range. Filed: calls on the calendar." },
  shown: { label: "Shown", hint: "Of those, showed — a closer's form, a recording with the prospect, or a colour change we watched. Filed: calls shown." },
  noShow: { label: "No-show", hint: "Proven no-shows." },
  unknown: { label: "Unknown", hint: "No evidence yet either way. Counted, never assumed." },
  showRate: { label: "Show rate", hint: "Showed over showed plus no-show." },
  closes: { label: "Closes", hint: "Taken calls a closer logged as closed, follow-ups included. Filed: calls closed." },
  cash: { label: "Cash", hint: "Cash collected on those closes. Filed: cash collected." },
  speed: { label: "Speed (working hours)", hint: "Median time from a lead's arrival to this setter's first touch, counting working hours only — nights and weekends don't count against them. Self-booked leads excluded." },
  speedClock: { label: "Speed (incl. nights & weekends)", hint: "The same leads with the clock left running — what the prospect actually waited." },
  dialsPerLead: { label: "Dials / lead", hint: "Dials over leads dialled in the range. Cadence." },
  threePlus: { label: "3+ attempts", hint: "Share of leads dialled three or more times." },
  pursuit: { label: "Days pursued", hint: "Median days from first to last dial, for leads dialled at least twice." },
  bookings: { label: "Bookings", hint: "Bookings whose call falls in the range, credited by the booking link." },
  newSelfBooks: { label: "Self-books", hint: "Self-booked funnel calls made in the range. Filed: new self-booked calls." },
  contacted: { label: "Contacted", hint: "Of those, called or texted after the booking, or tagged. Filed: contacted." },
  reached: { label: "Reached", hint: "Of those, a connect or a reply. Filed: reached." },
  coverage: { label: "Coverage", hint: "Contacted over ALL new self-books — covering them is the job. The line under it says who else worked some of them." },
  response: { label: "Response", hint: "Median working hours from the self-booking to the first touch." },
  confirmed: { label: "Confirmed", hint: "Filed only: said yes, they'll be there." },
} as const;

function metric(key: keyof typeof G, measured: number | null, format: Format, filed?: number | null, detail?: string | null): MetricVM {
  const drift = measured !== null && filed !== undefined && filed !== null && measured !== filed;
  return { key, label: G[key].label, hint: G[key].hint, measured, filed, format, drift, detail };
}

/** The call length a "held" connect has to reach. */
const HELD_SEC = 90;

/** Of a setter's connects over the whole range, how many ran past HELD_SEC — from the ladder the cross-check carries per day. */
function heldOf(checks: CrossCheckData | null | undefined, rosterId: string): { pct: number | null; detail: string | null } {
  const r = checks?.byRoster.find((c) => c.rosterId === rosterId);
  if (!checks || !r) return { pct: null, detail: null };
  const iHeld = checks.ladderThresholds.indexOf(HELD_SEC);
  const iConnect = checks.ladderThresholds.indexOf(checks.connectSec);
  if (iHeld < 0 || iConnect < 0) return { pct: null, detail: null };
  let held = 0;
  let connects = 0;
  for (const d of r.days) {
    if (!d.ladder) continue;
    held += d.ladder.counts[iHeld] ?? 0;
    connects += d.ladder.counts[iConnect] ?? 0;
  }
  if (connects === 0) return { pct: null, detail: "no connects" };
  return { pct: Math.round((held / connects) * 100), detail: `${held} of ${connects}` };
}

const filedOr = (f: ActivityData["byRoster"][number]["filed"], pick: (f: NonNullable<ActivityData["byRoster"][number]["filed"]>) => number, reported = true): number | null =>
  f && reported ? pick(f) : null;

export function buildCards(
  bookings: BookingsData,
  sets: SetsData | null | undefined,
  activity: ActivityData | null | undefined,
  speed?: SpeedData | null,
  cadence?: CadenceData | null,
  checks?: CrossCheckData | null,
): Record<"dm" | "outbound" | "confirmation", CardVM[]> {
  const speedById = new Map((speed?.bySetter ?? []).map((s) => [s.rosterId, s]));
  const checkById = new Map((checks?.byRoster ?? []).map((c) => [c.rosterId, c]));
  const consistencyOf = (rosterId: string): CardVM["consistency"] => {
    const c = checkById.get(rosterId);
    return c ? { daysDue: c.daysDue, daysFiled: c.daysFiled, daysFlagged: c.daysFlagged, flagCount: c.flagCount } : null;
  };
  const cadenceById = new Map((cadence?.bySetter ?? []).map((c) => [c.rosterId, c]));
  const setsById = new Map((sets?.outbound ?? []).map((s) => [s.rosterId, s]));
  const setsDm = new Map((sets?.dm ?? []).map((s) => [s.linkName, s.sets]));
  const setsConf = new Map((sets?.confirmation ?? []).map((s) => [s.rosterId, s]));
  const act = new Map((activity?.byRoster ?? []).map((a) => [a.rosterId, a]));
  // Unlabeled bookings (by call date) each roster setter touched — the ones they can claim.
  const unlabeledTouched = new Map<string, number>();
  for (const r of bookings.records) {
    if (r.isFollowUp || r.lane !== "unattributed") continue;
    for (const id of new Set(r.touches.map((t) => t.rosterId).filter((id): id is string => id !== null))) unlabeledTouched.set(id, (unlabeledTouched.get(id) ?? 0) + 1);
  }

  const outbound: CardVM[] = bookings.outbound.map((row) => {
    const a = act.get(row.rosterId);
    const s = setsById.get(row.rosterId);
    const sp = speedById.get(row.rosterId);
    const cd = cadenceById.get(row.rosterId);
    const f = a?.filed ?? null;
    const held = heldOf(checks, row.rosterId);
    return {
      key: row.rosterId,
      rosterId: row.rosterId,
      dmLinkName: null,
      name: row.name,
      team: "outbound",
      active: row.active,
      linked: row.linked,
      configured: true,
      note: s
        ? [`${s.tagged} by initials`, s.claimed > 0 ? `${s.claimed} claimed` : null, s.crmOnly > 0 ? `${s.crmOnly} from Close only` : null, unlabeledTouched.get(row.rosterId) ? `${unlabeledTouched.get(row.rosterId)} unlabeled they touched` : null]
            .filter((x): x is string => x !== null)
            .join(" · ")
        : null,
      consistency: consistencyOf(row.rosterId),
      metrics: [
        metric("dials", a?.dials ?? null, "int", filedOr(f, (x) => x.dials)),
        metric("connects", a?.answered ?? null, "int", filedOr(f, (x) => x.pickUps)),
        metric("held90", held.pct, "pct", undefined, held.detail),
        metric("texts", a?.texts ?? null, "int"),
        metric("sets", s ? s.sets : null, "int", filedOr(f, (x) => x.sets)),
        metric("onCal", row.bookings, "int", filedOr(f, (x) => x.callsOnCalendar)),
        metric("shown", row.showed, "int", filedOr(f, (x) => x.callsShown)),
        metric("noShow", row.noShow, "int"),
        metric("unknown", row.unknown, "int"),
        metric("showRate", row.showRatePct, "pct"),
        metric("closes", row.closes, "int", filedOr(f, (x) => x.callsClosed)),
        metric("cash", row.cash, "money", filedOr(f, (x) => x.cashCollected, f?.cashReported ?? false)),
        metric("speed", sp?.medianWorkingMs ?? null, "hours"),
        metric("speedClock", sp?.medianElapsedMs ?? null, "hours"),
        metric("dialsPerLead", cd?.dialsPerLead ?? null, "ratio"),
        metric("threePlus", cd?.threePlusPct ?? null, "pct"),
        metric("pursuit", cd?.medianPursuitDays ?? null, "days"),
      ],
    };
  });

  const dm: CardVM[] = bookings.dm.map((row) => ({
    key: `dm:${row.linkName}`,
    rosterId: null,
    dmLinkName: row.linkName,
    name: row.name,
    team: "dm",
    active: row.active,
    linked: true,
    configured: row.configured,
    note: row.configured ? null : "Seen on a booking link but not in the roster settings",
    consistency: null,
    metrics: [
      metric("sets", setsDm.get(row.linkName) ?? (sets ? 0 : null), "int"),
      metric("bookings", row.bookings, "int"),
      metric("shown", row.showed, "int"),
      metric("noShow", row.noShow, "int"),
      metric("unknown", row.unknown, "int"),
      metric("showRate", row.showRatePct, "pct"),
      metric("closes", row.closes, "int"),
      metric("cash", row.cash, "money"),
    ],
  }));

  const confirmation: CardVM[] = bookings.confirmation.map((row) => {
    const a = act.get(row.rosterId);
    const s = setsConf.get(row.rosterId);
    const f = a?.filed ?? null;
    return {
      key: row.rosterId,
      rosterId: row.rosterId,
      dmLinkName: null,
      name: row.name,
      team: "confirmation",
      active: row.active,
      linked: row.linked,
      configured: true,
      note: null,
      consistency: consistencyOf(row.rosterId),
      metrics: [
        metric("newSelfBooks", s ? s.newSelfBooks : null, "int", filedOr(f, (x) => x.newSelfBooked)),
        metric("contacted", s ? s.contacted : null, "int", filedOr(f, (x) => x.contacted)),
        metric("reached", s ? s.reached : null, "int", filedOr(f, (x) => x.reached)),
        metric("coverage", s ? s.coveragePct : null, "pct", undefined, s ? `${s.contacted} of ${s.newSelfBooks}${s.workedByOutbound > 0 ? ` · ${s.workedByOutbound} worked by outbound setters` : ""}${s.nobody > 0 ? ` · ${s.nobody} by nobody` : ""}` : null),
        metric("response", s ? s.responseMedianWorkingMs : null, "hours"),
        metric("confirmed", null, "int", filedOr(f, (x) => x.confirmed)),
        metric("onCal", row.bookings, "int", filedOr(f, (x) => x.confirmedOnCalendar)),
        metric("shown", row.showed, "int", filedOr(f, (x) => x.confirmedShowed)),
        metric("noShow", row.noShow, "int"),
        metric("unknown", row.unknown, "int"),
        metric("showRate", row.showRatePct, "pct"),
        metric("closes", row.closes, "int"),
        metric("cash", row.cash, "money"),
      ],
    };
  });

  return { dm, outbound, confirmation };
}
