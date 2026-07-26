"use client";

import { X } from "lucide-react";
import { MONO } from "@/components/analytics/primitives/typography";
import { fmtCurrency, fmtPct, initials } from "../lib/format";
import type { CloserRow } from "./Leaderboard";

/**
 * Replaces the team Pace/Prize cards while the board is focused on one rep.
 *
 * Swapped rather than kept alongside on purpose: leaving a team projection
 * next to one closer's funnel invites reading the two as the same scope, which
 * is exactly the confusion a filtered view should remove.
 */
export function CloserFocusCard({
  row,
  onClear,
}: {
  row: CloserRow;
  onClear: () => void;
}) {
  const goalPct = row.pctGoal;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
            {initials(row.name)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{row.name}</div>
            <div className="text-[11px] text-muted-foreground">
              Board filtered to this closer
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          title="Show the whole team again"
          className="shrink-0 rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className={"mt-4 text-2xl font-semibold tracking-tight " + MONO}>
        {fmtCurrency(row.totals.cash)}
      </div>
      <p className="text-[11px] text-muted-foreground">collected</p>

      {row.goal !== null && row.goal > 0 && (
        <>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={
                "h-full rounded-full " +
                ((goalPct ?? 0) >= 100 ? "bg-emerald-500" : "bg-foreground/70")
              }
              style={{ width: `${Math.min(100, Math.max(0, goalPct ?? 0))}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span className={MONO}>{fmtPct(goalPct)}</span>
            <span className={MONO}>of {fmtCurrency(row.goal)}</span>
          </div>
        </>
      )}

      <dl className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Avg deal</dt>
          <dd className={"font-medium " + MONO}>{fmtCurrency(row.avgDeal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Net contribution</dt>
          <dd
            className={
              "font-medium " + MONO +
              (row.net < 0 ? " text-rose-600 dark:text-rose-400" : "")
            }
          >
            {fmtCurrency(row.net)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Open / day</dt>
          <dd className={"font-medium " + MONO}>
            {row.openHoursPerDay == null
              ? "—"
              : `${row.openHoursPerDay.toFixed(1)}h`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
