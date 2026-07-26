import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Keeping the performance rollup current.
//
// The rollup is derived, so it only exists if something recomputes it. Two
// mechanisms, deliberately overlapping:
//
//  1. A write hook fires when a call completes or its outcome is edited, so
//     the board reflects that call within seconds.
//  2. This sweep re-derives a trailing window for every team, repairing
//     anything the hook missed — a failed scheduled mutation, a call written
//     by a path we didn't hook, or a calendar event that synced late.
//
// The sweep is the safety net, not the primary path. It writes absolute
// values, so re-running it is always harmless.
//
// Each DAY is its own mutation, driven from an action. That matters: a team
// with heavy calendar volume would otherwise push a multi-day recount past
// Convex's per-transaction limits, and one oversized team would take the
// whole sweep down with it.
// ============================================================================

/** Days back to re-derive each sweep — covers late calendar syncs and
 *  outcomes edited a day or two after the call. */
const SWEEP_WINDOW_DAYS = 3;

/** Depth of a manual backfill when onboarding a team onto the board. */
const DEFAULT_BACKFILL_DAYS = 60;

const DAY_MS = 86_400_000;

/**
 * Teams recounted per sweep. Each team costs SWEEP_WINDOW_DAYS sequential
 * mutations, so this bounds a run at ~600 and keeps it well inside an action's
 * lifetime. Past this we log rather than silently truncate — the fix at that
 * scale is to shard teams across the hourly runs, not to raise the number.
 */
const MAX_TEAMS_PER_SWEEP = 200;

function recentDayKeys(tz: string, days: number, startOffset = 0): string[] {
  const now = Date.now();
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    out.push(dayKeyInTz(now - (startOffset + i) * DAY_MS, tz));
  }
  // A DST fold can repeat a local day key; recounting it twice is wasteful.
  return Array.from(new Set(out));
}

/** Teams to sweep, with just the field the sweep needs. */
export const listTeamsForSweep = internalQuery({
  args: {},
  handler: async (
    ctx,
  ): Promise<Array<{ teamId: Id<"teams">; timezone: string }>> => {
    const teams = await ctx.db.query("teams").take(500);
    return teams.map((t) => ({
      teamId: t._id,
      timezone: t.timezone || DEFAULT_TIMEZONE,
    }));
  },
});

/**
 * Re-derive a trailing window for every team. Scheduled hourly: a recount of
 * an unchanged day just rewrites identical values, and running hourly means a
 * team that connects a calendar mid-afternoon gets a populated board within
 * the hour rather than the next morning.
 */
export const runSweep = internalAction({
  args: { days: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    teams: number;
    days: number;
    failures: number;
    skippedTeams: number;
  }> => {
    const teams = await ctx.runQuery(
      internal.closerPerformanceSweep.listTeamsForSweep,
      {},
    );
    const days = Math.max(1, Math.min(args.days ?? SWEEP_WINDOW_DAYS, 30));

    if (teams.length > MAX_TEAMS_PER_SWEEP) {
      console.error(
        `[closerPerformance] ${teams.length} teams exceeds the ${MAX_TEAMS_PER_SWEEP} sweep cap — ` +
          `teams beyond the cap are NOT being recounted. Shard by hour to fix.`,
      );
    }

    let ok = 0;
    let failures = 0;
    let firstError: { teamId: string; dayKey: string; message: string } | null =
      null;
    for (const team of teams.slice(0, MAX_TEAMS_PER_SWEEP)) {
      for (const dayKey of recentDayKeys(team.timezone, days)) {
        try {
          await ctx.runMutation(internal.closerPerformance.recountCloserDay, {
            teamId: team.teamId,
            dayKey,
          });
        } catch (err) {
          // One team's bad data must not stop the rest of the sweep.
          failures += 1;
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[closerPerformance] sweep failed for team ${team.teamId} on ${dayKey}:`,
            message,
          );
          firstError ??= { teamId: String(team.teamId), dayKey, message };
        }
      }
      ok += 1;
    }
    // One alert per run, not one per failure — a systemic break (a bad deploy,
    // a Convex limit) would otherwise fire hundreds of identical events and
    // bury the signal it was meant to raise.
    if (firstError) {
      await ctx.runAction(internal.lib.sentry.captureFromIsolate, {
        message: `Closer performance sweep failed on ${failures} team-day(s): ${firstError.message}`,
        feature: "closer-performance-sweep",
        extra: { failures, teamsProcessed: ok, sample: firstError },
      });
    }

    return {
      teams: ok,
      days,
      failures,
      skippedTeams: Math.max(0, teams.length - MAX_TEAMS_PER_SWEEP),
    };
  },
});

/**
 * One-off backfill for a single team — used when onboarding a team onto the
 * board, or when investigating a discrepancy. Deliberately manual: a 60-day
 * recount for every team on every cron tick would be pure waste.
 */
export const backfillTeam = internalAction({
  args: { teamId: v.id("teams"), days: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ days: number; failures: number }> => {
    const days = Math.max(1, Math.min(args.days ?? DEFAULT_BACKFILL_DAYS, 400));
    const team = await ctx.runQuery(
      internal.closerPerformanceSweep.getTeamTimezone,
      { teamId: args.teamId },
    );
    if (!team) return { days: 0, failures: 0 };

    let done = 0;
    let failures = 0;
    for (const dayKey of recentDayKeys(team.timezone, days)) {
      try {
        await ctx.runMutation(internal.closerPerformance.recountCloserDay, {
          teamId: args.teamId,
          dayKey,
        });
        done += 1;
      } catch (err) {
        failures += 1;
        console.error(
          `[closerPerformance] backfill failed for ${args.teamId} on ${dayKey}:`,
          err,
        );
      }
    }
    return { days: done, failures };
  },
});

export const getTeamTimezone = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ timezone: string } | null> => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;
    return { timezone: team.timezone || DEFAULT_TIMEZONE };
  },
});

/**
 * Write hook. Schedules a recount of the team-local day a call belongs to.
 *
 * Scheduled rather than run inline so a rollup error can never fail the
 * mutation that recorded the call — losing a call to a scoreboard bug would
 * be far worse than a briefly stale scoreboard, and the sweep repairs it
 * regardless. The short delay lets a burst of edits collapse into one
 * recount instead of thrashing the same rows.
 */
export async function scheduleCloserRecount(
  ctx: {
    scheduler: {
      runAfter: (ms: number, fn: any, args: any) => Promise<unknown>;
    };
  },
  teamId: Id<"teams">,
  atMs: number,
): Promise<void> {
  try {
    await ctx.scheduler.runAfter(
      5_000,
      internal.closerPerformance.recountCloserDayForInstant,
      { teamId, atMs },
    );
  } catch (err) {
    console.error("[closerPerformance] could not schedule recount:", err);
  }
}
