// ============================================================================
// The Setter Data tab's per-team view: DM setters, outbound setters, the
// confirmation setter, and the self-booked leads nobody touched — with the
// evidence behind every booking. Its own query, never bolted onto
// setterData.getOverview, which already brushes the read budget.
// ============================================================================

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { collectTeamBookings, MAX_TEAM_RANGE_DAYS, MAX_TEAM_RANGE_MS } from "./setterTeamBookings";
import { buildSetterTeamsView } from "./setterTeamLanes";

/** Team beta flag that turns the setter-team lanes, Sophie's measured prefill, and data health on. */
export const SETTER_TEAMS_FLAG = "setter_teams";

export function teamHasSetterTeams(team: Doc<"teams"> | null): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flags = ((team as any)?.betaFeatures ?? []) as string[];
  return flags.includes(SETTER_TEAMS_FLAG);
}

/** Widest window the tab may ask for in one read; longer ranges are clamped to their most recent days. */
const MAX_WINDOW_MS = 400 * 24 * 60 * 60 * 1000;

export const getSetterTeams = query({
  args: { clerkId: v.string(), rangeStart: v.number(), rangeEnd: v.number() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    if (user.role !== "admin" && user.role !== "manager") return null;
    const teamId = user.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    if (!teamHasSetterTeams(team)) return null;

    if (
      !Number.isFinite(args.rangeStart) ||
      !Number.isFinite(args.rangeEnd) ||
      args.rangeEnd <= args.rangeStart ||
      args.rangeEnd - args.rangeStart > MAX_WINDOW_MS
    ) {
      return null;
    }
    const nowMs = Date.now();
    const endMs = Math.min(args.rangeEnd, nowMs + 7 * 24 * 60 * 60 * 1000);
    const startMs = Math.max(args.rangeStart, endMs - MAX_TEAM_RANGE_MS);
    const rangeClampedToDays = startMs > args.rangeStart ? MAX_TEAM_RANGE_DAYS : undefined;

    const data = await collectTeamBookings(ctx, teamId, startMs, endMs, nowMs);
    const view = buildSetterTeamsView(data.records, data.rosters);
    return {
      ...view,
      range: { startMs, endMs, timezone: data.timezone },
      rangeClampedToDays,
      truncated: data.truncated,
      cancelled: data.cancelled,
      configured: {
        dmPatterns: team?.setterDmEventNamePatterns ?? [],
        funnelPatterns: team?.setterFunnelEventNamePatterns ?? [],
        rostersWithCrmUser: data.rosters.filter((r) => r.crmUserId).length,
        rosters: data.rosters.length,
      },
    };
  },
});
