// ============================================================================
// CLI benches for the Setters page's pure rules (repo convention: read
// `allPass` off the output).
//   npx convex run settersPageBench:moneyBench '{}'
// ============================================================================

import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { moneyOf } from "./setterTeamBookingHelpers";
import { isStubLead } from "./settersPageSpeed";
import { dmRows, percentiles } from "./settersPageTeams";
import { teamLabelsFor } from "./settersPageLabels";

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

export const rulesBench = internalQuery({
  args: {},
  handler: async () => {
    const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const cases: Array<{ name: string; pass: boolean }> = [
      { name: "percentiles: empty → nulls", pass: eq(percentiles([]), { median: null, p90: null }) },
      { name: "percentiles: nearest rank, odd", pass: eq(percentiles([5, 1, 3]), { median: 3, p90: 5 }) },
      { name: "percentiles: nearest rank, ten values", pass: eq(percentiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), { median: 5, p90: 9 }) },
      { name: "stub: inferred date", pass: isStubLead({ dateAdded: 1_000_000, dateAddedInferred: true }) === true },
      { name: "stub: dial created the lead (seconds apart)", pass: isStubLead({ dateAdded: 1_000_000, firstDialAt: 1_004_000 }) === true },
      { name: "stub: first text 4 minutes before creation", pass: isStubLead({ dateAdded: 1_000_000, firstSmsOutboundAt: 760_000 }) === true },
      { name: "not a stub: first dial an hour later", pass: isStubLead({ dateAdded: 1_000_000, firstDialAt: 4_600_000 }) === false },
      { name: "not a stub: never touched", pass: isStubLead({ dateAdded: 1_000_000 }) === false },
      {
        name: "dm rows: configured person first, link matched case-insensitively, unconfigured link flagged",
        pass: eq(
          dmRows(
            [
              { id: "Davud", name: "Davud", bookings: 3, due: 3, showed: 1, noShow: 0, rescheduled: 0, unknown: 2, showRatePct: 100, tagged: 0, crmOnly: 0 },
              { id: "Lazar", name: "Lazar", bookings: 2, due: 2, showed: 0, noShow: 0, rescheduled: 0, unknown: 2, showRatePct: null, tagged: 0, crmOnly: 0 },
            ],
            [],
            [{ name: "David K.", linkName: "davud", active: true }],
          ).map((r) => [r.name, r.linkName, r.configured, r.bookings]),
          [["David K.", "davud", true, 3], ["Lazar", "lazar", false, 2]],
        ),
      },
      { name: "labels: defaults fill blanks", pass: eq(teamLabelsFor({ dm: "  ", outbound: "Dialers" }), { dm: "DM setters", outbound: "Dialers", confirmation: "Confirmation setters" }) },
    ];
    return { allPass: cases.every((c) => c.pass), results: cases };
  },
});
