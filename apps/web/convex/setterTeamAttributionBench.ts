// ============================================================================
// CLI benches for the setter-team rules (repo convention: internalQuery
// benches; read `allPass` off the output):
//   npx convex run setterTeamAttributionBench:classifyBench '{}'
//   npx convex run setterTeamAttributionBench:verdictBench '{}'
//   npx convex run setterTeamAttributionBench:eventNameBench '{}'
//   npx convex run setterTeamAttributionBench:accuracyBench '{}'
// Cases are E2's real shapes: their roster, their booking links, their titles.
// ============================================================================

import { internalQuery } from "./_generated/server";
import { COLOR } from "./lib/calendarColorRules";
import { eventNameMatches, parseEventName, personFromEventName } from "./lib/eventName";
import {
  accuracyOf,
  classifyBooking,
  showVerdictFor,
  type RosterRef,
  type SetterLane,
  type Touch,
} from "./lib/setterTeamAttribution";
import { extractSetterToken, matchToken, type RosterName } from "./lib/setterTitleMatch";

const ROSTER: RosterRef[] = [
  { rosterId: "erten", name: "Erten", role: "booking", tag: "e", crmUserId: "user_erten" },
  { rosterId: "ethan", name: "Ethan Russell", role: "booking", tag: "er", crmUserId: "user_ethan" },
  { rosterId: "mo", name: "Mo Mash", role: "booking", tag: "mo", crmUserId: "user_mo" },
  { rosterId: "marcus", name: "Marcus Hallam", role: "booking", tag: "m", crmUserId: "user_marcus" },
  { rosterId: "sophie", name: "Sophie Howell", role: "confirmation", tag: "s", crmUserId: "user_sophie" },
];
const NAMES: RosterName[] = ROSTER.map((r) => ({
  rosterId: r.rosterId,
  firstName: r.name.split(" ")[0],
  lastName: r.name.split(" ")[1] ?? "",
  tag: r.tag,
}));
const DM = ["instagram", "davud", "lazar"];
const FUNNEL = ["facebook", "main training"];
const touch = (crmUserId: string, kind: "dial" | "sms" = "dial", reached = false, afterBooking = true): Touch => ({
  rosterId: ROSTER.find((r) => r.crmUserId === crmUserId)?.rosterId ?? null,
  crmUserId,
  kind,
  at: 1,
  reached,
  afterBooking,
});

interface ClassifyCase {
  name: string;
  title: string;
  description: string | null;
  trusted?: boolean;
  touches?: Touch[];
  leadInClose?: boolean;
  touchedBefore?: boolean | null;
      bookingMomentKnown?: boolean;
      creditTouchAfterBooking?: boolean;
      creditFromTouch?: boolean;
      claim?: string;
  expect: SetterLane;
  credit?: string[];
  sourceKnown?: boolean;
  contactKnown?: boolean;
}

