"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  formatCurrencyFull,
  formatCurrency,
  formatTrend,
} from "@/lib/analytics-utils";

/**
 * Leak Attribution — Step 1 of the Analytics revamp.
 *
 * The Money View's "Left on Table" number split into three distinct
 * leakage mechanisms a business owner can act on. Each row clickable
 * into a filtered Call Reviews view so the owner can listen to the
 * underlying calls without re-filtering manually.
 *
 * The three buckets:
 *   1. In-call losses — outcome ∈ {lost, follow_up}, contractValue summed.
 *      Hard number; closer entered contractValue on post-call form.
 *   2. Uncollected on closes — contractValue - cashCollected on outcome=closed
 *      where cashCollected < contractValue. Captures payment plans + outstanding.
 *   3. No-shows (estimated) — count(no_show) × avg deal size. Estimate
 *      because closers don't reliably fill contractValue on no-shows.
 *      Labelled "estimated" in the UI so customers know it's a projection.
 *
 * Why "stacked" visualization vs separate cards: shows relative contribution
 * at a glance — owner sees which bucket is the biggest lever to pull this
 * period. A 4×$10k bucket isn't the same problem as 1×$40k.
 */
interface LeakAttributionProps {
  data:
    | {
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
}

function LoadingSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-48 bg-zinc-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-3 w-full bg-zinc-200 rounded animate-pulse" />
          <div className="h-14 bg-zinc-100 rounded animate-pulse" />
          <div className="h-14 bg-zinc-100 rounded animate-pulse" />
          <div className="h-14 bg-zinc-100 rounded animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
}

export function LeakAttribution({
  data,
  dateRange,
  isLoading,
}: LeakAttributionProps) {
  if (isLoading || !data) {
    return <LoadingSkeleton />;
  }

  const { inCallLosses, uncollected, noShows } = data.leakBuckets;
  const totalLeak = inCallLosses.amount + uncollected.amount + noShows.amount;

  if (totalLeak === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Money Left on the Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 bg-emerald-50 rounded-full mb-3">
              <AlertTriangle className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-sm font-medium">No leakage detected this period</p>
            <p className="text-xs text-muted-foreground mt-1">
              Every closed deal collected in full, no in-call losses, no no-shows.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // The three rows, sorted by amount descending — biggest lever first.
  // Defined here as data so the stacked bar + the row list stay in sync.
  const rows = [
    {
      key: "inCallLosses" as const,
      label: "In-call losses",
      sublabel: `${inCallLosses.dealCount} deal${inCallLosses.dealCount === 1 ? "" : "s"} that hit the call but didn't close`,
      amount: inCallLosses.amount,
      trend: inCallLosses.trend,
      colorClass: "bg-red-500",
      // Drill-down lands on /dashboard/calls (Completed tab) NOT
      // /dashboard/call-reviews — review page filters to calls with video
      // recordings only, so it'd hide no-shows + any call without a bot.
      // The Completed tab is the "all calls" list and supports outcome
      // filtering natively.
      href: `/dashboard/calls?outcome=lost,follow_up&dateRange=${encodeURIComponent(dateRange)}`,
    },
    {
      key: "uncollected" as const,
      label: "Uncollected on closes",
      sublabel: `${uncollected.dealCount} closed deal${uncollected.dealCount === 1 ? "" : "s"} with payment plans or unpaid balance`,
      amount: uncollected.amount,
      trend: uncollected.trend,
      colorClass: "bg-amber-500",
      href: `/dashboard/calls?outcome=closed&uncollected=true&dateRange=${encodeURIComponent(dateRange)}`,
    },
    {
      key: "noShows" as const,
      // Estimated bucket — call this out in the label so customers don't
      // confuse it with hard numbers above.
      label: "No-shows (estimated)",
      // Two sublabel variants:
      //   - With an avg deal size > 0: full math is visible ("3 no-shows × $6.5k avg").
      //   - With avg = 0 (no calls yet have contractValue filled): hide the
      //     misleading "× $0" — the estimate is honestly zero, but the math
      //     looks broken. Say so plainly instead.
      sublabel:
        noShows.avgDealSizeUsed > 0
          ? `${noShows.dealCount} no-show${noShows.dealCount === 1 ? "" : "s"} × ${formatCurrency(noShows.avgDealSizeUsed)} avg deal size`
          : `${noShows.dealCount} no-show${noShows.dealCount === 1 ? "" : "s"} — no contract data yet to estimate value`,
      amount: noShows.amount,
      trend: noShows.trend,
      colorClass: "bg-rose-400",
      href: `/dashboard/calls?outcome=no_show&dateRange=${encodeURIComponent(dateRange)}`,
    },
  ].sort((a, b) => b.amount - a.amount);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Money Left on the Table</CardTitle>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatCurrencyFull(totalLeak)}
            </span>{" "}
            this period
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked bar — proportional segments, in the same order as the
            row list. Borderless on the inside so the segments visually
            chain into one bar. */}
        <div className="flex h-3 w-full overflow-hidden rounded-md bg-zinc-100">
          {rows.map((row, i) => {
            const widthPct = (row.amount / totalLeak) * 100;
            if (widthPct < 0.5) return null;
            return (
              <div
                key={row.key}
                className={row.colorClass}
                style={{ width: `${widthPct}%` }}
                title={`${row.label}: ${formatCurrencyFull(row.amount)}`}
              />
            );
          })}
        </div>

        {/* Per-bucket rows. Clickable into Call Reviews with the right
            outcome / cohort filter applied. */}
        <div className="space-y-2">
          {rows.map((row) => (
            <Link
              key={row.key}
              href={row.href}
              className="group flex items-center gap-3 rounded-lg border border-transparent hover:border-zinc-200 hover:bg-zinc-50 px-3 py-2.5 transition-colors"
            >
              {/* Color swatch — visually ties row to its stacked-bar segment */}
              <div
                className={`w-2.5 h-2.5 rounded-sm shrink-0 ${row.colorClass}`}
              />

              {/* Label + sublabel */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {row.label}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {row.sublabel}
                </div>
              </div>

              {/* Amount + trend */}
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold tabular-nums">
                  {formatCurrencyFull(row.amount)}
                </div>
                <TrendChip trend={row.trend} />
              </div>

              <ChevronRight className="h-4 w-4 text-zinc-300 group-hover:text-zinc-500 shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Trend chip with up=bad / down=good semantics. Leak amounts going UP is
 * negative; going DOWN is positive. Inverse of revenue trends.
 */
function TrendChip({ trend }: { trend: number }) {
  const info = formatTrend(trend);
  if (info.isNeutral) {
    return <div className="text-xs text-muted-foreground">—</div>;
  }
  // For leak buckets, up = bad
  const isBad = info.isPositive;
  const color = isBad ? "text-red-600" : "text-emerald-600";
  return (
    <div className={`flex items-center justify-end gap-0.5 text-xs ${color}`}>
      {isBad ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      <span>{info.text}</span>
    </div>
  );
}
