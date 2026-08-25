// ============================================================================
// Persisting setter↔call matches: a hook on call completion, a paginated
// backfill, and a CLI bench for the pure matcher (this repo's convention for
// unit tests — run it with `npx convex run`).
// ============================================================================

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  extractSetterToken,
  firstNameOf,
  lastNameOf,
  matchToken,
  type RosterName,
} from "./lib/setterTitleMatch";

const SETTER_APP_FLAG = "setter_eods";

async function activeRosterNames(ctx: any, teamId: Id<"teams">): Promise<RosterName[]> {
  const rows = await ctx.db
    .query("setterRoster")
    .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
    .collect();
  return rows
    .filter((r: any) => r.active === true)
    .map((r: any) => ({
      rosterId: String(r._id),
      firstName: firstNameOf(r.name),
      lastName: lastNameOf(r.name),
    }));
}

function teamHasFlag(team: Doc<"teams"> | null): boolean {
  return !!team && ((team as any).betaFeatures ?? []).includes(SETTER_APP_FLAG);
}

/** Upsert matches for one call. Idempotent — safe from both the completion
 *  hook and the backfill. Skips internal calls; the matcher reads the
 *  call's stored title (prospectName carries the calendar title for bot
 *  calls — "(N) Ai Implementation: Kris/Gresham"). */
export const matchCallForTeam = internalMutation({
  args: { callId: v.id("calls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || call.status !== "completed") return { matched: 0, reason: "not completed" };
    if ((call as any).classifiedAs === "internal") return { matched: 0, reason: "internal" };

    const team = await ctx.db.get(call.teamId);
    if (!teamHasFlag(team)) return { matched: 0, reason: "flag off" };

    const token = extractSetterToken((call as any).prospectName);
    if (!token) return { matched: 0, reason: "no token" };

    const roster = await activeRosterNames(ctx, call.teamId);
    const hits = matchToken(token, roster);
    if (hits.length === 0) return { matched: 0, reason: `token "${token}" matched nobody` };

    const existing = await ctx.db
      .query("setterCallMatches")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
    const already = new Set(existing.map((m) => String(m.rosterId)));
    let created = 0;
    for (const rosterId of hits) {
      if (already.has(rosterId)) continue;
      await ctx.db.insert("setterCallMatches", {
        teamId: call.teamId,
        rosterId: rosterId as Id<"setterRoster">,
        callId: args.callId,
        token,
        matchedAt: (call as any).startedAt ?? call.createdAt,
      });
      created++;
    }
    return { matched: created, token };
  },
});

/** Paginated backfill over a team's recent completed calls. Self-rescheduling
 *  with a Convex cursor — kicked ONCE; kicking twice makes chains OCC-thrash
 *  each other to death. */
export const backfillMatches = internalMutation({
  args: {
    teamId: v.id("teams"),
    sinceDays: v.number(),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const since = Date.now() - args.sinceDays * 86_400_000;
    const page = await ctx.db
      .query("calls")
      .withIndex("by_team_and_date", (q) =>
        q.eq("teamId", args.teamId).gte("createdAt", since),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 50 });

    let considered = 0;
    for (const call of page.page) {
      if (call.status !== "completed") continue;
      considered++;
      await ctx.runMutation(internal.setterCallMatching.matchCallForTeam, {
        callId: call._id,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(500, internal.setterCallMatching.backfillMatches, {
        teamId: args.teamId,
        sinceDays: args.sinceDays,
        cursor: page.continueCursor,
      });
    } else {
      console.log(`[setterCallMatching] backfill complete for ${args.teamId}`);
    }
    return { pageSize: page.page.length, considered, done: page.isDone };
  },
});

/** Census for verification: per-setter match counts + the tokens that
 *  matched nobody (the honest gap list). */
export const matchCensus = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("setterCallMatches")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const roster = await ctx.db
      .query("setterRoster")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const nameOf = new Map(roster.map((r) => [String(r._id), r.name]));
    const perSetter: Record<string, number> = {};
    for (const m of matches) {
      const name = nameOf.get(String(m.rosterId)) ?? "?";
      perSetter[name] = (perSetter[name] ?? 0) + 1;
    }
    return { totalMatches: matches.length, perSetter };
  },
});

/** CLI bench for the pure matcher — the fixed case table from the plan. */
export const setterTitleMatchBench = internalQuery({
  args: {},
  handler: async () => {
    const roster: RosterName[] = [
      { rosterId: "erten", firstName: "Erten", lastName: "Kasimogl" },
      { rosterId: "ethan", firstName: "Ethan", lastName: "Russell" },
      { rosterId: "israel", firstName: "Israel", lastName: "Yanez" },
      { rosterId: "marcus", firstName: "Marcus", lastName: "Hallam" },
      { rosterId: "mo", firstName: "Mo", lastName: "Mash" },
      { rosterId: "noah", firstName: "Noah", lastName: "Vanderlinde" },
      { rosterId: "roane", firstName: "Roane", lastName: "Hutchinson" },
      { rosterId: "sophie", firstName: "Sophie", lastName: "Howell" },
    ];
    const cases: Array<{ title: string; expect: string[] | null }> = [
      { title: "(e) Tim and Karl", expect: ["erten", "ethan"] },
      { title: "(E) Pahresha and Karl", expect: ["erten", "ethan"] },
      { title: "(Mo)Paul X Karl", expect: ["mo"] },
      { title: "(M) Fabian and Joseph", expect: ["marcus", "mo"] },
      { title: "(IY) Ai Implementation Consult", expect: ["israel"] },
      { title: "(ER) Prospect and Ethan", expect: ["erten", "ethan"] },
      { title: "(er) lowercase variant", expect: ["erten", "ethan"] },
      { title: "(MH) Marcus by initials", expect: ["marcus"] },
      { title: "(N) Ai Implementation: Kris/Gresham", expect: ["noah"] },
      { title: "( s ) spaced token", expect: ["sophie"] },
      { title: "Canceled: (e) X", expect: null },
      { title: "Tim and Karl", expect: null },
      { title: "(SOPH) four letters", expect: null },
      { title: "", expect: null },
    ];
    const results = cases.map((c) => {
      const token = extractSetterToken(c.title);
      const got = token === null ? null : matchToken(token, roster);
      const pass =
        c.expect === null
          ? got === null || got.length === 0
          : JSON.stringify(got) === JSON.stringify(c.expect);
      return { title: c.title, token, got, pass };
    });
    return { allPass: results.every((r) => r.pass), results };
  },
});