export const classifyBench = internalQuery({
  args: {},
  handler: async () => {
    const desc = (name: string) => `Booking\nEvent Name\n${name}\nDate`;
    const cases: ClassifyCase[] = [
      { name: "Instagram (Lazar) → DM, Lazar", title: "Ana and Karl", description: desc("Instagram (Lazar)"), expect: "dm", credit: [] },
      { name: "Main Training (Davud) → DM", title: "Ana and Karl", description: desc("Main Training (Davud)"), expect: "dm" },
      { name: "(e) + Facebook → outbound Erten (tag)", title: "(e) Tim and Karl", description: desc("Facebook"), leadInClose: true, touchedBefore: true, expect: "outbound", credit: ["erten"] },
      { name: "Facebook + Sophie dial → confirmation", title: "Tim and Karl", description: desc("Facebook"), touches: [touch("user_sophie")], leadInClose: true, touchedBefore: true, expect: "confirmation", credit: ["sophie"] },
      { name: "Facebook + Erten sms BEFORE the booking + Sophie dial → outbound (she drove it)", title: "Tim and Karl", description: desc("Facebook"), touches: [touch("user_erten", "sms", false, false), touch("user_sophie")], leadInClose: true, touchedBefore: true, expect: "outbound", credit: ["erten"] },
      { name: "Facebook + Erten sms AFTER the booking + Sophie dial → confirmation (a touch after the booking is not the set)", title: "Tim and Karl", description: desc("Facebook"), touches: [touch("user_erten", "sms"), touch("user_sophie")], leadInClose: true, touchedBefore: true, expect: "confirmation", credit: ["sophie"] },
      { name: "(s) Facebook, no Close touch → confirmation by tag", title: "(s) Gerry and Brittany", description: desc("Facebook"), leadInClose: false, touchedBefore: null, expect: "confirmation", credit: ["sophie"], contactKnown: true },
      { name: "Main Training, lead in Close, nobody touched → self-booked uncontacted", title: "Tim and Karl", description: desc("Main Training"), leadInClose: true, touchedBefore: false, expect: "self_booked_uncontacted", contactKnown: true },
      { name: "Facebook, lead in Close, only a closer texted → self-booked uncontacted (the confirmation setter's miss)", title: "Tim and Karl", description: desc("Facebook"), touches: [touch("user_karl", "sms")], leadInClose: true, touchedBefore: true, expect: "self_booked_uncontacted", contactKnown: true },
      { name: "Facebook, lead not in Close, no tag → unattributed, contact unknown", title: "Tim and Karl", description: desc("Facebook"), leadInClose: false, touchedBefore: null, expect: "unattributed", sourceKnown: true, contactKnown: false },
      { name: "no description, old row, no tag → unattributed, source unknown", title: "Tim and Karl", description: null, trusted: false, expect: "unattributed", sourceKnown: false },
      { name: "no description, fresh row, (mo) → outbound hand-created", title: "(mo) Paul X Karl", description: null, trusted: true, expect: "outbound", credit: ["mo"], sourceKnown: true },
      { name: "no description, fresh row, no tag, Marcus dialed before it was booked → outbound", title: "Paul and Karl", description: null, trusted: true, touches: [touch("user_marcus", "dial", false, false)], leadInClose: true, touchedBefore: true, expect: "outbound", credit: ["marcus"] },
      { name: "no description, fresh row, no tag, Marcus dialed only after the row appeared → still Marcus (no real booking moment)", title: "Paul and Karl", description: null, trusted: true, touches: [touch("user_marcus")], leadInClose: true, touchedBefore: true, bookingMomentKnown: false, expect: "outbound", credit: ["marcus"] },
      { name: "no description, fresh row, no tag, Marcus dialed only after a REAL booking moment → needs a look", title: "Paul and Karl", description: null, trusted: true, touches: [touch("user_marcus")], leadInClose: true, touchedBefore: true, bookingMomentKnown: true, expect: "unattributed", credit: [] },
      { name: "Facebook + Erten sms AFTER the booking, team credits after-booking touches → outbound", title: "Tim and Karl", description: desc("Facebook"), touches: [touch("user_erten", "sms"), touch("user_sophie")], leadInClose: true, touchedBefore: true, creditTouchAfterBooking: true, expect: "outbound", credit: ["erten"] },
      { name: "sets need initials: Erten dialed before the booking, no initials → Unlabeled", title: "Tim and Karl", description: desc("Facebook"), touches: [touch("user_erten", "dial", false, false)], leadInClose: true, touchedBefore: true, creditFromTouch: false, expect: "unattributed", credit: [] },
      { name: "sets need initials: Sophie contacted it too → hers, whoever else dialed", title: "Tim and Karl", description: desc("Facebook"), touches: [touch("user_erten", "sms"), touch("user_sophie")], leadInClose: true, touchedBefore: true, creditFromTouch: false, expect: "confirmation", credit: ["sophie"] },
      { name: "sets need initials: initials still credit", title: "(e) Tim and Karl", description: desc("Facebook"), touches: [], leadInClose: true, touchedBefore: true, creditFromTouch: false, expect: "outbound", credit: ["erten"] },
      { name: "a claim outranks everything: Sophie's self-book claimed by Marcus → Marcus", title: "Tim and Karl", description: desc("Facebook"), touches: [touch("user_sophie")], leadInClose: true, touchedBefore: true, creditFromTouch: false, claim: "marcus", expect: "outbound", credit: ["marcus"] },
      { name: "hand-made row, nobody touched, sets need initials → Unlabeled", title: "Paul and Karl", description: null, trusted: true, touches: [], leadInClose: false, touchedBefore: null, creditFromTouch: false, expect: "unattributed", credit: [] },
      { name: "(er) is Ethan exclusively", title: "(er) Sam and Karl", description: desc("Facebook"), expect: "outbound", credit: ["ethan"] },
      { name: "hand-created, only Sophie dialed → unattributed (not outbound)", title: "Paul and Karl", description: null, trusted: true, touches: [touch("user_sophie")], leadInClose: true, touchedBefore: true, expect: "unattributed", sourceKnown: false },
      { name: "hand-created with (s) → confirmation", title: "(s) Paul and Karl", description: null, trusted: true, expect: "confirmation", credit: ["sophie"] },
      { name: "unknown link word → unattributed", title: "Sam and Karl", description: desc("30 Minute Meeting"), leadInClose: true, touchedBefore: false, expect: "unattributed", sourceKnown: true },
    ];
    const results = cases.map((c) => {
      const eventName = parseEventName(c.description);
      const token = extractSetterToken(c.title);
      const got = classifyBooking({
        eventName,
        descriptionTrusted: c.trusted ?? true,
        taggedRosterIds: token ? matchToken(token, NAMES) : [],
        touches: c.touches ?? [],
        leadInClose: c.leadInClose ?? false,
        anyoneTouchedBefore: c.touchedBefore ?? null,
        rosters: ROSTER,
        dmPatterns: DM,
        funnelPatterns: FUNNEL,
        bookingMomentKnown: c.bookingMomentKnown,
        creditTouchAfterBooking: c.creditTouchAfterBooking,
        creditFromTouch: c.creditFromTouch,
        claim: c.claim ? { rosterId: ROSTER.find((r) => r.name.toLowerCase() === c.claim)?.rosterId ?? c.claim } : undefined,
      });
      const pass =
        got.lane === c.expect &&
        (c.credit === undefined || JSON.stringify(got.creditRosterIds) === JSON.stringify(c.credit)) &&
        (c.sourceKnown === undefined || got.sourceKnown === c.sourceKnown) &&
        (c.contactKnown === undefined || got.contactKnown === c.contactKnown);
      return { name: c.name, got: { lane: got.lane, credit: got.creditRosterIds, sourceKnown: got.sourceKnown, contactKnown: got.contactKnown, dmPerson: got.dmPerson }, expect: c.expect, pass };
    });
    return { allPass: results.every((r) => r.pass), results };
  },
});

