"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/analytics-utils";
import { MONO, HATCH_STYLE } from "./primitives/typography";
import { TileGroup, MetricTile } from "./primitives/MetricTile";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * MonthlyComparison — the "Month over month" section.
 *
 * Extends the hero's capture-rate language across time: the default Revenue
 * view is a stacked captured/leaked bar per month. A metric selector flips the
 * chart to Close rate, Call volume, or Avg deal size (single-series bars). A
 * summary strip below adapts to the selected metric.
 *
 * Self-contained: owns both the metric AND the window (trailing 3/6/12 months
 * or a specific calendar year) and runs its own `getMonthlyTrends` query. The
 * window is deliberately independent of the page's period filter so the
 * comparison view stays stable while a manager filters everything else.
 */
type MonthRow = {
  key: string;
  label: string;
  year: number;
  month: number;
  isCurrent: boolean;
  captured: number;
  leaked: number;
  captureRate: number;
  closeRate: number;
  totalCalls: number;
  avgDealSize: number;
};

interface MonthlyComparisonProps {
  teamId: Id<"teams"> | undefined;
  closerId?: Id<"closers">;
}

type MetricKey = "revenue" | "closeRate" | "volume" | "avgDeal";

const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: "revenue", label: "Revenue" },
  { key: "closeRate", label: "Close rate" },
  { key: "volume", label: "Call volume" },
  { key: "avgDeal", label: "Avg deal" },
];

const CHART_H = 128; // px

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 animate-pulse rounded bg-zinc-100" />
      </CardHeader>
      <CardContent>
        <div className="h-40 animate-pulse rounded bg-zinc-100" />
      </CardContent>
    </Card>
  );
}

