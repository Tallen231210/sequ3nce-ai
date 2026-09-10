// ============================================================================
// The one gate every Setters-page query goes through: a manager of a team
// with the setter_teams flag, a sane range clamped to the engine's window.
// ============================================================================

import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { getLocalDateRangeUtc } from "./setterDataNotifications";
import { resolveAuthUser } from "./setterGhlOauth";
import { MAX_TEAM_RANGE_DAYS, MAX_TEAM_RANGE_MS } from "./setterTeamBookings";
import { teamHasSetterTeams } from "./setterTeamQueries";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Widest window a caller may ask for; longer ranges are clamped to their most recent days. */
const MAX_WINDOW_MS = 400 * DAY_MS;

export interface SettersPageAccess {
  teamId: Id<"teams">;
  team: Doc<"teams">;
  timezone: string;
  startMs: number;
  endMs: number;
  nowMs: number;
  rangeClampedToDays: number | undefined;
}

/** Null means "nothing to show": not a manager, no flag, or a bad range. */
export async function resolveSettersPageAccess(
  ctx: QueryCtx,
  clerkId: string,
  rangeStart: number,
  rangeEnd: number,
): Promise<SettersPageAccess | null> {
  const user = await resolveAuthUser(ctx, clerkId);
  if (!user?.teamId) return null;
  if (user.role !== "admin" && user.role !== "manager") return null;
  const teamId = user.teamId as Id<"teams">;
  const team = await ctx.db.get(teamId);
  if (!team || !teamHasSetterTeams(team)) return null;
  if (
    !Number.isFinite(rangeStart) ||
    !Number.isFinite(rangeEnd) ||
    rangeEnd <= rangeStart ||
    rangeEnd - rangeStart > MAX_WINDOW_MS
  ) {
    return null;
  }
  const nowMs = Date.now();
  const timezone = (team as { timezone?: string }).timezone || DEFAULT_TIMEZONE;
  const endMs = Math.min(rangeEnd, nowMs + 7 * DAY_MS);
  const clampedStart = Math.max(rangeStart, endMs - MAX_TEAM_RANGE_MS);
  // Whole team-local days. The pickers hand us "now minus N days", and an
  // EOD filed for the first day covers all of it — so the measured side
  // must start at that day's local midnight or the first day reads short.
  const startMs = getLocalDateRangeUtc(dayKeyInTz(clampedStart, timezone), timezone).startMs;
  return {
    teamId,
    team,
    timezone,
    startMs,
    endMs,
    nowMs,
    rangeClampedToDays: clampedStart > rangeStart ? MAX_TEAM_RANGE_DAYS : undefined,
  };
}