export const verdictBench = internalQuery({
  args: {},
  handler: async () => {
    const NOW = Date.parse("2026-09-08T20:00:00Z");
    const end = NOW - 6 * 60 * 60 * 1000;
    const base = { endTime: end, nowMs: NOW };
    const cases = [
      { name: "human no-show beats dark green", input: { ...base, call: { status: "no_show" }, recolor: "done" as const, colorId: COLOR.DARK_GREEN }, expect: ["no_show", "human"] },
      { name: "closer-logged close → showed, human", input: { ...base, call: { status: "completed", outcome: "closed", outcomeSource: "closer" }, recolor: "uncolored" as const }, expect: ["showed", "human"] },
      { name: "AI outcome → showed, recording", input: { ...base, call: { status: "completed", outcome: "not_closed", outcomeSource: "ai" }, recolor: "uncolored" as const }, expect: ["showed", "recording"] },
      { name: "prospect joined, no outcome → showed, recording", input: { ...base, call: { status: "completed", prospectJoined: true, duration: 900 }, recolor: "uncolored" as const }, expect: ["showed", "recording"] },
      { name: "closer alone 15 min → no-show, recording", input: { ...base, call: { status: "completed", prospectJoined: false, duration: 900 }, recolor: "uncolored" as const }, expect: ["no_show", "recording"] },
      { name: "stub call + red recoloured after the call → no-show, colour", input: { ...base, call: { status: "completed", duration: 30 }, recolor: "done" as const, colorId: COLOR.RED }, expect: ["no_show", "calendar_color"] },
      { name: "no call + dark green recoloured → showed, colour", input: { ...base, call: null, recolor: "done" as const, colorId: COLOR.DARK_GREEN }, expect: ["showed", "calendar_color"] },
      { name: "no call + yellow recoloured → rescheduled, colour", input: { ...base, call: null, recolor: "done" as const, colorId: COLOR.YELLOW }, expect: ["rescheduled", "calendar_color"] },
      { name: "no call + red set BEFORE the call → unknown", input: { ...base, call: null, recolor: "pre_colored_untouched" as const, colorId: COLOR.RED }, expect: ["unknown", null] },
      { name: "no call + unverified red → unknown", input: { ...base, call: null, recolor: "unverified" as const, colorId: COLOR.RED }, expect: ["unknown", null] },
      { name: "not due yet → unknown, not due", input: { call: null, recolor: "not_due" as const, endTime: NOW + 3_600_000, nowMs: NOW }, expect: ["unknown", null], due: false },
    ];
    const results = cases.map((c) => {
      const got = showVerdictFor(c.input);
      const pass = got.result === c.expect[0] && got.source === c.expect[1] && got.due === (c.due ?? true);
      return { name: c.name, got, expect: c.expect, pass };
    });
    return { allPass: results.every((r) => r.pass), results };
  },
});

