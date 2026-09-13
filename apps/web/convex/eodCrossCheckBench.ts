// ============================================================================
// CLI bench for the EOD cross-check rule (read `allPass` off the output):
//   npx convex run eodCrossCheckBench:rules '{}'
// ============================================================================

import { internalQuery } from "./_generated/server";
import { countsAsDue, crossCheckDay, dayStatusOf, DEFAULT_TOLERANCES, didWork, flagText, isChased, tolerancesFor, type DayActivity, type DayStatusInput, type MeasuredDay } from "./lib/eodCrossCheck";
import { measureConfirmationDay } from "./setterEodMeasured";
import { localDayBounds } from "./settersPageActivity";
import type { BookingRecord } from "./setterTeamBookings";

const measured = (m: Partial<MeasuredDay>): MeasuredDay => ({
  dials: null, pickUps: null, sets: null, callsOnCalendar: null, callsShown: null, callsUnknown: null,
  newSelfBooked: null, contacted: null, reached: null, confirmedOnCalendar: null, confirmedShowed: null, confirmedUnknown: null,
  ...m,
});
const fields = (flags: ReturnType<typeof crossCheckDay>) => flags.map((f) => f.field);

export const rules = internalQuery({
  args: {},
  handler: async () => {
    const t = DEFAULT_TOLERANCES;
    const cases: Array<{ name: string; got: unknown; expect: unknown }> = [
      { name: "dials 89 vs 100 = 11% > 10% → flagged", got: fields(crossCheckDay({ dials: 89 }, measured({ dials: 100 }), t)), expect: ["dials"] },
      { name: "dials 91 vs 100 = 9% → fine", got: fields(crossCheckDay({ dials: 91 }, measured({ dials: 100 }), t)), expect: [] },
      { name: "small day: 7 vs 5 within the floor of 2", got: fields(crossCheckDay({ dials: 7 }, measured({ dials: 5 }), t)), expect: [] },
      { name: "small day: 8 vs 5 is over the floor", got: fields(crossCheckDay({ dials: 8 }, measured({ dials: 5 }), t)), expect: ["dials"] },
      { name: "pick-ups 30 vs 20 = 50% > 25% → flagged", got: fields(crossCheckDay({ pickUps: 30 }, measured({ pickUps: 20 }), t)), expect: ["pickUps"] },
      { name: "pick-ups 24 vs 20 = 20% → fine", got: fields(crossCheckDay({ pickUps: 24 }, measured({ pickUps: 20 }), t)), expect: [] },
      { name: "sets: one more than credited is noise", got: fields(crossCheckDay({ sets: 5 }, measured({ sets: 4 }), t)), expect: [] },
      { name: "sets: two more than credited → flagged", got: fields(crossCheckDay({ sets: 6 }, measured({ sets: 4 }), t)), expect: ["sets"] },
      { name: "sets: fewer than credited is never flagged", got: fields(crossCheckDay({ sets: 1 }, measured({ sets: 6 }), t)), expect: [] },
      { name: "on calendar ±1 fine, ±2 flagged", got: [fields(crossCheckDay({ callsOnCalendar: 3 }, measured({ callsOnCalendar: 4 }), t)), fields(crossCheckDay({ callsOnCalendar: 6 }, measured({ callsOnCalendar: 4 }), t))], expect: [[], ["callsOnCalendar"]] },
      { name: "shown: unknown verdicts leave room (filed 4, showed 2 + 2 unknown)", got: fields(crossCheckDay({ callsShown: 4 }, measured({ callsShown: 2, callsUnknown: 2 }), t)), expect: [] },
      { name: "shown: more than could have shown → flagged", got: fields(crossCheckDay({ callsShown: 6 }, measured({ callsShown: 2, callsUnknown: 2 }), t)), expect: ["callsShown"] },
      { name: "shown: fewer than verified shows → flagged", got: fields(crossCheckDay({ callsShown: 0 }, measured({ callsShown: 3, callsUnknown: 0 }), t)), expect: ["callsShown"] },
      { name: "blank filed is never checked", got: fields(crossCheckDay({ dials: undefined, pickUps: null }, measured({ dials: 100, pickUps: 50 }), t)), expect: [] },
      { name: "unmeasurable (unlinked) is never checked", got: fields(crossCheckDay({ dials: 100 }, measured({ dials: null }), t)), expect: [] },
      { name: "confirmation: contacted 10 vs 14 = 29% > 15% → flagged", got: fields(crossCheckDay({ contacted: 10 }, measured({ contacted: 14 }), t)), expect: ["contacted"] },
      { name: "flag carries both numbers and the gap", got: flagText(crossCheckDay({ dials: 89 }, measured({ dials: 100 }), t)[0]), expect: "dials: filed 89 · CRM 100 (−11%)" },
      { name: "measured 0 shows an absolute gap", got: flagText(crossCheckDay({ dials: 3 }, measured({ dials: 0 }), t)[0]), expect: "dials: filed 3 · CRM 0 (+3)" },
      { name: "team tolerance overrides, clamped", got: tolerancesFor({ dialsPct: 5, minGap: 99 }), expect: { dialsPct: 5, pickUpsPct: 25, confirmationPct: 15, minGap: 20 } },
      { name: "a 5% team flags 94 vs 100", got: fields(crossCheckDay({ dials: 94 }, measured({ dials: 100 }), tolerancesFor({ dialsPct: 5 }))), expect: ["dials"] },
    ];
    const results = cases.map((c) => ({ ...c, pass: JSON.stringify(c.got) === JSON.stringify(c.expect) }));
    return { allPass: results.every((r) => r.pass), results };
  },
});

