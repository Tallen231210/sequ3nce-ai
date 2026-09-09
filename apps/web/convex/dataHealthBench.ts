// ============================================================================
// CLI bench for the data-health helpers (repo convention: internalQuery
// benches; read `allPass` off the output):
//   npx convex run dataHealthBench:weekBench '{}'
// ============================================================================

import { internalQuery } from "./_generated/server";
import { addDaysKey, weekStartKeyFor, workingDaysOfWeek } from "./dataHealthCore";

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
