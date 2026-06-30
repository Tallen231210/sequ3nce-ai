// Analytics Step 2 — rule engine for inline recommendations.
//
// Six pure functions, one per Analytics section, each returning at most one
// Recommendation per period. Pure data-in / data-out so they're easy to reason
// about and easy to test in isolation. The Convex query in
// `analyticsRecommendations.ts` is responsible for loading the data; this
// file is responsible for deciding what to surface.
//
// Design notes:
//   - Every threshold is named (no magic numbers in rule bodies).
//   - Closer-comparison rules require a minimum sample size before quoting
//     percentages or naming someone — see SAMPLE_SIZE constants.
//   - Rules skip silently (return null) when data is insufficient. The
//     section card just renders without a callout.
//   - Trend rules require the prior period to have a meaningful sample,
//     otherwise the trend percentage is noise.

import type { Doc } from "../_generated/dataModel";

export type SectionKey =
  | "leak.inCallLosses"
  | "leak.uncollected"
  | "leak.noShows"
  | "whereYouLosing"
  | "whoIsLosing"
  | "leadQuality"
  | "callQuality";

export type Recommendation = {
  id: string;
  section: SectionKey;
  severity: "high" | "medium" | "low";
  headline: string;
  detail?: string;
  action?: { label: string; href: string };
};

type Call = Doc<"calls">;
type Closer = Doc<"closers">;

// Cohort thresholds. Below these, we don't quote stats or name people.
const MIN_TOTAL_CALLS_FOR_ANY_REC = 5;
const MIN_CLOSER_CALLS_TO_NAME = 5;
const MIN_CLOSER_CALLS_TO_QUOTE_RATE = 6;
const MIN_LOST_DEALS_TO_ATTRIBUTE_OBJECTION = 3;
const MIN_PRIOR_COHORT_FOR_TREND = 3;
const MIN_LOST_DEALS_FOR_OBJECTION_SURGE = 5;
const MIN_NO_SHOWS_FOR_RATE_RULE = 4;
const MIN_NO_SHOWS_FOR_TREND_RULE = 3;
const MIN_HIGH_QUALITY_LEADS_FOR_RULE = 5;
const MIN_CLOSER_CALLS_FOR_CHRONIC = 6;
const MIN_PRIOR_CLOSER_CALLS_FOR_DROP = 6;
const MIN_CURRENT_CLOSER_CALLS_FOR_DROP = 4;

// Rule trigger thresholds.
const DOMINANT_OBJECTION_SHARE = 0.4;
const NO_SHOW_RATE_HIGH = 0.25;
const NO_SHOW_TREND_INCREASE = 0.5;
const OBJECTION_SURGE_PREV_MAX_SHARE = 0.2;
const OBJECTION_SURGE_CURR_MIN_SHARE = 0.3;
const CHRONIC_CLOSE_RATE_VS_TEAM_RATIO = 0.5;
const DROP_CLOSE_RATE_VS_PRIOR_RATIO = 0.5;
const HIGH_QUALITY_CLOSE_RATE_FLOOR = 0.6;
const HIGH_QUALITY_SCORE_FLOOR = 7;
// Call-quality thresholds (Step 4).
const TALK_RATIO_HEALTHY_MIN = 0.35;
const TALK_RATIO_HEALTHY_MAX = 0.65;
const DISCOVERY_SIGNAL_GAP_THRESHOLD = 0.3; // 30 percentage-point gap
const MIN_CALLS_FOR_CALL_QUALITY_REC = 8;

const OBJECTION_LABELS: Record<string, string> = {
  spouse_partner: "Spouse/partner",
  price_money: "Price/money",
  timing: "Timing",
  need_to_think: "Need to think",
  not_qualified: "Not qualified",
  logistics: "Logistics",
  competitor: "Competitor",
  other: "Other",
};

function labelObjection(key: string): string {
  return OBJECTION_LABELS[key] ?? key;
}

function formatMoney(n: number): string {
  if (n >= 1000) {
    return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  }
  return `$${Math.round(n)}`;
}

function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// ============================================================================
// Shared input shape — pre-aggregated by the Convex query before passing in.
// ============================================================================

