// ============================================================================
// The vocabulary a funnel is described in.
//
// Pure types and validation, no database access, so it can be imported from
// queries, mutations, actions and the metric library without a runtime switch —
// the same reason setterCloserMatcher.ts lives in V8.
//
// Everything here is a deliberately small, explicit list. That is a direct
// lesson from `lib/ghlMessageType.ts`: a team dialling through Sendblue synced
// perfectly and recorded not one dial, because unrecognised inputs were
// silently skipped. An unknown binding kind must be a loud, reviewable event —
// never a shrug.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * How a lead gets into this funnel.
 *
 * The three archetypes we've actually seen: ads → landing page → booking link
 * (the lead exists when they book), ads → DM (exists when they message), and
 * ads → opt-in form (exists when the contact is created).
 */
export const LEAD_ARRIVED_KINDS = [
  "crm_contact_created",
  "first_inbound_message",
  "booking_created",
  "form_submitted",
  "opportunity_created",
] as const;

/**
 * What counts as the setter reaching out.
 *
 * This is the binding that made speed-to-lead mean different things at
 * different businesses: one measures the first dial, another the first text.
 * Both are correct — for them.
 */
export const TOUCH_KINDS = ["outbound_attempt", "conversation_started"] as const;

/**
 * Channels a touch can happen on.
 *
 * `call` and `sms` are all the ingestion understands today; the rest are wired
 * as the message-type mapping learns them. Listed here first on purpose, so a
 * funnel can declare "our setters work in DMs" and the availability report can
 * answer honestly that we cannot see that yet — rather than reporting zero
 * activity and letting someone conclude the setters do nothing.
 */
export const CHANNELS = ["call", "sms", "dm", "email", "whatsapp"] as const;

/**
 * Which CRM users are actually setters.
 *
 * The binding this design was missing, and real data found it. RemoteStack has
 * two or three setters; thirteen different user ids made outbound touches in
 * thirty days — including Gianni the manager (484 of them), a support account,
 * and eight ids belonging to people no longer in the CRM. Counting all of that
 * as "setter activity" makes every per-setter number meaningless.
 *
 *   all_crm_users  anyone with a login counts — what the product does today,
 *                  kept as the default so nothing changes until a business says
 *                  otherwise
 *   explicit_list  the business names their setters. Boring, and the only
 *                  option that is reliably right.
 *   crm_role       trust the CRM's own role field, where it distinguishes them
 */
export const ROSTER_KINDS = [
  "all_crm_users",
  "explicit_list",
  "crm_role",
] as const;
export type RosterKind = (typeof ROSTER_KINDS)[number];

/** Who gets the credit when several people touch one lead. */
export const ATTRIBUTION_KINDS = [
  "assigned_owner",
  "first_toucher",
  "custom_field",
] as const;

/** How we know a meeting happened rather than merely being booked. */
export const HELD_KINDS = [
  "crm_status",
  "sequ3nce_call_matched",
  "recording_length",
  "manual_only",
] as const;

export type LeadArrivedKind = (typeof LEAD_ARRIVED_KINDS)[number];
export type TouchKind = (typeof TOUCH_KINDS)[number];
export type Channel = (typeof CHANNELS)[number];
export type AttributionKind = (typeof ATTRIBUTION_KINDS)[number];
export type HeldKind = (typeof HELD_KINDS)[number];

/** Where a binding's value came from, which is how much we trust it. */
export type BindingSource = "detected" | "confirmed" | "manual";

export interface Binding<K extends string = string> {
  kind: K;
  params?: Record<string, any>;
  source: BindingSource;
  /**
   * Real records behind this. Zero means we inferred it from nothing, which is
   * never allowed to reach a live metric.
   */
  evidenceCount: number;
  detectedAt?: number;
}

export interface FunnelBindings {
  leadArrived: Binding<LeadArrivedKind>;
  setterRoster?: Binding<RosterKind> & { params?: { userIds?: string[] } };
  setterTouch: Binding<TouchKind> & {
    params?: { channels?: Channel[]; countAutomated?: boolean };
  };
  setterAttribution: Binding<AttributionKind>;
  meetingBooked?: Binding<string>;
  conversationStarted?: Binding<string>;
  meetingHeld?: Binding<HeldKind>;
}

export interface BusinessHours {
  timezone: string;
  /** 0 = Sunday, matching JS getDay(). */
  days: number[];
  startHour: number;
  endHour: number;
}

