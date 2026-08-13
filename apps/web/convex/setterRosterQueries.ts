// ============================================================================
// Small read used by the roster's name-resolution action.
//
// Separate file because setterRosterResolve.ts runs in Node (it makes HTTP
// calls) and this has to run in the normal query runtime.
// ============================================================================

import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";

/* eslint-disable @typescript-eslint/no-explicit-any */

const LOOKBACK_DAYS = 90;

/**
 * The user ids doing work on this manager's team that we can't put a name to.
 *
 * Derived server-side from observed activity rather than accepted from the
 * client, so a caller can never point the lookup at ids that aren't theirs.
 */
export const unnamedActorsForUser = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return { ok: false, reason: "Not authorised." };
    if (user.role !== "admin" && user.role !== "manager") {
      return { ok: false, reason: "Only managers can do that." };
    }
    const teamId = user.teamId as Id<"teams">;
    const since = Date.now() - LOOKBACK_DAYS * 86_400_000;

    const reps = await ctx.db
      .query("setterReps")
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .take(500);
    const known = new Set(
      (reps as any[]).filter((r) => r.name).map((r) => r.ghlUserId),
    );

    const unnamed = new Set<string>();
    for (const eventType of ["dial_outbound", "sms_outbound"]) {
      const rows = await ctx.db
        .query("setterLeadEvents")
        .withIndex("by_team_and_type_and_time", (q: any) =>
          q.eq("teamId", teamId).eq("eventType", eventType).gte("occurredAt", since),
        )
        .take(12_000);
      for (const e of rows as any[]) {
        if (e.ghlUserId && !known.has(e.ghlUserId)) unnamed.add(e.ghlUserId);
      }
    }
    // Bounded: one HTTP call each, and a team with hundreds of unknown actors
    // has a bigger problem than naming them.
    return { ok: true, teamId, userIds: [...unnamed].slice(0, 40) };
  },
});
