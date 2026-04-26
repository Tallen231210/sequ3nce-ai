// Focus-mode state machine for the in-call video layout.
//
// The top slot of the classroom view is determined by `FocusMode`:
//   - `coach`    — default. The coach's tile fills the slot full-width.
//   - `spotlight`— coach picked 1 attendee to replace the coach at top.
//                  Coach drops into the bottom strip.
//   - `role-play`— coach picked 2 attendees to share the top slot (50/50).
//                  Coach drops into the bottom strip. Optional `topic` banner
//                  displays the scenario prompt. Topic is intentionally
//                  free-form (not forced to be an "objection") since coaches
//                  use role plays for many kinds of scenarios.
//
// The `topic` field is transient — it's scoped to the role-play variant, so
// ending role-play by transitioning to `{ kind: 'coach' }` drops the field
// entirely. No "last topic" persistence anywhere.

export type FocusMode =
  | { kind: 'coach' }
  | { kind: 'spotlight'; sessionId: string }
  | { kind: 'role-play'; sessionIds: [string, string]; topic: string };

export const DEFAULT_FOCUS_MODE: FocusMode = { kind: 'coach' };

/** Returns the session IDs that should occupy the top slot. Empty if the
 *  focus target is the coach but no coach session can be resolved yet. */
export function resolveFocusTopIds(
  mode: FocusMode,
  coachSessionId: string | null,
): string[] {
  switch (mode.kind) {
    case 'coach':
      return coachSessionId ? [coachSessionId] : [];
    case 'spotlight':
      return [mode.sessionId];
    case 'role-play':
      return [mode.sessionIds[0], mode.sessionIds[1]];
  }
}

// findCoachSessionId moved to ./CoachingCallRoom/participants.ts so that
// helper can share the userData iterator with buildSpotlightCandidates.
