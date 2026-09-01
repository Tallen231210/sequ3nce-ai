// ============================================================================
// The scorecard's math, ported verbatim from Zion's HTML
// (docs/superpowers/specs/2026-08-23-setter-scorecard-reference.html).
//
// The contract, in the reference file's own words: "Change any number and
// everything downstream of it recalculates at the current conversion rates…
// Nothing upstream ever moves — the rate directly above whatever you edited
// absorbs the change."
//
// One extension the HTML lacks: `closed`, for Zion's set→close rate. Closes
// are REPORTED, not derived — they sit outside the cascade. Editing closed
// changes closed and nothing else.
//
// Pure functions, no React — the bench script exercises this file directly.
// ============================================================================

export const FIELDS = ["dials", "connects", "sets", "booked", "showed"] as const;
export type CascadeField = (typeof FIELDS)[number];

export interface LedgerRow {
  rosterId: string;
  name: string;
  pod: string | null;
  dials: number;
  connects: number;
  sets: number;
  booked: number;
  showed: number;
  closed: number;
  /** Self-reported cash collected from this setter's deals (outcome field,
   *  outside the cascade like `closed`). Optional so pre-existing locked
   *  baselines without it keep parsing. */
  cash?: number;
}

export interface Rollup {
  dials: number;
  connects: number;
  sets: number;
  booked: number;
  showed: number;
  closed: number;
  cash: number;
  /** Cash per set — the money a setter's pipeline produced per appointment set. */
  cps: number | null;
  pickup: number | null;
  c2s: number | null;
  dps: number | null;
  show: number | null;
  dpsh: number | null;
  setToClose: number | null;
}

export function pct(n: number, d: number): number | null {
  return d > 0 ? (n / d) * 100 : null;
}
export function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

/** The four stage→stage conversion rates of a row, in FIELDS order. */
export function ratesOf(r: LedgerRow): number[] {
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = +r[FIELDS[i]] || 0;
    const b = +r[FIELDS[i + 1]] || 0;
    out[i] = a > 0 ? b / a : 0;
  }
  return out;
}

/** Set FIELDS[idx] to val and recalculate everything downstream at `rates`.
 *  Upstream never moves. `closed` is untouched — it isn't in the cascade. */
export function cascadeWith(
  r: LedgerRow,
  idx: number,
  rates: number[],
  val: number,
): LedgerRow {
  const o = { ...r };
  o[FIELDS[idx]] = Math.max(0, Math.round(val));
  for (let i = idx; i < 4; i++) {
    o[FIELDS[i + 1]] = Math.round((+o[FIELDS[i]] || 0) * rates[i]);
  }
  return o;
}

/** Largest-remainder distribution of a team total across rows, pro-rata to
 *  their current share (equal when the current total is zero). */
export function distribute(
  rows: LedgerRow[],
  field: CascadeField,
  newTotal: number,
): LedgerRow[] {
  const n = rows.length;
  if (!n) return rows;
  const target = Math.max(0, Math.round(newTotal));
  const cur = rows.reduce((a, r) => a + (+r[field] || 0), 0);
  const raw =
    cur > 0
      ? rows.map((r) => ((+r[field] || 0) * target) / cur)
      : rows.map(() => target / n);
  const out = raw.map((x) => Math.floor(x));
  let rem = target - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (rem > 0) {
    out[order[k % n].i] += 1;
    rem -= 1;
    k += 1;
  }
  return rows.map((r, i) => ({ ...r, [field]: out[i] }));
}

/** Team-level edit: distribute the new total, then cascade each row from
 *  that stage down at its OWN rates (captured before the change). */
export function teamSetCount(
  rows: LedgerRow[],
  idx: number,
  newTotal: number,
): LedgerRow[] {
  const rates = rows.map(ratesOf);
  return distribute(rows, FIELDS[idx], newTotal).map((r, i) =>
    cascadeWith(r, idx, rates[i], r[FIELDS[idx]]),
  );
}

export function rollup(rows: LedgerRow[]): Rollup {
  const t = rows.reduce(
    (a, r) => ({
      dials: a.dials + (+r.dials || 0),
      connects: a.connects + (+r.connects || 0),
      sets: a.sets + (+r.sets || 0),
      booked: a.booked + (+r.booked || 0),
      showed: a.showed + (+r.showed || 0),
      closed: a.closed + (+r.closed || 0),
      cash: a.cash + (+(r.cash ?? 0) || 0),
    }),
    { dials: 0, connects: 0, sets: 0, booked: 0, showed: 0, closed: 0, cash: 0 },
  );
  return {
    ...t,
    cps: ratio(t.cash, t.sets),
    pickup: pct(t.connects, t.dials),
    c2s: pct(t.sets, t.connects),
    dps: ratio(t.dials, t.sets),
    show: pct(t.showed, t.booked),
    dpsh: ratio(t.dials, t.showed),
    setToClose: pct(t.closed, t.sets),
  };
}

/** Formatters, shared so every mount prints rates identically. */
export function fp(v: number | null): string {
  return v === null || !isFinite(v) ? "—" : v.toFixed(1) + "%";
}
export function fr(v: number | null): string {
  return v === null || !isFinite(v) ? "—" : Math.round(v).toLocaleString();
}
export function fn(v: number): string {
  return (v || 0).toLocaleString();
}
export function money(v: number | null): string {
  if (v === null || !isFinite(v)) return "\u2014";
  return "$" + Math.round(v).toLocaleString();
}
