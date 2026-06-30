// Fallback prospect-name parser for calendar event titles in
// "<Prospect> and <Bookee>" / "<Prospect> with <Bookee>" / etc format.
//
// Context: external scheduling tools (Calendly, Acuity, SavvyCal, …) create
// calendar events on sub-calendars with auto-generated titles like
// "Joaquin Ramirez and Gianni Scott". Google's events.list API does NOT
// surface attendees for service-account events on sub-calendars, so the
// desktop's existing extractor (which relies on attendees OR title-with-":")
// returns undefined and the call ends up with a null prospectName.
//
// Two-tier algorithm:
//   TIER 1 — Closer-name match. For each separator, check if either half
//     of the title contains any KNOWN team-closer first name. If exactly
//     one half does, the OTHER half is the prospect. Handles shared-calendar
//     teams where any closer can take any open call (e.g., Gianni takes
//     Anthony's call when Anthony is busy).
//
//   TIER 2 — Calendly heuristic fallback. When no team-closer matches in
//     either half (i.e. the bookee is someone OFF the team — a business
//     owner whose calendar is shared, an external collaborator, etc.) AND
//     the separator is " and " / " with " (Calendly's defaults), assume
//     the convention "<Prospect> [sep] <Bookee>" and take the FIRST half.
//     Strict title-case validation on BOTH halves to avoid false-positives
//     like "Strategy session with the team".
//
// Note: the bookee (whoever the prospect originally booked with) is ONLY a
// parsing hint. We never store the bookee anywhere — the closer attribution
// stays at the logged-in user (whoever clicked Join / took the call).
//
// Mirrored client-side in `apps/desktop/src/renderer/views/schedule/
// scheduleUtils.ts` (Layer 2, next desktop release) so the schedule view
// UI also benefits.

const SEPARATORS = [
  " and ",
  " with ",
  " & ",
  " + ",
  " / ",
  " vs ",
  " vs. ",
] as const;

const CALENDLY_DEFAULT_SEPARATORS = new Set<string>([" and ", " with "]);

// A "name-shaped" string. Allows Unicode letters (covers diacritics, CJK,
// etc), spaces, apostrophe, period, hyphen. Must start with a letter.
// Length-bounded so the parser doesn't return paragraphs or single chars.
const NAME_VALIDATOR = /^\p{L}[\p{L}\s'.\-]{1,59}$/u;

export type ExtractInput = {
  /** All active closer names on the team. Tier 1 tries each one. */
  closerNames: string[];
};

export function extractProspectFromTitle(
  title: string | null | undefined,
  input: ExtractInput | string | null | undefined,
): string | null {
  if (!title) return null;

  // Backwards-compat: callers can still pass a single closer name string.
  const closerNames: string[] = (() => {
    if (!input) return [];
    if (typeof input === "string") return [input];
    return input.closerNames;
  })();

  const cleanTitle = title.trim().replace(/\s+/g, " ");
  if (!cleanTitle) return null;

  // Build the set of closer first names (lowercased) to match against.
  // De-dup so two closers with the same first name don't cost extra work.
  const firstNames = new Set<string>();
  for (const name of closerNames) {
    if (!name) continue;
    const first = name.trim().split(/\s+/)[0]?.toLowerCase();
    if (first && first.length >= 2) firstNames.add(first);
  }

  for (const sep of SEPARATORS) {
    const idx = cleanTitle.toLowerCase().indexOf(sep);
    if (idx === -1) continue;

    const partA = cleanTitle.slice(0, idx).trim();
    const partB = cleanTitle.slice(idx + sep.length).trim();
    if (!partA || !partB) continue;

    // TIER 1 — does either half contain a known closer first name?
    const aHasCloser = firstNames.size > 0 && anyNameIn(partA, firstNames);
    const bHasCloser = firstNames.size > 0 && anyNameIn(partB, firstNames);

    let candidate: string | null = null;
    if (aHasCloser && !bHasCloser) candidate = partB;
    else if (bHasCloser && !aHasCloser) candidate = partA;

    if (candidate) {
      const validated = validateProspectName(candidate);
      if (validated) return validated;
      // Tier 1 matched but candidate didn't validate. Skip the Tier 2
      // fallback for this separator to avoid silently overriding with a
      // less-confident guess.
      continue;
    }

    // TIER 2 — only fire when we found NO team closer in either half (so
    // it's plausibly an off-team bookee like a business-owner's calendar),
    // the separator is one of Calendly's defaults, and BOTH halves pass a
    // strict title-case check. The strict check is what stops the parser
    // from over-extracting on titles like "Strategy session with the team."
    if (
      !aHasCloser &&
      !bHasCloser &&
      CALENDLY_DEFAULT_SEPARATORS.has(sep) &&
      looksLikeFullName(partA) &&
      looksLikeFullName(partB)
    ) {
      const validated = validateProspectName(partA);
      if (validated) return validated;
    }
  }

  return null;
}

/**
 * Word-boundary-aware substring match. Avoids false positives like "Mike"
 * matching inside "Mikenzie" — only considers it a match if surrounded by
 * non-letter chars (start/end of string or whitespace/punct).
 */
function anyNameIn(haystack: string, needlesLower: Set<string>): boolean {
  const lower = haystack.toLowerCase();
  for (const needle of needlesLower) {
    if (containsAtBoundary(lower, needle)) return true;
  }
  return false;
}

function containsAtBoundary(lower: string, needleLower: string): boolean {
  let from = 0;
  while (true) {
    const idx = lower.indexOf(needleLower, from);
    if (idx === -1) return false;
    const before = idx === 0 ? "" : lower[idx - 1];
    const after =
      idx + needleLower.length >= lower.length
        ? ""
        : lower[idx + needleLower.length];
    if (!isLetter(before) && !isLetter(after)) return true;
    from = idx + 1;
  }
}

function isLetter(ch: string): boolean {
  if (!ch) return false;
  return /\p{L}/u.test(ch);
}

/**
 * Strict title-case check: every space-separated word must start with an
 * uppercase Unicode letter. Allows tokens that start with non-letters
 * (e.g., `(J)` after the bookee name) by skipping them — they don't count
 * for or against. Used by Tier 2 to filter out titles like
 * "Strategy session with team" where "session" is lowercase.
 */
function looksLikeFullName(s: string): boolean {
  const cleaned = s.trim();
  if (cleaned.length < 2) return false;
  const words = cleaned.split(/\s+/);
  let titleCasedWordCount = 0;
  for (const w of words) {
    if (w.length === 0) continue;
    const startsWithLetter = /^\p{L}/u.test(w);
    if (!startsWithLetter) continue; // token like "(J)" — neutral
    if (!/^\p{Lu}/u.test(w)) return false; // starts with a lowercase letter — fail
    titleCasedWordCount++;
  }
  // Require at least one actual title-cased word so a string of only
  // punctuation tokens doesn't slip through.
  return titleCasedWordCount >= 1;
}

function validateProspectName(s: string): string | null {
  // Strip trailing punctuation that can creep in from title formatting
  // (e.g., "John." or "John,") — but only if doing so leaves a valid name.
  const candidate = s.trim().replace(/[.,;:!?]+$/, "").trim();
  if (candidate.length < 2 || candidate.length > 60) return null;
  if (!NAME_VALIDATOR.test(candidate)) return null;
  return candidate;
}