export const eventNameBench = internalQuery({
  args: {},
  handler: async () => {
    const cases = [
      { name: "Calendly block", got: parseEventName("Event Name\nFacebook\n\nDate & Time\n…"), expect: "Facebook" },
      { name: "CRLF", got: parseEventName("Event Name\r\n  Main Training (Davud)\r\n"), expect: "Main Training (Davud)" },
      { name: "no block", got: parseEventName("Zoom link only"), expect: null },
      { name: "empty", got: parseEventName(undefined), expect: null },
      { name: "person from link", got: personFromEventName("Instagram (Lazar)"), expect: "Lazar" },
      { name: "no person", got: personFromEventName("Instagram"), expect: null },
      { name: "match is case-insensitive substring", got: eventNameMatches("Main Training (Davud)", ["main training"]), expect: true },
      { name: "one-letter word never matches", got: eventNameMatches("Facebook", ["f"]), expect: false },
    ];
    const results = cases.map((c) => ({ ...c, pass: c.got === c.expect }));
    return { allPass: results.every((r) => r.pass), results };
  },
});

export const accuracyBench = internalQuery({
  args: {},
  handler: async () => {
    const v = (result: "showed" | "no_show" | "unknown", due = true) => ({ result, source: null, due });
    const got = accuracyOf([
      { sourceKnown: true, contactKnown: true, verdict: v("showed") },
      { sourceKnown: true, contactKnown: false, verdict: v("no_show") },
      { sourceKnown: false, contactKnown: true, verdict: v("unknown") },
      { sourceKnown: true, contactKnown: true, verdict: v("unknown", false) },
    ]);
    const expect = { bookings: 4, due: 3, sourceKnown: 3, contactKnown: 3, showKnown: 2, allKnown: 1, sourcePct: 75, contactPct: 75, showPct: 67, score: 33 };
    const pass = JSON.stringify(got) === JSON.stringify(expect);
    return { allPass: pass, results: [{ name: "mixed week", got, expect, pass }] };
  },
});
