"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatCurrencyFull,
  formatCurrency,
  formatPercent,
} from "@/lib/analytics-utils";
import { TrendDelta } from "./primitives/TrendDelta";
import { MONO, HATCH_STYLE } from "./primitives/typography";
import { RecommendationCallout } from "./RecommendationCallout";
import type { Recommendation } from "@/lib/analytics-types";

/**
 * MoneyLedger — the signature hero of the redesigned Analytics tab.
 *
 * Fuses the old MoneyView ("Revenue Closed") and LeakAttribution ("Money Left
 * on the Table") into ONE panel that tells a single story: of the money that
 * came into play this period, how much did we capture vs. leak?
 *
 * The signature element is the Capture Rate — captured / (captured + leaked) —
 * with one monochrome bar (solid = captured, hatched = leaked). It reframes
 * two separate numbers as a single, memorable one-glance insight.
 *
 * Purely presentational: consumes the same getAnalyticsSummary payload the two
 * old components used. No backend change.
 *
 * Note the capture denominator (captured + leaked) is directional, not
 * accounting-exact — "leaked" includes the estimated no-show bucket. It's a
 * framing device for relative capture, not a GAAP figure.
 */
interface MoneyLedgerProps {
  data:
    | {
        revenueClosed: number;
        avgDealSize: number;
        closeRate: number;
        totalCalls: number;
        closedCalls: number;
        trends: { closed: number; closeRate: number };
        leakBuckets: {
          inCallLosses: { amount: number; dealCount: number; trend: number };
          uncollected: { amount: number; dealCount: number; trend: number };
          noShows: {
            amount: number;
            dealCount: number;
            avgDealSizeUsed: number;
            trend: number;
          };
        };
      }
    | undefined;
  dateRange: string;
  isLoading?: boolean;
  recommendations?: {
    inCallLosses?: Recommendation | null;
    uncollected?: Recommendation | null;
    noShows?: Recommendation | null;
  };
}

function LoadingSkeleton() {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-10">
        <div className="space-y-3">
          <div className="h-3 w-28 animate-pulse rounded bg-zinc-100" />
          <div className="h-12 w-48 animate-pulse rounded bg-zinc-100" />
          <div className="h-3 w-64 animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="w-64 space-y-3">
          <div className="ml-auto h-3 w-24 animate-pulse rounded bg-zinc-100" />
          <div className="h-8 w-full animate-pulse rounded bg-zinc-100" />
        </div>
      </div>
    </Card>
  );
}

