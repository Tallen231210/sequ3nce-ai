"use client";

import { Lock } from "lucide-react";
import { fmtCurrency, fmtNum, fmtPct } from "../lib/format";
import { MONO } from "@/components/analytics/primitives/typography";

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
  /** Conversion from the stage above, as a percentage. */
  fromPrev: number | null;
  /** How many were lost between the stage above and this one. */
  lost: number;
  /** What that loss means in plain words. */
  lostLabel: string;
  /** True when the post-call form gates this number. */
  gated: boolean;
}

function buildStages(t: Totals, gateBelowTaken: boolean): Stage[] {
  const rate = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
  const lost = (a: number, b: number) => Math.max(0, a - b);
  return [
    { key: "slots", label: "Slots", value: t.slots, fromPrev: null, lost: 0, lostLabel: "", gated: false },
 {
      key: "booked", label: "Booked", value: t.booked,
 fromPrev: rate(t.booked, t.slots),
      lost: lost(t.slots, t.booked), lostLabel: "unfilled", gated: false,
 },
    {
      key: "taken", label: "Taken", value: t.taken,
 fromPrev: rate(t.taken, t.booked),
      lost: lost(t.booked, t.taken), lostLabel: "no-showed", gated: false,
 },
    {
      key: "offers", label: "Offers", value: t.offers,
 fromPrev: rate(t.offers, t.taken),
      lost: lost(t.taken, t.offers), lostLabel: "no offer made", gated: gateBelowTaken,
 },
    {
      key: "closes", label: "Closes", value: t.closes,
 fromPrev: rate(t.closes, t.offers),
      lost: lost(t.offers, t.closes), lostLabel: "didn't close", gated: gateBelowTaken,
 },
  ];
}

/**
 * Where deals die.
 *
 * The count at each stage is the easy half; the number that earns a manager's
 * attention is how many were LOST getting there, so that is given equal weight
 * and the worst leak is called out by name. Bars scale against the widest
 * stage, so a funnel that loses most of its volume early still leaves the
 * later stages readable.
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

  // Name the biggest leak once, at the top — a manager reading a funnel is
  // looking for the answer to "where do I focus", not for five numbers.
 const leak = stages
    .filter((s) => !s.gated && s.lost > 0)
    .reduce<Stage | null>(
      (worst, s) => (worst === null || s.lost > worst.lost ? s : worst),
      null,
    );
  const leakIndex = leak ? stages.findIndex((s) => s.key === leak.key) : -1;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
 <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3.5">
 <h3 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
 Funnel
        </h3>
        {leak && leakIndex > 0 && (
          <p className="text-xs text-muted-foreground">
 Biggest drop-off{" "}
 <span className="font-medium text-foreground">
 {stages[leakIndex - 1].label} → {leak.label}
            </span>
            {" · "}
 <span className={`font-medium text-foreground ${MONO}`}>
              {fmtNum(leak.lost)} {leak.lostLabel}
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between px-5 py-5">
 {stages.map((s, i) => {
          const widthPct = Math.max((s.value / max) * 100, s.value > 0 ? 1.5 : 0);
          const dim = s.gated && s.value === 0;
          const isWorst = leak?.key === s.key;

          return (
            <div key={s.key}>
              {/* Connector carries the conversion AND the loss it implies. */}
              {i > 0 && (
                <div className="flex items-center gap-2 py-2 pl-[76px] text-[11px]">
 <span
                    className={
                      MONO + " font-medium " +
 (dim ? "text-muted-foreground" : "text-foreground")
 }
                  >
                    {fmtPct(s.fromPrev, s.fromPrev !== null && s.fromPrev < 10 ? 1 : 0)}
                  </span>
                  {!dim && s.lost > 0 && (
                    <span
                      className={
                        isWorst
                          ? "font-medium text-amber-600"
 : "text-muted-foreground"
 }
                    >
                      · {fmtNum(s.lost)} {s.lostLabel}
                    </span>
                  )}
                  {dim && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
 <Lock className="h-3 w-3" />
 needs post-call form
                    </span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
 <div className="w-[64px] shrink-0 text-right">
 <span
                    className={
                      "text-[11px] font-medium uppercase tracking-wider " +
 (dim ? "text-muted-foreground/60" : "text-muted-foreground")
 }
                  >
                    {s.label}
                  </span>
                </div>

                <span
                  className={
                    "w-[68px] shrink-0 text-right text-xl font-semibold " + MONO + " " +
 (dim ? "text-muted-foreground/50" : "")
 }
                >
                  {fmtNum(s.value)}
                </span>

                <div className="h-10 flex-1 overflow-hidden rounded-md bg-muted/60">
 <div
                    className={
                      "h-full rounded-md transition-all duration-500 " +
 (dim ? "bg-muted" : "bg-foreground")
 }
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* Cash is the outcome the whole funnel exists to produce, so it gets
            the weight rather than sitting as another row. */}
        <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border pt-5 pl-[76px]">
 <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
 Cash
          </span>
          <span className={`text-2xl font-semibold tracking-tight ${MONO}`}>
            {fmtCurrency(totals.cash)}
          </span>
          {totals.closes > 0 && (
            <span className="text-xs text-muted-foreground">
              {fmtCurrency(totals.cash / totals.closes)} average deal
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
