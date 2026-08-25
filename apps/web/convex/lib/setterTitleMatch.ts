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
  /** Last word of the roster name; "" when the name is a single word. */
  lastName: string;
  /** Explicit tag; an exact match is exclusive — no overshoot. */
  tag?: string | null;
}

/** rosterIds the token matches. Two conventions coexist on E2's calendar
 *  (Zion, 2026-08-24): a name prefix — "(Mo)" — and first+last initials —
 *  "(ER)" is Ethan Russell, NOT Erten. Both are collected (union, not
 *  either/or): "(er)" shows the call to Erten AND Ethan, and each
 *  dismisses what isn't theirs. First-letter fallback only when neither
 *  convention matches anything. */
export function matchToken(token: string, roster: RosterName[]): string[] {
  const t = token.toLowerCase();
  if (!t) return [];
  // Explicit tags first, and exclusively: once a team says "(er) IS Ethan",
  // showing the call to anyone else is noise, not caution.
  const tagged = roster.filter((r) => (r.tag ?? "").toLowerCase() === t);
  if (tagged.length > 0) return tagged.map((r) => r.rosterId);
  const hits = new Set<string>();
  for (const r of roster) {
    if (r.firstName.toLowerCase().startsWith(t)) hits.add(r.rosterId);
    if (t.length === 2 && r.lastName) {
      const initials = (r.firstName[0] + r.lastName[0]).toLowerCase();
      if (initials === t) hits.add(r.rosterId);
    }
  }
  if (hits.size > 0) return Array.from(hits);
  return roster
    .filter((r) => r.firstName.toLowerCase().startsWith(t[0]))
    .map((r) => r.rosterId);
}

/** First word of a roster name — "Ethan R" matches on "Ethan". */
export function firstNameOf(name: string): string {
  return (name.trim().split(/\s+/)[0] ?? "").trim();
}

/** Last word, "" for single-word names — "Ethan R" → "R". */
export function lastNameOf(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? words[words.length - 1] : "";
}
