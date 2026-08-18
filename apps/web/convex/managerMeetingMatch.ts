/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Which rep is this meeting with?
//
// Pure, so the rules can be tested against real titles without a calendar.
//
// This is the shakiest part of Manager Mode and the design says so: only 16%
// of real calendar events carry any attendee list at all, and the ones we
// looked at were prospects rather than colleagues. So it degrades — invite,
// then title, then ask — and never guesses when it isn't sure. A brief
// addressed to the wrong rep is worse than no brief, because the manager
// walks into the room believing it.
// ============================================================================

export interface Candidate {
  closerId: string;
  name: string;
  email: string;
}

export interface Match {
  closerId: string;
  by: "attendee" | "title";
}

/** Normalise for comparison: lowercase, collapse whitespace, strip accents. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * An attendee whose email belongs to a rep on this team.
 *
 * The strongest signal by far, and the rarest. Exact email match only — no
 * fuzzy matching on a field that decides who a coaching brief is about.
 */
export function matchByAttendees(
  attendeesJson: string | undefined,
  candidates: Candidate[],
): Match | null {
  if (!attendeesJson) return null;
  let list: any[];
  try {
    list = JSON.parse(attendeesJson);
  } catch {
    return null;
  }
  if (!Array.isArray(list)) return null;

  const byEmail = new Map(candidates.map((c) => [norm(c.email), c.closerId]));
  const hits = new Set<string>();
  for (const a of list) {
    const e = typeof a?.email === "string" ? norm(a.email) : null;
    if (!e) continue;
    const id = byEmail.get(e);
    if (id) hits.add(id);
  }

  // Exactly one rep means a one-to-one. Two or more is a team meeting, and
  // attributing it to whichever happened to sort first would be a lie.
  return hits.size === 1
    ? { closerId: [...hits][0], by: "attendee" }
    : null;
}

/**
 * A rep's name in the meeting title.
 *
 * Real titles look like "Nick / Gianni 1:1", "Weekly with Anthony", or just
 * "Brittany". Matched on whole words so "Nick" doesn't match "Nickelodeon"
 * and, more importantly, so a rep called Ann doesn't match every title
 * containing "planning".
 */
export function matchByTitle(
  title: string | undefined,
  candidates: Candidate[],
): Match | null {
  if (!title) return null;
  const t = norm(title);
  const words = new Set(t.split(/[^a-z0-9']+/).filter(Boolean));

  const hits = new Set<string>();
  for (const c of candidates) {
    const parts = norm(c.name).split(" ").filter(Boolean);
    if (parts.length === 0) continue;

    // First name is enough — nobody titles a meeting with a surname. But a
    // first name under three characters is too collidable to trust.
    const first = parts[0];
    if (first.length < 3) continue;

    const full = parts.join(" ");
    if (words.has(first) || (parts.length > 1 && t.includes(full))) {
      hits.add(c.closerId);
    }
  }

  // Same rule as attendees: one name is a one-to-one, several is a team
  // meeting, none is unknown. Only the first is actionable.
  return hits.size === 1 ? { closerId: [...hits][0], by: "title" } : null;
}

/** Invite first, then title. Null when neither is certain. */
export function matchMeetingToRep(
  ev: { title?: string; attendees?: string },
  candidates: Candidate[],
): Match | null {
  return (
    matchByAttendees(ev.attendees, candidates) ??
    matchByTitle(ev.title, candidates)
  );
}
