"use client";

import { fmtPct, RAG_BAR, RAG_TEXT, type Rag } from "../lib/format";

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
  capacityReliable = true,
}: {
  rates: Rates;
  rag: Record<RateKey, Rag>;
  targets: Record<RateKey, number>;
  /** False when Slots were assumed rather than measured, which makes
   *  Booked% unquotable — see computeCapacitySignal. */
  capacityReliable?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {KPI_META.map(({ key, label, formula }) => {
        const value = rates[key];
        // A suppressed Booked% is a different thing from a zero: say so.
        const unmeasured = key === "bookedPct" && !capacityReliable;
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
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>

            <div className="mt-2 flex items-baseline gap-1.5">
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

            <p className="mt-2 text-[11px] text-muted-foreground">
              {unmeasured ? "Availability not measured" : formula}
            </p>
          </div>
        );
      })}
    </div>
  );
}
