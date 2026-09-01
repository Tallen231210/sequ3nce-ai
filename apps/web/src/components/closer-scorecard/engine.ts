// The Closer Scorecard ledger engine, ported line-for-line from the agreed
// reference (docs/superpowers/specs/2026-08-25-closer-scorecard-reference.html).
// Pure functions over plain rows — no React, no Convex — so the maths can be
// benched from the CLI (engine.bench.mjs) against the reference's own SEED.
//
// Cascade semantics (same discipline as the setter engine at
// ../scorecard/engine.ts): editing a stage holds the row's CURRENT
// stage-to-stage rates and recomputes everything downstream. Upstream never
// moves. All five funnel fields cascade; the follow-up and tier-pitch counts
// (fub/fus/p1/p2/p3) ride along untouched — they are observations, not funnel
// stages.
//
// NOT the same thing as convex/closerScorecardData.ts (the daily Slack post)
// — that file's CloserScorecardRow is unrelated; ours is CloserLedgerRow.

export const FIELDS = ["booked", "live", "closes", "gross", "collected"] as const;
export type CascadeField = (typeof FIELDS)[number];

export interface CloserLedgerRow {
  closerId: string;
  name: string;
  booked: number;
  live: number;
  closes: number;
  gross: number;
  collected: number;
  fub: number;
  fus: number;
  p1: number;
  p2: number;
  p3: number;
}

export interface CloserRollup {
  booked: number; live: number; closes: number; gross: number; collected: number;
  fub: number; fus: number; p1: number; p2: number; p3: number;
  show: number | null;      // live ÷ booked
  lc: number | null;        // closes ÷ live
  bc: number | null;        // closes ÷ booked — the KPI
  aov: number | null;       // gross ÷ closes
  coll: number | null;      // collected ÷ gross
  cdpbc: number | null;     // collected ÷ booked — the keystone
  gdpbc: number | null;     // gross ÷ booked
  roas: number | null;      // cdpbc ÷ cost per booked call
  fushow: number | null;    // fus ÷ fub
}

export function pct(n: number, d: number): number | null {
  return d > 0 ? (n / d) * 100 : null;
}
export function rat(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

/** The 4 stage→stage rates of one row, in FIELDS order. */
export function ratesOf(r: CloserLedgerRow): number[] {
  const o: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = Number(r[FIELDS[i]]) || 0;
    const b = Number(r[FIELDS[i + 1]]) || 0;
    o[i] = a > 0 ? b / a : 0;
  }
  return o;
}

/** Set stage `idx` to `val` and recompute downstream with the held rates. */
export function cascadeWith(
  r: CloserLedgerRow,
  idx: number,
  rates: number[],
  val: number,
): CloserLedgerRow {
  const o = { ...r };
  o[FIELDS[idx]] = Math.max(0, Math.round(val));
  for (let i = idx; i < 4; i++) {
    o[FIELDS[i + 1]] = Math.round((Number(o[FIELDS[i]]) || 0) * rates[i]);
  }
  return o;
}

/** Largest-remainder pro-rata split of a new team total across rows. */
export function distribute(
  rs: CloserLedgerRow[],
  field: CascadeField,
  newTotal: number,
): CloserLedgerRow[] {
  const n = rs.length;
  if (!n) return rs;
  const t = Math.max(0, Math.round(newTotal));
  const cur = rs.reduce((a, r) => a + (Number(r[field]) || 0), 0);
  const raw =
    cur > 0 ? rs.map((r) => ((Number(r[field]) || 0) * t) / cur) : rs.map(() => t / n);
  const out = raw.map((x) => Math.floor(x));
  let rem = t - out.reduce((a, b) => a + b, 0);
  const ord = raw
    .map((x, i) => ({ i, f: x - Math.floor(x) }))
    .sort((a, b) => b.f - a.f);
  let k = 0;
  while (rem > 0) {
    out[ord[k % n].i] += 1;
    rem -= 1;
    k += 1;
  }
  return rs.map((r, i) => ({ ...r, [field]: out[i] }));
}

/** Team-level edit of stage `idx`: rates captured BEFORE the change. */
export function teamSetCount(
  rs: CloserLedgerRow[],
  idx: number,
  newTotal: number,
): CloserLedgerRow[] {
  const rates = rs.map(ratesOf);
  return distribute(rs, FIELDS[idx], newTotal).map((r, i) =>
    cascadeWith(r, idx, rates[i], r[FIELDS[idx]]),
  );
}

