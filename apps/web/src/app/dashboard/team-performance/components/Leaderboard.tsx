"use client";

import { Crown, PencilLine, TrendingDown, TrendingUp } from "lucide-react";
import {
  fmtCurrency,
  fmtNum,
  fmtPct,
  fmtSigned,
  initials,
  RAG_TEXT,
  type Rag,
} from "../lib/format";

export interface CloserRow {
  closerId: string;
  name: string;
  totals: {
    slots: number; booked: number; taken: number; offers: number;
    closes: number; cash: number; contractValue: number; missingOutcomes: number;
  };
  rates: {
    bookedPct: number | null; showPct: number | null;
    offerClosePct: number | null; closePct: number | null;
  };
  rag: Record<"bookedPct" | "showPct" | "offerClosePct" | "closePct", Rag>;
  avgDeal: number | null;
  net: number;
  goal: number | null;
  pctGoal: number | null;
  wowPct: number | null;
  overriddenFields: string[];
}

function GoalCell({ pct, goal }: { pct: number | null; goal: number | null }) {
  if (goal === null || goal <= 0) {
    return <span className="text-xs text-muted-foreground">No goal set</span>;
  }
  const clamped = Math.min(100, Math.max(0, pct ?? 0));
  const hit = (pct ?? 0) >= 100;
  return (
    <div className="w-[104px]">
      <div className="flex items-baseline justify-between">
        <span
          className={
            "text-xs font-semibold tabular-nums " +
            (hit ? "text-emerald-600 dark:text-emerald-400" : "")
          }
        >
          {fmtPct(pct)}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {fmtCurrency(goal, true)}
        </span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={
            "h-full rounded-full transition-all " +
            (hit ? "bg-emerald-500" : "bg-foreground/60")
          }
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function WowCell({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums " +
        (up
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400")
      }
    >
      <Icon className="h-3 w-3" />
      {fmtSigned(pct)}
    </span>
  );
}

const TH =
  "px-3 py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground whitespace-nowrap";
const TD = "px-3 py-3 text-sm tabular-nums whitespace-nowrap";

export function Leaderboard({
  rows,
  gateBelowTaken,
}: {
  rows: CloserRow[];
  gateBelowTaken: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No closer activity recorded for this period.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-3.5">
        <h3 className="text-sm font-semibold">Leaderboard</h3>
        <p className="text-xs text-muted-foreground">Ranked by cash collected</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <th className={TH + " w-10 text-center"}>#</th>
              <th className={TH + " text-left"}>Closer</th>
              <th className={TH + " text-right"}>Booked</th>
              <th className={TH + " text-right"}>Taken</th>
              <th className={TH + " text-right"}>Show</th>
              <th className={TH + " text-right"}>Offers</th>
              <th className={TH + " text-right"}>Closes</th>
              <th className={TH + " text-right"}>Close</th>
              <th className={TH + " text-right"}>Cash</th>
              <th className={TH + " text-right"}>Avg deal</th>
              <th className={TH + " text-right"}>Net</th>
              <th className={TH + " text-left"}>Goal</th>
              <th className={TH + " text-right"}>WoW</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const leader = i === 0 && r.totals.cash > 0;
              const edited = r.overriddenFields.length > 0;
              return (
                <tr
                  key={r.closerId}
                  className={
                    "transition-colors hover:bg-muted/40 " +
                    (leader ? "bg-amber-50/40 dark:bg-amber-950/10" : "")
                  }
                >
                  <td className={TD + " text-center text-muted-foreground"}>
                    {leader ? (
                      <Crown
                        className="mx-auto h-3.5 w-3.5 text-amber-500"
                        aria-label="Top performer"
                      />
                    ) : (
                      i + 1
                    )}
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                        {initials(r.name)}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {r.name}
                      </span>
                      {edited && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                          title="Contains manually entered values that differ from what Sequ3nce recorded"
                        >
                          <PencilLine className="h-2.5 w-2.5" />
                          Edited
                        </span>
                      )}
                    </div>
                  </td>

                  <td className={TD + " text-right"}>{fmtNum(r.totals.booked)}</td>
                  <td className={TD + " text-right"}>{fmtNum(r.totals.taken)}</td>
                  <td className={TD + " text-right " + RAG_TEXT[r.rag.showPct]}>
                    {fmtPct(r.rates.showPct)}
                  </td>
                  <td
                    className={
                      TD + " text-right " +
                      (gateBelowTaken ? "text-muted-foreground" : "")
                    }
                  >
                    {fmtNum(r.totals.offers)}
                  </td>
                  <td
                    className={
                      TD + " text-right font-medium " +
                      (gateBelowTaken ? "text-muted-foreground" : "")
                    }
                  >
                    {fmtNum(r.totals.closes)}
                  </td>
                  <td className={TD + " text-right " + RAG_TEXT[r.rag.closePct]}>
                    {fmtPct(r.rates.closePct)}
                  </td>
                  <td className={TD + " text-right font-semibold"}>
                    {fmtCurrency(r.totals.cash)}
                  </td>
                  <td className={TD + " text-right text-muted-foreground"}>
                    {fmtCurrency(r.avgDeal)}
                  </td>
                  <td
                    className={
                      TD + " text-right " +
                      (r.net < 0 ? "text-rose-600 dark:text-rose-400" : "")
                    }
                  >
                    {fmtCurrency(r.net)}
                  </td>
                  <td className="px-3 py-3">
                    <GoalCell pct={r.pctGoal} goal={r.goal} />
                  </td>
                  <td className={TD + " text-right"}>
                    <WowCell pct={r.wowPct} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
