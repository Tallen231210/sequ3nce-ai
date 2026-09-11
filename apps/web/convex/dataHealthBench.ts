// ============================================================================
// CLI bench for the data-health helpers (repo convention: internalQuery
// benches; read `allPass` off the output):
//   npx convex run dataHealthBench:weekBench '{}'
// ============================================================================

import { internalQuery } from "./_generated/server";
import { addDaysKey, weekStartKeyFor, workingDaysOfWeek, type DataHealth } from "./dataHealthCore";
import { missingRows, namedTop } from "./lib/dataHealthRows";
import { crossCheckDay, flagPlain, DEFAULT_TOLERANCES, type MeasuredDay } from "./lib/eodCrossCheck";

const NO_DRAGS: DataHealth["drags"] = {
  untaggedSelfBooks: { total: 0, byCloser: [] },
  missingInitials: { total: 0, bySetter: [] },
  unlabeledTouched: { total: 0, bySetter: [] },
  notRecolored: { total: 0, byCloser: [] },
  leadMissing: 0,
  handMadeUntagged: 0,
  eodMissed: [],
};

const measured = (over: Partial<MeasuredDay>): MeasuredDay => ({
  dials: null, pickUps: null, sets: null, callsOnCalendar: null, callsShown: null, callsUnknown: null,
  newSelfBooked: null, contacted: null, reached: null, confirmedOnCalendar: null, confirmedShowed: null, confirmedUnknown: null,
  ...over,
});

export const weekBench = internalQuery({
  args: {},
  handler: async () => {
    const cases = [
      { name: "Monday is its own week start", got: weekStartKeyFor("2026-09-07"), expect: "2026-09-07" },
      { name: "Wednesday → previous Monday", got: weekStartKeyFor("2026-09-09"), expect: "2026-09-07" },
      { name: "Sunday → Monday six days back", got: weekStartKeyFor("2026-09-06"), expect: "2026-08-31" },
      { name: "month boundary", got: addDaysKey("2026-08-31", 1), expect: "2026-09-01" },
      { name: "the finished week before a Monday", got: addDaysKey(weekStartKeyFor("2026-09-14"), -7), expect: "2026-09-07" },
      { name: "working days Mon..Sat", got: workingDaysOfWeek("2026-09-07", "2026-09-13").join(","), expect: "2026-09-07,2026-09-08,2026-09-09,2026-09-10,2026-09-11,2026-09-12" },
      { name: "working days cut at today", got: workingDaysOfWeek("2026-09-07", "2026-09-09").join(","), expect: "2026-09-07,2026-09-08,2026-09-09" },
    ];
    const results = cases.map((c) => ({ ...c, pass: c.got === c.expect }));
    return { allPass: results.every((r) => r.pass), results };
  },
});

/** The card's rows and the post's bullets come from here — one shape, plain words. */
export const rowsBench = internalQuery({
  args: {},
  handler: async () => {
    const flag = crossCheckDay({ pickUps: 32 }, measured({ pickUps: 7 }), DEFAULT_TOLERANCES)[0];
    const rows = missingRows({
      drags: {
        ...NO_DRAGS,
        notRecolored: { total: 28, byCloser: [{ name: "Joseph", count: 15 }, { name: "Karl", count: 13 }] },
        eodMissed: [{ name: "Erten", days: ["2026-09-08"] }],
      },
    }, { byRoster: [{ name: "Erten", days: [{ dayKey: "2026-09-07", flags: [flag] }] }] });
    const cases = [
      { name: "a flag reads as a sentence", got: flagPlain(flag), expect: "said 32 pick-ups, Close saw 7" },
      { name: "biggest drag first", got: rows[0].label, expect: "Calls the closer never coloured after the call" },
      { name: "the count is the number alone", got: rows[0].count, expect: "28" },
      { name: "people are named beside it", got: rows[0].detail.join(""), expect: "Joseph 15 · Karl 13" },
      { name: "unfiled EODs count days", got: rows.find((r) => r.key === "eod-missing")?.count ?? "", expect: "1 day" },
      { name: "mismatches count setters", got: rows.find((r) => r.key === "eod-mismatch")?.count ?? "", expect: "1 setter" },
      { name: "a mismatch line names the day", got: rows.find((r) => r.key === "eod-mismatch")?.detail[0] ?? "", expect: "Erten Mon, Sep 7: said 32 pick-ups, Close saw 7" },
      { name: "nothing missing means no rows", got: String(missingRows({ drags: NO_DRAGS }).length), expect: "0" },
      { name: "a long list folds its tail", got: namedTop([1, 2, 3, 4, 5, 6, 7].map((n) => ({ name: `S${n}`, count: n })))[0], expect: "S1 1 · S2 2 · S3 3 · S4 4 · S5 5 · and 2 more" },
      {
        name: "a detail line says whose names these are",
        got: missingRows({ drags: { ...NO_DRAGS, unlabeledTouched: { total: 3, bySetter: [{ name: "Erten", count: 3 }] } } })[0].detail[0],
        expect: "Worked by Erten 3",
      },
    ];
    const results = cases.map((c) => ({ ...c, pass: c.got === c.expect }));
    return { allPass: results.every((r) => r.pass), results };
  },
});
