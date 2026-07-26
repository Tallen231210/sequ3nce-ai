import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import {
  DEFAULT_COMP_PCT,
  DEFAULT_TARGETS,
} from "./closerPerformanceMetrics";
import {
  DEFAULT_CALL_LENGTH_MIN,
  DEFAULT_TIMEZONE,
  monthKeyInTz,
} from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Team Performance configuration — targets, economics, goals, prize.
//
// These fields existed in the schema and were read everywhere from the start,
// but nothing ever wrote them. The result was a board with several permanently
// inert features: the prize card could never appear, the Goal column always
// read "No goal set", the projection had no target to pace against, and the
// Economics card told managers to "add ad spend in settings" — a setting that
// did not exist. This is that write path.
// ============================================================================

function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

/** Rates are percentages; anything outside 1-100 is a typo, not a target. */
function assertPct(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 1 || value > 100) {
    throw new Error(`${name} must be between 1 and 100`);
  }
}

function assertMoney(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 100_000_000) {
    throw new Error(`${name} must be a positive amount`);
  }
}

export const getConfig = query({
  args: {
    clerkId: v.string(),
    /** Month whose ad spend to return. Defaults to the current month. */
    monthKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const teamId = user.teamId as Id<"teams">;
    const team = await ctx.db.get(teamId);
    if (!team) return null;

    const tz = team.timezone || DEFAULT_TIMEZONE;
    const monthKey =
      args.monthKey && /^\d{4}-\d{2}$/.test(args.monthKey)
        ? args.monthKey
        : monthKeyInTz(Date.now(), tz);

    const [closers, goals] = await Promise.all([
      ctx.db
        .query("closers")
        .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
        .take(500),
      ctx.db
        .query("closerGoals")
        .withIndex("by_team_and_month", (q: any) =>
          q.eq("teamId", teamId).eq("monthKey", monthKey),
        )
        .collect(),
    ]);

    const goalByCloser = new Map(
      goals.map((g) => [String(g.closerId), g.cashGoal]),
    );

    const monthSpend = await ctx.db
      .query("closerAdSpend")
      .withIndex("by_team_and_month", (q: any) =>
        q.eq("teamId", teamId).eq("monthKey", monthKey),
      )
      .first();

    return {
      canEdit: canEdit(user),
      monthKey,
      timezone: tz,
      targets: {
        bookedPct: team.closerBookedPctTarget ?? DEFAULT_TARGETS.bookedPct,
        showPct: team.closerShowPctTarget ?? DEFAULT_TARGETS.showPct,
        offerClosePct:
          team.closerOfferClosePctTarget ?? DEFAULT_TARGETS.offerClosePct,
        closePct: team.closerClosePctTarget ?? DEFAULT_TARGETS.closePct,
      },
      // Nulls rather than defaults: the UI shows an empty box, so a manager can
      // tell "nobody has set this" from "someone chose zero".
      // What this month actually cost, if recorded; otherwise the team's
      // standing figure. The UI needs to know WHICH, so a manager can tell a
      // recorded month from an assumed one.
      adSpendMonthly: monthSpend?.amount ?? team.closerAdSpendMonthly ?? null,
      adSpendIsForThisMonth: !!monthSpend,
      adSpendDefault: team.closerAdSpendMonthly ?? null,
      compPct: team.closerCompPct ?? DEFAULT_COMP_PCT,
      typicalCallLengthMin:
        team.closerTypicalCallLengthMin ?? DEFAULT_CALL_LENGTH_MIN,
      teamCashGoalOverride: team.closerTeamCashGoalOverride ?? null,
      prize: {
        name: team.closerPrizeName ?? null,
        emoji: team.closerPrizeEmoji ?? null,
        target: team.closerPrizeTarget ?? null,
      },
      closers: closers
        .filter((c) => c.status !== "deactivated")
        .map((c) => ({
          closerId: String(c._id),
          name: c.name ?? "Unknown",
          cashGoal: goalByCloser.get(String(c._id)) ?? null,
        })),
      sumRepGoals: goals.reduce((s, g) => s + g.cashGoal, 0),
    };
  },
});

