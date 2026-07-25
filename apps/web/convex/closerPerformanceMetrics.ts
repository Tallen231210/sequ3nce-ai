import type { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// Team Performance Sheet — read-time aggregation.
//
// Merges the derived rollup (closerDailyStats) with manual corrections
// (closerDailyOverrides), then computes the four rates, unit economics,
// goal pacing, projections and the data-coverage signal.
//
// Pure functions only — no ctx — so this is trivially testable and the
// query layer stays thin.
// ============================================================================

export type Rag = "green" | "amber" | "red" | "na";

/**
 * Percentage-vs-target colouring. Mirrors setterData.ts:statusForDelta so a
 * customer sees identical semantics on both the setter and closer boards.
 */
export function ragForPct(actualPct: number | null, targetPct: number): Rag {
  if (actualPct === null) return "na";
  const gap = targetPct - actualPct;
  if (gap <= 5) return "green";
  if (gap <= 15) return "amber";
  return "red";
}

export const DEFAULT_TARGETS = {
  bookedPct: 70,
  showPct: 65,
  offerClosePct: 40,
  closePct: 25,
} as const;

export const DEFAULT_COMP_PCT = 20;

/** Below this share of taken calls having a logged outcome, the funnel
 *  under "Taken" is too sparse to be worth showing as fact. Drives the
 *  dashboard's "log your outcomes" state instead of a wall of zeros. */
export const COVERAGE_WARN_THRESHOLD = 0.5;

export interface FunnelTotals {
  slots: number;
  booked: number;
  taken: number;
  offers: number;
  closes: number;
  cash: number;
  contractValue: number;
  missingOutcomes: number;
}

export function emptyTotals(): FunnelTotals {
  return {
    slots: 0, booked: 0, taken: 0, offers: 0, closes: 0, cash: 0,
    contractValue: 0, missingOutcomes: 0,
  };
}

export function addTotals(a: FunnelTotals, b: FunnelTotals): FunnelTotals {
  return {
    slots: a.slots + b.slots,
    booked: a.booked + b.booked,
    taken: a.taken + b.taken,
    offers: a.offers + b.offers,
    closes: a.closes + b.closes,
    cash: a.cash + b.cash,
    contractValue: a.contractValue + b.contractValue,
    missingOutcomes: a.missingOutcomes + b.missingOutcomes,
  };
}

/**
 * Apply a manual override on top of a derived row. Any field present in the
 * override wins; everything else keeps the measured value. Returns which
 * fields were overridden so the UI can mark those cells as edited.
 */
export function applyOverride(
  derived: FunnelTotals,
  override: Doc<"closerDailyOverrides"> | null | undefined,
): { totals: FunnelTotals; overridden: string[] } {
  if (!override) return { totals: derived, overridden: [] };
  const out = { ...derived };
  const overridden: string[] = [];
  const fields = ["slots", "booked", "taken", "offers", "closes", "cash"] as const;
  for (const f of fields) {
    const v = override[f];
    if (typeof v === "number") {
      out[f] = v;
      overridden.push(f);
    }
  }
  return { totals: out, overridden };
}

export interface Rates {
  bookedPct: number | null;   // booked / slots
  showPct: number | null;     // taken / booked
  offerClosePct: number | null; // closes / offers
  closePct: number | null;    // closes / taken
}

/** All four rates. Divide-by-zero yields null so the UI renders "—". */
export function computeRates(t: FunnelTotals): Rates {
  const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);
  return {
    bookedPct: pct(t.booked, t.slots),
    showPct: pct(t.taken, t.booked),
    offerClosePct: pct(t.closes, t.offers),
    closePct: pct(t.closes, t.taken),
  };
}

export interface Coverage {
  taken: number;
  missingOutcomes: number;
  /** Share of taken calls that carry a logged outcome (0-1), null if none. */
  outcomeCoverage: number | null;
  /** True when the post-call form is too sparse to trust the lower funnel. */
  lowCoverage: boolean;
}

