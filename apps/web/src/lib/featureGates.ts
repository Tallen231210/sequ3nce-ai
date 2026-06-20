/**
 * Feature gates for early-access work that's deployed but not yet
 * generally available. Hides UI from customers while letting the team
 * validate in real prod data.
 *
 * Remove the gate (and this file) once a feature is validated and
 * ready for everyone.
 */

// AICom team — our reference customer for the ROI / Setter Scorecard
// work. Phase 1 + 2 live here only until we've validated, then ship
// everywhere.
const AICOM_TEAM_ID = "js7130cyq6q21d5rt16910p0q580p2dy";

const EARLY_ACCESS_TEAM_IDS = new Set<string>([AICOM_TEAM_ID]);

export function isEarlyAccessTeam(teamId: string | null | undefined): boolean {
  if (!teamId) return false;
  return EARLY_ACCESS_TEAM_IDS.has(teamId);
}
