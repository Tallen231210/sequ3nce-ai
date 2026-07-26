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
import { MONO } from "@/components/analytics/primitives/typography";

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
  /** Average hours left unbooked per active day. Null when unmeasurable. */
  openHoursPerDay?: number | null;
  /** Cash per week, for the row sparkline. */
  weekCash?: number[];
  /** This rep's own capacity signal. Booked% is suppressed per rep, so a
   *  focused view must honour their signal rather than the team's. */
  capacity?: { reliable: boolean };
}

/**
 * A rep's cash across the month's weeks, at row scale.
 *
 * Scaled per row rather than against the whole board: the question this
 * answers is "is this person climbing or fading", which is about their own
 * shape over time, not how they rank. Cross-rep comparison is what the Cash
 * column is for.
 */
function RowSpark({ weeks }: { weeks?: number[] }) {
  if (!weeks || weeks.every((w) => w === 0)) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const max = Math.max(...weeks, 1);
  return (
    <span className="inline-flex h-6 items-end gap-[3px]" aria-hidden>
      {weeks.map((w, i) => (
        <span
          key={i}
          title={`WK${i + 1}`}
          className="w-[5px] rounded-[1px] bg-foreground/25"
          style={{ height: `${Math.max((w / max) * 100, w > 0 ? 12 : 6)}%` }}
        />
      ))}
    </span>
  );
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
            "text-xs font-semibold " + MONO + " " +
            (hit ? "text-emerald-600 dark:text-emerald-400" : "")
          }
        >
          {fmtPct(pct)}
        </span>
        <span className={`text-[10px] text-muted-foreground ${MONO}`}>
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

function WowCell({
  pct,
  daysCompared,
}: {
  pct: number | null;
  daysCompared?: number;
}) {
  if (pct === null) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="No prior week to compare against yet"
      >
        —
      </span>
    );
  }
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      title={
        daysCompared
          ? `This week's first ${daysCompared} day${daysCompared === 1 ? "" : "s"} vs the same ${daysCompared} last week`
          : undefined
      }
      className={
        "inline-flex items-center gap-1 text-xs font-medium " + MONO + " " +
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
  "px-2.5 py-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap";
const TD = "px-2.5 py-2.5 text-sm " + MONO + " whitespace-nowrap";

/**
 * A funnel count with the conversion that produced it, stacked. Keeping the
 * pair together halves the column count and puts each rate next to the number
 * it came from, instead of stranding them at opposite ends of a wide table.
 */
function CountRate({
  count,
  rate,
  tone,
  dim,
}: {
  count: number;
  rate?: number | null;
  tone?: Rag;
  dim?: boolean;
}) {
  return (
    <div className="text-right leading-tight">
      <div
        className={"text-sm " + MONO + " " + (dim ? "text-muted-foreground" : "")}
      >
        {fmtNum(count)}
      </div>
      {rate !== undefined && (
        <div
          className={
            "text-[11px] " + MONO + " " + (tone ? RAG_TEXT[tone] : "text-muted-foreground")
          }
        >
          {rate === null ? "—" : fmtPct(rate)}
        </div>
      )}
    </div>
  );
}

export function Leaderboard({
  rows,
  gateBelowTaken,
  wowDaysCompared,
  selectedCloserId,
  onSelectCloser,
}: {
  rows: CloserRow[];
  gateBelowTaken: boolean;
  /** How many elapsed days WoW compared, so the column can say so. */
  wowDaysCompared?: number;
  selectedCloserId?: string | null;
  /** Clicking a row focuses the whole board on that rep. */
  onSelectCloser?: (closerId: string | null) => void;
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
        <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Leaderboard</h3>
        <p className="text-xs text-muted-foreground">
          {onSelectCloser
            ? "Ranked by cash · click a row to focus"
            : "Ranked by cash collected"}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <th className={TH + " w-9 text-center"}>#</th>
              <th className={TH + " text-left"}>Closer</th>
              <th className={TH + " text-right"}>Trend</th>
              <th className={TH + " text-right"}>Open/day</th>
              <th className={TH + " text-right"}>Booked</th>
              <th className={TH + " text-right"}>Taken</th>
              <th className={TH + " text-right"}>Offers</th>
              <th className={TH + " text-right"}>Closes</th>
              <th className={TH + " text-right"}>Cash</th>
              <th className={TH + " text-right"}>Avg deal</th>
              <th className={TH + " text-right"}>Net</th>
              <th className={TH + " text-left"}>Goal</th>
              <th
                className={TH + " text-right"}
                title="Week over week, comparing only the days elapsed so far against the same days last week"
              >
                WoW
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => {
              const leader = i === 0 && r.totals.cash > 0;
              const edited = r.overriddenFields.length > 0;
              return (
                <tr
                  key={r.closerId}
                  onClick={() =>
                    onSelectCloser?.(
                      selectedCloserId === r.closerId ? null : r.closerId,
                    )
                  }
                  className={
                    "transition-colors " +
                    (onSelectCloser ? "cursor-pointer " : "") +
                    (selectedCloserId === r.closerId
                      ? "bg-muted "
                      : "hover:bg-muted/40 " +
                        (leader ? "bg-amber-50/40 dark:bg-amber-950/10 " : ""))
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

                  <td className="px-2.5 py-2.5 text-right">
                    <RowSpark weeks={r.weekCash} />
                  </td>
                  <td
                    className={TD + " text-right text-muted-foreground"}
                    title={
                      r.openHoursPerDay == null
                        ? "Availability not measured — this closer's calendar doesn't show when they're unavailable"
                        : "Average time left unbooked per active day"
                    }
                  >
                    {r.openHoursPerDay == null
                      ? "—"
                      : `${r.openHoursPerDay.toFixed(1)}h`}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <CountRate
                      count={r.totals.booked}
                      rate={r.rates.bookedPct}
                      tone={r.rag.bookedPct}
                    />
                  </td>
                  <td className="px-2.5 py-2.5">
                    <CountRate
                      count={r.totals.taken}
                      rate={r.rates.showPct}
                      tone={r.rag.showPct}
                    />
                  </td>
                  <td className="px-2.5 py-2.5">
                    <CountRate count={r.totals.offers} dim={gateBelowTaken} />
                  </td>
                  <td className="px-2.5 py-2.5">
                    <CountRate
                      count={r.totals.closes}
                      rate={r.rates.closePct}
                      tone={r.rag.closePct}
                      dim={gateBelowTaken}
                    />
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
                    <WowCell pct={r.wowPct} daysCompared={wowDaysCompared} />
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