// A self-book record with the confirmation setter's touches at given times.
function selfBook(bookedDayKey: string, touches: Array<{ at: number; reached: boolean }>): BookingRecord {
  return {
    bookedDayKey,
    dayKey: "2026-09-20",
    isFollowUp: false,
    classification: { lane: "confirmation", isFunnel: true, attributedBy: "crm_activity", creditRosterIds: [] },
    touches: touches.map((t) => ({ rosterId: "r-sophie", crmUserId: "u1", kind: "sms", at: t.at, reached: t.reached, afterBooking: true })),
    verdict: { result: "unknown", source: null, due: false },
  } as unknown as BookingRecord;
}

/** The measured-day rules that sit under the cross-check: touches bounded to the day, day bounds across a DST change. */
export const measuredRules = internalQuery({
  args: {},
  handler: async () => {
    const tz = "America/New_York";
    const day = localDayBounds("2026-09-08", "2026-09-08", tz)[0];
    const nextDay = day.endMs + 3 * 60 * 60 * 1000; // 03:00 the next morning
    const records = [selfBook("2026-09-08", [{ at: day.startMs + 60_000, reached: false }]), selfBook("2026-09-08", [{ at: nextDay, reached: true }]), selfBook("2026-09-08", [])];
    const same = measureConfirmationDay(records, "r-sophie", "2026-09-08", true, day.endMs);
    const later = measureConfirmationDay(records, "r-sophie", "2026-09-08", true);
    const dst = localDayBounds("2026-03-07", "2026-03-09", tz);
    const hours = dst.map((d) => (d.endMs - d.startMs) / 3_600_000);
    const cases: Array<{ name: string; got: unknown; expect: unknown }> = [
      { name: "bounded to the day: one contacted, none reached", got: [same.newSelfBooked, same.contacted, same.reached], expect: [3, 1, 0] },
      { name: "unbounded (the prefill's later look): two contacted, one reached", got: [later.newSelfBooked, later.contacted, later.reached], expect: [3, 2, 1] },
      { name: "day bounds are contiguous", got: dst.every((d, i) => i === 0 || dst[i - 1].endMs === d.startMs), expect: true },
      { name: "the spring-forward day is 23 hours, its neighbours 24", got: hours, expect: [24, 23, 24] },
      { name: "keys walk the calendar", got: dst.map((d) => d.dayKey), expect: ["2026-03-07", "2026-03-08", "2026-03-09"] },
    ];
    const results = cases.map((c) => ({ ...c, pass: JSON.stringify(c.got) === JSON.stringify(c.expect) }));
    return { allPass: results.every((r) => r.pass), results };
  },
});

// ============================================================================
// Is a form owed? The rule that decides who gets chased.
//   npx convex run eodCrossCheckBench:owedRules '{}'
// ============================================================================

const OWED_BASE: DayStatusInput = {
  hasEntry: false, active: true, beforeJoin: false, dayIsOver: true,
  measurable: true, readable: true, linkAlive: true, teamBlind: false, worked: true, markedOff: false,
};
const owed = (o: Partial<DayStatusInput>) => dayStatusOf({ ...OWED_BASE, ...o });
const activity = (a: Partial<DayActivity>): DayActivity => ({ dials: 0, answered: 0, texts: 0, ...a });

