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
      meetingHeld: {
        kind: "crm_status",
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
export function elapsedWorkingMs(
  startMs: number,
  endMs: number,
  hours: BusinessHours | null,
): number {
  if (endMs <= startMs) return 0;
  if (!hours) return endMs - startMs;

  let total = 0;
  // Walk hour by hour. Coarser than exact interval arithmetic and far easier to
  // verify by hand, which matters more here — a speed metric nobody can check
  // is a speed metric nobody believes.
  const HOUR = 3_600_000;
  for (let t = startMs; t < endMs; t += HOUR) {
    const slice = Math.min(HOUR, endMs - t);
    if (isWorking(t, hours)) total += slice;
  }
  return total;
}

function isWorking(ms: number, hours: BusinessHours): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: hours.timezone,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date(ms));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    weekday,
  );
  if (dayIndex < 0 || !hours.days.includes(dayIndex)) return false;
  return hour >= hours.startHour && hour < hours.endHour;
}
