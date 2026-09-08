// ============================================================================
// Reading a team's calendar color rulebook.
//
// E2 (Zion) colors every booking twice. Before the call the color says how
// confident they are the prospect shows up; after the call the closer
// recolors it to what happened. Google stores one color per event and no
// history, so the same red means "never confirmed" on Monday morning and
// "no-show" on Monday night. The only honest way to tell a post-call recolor
// from a pre-call color left as it was is to have watched the change happen —
// which is what calendarEvents.colorChangedAt records (set by the sync when
// the color differs from the previous sync; see googleCalendar.ts).
//
// Google's own `updated` stamp is NOT that evidence: it bumps on RSVPs,
// description rewrites and Meet links being attached, so "updated after the
// call" proves nothing. It is used here in one direction only — an event last
// modified BEFORE its start cannot have been recolored after it.
//
// Every function is pure. Benched in calendarColorCheckins.ts.
// ============================================================================

/** Google event colorIds, named the way the rulebook names them. */
export const COLOR = {
  LIGHT_GREEN: "2", // Sage
  YELLOW: "5", // Banana
  ORANGE: "6", // Tangerine
  BLUE: "7", // Peacock — the blue this team actually uses
  DARK_GREEN: "10", // Basil
  RED: "11", // Tomato
} as const;

/** After the call every booking must end as one of these (Zion, 2026-09-08). */
export const POST_CALL_COLORS: ReadonlySet<string> = new Set([
  COLOR.DARK_GREEN,
  COLOR.RED,
  COLOR.YELLOW,
]);

/** How long after the booking's end we wait before calling it "due". */
export const RECOLOR_GRACE_MS = 2 * 60 * 60 * 1000;

/** What a color means in plain words, before and after the call. */
export function colorMeaning(
  colorId: string | undefined,
  phase: "pre" | "post",
): string {
  if (phase === "post") {
    if (colorId === COLOR.DARK_GREEN) return "showed";
    if (colorId === COLOR.RED) return "no-show";
    if (colorId === COLOR.YELLOW) return "rescheduled";
  }
  if (colorId === undefined) return "uncolored";
  if (colorId === COLOR.RED) return "unconfirmed";
  if (colorId === COLOR.YELLOW) return "confirmed by message";
  if (colorId === COLOR.LIGHT_GREEN) return "confirmed";
  if (colorId === COLOR.DARK_GREEN) return "dark green";
  if (colorId === COLOR.ORANGE) return "follow-up";
  if (colorId === COLOR.BLUE) return "DM booking";
  return "other color";
}

/** The fields of a calendar event the recolor rule looks at. */
export interface ColorTrackedEvent {
  startTime: number;
  endTime: number;
  eventColorId?: string;
  googleUpdatedAt?: number;
  colorFirstObservedAt?: number;
  colorChangedAt?: number;
}

export type RecolorState =
  /** Call not over yet (end + grace still ahead). */
  | "not_due"
  /** Post-call color, and we watched it change after the call started. */
  | "done"
  /**
   * Post-call color, no transition observed, first seen after the call
   * started — backfilled or pre-deploy. Could be either; not a miss.
   */
  | "unverified"
  /**
   * Post-call color that provably predates the call (first seen before the
   * start, or Google last-modified before the start) and never changed since.
   * The closer left the pre-call color in place.
   */
  | "pre_colored_untouched"
  | "uncolored"
  | "left_light_green"
  /** Orange, blue, lavender… on a booking whose call is over. */
  | "other_color";

/** Has the closer recolored this booking after its call? */
export function recolorState(ev: ColorTrackedEvent, nowMs: number): RecolorState {
  if (nowMs < ev.endTime + RECOLOR_GRACE_MS) return "not_due";

  const color = ev.eventColorId;
  if (color === undefined) return "uncolored";
  if (!POST_CALL_COLORS.has(color)) {
    return color === COLOR.LIGHT_GREEN ? "left_light_green" : "other_color";
  }

  // A post-call color. Did we see it arrive after the call started?
  if (ev.colorChangedAt !== undefined && ev.colorChangedAt > ev.startTime) {
    return "done";
  }
  // No observed transition. If the color provably predates the call, the
  // closer never came back to it.
  const seenBeforeStart =
    ev.colorFirstObservedAt !== undefined && ev.colorFirstObservedAt <= ev.startTime;
  const modifiedBeforeStart =
    ev.googleUpdatedAt !== undefined && ev.googleUpdatedAt <= ev.startTime;
  if (seenBeforeStart || modifiedBeforeStart) return "pre_colored_untouched";
  return "unverified";
}

/** States that count as a miss on the check-ins card. */
export function needsRecolor(state: RecolorState): boolean {
  return (
    state === "uncolored" ||
    state === "left_light_green" ||
    state === "other_color" ||
    state === "pre_colored_untouched"
  );
}

/** Short, plain-words label for a pending state, for tooltips and posts. */
export function recolorStateLabel(
  state: RecolorState,
  colorId: string | undefined,
): string {
  switch (state) {
    case "uncolored":
      return "uncolored";
    case "left_light_green":
      return "left light green";
    case "other_color":
      return `left ${colorMeaning(colorId, "pre")}`;
    case "pre_colored_untouched":
      return `${colorMeaning(colorId, "post")} — set before the call`;
    case "unverified":
      return `${colorMeaning(colorId, "post")} — can't verify when`;
    case "done":
      return colorMeaning(colorId, "post");
    case "not_due":
      return "not due yet";
  }
}