export function MonthlyComparison({ teamId, closerId }: MonthlyComparisonProps) {
  const [metric, setMetric] = useState<MetricKey>("revenue");
  // Window key: "3m" | "6m" | "12m" | "y<year>". Default trailing 6 months.
  const [windowKey, setWindowKey] = useState<string>("6m");

  const windowOptions = useMemo(() => {
    const year = new Date().getFullYear();
    return [
      { value: "3m", label: "Last 3 months" },
      { value: "6m", label: "Last 6 months" },
      { value: "12m", label: "Last 12 months" },
      { value: `y${year}`, label: `${year}` },
      { value: `y${year - 1}`, label: `${year - 1}` },
      { value: `y${year - 2}`, label: `${year - 2}` },
    ];
  }, []);

  const queryArgs = useMemo(() => {
    if (!teamId) return "skip" as const;
    const base = { teamId, closerId };
    if (windowKey.startsWith("y")) {
      return { ...base, year: Number(windowKey.slice(1)) };
    }
    return { ...base, months: Number(windowKey.replace("m", "")) };
  }, [teamId, closerId, windowKey]);

  const data = useQuery(api.analyticsTrends.getMonthlyTrends, queryArgs);

  const windowLabel = windowKey.startsWith("y")
    ? windowKey.slice(1)
    : `last ${windowKey.replace("m", "")} months`;

  if (data === undefined) return <LoadingSkeleton />;

  const { trend } = data;
  const hasAnyData = trend.some((m) => m.totalCalls > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">Month over month</CardTitle>
            <p className="mt-0.5 text-xs text-zinc-400">
              {METRIC_CAPTION[metric]} · {windowLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={windowKey} onValueChange={setWindowKey}>
              <SelectTrigger className="h-8 w-[140px] bg-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {windowOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <MetricTabs value={metric} onChange={setMetric} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasAnyData ? (
          <div className="py-10 text-center text-sm text-zinc-500">
            No completed calls in this window yet.
          </div>
        ) : (
          <>
            {metric === "revenue" && (
              <div className="flex items-center gap-3 text-xs">
                <Legend className="bg-zinc-900" label="Captured" />
                <Legend hatch label="Leaked" />
              </div>
            )}
            <Chart trend={trend} metric={metric} />
            <Summary trend={trend} metric={metric} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

const METRIC_CAPTION: Record<MetricKey, string> = {
  revenue: "Captured vs leaked",
  closeRate: "Close rate",
  volume: "Completed calls",
  avgDeal: "Average deal size",
};

function MetricTabs({ value, onChange }: { value: MetricKey; onChange: (m: MetricKey) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-zinc-200 bg-white p-0.5">
      {METRICS.map((m) => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            value === m.key ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function Chart({ trend, metric }: { trend: MonthRow[]; metric: MetricKey }) {
  // Normalization max per metric.
  const max =
    metric === "revenue"
      ? Math.max(...trend.map((m) => m.captured + m.leaked), 1)
      : metric === "closeRate"
        ? Math.max(...trend.map((m) => m.closeRate), 1)
        : metric === "volume"
          ? Math.max(...trend.map((m) => m.totalCalls), 1)
          : Math.max(...trend.map((m) => m.avgDealSize), 1);

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${trend.length}, minmax(0, 1fr))` }}
    >
      {trend.map((m) => (
        <MonthColumn key={m.key} row={m} metric={metric} max={max} />
      ))}
    </div>
  );
}

function MonthColumn({ row, metric, max }: { row: MonthRow; metric: MetricKey; max: number }) {
  // Months with no calls (common as leading months in a year view) show a
  // muted dash rather than a repetitive "$0" / "0.0%" so the eye skips them.
  const noData = row.totalCalls === 0;
  const topLabel = columnTopLabel(row, metric);
  const bottomValue = columnBottomValue(row, metric);

  let bar: React.ReactNode;
  if (metric === "revenue") {
    const total = row.captured + row.leaked;
    const h = (total / max) * CHART_H;
    const capH = total > 0 ? (row.captured / total) * h : 0;
    const leakH = h - capH;
    bar = (
      <div
        className={cn(
          "flex w-9 flex-col justify-end overflow-hidden rounded-t",
          row.isCurrent && "ring-1 ring-zinc-900/10",
        )}
        style={{ height: `${h}px` }}
      >
        <div style={{ ...HATCH_STYLE, height: `${leakH}px` }} />
        <div className="bg-zinc-900" style={{ height: `${capH}px` }} />
      </div>
    );
  } else {
    const value =
      metric === "closeRate" ? row.closeRate : metric === "volume" ? row.totalCalls : row.avgDealSize;
    const h = (value / max) * CHART_H;
    bar = (
      <div
        className={cn(
          "w-9 rounded-t bg-zinc-900",
          row.isCurrent && "ring-1 ring-zinc-900/10",
        )}
        style={{ height: `${Math.max(h, value > 0 ? 3 : 0)}px` }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "mb-1.5 text-xs font-medium",
          MONO,
          row.isCurrent ? "text-zinc-600" : "text-zinc-400",
        )}
      >
        {topLabel}
      </div>
      <div className="flex w-full items-end justify-center" style={{ height: `${CHART_H}px` }}>
        {bar}
      </div>
      <div
        className={cn(
          "mt-2 text-[11px]",
          row.isCurrent ? "font-medium text-zinc-700" : "text-zinc-400",
        )}
      >
        {row.label}
      </div>
      <div className={cn("text-xs font-medium tabular-nums", MONO, noData && "text-zinc-300")}>
        {noData ? "—" : bottomValue}
      </div>
    </div>
  );
}

function columnTopLabel(row: MonthRow, metric: MetricKey): string {
  switch (metric) {
    case "revenue":
      return row.captured + row.leaked > 0 ? `${Math.round(row.captureRate)}%` : "—";
    case "closeRate":
      return row.totalCalls > 0 ? `${Math.round(row.closeRate)}%` : "—";
    case "volume":
      return row.totalCalls > 0 ? `${row.totalCalls}` : "—";
    case "avgDeal":
      return row.avgDealSize > 0 ? formatCurrency(row.avgDealSize) : "—";
  }
}

function columnBottomValue(row: MonthRow, metric: MetricKey): string {
  switch (metric) {
    case "revenue":
      return formatCurrency(row.captured);
    case "closeRate":
      return formatPercent(row.closeRate);
    case "volume":
      return `${row.totalCalls}`;
    case "avgDeal":
      return formatCurrency(row.avgDealSize);
  }
}

function Summary({ trend, metric }: { trend: MonthRow[]; metric: MetricKey }) {
  const withData = trend.filter((m) => m.totalCalls > 0);
  const tiles = summaryTiles(trend, withData, metric);
  return (
    <TileGroup columns={3}>
      {tiles.map((t) => (
        <MetricTile key={t.label}>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            {t.label}
          </div>
          <div className="mt-1 text-xl font-semibold">
            <span className={MONO}>{t.value}</span>
            {t.hint && <span className={cn("ml-1.5 text-sm font-medium text-zinc-400", MONO)}>{t.hint}</span>}
          </div>
        </MetricTile>
      ))}
    </TileGroup>
  );
}

function summaryTiles(
  trend: MonthRow[],
  withData: MonthRow[],
  metric: MetricKey,
): Array<{ label: string; value: string; hint?: string }> {
  const mean = (nums: number[]) =>
    nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
  const best = (getter: (m: MonthRow) => number) =>
    withData.length > 0
      ? withData.reduce((a, b) => (getter(b) > getter(a) ? b : a))
      : null;

  if (metric === "revenue") {
    const totalRev = trend.reduce((s, m) => s + m.captured, 0);
    const avgCapture = mean(withData.map((m) => m.captureRate));
    const bestMonth = best((m) => m.captured);
    return [
      { label: `${trend.length}-mo revenue`, value: formatCurrency(totalRev) },
      { label: "Avg capture", value: `${Math.round(avgCapture)}%` },
      {
        label: "Best month",
        value: bestMonth ? bestMonth.label : "—",
        hint: bestMonth ? formatCurrency(bestMonth.captured) : undefined,
      },
    ];
  }
  if (metric === "closeRate") {
    const avg = mean(withData.map((m) => m.closeRate));
    const bestMonth = best((m) => m.closeRate);
    return [
      { label: "Avg close rate", value: `${Math.round(avg)}%` },
      {
        label: "Best month",
        value: bestMonth ? bestMonth.label : "—",
        hint: bestMonth ? `${Math.round(bestMonth.closeRate)}%` : undefined,
      },
      { label: "Months tracked", value: `${withData.length}` },
    ];
  }
  if (metric === "volume") {
    const total = trend.reduce((s, m) => s + m.totalCalls, 0);
    const bestMonth = best((m) => m.totalCalls);
    return [
      { label: "Total calls", value: `${total}` },
      { label: "Avg / month", value: `${Math.round(mean(withData.map((m) => m.totalCalls)))}` },
      {
        label: "Busiest",
        value: bestMonth ? bestMonth.label : "—",
        hint: bestMonth ? `${bestMonth.totalCalls}` : undefined,
      },
    ];
  }
  // avgDeal
  const overall = mean(withData.map((m) => m.avgDealSize));
  const bestMonth = best((m) => m.avgDealSize);
  return [
    { label: "Avg deal (period)", value: formatCurrency(Math.round(overall)) },
    {
      label: "Biggest month",
      value: bestMonth ? bestMonth.label : "—",
      hint: bestMonth ? formatCurrency(bestMonth.avgDealSize) : undefined,
    },
    { label: "Months tracked", value: `${withData.length}` },
  ];
}

function Legend({ className, hatch, label }: { className?: string; hatch?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", className)} style={hatch ? HATCH_STYLE : undefined} />
      <span className="text-zinc-600">{label}</span>
    </span>
  );
}
