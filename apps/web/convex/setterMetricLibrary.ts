// ============================================================================
// The metrics we know how to compute, and what each one needs to be true.
//
// A fixed catalogue rather than per-business generated calculations, which is
// the central bet of this rebuild. Fifteen metrics written once can be tested
// properly; fifteen hundred generated ones cannot be tested at all, and an
// untestable number on a sales dashboard is worse than no number.
//
// What varies between businesses is not the arithmetic — "time between the lead
// arriving and the setter reaching out" is the same calculation everywhere. It
// is which events those words point at. That lives in the funnel definition;
// this file just says which bindings each metric depends on.
//
// The rule that matters most: a metric whose bindings aren't satisfied does NOT
// render. It does not fall back, and it does not guess. Every silent failure
// this rebuild exists to prevent looked like a confident number.
// ============================================================================

import type { ResolvedFunnel } from "./setterFunnelResolve";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The four shapes every setter KPI turns out to be.
 *
 *   count         how many of something, per setter, per period
 *   ratio         what fraction of one population became another
 *   delta         how long between two events
 *   distribution  the spread of a delta — the tail matters more than the mean,
 *                 because one lead answered three days late says more about a
 *                 team than an average that hides it
 */
export type MetricShape = "count" | "ratio" | "delta" | "distribution";

export interface MetricDefinition {
  id: string;
  label: string;
  shape: MetricShape;
  /** Binding slots that must be present and usable for this to mean anything. */
  requires: string[];
  /** Shown to the manager during setup. Plain language, no jargon. */
  description: string;
  unit: "count" | "percent" | "duration";
  /**
   * True when the answer changes as the working day passes rather than being a
   * settled fact about the past. Used by the verification harness, which cannot
   * byte-compare a moving number — discovered the hard way when a scorecard
   * rate moved 2.7477 → 2.7504 between two runs three minutes apart.
   */
  liveState?: boolean;
}

export const METRICS: MetricDefinition[] = [
  // Two speed-to-lead metrics, deliberately, because the two answers are both
  // true and measure different things.
  //
  // On RemoteStack's last 10 days the same dials read 7.0 hours around the
  // clock and 32 minutes counting only the working week. Neither is wrong: the
  // first is how long a prospect actually waited, the second is how fast the
  // team responded while they were at their desks. Showing only one is how a
  // manager ends up arguing with their own dashboard.
  {
    id: "speed_to_lead_working",
    label: "Speed to lead (working hours)",
    shape: "distribution",
    requires: ["leadArrived", "setterTouch"],
    unit: "duration",
    description:
      "How quickly setters respond during working hours, with nights and weekends taken off the clock. This is the number that reflects how the team is actually performing.",
  },
  {
    id: "speed_to_lead_elapsed",
    label: "Speed to lead (around the clock)",
    shape: "distribution",
    requires: ["leadArrived", "setterTouch"],
    unit: "duration",
    description:
      "How long a lead genuinely waited, including overnight and weekends. This is what the prospect experienced, and it is the one to look at when deciding whether you need cover outside office hours.",
  },
  {
    id: "outreach_volume",
    label: "Outreach per setter",
    shape: "count",
    requires: ["setterTouch", "setterAttribution"],
    unit: "count",
    description:
      "How many times each setter reached out, counting only the channels this business actually uses.",
  },
  {
    id: "contact_rate",
    label: "Contact rate",
    shape: "ratio",
    requires: ["leadArrived", "setterTouch", "setterAttribution"],
    unit: "percent",
    description:
      "The share of leads that got any outreach at all. The one metric that catches leads quietly falling through the floor.",
  },
  {
    id: "set_rate",
    label: "Set rate",
    shape: "ratio",
    requires: ["leadArrived", "meetingBooked", "setterAttribution"],
    unit: "percent",
    description:
      "The share of a setter's leads that ended up booked. Meaningless where prospects book themselves, so it is hidden on those funnels rather than shown as a number nobody earned.",
  },
  {
    id: "show_rate",
    label: "Show rate",
    shape: "ratio",
    requires: ["meetingBooked", "meetingHeld"],
    unit: "percent",
    description:
      "The share of booked meetings the prospect actually attended.",
  },
  {
    id: "time_to_book",
    label: "Time to book",
    shape: "distribution",
    requires: ["leadArrived", "meetingBooked"],
    unit: "duration",
    description:
      "How long from a lead arriving to a meeting being on the calendar.",
  },
  {
    id: "touches_to_contact",
    label: "Attempts before reaching someone",
    shape: "distribution",
    requires: ["setterTouch", "conversationStarted"],
    unit: "count",
    description:
      "How many attempts it takes to actually get a conversation. Tells a manager whether the follow-up cadence is working.",
  },
];

/**
 * What each binding means, said the way a sales manager would say it.
 *
 * Two hard rules, both learned by getting it wrong.
 *
 * NEVER SUGGEST A REMEDY WE HAVEN'T VERIFIED. The first version of this told a
 * customer to "connect the calendar your bookings land on" — their closers had
 * connected their calendars, the real cause was a binding I had forgotten to
 * declare, and the message left a manager staring at advice that made no sense
 * for his setup. Inventing a plausible cause is exactly the failure this whole
 * rebuild exists to prevent, and it is no better in an explanation than in a
 * number.
 *
 * So each slot says only what we need to KNOW, phrased as the question we'd ask
 * in setup. A remedy appears only where we have actually checked — which today
 * means the channels we genuinely cannot read.
 */