export const owedRules = internalQuery({
  args: {},
  handler: async () => {
    const cases: Array<{ name: string; got: unknown; expect: unknown }> = [
      // The invariant that produced "12 of 11" and "filed 5 of 3": a filed day
      // is ALWAYS in the denominator, whatever else is true of it.
      { name: "filed outranks everything — no activity", got: owed({ hasEntry: true, worked: false }), expect: "filed" },
      { name: "filed outranks everything — before they joined", got: owed({ hasEntry: true, beforeJoin: true }), expect: "filed" },
      { name: "filed outranks everything — day not over", got: owed({ hasEntry: true, dayIsOver: false }), expect: "filed" },
      { name: "filed outranks everything — unmeasurable", got: owed({ hasEntry: true, measurable: false }), expect: "filed" },
      { name: "every filed day counts as due", got: [countsAsDue("filed"), countsAsDue("missing"), countsAsDue("unmeasured"), countsAsDue("no-activity"), countsAsDue(null)], expect: [true, true, true, false, false] },

      // The bug this whole change exists to fix.
      { name: "worked and didn't file → chased", got: owed({ worked: true }), expect: "missing" },
      { name: "did nothing → not chased", got: owed({ worked: false }), expect: "no-activity" },
      { name: "only missing and unmeasured are chased", got: [isChased("missing"), isChased("unmeasured"), isChased("no-activity"), isChased("filed")], expect: [true, true, false, false] },

      // Refusing to guess. Each of these would otherwise excuse someone forever.
      { name: "no CRM user → unmeasured, still chased", got: owed({ measurable: false, worked: false }), expect: "unmeasured" },
      { name: "day too busy to read → unmeasured, not a real zero", got: owed({ readable: false, worked: false }), expect: "unmeasured" },
      { name: "dead CRM link (zero all range) → unmeasured", got: owed({ linkAlive: false, worked: false }), expect: "unmeasured" },
      { name: "whole team read zero → our sync, nobody excused", got: owed({ teamBlind: true, worked: false }), expect: "unmeasured" },

      // Nothing owed.
      { name: "today isn't owed yet", got: owed({ dayIsOver: false }), expect: null },
      { name: "before they joined", got: owed({ beforeJoin: true }), expect: null },
      { name: "off the roster", got: owed({ active: false }), expect: null },

      // The floor. A bare > 0 chases someone over one stray auto-dial.
      { name: "2 dials is not a working day", got: didWork(measured({}), activity({ dials: 2 })), expect: false },
      { name: "3 dials is", got: didWork(measured({}), activity({ dials: 3 })), expect: true },
      { name: "2 texts is not, 3 is", got: [didWork(measured({}), activity({ texts: 2 })), didWork(measured({}), activity({ texts: 3 }))], expect: [false, true] },
      { name: "one set is work whatever the dials say", got: didWork(measured({ sets: 1 }), activity({ dials: 0 })), expect: true },
      { name: "no activity at all", got: didWork(measured({}), activity({})), expect: false },
      { name: "unreadable day (null activity) is not evidence of work", got: didWork(measured({}), null), expect: false },

      // Demand is not effort: leads landing, or calls booked days ago sitting
      // on today's calendar, say nothing about whether they showed up.
      { name: "14 self-books arriving is not work", got: didWork(measured({ newSelfBooked: 14 }), activity({})), expect: false },
      { name: "calls on the calendar today were booked earlier — not work", got: didWork(measured({ callsOnCalendar: 6, confirmedOnCalendar: 25 }), activity({})), expect: false },

      // Confirmation setters: the truth table. Sophie has no dials of her own
      // in the cross-check, so contacted/reached are what prove she worked.
      { name: "confirmation, unlinked: no evidence either way → guard must catch it", got: [didWork(measured({ newSelfBooked: 14, contacted: null, reached: null }), null), owed({ measurable: false, worked: false })], expect: [false, "unmeasured"] },
      { name: "confirmation, linked, worked her list", got: didWork(measured({ contacted: 8, reached: 2 }), null), expect: true },
      { name: "confirmation, linked, genuinely off", got: didWork(measured({ newSelfBooked: 11, contacted: 0, reached: 0 }), null), expect: false },
      { name: "confirmation dialling non-funnel leads still reads as work", got: didWork(measured({ contacted: 0, reached: 0 }), activity({ dials: 40 })), expect: true },

      // "I didn't work that day." A statement, not a guess — so it beats
      // everything we infer, and loses only to numbers they actually filed.
      { name: "marked off → not chased", got: owed({ markedOff: true, worked: false }), expect: "off" },
      { name: "a filed form outranks the button", got: owed({ hasEntry: true, markedOff: true }), expect: "filed" },
      { name: "marked off beats 'we can't see you' — the whole point for an unlinked person", got: owed({ markedOff: true, measurable: false }), expect: "off" },
      { name: "marked off beats an unreadable day", got: owed({ markedOff: true, readable: false }), expect: "off" },
      { name: "marked off beats a dead link and a blind team", got: [owed({ markedOff: true, linkAlive: false }), owed({ markedOff: true, teamBlind: true })], expect: ["off", "off"] },
      // Not silently accepted, not silently rejected: the mark stands and the
      // manager sees the contradiction beside it.
      { name: "marked off on a day they clearly worked still reads off", got: owed({ markedOff: true, worked: true }), expect: "off" },
      { name: "a day off leaves the filed N of M fraction", got: countsAsDue("off"), expect: false },
      { name: "a day off is never chased", got: isChased("off"), expect: false },
      { name: "marking a day off before they joined changes nothing", got: owed({ markedOff: true, beforeJoin: true }), expect: null },
      { name: "marking today off doesn't make today owed", got: owed({ markedOff: true, dayIsOver: false }), expect: null },
      { name: "off and no-activity are different words", got: [owed({ markedOff: true, worked: false }), owed({ markedOff: false, worked: false })], expect: ["off", "no-activity"] },
    ];
    const results = cases.map((c) => ({ ...c, pass: JSON.stringify(c.got) === JSON.stringify(c.expect) }));
    return { allPass: results.every((r) => r.pass), results };
  },
});
