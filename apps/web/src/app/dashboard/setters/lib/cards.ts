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

export type Format = "int" | "pct" | "money" | "hours" | "ratio" | "days";

export interface MetricVM {
  key: string;
  label: string;
  hint: string;
  measured: number | null;
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
}

const G = {
  dials: { label: "Dials", hint: "Outbound calls in Close, every attempt. Filed: dials." },
  connects: { label: "Connects", hint: "Answered calls at or over the team's connect threshold (settings). Filed: pick ups." },
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
  coverage: { label: "Coverage", hint: "Contacted over new self-books." },
  response: { label: "Response", hint: "Median working hours from the self-booking to the first touch." },
  confirmed: { label: "Confirmed", hint: "Filed only: said yes, they'll be there." },
} as const;

function metric(key: keyof typeof G, measured: number | null, format: Format, filed?: number | null): MetricVM {
  const drift = measured !== null && filed !== undefined && filed !== null && measured !== filed;
  return { key, label: G[key].label, hint: G[key].hint, measured, filed, format, drift };
}

const filedOr = (f: ActivityData["byRoster"][number]["filed"], pick: (f: NonNullable<ActivityData["byRoster"][number]["filed"]>) => number, reported = true): number | null =>
  f && reported ? pick(f) : null;

export function buildCards(
  bookings: BookingsData,
  sets: SetsData | null | undefined,
  activity: ActivityData | null | undefined,
  speed?: SpeedData | null,
  cadence?: CadenceData | null,
): Record<"dm" | "outbound" | "confirmation", CardVM[]> {
  const speedById = new Map((speed?.bySetter ?? []).map((s) => [s.rosterId, s]));
  const cadenceById = new Map((cadence?.bySetter ?? []).map((c) => [c.rosterId, c]));
  const setsById = new Map((sets?.outbound ?? []).map((s) => [s.rosterId, s]));
  const setsDm = new Map((sets?.dm ?? []).map((s) => [s.linkName, s.sets]));
  const setsConf = new Map((sets?.confirmation ?? []).map((s) => [s.rosterId, s]));
  const act = new Map((activity?.byRoster ?? []).map((a) => [a.rosterId, a]));

  const outbound: CardVM[] = bookings.outbound.map((row) => {
    const a = act.get(row.rosterId);
    const s = setsById.get(row.rosterId);
    const sp = speedById.get(row.rosterId);
    const cd = cadenceById.get(row.rosterId);
    const f = a?.filed ?? null;
    return {
      key: row.rosterId,
      rosterId: row.rosterId,
      dmLinkName: null,
      name: row.name,
      team: "outbound",
      active: row.active,
      linked: row.linked,
      configured: true,
      note: s ? `${s.tagged} by initials · ${s.crmOnly} from Close only` : null,
      metrics: [
        metric("dials", a?.dials ?? null, "int", filedOr(f, (x) => x.dials)),
        metric("connects", a?.answered ?? null, "int", filedOr(f, (x) => x.pickUps)),
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
      metrics: [
        metric("newSelfBooks", s ? s.newSelfBooks : null, "int", filedOr(f, (x) => x.newSelfBooked)),
        metric("contacted", s ? s.contacted : null, "int", filedOr(f, (x) => x.contacted)),
        metric("reached", s ? s.reached : null, "int", filedOr(f, (x) => x.reached)),
        metric("coverage", s ? s.coveragePct : null, "pct"),
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
