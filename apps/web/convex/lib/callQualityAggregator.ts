// Shared aggregator for Step 4 Call Quality. Used by both the section query
// (`analyticsCallQuality.getCallQualitySummary`) and the recommendation query
// (`analyticsRecommendations.getAnalyticsRecommendations`) so the rule engine
// sees the same numbers the UI sees.
//
// Pure function over already-loaded calls + a verification-status map. The
// caller is responsible for loading calls + meeting-bot verification status;
// this just does the math.

import type { Doc } from "../_generated/dataModel";

type Call = Doc<"calls">;

export const TALK_BUCKETS: Array<{ key: string; min: number; max: number; label: string }> = [
  { key: "very_quiet", min: 0, max: 0.2, label: "0-20%" },
  { key: "quiet", min: 0.2, max: 0.4, label: "20-40%" },
  { key: "balanced", min: 0.4, max: 0.6, label: "40-60%" },
  { key: "talkative", min: 0.6, max: 0.8, label: "60-80%" },
  { key: "dominant", min: 0.8, max: 1.01, label: "80-100%" },
];

function bucketForRatio(ratio: number): string {
  for (const b of TALK_BUCKETS) {
    if (ratio >= b.min && ratio < b.max) return b.key;
  }
  return "dominant";
}

export type CallQualitySummary = {
  confidence: { total: number; verified: number; withTalkTime: number };
  talkRatio: {
    teamAvg: number;
    closedAvg: number;
    lostAvg: number;
    closedCount: number;
    lostCount: number;
    distribution: Array<{ key: string; label: string; count: number }>;
  };
  duration: {
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
};

/**
 * @param allCalls — completed calls for the period (already date-filtered + closer-filtered)
 * @param isVerified — predicate: returns true when a call should be included in
 *   aggregations. The caller is responsible for the speaker-verification check
 *   (typically: no meetingBot OR meetingBot.speakerVerifiedAt is set).
 */
export function computeCallQuality(
  allCalls: Call[],
  isVerified: (call: Call) => boolean,
): CallQualitySummary {
  const verifiedCalls = allCalls.filter(isVerified);

  const withTalkTime = verifiedCalls.filter(
    (c) =>
      typeof c.closerTalkTime === "number" &&
      typeof c.prospectTalkTime === "number" &&
      (c.closerTalkTime + c.prospectTalkTime) > 0,
  );

  const ratios = withTalkTime.map((c) => {
    const total = (c.closerTalkTime || 0) + (c.prospectTalkTime || 0);
    return (c.closerTalkTime || 0) / total;
  });
  const teamAvgRatio =
    ratios.length > 0
      ? ratios.reduce((sum, r) => sum + r, 0) / ratios.length
      : 0;

  const closedTalk = withTalkTime.filter((c) => c.outcome === "closed");
  const lostTalk = withTalkTime.filter(
    (c) => c.outcome === "lost" || c.outcome === "follow_up",
  );

  const avgRatioOf = (calls: Call[]) => {
    if (calls.length === 0) return 0;
    const total = calls.reduce((sum, c) => {
      const t = (c.closerTalkTime || 0) + (c.prospectTalkTime || 0);
      return sum + (c.closerTalkTime || 0) / t;
    }, 0);
    return total / calls.length;
  };

  const distributionMap: Record<string, number> = Object.fromEntries(
    TALK_BUCKETS.map((b) => [b.key, 0]),
  );
  for (const r of ratios) {
    distributionMap[bucketForRatio(r)]++;
  }

  const withDuration = verifiedCalls.filter(
    (c) => typeof c.duration === "number" && (c.duration ?? 0) > 0,
  );
  const closedDur = withDuration.filter((c) => c.outcome === "closed");
  const lostDur = withDuration.filter(
    (c) => c.outcome === "lost" || c.outcome === "follow_up",
  );
  const avgDur = (calls: Call[]) =>
    calls.length === 0
      ? 0
      : calls.reduce((s, c) => s + (c.duration || 0), 0) / calls.length;

  const closedAll = verifiedCalls.filter((c) => c.outcome === "closed");
  const lostAll = verifiedCalls.filter(
    (c) => c.outcome === "lost" || c.outcome === "follow_up",
  );

  const hitRate = (calls: Call[], getDetected: (c: Call) => boolean) =>
    calls.length === 0 ? 0 : calls.filter(getDetected).length / calls.length;

  return {
    confidence: {
      total: allCalls.length,
      verified: verifiedCalls.length,
      withTalkTime: withTalkTime.length,
    },
    talkRatio: {
      teamAvg: teamAvgRatio,
      closedAvg: avgRatioOf(closedTalk),
      lostAvg: avgRatioOf(lostTalk),
      closedCount: closedTalk.length,
      lostCount: lostTalk.length,
      distribution: TALK_BUCKETS.map((b) => ({
        key: b.key,
        label: b.label,
        count: distributionMap[b.key],
      })),
    },
    duration: {
      closedAvg: avgDur(closedDur),
      lostAvg: avgDur(lostDur),
      closedCount: closedDur.length,
      lostCount: lostDur.length,
    },
    signals: {
      budget: {
        closedHitRate: hitRate(closedAll, (c) => !!c.budgetDiscussion?.detected),
        lostHitRate: hitRate(lostAll, (c) => !!c.budgetDiscussion?.detected),
        closedCount: closedAll.length,
        lostCount: lostAll.length,
      },
      timeline: {
        closedHitRate: hitRate(closedAll, (c) => !!c.timelineUrgency?.detected),
        lostHitRate: hitRate(lostAll, (c) => !!c.timelineUrgency?.detected),
        closedCount: closedAll.length,
        lostCount: lostAll.length,
      },
      decisionMaker: {
        closedHitRate: hitRate(closedAll, (c) => !!c.decisionMakerDetection?.detected),
        lostHitRate: hitRate(lostAll, (c) => !!c.decisionMakerDetection?.detected),
        closedCount: closedAll.length,
        lostCount: lostAll.length,
      },
    },
  };
}
