// ============================================================================
// Reading a whole time range without lying about it.
//
// I made the same mistake twice in one day, in two different files:
//
//   .withIndex("by_team_and_type_and_time", q => q.eq("teamId", id)).take(12000)
//
// That index is (teamId, eventType, occurredAt), so the rows come back ordered
// by TYPE first — the "first 12,000" are whatever type sorts earliest, not the
// events in the window. It reported a truncated range on teams holding a few
// thousand events, because it was reading twelve thousand of the wrong ones.
//
//   .withIndex("by_team_and_time", ...).take(4000)
//
// That one returns the OLDEST 4,000, so a booking type introduced recently was
// invisible. Gianni named a calendar we had never seen, and he was right.
//
// Both bugs look like working code and both produce a confident, wrong answer —
// the exact failure this rebuild exists to prevent. So this is the one way to
// read a range: page through it, newest first, and say plainly when a cap was
// hit rather than quietly returning a sample.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ScanResult<T> {
  rows: T[];
  /**
   * True when the cap was reached and rows were left unread. Callers are
   * expected to surface this — a partial answer presented as a complete one is
   * how a location spent weeks believing 1,083 of its leads had never been
   * contacted.
   */
  truncated: boolean;
  pages: number;
}

/**
 * Page backwards through a time-ordered range.
 *
 * `newestFirst` matters: when a cap IS hit, the rows you keep are the recent
 * ones, which is almost always what a dashboard wants. Silently keeping the
 * oldest is how a new booking type, a new setter, or this week's activity
 * disappears.
 *
 * @param build   given an exclusive upper bound, return the query for that page
 * @param timeOf  read the ordering timestamp off a row
 */
export async function scanRangeDesc<T>(
  build: (before: number) => any,
  timeOf: (row: T) => number,
  opts: { rangeEnd: number; pageSize?: number; maxRows?: number },
): Promise<ScanResult<T>> {
  const pageSize = opts.pageSize ?? 1000;
  const maxRows = opts.maxRows ?? 20_000;

  const rows: T[] = [];
  let cursor = opts.rangeEnd;
  let pages = 0;

  while (rows.length < maxRows) {
    const page: T[] = await build(cursor).order("desc").take(pageSize);
    pages += 1;
    if (page.length === 0) break;
    rows.push(...page);

    const last = timeOf(page[page.length - 1]);
    // Guard against a stuck cursor when many rows share a timestamp: without
    // this, an unchanged bound re-reads the same page forever.
    if (last >= cursor) break;
    cursor = last;

    if (page.length < pageSize) break;
  }

  return {
    rows: rows.slice(0, maxRows),
    truncated: rows.length >= maxRows,
    pages,
  };
}
