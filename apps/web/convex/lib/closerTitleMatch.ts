// ============================================================================
// Which closer does a booking title name?
//
// Exists because shared calendars make schedule-time ownership a guess, and
// since bots started wearing the closer's name, a wrong guess is no longer a
// private bookkeeping detail — it's "Nick's Sequ3nce.ai Bot" joining Gianni's
// call in front of a prospect. Booking links put the closer's name in the
// title ("Heather Doherty and Nick h"), which is the one schedule-time signal
// that actually says who the call belongs to.
//
// Deliberately strict: a name is only a match as a whole word, first names
// shorter than 3 characters are ignored (too easy to hit inside other words),
// and any ambiguity — two closers matching, or two closers sharing the
// matched first name — returns null. A null caller falls back to the neutral
// bot name; a wrong personalisation has no fallback once a prospect saw it.
// ============================================================================

export interface TitleRosterCloser {
  closerId: string;
  name: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWord(haystack: string, word: string): boolean {
  if (word.length < 3) return false;
  return new RegExp(`(?:^|[^\\p{L}])${escapeRegex(word)}(?:[^\\p{L}]|$)`, "iu").test(
    haystack,
  );
}

export function matchCloserInTitle(
  title: string | undefined | null,
  roster: TitleRosterCloser[],
): TitleRosterCloser | null {
  if (!title) return null;

  // Full name first — the strongest signal, and immune to shared first names.
  const fullMatches = roster.filter(
    (c) => c.name.trim().length >= 5 && wholeWord(title, c.name.trim()),
  );
  if (fullMatches.length === 1) return fullMatches[0];
  if (fullMatches.length > 1) return null;

  // First name, only when it identifies exactly one person on the roster.
  const byFirst = roster
    .map((c) => ({ c, first: c.name.trim().split(/\s+/)[0] ?? "" }))
    .filter(({ first }) => first.length >= 3 && wholeWord(title, first));
  if (byFirst.length !== 1) return null;
  const winner = byFirst[0];
  const sharedFirst = roster.filter(
    (c) =>
      (c.name.trim().split(/\s+/)[0] ?? "").toLowerCase() ===
      winner.first.toLowerCase(),
  );
  return sharedFirst.length === 1 ? winner.c : null;
}
