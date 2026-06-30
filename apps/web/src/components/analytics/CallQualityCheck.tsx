"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Info, AlertTriangle } from "lucide-react";
import { formatPercent } from "@/lib/analytics-utils";
import { RecommendationCallout } from "./RecommendationCallout";
import type { Recommendation } from "@/lib/analytics-types";

/**
 * Call Quality — Step 4 of the Analytics revamp. First section to consume
 * AI-derived data; gated behind a data-confidence indicator and a strict
 * "factual signals only" rule (no AI judgment scores in this section).
 *
 * Factual signals shown:
 *   - Talk ratio (Deepgram diarization) — team avg + closed vs lost + histogram
 *   - Discovery signal hit rates: budget / timeline / decision-maker
 *     (objective regex-LLM detection on the transcript)
 *   - Avg call duration: closed vs lost
 *
 * Excluded from aggregations:
 *   - Calls whose meeting bot's speakerVerifiedAt is null (speaker mapping
 *     unreliable — talk-time numbers could be backward)
 *   - Calls without talk-time data (post-processing not finished yet)
 */
type Signal = {
  closedHitRate: number;
  lostHitRate: number;
  closedCount: number;
  lostCount: number;
};

interface CallQualityProps {
  data:
    | {
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
          budget: Signal;
          timeline: Signal;
          decisionMaker: Signal;
        };
      }
    | undefined;
  isLoading?: boolean;
  recommendation?: Recommendation | null;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-44 bg-zinc-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-32 bg-zinc-100 rounded animate-pulse" />
          <div className="h-32 bg-zinc-100 rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}m ${sec.toString().padStart(2, "0")}s`;
}

function ratioBand(ratio: number): "low" | "ok" | "high" {
  if (ratio < 0.35) return "low";
  if (ratio > 0.65) return "high";
  return "ok";
}

const BAND_COLOR: Record<"low" | "ok" | "high", string> = {
  low: "text-amber-600",
  ok: "text-emerald-600",
  high: "text-amber-600",
};

