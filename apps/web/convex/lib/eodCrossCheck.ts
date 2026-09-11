// ============================================================================
// The one rule for "does a setter's EOD agree with what Close and the
// calendar measured for the same day". Pure: no Convex imports, so the
// dashboard renders the same verdict the posts carry.
//
// A flag is never a bare warning — it carries both numbers and the gap, so
// the reader sees "dials: filed 89 · Close 100 (−11%)" and can judge for
// themselves. Mark-only: nothing here blocks a filing.
//
// Tolerances are a share of the MEASURED number (Close's / the calendar's),
// with a floor of `minGap` so tiny days aren't flagged over one call:
//   allowed gap = max(minGap, measured × pct / 100)
// Calendar counts (sets, calls on the calendar, shown) are exact things we
// can list, so they get a fixed allowance of one — a booking made at
// midnight lands on a different day for the two of us.
// ============================================================================

export interface CrossCheckTolerances {
  /** Dials filed vs dials in Close. */
  dialsPct: number;
  /** Pick-ups filed vs connects in Close (answered calls over the team's threshold). */
  pickUpsPct: number;
  /** The confirmation setter's self-books / contacted / reached vs the calendar and Close. */
  confirmationPct: number;
  /** Smallest gap ever flagged on a percentage field — protects small days. */
  minGap: number;
}

export const DEFAULT_TOLERANCES: CrossCheckTolerances = { dialsPct: 10, pickUpsPct: 25, confirmationPct: 15, minGap: 2 };

/** The allowance for calendar counts, both directions. */
export const CALENDAR_GAP = 1;

export const TOLERANCE_LIMITS = { pctMin: 0, pctMax: 100, minGapMin: 0, minGapMax: 20 } as const;

export function tolerancesFor(partial?: Partial<CrossCheckTolerances> | null): CrossCheckTolerances {
  const pick = (v: number | undefined, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    dialsPct: pick(partial?.dialsPct, DEFAULT_TOLERANCES.dialsPct, TOLERANCE_LIMITS.pctMin, TOLERANCE_LIMITS.pctMax),
    pickUpsPct: pick(partial?.pickUpsPct, DEFAULT_TOLERANCES.pickUpsPct, TOLERANCE_LIMITS.pctMin, TOLERANCE_LIMITS.pctMax),
    confirmationPct: pick(partial?.confirmationPct, DEFAULT_TOLERANCES.confirmationPct, TOLERANCE_LIMITS.pctMin, TOLERANCE_LIMITS.pctMax),
    minGap: pick(partial?.minGap, DEFAULT_TOLERANCES.minGap, TOLERANCE_LIMITS.minGapMin, TOLERANCE_LIMITS.minGapMax),
  };
}

/** What the setter typed. Blank (undefined/null) means "not reporting" and is never checked. */
export interface FiledDay {
  dials?: number | null;
  pickUps?: number | null;
  sets?: number | null;
  callsOnCalendar?: number | null;
  callsShown?: number | null;
  newSelfBooked?: number | null;
  contacted?: number | null;
  reached?: number | null;
  confirmedOnCalendar?: number | null;
  confirmedShowed?: number | null;
}

/** What Close and the calendar say. Null = not measurable (no Close user linked, or not that role). */
export interface MeasuredDay {
  dials: number | null;
  pickUps: number | null;
  sets: number | null;
  callsOnCalendar: number | null;
  callsShown: number | null;
  /** Credited calls that day with no show verdict yet — a filed "shown" may hide in here. */
  callsUnknown: number | null;
  newSelfBooked: number | null;
  contacted: number | null;
  reached: number | null;
  confirmedOnCalendar: number | null;
  confirmedShowed: number | null;
  confirmedUnknown: number | null;
}

export type CheckField = keyof FiledDay;
export type CheckSource = "Close" | "calendar";

export interface CrossCheckFlag {
  field: CheckField;
  label: string;
  source: CheckSource;
  filed: number;
  measured: number;
  /** filed − measured. */
  gap: number;
  /** gap as a share of measured; null when measured is 0. */
  gapPct: number | null;
}

export const FIELD_LABELS: Record<CheckField, string> = {
  dials: "dials",
  pickUps: "pick-ups",
  sets: "sets",
  callsOnCalendar: "calls on calendar",
  callsShown: "calls shown",
  newSelfBooked: "new self-books",
  contacted: "contacted",
  reached: "reached",
  confirmedOnCalendar: "confirmed on calendar",
  confirmedShowed: "confirmed showed",
};

const SOURCE_OF: Record<CheckField, CheckSource> = {
  dials: "Close",
  pickUps: "Close",
  sets: "calendar",
  callsOnCalendar: "calendar",
  callsShown: "calendar",
  newSelfBooked: "calendar",
  contacted: "Close",
  reached: "Close",
  confirmedOnCalendar: "calendar",
  confirmedShowed: "calendar",
};