export function MoneyLedger({
  data,
  dateRange,
  isLoading,
  recommendations,
}: MoneyLedgerProps) {
  if (isLoading || !data) return <LoadingSkeleton />;

  const { inCallLosses, uncollected, noShows } = data.leakBuckets;
  const captured = data.revenueClosed;
  const leaked = inCallLosses.amount + uncollected.amount + noShows.amount;
  const inPlay = captured + leaked;
  // No money in play at all (brand-new team, empty range) — don't imply
  // "0% captured / everything leaked". The capture module renders neutral.
  const hasActivity = inPlay > 0;
  const captureRate = hasActivity ? (captured / inPlay) * 100 : 0;

  // Leak rows, biggest first — same drill-down targets as the old card.
  const leakRows = [
    {
      key: "inCallLosses" as const,
      label: "In-call losses",
      sublabel: `${inCallLosses.dealCount} deal${inCallLosses.dealCount === 1 ? "" : "s"} that reached the call but didn't close`,
      amount: inCallLosses.amount,
      trend: inCallLosses.trend,
      href: `/dashboard/calls?outcome=lost,follow_up&dateRange=${encodeURIComponent(dateRange)}`,
      rec: recommendations?.inCallLosses,
    },
    {
      key: "uncollected" as const,
      label: "Uncollected on closes",
      sublabel: `${uncollected.dealCount} closed deal${uncollected.dealCount === 1 ? "" : "s"} with a payment plan or unpaid balance`,
      amount: uncollected.amount,
      trend: uncollected.trend,
      href: `/dashboard/calls?outcome=closed&uncollected=true&dateRange=${encodeURIComponent(dateRange)}`,
      rec: recommendations?.uncollected,
    },
    {
      key: "noShows" as const,
      label: "No-shows",
      sublabel:
        noShows.avgDealSizeUsed > 0
          ? `${noShows.dealCount} no-show${noShows.dealCount === 1 ? "" : "s"} × ${formatCurrency(noShows.avgDealSizeUsed)} avg deal size`
          : `${noShows.dealCount} no-show${noShows.dealCount === 1 ? "" : "s"} — no contract data yet to estimate value`,
      estimated: true,
      amount: noShows.amount,
      trend: noShows.trend,
      href: `/dashboard/calls?outcome=no_show&dateRange=${encodeURIComponent(dateRange)}`,
      rec: recommendations?.noShows,
    },
  ].sort((a, b) => b.amount - a.amount);

  return (
    <Card className="overflow-hidden p-0">
      {/* ── Top zone: captured + capture rate ─────────────────────────── */}
      <div className="flex flex-col gap-8 p-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
        {/* Left — the win */}
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            Revenue closed
          </div>
          <div className={cn("mt-2 text-5xl font-semibold tracking-tight", MONO)}>
            {formatCurrencyFull(captured)}
          </div>
          <div className="mt-2">
            <TrendDelta value={data.trends.closed} suffix="vs prior period" />
          </div>

          {/* supporting stats */}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <SupportingStat label="Close rate" value={formatPercent(data.closeRate)} />
            <Divider />
            <SupportingStat label="Calls" value={data.totalCalls.toString()} />
            <Divider />
            <SupportingStat label="Avg deal" value={formatCurrency(data.avgDealSize)} />
          </div>
        </div>

        {/* Right — the signature: capture rate */}
        <div className="w-full shrink-0 sm:w-64">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500 sm:text-right">
            Capture rate
          </div>
          <div className="mt-2 flex items-baseline gap-2 sm:justify-end">
            <span className={cn("text-3xl font-semibold", MONO)}>
              {hasActivity ? `${captureRate.toFixed(0)}%` : "—"}
            </span>
            <span className="text-sm text-zinc-400">
              {hasActivity ? `of ${formatCurrency(inPlay)} in play` : "no activity yet"}
            </span>
          </div>
          {/* capture bar — neutral when there's no activity */}
          {hasActivity ? (
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
              <div className="bg-zinc-900" style={{ width: `${captureRate}%` }} />
              <div style={{ ...HATCH_STYLE, width: `${100 - captureRate}%` }} />
            </div>
          ) : (
            <div className="mt-3 h-2.5 w-full rounded-full bg-zinc-100" />
          )}
          <div className="mt-2 flex items-center gap-4 text-xs sm:justify-end">
            <LegendDot className="bg-zinc-900" label={`Captured ${formatCurrency(captured)}`} />
            <LegendDot hatch label={`Leaked ${formatCurrency(leaked)}`} />
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-100" />

      {/* ── Bottom zone: leak breakdown ───────────────────────────────── */}
      <div className="p-6 pt-5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
            Left on the table
          </div>
          <div className={cn("text-sm font-semibold text-zinc-700", MONO)}>
            {formatCurrencyFull(leaked)}
          </div>
        </div>

        <div className="mt-3 divide-y divide-zinc-100">
          {leakRows.map((row) => {
            const hasMoney = row.amount > 0;
            return (
              <div key={row.key}>
                <Link
                  href={row.href}
                  className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-zinc-50"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      hasMoney ? "bg-amber-500" : "bg-zinc-300",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {row.label}
                      {row.estimated && (
                        <span className="font-normal text-zinc-400"> · estimated</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-zinc-500">{row.sublabel}</div>
                  </div>
                  <div className="text-right">
                    <div
                      className={cn(
                        "text-sm font-semibold",
                        MONO,
                        hasMoney ? "text-zinc-900" : "text-zinc-400",
                      )}
                    >
                      {formatCurrencyFull(row.amount)}
                    </div>
                    <TrendDelta value={row.trend} invert className="justify-end" />
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500" />
                </Link>
                {row.rec && (
                  <div className="pb-1 pl-7 pr-2">
                    <RecommendationCallout recommendation={row.rec} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function SupportingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-zinc-400">{label}</span>
      <span className={cn("font-medium", MONO)}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-3 w-px bg-zinc-200" />;
}

function LegendDot({
  className,
  hatch,
  label,
}: {
  className?: string;
  hatch?: boolean;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn("h-2 w-2 rounded-full", className)}
        style={hatch ? HATCH_STYLE : undefined}
      />
      <span className="text-zinc-600">{label}</span>
    </span>
  );
}
