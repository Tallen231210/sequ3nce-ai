// ============================================================================
// CLI bench for the EOD cross-check rule (read `allPass` off the output):
//   npx convex run eodCrossCheckBench:rules '{}'
// ============================================================================

import { internalQuery } from "./_generated/server";
import { crossCheckDay, DEFAULT_TOLERANCES, flagText, tolerancesFor, type MeasuredDay } from "./lib/eodCrossCheck";

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
      { name: "flag carries both numbers and the gap", got: flagText(crossCheckDay({ dials: 89 }, measured({ dials: 100 }), t)[0]), expect: "dials: filed 89 · Close 100 (−11%)" },
      { name: "measured 0 shows an absolute gap", got: flagText(crossCheckDay({ dials: 3 }, measured({ dials: 0 }), t)[0]), expect: "dials: filed 3 · Close 0 (+3)" },
      { name: "team tolerance overrides, clamped", got: tolerancesFor({ dialsPct: 5, minGap: 99 }), expect: { dialsPct: 5, pickUpsPct: 25, confirmationPct: 15, minGap: 20 } },
      { name: "a 5% team flags 94 vs 100", got: fields(crossCheckDay({ dials: 94 }, measured({ dials: 100 }), tolerancesFor({ dialsPct: 5 }))), expect: ["dials"] },
    ];
    const results = cases.map((c) => ({ ...c, pass: JSON.stringify(c.got) === JSON.stringify(c.expect) }));
    return { allPass: results.every((r) => r.pass), results };
  },
});
