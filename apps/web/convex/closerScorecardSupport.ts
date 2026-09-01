/**
 * Closer Scorecard — supporting endpoints (settings, EOD filing status,
 * matcher bench). Split from closerScorecard.ts so the range query file
 * stays readable; see that file's header for what this feature is and is
 * NOT (the Slack daily post lives in closerScorecardData/Settings).
 */
import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isFollowUpTitle } from "./lib/followUpTitle";
import { resolveAuthUser } from "./setterGhlOauth";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

/**
 * Who has filed their EOD TODAY, by name — Zion's explicit ask: the old
 * board made this hard to read. Today is roster-based (every active closer
 * either has filed or hasn't yet — no "expected" guessing while the day is
 * still running). Yesterday is measured-based, the eodNudge rule: a closer
 * with no recorded activity didn't "miss" anything.
 */
export const getEodFilingStatus = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const todayKey = dayKeyInTz(Date.now(), tz);
    const yesterdayKey = dayKeyInTz(Date.now() - 86_400_000, tz);

    const closers = await ctx.db
      .query("closers")
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .take(500);
    const active = closers.filter((c: any) => c.status !== "deactivated");

    const [entriesToday, entriesYesterday, statsYesterday] = await Promise.all([
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).eq("dayKey", todayKey),
        )
        .collect(),
      ctx.db
        .query("closerDailyEntries")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).eq("dayKey", yesterdayKey),
        )
        .collect(),
      ctx.db
        .query("closerDailyStats")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", teamId).eq("dayKey", yesterdayKey),
        )
        .collect(),
    ]);

    const todayBy = new Map(entriesToday.map((e: any) => [String(e.closerId), e]));
    const yesterdayBy = new Map(
      entriesYesterday.map((e: any) => [String(e.closerId), e]),
    );
    const workedYesterday = new Set(
      statsYesterday
        .filter((s: any) => (s.booked ?? 0) > 0 || (s.taken ?? 0) > 0)
        .map((s: any) => String(s.closerId)),
    );

    const filedToday: Array<{ name: string; at: number }> = [];
    const notYetToday: string[] = [];
    const missedYesterday: string[] = [];
    const filedYesterday: string[] = [];
    for (const c of active) {
      const name = (c as any).name ?? "Unnamed";
      const t = todayBy.get(String(c._id)) as any;
      if (t) filedToday.push({ name, at: t.confirmedAt });
      else notYetToday.push(name);
      if (yesterdayBy.has(String(c._id))) filedYesterday.push(name);
      else if (workedYesterday.has(String(c._id))) missedYesterday.push(name);
    }
    filedToday.sort((a, b) => a.at - b.at);
    notYetToday.sort();
    missedYesterday.sort();
    filedYesterday.sort();

    return {
      todayKey,
      yesterdayKey,
      filedToday,
      notYetToday,
      filedYesterday,
      missedYesterday,
    };
  },
});

/** Zion-editable scorecard settings, sparse-patched onto the team doc. */
export const updateCloserScorecardSettings = mutation({
  args: {
    clerkId: v.string(),
    /** 1–3 package prices, lowest first. Null clears (hides tier inputs). */
    tierPrices: v.optional(v.union(v.array(v.number()), v.null())),
    costPerBookedCall: v.optional(v.union(v.number(), v.null())),
    targetCdpbc: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not authorised");
    if (!canEdit(user)) {
      throw new ConvexError("Only managers can change scorecard settings");
    }

    const patch: Record<string, unknown> = {};
    if (args.tierPrices !== undefined) {
      if (args.tierPrices === null) patch.closerTierPrices = undefined;
      else {
        if (args.tierPrices.length < 1 || args.tierPrices.length > 3) {
          throw new ConvexError("Set between one and three tier prices");
        }
        for (const p of args.tierPrices) {
          if (!Number.isFinite(p) || p < 1 || p > 1_000_000) {
            throw new ConvexError("Tier prices must be between $1 and $1,000,000");
          }
        }
        patch.closerTierPrices = args.tierPrices.map((p) => Math.round(p));
      }
    }
    if (args.costPerBookedCall !== undefined) {
      if (args.costPerBookedCall === null) patch.closerCostPerBookedCall = undefined;
      else if (
        !Number.isFinite(args.costPerBookedCall) ||
        args.costPerBookedCall < 0 ||
        args.costPerBookedCall > 100_000
      ) {
        throw new ConvexError("Cost per booked call must be between $0 and $100,000");
      } else patch.closerCostPerBookedCall = args.costPerBookedCall;
    }
    if (args.targetCdpbc !== undefined) {
      if (args.targetCdpbc === null) patch.closerTargetCdpbc = undefined;
      else if (
        !Number.isFinite(args.targetCdpbc) ||
        args.targetCdpbc < 0 ||
        args.targetCdpbc > 1_000_000
      ) {
        throw new ConvexError("Target CDPBC must be between $0 and $1,000,000");
      } else patch.closerTargetCdpbc = args.targetCdpbc;
    }

    if (Object.keys(patch).length === 0) return { saved: false };
    await ctx.db.patch(user.teamId as Id<"teams">, patch);
    return { saved: true };
  },
});

/** CLI bench for the follow-up matcher (repo convention: unit tests are
 * internalQuery benches — npx convex run --prod closerScorecardSupport:followUpTitleBench '{}'). */
export const followUpTitleBench = internalQuery({
  args: {},
  handler: async () => {
    const cases: Array<{ title: string; expect: boolean }> = [
      { title: "Follow up - John x Ethan", expect: true },
      { title: "(er) Follow-up call", expect: true },
      { title: "followup w/ John", expect: true },
      { title: "FOLLOW UP: payment", expect: true },
      { title: "John Follow    up", expect: true }, // any run of spaces/hyphens
      { title: "Canceled: follow-up with Sam", expect: true }, // anywhere in title
      { title: "(er) John x Ethan", expect: false },
      { title: "FU John", expect: false },
      { title: "Fellowship onboarding", expect: false },
      { title: "Following up next steps doc", expect: false }, // "following" ≠ "follow up"
      { title: "", expect: false },
    ];
    const results = cases.map((c) => ({
      title: c.title,
      got: isFollowUpTitle(c.title),
      pass: isFollowUpTitle(c.title) === c.expect,
    }));
    return { allPass: results.every((r) => r.pass), results };
  },
});
