// ============================================================================
// When does this setter actually work?
//
// The old answer was one window for everyone: 9–17, Mon–Fri, in the team's
// timezone. E2 has setters in England and others on evening shifts, and the
// working-hours clock only accrues INSIDE the window — so a setter working
// entirely outside it scored zero elapsed time, which reads as an instant
// callback. The two busiest setters looked like the fastest on the team.
//
// So we infer the window from their own calls instead. Two things make that
// work without anyone recording a timezone:
//
//   1. The window is expressed in the TEAM's timezone and may WRAP past
//      midnight. A London setter simply reads as ~3:00–11:00 Eastern.
//   2. It is re-derived nightly, so it follows a move or a shift change on
//      its own rather than going stale in a settings page.
//
// Pure. Benched in settersPageBench.ts.
// ============================================================================

export interface Window {
  /** 0 = Sunday, matching JS getDay(). */
  days: number[];
  /** Team-local hour the day starts. May be greater than endHour: the window wraps midnight. */
  startHour: number;
  /** Exclusive. */
  endHour: number;
}

export interface DerivedWindow extends Window {
  dials: number;
  activeDays: number;
}

/** Below either bar we don't claim to know someone's hours. */
export const MIN_DIALS = 50;
export const MIN_ACTIVE_DAYS = 5;
/** The share of a person's calls the window must cover; the tails are noise. */
export const COVERAGE = 0.9;

/** Does this hour fall inside the window? Handles a window that wraps midnight. */
export function hourInWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return true; // a full 24h window
  return startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
}

/**
 * The tightest run of hours covering `COVERAGE` of the calls, allowed to wrap
 * midnight. Tried at every start hour rather than taking percentiles, because
 * percentiles of a wrapping distribution are meaningless: a setter working
 * 22:00–06:00 has a "median hour" of noon.
 */
function tightestSpan(byHour: number[], total: number): { startHour: number; endHour: number } {
  const need = Math.ceil(total * COVERAGE);
  let best = { startHour: 0, endHour: 24, width: 25 };
  for (let start = 0; start < 24; start++) {
    let covered = 0;
    for (let width = 1; width <= 24; width++) {
      covered += byHour[(start + width - 1) % 24];
      if (covered >= need) {
        if (width < best.width) best = { startHour: start, endHour: (start + width) % 24, width };
        break;
      }
    }
  }
  return { startHour: best.startHour, endHour: best.endHour };
}

/**
 * Work out someone's window from the team-local (weekday, hour) of each call
 * they made. Returns null when there isn't enough to go on — the caller then
 * falls back to the team's hours and says so, rather than inventing a shift
 * from a handful of calls.
 */
export function deriveWindow(calls: ReadonlyArray<{ day: number; hour: number }>): DerivedWindow | null {
  if (calls.length < MIN_DIALS) return null;
  const byHour = new Array(24).fill(0) as number[];
  const byDay = new Array(7).fill(0) as number[];
  for (const c of calls) {
    if (c.hour < 0 || c.hour > 23 || c.day < 0 || c.day > 6) continue;
    byHour[c.hour] += 1;
    byDay[c.day] += 1;
  }
  const total = byHour.reduce((a, b) => a + b, 0);
  if (total < MIN_DIALS) return null;

  // A day counts as worked when it carries a real share of the week, not one
  // stray Sunday call. A seven-day worker keeps all seven.
  const busiest = Math.max(...byDay);
  const days = byDay.map((n, i) => ({ n, i })).filter((d) => d.n >= Math.max(1, busiest * 0.15)).map((d) => d.i);
  if (days.length < MIN_ACTIVE_DAYS && days.length < 7) {
    // Few days can still be a real shift (a 3-day week), but with this little
    // signal we would rather defer than assert.
    if (days.length < 3) return null;
  }
  const { startHour, endHour } = tightestSpan(byHour, total);
  return { days, startHour, endHour, dials: total, activeDays: days.length };
}

/** "8:00–18:00, 6 days a week" — how the card says which window it used. */
export function describeWindow(w: Window): string {
  const wraps = w.startHour > w.endHour;
  return `${w.startHour}:00–${w.endHour}:00${wraps ? " (overnight)" : ""}, ${w.days.length} ${w.days.length === 1 ? "day" : "days"} a week`;
}
