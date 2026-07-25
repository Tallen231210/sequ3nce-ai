"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtCurrency, monthLabel, shiftMonth } from "../lib/format";

const WEEKS = [
  { index: null, label: "Month" },
  { index: 0, label: "WK1" },
  { index: 1, label: "WK2" },
  { index: 2, label: "WK3" },
  { index: 3, label: "WK4" },
  { index: 4, label: "WK5" },
] as const;

/**
 * Month stepper + week granularity. Stepping forward past the current month
 * is disabled — an empty future month looks like a data failure.
 */
export function PeriodNav({
  monthKey,
  currentMonthKey,
  weekIndex,
  isCurrentMonth,
  showWeeks = true,
  onMonthChange,
  onWeekChange,
}: {
  monthKey: string;
  currentMonthKey: string;
  weekIndex: number | null;
  isCurrentMonth: boolean;
  /** The daily grid always spans a full month, so it hides the week pills. */
  showWeeks?: boolean;
  onMonthChange: (m: string) => void;
  onWeekChange: (w: number | null) => void;
}) {
  const atLatest = monthKey >= currentMonthKey;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(monthKey, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex min-w-[168px] items-center justify-center gap-2 px-2">
          <span className="text-sm font-semibold">
            {monthLabel(monthKey, true)}
          </span>
          {isCurrentMonth ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-500" />
              LIVE
            </span>
          ) : (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              FINAL
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(monthKey, 1))}
          disabled={atLatest}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div
        className={
          "flex items-center gap-0.5 rounded-lg border border-border p-0.5 " +
          (showWeeks ? "" : "hidden")
        }
      >
        {WEEKS.map((w) => {
          const active = weekIndex === w.index;
          return (
            <button
              key={w.label}
              type="button"
              onClick={() => onWeekChange(w.index)}
              className={
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
                (active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground")
              }
            >
              {w.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Cash by week — a five-bar sparkline that always spans the whole month. */
export function WeekSparkline({
  weekCash,
  weekIndex,
  onWeekChange,
}: {
  weekCash: number[];
  weekIndex: number | null;
  onWeekChange: (w: number | null) => void;
}) {
  const max = Math.max(...weekCash, 1);
  const anyCash = weekCash.some((c) => c > 0);
  if (!anyCash) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">Cash by week</h3>
      {/* The bar track needs an explicit height: a percentage height inside a
          flex-1 parent has no basis to resolve against and collapses to zero. */}
      <div className="mt-4 flex items-end gap-2">
        {weekCash.map((c, i) => {
          const active = weekIndex === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onWeekChange(active ? null : i)}
              className="group flex flex-1 flex-col items-center gap-1.5"
              title={`WK${i + 1} · ${fmtCurrency(c)}`}
            >
              <div className="flex h-20 w-full items-end">
                <div
                  className={
                    "w-full rounded-t transition-all " +
                    (active
                      ? "bg-foreground"
                      : "bg-foreground/25 group-hover:bg-foreground/45")
                  }
                  style={{ height: `${Math.max((c / max) * 100, c > 0 ? 4 : 2)}%` }}
                />
              </div>
              <span
                className={
                  "text-[10px] " +
                  (active ? "font-semibold" : "text-muted-foreground")
                }
              >
                WK{i + 1}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
