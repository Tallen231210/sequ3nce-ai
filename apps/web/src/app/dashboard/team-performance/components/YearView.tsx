"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Crown,
  Loader2,
} from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import {
  fmtCurrency,
  fmtNum,
  fmtPct,
  fmtSigned,
  RAG_TEXT,
} from "../lib/format";
import { MONO } from "@/components/analytics/primitives/typography";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Twelve months of cash. Bars are scaled to the best month so the shape of
 * the year is readable even when one month dwarfs the rest.
 */
function YearChart({
  months,
  bestMonthKey,
  onPick,
}: {
  months: any[];
  bestMonthKey: string | null;
  onPick: (monthKey: string) => void;
}) {
  const max = Math.max(...months.map((m) => m.totals.cash), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold">Cash by month</h3>
        <p className="text-xs text-muted-foreground">Click a month to open it</p>
      </div>

      <div className="mt-5 flex items-end gap-1.5">
        {months.map((m) => {
          const pct = (m.totals.cash / max) * 100;
          const isBest = m.monthKey === bestMonthKey && m.totals.cash > 0;
          return (
            <button
              key={m.monthKey}
              type="button"
              disabled={!m.hasData}
              onClick={() => onPick(m.monthKey)}
              title={`${MONTH_LABELS[m.monthIndex - 1]} — ${fmtCurrency(m.totals.cash)}`}
              className="group flex flex-1 flex-col items-center gap-1.5 disabled:cursor-default"
            >
              <span className={`text-[10px] ${MONO} text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100`}>
                {m.totals.cash > 0 ? fmtCurrency(m.totals.cash, true) : ""}
              </span>
              {/* Explicit height: the row uses items-end, so buttons are sized
                  by content and a percentage height inside them has nothing to
                  resolve against — the bars collapsed to zero and the chart
                  rendered blank. */}
              <div className="flex h-36 w-full items-end">
                <div
                  className={
                    "w-full rounded-t transition-all " +
                    (m.isFuture
                      ? "bg-muted/40"
                      : isBest
                        ? "bg-foreground"
                        : m.hasData
                          ? "bg-foreground/35 group-hover:bg-foreground/60"
                          : "bg-muted")
                  }
                  style={{
                    height: `${Math.max(pct, m.totals.cash > 0 ? 3 : 1.5)}%`,
                  }}
                />
              </div>
              <span
                className={
                  "text-[10px] " +
                  (m.isCurrent
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground")
                }
              >
                {MONTH_LABELS[m.monthIndex - 1]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TH =
  "px-2.5 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap";
const TD = "px-2.5 py-2.5 text-sm " + MONO + " whitespace-nowrap";

export function YearView({
  onOpenMonth,
}: {
  onOpenMonth: (monthKey: string) => void;
}) {
  const { user } = useUser();
  const [year, setYear] = useState<number | null>(null);

  const data = useQuery(
    api.closerPerformanceYear.getYearPerformance,
    user ? { clerkId: user.id, ...(year === null ? {} : { year }) } : "skip",
  );

  if (data === undefined) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!data) return null;

  const shown = data.year as number;
  const atLatest = shown >= data.currentYear;
  const months = data.months as any[];
  const hasAnything = data.activeMonths > 0;

  return (
    <div className="space-y-5">
      {/* Year stepper */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setYear(shown - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Previous year"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className={`min-w-[72px] text-center text-sm font-semibold ${MONO}`}>
          {shown}
        </span>
        <button
          type="button"
          onClick={() => setYear(shown + 1)}
          disabled={atLatest}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          aria-label="Next year"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {data.truncated && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50/70 px-4 py-3 dark:border-amber-800/70 dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            This year has more daily records than a single read can return, so
            the figures below are incomplete. Use the month view for accurate
            numbers.
          </p>
        </div>
      )}

      {!hasAnything ? (
        <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing recorded in {shown}.
          </p>
        </div>
      ) : (
        <>
          {/* Year summary */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card px-5 py-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-muted-foreground">Cash collected</div>
              <div className={`mt-0.5 text-lg font-semibold ${MONO}`}>
                {fmtCurrency(data.yearTotals.cash)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                across {data.activeMonths} month
                {data.activeMonths === 1 ? "" : "s"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Closes</div>
              <div className={`mt-0.5 text-lg font-semibold ${MONO}`}>
                {fmtNum(data.yearTotals.closes)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Calls taken</div>
              <div className={`mt-0.5 text-lg font-semibold ${MONO}`}>
                {fmtNum(data.yearTotals.taken)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Avg / active month
              </div>
              <div className={`mt-0.5 text-lg font-semibold ${MONO}`}>
                {fmtCurrency(data.avgCashPerActiveMonth)}
              </div>
            </div>
          </div>

          <YearChart
            months={months}
            bestMonthKey={data.bestMonthKey}
            onPick={onOpenMonth}
          />

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3.5">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Month by month
              </h3>
              {data.adSpendIsCurrentMonthly && (
                <p className="text-[11px] text-muted-foreground">
                  Cost / booked and Net use today&apos;s monthly ad spend, not
                  what was spent at the time
                </p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className={TH + " text-left"}>Month</th>
                    <th className={TH + " text-right"}>Cash</th>
                    <th className={TH + " text-right"}>MoM</th>
                    <th className={TH + " text-right"}>Closes</th>
                    <th className={TH + " text-right"}>Avg deal</th>
                    <th className={TH + " text-right"}>Show</th>
                    <th className={TH + " text-right"}>Close</th>
                    <th className={TH + " text-right"}>Cost / booked</th>
                    <th className={TH + " text-right"}>Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {months
                    .filter((m) => m.hasData || m.isCurrent)
                    .map((m) => (
                      <tr
                        key={m.monthKey}
                        onClick={() => m.hasData && onOpenMonth(m.monthKey)}
                        className={
                          "transition-colors " +
                          (m.hasData
                            ? "cursor-pointer hover:bg-muted/40 "
                            : "") +
                          (m.monthKey === data.bestMonthKey
                            ? "bg-amber-50/40 dark:bg-amber-950/10"
                            : "")
                        }
                      >
                        <td className="px-2.5 py-2.5">
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            {MONTH_LABELS[m.monthIndex - 1]}
                            {m.monthKey === data.bestMonthKey &&
                              m.totals.cash > 0 && (
                                <Crown
                                  className="h-3 w-3 text-amber-500"
                                  aria-label="Best month"
                                />
                              )}
                            {m.isCurrent && (
                              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                LIVE
                              </span>
                            )}
                          </span>
                        </td>
                        <td className={TD + " text-right font-semibold"}>
                          {fmtCurrency(m.totals.cash)}
                        </td>
                        <td className={TD + " text-right"}>
                          {m.momPct === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={
                                m.momPct >= 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-rose-600 dark:text-rose-400"
                              }
                            >
                              {fmtSigned(m.momPct)}
                            </span>
                          )}
                        </td>
                        <td className={TD + " text-right"}>
                          {fmtNum(m.totals.closes)}
                        </td>
                        <td className={TD + " text-right text-muted-foreground"}>
                          {fmtCurrency(m.avgDeal)}
                        </td>
                        <td className={TD + " text-right"}>
                          {fmtPct(m.rates.showPct)}
                        </td>
                        <td className={TD + " text-right"}>
                          {fmtPct(m.rates.closePct)}
                        </td>
                        <td className={TD + " text-right text-muted-foreground"}>
                          {m.costPerBooked == null
                            ? "—"
                            : fmtCurrency(m.costPerBooked)}
                        </td>
                        <td
                          className={
                            TD + " text-right " +
                            (m.net != null && m.net < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "")
                          }
                        >
                          {m.net == null ? "—" : fmtCurrency(m.net)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
