// Fictional team, fictional people. Typed against the real query returns so
// the preview breaks the moment a shape drifts.

import type { ActivityData, BookingsData, CadenceData, CrossCheckData, SetsData, SpeedData } from "../dashboard/setters/lib/cards";
import { crossCheckDay, DEFAULT_TOLERANCES, type FiledDay, type MeasuredDay } from "../../../convex/lib/eodCrossCheck";

const H = 60 * 60 * 1000;
const D = 24 * H;
const NOW = Date.parse("2026-09-09T20:00:00Z");
const tally = (bookings: number, showed: number, noShow: number) => ({
  bookings,
  due: bookings,
  showed,
  noShow,
  rescheduled: 0,
  unknown: bookings - showed - noShow,
  showRatePct: showed + noShow >= bookings / 2 ? Math.round((showed / (showed + noShow)) * 100) : null,
  outcomeKnown: showed + noShow,
});
const money = (closes: number, cash: number) => ({ closes, cash });

const rec = (
  key: string,
  title: string,
  lane: BookingsData["records"][number]["lane"],
  daysAgo: number,
  credit: string[],
  creditIds: string[],
  verdict: BookingsData["records"][number]["verdict"]["result"],
  extra: Partial<BookingsData["records"][number]> = {},
): BookingsData["records"][number] => ({
  key,
  startTime: NOW - daysAgo * D,
  dayKey: new Date(NOW - daysAgo * D).toISOString().slice(0, 10),
  bookedDayKey: new Date(NOW - (daysAgo + 1) * D).toISOString().slice(0, 10),
  bookedAtInferred: false,
  closerName: "Jonah Abel",
  title,
  eventName: lane === "dm" ? "Instagram (Dario)" : "Facebook",
  lane,
  reason: null,
  attributedBy: lane === "dm" ? "event_name" : "tag",
  credit,
  creditIds,
  dmPerson: lane === "dm" ? "Dario" : null,
  token: lane === "outbound" ? "e" : lane === "confirmation" ? "s" : null,
  touches: [],
  verdict: { result: verdict, source: verdict === "unknown" ? null : "recording", due: true },
  colour: "showed — set after the call",
  leadInClose: true,
  isFollowUp: false,
  closed: false,
  cash: 0,
  isFunnel: lane !== "dm",
  recorded: verdict !== "unknown",
  claim: null,
  ...extra,
});