export const updateConfig = mutation({
  args: {
    clerkId: v.string(),
    bookedPctTarget: v.optional(v.number()),
    showPctTarget: v.optional(v.number()),
    offerClosePctTarget: v.optional(v.number()),
    closePctTarget: v.optional(v.number()),
    adSpendMonthly: v.optional(v.union(v.number(), v.null())),
    compPct: v.optional(v.number()),
    typicalCallLengthMin: v.optional(v.number()),
    teamCashGoalOverride: v.optional(v.union(v.number(), v.null())),
    prizeName: v.optional(v.union(v.string(), v.null())),
    prizeEmoji: v.optional(v.union(v.string(), v.null())),
    prizeTarget: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authorised");
    if (!canEdit(user)) {
      throw new Error("Only managers can change these settings");
    }
    const teamId = user.teamId as Id<"teams">;

    // Sparse patch — the UI saves one field at a time, so two quick edits
    // can't clobber each other.
    const patch: Record<string, unknown> = {};

    const pcts: Array<[keyof typeof args, string, string]> = [
      ["bookedPctTarget", "Booked % target", "closerBookedPctTarget"],
      ["showPctTarget", "Show % target", "closerShowPctTarget"],
      ["offerClosePctTarget", "Offer→Close target", "closerOfferClosePctTarget"],
      ["closePctTarget", "Close % target", "closerClosePctTarget"],
    ];
    for (const [arg, label, field] of pcts) {
      const val = args[arg] as number | undefined;
      if (val === undefined) continue;
      assertPct(label, val);
      patch[field] = val;
    }

    if (args.compPct !== undefined) {
      assertPct("Closer commission", args.compPct);
      patch.closerCompPct = args.compPct;
    }
    if (args.adSpendMonthly !== undefined) {
      if (args.adSpendMonthly === null) patch.closerAdSpendMonthly = undefined;
      else {
        assertMoney("Ad spend", args.adSpendMonthly);
        patch.closerAdSpendMonthly = args.adSpendMonthly;
      }
    }
    if (args.teamCashGoalOverride !== undefined) {
      if (args.teamCashGoalOverride === null) {
        patch.closerTeamCashGoalOverride = undefined;
      } else {
        assertMoney("Team cash goal", args.teamCashGoalOverride);
        patch.closerTeamCashGoalOverride = args.teamCashGoalOverride;
      }
    }
    if (args.typicalCallLengthMin !== undefined) {
      const m = args.typicalCallLengthMin;
      // Capacity is derived by dividing open time by this, so a nonsense value
      // silently distorts every Slots figure on the board.
      if (!Number.isInteger(m) || m < 5 || m > 240) {
        throw new Error("Typical call length must be between 5 and 240 minutes");
      }
      patch.closerTypicalCallLengthMin = m;
    }
    if (args.prizeName !== undefined) {
      const n = args.prizeName?.trim();
      if (n && n.length > 80) throw new Error("Prize name is too long");
      patch.closerPrizeName = n || undefined;
    }
    if (args.prizeEmoji !== undefined) {
      const e = args.prizeEmoji?.trim();
      if (e && e.length > 8) throw new Error("Prize emoji is too long");
      patch.closerPrizeEmoji = e || undefined;
    }
    if (args.prizeTarget !== undefined) {
      if (args.prizeTarget === null) patch.closerPrizeTarget = undefined;
      else {
        assertMoney("Prize target", args.prizeTarget);
        patch.closerPrizeTarget = args.prizeTarget;
      }
    }

    await ctx.db.patch(teamId, patch);
    return { success: true };
  },
});

/**
 * Record what was spent on ads in a given month.
 *
 * Editing ad spend while looking at July means "July cost this much", not
 * "change my standing figure" — so the write lands on the month in view.
 * Clearing it falls back to the team default rather than storing a zero,
 * because "not recorded" and "we spent nothing" are different claims.
 */
export const setMonthlyAdSpend = mutation({
  args: {
    clerkId: v.string(),
    monthKey: v.string(),
    amount: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authorised");
    if (!canEdit(user)) throw new Error("Only managers can set ad spend");
    if (!/^\d{4}-\d{2}$/.test(args.monthKey)) throw new Error("Invalid month");
    if (args.amount !== null) assertMoney("Ad spend", args.amount);

    const teamId = user.teamId as Id<"teams">;
    const existing = await ctx.db
      .query("closerAdSpend")
      .withIndex("by_team_and_month", (q: any) =>
        q.eq("teamId", teamId).eq("monthKey", args.monthKey),
      )
      .first();

    if (args.amount === null) {
      if (existing) await ctx.db.delete(existing._id);
      return { cleared: true };
    }
    if (existing) {
      await ctx.db.patch(existing._id, {
        amount: args.amount,
        updatedAt: Date.now(),
        updatedByClerkId: args.clerkId,
      });
    } else {
      await ctx.db.insert("closerAdSpend", {
        teamId,
        monthKey: args.monthKey,
        amount: args.amount,
        updatedAt: Date.now(),
        updatedByClerkId: args.clerkId,
      });
    }
    return { cleared: false };
  },
});

/**
 * Per-closer monthly cash goal. Keyed by month so history stays truthful —
 * the Year view compares each month against the goal set at the time, not
 * whatever today's number happens to be.
 */
export const setCloserGoal = mutation({
  args: {
    clerkId: v.string(),
    closerId: v.id("closers"),
    monthKey: v.optional(v.string()),
    /** null clears the goal. */
    cashGoal: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authorised");
    if (!canEdit(user)) throw new Error("Only managers can set goals");

    const teamId = user.teamId as Id<"teams">;
    const target = await ctx.db.get(args.closerId);
    if (!target || target.teamId !== teamId) {
      throw new Error("Closer not found on your team");
    }

    const team = await ctx.db.get(teamId);
    const tz = team?.timezone || DEFAULT_TIMEZONE;
    const monthKey = args.monthKey ?? monthKeyInTz(Date.now(), tz);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("Invalid month");

    if (args.cashGoal !== null) assertMoney("Cash goal", args.cashGoal);

    const existing = await ctx.db
      .query("closerGoals")
      .withIndex("by_team_month_closer", (q: any) =>
        q
          .eq("teamId", teamId)
          .eq("monthKey", monthKey)
          .eq("closerId", args.closerId),
      )
      .first();

    if (args.cashGoal === null) {
      if (existing) await ctx.db.delete(existing._id);
      return { cleared: true };
    }

    if (existing) {
      await ctx.db.patch(existing._id, { cashGoal: args.cashGoal });
    } else {
      await ctx.db.insert("closerGoals", {
        teamId,
        closerId: args.closerId,
        monthKey,
        cashGoal: args.cashGoal,
        updatedAt: Date.now(),
      });
    }
    return { cleared: false };
  },
});
