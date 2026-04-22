import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

// ==================== Constants ====================

const MAX_TITLE_LENGTH = 80;
const MAX_EMOJI_LENGTH = 8; // Multi-codepoint emoji (flags, skin-tone modifiers)
const MIN_DURATION_MONTHS = 1;
const MAX_DURATION_MONTHS = 36;
const MIN_RATE = 0.0001; // > 0
const MAX_RATE = 1.0; // ≤ 100%
const CRON_SWEEP_LIMIT = 1000;

// ==================== Helpers ====================

function monthsFromNow(months: number, now: number): number {
  const d = new Date(now);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

// ==================== Queries ====================

// Returns the user's active goal with live-computed progress in dollars earned.
// Also returns the most recent terminal goal (if any) so the Dashboard can
// surface a completion/expiration tile on load without a second round-trip.
export const getActiveGoalWithProgress = query({
  args: {
    userId: v.id("b2cUsers"),
    closerId: v.id("closers"),
  },
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query("b2cPersonalGoals")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .first();

    const lastTerminal = await ctx.db
      .query("b2cPersonalGoals")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "completed"),
          q.eq(q.field("status"), "expired")
        )
      )
      .first();

    const settings = await ctx.db
      .query("b2cGoalTrackerSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!active) {
      return {
        goal: null as null,
        earned: 0,
        lastTerminal: lastTerminal ?? null,
        hasCommissionSettings: !!settings,
        commissionMode: settings?.commissionMode ?? null,
        commissionRate: settings?.commissionRate ?? null,
      };
    }

    let earned = 0;
    if (settings) {
      const calls = await ctx.db
        .query("calls")
        .withIndex("by_closer_and_startedAt", (q) =>
          q
            .eq("closerId", args.closerId)
            .gte("startedAt", active.startDate)
            .lte("startedAt", active.endDate)
        )
        .collect();
      earned = calls.reduce((sum, c) => {
        const base =
          settings.commissionMode === "cash"
            ? c.cashCollected ?? 0
            : c.contractValue ?? 0;
        return sum + base * settings.commissionRate;
      }, 0);
    }

    return {
      goal: active,
      earned,
      lastTerminal: lastTerminal ?? null,
      hasCommissionSettings: !!settings,
      commissionMode: settings?.commissionMode ?? null,
      commissionRate: settings?.commissionRate ?? null,
    };
  },
});

export const getCommissionSettings = query({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("b2cGoalTrackerSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

// ==================== Mutations ====================

export const setCommissionSettings = mutation({
  args: {
    userId: v.id("b2cUsers"),
    commissionMode: v.union(v.literal("cash"), v.literal("contract")),
    commissionRate: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.commissionRate < MIN_RATE || args.commissionRate > MAX_RATE) {
      throw new Error("Commission rate must be between 0.01% and 100%");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("b2cGoalTrackerSettings")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        commissionMode: args.commissionMode,
        commissionRate: args.commissionRate,
        updatedAt: now,
      });
      return { id: existing._id, created: false as const };
    }
    const id = await ctx.db.insert("b2cGoalTrackerSettings", {
      userId: args.userId,
      commissionMode: args.commissionMode,
      commissionRate: args.commissionRate,
      createdAt: now,
      updatedAt: now,
    });
    return { id, created: true as const };
  },
});