export const BOOKINGS: BookingsData = {
  range: { startMs: NOW - 7 * D, endMs: NOW, timezone: "America/New_York" },
  rangeClampedToDays: undefined,
  truncated: [],
  labels: { dm: "DM setters", outbound: "Outbound setters", confirmation: "Confirmation setters", unlabeled: "Unlabeled" },
  basis: "9:00–17:00, 5 days a week, America/New_York",
  strip: [
    { team: "dm", label: "DM setters", ...tally(29, 13, 10), ...money(3, 14_500), coverage: null },
    { team: "outbound", label: "Outbound setters", ...tally(58, 26, 20), ...money(6, 31_000), coverage: null },
    { team: "confirmation", label: "Confirmation setters", ...tally(65, 29, 23), ...money(5, 22_800), coverage: { contacted: 64, newSelfBooks: 77, pct: 83 } },
    { team: "unlabeled", label: "Unlabeled", ...tally(3, 1, 1), ...money(0, 0), coverage: null },
  ],
  outbound: [
    { id: "r-ezra", rosterId: "r-ezra", name: "Ezra", active: true, linked: true, ...tally(35, 16, 12), tagged: 27, crmOnly: 8, claimed: 0, ...money(4, 19_000) },
    { id: "r-ivan", rosterId: "r-ivan", name: "Ivan", active: true, linked: true, ...tally(15, 7, 5), tagged: 15, crmOnly: 0, claimed: 0, ...money(1, 6_000) },
    { id: "r-max", rosterId: "r-max", name: "Max", active: true, linked: false, ...tally(6, 3, 2), tagged: 6, crmOnly: 0, claimed: 0, ...money(1, 6_000) },
    { id: "r-miles", rosterId: "r-miles", name: "Miles", active: true, linked: true, ...tally(2, 0, 1), tagged: 2, crmOnly: 0, claimed: 0, ...money(0, 0) },
  ],
  dm: [
    { linkName: "dario", name: "Dario", configured: true, active: true, ...tally(12, 5, 4), ...money(1, 5_000) },
    { linkName: "luka", name: "Luka", configured: true, active: true, ...tally(9, 4, 3), ...money(2, 9_500) },
    { linkName: "no name on the link", name: "no name on the link", configured: false, active: true, ...tally(8, 4, 3), ...money(0, 0) },
  ],
  confirmation: [
    { id: "r-sasha", rosterId: "r-sasha", name: "Sasha", active: true, linked: true, ...tally(65, 29, 23), tagged: 58, crmOnly: 6, claimed: 0, newSelfBooks: 77, contacted: 64, reached: 22, coveragePct: 83, ...money(5, 22_800), responseMedianWorkingMs: 1.4 * H },
  ],
  selfBookedUncontacted: [],
  unattributed: [],
  notASet: [],
  followUpsExcluded: 6,
  records: [
    rec("b1", "Elena and Jonah", "outbound", 1, ["Ezra"], ["r-ezra"], "showed", { closed: true, cash: 5_000, touches: [{ name: "Ezra", rosterId: "r-ezra", kind: "dial", at: NOW - 3 * D, reached: true, afterBooking: false }] }),
    rec("b2", "Nia and Jonah", "outbound", 2, ["Ezra"], ["r-ezra"], "no_show", { attributedBy: "crm_activity", token: null, touches: [{ name: "Ezra", rosterId: "r-ezra", kind: "sms", at: NOW - 4 * D, reached: false, afterBooking: false }] }),
    rec("b3", "Omar and Bea", "outbound", 3, ["Ezra"], ["r-ezra"], "unknown"),
    rec("b4", "Priya and Bea", "dm", 1, [], [], "showed"),
    rec("b5", "Theo and Kai", "confirmation", 2, ["Sasha"], ["r-sasha"], "showed", { touches: [{ name: "Sasha", rosterId: "r-sasha", kind: "dial", at: NOW - 3 * D + 2 * H, reached: true, afterBooking: true }] }),
    rec("u1", "Maya and Jonah", "unattributed", 1, [], [], "showed", { attributedBy: "none", token: null, reason: "Self-booked; contacted only by an outbound setter, no initials", touches: [{ name: "Ezra", rosterId: "r-ezra", kind: "dial", at: NOW - 2 * D + 3 * H, reached: true, afterBooking: true }] }),
    rec("u2", "Ben and Bea", "unattributed", 2, [], [], "unknown", { attributedBy: "none", token: null, eventName: null, isFunnel: false, reason: "No booking link, no tag, no outbound setter in Close", touches: [{ name: "Ivan", rosterId: "r-ivan", kind: "sms", at: NOW - 5 * D, reached: false, afterBooking: false }] }),
    rec("u3", "Lena and Kai", "unattributed", 3, [], [], "no_show", { attributedBy: "none", token: null, eventName: null, isFunnel: false, reason: "No booking link, no tag, no outbound setter in Close", touches: [] }),
    rec("c1", "Ravi and Jonah", "outbound", 4, ["Ezra"], ["r-ezra"], "showed", { attributedBy: "claim", token: null, claim: { rosterId: "r-ezra", claimedAt: NOW - D, byRosterId: "r-ezra", byClerkId: null } }),
  ],
  coverage: [
    "Leads per setter and set rate per lead aren't shown: Close doesn't sync a lead owner.",
    "Funnel by source, pipeline stages, ad attribution and pre-call qualification aren't available for this CRM.",
    "Text replies count per lead, in the drawer — the cards count answered calls only.",
  ],
};

export const SETS: SetsData = {
  range: { startMs: NOW - 7 * D, endMs: NOW },
  truncated: [],
  outbound: [
    { rosterId: "r-ezra", sets: 41, tagged: 23, crmOnly: 18, claimed: 0 },
    { rosterId: "r-ivan", sets: 12, tagged: 12, crmOnly: 0, claimed: 0 },
    { rosterId: "r-max", sets: 3, tagged: 3, crmOnly: 0, claimed: 0 },
    { rosterId: "r-miles", sets: 4, tagged: 4, crmOnly: 0, claimed: 0 },
  ],
  confirmation: [{ rosterId: "r-sasha", newSelfBooks: 95, contacted: 77, reached: 22, coveragePct: 81, workedByOutbound: 6, contactedByOthers: 4, nobody: 8, leadMissing: 0, responseMedianWorkingMs: 1.4 * H }],
  dm: [
    { linkName: "dario", sets: 14 },
    { linkName: "luka", sets: 10 },
  ],
  cohort: 137,
};

