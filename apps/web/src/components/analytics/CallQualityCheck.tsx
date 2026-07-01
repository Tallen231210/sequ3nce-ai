"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/analytics-utils";
import { MONO } from "./primitives/typography";
import { TileGroup, MetricTile } from "./primitives/MetricTile";
import { RecommendationCallout } from "./RecommendationCallout";
import type { Recommendation } from "@/lib/analytics-types";

/**
 * Call Quality — Step 4 of the Analytics revamp. First section to consume
 * AI-derived data; gated behind a data-confidence indicator and a strict
 * "factual signals only" rule (no AI judgment scores in this section).
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
        <div className="h-5 w-36 animate-pulse rounded bg-zinc-100" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-2">
          <div className="h-28 animate-pulse bg-zinc-50" />
          <div className="h-28 animate-pulse bg-zinc-50" />
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

// Out-of-band talk ratio is a real signal — amber. In the sweet spot is
// affirming — emerald. These are the section's deliberate color accents.
const BAND_COLOR: Record<"low" | "ok" | "high", string> = {
  low: "text-amber-600",
  ok: "text-emerald-600",
  high: "text-amber-600",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
      {children}
    </div>
  );
}

export function CallQualityCheck({ data, isLoading, recommendation }: CallQualityProps) {
  if (isLoading || !data) return <LoadingSkeleton />;

  const { confidence, talkRatio, duration, signals } = data;

  if (confidence.verified === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold tracking-tight">Call quality</CardTitle>
            <AiDerivedChip />
          </div>
        </CardHeader>
        <CardContent>
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-zinc-700">No verified call data yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
              Speaker-attributed analytics show up once meeting-bot calls finish
              post-processing.
              {confidence.total > 0
                ? ` ${confidence.total} call${confidence.total === 1 ? "" : "s"} in this period are still processing or were recorded without the bot.`
                : ""}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const talkBand = ratioBand(talkRatio.teamAvg);
  const maxBucket = Math.max(...talkRatio.distribution.map((b) => b.count));
  const hasTalk = talkRatio.closedCount + talkRatio.lostCount > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold tracking-tight">Call quality</CardTitle>
          <div className="flex items-center gap-2">
            <AiDerivedChip />
            <span
              className="text-xs text-zinc-400"
              title="Calls whose speaker attribution couldn't be verified are excluded — their talk-time could be misattributed."
            >
              Based on {confidence.verified} of {confidence.total} call
              {confidence.total === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <TileGroup columns={2}>
          {/* team talk ratio */}
          <MetricTile>
            <div className="flex items-center justify-between">
              <SectionLabel>Team talk ratio</SectionLabel>
              <span className="text-[11px] text-zinc-400">Healthy 40–60%</span>
            </div>
            {hasTalk ? (
              <>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={cn("text-4xl font-semibold tracking-tight", MONO, BAND_COLOR[talkBand])}>
                    {formatPercent(talkRatio.teamAvg * 100)}
                  </span>
                  <span className="text-sm text-zinc-400">closer talking</span>
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  {talkBand === "high"
                    ? "Team's monologuing — let prospects talk more."
                    : talkBand === "low"
                      ? "Team's too quiet — drive the conversation more."
                      : "In the sweet spot."}
                </div>
              </>
            ) : (
              <div className="mt-3 text-sm text-zinc-400">Talk-time post-processing pending.</div>
            )}
          </MetricTile>

          {/* closed vs lost */}
          <MetricTile>
            <SectionLabel>Talk ratio: closed vs lost</SectionLabel>
            <div className="mt-3 space-y-2.5">
              <RatioCompareRow label="Closed deals" ratio={talkRatio.closedAvg} count={talkRatio.closedCount} />
              <RatioCompareRow label="Lost deals" ratio={talkRatio.lostAvg} count={talkRatio.lostCount} />
            </div>
          </MetricTile>
        </TileGroup>

        {/* distribution histogram */}
        {maxBucket > 0 && (
          <div>
            <SectionLabel>Talk-ratio distribution</SectionLabel>
            <div className="mt-3 flex h-16 items-end gap-2">
              {talkRatio.distribution.map((b) => (
                <div key={b.key} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={cn(
                      "w-full rounded-t",
                      b.key === "balanced" ? "bg-emerald-500" : "bg-zinc-300",
                    )}
                    style={{
                      height: `${(b.count / maxBucket) * 100}%`,
                      minHeight: b.count > 0 ? "4px" : "0",
                    }}
                  />
                  <div className="text-[11px] text-zinc-400">{b.label}</div>
                  <div className={cn("text-xs font-medium", MONO)}>{b.count}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* discovery signals */}
        <div>
          <SectionLabel>Discovery signals — closed vs lost hit rates</SectionLabel>
          <div className="mt-3 space-y-2">
            <SignalRow label="Budget discussed" signal={signals.budget} />
            <SignalRow label="Timeline / urgency" signal={signals.timeline} />
            <SignalRow label="Decision-maker confirmed" signal={signals.decisionMaker} />
          </div>
        </div>

        {/* duration */}
        {duration.closedCount + duration.lostCount > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-sm">
            <span className="text-zinc-500">Avg call duration</span>
            <div className="flex items-center gap-5">
              <span className="text-zinc-500">
                Closed <span className={cn("font-medium text-zinc-900", MONO)}>{formatDuration(duration.closedAvg)}</span>
              </span>
              <span className="text-zinc-500">
                Lost <span className={cn("font-medium text-zinc-900", MONO)}>{formatDuration(duration.lostAvg)}</span>
              </span>
            </div>
          </div>
        )}

        <RecommendationCallout recommendation={recommendation} />
      </CardContent>
    </Card>
  );
}

function AiDerivedChip() {
  return (
    <span className="rounded-md border border-zinc-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
      AI-derived
    </span>
  );
}

function RatioCompareRow({ label, ratio, count }: { label: string; ratio: number; count: number }) {
  if (count === 0) {
    return <div className="text-xs text-zinc-400">{label}: no data</div>;
  }
  const closerPct = ratio * 100;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-zinc-600">
          {label} <span className="text-zinc-400">({count})</span>
        </span>
        <span className={cn("font-medium", MONO)}>{formatPercent(closerPct)} closer</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-zinc-200">
        <div className="bg-zinc-800" style={{ width: `${closerPct}%` }} />
        <div className="bg-zinc-300" style={{ width: `${100 - closerPct}%` }} />
      </div>
    </div>
  );
}

function SignalRow({ label, signal }: { label: string; signal: Signal }) {
  if (signal.closedCount + signal.lostCount === 0) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-xs text-zinc-400">no data</span>
      </div>
    );
  }
  const gap = signal.closedHitRate - signal.lostHitRate;
  // UI badge threshold (20pp) is intentionally lower than the rec-engine
  // threshold (30pp): awareness here, action there.
  const isInteresting = Math.abs(gap) >= 0.2 && signal.closedCount >= 3 && signal.lostCount >= 3;
  return (
    <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span>
          Closed <span className={cn("font-medium text-zinc-900", MONO)}>{formatPercent(signal.closedHitRate * 100)}</span>
        </span>
        <span>
          Lost <span className={cn("font-medium text-zinc-900", MONO)}>{formatPercent(signal.lostHitRate * 100)}</span>
        </span>
      </div>
      {isInteresting ? (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
            MONO,
            gap > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 text-zinc-500",
          )}
          title={
            gap > 0
              ? "Closed calls hit this signal materially more often — likely a differentiator."
              : "Lost calls hit this signal more often — worth a listen."
          }
        >
          {gap > 0 ? "↑" : "↓"} {formatPercent(Math.abs(gap) * 100)}
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}