/**
 * How much of the funnel below "Taken" is actually knowable. Closes/Cash/
 * Offers exist only if a closer completed the post-call form; completion
 * ranges 6-100% across real teams, so a scoreboard that hides this would
 * present "0 closes" as fact when it means "nobody logged anything".
 */
export function computeCoverage(t: FunnelTotals): Coverage {
  const logged = Math.max(0, t.taken - t.missingOutcomes);
  const coverage = t.taken > 0 ? logged / t.taken : null;
  return {
    taken: t.taken,
    missingOutcomes: t.missingOutcomes,
    outcomeCoverage: coverage,
    lowCoverage: coverage !== null && coverage < COVERAGE_WARN_THRESHOLD,
  };
}

export interface Economics {
  adSpend: number;
  costPerBooked: number | null;
  teamNet: number;
}

export function computeEconomics(
  t: FunnelTotals,
  adSpendForPeriod: number,
  compPct: number,
): Economics {
  return {
    adSpend: adSpendForPeriod,
    costPerBooked: t.booked > 0 ? adSpendForPeriod / t.booked : null,
    teamNet: t.cash - adSpendForPeriod - t.cash * (compPct / 100),
  };
}

/** A rep's net contribution: cash minus their share of ads minus commission. */
export function repNet(
  repCash: number,
  repBooked: number,
  costPerBooked: number | null,
  compPct: number,
): number {
  const adCost = costPerBooked !== null ? costPerBooked * repBooked : 0;
  return repCash - adCost - repCash * (compPct / 100);
}

export interface Projection {
  projectedCash: number;
  target: number;
  collected: number;
  remaining: number;
  needPerDay: number;
  daysElapsed: number;
  daysLeft: number;
  onTrack: boolean;
  pctOfTarget: number | null;
  isFinal: boolean; // past month — show "Final", not "Projected"
}

/**
 * Pace-based month projection. `daysElapsed` counts days of the month that
 * have passed (>=1) so we never divide by zero on the 1st.
 */
export function computeProjection(
  collected: number,
  target: number,
  daysInMonth: number,
  daysElapsed: number,
  isFinal: boolean,
): Projection {
  const elapsed = Math.max(1, Math.min(daysElapsed, daysInMonth));
  const projectedCash = isFinal
    ? collected
    : Math.round(collected * (daysInMonth / elapsed));
  const remaining = Math.max(0, target - collected);
  const daysLeft = Math.max(0, daysInMonth - elapsed);
  return {
    projectedCash,
    target,
    collected,
    remaining,
    needPerDay: daysLeft > 0 ? remaining / daysLeft : remaining,
    daysElapsed: elapsed,
    daysLeft,
    onTrack: target > 0 ? projectedCash >= target : true,
    pctOfTarget: target > 0 ? (collected / target) * 100 : null,
    isFinal,
  };
}

export interface CloserRow {
  closerId: Id<"closers">;
  name: string;
  totals: FunnelTotals;
  rates: Rates;
  rag: Record<keyof Rates, Rag>;
  avgDeal: number | null;
  net: number;
  goal: number | null;
  pctGoal: number | null;
  wowPct: number | null; // this week's cash vs last week's
  overriddenFields: string[];
}

export function ragForRates(
  rates: Rates,
  targets: { bookedPct: number; showPct: number; offerClosePct: number; closePct: number },
): Record<keyof Rates, Rag> {
  return {
    bookedPct: ragForPct(rates.bookedPct, targets.bookedPct),
    showPct: ragForPct(rates.showPct, targets.showPct),
    offerClosePct: ragForPct(rates.offerClosePct, targets.offerClosePct),
    closePct: ragForPct(rates.closePct, targets.closePct),
  };
}

/** Goal progress. Over-100% is real and should display (e.g. 105%). */
export function pctOfGoal(cash: number, goal: number | null): number | null {
  if (!goal || goal <= 0) return null;
  return (cash / goal) * 100;
}

export function wow(thisWeekCash: number, lastWeekCash: number): number | null {
  if (lastWeekCash <= 0) return null;
  return ((thisWeekCash - lastWeekCash) / lastWeekCash) * 100;
}