/** Sums + every derived column. `cpc` is the team's cost per booked call. */
export function roll(rs: CloserLedgerRow[], cpc: number | null): CloserRollup {
  const t = rs.reduce(
    (a, r) => ({
      booked: a.booked + (Number(r.booked) || 0),
      live: a.live + (Number(r.live) || 0),
      closes: a.closes + (Number(r.closes) || 0),
      gross: a.gross + (Number(r.gross) || 0),
      collected: a.collected + (Number(r.collected) || 0),
      fub: a.fub + (Number(r.fub) || 0),
      fus: a.fus + (Number(r.fus) || 0),
      p1: a.p1 + (Number(r.p1) || 0),
      p2: a.p2 + (Number(r.p2) || 0),
      p3: a.p3 + (Number(r.p3) || 0),
    }),
    { booked: 0, live: 0, closes: 0, gross: 0, collected: 0, fub: 0, fus: 0, p1: 0, p2: 0, p3: 0 },
  );
  return {
    ...t,
    show: pct(t.live, t.booked),
    lc: pct(t.closes, t.live),
    bc: pct(t.closes, t.booked),
    aov: rat(t.gross, t.closes),
    coll: pct(t.collected, t.gross),
    cdpbc: rat(t.collected, t.booked),
    gdpbc: rat(t.gross, t.booked),
    roas: cpc !== null && cpc > 0 ? rat(t.collected, t.booked * cpc) : null,
    fushow: pct(t.fus, t.fub),
  };
}

export interface WhatIfOption {
  key: "show" | "lc" | "aov" | "coll";
  label: string;
  current: number | null;
  teamBest: number;
  value: number;   // collected at the team best on this one factor
  gain: number;    // value − base
  note: string;
}

export interface WhatIfResult {
  closerId: string;
  base: number;                  // modelled collected at own rates
  options: WhatIfOption[];
  pick: WhatIfOption | null;     // largest gain > 0.5, else null (control group)
}

/** Which single lever is worth the most for each closer, vs team bests. */
export function whatIf(rs: CloserLedgerRow[]): WhatIfResult[] {
  const ms = rs.map((r) => roll([r], null));
  const best = { show: 0, lc: 0, aov: 0, coll: 0 };
  for (const m of ms) {
    if (m.show !== null && m.show > best.show) best.show = m.show;
    if (m.lc !== null && m.lc > best.lc) best.lc = m.lc;
    if (m.aov !== null && m.aov > best.aov) best.aov = m.aov;
    if (m.coll !== null && m.coll > best.coll) best.coll = m.coll;
  }
  return rs.map((r, i) => {
    const m = ms[i];
    const s = (m.show || 0) / 100;
    const l = (m.lc || 0) / 100;
    const a = m.aov || 0;
    const c = (m.coll || 0) / 100;
    const base = m.booked * s * l * a * c;
    const options: WhatIfOption[] = [
      { key: "show", label: "Show rate", current: m.show, teamBest: best.show,
        value: m.booked * (best.show / 100) * l * a * c, gain: 0,
        note: "confirmation motion / setter handoff" },
      { key: "lc", label: "Live close rate", current: m.lc, teamBest: best.lc,
        value: m.booked * s * (best.lc / 100) * a * c, gain: 0,
        note: "discovery depth, not closing mechanics" },
      { key: "aov", label: "AOV", current: m.aov, teamBest: best.aov,
        value: m.booked * s * l * best.aov * c, gain: 0,
        note: "tier positioning / downselling" },
      { key: "coll", label: "Collection rate", current: m.coll, teamBest: best.coll,
        value: m.booked * s * l * a * (best.coll / 100), gain: 0,
        note: "payment plans and PIF motion" },
    ];
    let pick: WhatIfOption | null = null;
    for (const o of options) {
      o.gain = o.value - base;
      if (o.gain > 0.5 && (!pick || o.gain > pick.gain)) pick = o;
    }
    return { closerId: r.closerId, base, options, pick };
  });
}

/** Performance delta $: what closing the CDPBC gap was worth this period. */
export function deltaDollars(
  target: number | null,
  m: { cdpbc: number | null; booked: number },
): number | null {
  // No booked calls means no CDPBC means no gap to state — coercing null to
  // 0 here rendered a zero-data closer as a green "at target".
  if (target === null || m.cdpbc === null) return null;
  return (target - m.cdpbc) * m.booked;
}

/** Tier-pitch stats for one row against the configured prices. */
export function tierStats(
  r: CloserLedgerRow,
  prices: number[],
): { pitched: number; avgTier: number | null; downsellGap: number | null } {
  const counts = [r.p1 || 0, r.p2 || 0, r.p3 || 0].slice(0, prices.length);
  const pitched = counts.reduce((a, b) => a + b, 0);
  const avgTier =
    pitched > 0
      ? counts.reduce((a, c, i) => a + c * (prices[i] || 0), 0) / pitched
      : null;
  const aov = rat(r.gross, r.closes);
  const downsellGap = aov !== null && avgTier !== null ? aov - avgTier : null;
  return { pitched, avgTier, downsellGap };
}

/* ---- formatters, identical conventions to the setter engine ---- */
export function fp(v: number | null): string {
  return v === null || !isFinite(v) ? "—" : v.toFixed(1) + "%";
}
export function fx(v: number | null): string {
  return v === null || !isFinite(v) ? "—" : v.toFixed(1) + "x";
}
export function fn(v: number | null): string {
  return v === null || !isFinite(v) ? "—" : Math.round(v).toLocaleString();
}
export function money(v: number | null): string {
  return v === null || !isFinite(v) ? "—" : "$" + Math.round(v).toLocaleString();
}
