// ============================================================================
// One rule for "did a person answer the phone" — the Setters page's
// connect, the EOD's pick up, the confirmation setter's reached-by-call.
// Close records it as the call's disposition; providers that send no
// disposition (GoHighLevel) only tell us a duration, so any time on the
// line counts there. Length never matters: a three-second pick-up is a
// pick-up (Tyler, 2026-09-09).
// ============================================================================

export function dialAnswered(details: unknown): boolean {
  const d = details as { disposition?: unknown; callDurationSec?: unknown } | undefined;
  if (typeof d?.disposition === "string") return d.disposition.toLowerCase() === "answered";
  return typeof d?.callDurationSec === "number" && d.callDurationSec > 0;
}