const filed = (o: Partial<NonNullable<ActivityData["byRoster"][number]["filed"]>>): NonNullable<ActivityData["byRoster"][number]["filed"]> => ({
  days: 7, dials: 0, pickUps: 0, sets: 0, callsOnCalendar: 0, callsShown: 0, callsClosed: 0, cashCollected: 0, cashReported: false,
  newSelfBooked: 0, contacted: 0, reached: 0, confirmed: 0, confirmedOnCalendar: 0, confirmedShowed: 0,
  // The preview's setters filed every field their form carries.
  reported: {
    callsOnCalendar: true, callsShown: true, callsClosed: true, cashCollected: true, newSelfBooked: true,
    contacted: true, reached: true, confirmed: true, confirmedOnCalendar: true, confirmedShowed: true,
  },
  ...o,
});
const speed = (medianH: number | null, count: number, noArrival: number) => ({
  count, medianWorkingMs: medianH === null ? null : medianH * H, p90WorkingMs: medianH === null ? null : medianH * 3 * H, medianElapsedMs: medianH === null ? null : medianH * 4 * H,
  noArrivalCount: noArrival, neverContactedCount: 2, untimedCount: 0, selfBookedCount: 4, clippedCount: 0, unreadCount: 0,
});

export const SPEED: SpeedData = {
  range: { startMs: NOW - 7 * D, endMs: NOW },
  basis: "9:00–17:00, 5 days a week, America/New_York",
  truncated: [],
  bySetter: [
    { rosterId: "r-ezra", ...speed(2.1, 41, 9) },
    { rosterId: "r-ivan", ...speed(0.4, 12, 3) },
    { rosterId: "r-miles", ...speed(null, 0, 1) },
  ],
  team: { leads: 180, selfBooked: 95, neverContacted: 22, noArrival: 13, unread: 0 },
};

export const CADENCE: CadenceData = {
  range: { startMs: NOW - 7 * D, endMs: NOW },
  connectSec: 60,
  truncated: [],
  bySetter: [
    { rosterId: "r-ezra", dials: 1_230, leadsDialled: 312, dialsPerLead: 3.9, threePlusPct: 56, medianPursuitDays: 2.1, leadsAnswered: 88, truncated: false },
    { rosterId: "r-ivan", dials: 1_635, leadsDialled: 501, dialsPerLead: 3.3, threePlusPct: 41, medianPursuitDays: 0.8, leadsAnswered: 66, truncated: false },
    { rosterId: "r-miles", dials: 337, leadsDialled: 190, dialsPerLead: 1.8, threePlusPct: 12, medianPursuitDays: 0.3, leadsAnswered: 11, truncated: false },
  ],
};

export const ACTIVITY: ActivityData = {
  range: { startMs: NOW - 7 * D, endMs: NOW, timezone: "America/New_York" },
  rollupsReady: true,
  connectSec: 60,
  byRoster: [
    { rosterId: "r-ezra", name: "Ezra", role: "booking", linked: true, dials: 1_230, answered: 98, texts: 310, filed: filed({ dials: 1_150, pickUps: 98, sets: 29, callsOnCalendar: 38, callsShown: 28, callsClosed: 4, cashCollected: 19_000, cashReported: true }) },
    { rosterId: "r-ivan", name: "Ivan", role: "booking", linked: true, dials: 1_635, answered: 71, texts: 120, filed: filed({ dials: 1_604, pickUps: 92, sets: 13, callsOnCalendar: 13, callsShown: 5, callsClosed: 1, cashCollected: 6_000, cashReported: true }) },
    { rosterId: "r-max", name: "Max", role: "booking", linked: false, dials: null, answered: null, texts: null, filed: filed({ days: 3, dials: 355, pickUps: 28, sets: 4, callsOnCalendar: 2, callsShown: 2 }) },
    { rosterId: "r-miles", name: "Miles", role: "booking", linked: true, dials: 337, answered: 12, texts: 40, filed: filed({ days: 1, dials: 99, pickUps: 6, sets: 0 }) },
    { rosterId: "r-sasha", name: "Sasha", role: "confirmation", linked: true, dials: 233, answered: 40, texts: 405, filed: filed({ days: 5, newSelfBooked: 95, contacted: 80, reached: 22, confirmed: 41, confirmedOnCalendar: 64, confirmedShowed: 29 }) },
  ],
  unattributedDials: 1_410,
  otherUsersDials: 81,
  truncated: [],
  coverage: [
    "1,410 dials in the range carry no Close user and aren't credited to anyone.",
    "81 dials in the range were made by Close users who aren't on the setter roster (closers, admins, people who left).",
  ],
};

