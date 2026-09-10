// Fictional team, fictional people. Typed against the real query returns so
// the preview breaks the moment a shape drifts.

import type { ActivityData, BookingsData, SetsData } from "../dashboard/setters/lib/cards";

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
  showRatePct: showed + noShow > 0 ? Math.round((showed / (showed + noShow)) * 100) : null,
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
  ...extra,
});

export const BOOKINGS: BookingsData = {
  range: { startMs: NOW - 7 * D, endMs: NOW, timezone: "America/New_York" },
  rangeClampedToDays: undefined,
  truncated: [],
  labels: { dm: "DM setters", outbound: "Outbound setters", confirmation: "Confirmation setters" },
  basis: "9:00–17:00, 5 days a week, America/New_York",
  strip: [
    { team: "dm", label: "DM setters", ...tally(29, 13, 10), ...money(3, 14_500), coverage: null },
    { team: "outbound", label: "Outbound setters", ...tally(58, 26, 20), ...money(6, 31_000), coverage: null },
    { team: "confirmation", label: "Confirmation setters", ...tally(65, 29, 23), ...money(5, 22_800), coverage: { contacted: 64, newSelfBooks: 77, pct: 83 } },
  ],
  outbound: [
    { id: "r-ezra", rosterId: "r-ezra", name: "Ezra", active: true, linked: true, ...tally(35, 16, 12), tagged: 27, crmOnly: 8, ...money(4, 19_000) },
    { id: "r-ivan", rosterId: "r-ivan", name: "Ivan", active: true, linked: true, ...tally(15, 7, 5), tagged: 15, crmOnly: 0, ...money(1, 6_000) },
    { id: "r-max", rosterId: "r-max", name: "Max", active: true, linked: false, ...tally(6, 3, 2), tagged: 6, crmOnly: 0, ...money(1, 6_000) },
    { id: "r-miles", rosterId: "r-miles", name: "Miles", active: true, linked: true, ...tally(2, 0, 1), tagged: 2, crmOnly: 0, ...money(0, 0) },
  ],
  dm: [
    { linkName: "dario", name: "Dario", configured: true, active: true, ...tally(12, 5, 4), ...money(1, 5_000) },
    { linkName: "luka", name: "Luka", configured: true, active: true, ...tally(9, 4, 3), ...money(2, 9_500) },
    { linkName: "no name on the link", name: "no name on the link", configured: false, active: true, ...tally(8, 4, 3), ...money(0, 0) },
  ],
  confirmation: [
    { id: "r-sasha", rosterId: "r-sasha", name: "Sasha", active: true, linked: true, ...tally(65, 29, 23), tagged: 58, crmOnly: 6, newSelfBooks: 77, contacted: 64, reached: 22, coveragePct: 83, ...money(5, 22_800), responseMedianWorkingMs: 1.4 * H },
  ],
  selfBookedUncontacted: [],
  unattributed: [],
  followUpsExcluded: 6,
  records: [
    rec("b1", "Elena and Jonah", "outbound", 1, ["Ezra"], ["r-ezra"], "showed", { closed: true, cash: 5_000, touches: [{ name: "Ezra", kind: "dial", at: NOW - 3 * D, reached: true, afterBooking: false }] }),
    rec("b2", "Nia and Jonah", "outbound", 2, ["Ezra"], ["r-ezra"], "no_show", { attributedBy: "crm_activity", token: null, touches: [{ name: "Ezra", kind: "sms", at: NOW - 4 * D, reached: false, afterBooking: false }] }),
    rec("b3", "Omar and Bea", "outbound", 3, ["Ezra"], ["r-ezra"], "unknown"),
    rec("b4", "Priya and Bea", "dm", 1, [], [], "showed"),
    rec("b5", "Theo and Kai", "confirmation", 2, ["Sasha"], ["r-sasha"], "showed", { touches: [{ name: "Sasha", kind: "dial", at: NOW - 3 * D + 2 * H, reached: true, afterBooking: true }] }),
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
    { rosterId: "r-ezra", sets: 41, tagged: 23, crmOnly: 18 },
    { rosterId: "r-ivan", sets: 12, tagged: 12, crmOnly: 0 },
    { rosterId: "r-max", sets: 3, tagged: 3, crmOnly: 0 },
    { rosterId: "r-miles", sets: 4, tagged: 4, crmOnly: 0 },
  ],
  confirmation: [{ rosterId: "r-sasha", newSelfBooks: 95, contacted: 77, reached: 22, coveragePct: 81, responseMedianWorkingMs: 1.4 * H }],
  dm: [
    { linkName: "dario", sets: 14 },
    { linkName: "luka", sets: 10 },
  ],
  cohort: 137,
};

const filed = (o: Partial<NonNullable<ActivityData["byRoster"][number]["filed"]>>): NonNullable<ActivityData["byRoster"][number]["filed"]> => ({
  days: 7, dials: 0, pickUps: 0, sets: 0, callsOnCalendar: 0, callsShown: 0, callsClosed: 0, cashCollected: 0, cashReported: false,
  newSelfBooked: 0, contacted: 0, reached: 0, confirmed: 0, confirmedOnCalendar: 0, confirmedShowed: 0, ...o,
});
const speed = (medianH: number | null, count: number, noArrival: number) => ({
  count, medianWorkingMs: medianH === null ? null : medianH * H, p90WorkingMs: medianH === null ? null : medianH * 3 * H,
  noArrivalCount: noArrival, neverContactedCount: 2, untimedCount: 0, clippedCount: 0, unreadCount: 0,
});

export const ACTIVITY: ActivityData = {
  range: { startMs: NOW - 7 * D, endMs: NOW, timezone: "America/New_York" },
  rollupsReady: true,
  basis: "9:00–17:00, 5 days a week, America/New_York",
  byRoster: [
    { rosterId: "r-ezra", name: "Ezra", role: "booking", linked: true, dials: 1_230, answered: 98, texts: 310, filed: filed({ dials: 1_150, pickUps: 98, sets: 29, callsOnCalendar: 38, callsShown: 28, callsClosed: 4, cashCollected: 19_000, cashReported: true }), speed: speed(2.1, 41, 9) },
    { rosterId: "r-ivan", name: "Ivan", role: "booking", linked: true, dials: 1_635, answered: 71, texts: 120, filed: filed({ dials: 1_604, pickUps: 92, sets: 13, callsOnCalendar: 13, callsShown: 5, callsClosed: 1, cashCollected: 6_000, cashReported: true }), speed: speed(0.4, 12, 3) },
    { rosterId: "r-max", name: "Max", role: "booking", linked: false, dials: null, answered: null, texts: null, filed: filed({ days: 3, dials: 355, pickUps: 28, sets: 4, callsOnCalendar: 2, callsShown: 2 }), speed: null },
    { rosterId: "r-miles", name: "Miles", role: "booking", linked: true, dials: 337, answered: 12, texts: 40, filed: filed({ days: 1, dials: 99, pickUps: 6, sets: 0 }), speed: speed(null, 0, 1) },
    { rosterId: "r-sasha", name: "Sasha", role: "confirmation", linked: true, dials: 233, answered: 40, texts: 405, filed: filed({ days: 5, newSelfBooked: 95, contacted: 80, reached: 22, confirmed: 41, confirmedOnCalendar: 64, confirmedShowed: 29 }), speed: null },
  ],
  unattributedDials: 1_410,
  truncated: [],
  coverage: ["1,410 dials in the range carry no Close user and aren't credited to anyone."],
};
