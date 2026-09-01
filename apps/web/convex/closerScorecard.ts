/**
 * Closer Scorecard — E2's manager-facing closer analogue of the setter
 * scorecard. Spec: docs/superpowers/specs/2026-08-25-closer-scorecard-design.md
 *
 * NOT to be confused with:
 *  - closerScorecardData.ts / closerScorecardSettings.ts — the daily
 *    Slack/Discord post for the Team Performance board (July 2026).
 *  - scorecard.ts — the SETTER weekly projection scorecard.
 */
import { internalQuery } from "./_generated/server";
import { isFollowUpTitle } from "./lib/followUpTitle";

/** CLI bench for the follow-up matcher (repo convention: unit tests are
 * internalQuery benches — npx convex run --prod closerScorecard:followUpTitleBench '{}'). */
export const followUpTitleBench = internalQuery({
  args: {},
  handler: async () => {
    const cases: Array<{ title: string; expect: boolean }> = [
      { title: "Follow up - John x Ethan", expect: true },
      { title: "(er) Follow-up call", expect: true },
      { title: "followup w/ John", expect: true },
      { title: "FOLLOW UP: payment", expect: true },
      { title: "John Follow    up", expect: true }, // any run of spaces/hyphens
      { title: "Canceled: follow-up with Sam", expect: true }, // anywhere in title
      { title: "(er) John x Ethan", expect: false },
      { title: "FU John", expect: false },
      { title: "Fellowship onboarding", expect: false },
      { title: "Following up next steps doc", expect: false }, // "following" ≠ "follow up"
      { title: "", expect: false },
    ];
    const results = cases.map((c) => ({
      title: c.title,
      got: isFollowUpTitle(c.title),
      pass: isFollowUpTitle(c.title) === c.expect,
    }));
    return { allPass: results.every((r) => r.pass), results };
  },
});