const known = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

function flag(field: CheckField, filed: number, measured: number): CrossCheckFlag {
  const gap = filed - measured;
  return {
    field,
    label: FIELD_LABELS[field],
    source: SOURCE_OF[field],
    filed,
    measured,
    gap,
    gapPct: measured > 0 ? Math.round((gap / measured) * 100) : null,
  };
}

/** Outside the allowance either way: max(minGap, measured × pct / 100). */
function offByPct(filed: number, measured: number, pct: number, minGap: number): boolean {
  const allowed = Math.max(minGap, (measured * pct) / 100);
  return Math.abs(filed - measured) > allowed;
}

/**
 * A "shown" count is checked against what could possibly have shown:
 * filed above verified shows + still-unknown calls claims shows we can't
 * find; filed below the verified shows denies ones a closer logged.
 */
function offOnShown(filed: number, shown: number, unknown: number): boolean {
  return filed > shown + unknown + CALENDAR_GAP || filed < shown - CALENDAR_GAP;
}

export function crossCheckDay(filed: FiledDay, measured: MeasuredDay, tol: CrossCheckTolerances = DEFAULT_TOLERANCES): CrossCheckFlag[] {
  const out: CrossCheckFlag[] = [];
  const pctField = (field: "dials" | "pickUps" | "newSelfBooked" | "contacted" | "reached", pct: number) => {
    const f = filed[field];
    const m = measured[field];
    if (known(f) && known(m) && offByPct(f, m, pct, tol.minGap)) out.push(flag(field, f, m));
  };
  pctField("dials", tol.dialsPct);
  pctField("pickUps", tol.pickUpsPct);
  // Sets: only a claim above what the calendar credits is a flag — fewer
  // than credited usually means they forgot one, and the credit stands.
  if (known(filed.sets) && known(measured.sets) && filed.sets - measured.sets > CALENDAR_GAP) out.push(flag("sets", filed.sets, measured.sets));
  if (known(filed.callsOnCalendar) && known(measured.callsOnCalendar) && Math.abs(filed.callsOnCalendar - measured.callsOnCalendar) > CALENDAR_GAP) {
    out.push(flag("callsOnCalendar", filed.callsOnCalendar, measured.callsOnCalendar));
  }
  if (known(filed.callsShown) && known(measured.callsShown) && offOnShown(filed.callsShown, measured.callsShown, measured.callsUnknown ?? 0)) {
    out.push(flag("callsShown", filed.callsShown, measured.callsShown));
  }
  pctField("newSelfBooked", tol.confirmationPct);
  pctField("contacted", tol.confirmationPct);
  pctField("reached", tol.confirmationPct);
  if (known(filed.confirmedOnCalendar) && known(measured.confirmedOnCalendar) && Math.abs(filed.confirmedOnCalendar - measured.confirmedOnCalendar) > CALENDAR_GAP) {
    out.push(flag("confirmedOnCalendar", filed.confirmedOnCalendar, measured.confirmedOnCalendar));
  }
  if (known(filed.confirmedShowed) && known(measured.confirmedShowed) && offOnShown(filed.confirmedShowed, measured.confirmedShowed, measured.confirmedUnknown ?? 0)) {
    out.push(flag("confirmedShowed", filed.confirmedShowed, measured.confirmedShowed));
  }
  return out;
}

/** "dials: filed 89 · Close 100 (−11%)" — the numbers, always, never a bare flag. */
export function flagText(f: CrossCheckFlag): string {
  const sign = f.gap > 0 ? "+" : "−";
  const gap = f.gapPct === null ? `${sign}${Math.abs(f.gap)}` : `${sign}${Math.abs(f.gapPct)}%`;
  return `${f.label}: filed ${f.filed} · ${f.source} ${f.measured} (${gap})`;
}

/** The short form for a badge: "filed 89 · Close 100". */
export function flagPair(f: CrossCheckFlag): string {
  return `filed ${f.filed} · ${f.source} ${f.measured}`;
}

/**
 * The same facts as a sentence a manager can read without a key:
 * "said 32 pick-ups, Close saw 7". The dashboard and the posts use this;
 * flagText keeps the percentage for anyone who wants the magnitude.
 */
const PLAIN_FIELD_LABELS: Record<CheckField, string> = {
  dials: "dials",
  pickUps: "pick-ups",
  sets: "sets",
  callsOnCalendar: "calls on the calendar",
  callsShown: "calls shown",
  newSelfBooked: "new self-books",
  contacted: "people contacted",
  reached: "people reached",
  confirmedOnCalendar: "confirmed calls on the calendar",
  confirmedShowed: "confirmed calls shown",
};

export function flagPlain(f: CrossCheckFlag): string {
  return `said ${f.filed} ${PLAIN_FIELD_LABELS[f.field]}, ${f.source === "Close" ? "Close" : "the calendar"} saw ${f.measured}`;
}
