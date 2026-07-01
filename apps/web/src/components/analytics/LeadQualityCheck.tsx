"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrencyFull } from "@/lib/analytics-utils";
import { Stat } from "./primitives/Stat";
import { TileGroup, MetricTile } from "./primitives/MetricTile";
import { MONO } from "./primitives/typography";
import { RecommendationCallout } from "./RecommendationCallout";
import { SectionNote } from "./primitives/SectionNote";
import type { Recommendation } from "@/lib/analytics-types";

interface LeadQualityProps {
  data: {
    avgScore: number;
    scoreTrend: number;
    distribution: {
      low: { count: number; label: string };
      medium: { count: number; label: string };
      high: { count: number; label: string };
    };
    highQualityLost: { count: number; value: number };
    lowQualityLost: { count: number; value: number };
    nonDecisionMakerPercent: number;
    insights: string[];
  } | undefined;
  isLoading?: boolean;
  recommendation?: Recommendation | null;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-32 animate-pulse rounded bg-zinc-100" />
      </CardHeader>
      <CardContent>
        <div className="grid gap-8 md:grid-cols-2">
          <div className="h-24 animate-pulse rounded bg-zinc-100" />
          <div className="h-24 animate-pulse rounded bg-zinc-100" />
        </div>
      </CardContent>
    </Card>
  );
}

export function LeadQualityCheck({ data, isLoading, recommendation }: LeadQualityProps) {
  if (isLoading || !data) return <LoadingSkeleton />;

  const dist = [data.distribution.low, data.distribution.medium, data.distribution.high];
  const total = dist.reduce((sum, b) => sum + b.count, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-tight">Lead quality</CardTitle>
          <span className="text-xs text-zinc-400">Scored from post-call forms</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.insights.length > 0 && <SectionNote items={data.insights} />}

        <div className="grid gap-8 md:grid-cols-2">
          {/* average score */}
          <Stat
            label="Average lead quality"
            value={data.avgScore.toFixed(1)}
            suffix="/ 10"
            size="lg"
            trend={{ value: data.scoreTrend }}
          />

          {/* distribution — monochrome small multiples */}
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
              Distribution
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {dist.map((bucket) => {
                const pct = total > 0 ? (bucket.count / total) * 100 : 0;
                return (
                  <div key={bucket.label}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] text-zinc-400">{bucket.label}</span>
                      <span className={cn("text-sm font-medium", MONO)}>{bucket.count}</span>
                    </div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-zinc-900"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* lost by quality — no pastel icon boxes; number is the hero, $ muted */}
        <TileGroup columns={2}>
          <MetricTile>
            <Stat
              label="High-quality leads lost · 7+"
              value={data.highQualityLost.count}
              sublabel={formatCurrencyFull(data.highQualityLost.value)}
            />
          </MetricTile>
          <MetricTile>
            <Stat
              label="Low-quality leads lost · 1–4"
              value={data.lowQualityLost.count}
              sublabel={formatCurrencyFull(data.lowQualityLost.value)}
            />
          </MetricTile>
        </TileGroup>

        {/* decision-maker signal — red only when it crosses the threshold */}
        {data.nonDecisionMakerPercent > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-sm">
            <span className="text-zinc-500">Calls with non-decision makers</span>
            <span
              className={cn(
                "font-medium",
                MONO,
                data.nonDecisionMakerPercent > 30 ? "text-red-600" : "text-zinc-700",
              )}
            >
              {data.nonDecisionMakerPercent}%
            </span>
          </div>
        )}

        <RecommendationCallout recommendation={recommendation} />
      </CardContent>
    </Card>
  );
}