export type RuleInputs = {
  currentCalls: Call[];
  priorCalls: Call[];
  activeClosers: Closer[];
  dateRange: string;
  closerFilter: string | null;
};

// ============================================================================
// Rule 1 — leak.inCallLosses
//
// Trigger: a single objection drove ≥40% of in-call lost dollar amount AND
// at least 3 lost deals carry it. If we can also name a closer who handles
// that objection well (≥5 calls in cohort, materially better close rate),
// fall into the high-severity "have them run a teardown" variant. Otherwise
// fall back to a generic surge callout, or the low-severity fallback.
// ============================================================================

export function recommendInCallLosses(inputs: RuleInputs): Recommendation | null {
  const { currentCalls, activeClosers, dateRange } = inputs;
  const lost = currentCalls.filter(
    (c) => c.outcome === "lost" || c.outcome === "follow_up",
  );
  if (lost.length === 0) return null;

  const dispositionedLost = lost.filter((c) => c.primaryObjection);
  if (dispositionedLost.length < MIN_LOST_DEALS_TO_ATTRIBUTE_OBJECTION) {
    return makeFallbackInCall(lost.length, dateRange);
  }

  const totalLostAmount = dispositionedLost.reduce(
    (sum, c) => sum + (c.contractValue || 0),
    0,
  );
  if (totalLostAmount <= 0) {
    return makeFallbackInCall(lost.length, dateRange);
  }

  const amountByObjection: Record<string, { amount: number; count: number }> = {};
  for (const call of dispositionedLost) {
    const key = call.primaryObjection!;
    if (!amountByObjection[key]) amountByObjection[key] = { amount: 0, count: 0 };
    amountByObjection[key].amount += call.contractValue || 0;
    amountByObjection[key].count++;
  }

  const ranked = Object.entries(amountByObjection).sort(
    ([, a], [, b]) => b.amount - a.amount,
  );
  const [topKey, topData] = ranked[0];
  const share = topData.amount / totalLostAmount;

  if (
    share < DOMINANT_OBJECTION_SHARE ||
    topData.count < MIN_LOST_DEALS_TO_ATTRIBUTE_OBJECTION
  ) {
    return makeFallbackInCall(lost.length, dateRange);
  }

  const objectionLabel = labelObjection(topKey);
  const dominantAmount = topData.amount;

  // Look for a closer to recommend. Need ≥5 calls in the team's calls that
  // hit this objection (closed OR overcome OR pitched-then-lost) AND a
  // meaningfully better close rate than team avg.
  let bestCloser: {
    name: string;
    closeRate: number;
    teamCloseRate: number;
  } | null = null;

  if (activeClosers.length > 1) {
    const calls = currentCalls;
    const objectionCloses = calls.filter(
      (c) =>
        c.outcome === "closed" &&
        c.objectionsOvercome === topKey,
    );
    const objectionLosses = calls.filter(
      (c) =>
        (c.outcome === "lost" || c.outcome === "follow_up") &&
        c.primaryObjection === topKey,
    );
    const objectionTouches = [...objectionCloses, ...objectionLosses];

    const teamRate =
      objectionTouches.length > 0
        ? objectionCloses.length / objectionTouches.length
        : 0;

    let topCandidate: { closer: Closer; rate: number; touches: number } | null = null;
    for (const closer of activeClosers) {
      const myTouches = objectionTouches.filter(
        (c) => c.closerId === closer._id,
      );
      if (myTouches.length < MIN_CLOSER_CALLS_TO_NAME) continue;
      const myCloses = myTouches.filter((c) => c.outcome === "closed").length;
      const rate = myCloses / myTouches.length;
      if (!topCandidate || rate > topCandidate.rate) {
        topCandidate = { closer, rate, touches: myTouches.length };
      }
    }

    if (
      topCandidate &&
      topCandidate.rate > teamRate &&
      topCandidate.rate - teamRate >= 0.15
    ) {
      bestCloser = {
        name: topCandidate.closer.name,
        closeRate: topCandidate.rate,
        teamCloseRate: teamRate,
      };
    }
  }

  if (bestCloser) {
    return {
      id: "in-call-dominant-objection-with-closer",
      section: "leak.inCallLosses",
      severity: "high",
      headline: `${objectionLabel} drove ${formatPct(share)} of in-call losses (${formatMoney(dominantAmount)}). ${bestCloser.name} closes ${formatPct(bestCloser.closeRate)} on ${objectionLabel.toLowerCase()} vs team avg of ${formatPct(bestCloser.teamCloseRate)} — have them run a teardown this week.`,
      action: {
        label: "View losses",
        href: `/dashboard/calls?outcome=lost,follow_up&primaryObjection=${topKey}&dateRange=${encodeURIComponent(dateRange)}`,
      },
    };
  }

  return {
    id: "in-call-dominant-objection",
    section: "leak.inCallLosses",
    severity: "high",
    headline: `${objectionLabel} drove ${formatPct(share)} of in-call losses (${formatMoney(dominantAmount)}, ${topData.count} deal${topData.count === 1 ? "" : "s"}). Worth a focused training session this week.`,
    action: {
      label: "View losses",
      href: `/dashboard/calls?outcome=lost,follow_up&primaryObjection=${topKey}&dateRange=${encodeURIComponent(dateRange)}`,
    },
  };
}

