// ============================================================================
// One rule for a connect — a dial where someone was on the line long enough
// to count. Close's "answered" disposition fires on 87% of a setter's dials,
// three-second ones included (voicemail, a hang-up), so it can't mean "a
// person answered" on its own; it only rules OUT no-answers. The team's
// connect threshold (seconds) is the lever, and the setters' filed pick ups
// are the thing to tune it against.
// ============================================================================

export const DEFAULT_CONNECT_SEC = 60;

export function dialConnected(details: unknown, minSec: number): boolean {
  const d = details as { disposition?: unknown; callDurationSec?: unknown } | undefined;
  if (typeof d?.disposition === "string" && d.disposition.toLowerCase() !== "answered") return false;
  return typeof d?.callDurationSec === "number" && d.callDurationSec >= minSec;
}

/**
 * How long someone was on the line, or null when Close says nobody was
 * (an explicit non-"answered" disposition). An answered dial with no
 * duration counts as 0 s — it happened, we just can't time it.
 */
export function answeredDurationSec(details: unknown): number | null {
  const d = details as { disposition?: unknown; callDurationSec?: unknown } | undefined;
  if (typeof d?.disposition === "string" && d.disposition.toLowerCase() !== "answered") return null;
  return typeof d?.callDurationSec === "number" ? d.callDurationSec : 0;
}

/** The call-length ladder shown beside filed pick-ups, so a manager can see what each threshold would count. */
export const PICKUP_LADDER_SEC = [30, 45, 60, 90];

/** The ladder with the team's own threshold in it, sorted, no duplicates. */
export function ladderFor(connectSec: number): number[] {
  return Array.from(new Set([...PICKUP_LADDER_SEC, connectSec])).sort((a, b) => a - b);
}
