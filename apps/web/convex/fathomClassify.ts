// ============================================================================
// Was this a sales call, or a team meeting?
//
// Our meeting bot only ever joined calls a closer pointed it at, so the
// question never arose. Fathom records everything a closer sits in — standups,
// one-to-ones, internal reviews — and all of it would otherwise land in their
// call list and skew their own stats.
//
// The rule we settled on: SHOW everything, COUNT only what we're confident
// about. A closer noticing a real call went missing is far worse than seeing
// one extra row they can dismiss in a tap, so nothing is ever hidden outright.
// ============================================================================

export type Classification = "sales" | "internal" | "unsure";

export interface ClassifyInput {
  /** Emails on the Fathom meeting, however we obtained them. */
  inviteeEmails: string[];
  /** The closer who recorded it. */
  recorderEmail?: string;
  /**
   * Everyone we already know works here — closers and managers on this team,
   * by both their Sequ3nce and Fathom email. This is the strongest signal we
   * have, and it costs nothing: we already hold it.
   */
  teamEmails: Set<string>;
  /**
   * From the calendar we already sync. Fathom's invitee list is empty on
   * impromptu meetings, and the calendar often knows who was actually there.
   * Not a verdict on its own — internal meetings are on the calendar too.
   */
  calendarAttendeeEmails?: string[];
}

export interface ClassifyResult {
  classification: Classification;
  countsTowardStats: boolean;
  /** Plain-language, shown to the closer. They deserve to know why. */
  reason: string;
}

function norm(e: string | undefined | null): string {
  return (e ?? "").trim().toLowerCase();
}

/**
 * Deliberately does NOT trust Fathom's own internal/external flag.
 *
 * That flag means "not a member of your Fathom workspace", which is a
 * different question from "not a colleague". Verified against a real account:
 * every impromptu meeting came back flagged as having an outsider present when
 * the only attendee was the account owner. Believing it would count every
 * ad-hoc internal call as a sales call.
 */
export function classifyMeeting(input: ClassifyInput): ClassifyResult {
  const team = new Set(Array.from(input.teamEmails).map(norm));
  const recorder = norm(input.recorderEmail);

  // Everyone we can see, from Fathom and from the calendar, minus the closer
  // themselves — they are on every one of their own calls and tell us nothing.
  const seen = new Set<string>();
  for (const e of input.inviteeEmails) {
    const n = norm(e);
    if (n && n !== recorder) seen.add(n);
  }
  for (const e of input.calendarAttendeeEmails ?? []) {
    const n = norm(e);
    if (n && n !== recorder) seen.add(n);
  }

  if (seen.size === 0) {
    // Nobody but the closer. Either an impromptu call Fathom knows nothing
    // about, or a genuine solo recording. We cannot tell, and guessing "sales"
    // would quietly inflate their numbers.
    return {
      classification: "unsure",
      countsTowardStats: false,
      reason: "We couldn't tell who else was on this call.",
    };
  }

  const outsiders = Array.from(seen).filter((e) => !team.has(e));

  if (outsiders.length === 0) {
    return {
      classification: "internal",
      countsTowardStats: false,
      reason: "Everyone on this call works with you.",
    };
  }

  return {
    classification: "sales",
    countsTowardStats: true,
    reason:
      outsiders.length === 1
        ? `Someone outside your team was on this call (${outsiders[0]}).`
        : `${outsiders.length} people outside your team were on this call.`,
  };
}
