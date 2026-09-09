// ============================================================================
// Guard for dev-only fixture tooling. Seed and teardown functions delete and
// insert real rows, so two locks: they refuse to run on the production
// deployment at all, and they only touch a team that carries the fixture
// marker seedTeam stamps. Pointing teardown at a client's team throws.
// ============================================================================

import type { Id } from "../_generated/dataModel";

export const FIXTURE_MARK = "st_fixture";
const PRODUCTION_DEPLOYMENT = "ideal-ram-982";

export function assertNotProduction(): void {
  const url = process.env.CONVEX_CLOUD_URL ?? "";
  if (url.includes(PRODUCTION_DEPLOYMENT)) {
    throw new Error("Fixture tooling is disabled on the production deployment");
  }
}

/** Throws unless the team exists and was created by seedTeam. */
export async function assertFixtureTeam(
  ctx: { db: { get: (id: Id<"teams">) => Promise<{ betaFeatures?: string[] } | null> } },
  teamId: Id<"teams">,
): Promise<void> {
  assertNotProduction();
  const team = await ctx.db.get(teamId);
  if (!team || !(team.betaFeatures ?? []).includes(FIXTURE_MARK)) {
    throw new Error(`Team ${String(teamId)} is not a fixture team (no ${FIXTURE_MARK} marker) — refusing`);
  }
}
