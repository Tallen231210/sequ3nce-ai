// ============================================================================
// The booking link a calendar event came through.
//
// Calendly (and the other booking tools these teams use) write two lines into
// the event description: "Event Name" and, on the next line, the name of the
// link — "Facebook", "Main Training", "Instagram (Lazar)". Nobody types it, so
// it is the one reliable statement of WHERE a booking came from. This is the
// single parser; four diagnostics used to carry their own copy of the regex.
// ============================================================================

const EVENT_NAME_RE = /Event Name\s*[\r\n]+\s*(.+)/;

/** "Facebook", "Instagram (Lazar)"… or null when there is no Event Name block. */
export function parseEventName(description: string | undefined | null): string | null {
  const m = EVENT_NAME_RE.exec(String(description ?? ""));
  if (!m) return null;
  const name = m[1].trim().slice(0, 70);
  return name.length > 0 ? name : null;
}

/**
 * The sync has stored `description` since 2026-03-03 (commit c3a4947). A row
 * last fetched before that cannot be told apart from a hand-created event —
 * both carry no Event Name — so "no Event Name" only means "hand-created"
 * when the row was fetched after this.
 */
export const DESCRIPTION_SYNC_SINCE_MS = Date.parse("2026-03-03T00:00:00Z");

/**
 * Case-insensitive substring match against a team's word list ("instagram",
 * "main training"). Blank and one-letter words are ignored so a typo in the
 * config can't match everything.
 */
export function eventNameMatches(
  eventName: string | null,
  patterns: readonly string[] | undefined,
): boolean {
  if (!eventName || !patterns) return false;
  const lower = eventName.toLowerCase();
  return patterns.some((p) => {
    const t = p.trim().toLowerCase();
    return t.length >= 2 && lower.includes(t);
  });
}

/** "Instagram (Lazar)" → "Lazar"; a plain "Instagram" → null. */
export function personFromEventName(eventName: string | null): string | null {
  const m = /\(([^()]{1,40})\)\s*$/.exec(eventName ?? "");
  const name = m?.[1].trim();
  return name && name.length > 0 ? name : null;
}
