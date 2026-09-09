// ============================================================================
// The one definition of a valid EOD entry. Both submit paths — the tokenized
// public form and the signed-in setter app — build their document here, so
// the two can never drift apart on validation or field names.
// ============================================================================

import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { EodShape } from "./setterEodFields";

export const FIELD_MAX = 2000; // beyond this is a typo, not hustle
export const CASH_MAX = 100_000_000; // matches the closer-side ceiling

export interface EodNumbers {
  dials: number;
  pickUps: number;
  sets: number;
  newLeadsHit: number;
  followUps: number;
  callsOnCalendar?: number;
  callsShown?: number;
  callsClosed?: number;
  cashCollected?: number;
  // The confirmation setter's day (formShape "confirmation"); absent otherwise.
  newSelfBooked?: number;
  contacted?: number;
  reached?: number;
  confirmed?: number;
  rescheduled?: number;
  cancelled?: number;
  confirmedOnCalendar?: number;
  confirmedShowed?: number;
  formShape?: EodShape;
}

/** The confirmation setter's fields, as mutation args — both submit paths accept them. */
export const CONFIRMATION_ARGS = {
  newSelfBooked: v.optional(v.number()),
  contacted: v.optional(v.number()),
  reached: v.optional(v.number()),
  confirmed: v.optional(v.number()),
  rescheduled: v.optional(v.number()),
  cancelled: v.optional(v.number()),
  confirmedOnCalendar: v.optional(v.number()),
  confirmedShowed: v.optional(v.number()),
} as const;

/** Same range check for every optional confirmation-day number. */
function checkOptionalCount(label: string, val: number | undefined): void {
  if (val === undefined) return;
  if (!Number.isInteger(val) || val < 0 || val > FIELD_MAX) {
    throw new ConvexError(`Check the ${label} number`);
  }
}

/** The confirmation setter's invariants: reached ≤ contacted ≤ new self-books; showed ≤ on the calendar. */
export function validateConfirmationNumbers(n: EodNumbers): void {
  const labeled: Array<[string, number | undefined]> = [
    ["new self-booked calls", n.newSelfBooked],
    ["contacted", n.contacted],
    ["reached", n.reached],
    ["confirmed", n.confirmed],
    ["rescheduled", n.rescheduled],
    ["cancelled", n.cancelled],
    ["calls on the calendar", n.confirmedOnCalendar],
    ["showed", n.confirmedShowed],
  ];
  for (const [k, val] of labeled) checkOptionalCount(k, val);
  if (n.contacted !== undefined && n.newSelfBooked !== undefined && n.contacted > n.newSelfBooked) {
    throw new ConvexError("Contacted can't be more than the new self-booked calls");
  }
  if (n.reached !== undefined && n.contacted !== undefined && n.reached > n.contacted) {
    throw new ConvexError("Reached can't be more than contacted");
  }
  if (n.confirmedShowed !== undefined && n.confirmedOnCalendar !== undefined && n.confirmedShowed > n.confirmedOnCalendar) {
    throw new ConvexError("Showed can't be more than the calls on the calendar");
  }
}

/** Throws ConvexError with a human message on any bad number. The shape
 *  picks the guards: a confirmation setter's day has different invariants. */
export function validateEodNumbers(n: EodNumbers, shape: EodShape = "booking"): void {
  if (shape === "confirmation") {
    validateConfirmationNumbers(n);
    return;
  }
  const labeled: Array<[string, number | undefined]> = [
    ["dials", n.dials],
    ["pick ups", n.pickUps],
    ["sets", n.sets],
    ["new leads", n.newLeadsHit],
    ["follow ups", n.followUps],
    ["calls on the calendar", n.callsOnCalendar],
    ["calls shown", n.callsShown],
    ["calls closed", n.callsClosed],
  ];
  for (const [k, val] of labeled) {
    if (val === undefined) continue;
    if (!Number.isInteger(val) || val < 0 || val > FIELD_MAX) {
      throw new ConvexError(`Check the ${k} number`);
    }
  }
  if (n.cashCollected !== undefined) {
    if (
      !Number.isInteger(n.cashCollected) ||
      n.cashCollected < 0 ||
      n.cashCollected > CASH_MAX
    ) {
      throw new ConvexError("Check the cash collected number");
    }
  }
  if (n.pickUps > n.dials) {
    throw new ConvexError("Pick ups can't be more than dials");
  }
  // Since 2026-09-01 (defs agreed with the customer): "calls on the
  // calendar" = first-consult appointments from your sets SCHEDULED today,
  // and "calls shown" = of those, how many showed. Same cohort by
  // definition, so shown can no longer exceed on-calendar — earlier the two
  // measured different cohorts and this guard was deliberately absent.
  if (
    n.callsShown !== undefined &&
    n.callsOnCalendar !== undefined &&
    n.callsShown > n.callsOnCalendar
  ) {
    throw new ConvexError(
      "Calls shown can't be more than calls on the calendar — follow-ups and second calls don't count as shown",
    );
  }
  // NO closed<=shown guard: "calls closed" counts deals from this setter's
  // sets that closed TODAY — including closes that happened on a closer's
  // follow-up call. A follow-up close on a day with one show is honest
  // (2 closed, 1 shown). Same for cashCollected: installments from earlier
  // closes land whenever they land.
}

export function buildEodDoc(
  teamId: Id<"teams">,
  rosterId: Id<"setterRoster">,
  dayKey: string,
  n: EodNumbers,
  note: string | undefined,
) {
  return {
    teamId,
    rosterId,
    dayKey,
    dials: n.dials,
    pickUps: n.pickUps,
    sets: n.sets,
    newLeadsHit: n.newLeadsHit,
    followUps: n.followUps,
    callsOnCalendar: n.callsOnCalendar,
    callsShown: n.callsShown,
    callsClosed: n.callsClosed,
    cashCollected: n.cashCollected,
    // Every field the table knows must be copied here: both submit paths
    // REPLACE the day's document with this, so anything missing is deleted.
    newSelfBooked: n.newSelfBooked,
    contacted: n.contacted,
    reached: n.reached,
    confirmed: n.confirmed,
    rescheduled: n.rescheduled,
    cancelled: n.cancelled,
    confirmedOnCalendar: n.confirmedOnCalendar,
    confirmedShowed: n.confirmedShowed,
    formShape: n.formShape,
    note: note?.trim().slice(0, 500) || undefined,
    submittedAt: Date.now(),
  };
}
