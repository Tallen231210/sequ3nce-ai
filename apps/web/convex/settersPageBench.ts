// ============================================================================
// CLI benches for the Setters page's pure rules (repo convention: read
// `allPass` off the output).
//   npx convex run settersPageBench:moneyBench '{}'
// ============================================================================

import { v } from "convex/values";
import { deriveWindow, describeWindow, hourInWindow } from "./lib/workingWindow";
import { internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { moneyOf } from "./setterTeamBookingHelpers";
import { isStubLead } from "./settersPageSpeed";
import { dialConnected } from "./lib/dialAnswered";
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
      { name: "connect: answered but 3 seconds at a 30s threshold", pass: dialConnected({ callDurationSec: 3, disposition: "answered" }, 30) === false },
      { name: "connect: answered, 45 seconds at 30s", pass: dialConnected({ callDurationSec: 45, disposition: "answered" }, 30) === true },
      { name: "connect: no-answer never counts", pass: dialConnected({ callDurationSec: 90, disposition: "no-answer" }, 30) === false },
      { name: "connect: no disposition, over threshold", pass: dialConnected({ callDurationSec: 70 }, 60) === true },
      { name: "connect: nothing known", pass: dialConnected(undefined, 60) === false },
      { name: "stub: inferred date", pass: isStubLead({ dateAdded: 1_000_000, dateAddedInferred: true }) === true },
      { name: "stub: a setter's dial created the lead (seconds apart)", pass: isStubLead({ dateAdded: 1_000_000, firstDialAt: 1_004_000, firstDialByUserId: "user_x" }) === true },
      { name: "not a stub: automated dial seconds after creation (no user)", pass: isStubLead({ dateAdded: 1_000_000, firstDialAt: 1_004_000 }) === false },
      { name: "not a stub: first dial an hour later", pass: isStubLead({ dateAdded: 1_000_000, firstDialAt: 4_600_000, firstDialByUserId: "user_x" }) === false },
      { name: "not a stub: never touched", pass: isStubLead({ dateAdded: 1_000_000 }) === false },
      {
        name: "dm rows: configured person first, link matched case-insensitively, unconfigured link flagged",
        pass: eq(
          dmRows(
            [
              { id: "Davud", name: "Davud", bookings: 3, due: 3, showed: 1, noShow: 0, rescheduled: 0, unknown: 2, showRatePct: 100, tagged: 0, crmOnly: 0, claimed: 0 },
              { id: "Lazar", name: "Lazar", bookings: 2, due: 2, showed: 0, noShow: 0, rescheduled: 0, unknown: 2, showRatePct: null, tagged: 0, crmOnly: 0, claimed: 0 },
            ],
            [],
            [{ name: "David K.", linkName: "davud", active: true }],
          ).map((r) => [r.name, r.linkName, r.configured, r.bookings]),
          [["David K.", "davud", true, 3], ["Lazar", "lazar", false, 2]],
        ),
      },
      { name: "labels: defaults fill blanks", pass: eq(teamLabelsFor({ dm: "  ", outbound: "Dialers" }), { dm: "DM setters", outbound: "Dialers", confirmation: "Confirmation setters", unlabeled: "Unlabeled" }) },
    ];
    return { allPass: cases.every((c) => c.pass), results: cases };
  },
});

/**
 * Diagnostic: where do a team's leads' arrival times come from, and how fast
 * is the first touch by anyone? Read-only; run on production for one team.
 *   npx convex run settersPageBench:arrivalAudit '{"teamId":"…","days":7}' --prod
 */
