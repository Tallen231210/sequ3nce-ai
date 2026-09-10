// ============================================================================
// The one list of EOD fields, per form shape. Both forms (the signed-in
// setter app and the legacy tokenized page) render from this, so a field
// added here shows up everywhere — the old way was two hand-copied arrays
// that were already one edit away from disagreeing.
//
// "booking" is a booking setter's day: dials and sets. "confirmation" is the
// confirmation setter's day (E2's Sophie): leads who booked themselves
// through the funnel, and what she did about them.
// ============================================================================

export type EodShape = "booking" | "confirmation";

export interface EodField {
  key: string;
  label: string;
  hint: string;
  /** Stored as optional: a blank box means "not reporting", not zero. */
  optional: boolean;
  /** Prefilled from the calendar and CRM for the confirmation setter. */
  measured?: boolean;
}

export const BOOKING_FIELDS: EodField[] = [
  { key: "dials", label: "Dials", hint: "phone call attempts that day — every attempt counts, incl. no-answers — prefilled from Close", optional: false, measured: true },
  { key: "pickUps", label: "Pick ups", hint: "dials where a human answered and you spoke — prefilled from Close (calls someone answered)", optional: false, measured: true },
  { key: "sets", label: "Sets", hint: "new sales calls you booked that day — prospect committed, time locked in — prefilled from the calendar", optional: false, measured: true },
  { key: "newLeadsHit", label: "New leads hit", hint: "brand-new leads you contacted for the first time that day", optional: false },
  { key: "followUps", label: "Follow ups", hint: "existing leads you re-contacted that day", optional: false },
  { key: "callsOnCalendar", label: "Calls on the calendar", hint: "first consults from YOUR sets that were scheduled for that day — prefilled", optional: true, measured: true },
  { key: "callsShown", label: "Calls shown", hint: "of those, how many showed — follow-ups / second calls don't count — prefilled where we know", optional: true, measured: true },
  { key: "callsClosed", label: "Calls closed", hint: "deals from YOUR sets that closed that day — follow-up closes count", optional: true },
  { key: "cashCollected", label: "Cash collected ($)", hint: "cash collected that day from your sets' deals — later payments count", optional: true },
];

export const CONFIRMATION_FIELDS: EodField[] = [
  { key: "newSelfBooked", label: "New self-booked calls", hint: "people who booked themselves through the funnel that day — prefilled from the calendar", optional: false, measured: true },
  { key: "contacted", label: "Contacted", hint: "of those, how many you called or texted — prefilled from Close", optional: true, measured: true },
  { key: "reached", label: "Reached", hint: "of those, how many you actually spoke to, or who replied", optional: true, measured: true },
  { key: "confirmed", label: "Confirmed", hint: "said yes, they'll be there", optional: true },
  { key: "rescheduled", label: "Rescheduled", hint: "moved to another time — still alive", optional: true },
  { key: "cancelled", label: "Cancelled or disqualified", hint: "gone", optional: true },
  { key: "confirmedOnCalendar", label: "Your calls on that day's calendar", hint: "self-booked calls scheduled that day that you had contacted — prefilled", optional: true, measured: true },
  { key: "confirmedShowed", label: "…of those, showed", hint: "how many of them turned up — prefilled where we know", optional: true, measured: true },
];


export function shapeForRole(role: string | undefined | null): EodShape {
  return role === "confirmation" ? "confirmation" : "booking";
}

export function fieldsForShape(shape: EodShape): EodField[] {
  return shape === "confirmation" ? CONFIRMATION_FIELDS : BOOKING_FIELDS;
}
