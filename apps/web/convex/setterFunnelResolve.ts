// ============================================================================
// Which funnel definition applies, and what to do when there isn't one.
//
// This file is what makes the rebuild safe to land. Every existing team keeps
// behaving exactly as it does today until somebody deliberately configures a
// funnel for them, because when no definition exists we synthesise the one the
// old code always assumed: a lead is a CRM contact, a touch is a dial or a
// text, credit goes to the assigned owner.
//
// So "no funnel configured" is not a broken state to guard against. It is the
// current product, expressed in the new vocabulary — which is why the
// no-regression diff can pass before a single team is migrated.
// ============================================================================

import type { Doc } from "./_generated/dataModel";
import type { FunnelBindings, BusinessHours } from "./setterFunnelTypes";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ResolvedFunnel {
  /** Null when synthesised from legacy behaviour rather than configured. */
  funnelId: string | null;
  name: string;
  bindings: FunnelBindings;
  businessHours: BusinessHours | null;
  version: number;
  /**
   * True when this came from a real, approved definition. Drives the UI's
   * honesty: a metric derived from assumptions should not look as confident as
   * one derived from a definition a human agreed to.
   */
  configured: boolean;
  /**
   * Carried through unchanged. The old code suppresses per-setter set rate on
   * self-book funnels (setterDataMetrics.ts:696) and that judgement is correct
   * — it is preserved here rather than reimplemented.
   */
  legacyFlowType: string;
}

/**
 * The funnel the product has always assumed.
 *
 * Marked `manual` with evidence 1 rather than `detected` with evidence 0 —
 * these bindings aren't a guess from an empty sample, they're the documented
 * behaviour of the code that has been running for months.
 */
export function legacyFunnel(team: Doc<"teams"> | null): ResolvedFunnel {
  const flow = resolveLegacyFlowType(team);
  return {
    funnelId: null,
    name: "Default",
    configured: false,
    version: 0,
    legacyFlowType: flow,
    businessHours: null,
    bindings: {
      leadArrived: {
        kind: "crm_contact_created",
        source: "manual",
        evidenceCount: 1,
      },
      setterTouch: {
        kind: "outbound_attempt",
        source: "manual",
        evidenceCount: 1,
        // Exactly what the ingestion records today, and therefore exactly what
        // every current metric counts.
        params: { channels: ["call", "sms"], countAutomated: true },
      },
      setterAttribution: {
        // Owner if the CRM has one, else whoever dialled first — the fallback
        // setterDataMetrics.ts already applies (`assignedTo ?? firstDialByUserId`).
        kind: "assigned_owner",
        source: "manual",
        evidenceCount: 1,
      },
      meetingBooked: {
        // The current product computes bookings for every team, from GHL
        // appointments or from connected calendars (setterDataMetrics.ts has a
        // path for each). Leaving this slot out was my mistake, and it blocked
        // set rate, show rate and time-to-book on teams that have had booking
        // data all along.
        kind: "crm_or_calendar",
        source: "manual",
        evidenceCount: 1,
      },
      meetingHeld: {
        kind: "crm_status",
        source: "manual",
        evidenceCount: 1,
      },
      conversationStarted: {
        // A call past the team's connection threshold — already how the product
        // decides a dial actually reached someone.
        kind: "call_over_threshold",
        source: "manual",
        evidenceCount: 1,
      },
    },
  };
}

/**
 * The working week we assume until a business tells us theirs.
 *
 * 9–5, Monday to Friday, in the team's own timezone. A guess, but a far better
 * one than "the clock never stops" — and the working-hours metric says which
 * hours it used, so a manager can correct it the moment it looks wrong rather
 * than quietly distrusting the number.
 */
export function defaultBusinessHours(team: Doc<"teams"> | null): BusinessHours {
  return {
    timezone: (team as any)?.timezone || "America/New_York",
    days: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 17,
  };
}

/**
 * The hours to use for working-time metrics: the configured week if there is
 * one, otherwise the assumed one. Never null — a metric called "working hours"
 * that silently measured around the clock would be worse than not having it.
 */
export function workingHoursFor(
  funnel: ResolvedFunnel,
  team: Doc<"teams"> | null,
): BusinessHours {
  return funnel.businessHours ?? defaultBusinessHours(team);
}

/**
 * Override beats detection beats unknown.
 *
 * Lifted from `resolveFlowType` in setterDataMetrics.ts so the two cannot drift
 * apart while both are live.
 */
export function resolveLegacyFlowType(team: Doc<"teams"> | null): string {
  if (!team) return "unknown";
  const override = (team as any).setterBookingFlowOverride;
  if (override && override !== "auto") return override;
  return (team as any).setterBookingFlowDetected ?? "unknown";
}

