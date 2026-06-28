"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  formatCurrencyFull,
  formatCurrency,
  formatPercent,
  formatTrend,
  getTrendClasses,
} from "@/lib/analytics-utils";

/**
 * Hero card for the Analytics tab top — Step 1 of the revamp.
 *
 * Replaces the previous 4-tile KPI grid. Surfaces ONE primary number
 * (Revenue Closed) with its trend, plus a row of supporting context
 * (close rate, total calls, avg deal size). The "where money leaked"
 * story now lives in the companion LeakAttribution card next to this.
 */
interface MoneyViewProps {
  data:
    | {
        revenueClosed: number;
        avgDealSize: number;
        closeRate: number;
        totalCalls: number;
        closedCalls: number;
        trends: {
          closed: number;
          closeRate: number;
        };
      }
    | undefined;
  isLoading?: boolean;
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-3">
          <div className="h-4 w-32 bg-zinc-200 rounded animate-pulse" />
          <div className="h-12 w-48 bg-zinc-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-zinc-200 rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

export function MoneyView({ data, isLoading }: MoneyViewProps) {
  if (isLoading || !data) {
    return <LoadingSkeleton />;
  }

  const trendInfo = formatTrend(data.trends.closed);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          {/* Hero — primary number + trend */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground mb-1">Revenue Closed</p>
            <p className="text-4xl font-semibold leading-tight">
              {formatCurrencyFull(data.revenueClosed)}
            </p>
          </div>
          {!trendInfo.isNeutral ? (
            <div
              className={`flex items-center gap-1.5 text-sm font-medium shrink-0 ${getTrendClasses(trendInfo.isPositive, trendInfo.isNeutral)}`}
            >
              {trendInfo.isPositive ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              <span>{trendInfo.text} vs last period</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground shrink-0">
              <Minus className="h-4 w-4" />
              <span>vs last period</span>
            </div>
          )}
        </div>

        {/* Supporting context row */}
        <div className="mt-5 pt-4 border-t flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <SupportingStat
            label="Close rate"
            value={formatPercent(data.closeRate)}
            trend={data.trends.closeRate}
            isPercentTrend
          />
          <SupportingStat
            label="Calls"
            value={data.totalCalls.toString()}
          />
          <SupportingStat
            label="Avg deal"
            value={formatCurrency(data.avgDealSize)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SupportingStat({
  label,
  value,
  trend,
  isPercentTrend = false,
}: {
  label: string;
  value: string;
  trend?: number;
  isPercentTrend?: boolean;
}) {
  const trendInfo = trend !== undefined ? formatTrend(trend) : null;
  // For percent-point trends (like close rate), suppress trend display when
  // the underlying number is too small to be meaningful — avoids noisy
  // "↑ 100%" when going from 1 → 2 closes.
  const showTrend = trendInfo && !trendInfo.isNeutral && (!isPercentTrend || Math.abs(trend!) >= 1);

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
      {showTrend && (
        <span
          className={`text-xs ${getTrendClasses(trendInfo!.isPositive, trendInfo!.isNeutral)}`}
        >
          {trendInfo!.text}
        </span>
      )}
    </div>
  );
}
