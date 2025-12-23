"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, TrendingDown, AlertTriangle, Lightbulb } from "lucide-react";
import { formatCurrencyFull, formatTrend, getTrendClasses, getLeadQualityColor } from "@/lib/analytics-utils";

interface LeadQualityProps {
  data: {
    avgScore: number;
    scoreTrend: number;
    distribution: {
      low: { count: number; label: string };
      medium: { count: number; label: string };
      high: { count: number; label: string };
    };
    highQualityLost: {
      count: number;
      value: number;
    };
    lowQualityLost: {
      count: number;
      value: number;
    };
    nonDecisionMakerPercent: number;
    insights: string[];
  } | undefined;
  isLoading?: boolean;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-40 bg-zinc-200 rounded animate-pulse" />
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

export function LeadQualityCheck({ data, isLoading }: LeadQualityProps) {
  if (isLoading || !data) {
    return <LoadingSkeleton />;
  }

  const totalDistribution = data.distribution.low.count + data.distribution.medium.count + data.distribution.high.count;
  const trendInfo = formatTrend(data.scoreTrend);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Lead Quality Check</CardTitle>
          <span className="text-sm text-muted-foreground">
            Is it the leads or is it us?
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Insights callout */}
        {data.insights.length > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
            {data.insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 text-blue-700">
                <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span className="text-sm font-medium">{insight}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Average Score */}
          <div className="p-4 bg-zinc-50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Average Lead Quality</span>
              {!trendInfo.isNeutral && (
                <span className={`flex items-center gap-1 text-xs ${getTrendClasses(trendInfo.isPositive, trendInfo.isNeutral)}`}>
                  {trendInfo.isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {trendInfo.text}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-4xl font-bold ${getLeadQualityColor(data.avgScore)}`}>
                {data.avgScore.toFixed(1)}
              </span>
              <span className="text-xl text-muted-foreground">/ 10</span>
            </div>
          </div>

          {/* Distribution */}
          <div className="p-4 bg-zinc-50 rounded-lg">
            <span className="text-sm text-muted-foreground block mb-3">Lead Quality Distribution</span>
            <div className="flex gap-2">
              {/* Low quality (1-4) */}
              <div className="flex-1">
                <div className="h-2 rounded-full bg-red-200 overflow-hidden mb-1">
                  <div
                    className="h-full bg-red-500 rounded-full"
                    style={{
                      width: totalDistribution > 0
                        ? `${(data.distribution.low.count / totalDistribution) * 100}%`
                        : "0%"
                    }}
                  />
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium">{data.distribution.low.count}</span>
                  <span className="text-xs text-muted-foreground block">{data.distribution.low.label}</span>
                </div>
              </div>

              {/* Medium quality (5-6) */}
              <div className="flex-1">
                <div className="h-2 rounded-full bg-yellow-200 overflow-hidden mb-1">
                  <div
                    className="h-full bg-yellow-500 rounded-full"
                    style={{
                      width: totalDistribution > 0
                        ? `${(data.distribution.medium.count / totalDistribution) * 100}%`
                        : "0%"
                    }}
                  />
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium">{data.distribution.medium.count}</span>
                  <span className="text-xs text-muted-foreground block">{data.distribution.medium.label}</span>
                </div>
              </div>

              {/* High quality (7-10) */}
              <div className="flex-1">
                <div className="h-2 rounded-full bg-green-200 overflow-hidden mb-1">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{
                      width: totalDistribution > 0
                        ? `${(data.distribution.high.count / totalDistribution) * 100}%`
                        : "0%"
                    }}
                  />
                </div>
                <div className="text-center">
                  <span className="text-sm font-medium">{data.distribution.high.count}</span>
                  <span className="text-xs text-muted-foreground block">{data.distribution.high.label}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lost deals breakdown */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-green-100 rounded">
                <Target className="h-4 w-4 text-green-600" />
              </div>
              <span className="text-sm font-medium">High-Quality Leads Lost (7+)</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{data.highQualityLost.count}</span>
              <span className="text-sm text-muted-foreground">deals</span>
              <span className="text-sm font-medium text-red-600">
                ({formatCurrencyFull(data.highQualityLost.value)})
              </span>
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-red-100 rounded">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <span className="text-sm font-medium">Low-Quality Leads Lost (1-4)</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold">{data.lowQualityLost.count}</span>
              <span className="text-sm text-muted-foreground">deals</span>
              <span className="text-sm font-medium text-red-600">
                ({formatCurrencyFull(data.lowQualityLost.value)})
              </span>
            </div>
          </div>
        </div>

        {/* Decision maker stat */}
        {data.nonDecisionMakerPercent > 0 && (
          <div className="p-3 bg-zinc-50 rounded-lg flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Calls with non-decision makers
            </span>
            <span className={`font-medium ${data.nonDecisionMakerPercent > 30 ? "text-red-600" : "text-zinc-600"}`}>
              {data.nonDecisionMakerPercent}%
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