export const SLOT_IN_PLAIN_ENGLISH: Record<string, string> = {
  leadArrived: "where your leads come in — a form, a booking, or a DM",
  setterTouch: "whether a call, a text, or both counts as reaching out",
  setterAttribution: "who a lead belongs to when several people touch it",
  setterRoster: "which of your people are setters",
  meetingBooked: "how a booked meeting shows up in your systems",
  meetingHeld: "how you know someone actually turned up",
  conversationStarted: "what counts as actually reaching someone, rather than just trying",
};

/**
 * One plain sentence explaining why a metric isn't shown.
 *
 * Deliberately does not end with an instruction unless we know one that is
 * true. "We need to know X about your business" is honest and leads somewhere;
 * a confident wrong instruction wastes a manager's afternoon and costs their
 * trust in everything next to it.
 */
export function explainBlocked(gate: Gate, suppressed: boolean): string {
  if (suppressed) {
    return "This doesn't mean anything on your funnel, because prospects book their own meetings — a setter can't be credited for a booking they didn't make.";
  }
  // The one case where we know the cause for certain, because it is our gap
  // rather than a question about their business.
  if (gate.unreadable.length > 0) return gate.unreadable[0];

  const needs = gate.missing.map((slot) => SLOT_IN_PLAIN_ENGLISH[slot] ?? slot);
  const list =
    needs.length === 1
      ? needs[0]
      : needs.slice(0, -1).join(", ") + " and " + needs[needs.length - 1];
  return `This one needs a decision from you first: ${list}. It's one of the questions we'll ask when setting up your funnel.`;
}

export interface Gate {
  ok: boolean;
  /** Binding slots this funnel doesn't supply. */
  missing: string[];
  /** Present but not readable — e.g. a DM channel the ingestion can't see. */
  unreadable: string[];
}

/** Channels the ingestion can genuinely produce events for today. */
const READABLE_CHANNELS = new Set(["call", "sms"]);

/**
 * Can this metric be computed honestly for this funnel?
 *
 * Two separate failures, deliberately not collapsed into one. A *missing*
 * binding means the business never told us what the word means. An *unreadable*
 * one means they told us and we can't see it — a business whose setters work in
 * Instagram DMs has a perfectly well-defined touch that our ingestion has no
 * way to observe.
 *
 * Both produce no metric. But only the second is our problem to fix, and
 * conflating them would hide a gap in the product behind what looks like a
 * gap in the customer's setup.
 */
export function gate(metric: MetricDefinition, funnel: ResolvedFunnel): Gate {
  const missing: string[] = [];
  const unreadable: string[] = [];
  const bindings = funnel.bindings as Record<string, any>;

  for (const slot of metric.requires) {
    const binding = bindings[slot];
    if (!binding || !binding.kind) {
      missing.push(slot);
      continue;
    }
    if (binding.evidenceCount === 0 && binding.source === "detected") {
      missing.push(slot);
      continue;
    }
    if (slot === "setterTouch") {
      const chans: string[] = binding.params?.channels ?? ["call", "sms"];
      if (chans.length > 0 && !chans.some((c) => READABLE_CHANNELS.has(c))) {
        const pretty = chans
          .map((c) => (c === "dm" ? "DMs" : c === "sms" ? "texts" : c === "call" ? "calls" : c))
          .join(" and ");
        // Ours to fix, not theirs, and said that way — a manager who thinks
        // this is their misconfiguration will go hunting for a setting that
        // doesn't exist.
        unreadable.push(
          `Your setters work in ${pretty}, and we can't read those out of your CRM yet. That's a gap on our side, not something to fix in your setup.`,
        );
      }
    }
  }

  return { ok: missing.length === 0 && unreadable.length === 0, missing, unreadable };
}

/**
 * Set rate is real work on some funnels and an accident of the booking page on
 * others. Preserved from setterDataMetrics.ts:696, where suppressing it on
 * self-book funnels was already the right call — a setter cannot be credited
 * for a meeting the prospect booked themselves at 2am.
 */
export function suppressedByFlow(
  metricId: string,
  funnel: ResolvedFunnel,
): boolean {
  return metricId === "set_rate" && funnel.legacyFlowType === "self_book";
}

/** Every metric this funnel can currently support, with the reasons for the rest. */
export function availableMetrics(funnel: ResolvedFunnel): {
  available: MetricDefinition[];
  blocked: Array<{ metric: MetricDefinition; gate: Gate; suppressed: boolean }>;
} {
  const available: MetricDefinition[] = [];
  const blocked: Array<{ metric: MetricDefinition; gate: Gate; suppressed: boolean }> = [];
  for (const m of METRICS) {
    const g = gate(m, funnel);
    const suppressed = suppressedByFlow(m.id, funnel);
    if (g.ok && !suppressed) available.push(m);
    else blocked.push({ metric: m, gate: g, suppressed });
  }
  return { available, blocked };
}
