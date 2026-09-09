// ============================================================================
// Which setter team does a booking belong to, and did the prospect show?
//
// Pure rules over one booking's facts. The facts come from three places that
// used to be read separately and disagree: the booking link (Event Name), the
// calendar title (a setter's initials, or "(s)" for the confirmation setter),
// and Close activity (who actually called or texted the lead before the call).
// Tyler's rule (2026-09-09): Close activity OR the tag — either is enough. The
// tag was the only record before, and on E2 it was missing on two thirds of
// the self-booked funnel calls that Close showed had been worked.
//
// Verdicts: a human-logged outcome beats the recording, which beats the
// closer's post-call colour, which only counts when we watched it change
// after the call. Nothing else counts, and unknown stays unknown.
//
// Benched in setterTeamAttributionBench.ts.
// ============================================================================

import { classifyMatchedCall } from "../setterDataMetrics";
import { COLOR, RECOLOR_GRACE_MS, type RecolorState } from "./calendarColorRules";
import { eventNameMatches, personFromEventName } from "./eventName";

export type SetterLane =
  | "dm"
  | "outbound"
  | "confirmation"
  | "self_booked_uncontacted"
  | "unattributed";

export type RosterRole = "booking" | "confirmation";

export interface RosterRef {
  rosterId: string;
  name: string;
  role: RosterRole;
  tag: string | null;
  crmUserId: string | null;
  /** False for a deactivated roster row (kept so old bookings keep their credit). Absent = active. */
  active?: boolean;
}

/** One call or text by a setter to the lead, before the booked call. */
export interface Touch {
  rosterId: string | null;
  crmUserId: string;
  kind: "dial" | "sms";
  at: number;
  /** A connected call, or a text the lead replied to. */
  reached: boolean;
  /** Made after the lead booked — the confirmation setter's job; earlier touches are a setter driving the booking. */
  afterBooking: boolean;
}

export type AttributedBy = "event_name" | "tag" | "crm_activity" | "hand_created" | "none";

export interface ClassifyInput {
  eventName: string | null;
  /** The row is new enough that a missing Event Name means hand-created. */
  descriptionTrusted: boolean;
  taggedRosterIds: readonly string[];
  touches: readonly Touch[];
  leadInClose: boolean;
  /** From the lead's own first-touch stamps; null when the lead is not in Close. */
  anyoneTouchedBefore: boolean | null;
  rosters: readonly RosterRef[];
  dmPatterns?: readonly string[];
  funnelPatterns?: readonly string[];
}

export interface Classification {
  lane: SetterLane;
  creditRosterIds: string[];
  /** DM setters are named in the link, not on the roster: "Instagram (Lazar)". */
  dmPerson: string | null;
  sourceKnown: boolean;
  contactKnown: boolean;
  attributedBy: AttributedBy;
  isFunnel: boolean;
}

const uniq = (ids: readonly string[]) => Array.from(new Set(ids));

export function classifyBooking(i: ClassifyInput): Classification {
  const roleOf = new Map(i.rosters.map((r) => [r.rosterId, r.role]));
  const isDm = eventNameMatches(i.eventName, i.dmPatterns);
  const isFunnel = !isDm && eventNameMatches(i.eventName, i.funnelPatterns);
  const handCreated = i.eventName === null && i.descriptionTrusted;

  const tagged = (role: RosterRole) => i.taggedRosterIds.filter((id) => roleOf.get(id) === role);
  const touched = (role: RosterRole) =>
    uniq(
      i.touches
        .filter((t) => t.rosterId !== null && roleOf.get(t.rosterId) === role)
        .map((t) => t.rosterId as string),
    );
  const outboundTag = tagged("booking");
  const confirmationTag = tagged("confirmation");
  const outboundTouch = touched("booking");
  const confirmationTouch = touched("confirmation");
  const anyTag = i.taggedRosterIds.length > 0;
  const anyTouch = i.touches.length > 0;

  // The link names the source; a hand-created event is a source only when a
  // person is visibly attached to it. A lead in Close answers "touched or
  // not" either way, which is what makes contact KNOWN — including known-untouched.
  // A hand-made event's source is only known when a setter is visibly on it:
  // an outbound setter's tag or touch, or the confirmation setter's own mark.
  const setterAttached = outboundTag.length > 0 || outboundTouch.length > 0 || confirmationTag.length > 0;
  const sourceKnown = i.eventName !== null || (handCreated && setterAttached);
  const contactKnown = anyTag || anyTouch || i.leadInClose;
  const base = { dmPerson: null as string | null, sourceKnown, contactKnown, isFunnel };

  if (isDm) {
    return { ...base, lane: "dm", creditRosterIds: [], dmPerson: personFromEventName(i.eventName), attributedBy: "event_name" };
  }
  if (outboundTag.length > 0) {
    return { ...base, lane: "outbound", creditRosterIds: outboundTag, attributedBy: "tag" };
  }
  if (outboundTouch.length > 0) {
    // The union rule: an outbound setter who worked the lead gets the set
    // whether or not they remembered the initials.
    return { ...base, lane: "outbound", creditRosterIds: outboundTouch, attributedBy: "crm_activity" };
  }
  if (handCreated && confirmationTag.length > 0) {
    // "(s)" on a hand-made event: the confirmation setter marked it, but it
    // is not a funnel booking. Credit her, keep it out of the outbound lane.
    return { ...base, lane: "confirmation", creditRosterIds: confirmationTag, attributedBy: "hand_created" };
  }
  if (isFunnel && (confirmationTag.length > 0 || confirmationTouch.length > 0)) {
    return {
      ...base,
      lane: "confirmation",
      creditRosterIds: uniq([...confirmationTag, ...confirmationTouch]),
      attributedBy: confirmationTag.length > 0 ? "tag" : "crm_activity",
    };
  }
  if (isFunnel && i.leadInClose && i.anyoneTouchedBefore === false) {
    return { ...base, lane: "self_booked_uncontacted", creditRosterIds: [], attributedBy: "event_name" };
  }
  return { ...base, lane: "unattributed", creditRosterIds: [], attributedBy: "none" };
}