/** The slots a funnel must fill before it can drive anything. */
const REQUIRED_SLOTS = [
  "leadArrived",
  "setterTouch",
  "setterAttribution",
] as const;

const BOOKED_KINDS = ["crm_or_calendar", "crm_appointment", "calendar_event"] as const;
const CONVERSATION_KINDS = ["call_over_threshold", "reply_received"] as const;

const KINDS_BY_SLOT: Record<string, readonly string[]> = {
  meetingBooked: BOOKED_KINDS,
  conversationStarted: CONVERSATION_KINDS,
  setterRoster: ROSTER_KINDS,
  leadArrived: LEAD_ARRIVED_KINDS,
  setterTouch: TOUCH_KINDS,
  setterAttribution: ATTRIBUTION_KINDS,
  meetingHeld: HELD_KINDS,
};

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** Not fatal, but the manager should see them before approving. */
  warnings: string[];
}

/**
 * Check a funnel definition before it is stored or used.
 *
 * Rejects rather than repairs. A binding we don't understand is a mistake
 * somewhere upstream — a model inventing a rule, or a stale client — and
 * quietly coercing it to something plausible is how you get numbers nobody can
 * explain.
 */
export function validateBindings(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["No bindings supplied."], warnings };
  }
  const b = raw as Record<string, any>;

  for (const slot of REQUIRED_SLOTS) {
    if (!b[slot]) errors.push(`Missing: ${slot}`);
  }

  for (const [slot, binding] of Object.entries(b)) {
    if (!binding || typeof binding !== "object") {
      errors.push(`${slot}: not a binding`);
      continue;
    }
    const allowed = KINDS_BY_SLOT[slot];
    if (allowed && !allowed.includes(binding.kind)) {
      errors.push(
        `${slot}: "${binding.kind}" is not a rule we know. Known: ${allowed.join(", ")}`,
      );
    }
    if (typeof binding.evidenceCount !== "number" || binding.evidenceCount < 0) {
      errors.push(`${slot}: evidenceCount missing`);
    } else if (binding.evidenceCount === 0 && binding.source === "detected") {
      // Detected-from-nothing is the failure mode that produced "no power
      // dialer" on an org running 1,700 automated dials a day.
      errors.push(
        `${slot}: detected from zero records — confirm it manually or leave it unset`,
      );
    }
    if (!["detected", "confirmed", "manual"].includes(binding.source)) {
      errors.push(`${slot}: source must be detected, confirmed or manual`);
    }
  }

  const roster = b.setterRoster;
  if (!roster || roster.kind === "all_crm_users") {
    warnings.push(
      "Every CRM user counts as a setter, including managers and support accounts. Naming the actual setters makes per-person numbers meaningful.",
    );
  } else if (roster.kind === "explicit_list" && !roster.params?.userIds?.length) {
    errors.push("setterRoster: pick at least one person, or use all_crm_users");
  }

  const touch = b.setterTouch;
  if (touch?.params?.channels) {
    const chans: unknown = touch.params.channels;
    if (!Array.isArray(chans) || chans.length === 0) {
      errors.push("setterTouch: at least one channel is required");
    } else {
      for (const c of chans) {
        if (!CHANNELS.includes(c as Channel)) {
          errors.push(`setterTouch: "${c}" is not a channel we know`);
        } else if (c !== "call" && c !== "sms") {
          // Honest rather than silently empty: the ingestion cannot see these
          // yet, so a metric built on them would read zero and look like the
          // setters had done nothing.
          warnings.push(
            `We can't read ${c} from the CRM yet, so anything measured on it will be empty.`,
          );
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function validateBusinessHours(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (raw == null) return { ok: true, errors, warnings: [] };
  const h = raw as Record<string, any>;
  if (typeof h.timezone !== "string" || !h.timezone)
    errors.push("businessHours: timezone required");
  if (!Array.isArray(h.days) || h.days.some((d: any) => d < 0 || d > 6))
    errors.push("businessHours: days must be 0-6");
  for (const f of ["startHour", "endHour"] as const) {
    if (typeof h[f] !== "number" || h[f] < 0 || h[f] > 24)
      errors.push(`businessHours: ${f} must be 0-24`);
  }
  if (errors.length === 0 && h.startHour >= h.endHour)
    errors.push("businessHours: startHour must be before endHour");
  return { ok: errors.length === 0, errors, warnings: [] };
}
