// ============================================================================
// CLI benches for the color rulebook helpers (repo convention: unit tests are
// internalQuery benches):
//   npx convex run calendarColorBench:colorRulesBench '{}'
//   npx convex run calendarColorBench:bookingExclusionsBench '{}'
// Read `allPass` off the output. Cases are real shapes from E2's calendars.
// ============================================================================

import { internalQuery } from "./_generated/server";
import { COLOR, recolorState, type ColorTrackedEvent, type RecolorState } from "./lib/calendarColorRules";
import { classifyExcludedTitle, isExcludedBookingTitle } from "./lib/bookingExclusions";

const H = 60 * 60 * 1000;
const D = 24 * H;
const NOW = Date.parse("2026-09-08T20:00:00Z");
/** A call yesterday 14:00–15:00 UTC; well past the 2h grace. */
const START = NOW - D - 6 * H;
const END = START + H;

const ev = (over: Partial<ColorTrackedEvent>): ColorTrackedEvent => ({
  startTime: START,
  endTime: END,
  ...over,
});

export const colorRulesBench = internalQuery({
  args: {},
  handler: async () => {
    const cases: Array<{ name: string; input: ColorTrackedEvent; expect: RecolorState }> = [
      { name: "call still ahead", input: ev({ startTime: NOW + H, endTime: NOW + 2 * H, eventColorId: COLOR.RED }), expect: "not_due" },
      { name: "inside grace after end", input: ev({ startTime: NOW - 2 * H, endTime: NOW - H, eventColorId: COLOR.RED }), expect: "not_due" },
      { name: "uncolored", input: ev({}), expect: "uncolored" },
      { name: "light green left after the call", input: ev({ eventColorId: COLOR.LIGHT_GREEN, colorChangedAt: START + 2 * H }), expect: "left_light_green" },
      { name: "orange left after the call", input: ev({ eventColorId: COLOR.ORANGE, colorFirstObservedAt: START - D }), expect: "other_color" },
      { name: "recolored red, change observed after start", input: ev({ eventColorId: COLOR.RED, colorFirstObservedAt: START - D, colorChangedAt: START + 3 * H }), expect: "done" },
      { name: "15-min straddle: change seen 5 min after start", input: ev({ eventColorId: COLOR.DARK_GREEN, colorFirstObservedAt: START - D, colorChangedAt: START + 5 * 60_000 }), expect: "done" },
      { name: "red seen before the call, never changed", input: ev({ eventColorId: COLOR.RED, colorFirstObservedAt: START - D, googleUpdatedAt: START + H }), expect: "pre_colored_untouched" },
      { name: "dark green first seen after start, but Google says last edit was before", input: ev({ eventColorId: COLOR.DARK_GREEN, colorFirstObservedAt: START + 5 * H, googleUpdatedAt: START - 2 * H }), expect: "pre_colored_untouched" },
      { name: "red first seen after start, Google edit after start: can't tell", input: ev({ eventColorId: COLOR.RED, colorFirstObservedAt: START + 5 * H, googleUpdatedAt: START + 4 * H }), expect: "unverified" },
      { name: "backfilled row: no timestamps but the color", input: ev({ eventColorId: COLOR.YELLOW, colorFirstObservedAt: NOW - H }), expect: "unverified" },
      { name: "rescheduled: yellow set Monday, call moved to Wednesday, not recolored since", input: ev({ eventColorId: COLOR.YELLOW, colorFirstObservedAt: START - 5 * D, colorChangedAt: START - 2 * D }), expect: "pre_colored_untouched" },
      { name: "changed before start only (pre-call confirmation edits)", input: ev({ eventColorId: COLOR.DARK_GREEN, colorFirstObservedAt: START - 3 * D, colorChangedAt: START - H }), expect: "pre_colored_untouched" },
    ];
    const results = cases.map((c) => ({
      name: c.name,
      got: recolorState(c.input, NOW),
      expect: c.expect,
      pass: recolorState(c.input, NOW) === c.expect,
    }));
    return { allPass: results.every((r) => r.pass), results };
  },
});

export const bookingExclusionsBench = internalQuery({
  args: {},
  handler: async () => {
    // E2's own words live in the team list; the generic rule must not know them.
    const E2 = ["read", "gym", "prayer", "trading", "ny session", "meditation", "sonia session"];
    const cases: Array<{ title: string; team?: string[]; expect: ReturnType<typeof classifyExcludedTitle> }> = [
      { title: "Canceled: Carter Motz and Karl Dargan", expect: "cancelled" },
      { title: "Cancelled: Andy and Ryleigh Harris", expect: "cancelled" },
      { title: "Block", expect: "non_sales" },
      { title: "Ai Implementation STM", expect: "non_sales" },
      { title: "Call Confirmations + Follow Up", expect: "non_sales" },
      { title: "follow ups, confirmations", expect: "non_sales" },
      { title: "Follow ups", expect: "non_sales" },
      { title: "Zion 1on1", expect: "non_sales" },
      { title: "Weekly 1:1 with Karl", expect: "non_sales" },
      { title: "Daily standup", expect: "non_sales" },
      { title: "Do not book — training", expect: "non_sales" },
      // Team words: excluded only when the team lists them.
      { title: "NY Session", expect: null },
      { title: "NY Session", team: E2, expect: "non_sales" },
      { title: "Prayer, Meditation & Bible", expect: null },
      { title: "Prayer, Meditation & Bible", team: E2, expect: "non_sales" },
      { title: "Gym", team: E2, expect: "non_sales" },
      // A team word must match at the START of the title, on a word boundary.
      { title: "Reading with Rob and Karl", team: E2, expect: null },
      { title: "Read Smith and Karl", expect: null },
      { title: "Andrew Gymer and Karl", team: E2, expect: null },
      // Real bookings stay bookings.
      { title: "(M) Guneet and Joseph | AIM Follow up call", team: E2, expect: null },
      { title: "Jody and Ryleigh - Follow Up", team: E2, expect: null },
      { title: "Shannon and Brittany Thatcher", team: E2, expect: null },
      { title: "AI Implementation Consult: Karl and Darrell (e)", team: E2, expect: null },
      { title: "", expect: null },
    ];
    const results = cases.map((c) => {
      const got = classifyExcludedTitle(c.title, c.team);
      return { title: c.title, team: !!c.team, got, expect: c.expect, pass: got === c.expect && isExcludedBookingTitle(c.title, c.team) === (c.expect !== null) };
    });
    return { allPass: results.every((r) => r.pass), results };
  },
});
