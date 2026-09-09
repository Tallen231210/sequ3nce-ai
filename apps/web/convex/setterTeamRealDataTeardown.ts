// ============================================================================
// Teardown for the setter-teams rehearsal fixture (dev only). Refuses to run
// on production or on any team without the fixture marker — see
// lib/fixtureGuard. Deletes everything the seed functions inserted.
//   npx convex run setterTeamRealDataTeardown:teardown '{"teamId":"..."}'
// ============================================================================

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertFixtureTeam } from "./lib/fixtureGuard";

const P = "st-"; // fixture uid / email prefix, same as the probe

export const teardown = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const teamId = args.teamId as Id<"teams">;
    await assertFixtureTeam(ctx, teamId);
    const counts: Record<string, number> = {};
    const wipe = async (table: string, rows: Array<{ _id: Id<any> }>) => {
      for (const r of rows) await ctx.db.delete(r._id);
      counts[table] = (counts[table] ?? 0) + rows.length;
    };
    await wipe(
      "calendarEvents",
      await ctx.db.query("calendarEvents").withIndex("by_team_and_time", (q) => q.eq("teamId", teamId)).take(10_000),
    );
    for (const t of ["dial_outbound", "sms_outbound", "sms_inbound", "connected", "call_inbound"] as const) {
      await wipe(
        "setterLeadEvents",
        await ctx.db
          .query("setterLeadEvents")
          .withIndex("by_team_and_type_and_time", (q) => q.eq("teamId", teamId).eq("eventType", t))
          .take(10_000),
      );
    }
    await wipe("setterLeads", await ctx.db.query("setterLeads").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(10_000));
    await wipe("calls", await ctx.db.query("calls").withIndex("by_team_and_date", (q) => q.eq("teamId", teamId)).take(10_000));
    await wipe("setterEodEntries", await ctx.db.query("setterEodEntries").withIndex("by_team_and_day", (q) => q.eq("teamId", teamId)).take(10_000));
    const rosterRows = await ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(1000);
    for (const r of rosterRows) {
      await wipe("setterSessions", await ctx.db.query("setterSessions").withIndex("by_roster", (q) => q.eq("rosterId", r._id)).take(100));
    }
    const managers = (await ctx.db.query("users").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(50)).filter((u) => String(u.email).startsWith(P));
    await wipe("users", managers);
    await wipe("setterRoster", await ctx.db.query("setterRoster").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(1000));
    await wipe("setterReps", await ctx.db.query("setterReps").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(1000));
    await wipe(
      "closerCalendarSubscriptions",
      await ctx.db.query("closerCalendarSubscriptions").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(1000),
    );
    await wipe("closers", await ctx.db.query("closers").withIndex("by_team", (q) => q.eq("teamId", teamId)).take(1000));
    await ctx.db.delete(teamId);
    return counts;
  },
});
