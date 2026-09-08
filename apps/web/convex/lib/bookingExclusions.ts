// ============================================================================
// Calendar entries that carry an outside invitee but are not sales calls.
//
// isSalesBooking (calendarBookings.ts) treats "has an outsider on the invite"
// as proof of a sales call, which is right almost everywhere. Two kinds of
// exception showed up on a live team's calendars (E2, Sep 2026):
//
//   cancelled  — the booking tool's own "Canceled: …" copy. Google keeps it
//                visible with a prefix instead of removing it. It is neither
//                a booking nor a block: the slot is free again.
//   non_sales  — a recurring internal entry someone was invited to: "Block",
//                the daily standup, a 1:1, the confirmation-calls block. Not
//                a booking, but it does occupy the closer's time (a block).
//
// The generic list is only what is junk on ANY calendar. Words that are
// specific to one team's habits ("NY Session", "Prayer", "Trading") live in
// that team's own list (teams.closerExcludedBookingTitles) and match at the
// start of the title, so a prospect whose name happens to contain the word
// is not swallowed.
//
// Shared by the Team Performance recount, the Overview-tier booking→call job
// and the calendar check-ins card, so the three never disagree.
// ============================================================================

export type ExcludedKind = "cancelled" | "non_sales";

/** The booking tool's cancelled copy — same idiom as the auto-join sweep. */
const CANCELLED_TITLE = /^\s*cancell?ed:/i;

const GENERIC_NON_SALES = new RegExp(
  [
    "^\\s*block\\b",
    "^\\s*call confirmations?\\b",
    "^\\s*follow[\\s-]*ups\\b", // the plural time block, not "X — Follow Up"
    "\\bstm\\b",
    "\\bstand-?ups?\\b",
    "\\bdo not book\\b",
    "\\b1[\\s-]*on[\\s-]*1\\b",
    "\\b1:1\\b",
  ].join("|"),
  "i",
);

const MIN_TEAM_PATTERN_LENGTH = 3;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A team's own words, matched at the start of the title on a word boundary.
 * Patterns shorter than three characters are ignored rather than trusted.
 */
export function teamTitleRegex(patterns: readonly string[] | undefined): RegExp | null {
  const cleaned = (patterns ?? [])
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length >= MIN_TEAM_PATTERN_LENGTH);
  if (cleaned.length === 0) return null;
  return new RegExp(`^\\s*(?:${cleaned.map(escapeRegex).join("|")})\\b`, "i");
}

/** Why this title is not a sales call, or null when it may be one. */
export function classifyExcludedTitle(
  title: string | undefined,
  teamPatterns?: readonly string[],
): ExcludedKind | null {
  if (!title) return null;
  if (CANCELLED_TITLE.test(title)) return "cancelled";
  if (GENERIC_NON_SALES.test(title)) return "non_sales";
  const team = teamTitleRegex(teamPatterns);
  if (team && team.test(title)) return "non_sales";
  return null;
}

/** Is this title one of the known non-sales entries that still carry invitees? */
export function isExcludedBookingTitle(
  title: string | undefined,
  teamPatterns?: readonly string[],
): boolean {
  return classifyExcludedTitle(title, teamPatterns) !== null;
}
