// ============================================================================
// Setter-teams rehearsal fixture, part two (dev only): a setter session, a
// manager login and show-verdict evidence on top of the seeded bookings.
// Same guard as the probe: fixture teams only, never production.
//   npx convex run setterTeamRealDataSeedExtras:seedEvidence '{...}'
// ============================================================================

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { assertFixtureTeam } from "./lib/fixtureGuard";

const P = "st-"; // fixture uid / email prefix, same as the probe

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A live setter-app session for one fixture roster row; returns the raw token. */
export const seedSession = internalMutation({
  args: { teamId: v.id("teams"), rosterName: v.string() },
  handler: async (ctx, args) => {
    await assertFixtureTeam(ctx, args.teamId as Id<"teams">);
    const roster = await ctx.db
      .query("setterRoster")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .take(200);
    const row = roster.find((r) => r.name === args.rosterName);
    if (!row) throw new Error(`no roster row named ${args.rosterName}`);
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const now = Date.now();
    await ctx.db.insert("setterSessions", {
      rosterId: row._id,
      teamId: args.teamId,
      tokenHash: await sha256Hex(token),
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1000,
      lastSeenAt: now,
    });
    return { token, rosterId: row._id, role: row.role ?? "booking" };
  },
});

/** A manager on the fixture team, for the clerkId-gated queries. */
export const seedManager = internalMutation({
  args: { teamId: v.id("teams"), clerkId: v.string() },
  handler: async (ctx, args) => {
    await assertFixtureTeam(ctx, args.teamId as Id<"teams">);
    const id = await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: `${P}manager@example.invalid`,
      teamId: args.teamId,
      role: "admin",
      createdAt: Date.now(),
    });
    return { userId: id };
  },
});

/** Recordings linked to fixture bookings, and post-call colours with an observed change. */
export const seedEvidence = internalMutation({
  args: {
    teamId: v.id("teams"),
    rows: v.array(
      v.object({
        uid: v.string(),
        call: v.optional(
          v.object({
            status: v.string(),
            outcome: v.optional(v.string()),
            outcomeSource: v.optional(v.string()),
            prospectJoined: v.optional(v.boolean()),
            duration: v.optional(v.number()),
          }),
        ),
        colorId: v.optional(v.string()),
        /** ms after the booking's start at which the colour was seen to change (0 = before the call). */
        colorChangedAfterStartMs: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await assertFixtureTeam(ctx, args.teamId as Id<"teams">);
    let calls = 0;
    let colours = 0;
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q) => q.eq("teamId", args.teamId))
      .take(10_000);
    for (const r of args.rows) {
      const ev = events.find((e) => e.uid === P + r.uid);
      if (!ev) continue;
      if (r.call) {
        await ctx.db.insert("calls", {
          closerId: ev.closerId,
          teamId: args.teamId,
          calendarEventId: ev._id,
          status: r.call.status,
          outcome: r.call.outcome,
          outcomeSource: r.call.outcomeSource,
          prospectJoined: r.call.prospectJoined,
          duration: r.call.duration,
          speakerCount: r.call.prospectJoined ? 2 : 1,
          startedAt: ev.startTime,
          createdAt: ev.startTime,
          prospectName: `${P}prospect`,
          source: "bot",
        });
        calls += 1;
      }
      if (r.colorId) {
        const changedAt = r.colorChangedAfterStartMs === undefined ? undefined : ev.startTime + r.colorChangedAfterStartMs;
        await ctx.db.patch(ev._id, {
          eventColorId: r.colorId,
          colorFirstObservedAt: ev.startTime - 3 * 24 * 60 * 60 * 1000,
          colorChangedAt: changedAt,
        });
        colours += 1;
      }
    }
    return { calls, colours };
  },
});
