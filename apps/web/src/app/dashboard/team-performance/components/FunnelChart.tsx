"use client";

import { ChevronDown, Lock } from "lucide-react";
import { fmtCurrency, fmtNum, fmtPct } from "../lib/format";

interface Totals {
  slots: number;
  booked: number;
  taken: number;
  offers: number;
  closes: number;
  cash: number;
}

interface Stage {
  key: string;
  label: string;
  value: number;
  hint: string;
  /** Conversion from the stage above, as a percentage. */
  fromPrev: number | null;
  /** True when the post-call form gates this number. */
  gated: boolean;
}

function buildStages(t: Totals, gateBelowTaken: boolean): Stage[] {
  const rate = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
  return [
    {
      key: "slots", label: "Slots", value: t.slots,
      hint: "Bookable capacity on calendars", fromPrev: null, gated: false,
    },
    {
      key: "booked", label: "Booked", value: t.booked,
      hint: "Appointments set", fromPrev: rate(t.booked, t.slots), gated: false,
    },
    {
      key: "taken", label: "Taken", value: t.taken,
      hint: "Calls that happened", fromPrev: rate(t.taken, t.booked), gated: false,
    },
    {
      key: "offers", label: "Offers", value: t.offers,
      hint: "A price was presented", fromPrev: rate(t.offers, t.taken),
      gated: gateBelowTaken,
    },
    {
      key: "closes", label: "Closes", value: t.closes,
      hint: "Deals won", fromPrev: rate(t.closes, t.offers),
      gated: gateBelowTaken,
    },
  ];
}

/**
 * Where deals die, at a glance. Bars are scaled against the widest stage
 * rather than against Slots, so a funnel that loses 90% at the first step
 * still shows readable bars further down.
 */
export function FunnelChart({
  totals,
  gateBelowTaken,
}: {
  totals: Totals;
  gateBelowTaken: boolean;
}) {
  const stages = buildStages(totals, gateBelowTaken);
  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-3.5">
        <h3 className="text-sm font-semibold">Funnel</h3>
        <p className="text-xs text-muted-foreground">
          Conversion shown between stages
        </p>
      </div>

      <div className="space-y-1 px-5 py-4">
        {stages.map((s, i) => {
          const widthPct = Math.max((s.value / max) * 100, s.value > 0 ? 2 : 0);
          const dim = s.gated && s.value === 0;
          return (
            <div key={s.key}>
              {/* Conversion connector from the previous stage */}
              {i > 0 && (
                <div className="flex items-center gap-1.5 py-1 pl-[104px] text-[11px] text-muted-foreground">
                  <ChevronDown className="h-3 w-3 shrink-0" />
                  <span className="tabular-nums font-medium">
                    {fmtPct(s.fromPrev, s.fromPrev !== null && s.fromPrev < 10 ? 1 : 0)}
                  </span>
                  <span className="truncate">
                    of {stages[i - 1].label.toLowerCase()}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="w-[92px] shrink-0 text-right">
                  <div
                    className={
                      "text-sm font-medium " + (dim ? "text-muted-foreground" : "")
                    }
                  >
                    {s.label}
                  </div>
                </div>

                <div className="relative h-9 flex-1 overflow-hidden rounded-md bg-muted/50">
                  <div
                    className={
                      "h-full rounded-md transition-all duration-500 " +
                      (dim
                        ? "bg-muted"
                        : s.key === "closes"
                          ? "bg-foreground"
                          : "bg-foreground/70")
                    }
                    style={{ width: `${widthPct}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-between px-3">
                    {/* The label sits at the bar's left edge, so it only needs
                        enough fill behind it to be legible — not the near-half
                        width an earlier threshold demanded, which left short
                        bars rendering dark text on a dark fill. */}
                    <span
                      className={
                        "text-sm font-semibold tabular-nums " +
                        (widthPct >= 7 && !dim
                          ? "text-background"
                          : "text-foreground")
                      }
                    >
                      {fmtNum(s.value)}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {dim && <Lock className="h-3 w-3" />}
                      <span className="hidden sm:inline">
                        {dim ? "needs post-call form" : s.hint}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Cash sits outside the count funnel — different unit, same story. */}
        <div className="!mt-3 flex items-center gap-3 border-t border-border pt-3">
          <div className="w-[92px] shrink-0 text-right text-sm font-medium">
            Cash
          </div>
          <div className="flex flex-1 items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums">
              {fmtCurrency(totals.cash)}
            </span>
            {totals.closes > 0 && (
              <span className="text-xs text-muted-foreground">
                {fmtCurrency(totals.cash / totals.closes)} avg deal
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