// ----------------------------------------------------------------------------
// The EOD cross-check: a week of days per setter, flags computed by the real
// rule so the preview shows exactly what production would.
// ----------------------------------------------------------------------------

const dayKey = (daysAgo: number) => new Date(NOW - daysAgo * D).toISOString().slice(0, 10);
const noMeasure: MeasuredDay = {
  dials: null, pickUps: null, sets: null, callsOnCalendar: null, callsShown: null, callsUnknown: null,
  newSelfBooked: null, contacted: null, reached: null, confirmedOnCalendar: null, confirmedShowed: null, confirmedUnknown: null,
};
const LADDER = [30, 45, 60, 90];
/** A plausible ladder around the measured 60s+ count: many short answers, a few long ones. */
const ladderAround = (at60: number | null) =>
  at60 === null ? null : { thresholds: LADDER, counts: [Math.round(at60 * 4.2) + 3, Math.round(at60 * 2.1) + 1, at60, Math.max(0, Math.round(at60 * 0.6))] };
const day = (daysAgo: number, filed: FiledDay | null, measured: Partial<MeasuredDay>, due = true): CrossCheckData["byRoster"][number]["days"][number] => {
  const m = { ...noMeasure, ...measured };
  return { dayKey: dayKey(daysAgo), due, filed, measured: m, flags: filed ? crossCheckDay(filed, m, DEFAULT_TOLERANCES) : [], ladder: ladderAround(m.pickUps) };
};
const roster = (rosterId: string, name: string, role: "booking" | "confirmation", linked: boolean, days: CrossCheckData["byRoster"][number]["days"]): CrossCheckData["byRoster"][number] => {
  const filedDays = days.filter((d) => d.filed !== null);
  return {
    rosterId, name, role, linked, active: true,
    daysDue: days.filter((d) => d.due).length,
    daysFiled: filedDays.length,
    daysFlagged: filedDays.filter((d) => d.flags.length > 0).length,
    flagCount: filedDays.reduce((n, d) => n + d.flags.length, 0),
    days,
  };
};

