// ============================================================================
// Remote-logout rule. The server keeps a per-account "session epoch"; the app
// holds the value it was given at login. A moved epoch means an admin bumped
// it (rep rotation, support) and this device must sign out.
//
// Pure functions so the rule can be tested without the app.
// ============================================================================

/**
 * True when the server definitively reports an epoch this device must not
 * keep using.
 *
 * - No server value → never. An older backend, or a failed check, must not
 *   sign anyone out (same rule as the subscription poll's network guard).
 * - No stored value → this session predates the feature. It stays signed in
 *   unless an admin has already bumped the account (server > 0): that bump
 *   was an explicit "sign everyone out" and must not be swallowed.
 * - Both known → sign out only when they differ.
 */
export function shouldSignOut(
  stored: number | undefined,
  server: number | undefined,
): boolean {
  if (typeof server !== 'number') return false;
  if (typeof stored !== 'number') return server > 0;
  return stored !== server;
}

/**
 * The epoch to persist after a server check that did NOT sign out: keep what
 * this device holds; a pre-feature session adopts the server's value so a
 * later bump is detected.
 */
export function adoptSessionEpoch(
  stored: number | undefined,
  server: number | undefined,
): number | undefined {
  if (typeof stored === 'number') return stored;
  return typeof server === 'number' ? server : undefined;
}
