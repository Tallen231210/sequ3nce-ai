// ============================================================================
// The one definition of a valid EOD entry. Both submit paths — the tokenized
// public form and the signed-in setter app — build their document here, so
// the two can never drift apart on validation or field names.
// ============================================================================

import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const FIELD_MAX = 2000; // beyond this is a typo, not hustle

export interface EodNumbers {
  dials: number;
  pickUps: number;
  sets: number;
  newLeadsHit: number;
  followUps: number;
  callsOnCalendar?: number;
  callsShown?: number;
  callsClosed?: number;
}

/** Throws ConvexError with a human message on any bad number. */
export function validateEodNumbers(n: EodNumbers): void {
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
  if (
    n.callsClosed !== undefined &&
    n.callsShown !== undefined &&
    n.callsClosed > n.callsShown
  ) {
    throw new ConvexError("Calls closed can't be more than calls shown");
  }
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
    note: note?.trim().slice(0, 500) || undefined,
    submittedAt: Date.now(),
  };
}
