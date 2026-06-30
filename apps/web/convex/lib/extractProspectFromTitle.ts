// Fallback prospect-name parser for calendar event titles in
// "<Prospect> and <Closer>" / "<Prospect> with <Closer>" / etc format.
//
// Context: external scheduling tools (Calendly, Acuity, SavvyCal, …) create
// calendar events on sub-calendars with auto-generated titles like
// "Joaquin Ramirez and Gianni Scott". Google's events.list API does NOT
// surface attendees for service-account events on sub-calendars, so the
// desktop's existing extractor (which relies on attendees OR title-with-":")
// returns undefined and the call ends up with a null prospectName.
//
// This helper is the server-side fallback. Mirrored client-side in
// `apps/desktop/src/renderer/views/schedule/scheduleUtils.ts` (Layer 2,
// next desktop release) so the schedule view UI also benefits.
//
// Design philosophy: when we can't extract with confidence, return null.
// "Unknown Prospect" is better than a wrong name.

const SEPARATORS = [
  " and ",
  " with ",
  " & ",
  " + ",
  " / ",
  " vs ",
  " vs. ",
] as const;

// A "name-shaped" string. Allows Unicode letters (covers diacritics, CJK,
// etc), spaces, apostrophe, period, hyphen. Must start with a letter.
// Length-bounded so the parser doesn't return paragraphs or single chars.
const NAME_VALIDATOR = /^\p{L}[\p{L}\s'.\-]{1,59}$/u;

export function extractProspectFromTitle(
  title: string | null | undefined,
  closerName: string | null | undefined,
): string | null {
  if (!title || !closerName) return null;

  const cleanTitle = title.trim().replace(/\s+/g, " ");
  if (!cleanTitle) return null;

  const cleanCloser = closerName.trim().replace(/\s+/g, " ");
  if (!cleanCloser) return null;

  const closerFirstName = cleanCloser.split(" ")[0].toLowerCase();
  if (closerFirstName.length < 2) return null;

  const lowerTitle = cleanTitle.toLowerCase();

  for (const sep of SEPARATORS) {
    const idx = lowerTitle.indexOf(sep);
    if (idx === -1) continue;

    const partA = cleanTitle.slice(0, idx).trim();
    const partB = cleanTitle.slice(idx + sep.length).trim();
    if (!partA || !partB) continue;

    const aHasCloser = containsName(partA, closerFirstName);
    const bHasCloser = containsName(partB, closerFirstName);

    let candidate: string | null = null;
    if (aHasCloser && !bHasCloser) candidate = partB;
    else if (bHasCloser && !aHasCloser) candidate = partA;
    // both-or-neither match → ambiguous, try next separator

    if (candidate) {
      const validated = validateProspectName(candidate);
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
function containsName(haystack: string, needleLower: string): boolean {
  const lower = haystack.toLowerCase();
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

function validateProspectName(s: string): string | null {
  // Strip trailing punctuation that can creep in from title formatting
  // (e.g., "John." or "John,") — but only if doing so leaves a valid name.
  let candidate = s.trim().replace(/[.,;:!?]+$/, "").trim();
  if (candidate.length < 2 || candidate.length > 60) return null;
  if (!NAME_VALIDATOR.test(candidate)) return null;
  return candidate;
}
