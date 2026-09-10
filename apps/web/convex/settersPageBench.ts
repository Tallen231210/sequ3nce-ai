// ============================================================================
// CLI benches for the Setters page's pure rules (repo convention: read
// `allPass` off the output).
//   npx convex run settersPageBench:moneyBench '{}'
// ============================================================================

import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { moneyOf } from "./setterTeamBookingHelpers";

type CallLike = Partial<Doc<"calls">>;
const call = (c: CallLike) => c as Doc<"calls">;

export const moneyBench = internalQuery({
  args: {},
  handler: async () => {
    const cases: Array<{ name: string; got: unknown; expect: unknown }> = [
      { name: "no call → nothing", got: moneyOf(null, true), expect: { closed: false, cash: 0, contractValue: 0 } },
      {
        name: "closed with cash and contract",
        got: moneyOf(call({ status: "completed", outcome: "closed", cashCollected: 2500, contractValue: 10000, duration: 1800 }), true),
        expect: { closed: true, cash: 2500, contractValue: 10000 },
      },
      {
        name: "not closed → no cash even if typed",
        got: moneyOf(call({ status: "completed", outcome: "not_closed", cashCollected: 500, duration: 1800 }), true),
        expect: { closed: false, cash: 0, contractValue: 0 },
      },
      {
        name: "no-show is not a taken call",
        got: moneyOf(call({ status: "completed", outcome: "no_show", cashCollected: 500 }), true),
        expect: { closed: false, cash: 0, contractValue: 0 },
      },
      {
        name: "AI contract value ignored under the team opt-out",
        got: moneyOf(call({ status: "completed", outcome: "closed", cashCollected: 0, contractValue: 24000, outcomeSource: "ai", duration: 1800 }), false),
        expect: { closed: true, cash: 0, contractValue: 0 },
      },
      {
        name: "AI contract value counts once confirmed",
        got: moneyOf(call({ status: "completed", outcome: "closed", contractValue: 24000, outcomeSource: "ai", factsConfirmedAt: 1, duration: 1800 }), false),
        expect: { closed: true, cash: 0, contractValue: 24000 },
      },
      {
        name: "marked not a sales call",
        got: moneyOf(call({ status: "completed", outcome: "closed", cashCollected: 900, countsTowardStats: false, duration: 1800 }), true),
        expect: { closed: false, cash: 0, contractValue: 0 },
      },
    ];
    const results = cases.map((c) => ({ ...c, pass: JSON.stringify(c.got) === JSON.stringify(c.expect) }));
    return { allPass: results.every((r) => r.pass), results };
  },
});
