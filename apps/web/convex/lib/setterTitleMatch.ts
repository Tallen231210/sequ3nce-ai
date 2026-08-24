// ============================================================================
// "Which setter set this call?" — read off the meeting title.
//
// E2's convention (started by Zion, 2026-08): the setter's initials go in
// parentheses at the FRONT of the meeting title — "(e) Tim and Karl",
// "(Mo)Paul X Karl", "(IY) Ai Implementation Consult".
//
// Matching deliberately OVERSHOOTS (Tyler's call): a call shown to the wrong
// setter costs one "not my call" tap; a call hidden from the right setter is
// unrecoverable. So "(E)" matches Erten AND Ethan, and a token that prefixes
// nobody falls back to first-letter matching ("(IY)" → Israel).
// ============================================================================

/** Leading parenthesized 1–3 letter token, case-insensitive, spaces
 *  tolerated inside the parens. Not-at-start (e.g. "Canceled: (e) X") is
 *  deliberately null — a moved prefix means the convention wasn't used. */
export function extractSetterToken(title: string | undefined | null): string | null {
  const m = /^\s*\(\s*([A-Za-z]{1,3})\s*\)/.exec(title ?? "");
  return m ? m[1].toLowerCase() : null;
}

/** Strip the token for display — setters shouldn't read their own initials
 *  back at themselves on every row. */
export function stripSetterToken(title: string): string {
  return title.replace(/^\s*\(\s*[A-Za-z]{1,3}\s*\)\s*/, "").trim() || title.trim();
}

export interface RosterName {
  rosterId: string;
  firstName: string;
}

/** rosterIds the token matches. Primary: token prefixes a first name.
 *  Fallback (overshoot): first letter matches. Empty when nothing does. */
export function matchToken(token: string, roster: RosterName[]): string[] {
  const t = token.toLowerCase();
  if (!t) return [];
  const prefix = roster.filter((r) => r.firstName.toLowerCase().startsWith(t));
  if (prefix.length > 0) return prefix.map((r) => r.rosterId);
  return roster
    .filter((r) => r.firstName.toLowerCase().startsWith(t[0]))
    .map((r) => r.rosterId);
}

/** First word of a roster name — "Ethan R" matches on "Ethan". */
export function firstNameOf(name: string): string {
  return (name.trim().split(/\s+/)[0] ?? "").trim();
}
