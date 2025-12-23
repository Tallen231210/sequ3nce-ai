"use client";

import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, Target, Minus } from "lucide-react";
import { formatCurrencyFull, formatPercent, formatTrend, getTrendClasses } from "@/lib/analytics-utils";

interface MoneyViewProps {
  data: {
    totalPitched: number;
    totalClosed: number;
    leftOnTable: number;
    closeRate: number;
    totalCalls: number;
    closedCalls: number;
    trends: {
      pitched: number;
      closed: number;
      closeRate: number;
    };
  } | undefined;
  isLoading?: boolean;
}

function StatCard({
  title,
  value,
  trend,
  icon: Icon,
  isCurrency = true,
  isPercent = false,
  invertTrend = false,
}: {
  title: string;
  value: number;
  trend: number;
  icon: React.ElementType;
  isCurrency?: boolean;
  isPercent?: boolean;
  invertTrend?: boolean;
}) {
  const trendInfo = formatTrend(trend);
  // For "left on table", down is good
  const adjustedPositive = invertTrend ? !trendInfo.isPositive : trendInfo.isPositive;

  const displayValue = isPercent
    ? formatPercent(value)
    : isCurrency
      ? formatCurrencyFull(value)
      : value.toString();

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-zinc-100 rounded-lg">
              <Icon className="h-5 w-5 text-zinc-600" />
            </div>
            <span className="text-sm text-muted-foreground">{title}</span>
          </div>
          {!trendInfo.isNeutral && (
            <div className={`flex items-center gap-1 text-sm ${getTrendClasses(adjustedPositive, trendInfo.isNeutral)}`}>
              {adjustedPositive ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              <span>{trendInfo.text}</span>
            </div>
          )}
          {trendInfo.isNeutral && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Minus className="h-4 w-4" />
              <span>—</span>
            </div>
          )}
        </div>
        <div className="mt-3">
          <span className="text-3xl font-semibold">{displayValue}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="h-9 w-24 bg-zinc-200 rounded animate-pulse" />
              <div className="h-5 w-16 bg-zinc-200 rounded animate-pulse" />
            </div>
            <div className="mt-3">
              <div className="h-9 w-32 bg-zinc-200 rounded animate-pulse" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MoneyView({ data, isLoading }: MoneyViewProps) {
  if (isLoading || !data) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">The Money View</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Pitched"
          value={data.totalPitched}
          trend={data.trends.pitched}
          icon={DollarSign}
        />
        <StatCard
          title="Total Closed"
          value={data.totalClosed}
          trend={data.trends.closed}
          icon={DollarSign}
        />
        <StatCard
          title="Left on Table"
          value={data.leftOnTable}
          trend={data.trends.pitched - data.trends.closed}
          icon={DollarSign}
          invertTrend={true}
        />
        <StatCard
          title="Close Rate"
          value={data.closeRate}
          trend={data.trends.closeRate}
          icon={Target}
          isCurrency={false}
          isPercent={true}
        />
      </div>
    </div>
  );
}
