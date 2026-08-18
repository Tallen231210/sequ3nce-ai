import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { mergeDailyRows } from "./closerPerformanceMetrics";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// What's worth raising with each rep.
//
// Every suggestion is drawn from something we already measure. Nothing is
// inferred about how someone is behaving, only about what their numbers did —
// the moment this guesses at attitude it becomes an opinion a manager can
// disagree with, and then they stop reading the ones that are true.
//
// Each suggestion carries the evidence that produced it, so a manager can see
// why rather than take our word for it.
//
// Pure functions, so the rules can be exercised against invented numbers
// without waiting for a rep to have a bad week.
// ============================================================================

export interface Suggestion {
  /** For grouping and dedup, never shown. */
  code: string;
  /** What to say, in the manager's language. */
  text: string;
  /** The number behind it. */
  evidence: string;
  severity: "high" | "medium" | "low";
}

const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${Math.round(n)}%`;

/** A rate moving less than this is noise, not a story. */
const MEANINGFUL_DROP = 15;

/** Below this, one bad call swings the rate and the comparison means nothing. */
const MIN_CALLS = 5;

export interface RateWindow {
  showPct: number | null;
  offerClosePct: number | null;
  closePct: number | null;
  taken: number;
}

/**
 * Compare two windows of the same rep's numbers and say what changed.
 *
 * Compares RATES, never totals. A rep who took half as many calls will have
 * halved their closes, and reporting that as a collapse would be true and
 * useless.
 */
export function buildRateSuggestions(
  recent: RateWindow,
  prior: RateWindow,
): Suggestion[] {
  const out: Suggestion[] = [];
  if (recent.taken < MIN_CALLS || prior.taken < MIN_CALLS) return out;

  const drop = (now: number | null, before: number | null): number | null =>
    now === null || before === null ? null : before - now;

  const offerDrop = drop(recent.offerClosePct, prior.offerClosePct);
  if (offerDrop !== null && offerDrop >= MEANINGFUL_DROP) {
    out.push({
      code: "offer_rate_down",
      text: "They're taking calls but not pitching on them",
      evidence: `Offer→close ${pct(prior.offerClosePct)} → ${pct(recent.offerClosePct)}`,
      severity: "high",
    });
  }

  const showDrop = drop(recent.showPct, prior.showPct);
  if (showDrop !== null && showDrop >= MEANINGFUL_DROP) {
    out.push({
      code: "show_rate_down",
      // Show rate is the SETTER's KPI, not the closer's. Phrased as something
      // to look into rather than something this rep did wrong.
      text: "Fewer of their booked calls are showing up",
      evidence: `Show rate ${pct(prior.showPct)} → ${pct(recent.showPct)}`,
      severity: "medium",
    });
  }

  const closeDrop = drop(recent.closePct, prior.closePct);
  if (closeDrop !== null && closeDrop >= MEANINGFUL_DROP) {
    out.push({
      code: "close_rate_down",
      text: "Their close rate has dropped",
      evidence: `Close rate ${pct(prior.closePct)} → ${pct(recent.closePct)}`,
      severity: "high",
    });
  }

  return out;
}

/**
 * A rep who worked and didn't file. Uses exactly the rule the end-of-day
 * nudge uses, so the two can never disagree about who is missing.
 */
export function buildEodSuggestion(missedDays: number): Suggestion | null {
  if (missedDays < 2) return null;
  return {
    code: "eod_missing",
    text: "They haven't been filing their end-of-day",
    evidence: `${missedDays} day${missedDays === 1 ? "" : "s"} missing in the last two weeks`,
    severity: missedDays >= 4 ? "high" : "medium",
  };
}

export function buildBalanceSuggestion(
  count: number,
  total: number,
): Suggestion | null {
  if (count === 0) return null;
  return {
    code: "outstanding_balance",
    text: "They have money outstanding from closed deals",
    evidence: `${count} balance${count === 1 ? "" : "s"}, $${Math.round(total).toLocaleString("en-US")} owed`,
    severity: total >= 10_000 ? "high" : "medium",
  };
}

const OBJECTION_LABEL: Record<string, string> = {
  price_money: "price",
  need_to_think: "needing to think about it",
  spouse_partner: "speaking to a partner",
  timing: "timing",
  trust_credibility: "trust",
  not_decision_maker: "not being the decision maker",
};

export function buildObjectionSuggestion(
  topObjection: string | null,
  count: number,
  ofCalls: number,
): Suggestion | null {
  // One or two calls is an anecdote. A pattern has to actually be a pattern.
  if (!topObjection || count < 3 || ofCalls === 0) return null;
  const share = Math.round((count / ofCalls) * 100);
  if (share < 40) return null;

  return {
    code: "objection_pattern",
    text: `They keep losing to ${OBJECTION_LABEL[topObjection] ?? topObjection.replace(/_/g, " ")}`,
    evidence: `${count} of their last ${ofCalls} lost calls (${share}%)`,
    severity: "medium",
  };
}

/**
 * REMOVED: "most of their calls have no outcome logged".
 *
 * Coverage deliberately counts an AI-read outcome as unconfirmed, so the board
 * can never present numbers as human-verified when they aren't. That was right
 * when closers filled in post-call forms. They don't any more — the form was
 * removed and the AI reads every call — so the figure is now 100% for every
 * rep, permanently.
 *
 * A warning that fires for everyone forever teaches people to skip the whole
 * list, including the suggestions that are true. Verified against ManyJobs:
 * "17 of 17" and "42 of 42".
 */

/** Highest severity first, then stable by code so the order doesn't jitter. */
export function rankSuggestions(list: Suggestion[]): Suggestion[] {
  const weight = { high: 0, medium: 1, low: 2 } as const;
  return [...list].sort(
    (a, b) => weight[a.severity] - weight[b.severity] || a.code.localeCompare(b.code),
  );
}

/**
 * Days in the window where a closer worked but filed nothing.
 *
 * Same judgement the nudge makes: "worked" is decided on MEASURED activity,
 * never the merged total — the merged value includes what they typed, so
 * using it would ask "did they report?" to decide whether to chase a missing
 * report, and nobody would ever be chased.
 */
export const countMissedEodDays = internalQuery({
  args: {
    teamId: v.id("teams"),
    closerId: v.id("closers"),
    fromDay: v.string(),
    toDay: v.string(),
  },
  handler: async (ctx, args) => {
    const [stats, overrides, entries] = await Promise.all([
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", args.teamId).gte("dayKey", args.fromDay).lte("dayKey", args.toDay),
        )
        .collect(),
      ctx.db
        .query("closerDailyOverrides")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", args.teamId).gte("dayKey", args.fromDay).lte("dayKey", args.toDay),
        )
        .collect(),
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", args.teamId).gte("dayKey", args.fromDay).lte("dayKey", args.toDay),
        )
        .collect(),
    ]);

    let missed = 0;
    for (const row of mergeDailyRows(stats, overrides, entries)) {
      if (String(row.closerId) !== String(args.closerId)) continue;
      const worked = row.measured.booked > 0 || row.measured.taken > 0;
      if (worked && !row.confirmed) missed++;
    }
    return missed;
  },
});