// ---------------------------------------------------------------------------
// Show verdict
// ---------------------------------------------------------------------------

/** The call fields the verdict looks at (a subset of the calls table). */
export interface CallEvidence {
  status?: string;
  outcome?: string | null;
  outcomeSource?: string | null;
  duration?: number | null;
  prospectJoined?: boolean;
  prospectTalkTime?: number | null;
}

export type VerdictResult = "showed" | "no_show" | "rescheduled" | "unknown";
export type VerdictSource = "human" | "recording" | "calendar_color" | null;

export interface Verdict {
  result: VerdictResult;
  source: VerdictSource;
  /** The call is over and the grace period has passed: an unknown here is a real gap. */
  due: boolean;
}

function fromCall(c: ReturnType<typeof classifyMatchedCall>): VerdictResult {
  if (c === "showed") return "showed";
  if (c === "noShow") return "no_show";
  if (c === "rescheduled") return "rescheduled";
  return "unknown";
}

export function showVerdictFor(i: {
  call: CallEvidence | null;
  recolor: RecolorState;
  colorId?: string | null;
  endTime: number;
  nowMs: number;
}): Verdict {
  const due = i.nowMs >= i.endTime + RECOLOR_GRACE_MS;
  if (i.call) {
    const verdict = classifyMatchedCall(i.call);
    if (verdict !== "stub") {
      const human =
        i.call.status === "no_show" ||
        (i.call.outcome != null && i.call.outcomeSource !== "ai");
      return { result: fromCall(verdict), source: human ? "human" : "recording", due };
    }
  }
  if (i.recolor === "done") {
    if (i.colorId === COLOR.DARK_GREEN) return { result: "showed", source: "calendar_color", due };
    if (i.colorId === COLOR.RED) return { result: "no_show", source: "calendar_color", due };
    if (i.colorId === COLOR.YELLOW) return { result: "rescheduled", source: "calendar_color", due };
  }
  return { result: "unknown", source: null, due };
}

// ---------------------------------------------------------------------------
// Accuracy: the share of due bookings where all three facts are known
// ---------------------------------------------------------------------------

export interface AccuracyInput {
  sourceKnown: boolean;
  contactKnown: boolean;
  verdict: Verdict;
}

export interface Accuracy {
  bookings: number;
  due: number;
  sourceKnown: number;
  contactKnown: number;
  showKnown: number;
  allKnown: number;
  sourcePct: number | null;
  contactPct: number | null;
  showPct: number | null;
  score: number | null;
}

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 100) : null);

export function accuracyOf(records: readonly AccuracyInput[]): Accuracy {
  const due = records.filter((r) => r.verdict.due);
  const sourceKnown = records.filter((r) => r.sourceKnown).length;
  const contactKnown = records.filter((r) => r.contactKnown).length;
  const showKnown = due.filter((r) => r.verdict.result !== "unknown").length;
  const allKnown = due.filter(
    (r) => r.sourceKnown && r.contactKnown && r.verdict.result !== "unknown",
  ).length;
  return {
    bookings: records.length,
    due: due.length,
    sourceKnown,
    contactKnown,
    showKnown,
    allKnown,
    sourcePct: pct(sourceKnown, records.length),
    contactPct: pct(contactKnown, records.length),
    showPct: pct(showKnown, due.length),
    score: pct(allKnown, due.length),
  };
}
