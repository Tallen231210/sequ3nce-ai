"use client";

import { fmtPct, RAG_BAR, RAG_DOT, RAG_TEXT, type Rag } from "../lib/format";

interface Rates {
  bookedPct: number | null;
  showPct: number | null;
  offerClosePct: number | null;
  closePct: number | null;
}

type RateKey = keyof Rates;

const KPI_META: Array<{ key: RateKey; label: string; formula: string }> = [
  { key: "bookedPct", label: "Booked", formula: "Booked ÷ Slots" },
  { key: "showPct", label: "Show", formula: "Taken ÷ Booked" },
  { key: "offerClosePct", label: "Offer → Close", formula: "Closes ÷ Offers" },
  { key: "closePct", label: "Close", formula: "Closes ÷ Taken" },
];

/**
 * The four rates against their manager-set targets. Each tile carries the
 * formula because "close rate" means at least three different things across
 * sales teams, and an unexplained number invites an argument rather than a
 * decision.
 */
export function KpiStrip({
  rates,
  rag,
  targets,
}: {
  rates: Rates;
  rag: Record<RateKey, Rag>;
  targets: Record<RateKey, number>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {KPI_META.map(({ key, label, formula }) => {
        const value = rates[key];
        const target = targets[key];
        const tone = rag[key];
        // Bar shows progress toward target; over-target pins full and green.
        const fill =
          value === null ? 0 : Math.min(100, (value / Math.max(target, 1)) * 100);

        return (
          <div
            key={key}
            className="rounded-xl border border-border bg-card px-4 py-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <span
                className={"h-1.5 w-1.5 rounded-full " + RAG_DOT[tone]}
                aria-hidden
              />
            </div>

            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span
                className={
                  "text-2xl font-semibold tabular-nums " + RAG_TEXT[tone]
                }
              >
                {fmtPct(value, value !== null && value < 10 ? 1 : 0)}
              </span>
              <span className="text-xs text-muted-foreground">
                / {fmtPct(target)}
              </span>
            </div>

            <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={"h-full rounded-full transition-all " + RAG_BAR[tone]}
                style={{ width: `${fill}%` }}
              />
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">{formula}</p>
          </div>
        );
      })}
    </div>
  );
}
