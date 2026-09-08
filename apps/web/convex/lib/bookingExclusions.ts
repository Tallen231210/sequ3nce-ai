// ============================================================================
// Calendar entries that carry an outside invitee but are not sales calls.
//
// isSalesBooking (calendarBookings.ts) treats "has an outsider on the invite"
// as proof of a sales call, which is right almost everywhere. The exceptions
// on a live team's calendars (E2, Sep 2026): the booking tool's own
// "Canceled: …" copies, a closer's recurring "Block" with an invitee on it,
// the daily standup, and personal recurring entries a teammate was invited to.
// The titles are stable, so a small list handles them.
//
// Used today by the calendar check-ins card only. The booked-count rule will
// pick it up when the E2 accuracy fixes land, so keep it here, not inline.
// ============================================================================

const EXCLUDED_TITLE = new RegExp(
  [
    "^\\s*cancell?ed:", // the booking tool's cancelled copy (meetingBot.ts idiom)
    "^\\s*block\\b",
    "^\\s*read\\b",
    "^\\s*gym\\b",
    "^\\s*prayer\\b",
    "^\\s*trading\\b",
    "^\\s*ny session\\b",
    "^\\s*call confirmations?\\b",
    "^\\s*follow[\\s-]*ups\\b", // the plural time block, not "X — Follow Up"
    "\\bstm\\b",
    "\\bstand-?up\\b",
    "\\bdo not book\\b",
    "\\bmeditation\\b",
    "\\b1[\\s-]*on[\\s-]*1\\b",
    "\\b1:1\\b",
  ].join("|"),
  "i",
);

/** Is this title one of the known non-sales entries that still carry invitees? */
export function isExcludedBookingTitle(title: string | undefined): boolean {
  if (!title) return false;
  return EXCLUDED_TITLE.test(title);
}