function makeFallbackInCall(
  count: number,
  dateRange: string,
): Recommendation | null {
  if (count < 2) return null;
  return {
    id: "in-call-generic-review",
    section: "leak.inCallLosses",
    severity: "low",
    headline: `${count} deal${count === 1 ? "" : "s"} lost on the call this period. Review them together to spot the common thread.`,
    action: {
      label: "View losses",
      href: `/dashboard/calls?outcome=lost,follow_up&dateRange=${encodeURIComponent(dateRange)}`,
    },
  };
}

// ============================================================================
// Rule 2 — leak.uncollected
//
// Trigger: at least one closed deal with cashCollected < contractValue.
// Surfaces the count + total outstanding + a drill-down link. Medium
// severity — it's friction, not a five-alarm fire.
// ============================================================================

export function recommendUncollected(inputs: RuleInputs): Recommendation | null {
  const { currentCalls, dateRange } = inputs;
  const closed = currentCalls.filter((c) => c.outcome === "closed");
  const uncollected = closed.filter(
    (c) => (c.cashCollected ?? 0) < (c.contractValue ?? 0),
  );
  if (uncollected.length === 0) return null;

  const totalOutstanding = uncollected.reduce(
    (sum, c) => sum + ((c.contractValue || 0) - (c.cashCollected || 0)),
    0,
  );
  if (totalOutstanding <= 0) return null;

  return {
    id: "uncollected-outstanding",
    section: "leak.uncollected",
    severity: "medium",
    headline: `${uncollected.length} closed deal${uncollected.length === 1 ? " has" : "s have"} ${formatMoney(totalOutstanding)} outstanding balance. Worth checking your collections cadence.`,
    action: {
      label: "View list",
      href: `/dashboard/calls?outcome=closed&uncollected=true&dateRange=${encodeURIComponent(dateRange)}`,
    },
  };
}

// ============================================================================
// Rule 3 — leak.noShows
//
// (A) If no-show rate is high (>25%) AND we have at least 4 no-shows in the
//     period — surface the rate-based recommendation.
// (B) Otherwise, if no-shows are up 50%+ vs prior period with prior having
//     at least 3 no-shows for stability — surface the trend recommendation.
// Either rule fires at medium severity; this isn't an immediate revenue
// crisis, it's an upstream funnel issue.
// ============================================================================

export function recommendNoShows(inputs: RuleInputs): Recommendation | null {
  const { currentCalls, priorCalls } = inputs;
  const total = currentCalls.length;
  const noShows = currentCalls.filter((c) => c.outcome === "no_show").length;
  if (noShows === 0) return null;

  const rate = total > 0 ? noShows / total : 0;

  if (rate > NO_SHOW_RATE_HIGH && noShows >= MIN_NO_SHOWS_FOR_RATE_RULE) {
    return {
      id: "no-show-rate-high",
      section: "leak.noShows",
      severity: "medium",
      headline: `No-shows are ${formatPct(rate)} of booked calls — well above the 10-15% norm. Tighter 24h + 1h SMS confirmations typically cut this in half.`,
    };
  }

  const priorNoShows = priorCalls.filter((c) => c.outcome === "no_show").length;
  if (priorNoShows >= MIN_NO_SHOWS_FOR_TREND_RULE) {
    const trend = (noShows - priorNoShows) / priorNoShows;
    if (trend >= NO_SHOW_TREND_INCREASE) {
      return {
        id: "no-show-trend-up",
        section: "leak.noShows",
        severity: "medium",
        headline: `No-shows are up ${formatPct(trend)} vs last period (${noShows} this period, ${priorNoShows} last). Worth checking if a lead-source change is bringing in less-qualified prospects.`,
      };
    }
  }

  return null;
}