export function CallQualityCheck({ data, isLoading, recommendation }: CallQualityProps) {
  if (isLoading || !data) return <LoadingSkeleton />;

  const { confidence, talkRatio, duration, signals } = data;

  // Empty / insufficient-data state — render the card with the explanation
  // but no metrics. We don't fake numbers when we have nothing to show.
  if (confidence.verified === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Call Quality</CardTitle>
            <Badge variant="outline" className="text-xs">AI-derived</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 bg-zinc-100 rounded-full mb-3">
              <Mic className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium">No verified call data yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Speaker-attributed analytics show up once meeting-bot calls
              finish post-processing. {confidence.total > 0 ? `${confidence.total} call${confidence.total === 1 ? "" : "s"} in this period are still being processed or were recorded without the bot.` : ""}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const talkBand = ratioBand(talkRatio.teamAvg);
  const maxBucket = Math.max(...talkRatio.distribution.map((b) => b.count));

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Call Quality</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">AI-derived</Badge>
            <span
              className="text-xs text-muted-foreground flex items-center gap-1"
              title="Calls whose speaker attribution couldn't be verified are excluded from these numbers — their talk-time could be misattributed."
            >
              <Info className="h-3 w-3" />
              Based on {confidence.verified} of {confidence.total} call
              {confidence.total === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hero — team-avg talk ratio with band coloring */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="p-4 bg-zinc-50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Team talk ratio</span>
              <span className="text-xs text-muted-foreground">
                Healthy range 40-60%
              </span>
            </div>
            {talkRatio.closedCount + talkRatio.lostCount === 0 ? (
              <div className="text-sm text-muted-foreground italic mt-2">
                Talk-time post-processing pending.
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className={`text-4xl font-semibold ${BAND_COLOR[talkBand]}`}>
                    {formatPercent(talkRatio.teamAvg * 100)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    closer talking
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {talkBand === "high"
                    ? "Team's monologuing — let prospects talk more."
                    : talkBand === "low"
                      ? "Team's too quiet — drive the conversation more."
                      : "In the sweet spot."}
                </div>
              </>
            )}
          </div>

          {/* Closed vs lost talk ratio */}
          <div className="p-4 bg-zinc-50 rounded-lg">
            <div className="text-sm text-muted-foreground mb-3">
              Talk ratio: closed vs lost
            </div>
            <RatioCompareRow
              label="Closed deals"
              ratio={talkRatio.closedAvg}
              count={talkRatio.closedCount}
            />
            <div className="mt-2" />
            <RatioCompareRow
              label="Lost deals"
              ratio={talkRatio.lostAvg}
              count={talkRatio.lostCount}
            />
          </div>
        </div>

        {/* Distribution histogram */}
        {maxBucket > 0 && (
          <div>
            <div className="text-sm text-muted-foreground mb-2">
              Talk-ratio distribution
            </div>
            <div className="flex items-end gap-2 h-16">
              {talkRatio.distribution.map((b) => (
                <div key={b.key} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t ${b.key === "balanced" ? "bg-emerald-400" : "bg-zinc-300"}`}
                    style={{
                      height: maxBucket > 0 ? `${(b.count / maxBucket) * 100}%` : "0%",
                      minHeight: b.count > 0 ? "4px" : "0",
                    }}
                  />
                  <div className="text-xs text-muted-foreground">{b.label}</div>
                  <div className="text-xs font-medium">{b.count}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discovery signal hit rates */}
        <div>
          <div className="text-sm text-muted-foreground mb-2">
            Discovery signals — closed vs lost hit rates
          </div>
          <div className="space-y-2">
            <SignalRow label="Budget discussed" signal={signals.budget} />
            <SignalRow label="Timeline / urgency" signal={signals.timeline} />
            <SignalRow label="Decision-maker confirmed" signal={signals.decisionMaker} />
          </div>
        </div>

        {/* Duration comparison */}
        {duration.closedCount + duration.lostCount > 0 && (
          <div className="p-3 bg-zinc-50 rounded-lg flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">Avg call duration</span>
            <div className="flex items-center gap-4">
              <span>
                Closed:{" "}
                <span className="font-medium text-foreground">
                  {formatDuration(duration.closedAvg)}
                </span>
              </span>
              <span>
                Lost:{" "}
                <span className="font-medium text-foreground">
                  {formatDuration(duration.lostAvg)}
                </span>
              </span>
            </div>
          </div>
        )}

        <RecommendationCallout recommendation={recommendation} />
      </CardContent>
    </Card>
  );
}

function RatioCompareRow({
  label,
  ratio,
  count,
}: {
  label: string;
  ratio: number;
  count: number;
}) {
  if (count === 0) {
    return (
      <div className="text-xs text-muted-foreground">{label}: no data</div>
    );
  }
  const closerPct = ratio * 100;
  const prospectPct = 100 - closerPct;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span>
          {label} <span className="text-muted-foreground">({count})</span>
        </span>
        <span className="font-medium">{formatPercent(closerPct)} closer</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-zinc-200">
        <div className="bg-zinc-700" style={{ width: `${closerPct}%` }} />
        <div className="bg-zinc-300" style={{ width: `${prospectPct}%` }} />
      </div>
    </div>
  );
}

function SignalRow({ label, signal }: { label: string; signal: Signal }) {
  if (signal.closedCount + signal.lostCount === 0) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">no data</span>
      </div>
    );
  }
  const gap = signal.closedHitRate - signal.lostHitRate;
  // Note: the UI badge threshold (20pp) is intentionally LOWER than the
  // rec-engine threshold (30pp) — so customers see informational gap badges
  // before any single signal crosses into "we have a recommendation for you"
  // territory. The badge is awareness; the rec is action.
  const isInteresting =
    Math.abs(gap) >= 0.2 && signal.closedCount >= 3 && signal.lostCount >= 3;
  return (
    <div className="grid grid-cols-[1fr,auto,auto] items-center gap-3 text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          Closed:{" "}
          <span className="font-medium text-foreground">
            {formatPercent(signal.closedHitRate * 100)}
          </span>
        </span>
        <span>
          Lost:{" "}
          <span className="font-medium text-foreground">
            {formatPercent(signal.lostHitRate * 100)}
          </span>
        </span>
      </div>
      {isInteresting && (
        <Badge
          variant="outline"
          // Positive gap = closed calls hit this signal MORE = good
          // differentiator (do more of this). Emerald, not amber — amber
          // would read as warning when it's actually opportunity.
          // Negative gap = lost calls hit it more = anomaly. Zinc-subtle,
          // because the manager probably wants to investigate, not act.
          className={`text-xs ${gap > 0 ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-zinc-200 text-zinc-600"}`}
          title={
            gap > 0
              ? "Closed calls hit this signal materially more often — likely a differentiator. Make it a habit on every call."
              : "Lost calls hit this signal more often — unusual. Worth listening to a few to understand what's happening."
          }
        >
          {gap > 0 ? "↑" : "↓"} {formatPercent(Math.abs(gap) * 100)} gap
        </Badge>
      )}
    </div>
  );
}