export const createGoal = mutation({
  args: {
    userId: v.id("b2cUsers"),
    title: v.string(),
    emoji: v.optional(v.string()),
    targetAmount: v.number(),
    durationMonths: v.number(),
  },
  handler: async (ctx, args) => {
    const title = args.title.trim();
    if (title.length === 0) throw new Error("Goal title is required");
    if (title.length > MAX_TITLE_LENGTH) {
      throw new Error(`Title must be ${MAX_TITLE_LENGTH} characters or less`);
    }
    const emoji = args.emoji?.trim();
    if (emoji && emoji.length > MAX_EMOJI_LENGTH) {
      throw new Error("Emoji is invalid");
    }
    if (args.targetAmount <= 0) {
      throw new Error("Target amount must be positive");
    }
    if (
      !Number.isInteger(args.durationMonths) ||
      args.durationMonths < MIN_DURATION_MONTHS ||
      args.durationMonths > MAX_DURATION_MONTHS
    ) {
      throw new Error(
        `Duration must be an integer between ${MIN_DURATION_MONTHS} and ${MAX_DURATION_MONTHS} months`
      );
    }

    // One active goal at a time — forces an intentional "start over" moment
    const existingActive = await ctx.db
      .query("b2cPersonalGoals")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .first();
    if (existingActive) {
      throw new Error(
        "You already have an active goal. Cancel or complete it before creating a new one."
      );
    }

    const now = Date.now();
    const id = await ctx.db.insert("b2cPersonalGoals", {
      userId: args.userId,
      title,
      emoji: emoji || undefined,
      targetAmount: args.targetAmount,
      startDate: now,
      endDate: monthsFromNow(args.durationMonths, now),
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});

export const cancelActiveGoal = mutation({
  args: { userId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query("b2cPersonalGoals")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .first();
    if (!active) return { success: false as const, reason: "no-active-goal" as const };
    await ctx.db.patch(active._id, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    return { success: true as const };
  },
});

// ==================== Internal cron-support helpers ====================

export const _listStaleActiveGoals = internalQuery({
  args: { now: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    // Prioritize goals past their deadline; top up with live active goals so
    // completions get detected ahead of their deadline too.
    const expired = await ctx.db
      .query("b2cPersonalGoals")
      .withIndex("by_status_endDate", (q) =>
        q.eq("status", "active").lte("endDate", args.now)
      )
      .take(args.limit);
    const live = await ctx.db
      .query("b2cPersonalGoals")
      .withIndex("by_status_endDate", (q) =>
        q.eq("status", "active").gt("endDate", args.now)
      )
      .take(Math.max(0, args.limit - expired.length));
    return { expired, live };
  },
});

export const _computeEarnedForGoal = internalQuery({
  args: { goalId: v.id("b2cPersonalGoals"), now: v.number() },
  handler: async (ctx, args) => {
    const goal = await ctx.db.get(args.goalId);
    if (!goal) return null;
    const settings = await ctx.db
      .query("b2cGoalTrackerSettings")
      .withIndex("by_user", (q) => q.eq("userId", goal.userId))
      .first();
    if (!settings) return { goal, earned: 0 };

    // Inline closer lookup: each B2C user has exactly one closer record in
    // their personal workspace (created at signup), found via their team id.
    const user = await ctx.db.get(goal.userId);
    const teamId = user?.personalWorkspaceId;
    if (!teamId) return { goal, earned: 0 };
    const closer = await ctx.db
      .query("closers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();
    if (!closer) return { goal, earned: 0 };
    const closerId = closer._id as Id<"closers">;

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_closer_and_startedAt", (q) =>
        q
          .eq("closerId", closerId)
          .gte("startedAt", goal.startDate)
          .lte("startedAt", Math.min(goal.endDate, args.now))
      )
      .collect();
    const earned = calls.reduce((sum, c) => {
      const base =
        settings.commissionMode === "cash"
          ? c.cashCollected ?? 0
          : c.contractValue ?? 0;
      return sum + base * settings.commissionRate;
    }, 0);
    return { goal, earned };
  },
});

export const _transitionGoal = internalMutation({
  args: {
    goalId: v.id("b2cPersonalGoals"),
    to: v.union(v.literal("completed"), v.literal("expired")),
  },
  handler: async (ctx, args) => {
    const goal = await ctx.db.get(args.goalId);
    if (!goal || goal.status !== "active") return;
    const now = Date.now();
    await ctx.db.patch(args.goalId, {
      status: args.to,
      updatedAt: now,
      ...(args.to === "completed" ? { completedAt: now } : {}),
    });
  },
});

// Hourly sweep. Flips active goals to completed (if earnings hit target) or
// expired (if deadline passed without hitting). Scales cleanly — the
// by_status_endDate index keeps the scan bounded, and batching by
// CRON_SWEEP_LIMIT keeps each run under Convex's mutation time budget.
export const transitionStaleGoals = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ completed: number; expired: number; scanned: number }> => {
    const now = Date.now();
    const { expired: expiredCandidates, live } = await ctx.runQuery(
      internal.b2cPersonalGoals._listStaleActiveGoals,
      { now, limit: CRON_SWEEP_LIMIT }
    );

    let completed = 0;
    let expired = 0;

    const process = async (
      goalIds: Id<"b2cPersonalGoals">[],
      deadlinePassed: boolean
    ) => {
      for (const goalId of goalIds) {
        const result = await ctx.runQuery(
          internal.b2cPersonalGoals._computeEarnedForGoal,
          { goalId, now }
        );
        if (!result) continue;
        if (result.earned >= result.goal.targetAmount) {
          await ctx.runMutation(internal.b2cPersonalGoals._transitionGoal, {
            goalId,
            to: "completed",
          });
          completed++;
        } else if (deadlinePassed) {
          await ctx.runMutation(internal.b2cPersonalGoals._transitionGoal, {
            goalId,
            to: "expired",
          });
          expired++;
        }
      }
    };

    await process(
      (expiredCandidates as Array<{ _id: Id<"b2cPersonalGoals"> }>).map((g) => g._id),
      true
    );
    await process(
      (live as Array<{ _id: Id<"b2cPersonalGoals"> }>).map((g) => g._id),
      false
    );

    return { completed, expired, scanned: expiredCandidates.length + live.length };
  },
});

// Founder-only: force the sweep to run immediately (manual testing)
export const adminRunTransitionSweep = mutation({
  args: { callerId: v.id("b2cUsers") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.callerId);
    const badges = (user as { badges?: string[] } | null)?.badges ?? [];
    if (!badges.includes("founder") && !badges.includes("admin")) {
      throw new Error("Only founders can run this sweep");
    }
    await ctx.scheduler.runAfter(
      0,
      internal.b2cPersonalGoals.transitionStaleGoals,
      {}
    );
    return { scheduled: true as const };
  },
});
