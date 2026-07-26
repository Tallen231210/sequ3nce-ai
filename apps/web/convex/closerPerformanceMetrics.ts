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

/**
 * Merge derived daily rows with manual corrections, keyed by (day, closer).
 *
 * Critically this is a UNION, not a walk of the derived rows. A recount
 * deletes a day that measured nothing, so a manager correcting a day the
 * meeting bot missed entirely would otherwise have their entry vanish: no
 * derived row means nothing to iterate. That is the exact case the override
 * exists for — a rep took calls without the bot running — so it has to work
 * when there is no measurement at all.
 */
export function mergeDailyRows(
  stats: Array<Doc<"closerDailyStats">>,
  overrides: Array<Doc<"closerDailyOverrides">>,
): Array<{
  dayKey: string;
  closerId: string;
  totals: FunnelTotals;
  overridden: string[];
  capacityKnown: boolean | undefined;
  /** Minutes of observed free time — powers the Open/day column. */
  openMinutes: number | undefined;
  measured: FunnelTotals;
}> {
  const byKey = new Map<
    string,
    {
      dayKey: string;
      closerId: string;
      measured: FunnelTotals;
      capacityKnown: boolean | undefined;
      openMinutes: number | undefined;
    }
  >();

  for (const r of stats) {
    byKey.set(`${r.dayKey}|${String(r.closerId)}`, {
      dayKey: r.dayKey,
      closerId: String(r.closerId),
      capacityKnown: r.capacityKnown,
      openMinutes: r.openMinutes,
      measured: {
        slots: r.slots, booked: r.booked, taken: r.taken,
        offers: r.offers, closes: r.closes, cash: r.cash,
        contractValue: r.contractValue,
        missingOutcomes: r.missingOutcomes ?? 0,
      },
    });
  }

  const ovByKey = new Map(
    overrides.map((o) => [`${o.dayKey}|${String(o.closerId)}`, o]),
  );

  // Corrections on days we measured nothing for still need a row.
  for (const [key, o] of ovByKey) {
    if (byKey.has(key)) continue;
    byKey.set(key, {
      dayKey: o.dayKey,
      closerId: String(o.closerId),
      capacityKnown: undefined,
      openMinutes: undefined,
      measured: emptyTotals(),
    });
  }

  return Array.from(byKey.entries()).map(([key, base]) => {
    const { totals, overridden } = applyOverride(base.measured, ovByKey.get(key));
    return {
      dayKey: base.dayKey,
      closerId: base.closerId,
      totals,
      overridden,
      capacityKnown: base.capacityKnown,
      openMinutes: base.openMinutes,
      measured: base.measured,
    };
  });
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

export interface CapacitySignal {
  /** Closer-days where we could read the rep's own calendar. */
  knownDays: number;
  /** Closer-days where we could not, so slots fell back to bookings. */
  unknownDays: number;
  /**
   * True when capacity is measured well enough to quote Booked% at all.
   * Below this bar the rate is suppressed rather than shown as a confident
   * number derived from capacity we had to assume.
   */
  reliable: boolean;
}

/**
 * How much of the period's capacity we actually observed.
 *
 * Slots are inferred from free time on a calendar, so a rep whose calendar we
 * can't read has slots equal to their bookings — which would render as a
 * flawless 100% Booked. Quoting that as a rate would be the board asserting
 * something it does not know.
 */
export function computeCapacitySignal(
  knownDays: number,
  unknownDays: number,
): CapacitySignal {
  const total = knownDays + unknownDays;
  return {
    knownDays,
    unknownDays,
    // Any material share of unmeasured days makes the denominator untrustworthy.
    reliable: total > 0 && knownDays / total >= 0.8,
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
  /**
   * Bookings we could not attribute to a rep. They still cost money, so they
   * belong in the denominator: the spend bought every booking, not only the
   * ones we could name an owner for.
   *
   * Omitting them inflated cost-per-booked on any team with shared calendars —
   * on one live team, 226 of 730 bookings were unattributed, making every
   * booking look 45% more expensive and every rep's ROAS correspondingly worse
   * than it really was.
   */
  bookedUnattributed = 0,
): Economics {
  const totalBooked = t.booked + Math.max(0, bookedUnattributed);
  return {
    adSpend: adSpendForPeriod,
    costPerBooked: totalBooked > 0 ? adSpendForPeriod / totalBooked : null,
    teamNet: t.cash - adSpendForPeriod - t.cash * (compPct / 100),
  };
}

/**
 * Return on ad spend for one rep: cash collected ÷ what the company spent on
 * the calls they actually took.
 *
 * Charged on calls TAKEN, not booked. Whether a lead shows up is the setter's
 * job, not the closer's — so billing a closer for no-shows measures someone
 * else's performance and reports it as theirs. This statistic answers "what
 * does this closer do with the conversations they get".
 *
 * The business-level question — is this rep's whole lead allocation
 * profitable, no-shows included — is answered by the Net column, which is
 * charged on bookings. The two are deliberately different lenses and the
 * board carries both.
 *
 * Null when there is no ad spend or no calls taken: a ratio against zero
 * investment is not a performance signal.
 */
export function repRoas(
  repCash: number,
  repTaken: number,
  costPerBooked: number | null,
): number | null {
  if (costPerBooked === null || costPerBooked <= 0 || repTaken <= 0) return null;
  const invested = costPerBooked * repTaken;
  return invested > 0 ? repCash / invested : null;
}

/**
 * Banding for ROAS. Below 1x the rep costs more in leads than they return —
 * that is the line the whole statistic exists to draw, so it is absolute
 * rather than relative to a target.
 */
export function roasBand(roas: number | null): "good" | "thin" | "losing" | "na" {
  if (roas === null) return "na";
  if (roas < 1) return "losing";
  if (roas < 2) return "thin";
  return "good";
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
  /** Ad spend attributed to this rep, and cash returned per dollar of it. */
  adCost: number | null;
  roas: number | null;
  overriddenFields: string[];
  /** Cash per week (5 buckets), for the row sparkline. */
  weekCash: number[];
  /** Whether this rep's own capacity was measurable — Booked% is suppressed
   *  per rep, so a focused view must honour that rep's signal, not the team's. */
  capacity: CapacitySignal;
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
