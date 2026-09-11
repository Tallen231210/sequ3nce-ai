// ============================================================================
// The data-health week as a manager reads it: one row per thing that's
// missing, in plain words, with the count and the people who can fix it.
//
// Pure, and shared — the dashboard card and the Monday post render the same
// rows, so what's on screen and what lands in Slack can never disagree.
// ============================================================================

import type { DataHealth } from "../dataHealthCore";
import { humanDay } from "./dayLabel";
import { flagPlain, type CrossCheckFlag } from "./eodCrossCheck";

export interface MissingRow {
  key: string;
  /** What's missing, said the way a person would say it. */
  label: string;
  /** How much of it: "56", "3 setters", "4 days". */
  count: string;
  /** Who it sits with, or examples — one short line each. */
  detail: string[];
}

/** Just enough of the cross-check to name the days that don't match. */
export interface ChecksInput {
  byRoster: ReadonlyArray<{ name: string; days: ReadonlyArray<{ dayKey: string; flags: readonly CrossCheckFlag[] }> }>;
}

/**
 * "Joseph 15 · Karl 13 · Ryleigh 13" with the tail folded in. The prefix says
 * whose names these are — some rows list the closer whose calendar it is,
 * others the setter who worked the lead, and the count alone can't tell you.
 */
export function namedTop(rows: ReadonlyArray<{ name: string; count: number }>, prefix = "", max = 5): string[] {
  if (rows.length === 0) return [];
  const head = rows.slice(0, max).map((r) => `${r.name} ${r.count}`).join(" · ");
  const rest = rows.length - max;
  return [`${prefix}${rest > 0 ? `${head} · and ${rest} more` : head}`];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Days a setter filed whose numbers don't match Close or the calendar — a line each, at most a few. */
function eodMismatchRow(checks: ChecksInput | null | undefined): MissingRow | null {
  if (!checks) return null;
  const off = checks.byRoster
    .map((r) => ({ name: r.name, days: r.days.filter((d) => d.flags.length > 0) }))
    .filter((r) => r.days.length > 0);
  if (off.length === 0) return null;
  const detail: string[] = [];
  for (const r of off) {
    for (const d of r.days.slice(0, 2)) detail.push(`${r.name} ${humanDay(d.dayKey)}: ${d.flags.map(flagPlain).join("; ")}`);
    const rest = r.days.length - 2;
    if (rest > 0) detail.push(`${r.name}: ${rest} more ${rest === 1 ? "day doesn't" : "days don't"} match`);
  }
  return {
    key: "eod-mismatch",
    label: "End-of-day numbers that don't match Close",
    count: plural(off.length, "setter", "setters"),
    detail: detail.slice(0, 8),
  };
}

/**
 * Every drag on the score, in the words a manager would use. The order is
 * fixed rather than by size: the things a person can go and fix today come
 * first, and the paperwork checks last. Counts stay separate rather than
 * being summed — one booking can be short of two different things, and a
 * total would count it twice.
 */
export function missingRows(data: Pick<DataHealth, "drags">, checks?: ChecksInput | null): MissingRow[] {
  const d = data.drags;
  const rows: MissingRow[] = [];

  if (d.notRecolored.total > 0) {
    rows.push({
      key: "not-recolored",
      label: "Calls the closer never coloured after the call",
      count: String(d.notRecolored.total),
      detail: namedTop(d.notRecolored.byCloser, "Not coloured by "),
    });
  }
  if (d.untaggedSelfBooks.total > 0) {
    rows.push({
      key: "untagged-self-books",
      label: "Calls the lead booked themselves, with no initials on them",
      count: String(d.untaggedSelfBooks.total),
      detail: namedTop(d.untaggedSelfBooks.byCloser, "Taken by "),
    });
  }
  if (d.unlabeledTouched.total > 0) {
    rows.push({
      key: "unlabeled-touched",
      label: "Bookings with no setter named, though a setter worked the lead",
      count: String(d.unlabeledTouched.total),
      detail: namedTop(d.unlabeledTouched.bySetter, "Worked by "),
    });
  }
  if (d.missingInitials.total > 0) {
    rows.push({
      key: "missing-initials",
      label: "Sets counted from Close activity, with no initials written",
      count: String(d.missingInitials.total),
      detail: namedTop(d.missingInitials.bySetter, "Credited to "),
    });
  }
  if (d.handMadeUntagged > 0) {
    rows.push({
      key: "hand-made",
      label: "Calls typed onto the calendar with nothing to say who booked them",
      count: String(d.handMadeUntagged),
      detail: [],
    });
  }
  if (d.leadMissing > 0) {
    rows.push({
      key: "lead-missing",
      label: "Calls the lead booked themselves who aren't in Close at all",
      count: String(d.leadMissing),
      detail: [],
    });
  }
  const missedDays = d.eodMissed.filter((e) => e.days.length > 0);
  if (missedDays.length > 0) {
    rows.push({
      key: "eod-missing",
      label: "End-of-day forms not filed",
      count: plural(missedDays.reduce((n, e) => n + e.days.length, 0), "day", "days"),
      detail: missedDays.map((e) => `${e.name}: ${e.days.map(humanDay).join(", ")}`),
    });
  }
  const mismatch = eodMismatchRow(checks);
  if (mismatch) rows.push(mismatch);
  return rows;
}