export const CHECKS: CrossCheckData = {
  startKey: dayKey(7),
  endKey: dayKey(0),
  timezone: "America/New_York",
  tolerances: DEFAULT_TOLERANCES,
  connectSec: 60,
  ladderThresholds: LADDER,
  truncated: [],
  byRoster: [
    roster("r-ezra", "Ezra", "booking", true, [
      day(6, { dials: 180, pickUps: 14, sets: 6, callsOnCalendar: 5, callsShown: 4 }, { dials: 176, pickUps: 13, sets: 6, callsOnCalendar: 5, callsShown: 3, callsUnknown: 1 }),
      day(5, { dials: 210, pickUps: 30, sets: 7, callsOnCalendar: 6, callsShown: 5 }, { dials: 168, pickUps: 12, sets: 4, callsOnCalendar: 6, callsShown: 5, callsUnknown: 0 }),
      day(4, { dials: 165, pickUps: 15, sets: 4, callsOnCalendar: 7, callsShown: 4 }, { dials: 171, pickUps: 16, sets: 5, callsOnCalendar: 7, callsShown: 4, callsUnknown: 2 }),
      day(3, null, { dials: 190, pickUps: 18, sets: 6, callsOnCalendar: 4, callsShown: 2, callsUnknown: 1 }),
      day(2, { dials: 200, pickUps: 20, sets: 5, callsOnCalendar: 6, callsShown: 6 }, { dials: 198, pickUps: 19, sets: 5, callsOnCalendar: 6, callsShown: 2, callsUnknown: 1 }),
      day(1, { dials: 195, pickUps: 19, sets: 7, callsOnCalendar: 10, callsShown: 7 }, { dials: 193, pickUps: 20, sets: 7, callsOnCalendar: 10, callsShown: 6, callsUnknown: 3 }),
      day(0, null, { dials: 61, pickUps: 4, sets: 1, callsOnCalendar: 0, callsShown: 0, callsUnknown: 0 }, false),
    ]),
    roster("r-ivan", "Ivan", "booking", true, [
      day(6, { dials: 320, pickUps: 18, sets: 3, callsOnCalendar: 3, callsShown: 1 }, { dials: 327, pickUps: 14, sets: 3, callsOnCalendar: 3, callsShown: 1, callsUnknown: 0 }),
      day(5, { dials: 330, pickUps: 19, sets: 2, callsOnCalendar: 2, callsShown: 1 }, { dials: 329, pickUps: 15, sets: 2, callsOnCalendar: 2, callsShown: 1, callsUnknown: 0 }),
      day(4, { dials: 310, pickUps: 17, sets: 3, callsOnCalendar: 4, callsShown: 2 }, { dials: 315, pickUps: 14, sets: 3, callsOnCalendar: 4, callsShown: 2, callsUnknown: 0 }),
      day(3, { dials: 340, pickUps: 20, sets: 2, callsOnCalendar: 2, callsShown: 0 }, { dials: 336, pickUps: 16, sets: 2, callsOnCalendar: 2, callsShown: 0, callsUnknown: 1 }),
      day(2, { dials: 304, pickUps: 18, sets: 3, callsOnCalendar: 2, callsShown: 1 }, { dials: 328, pickUps: 12, sets: 3, callsOnCalendar: 2, callsShown: 1, callsUnknown: 0 }),
      day(1, null, { dials: 0, pickUps: 0, sets: 0, callsOnCalendar: 0, callsShown: 0, callsUnknown: 0 }, false),
      day(0, null, { dials: 120, pickUps: 6, sets: 1, callsOnCalendar: 1, callsShown: 0, callsUnknown: 1 }, false),
    ]),
    roster("r-sasha", "Sasha", "confirmation", true, [
      day(6, { newSelfBooked: 20, contacted: 17, reached: 5, confirmedOnCalendar: 13, confirmedShowed: 6 }, { newSelfBooked: 19, contacted: 16, reached: 5, confirmedOnCalendar: 13, confirmedShowed: 5, confirmedUnknown: 3 }),
      day(5, { newSelfBooked: 18, contacted: 18, reached: 4, confirmedOnCalendar: 12, confirmedShowed: 6 }, { newSelfBooked: 18, contacted: 13, reached: 4, confirmedOnCalendar: 12, confirmedShowed: 6, confirmedUnknown: 1 }),
      day(4, { newSelfBooked: 21, contacted: 16, reached: 5, confirmedOnCalendar: 14, confirmedShowed: 7 }, { newSelfBooked: 21, contacted: 16, reached: 5, confirmedOnCalendar: 14, confirmedShowed: 7, confirmedUnknown: 2 }),
      day(3, { newSelfBooked: 17, contacted: 15, reached: 4, confirmedOnCalendar: 11, confirmedShowed: 5 }, { newSelfBooked: 17, contacted: 15, reached: 4, confirmedOnCalendar: 11, confirmedShowed: 5, confirmedUnknown: 0 }),
      day(2, { newSelfBooked: 19, contacted: 14, reached: 4, confirmedOnCalendar: 14, confirmedShowed: 6 }, { newSelfBooked: 20, contacted: 15, reached: 4, confirmedOnCalendar: 14, confirmedShowed: 6, confirmedUnknown: 4 }),
      day(1, null, { newSelfBooked: 0, contacted: 0, reached: 0, confirmedOnCalendar: 0, confirmedShowed: 0, confirmedUnknown: 0 }, false),
      day(0, null, { newSelfBooked: 9, contacted: 6, reached: 2, confirmedOnCalendar: 5, confirmedShowed: 1, confirmedUnknown: 4 }, false),
    ]),
  ],
};