/**
 * Turn a stored row into a resolved funnel.
 *
 * An inactive or unapproved row is treated as absent. Half-finished setup must
 * never quietly start driving a customer's numbers — the failure we are
 * designing against is confident wrongness, not missing data.
 */
export function fromRow(
  row: Doc<"setterFunnels"> | null,
  team: Doc<"teams"> | null,
): ResolvedFunnel {
  if (!row || !row.active || !row.approvedAt) return legacyFunnel(team);
  return {
    funnelId: String(row._id),
    name: row.name,
    configured: true,
    version: row.version,
    legacyFlowType: resolveLegacyFlowType(team),
    bindings: row.bindings as FunnelBindings,
    businessHours: (row.businessHours as BusinessHours) ?? null,
  };
}

/**
 * Is this user one of the business's setters?
 *
 * Defaults to yes for everyone, which is what the product does today and what
 * keeps existing numbers unchanged. It is also, on real data, wrong: on one
 * live team thirteen user ids made outbound touches in thirty days against two
 * or three actual setters — the manager, a support account and eight departed
 * or unknown users among them.
 *
 * A null user is automation and is never a setter.
 */
export function isSetter(f: ResolvedFunnel, userId: string | null): boolean {
  if (!userId) return false;
  const roster = (f.bindings as any).setterRoster;
  if (!roster || roster.kind === "all_crm_users") return true;
  if (roster.kind === "explicit_list") {
    return (roster.params?.userIds ?? []).includes(userId);
  }
  return true; // crm_role is resolved upstream when the roster is built
}

/** Does this funnel count a touch on this channel? */
export function countsChannel(f: ResolvedFunnel, channel: string): boolean {
  const chans = f.bindings.setterTouch?.params?.channels;
  if (!chans || chans.length === 0) return channel === "call" || channel === "sms";
  return chans.includes(channel as any);
}

/**
 * Minutes of working time between two instants.
 *
 * Without this a lead arriving 11pm Friday and answered 9am Monday reads as a
 * 58-hour failure and makes a competent team look negligent. With no business
 * hours configured this is plain elapsed time, which is what every current
 * metric already reports — so behaviour is unchanged until someone says
 * otherwise.
 */
/**
 * Formatters are expensive; make one per timezone, not one per hour.
 *
 * The first version built an Intl.DateTimeFormat inside the hour loop. With
 * business hours configured on a real team that is roughly a hundred thousand
 * constructions per request, and it blew Convex's one-second query limit the
 * moment a funnel went live. The metric was correct and unusable.
 */
const TZ_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timezone: string): Intl.DateTimeFormat {
  let f = TZ_FORMATTERS.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      hour12: false,
    });
    TZ_FORMATTERS.set(timezone, f);
  }
  return f;
}

const DAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * Minutes of working time between two instants.
 *
 * Without this a lead arriving 11pm Friday and answered 9am Monday reads as a
 * 58-hour failure and makes a competent team look negligent. With no business
 * hours configured this is plain elapsed time, which is what every current
 * metric already reports — so behaviour is unchanged until someone says
 * otherwise.
 *
 * Walks hour by hour rather than doing interval arithmetic: coarser, but easy
 * to verify by hand, and a speed metric nobody can check is one nobody believes.
 * Long gaps are capped — a lead untouched for three months contributes its
 * working hours up to the cap rather than spending the request counting them.
 */
export function elapsedWorkingMs(
  startMs: number,
  endMs: number,
  hours: BusinessHours | null,
): number {
  if (endMs <= startMs) return 0;
  if (!hours) return endMs - startMs;

  const HOUR = 3_600_000;
  // 60 days of hours. Beyond this the answer is "they never got to it", and the
  // precise figure changes no decision.
  const MAX_STEPS = 24 * 60;

  const fmt = formatterFor(hours.timezone);
  const days = new Set(hours.days);
  let total = 0;
  let steps = 0;

  for (let t = startMs; t < endMs && steps < MAX_STEPS; t += HOUR, steps++) {
    const slice = Math.min(HOUR, endMs - t);
    const parts = fmt.formatToParts(new Date(t));
    let weekday = "";
    let hour = 0;
    for (const p of parts) {
      if (p.type === "weekday") weekday = p.value;
      else if (p.type === "hour") hour = Number(p.value);
    }
    const day = DAY_INDEX[weekday];
    if (day === undefined || !days.has(day)) continue;
    if (hour >= hours.startHour && hour < hours.endHour) total += slice;
  }
  return total;
}
