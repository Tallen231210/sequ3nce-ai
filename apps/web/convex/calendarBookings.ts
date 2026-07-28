// ============================================================================
// Which calendar entries are sales calls?
//
// A closer's calendar holds standups, one-to-ones, dentist appointments and
// lunch. Exactly one of two things makes an entry a sales call, and this file
// is the only place that decides.
//
// That single-place part is the point, not tidiness. Team Performance counts
// these as "Booked", and on the Overview tier the same entries become the call
// records a closer reports outcomes against. If the two used separate copies
// of the rule they would eventually disagree, and a board showing 12 booked
// calls next to a queue asking about 9 reads as a bug in the numbers rather
// than as two functions drifting apart.
// ============================================================================

/** The fields of a calendar event this rule actually looks at. */
export interface BookingCandidate {
  attendees?: Array<{ email: string; name?: string; isOrganizer?: boolean }>;
  isAllDay?: boolean;
  startTime: number;
  endTime: number;
  title?: string;
  uid?: string;
}

/**
 * Is this a sales call?
 *
 * Two ways to prove it, and either is enough:
 *
 * 1. It produced a call we recorded. Unambiguous — something joined it.
 * 2. It carries an attendee who isn't the organiser. The Google sync already
 *    strips the closer and same-domain teammates, so anyone left is an
 *    outsider, and a closer's calendar entry with an outsider on it is a sales
 *    call.
 *
 * ICS feeds carry no attendees at all, which is why the Overview tier requires
 * Google: without (2), and with no recordings to provide (1), an ICS calendar
 * can tell us a meeting happened but never what kind.
 */
export function isSalesBooking(
  copies: BookingCandidate[],
  opts: { producedARecordedCall?: boolean } = {},
): boolean {
  if (opts.producedARecordedCall) return true;
  return copies.some((c) =>
    (c.attendees ?? []).some((a) => a.isOrganizer !== true && !!a.email),
  );
}

/**
 * Collapse copies of one meeting.
 *
 * Shared and subscribed calendars put a single appointment on several closers'
 * calendars. Counting each copy inflated one real team's bookings roughly
 * twofold — 854 rows for 390 actual meetings — so anything reading these has
 * to group first. `uid` is the provider's stable event id and dedupes reliably
 * across subscriptions; the title-and-time fallback covers feeds that omit it.
 */
export function groupBookingCopies<T extends BookingCandidate>(
  events: T[],
): Map<string, T[]> {
  const byUid = new Map<string, T[]>();
  for (const ev of events) {
    const key =
      ev.uid || `${ev.startTime}|${(ev.title ?? "").trim().toLowerCase()}`;
    const list = byUid.get(key) ?? [];
    list.push(ev);
    byUid.set(key, list);
  }
  return byUid;
}

/**
 * The prospect, as best the calendar knows them.
 *
 * Booking tools title events "<Prospect> and <Closer>" — real examples from a
 * customer's calendar: "Asija and Kelsey Simons", "Karlease Ruddock and Kelsey
 * Simons". Google gives us no display name for external attendees on these, so
 * the title is the only place the prospect's name exists; the raw address is a
 * poor substitute when a closer is trying to remember who they spoke to.
 *
 * So: a real attendee name if we have one, otherwise the title with the
 * closer's own name trimmed off, otherwise the address.
 */
export function prospectFromBooking(
  copies: BookingCandidate[],
  closerName?: string,
): string | undefined {
  let email: string | undefined;
  for (const c of copies) {
    for (const a of c.attendees ?? []) {
      if (a.isOrganizer === true || !a.email) continue;
      const name = a.name?.trim();
      if (name) return name;
      email ??= a.email.trim();
    }
  }

  const title = copies[0]?.title?.trim();
  if (title) {
    const cleaned = stripCloserFromTitle(title, closerName);
    if (cleaned) return cleaned;
  }
  return email ?? title ?? undefined;
}

/**
 * "Asija and Kelsey Simons" → "Asija".
 *
 * Only when the closer's name is actually there and something is left over.
 * A title that's just the closer's name, or that doesn't mention them, is
 * returned untouched rather than mangled into nothing.
 */
function stripCloserFromTitle(
  title: string,
  closerName?: string,
): string | undefined {
  if (!closerName?.trim()) return title;
  const needle = closerName.trim().toLowerCase();
  const lower = title.toLowerCase();
  if (!lower.includes(needle)) return title;

  const cleaned = title
    .replace(new RegExp(`\\s*(and|&|with|/|,)\\s*${escapeRegex(closerName.trim())}\\s*$`, "i"), "")
    .replace(new RegExp(`^\\s*${escapeRegex(closerName.trim())}\\s*(and|&|with|/|,)\\s*`, "i"), "")
    .trim();

  return cleaned.length > 0 && cleaned.toLowerCase() !== needle ? cleaned : title;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