export const arrivalAudit = internalQuery({
  args: { teamId: v.id("teams"), days: v.number() },
  handler: async (ctx, args) => {
    const endMs = Date.now();
    const startMs = endMs - args.days * 24 * 60 * 60 * 1000;
    const leads = await ctx.db
      .query("setterLeads")
      .withIndex("by_team_and_date_added", (q) => q.eq("teamId", args.teamId).gte("dateAdded", startMs).lt("dateAdded", endMs))
      .order("desc")
      .take(2_000);
    const FIVE = 5 * 60 * 1000;
    const buckets = { total: 0, inferredDate: 0, dialByPersonWithin5m: 0, dialNoUserWithin5m: 0, smsWithin5m: 0, noDialYet: 0, dialLater: 0 };
    const delaysMin: number[] = [];
    const sample: Array<Record<string, unknown>> = [];
    for (const l of leads) {
      if (l.isInternal === true) continue;
      buckets.total += 1;
      if (l.dateAddedInferred === true) buckets.inferredDate += 1;
      const d = l.firstDialAt;
      if (d === undefined) buckets.noDialYet += 1;
      else if (Math.abs(d - l.dateAdded) <= FIVE) {
        if (l.firstDialByUserId) buckets.dialByPersonWithin5m += 1;
        else buckets.dialNoUserWithin5m += 1;
      } else {
        buckets.dialLater += 1;
        delaysMin.push(Math.round((d - l.dateAdded) / 60000));
      }
      if (l.firstSmsOutboundAt !== undefined && Math.abs(l.firstSmsOutboundAt - l.dateAdded) <= FIVE) buckets.smsWithin5m += 1;
      if (sample.length < 8 && d !== undefined) {
        sample.push({ name: l.name ?? l.email ?? "?", created: new Date(l.dateAdded).toISOString(), inferred: l.dateAddedInferred ?? false, firstDial: new Date(d).toISOString(), byUser: l.firstDialByUserId ?? null, firstSms: l.firstSmsOutboundAt ? new Date(l.firstSmsOutboundAt).toISOString() : null, source: l.source ?? null });
      }
    }
    delaysMin.sort((a, b) => a - b);
    const at = (p: number) => (delaysMin.length ? delaysMin[Math.max(0, Math.ceil(p * delaysMin.length) - 1)] : null);
    return { ...buckets, dialLaterDelayMin: { median: at(0.5), p25: at(0.25), p75: at(0.75) }, sample };
  },
});


/**
 * The derived working window. The case that matters is the overnight one:
 * a setter in London reads as ~3:00–11:00 Eastern, and a window that wraps
 * midnight has no meaningful median hour — which is why the rule takes the
 * tightest covering span rather than percentiles.
 */
export const workingWindowBench = internalQuery({
  args: {},
  handler: async () => {
    const many = (day: number, hour: number, n: number) => Array.from({ length: n }, () => ({ day, hour }));
    const nineToFive = [1, 2, 3, 4, 5].flatMap((d) => [9, 10, 11, 13, 14, 15, 16].flatMap((h) => many(d, h, 3)));
    const london = [1, 2, 3, 4, 5].flatMap((d) => [3, 4, 5, 6, 7, 8, 9, 10].flatMap((h) => many(d, h, 3)));
    const evenings = [1, 2, 3, 4, 5].flatMap((d) => [19, 20, 21, 22, 23, 0, 1].flatMap((h) => many(d, h, 3)));
    const w = (calls: Array<{ day: number; hour: number }>) => deriveWindow(calls);
    const cases = [
      { name: "a 9-5 week comes back as 9-5", got: (() => { const r = w(nineToFive)!; return `${r.startHour}-${r.endHour}`; })(), expect: "9-17" },
      { name: "5 weekdays are recognised", got: String(w(nineToFive)!.days.join(",")), expect: "1,2,3,4,5" },
      { name: "a London setter reads as an early team-local window", got: (() => { const r = w(london)!; return `${r.startHour}-${r.endHour}`; })(), expect: "3-11" },
      { name: "an overnight shift wraps past midnight", got: (() => { const r = w(evenings)!; return `${r.startHour}-${r.endHour}`; })(), expect: "19-2" },
      { name: "too few calls means we don't guess", got: String(w(many(1, 10, 20))), expect: "null" },
      { name: "one stray Sunday call doesn't make Sunday a work day", got: String(w([...nineToFive, { day: 0, hour: 11 }])!.days.includes(0)), expect: "false" },
      { name: "a real Sunday shift does", got: String(w([...nineToFive, ...many(0, 11, 40)])!.days.includes(0)), expect: "true" },
      { name: "an hour inside a normal window", got: String(hourInWindow(10, 9, 17)), expect: "true" },
      { name: "an hour outside a normal window", got: String(hourInWindow(22, 9, 17)), expect: "false" },
      { name: "midnight is inside a wrapping window", got: String(hourInWindow(0, 19, 2)), expect: "true" },
      { name: "noon is outside a wrapping window", got: String(hourInWindow(12, 19, 2)), expect: "false" },
      { name: "a wrapping window says so", got: describeWindow({ days: [1, 2], startHour: 22, endHour: 6 }), expect: "22:00–6:00 (overnight), 2 days a week" },
    ];
    const results = cases.map((c) => ({ ...c, pass: c.got === c.expect }));
    return { allPass: results.every((r) => r.pass), results };
  },
});