// ============================================================================
// Rule 4 — whereYouLosing
//
// Trigger: an objection that was <20% of losses last period is now ≥30% of
// losses this period, AND the prior period had at least 5 lost deals for
// stability. Names the objection that overtook the top spot.
// ============================================================================

export function recommendWhereYouLosing(
  inputs: RuleInputs,
): Recommendation | null {
  const { currentCalls, priorCalls, dateRange } = inputs;
  const currentLost = currentCalls.filter(
    (c) => (c.outcome === "lost" || c.outcome === "follow_up") && c.primaryObjection,
  );
  const priorLost = priorCalls.filter(
    (c) => (c.outcome === "lost" || c.outcome === "follow_up") && c.primaryObjection,
  );

  if (priorLost.length < MIN_LOST_DEALS_FOR_OBJECTION_SURGE) return null;
  if (currentLost.length < MIN_LOST_DEALS_TO_ATTRIBUTE_OBJECTION) return null;

  const countByObjection = (calls: Call[]) => {
    const map: Record<string, number> = {};
    for (const c of calls) {
      const k = c.primaryObjection!;
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  };

  const currMap = countByObjection(currentLost);
  const priorMap = countByObjection(priorLost);

  // Pick a candidate that surged from <20% prior share to >=30% current share.
  let candidate: {
    key: string;
    currShare: number;
    priorShare: number;
  } | null = null;
  for (const [key, currCount] of Object.entries(currMap)) {
    const currShare = currCount / currentLost.length;
    const priorCount = priorMap[key] || 0;
    const priorShare = priorCount / priorLost.length;
    if (
      currShare >= OBJECTION_SURGE_CURR_MIN_SHARE &&
      priorShare < OBJECTION_SURGE_PREV_MAX_SHARE
    ) {
      if (!candidate || currShare > candidate.currShare) {
        candidate = { key, currShare, priorShare };
      }
    }
  }
  if (!candidate) return null;

  // Find what previously held the top spot, if anything, to phrase the
  // "overtaken" framing.
  const priorRanked = Object.entries(priorMap).sort(([, a], [, b]) => b - a);
  const priorTopKey = priorRanked[0]?.[0];
  const overtakenPhrase =
    priorTopKey && priorTopKey !== candidate.key
      ? `has overtaken ${labelObjection(priorTopKey).toLowerCase()} as the top losing objection`
      : `has surged as the top losing objection`;

  return {
    id: "where-losing-objection-surge",
    section: "whereYouLosing",
    severity: "high",
    headline: `${labelObjection(candidate.key)} ${overtakenPhrase} — shifted from ${formatPct(candidate.priorShare)} to ${formatPct(candidate.currShare)} this period. Worth re-checking your pitch around it.`,
    action: {
      label: "View losses",
      href: `/dashboard/calls?outcome=lost,follow_up&primaryObjection=${candidate.key}&dateRange=${encodeURIComponent(dateRange)}`,
    },
  };
}

// ============================================================================
// Rule 5 — whoIsLosing
//
// (A) DROP: a closer who had ≥6 calls last period and ≥4 this period, where
//     current close rate dropped to <50% of prior. High severity — fresh
//     drops are coachable.
// (B) CHRONIC: a closer with ≥6 calls this period and close rate <50% of
//     team average. Medium severity — long-standing pattern.
// Skipped entirely if team has only one active closer OR if a per-closer
// filter is active on the page (the rec is a team-level finding).
// ============================================================================

export function recommendWhoIsLosing(inputs: RuleInputs): Recommendation | null {
  const { currentCalls, priorCalls, activeClosers, closerFilter, dateRange } =
    inputs;
  if (activeClosers.length < 2) return null;
  if (closerFilter) return null;

  type Per = { calls: number; closes: number; rate: number };
  const perCurr = new Map<string, Per>();
  const perPrior = new Map<string, Per>();

  for (const closer of activeClosers) {
    const curr = currentCalls.filter(
      (c) => c.closerId === closer._id && c.outcome !== "no_show",
    );
    const currClosed = curr.filter((c) => c.outcome === "closed").length;
    perCurr.set(closer._id, {
      calls: curr.length,
      closes: currClosed,
      rate: curr.length > 0 ? currClosed / curr.length : 0,
    });

    const prior = priorCalls.filter(
      (c) => c.closerId === closer._id && c.outcome !== "no_show",
    );
    const priorClosed = prior.filter((c) => c.outcome === "closed").length;
    perPrior.set(closer._id, {
      calls: prior.length,
      closes: priorClosed,
      rate: prior.length > 0 ? priorClosed / prior.length : 0,
    });
  }

  // Rule 5A — drop. Pick the closer with the steepest drop (smallest
  // current/prior ratio), NOT the first match in iteration order — otherwise
  // the rec is unstable when multiple closers are dropping in the same
  // period.
  let dropCandidate: {
    closer: Closer;
    curr: Per;
    prior: Per;
    ratio: number;
  } | null = null;
  for (const closer of activeClosers) {
    const curr = perCurr.get(closer._id)!;
    const prior = perPrior.get(closer._id)!;
    if (prior.calls < MIN_PRIOR_CLOSER_CALLS_FOR_DROP) continue;
    if (curr.calls < MIN_CURRENT_CLOSER_CALLS_FOR_DROP) continue;
    if (prior.rate <= 0) continue;
    const ratio = curr.rate / prior.rate;
    if (ratio >= DROP_CLOSE_RATE_VS_PRIOR_RATIO) continue;
    if (!dropCandidate || ratio < dropCandidate.ratio) {
      dropCandidate = { closer, curr, prior, ratio };
    }
  }
  if (dropCandidate) {
    const { closer, curr, prior } = dropCandidate;
    return {
      id: "who-losing-drop",
      section: "whoIsLosing",
      severity: "high",
      headline: `${closer.name} closed ${prior.closes} of ${prior.calls} last period but ${curr.closes} of ${curr.calls} this period. Worth a 1:1 — could be burnout, lead-quality drift, or coachable.`,
      action: {
        label: "View their calls",
        href: `/dashboard/calls?closerId=${closer._id}&dateRange=${encodeURIComponent(dateRange)}`,
      },
    };
  }

  // Rule 5B — chronic underperformer vs team avg
  const teamRateNumer = Array.from(perCurr.values()).reduce(
    (sum, p) => sum + p.closes,
    0,
  );
  const teamRateDenom = Array.from(perCurr.values()).reduce(
    (sum, p) => sum + p.calls,
    0,
  );
  const teamRate = teamRateDenom > 0 ? teamRateNumer / teamRateDenom : 0;
  if (teamRate <= 0) return null;

  let chronicCandidate: { closer: Closer; per: Per } | null = null;
  for (const closer of activeClosers) {
    const per = perCurr.get(closer._id)!;
    if (per.calls < MIN_CLOSER_CALLS_FOR_CHRONIC) continue;
    if (per.rate >= teamRate * CHRONIC_CLOSE_RATE_VS_TEAM_RATIO) continue;
    if (!chronicCandidate || per.rate < chronicCandidate.per.rate) {
      chronicCandidate = { closer, per };
    }
  }
  if (!chronicCandidate) return null;

  const rateText =
    chronicCandidate.per.calls >= MIN_CLOSER_CALLS_TO_QUOTE_RATE
      ? `${formatPct(chronicCandidate.per.rate)} (${chronicCandidate.per.closes} of ${chronicCandidate.per.calls})`
      : `${chronicCandidate.per.closes} of ${chronicCandidate.per.calls}`;

  return {
    id: "who-losing-chronic",
    section: "whoIsLosing",
    severity: "medium",
    headline: `${chronicCandidate.closer.name} is closing at ${rateText} — team average is ${formatPct(teamRate)}. Listen to 2-3 of their recent calls together to find the breakdown.`,
    action: {
      label: "View their calls",
      href: `/dashboard/calls?closerId=${chronicCandidate.closer._id}&dateRange=${encodeURIComponent(dateRange)}`,
    },
  };
}

// ============================================================================
// Rule 6 — leadQuality
//
// Trigger: ≥5 high-quality leads (leadQualityScore >= 7) AND their close
// rate is below 60% — meaning the team is losing good leads. Flag as a
// sales issue, not marketing. Skipped if leadQualityScore data is sparse.
//
// (Previously considered rephrasing as "lead source bad" but calls don't
// have a leadSource field — pivoted to score-band analysis instead.)
// ============================================================================

export function recommendLeadQuality(inputs: RuleInputs): Recommendation | null {
  const { currentCalls } = inputs;
  const scored = currentCalls.filter(
    (c) =>
      typeof c.leadQualityScore === "number" &&
      c.outcome !== "no_show" &&
      c.outcome != null,
  );
  if (scored.length < MIN_HIGH_QUALITY_LEADS_FOR_RULE) return null;

  const highQuality = scored.filter(
    (c) => (c.leadQualityScore || 0) >= HIGH_QUALITY_SCORE_FLOOR,
  );
  if (highQuality.length < MIN_HIGH_QUALITY_LEADS_FOR_RULE) return null;

  const highClosed = highQuality.filter((c) => c.outcome === "closed").length;
  const rate = highClosed / highQuality.length;
  if (rate >= HIGH_QUALITY_CLOSE_RATE_FLOOR) return null;

  return {
    id: "lead-quality-losing-good-leads",
    section: "leadQuality",
    severity: "high",
    headline: `You're closing only ${formatPct(rate)} of your highest-quality leads (${highClosed} of ${highQuality.length}). This is a sales issue, not a marketing issue — your reps are getting good prospects in front of them and not converting.`,
  };
}

// ============================================================================
// Rule 7 & 8 — callQuality (Step 4)
//
// Two complementary rules on the FACTUAL AI signals. Both require a healthy
// sample of verified-attribution calls before firing; the rule engine doesn't
// see unverified calls (the call-quality query already filters them out and
// passes only the aggregated summary).
//
// 7 — Talk-ratio out of band: team avg talk-ratio outside the 35-65%
//     "healthy" band, with at least MIN_CALLS_FOR_CALL_QUALITY_REC verified
//     calls behind the number.
//
// 8 — Discovery-signal gap: closed calls hit a discovery signal (budget,
//     timeline, decision-maker) at a >=30 pp higher rate than lost calls.
//     The signal is the differentiator — surface it as a coaching anchor.
//     Only the BIGGEST gap fires (one rec per period). Requires N >= 6 in
//     both closed and lost cohorts so the rates aren't tiny-sample noise.
// ============================================================================

export type CallQualityInputs = {
  talkRatio: {
    teamAvg: number;
    closedAvg: number;
    lostAvg: number;
    closedCount: number;
    lostCount: number;
  };
  signals: {
    budget: { closedHitRate: number; lostHitRate: number; closedCount: number; lostCount: number };
    timeline: { closedHitRate: number; lostHitRate: number; closedCount: number; lostCount: number };
    decisionMaker: { closedHitRate: number; lostHitRate: number; closedCount: number; lostCount: number };
  };
  verifiedCount: number;
};

export function recommendCallQuality(
  callQuality: CallQualityInputs | null,
): Recommendation | null {
  if (!callQuality) return null;
  if (callQuality.verifiedCount < MIN_CALLS_FOR_CALL_QUALITY_REC) return null;

  // Rule 7 — talk-ratio out of band. Out of band = team is either talking
  // too much (sales monologue) or too little (not steering the call). Both
  // are coachable, with different remediation.
  const r = callQuality.talkRatio.teamAvg;
  if (r > 0 && (r < TALK_RATIO_HEALTHY_MIN || r > TALK_RATIO_HEALTHY_MAX)) {
    const overTalking = r > TALK_RATIO_HEALTHY_MAX;
    const headline = overTalking
      ? `Your team talks ${formatPct(r)} of the call on average — well above the 40-60% sweet spot. Closers usually win by getting prospects talking; the team's monologuing.`
      : `Your team talks only ${formatPct(r)} of the call on average — below the 40-60% sweet spot. Either prospects are dominating (qualification issue) or closers aren't steering the conversation.`;
    return {
      id: overTalking ? "call-quality-overtalking" : "call-quality-undertalking",
      section: "callQuality",
      severity: "high",
      headline,
    };
  }

  // Rule 8 — discovery-signal gap.
  type Signal = { name: string; closed: number; lost: number; gap: number; closedCount: number; lostCount: number };
  const candidates: Signal[] = [
    {
      name: "budget",
      closed: callQuality.signals.budget.closedHitRate,
      lost: callQuality.signals.budget.lostHitRate,
      gap: callQuality.signals.budget.closedHitRate - callQuality.signals.budget.lostHitRate,
      closedCount: callQuality.signals.budget.closedCount,
      lostCount: callQuality.signals.budget.lostCount,
    },
    {
      name: "timeline",
      closed: callQuality.signals.timeline.closedHitRate,
      lost: callQuality.signals.timeline.lostHitRate,
      gap: callQuality.signals.timeline.closedHitRate - callQuality.signals.timeline.lostHitRate,
      closedCount: callQuality.signals.timeline.closedCount,
      lostCount: callQuality.signals.timeline.lostCount,
    },
    {
      name: "decision-maker confirmation",
      closed: callQuality.signals.decisionMaker.closedHitRate,
      lost: callQuality.signals.decisionMaker.lostHitRate,
      gap: callQuality.signals.decisionMaker.closedHitRate - callQuality.signals.decisionMaker.lostHitRate,
      closedCount: callQuality.signals.decisionMaker.closedCount,
      lostCount: callQuality.signals.decisionMaker.lostCount,
    },
  ];

  const ranked = candidates
    .filter(
      (s) =>
        s.gap >= DISCOVERY_SIGNAL_GAP_THRESHOLD &&
        s.closedCount >= 6 &&
        s.lostCount >= 6,
    )
    .sort((a, b) => b.gap - a.gap);

  if (ranked.length === 0) return null;
  const top = ranked[0];
  return {
    id: `call-quality-signal-gap-${top.name.replace(/\s+/g, "-")}`,
    section: "callQuality",
    severity: "medium",
    headline: `${top.name.charAt(0).toUpperCase()}${top.name.slice(1)} comes up in ${formatPct(top.closed)} of closed calls but only ${formatPct(top.lost)} of lost calls. Drilling into this consistently looks like the difference — make it a required discovery step.`,
  };
}

// ============================================================================
// Orchestration — run all rules, build the bySection map + top-N digest.
// ============================================================================

export type RecommendationBundle = {
  bySection: Record<SectionKey, Recommendation | null>;
  top: Recommendation[];
};

const SEVERITY_ORDER: Record<Recommendation["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function runAllRules(
  inputs: RuleInputs,
  callQuality: CallQualityInputs | null,
  options: { topN?: number } = {},
): RecommendationBundle {
  const empty: RecommendationBundle = {
    bySection: {
      "leak.inCallLosses": null,
      "leak.uncollected": null,
      "leak.noShows": null,
      whereYouLosing: null,
      whoIsLosing: null,
      leadQuality: null,
      callQuality: null,
    },
    top: [],
  };

  // Date range too narrow — all-null + empty top. Avoids noisy single-call
  // recs when a manager toggles to "today" and there are 1-2 calls.
  if (inputs.currentCalls.length < MIN_TOTAL_CALLS_FOR_ANY_REC) {
    return empty;
  }

  const recs = {
    "leak.inCallLosses": recommendInCallLosses(inputs),
    "leak.uncollected": recommendUncollected(inputs),
    "leak.noShows": recommendNoShows(inputs),
    whereYouLosing: recommendWhereYouLosing(inputs),
    whoIsLosing: recommendWhoIsLosing(inputs),
    leadQuality: recommendLeadQuality(inputs),
    callQuality: recommendCallQuality(callQuality),
  } as Record<SectionKey, Recommendation | null>;

  const top = (Object.values(recs).filter(Boolean) as Recommendation[])
    .sort((a, b) => {
      const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (s !== 0) return s;
      return a.id.localeCompare(b.id);
    })
    .slice(0, options.topN ?? 3);

  return { bySection: recs, top };
}
