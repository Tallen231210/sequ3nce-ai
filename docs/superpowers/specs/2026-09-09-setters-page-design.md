
## Addendum 2026-09-10 — sets need initials, Unlabeled column, claims

Zion's rule (via Tyler): a set is credited by the initials on the booking (or the name in a DM link); outbound setters are
not supposed to contact self-booked leads, so catching that is useful, and a Close touch alone never credits a set. Per-team
switch `teams.setterSetsNeedInitials` (E2 on; teams without an initials convention keep touch credit).

- **Unlabeled column** in the team strip (`SetterTeamType` "unlabeled" → lane `unattributed`): every booking with no setter
  named on it, with its own bookings / showed / no-show / closes / cash so totals still add up. A funnel self-book that only an
  outbound setter contacted lands here (not Sophie's column); one Sophie contacted or tagged stays hers; one nobody contacted
  stays hers as a coverage miss. Sophie's coverage denominator keeps every self-book (her job) and says so on the tile.
- **Unlabeled panel** under the sections, grouped by the roster setter who touched the booking ("self-booked Sep 2 · dialed
  by Erten after the booking · Sophie: no contact · showed"), "nobody on the roster" last. Manager "Assign to…" (any setter,
  Sophie, not a set) and setter-side "That was mine" on the EOD page write one `setterBookingClaims` row keyed by the
  booking key `<uid>|<startTime>`; the classifier reads claims first (`attributedBy: "claim"`). No approval, no expiry;
  claims are visibly "claimed", undoable by a manager. "Not a set" excludes the booking.
- Monday post: "Unlabeled bookings a setter worked (no initials): N (Erten 16)" and "claimed this week: M".
