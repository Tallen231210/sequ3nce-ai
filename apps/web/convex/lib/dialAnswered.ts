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
