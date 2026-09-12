// ============================================================================
// Nightly: work out when each setter actually works, from their own calls.
//
// Runs as a job rather than inside the page because the speed query is already
// the heaviest read on the Setters page and has hit Convex's one-second CPU
// limit before. One roster row per transaction, self-scheduling, so a big team
// can't blow a single mutation's budget.
//
// The rule itself is pure and benched: convex/lib/workingWindow.ts.
// ============================================================================

import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";
import { DEFAULT_TIMEZONE } from "./closerPerformance";
import { deriveWindow } from "./lib/workingWindow";
import { resolveAuthUser } from "./setterGhlOauth";

/** How far back to look. Long enough to survive a quiet week, short enough to follow a shift change. */
const LOOKBACK_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Calls read per setter, NEWEST FIRST. A window is a shape, not a total, so a
 * few thousand recent calls describe it well — but they must be the RECENT
 * ones. Convex index reads ascend, so a bare `.take()` here kept the calls
 * closest to 30 days ago and threw away everything since: a busy setter's
 * window would have been re-derived from the same stale fortnight every night
 * and never followed a shift change, which is the whole point of the job.
 */
const CALL_TAKE = 4_000;

/** A timezone Intl won't accept would throw and, before the try/catch below, kill the rest of the chain. */
function safeTimeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Team-local weekday and hour for a moment, without a formatter per row. */
function localParts(fmt: Intl.DateTimeFormat, at: number): { day: number; hour: number } | null {
  const parts = fmt.formatToParts(new Date(at));
  let weekday = "";
  let hour = -1;
  for (const p of parts) {
    if (p.type === "weekday") weekday = p.value;
    else if (p.type === "hour") hour = Number(p.value);
  }
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return day < 0 || hour < 0 ? null : { day, hour };
}

/** One roster row: read their calls, infer the window, write it. */
export const deriveForRoster = internalMutation({
  args: { rosterId: v.id("setterRoster"), nextIds: v.array(v.id("setterRoster")) },
  handler: async (ctx, args) => {
    // Every failure here has to stay local to this row. A scheduled mutation
    // that throws does NOT retry, and the tail of the chain is scheduled at
    // the end of this same transaction — so one unparseable timezone or one
    // OCC exhaustion would silently drop every setter queued behind it.
    try {
      const roster = await ctx.db.get(args.rosterId);
      if (roster && roster.crmUserId) {
        const team = await ctx.db.get(roster.teamId as Id<"teams">);
        const tz = safeTimeZone((team as { timezone?: string } | null)?.timezone || DEFAULT_TIMEZONE);
        const since = Date.now() - LOOKBACK_DAYS * DAY_MS;
        const events = await ctx.db
          .query("setterLeadEvents")
          .withIndex("by_team_and_setter_and_time", (q) =>
            q.eq("teamId", roster.teamId).eq("ghlUserId", roster.crmUserId).gte("occurredAt", since),
          )
          .order("desc")
          .take(CALL_TAKE);
        // One formatter for the whole row — building one per event is what blew
        // the CPU limit on the cross-check query.
        const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false });
        const calls: Array<{ day: number; hour: number }> = [];
        for (const e of events) {
          if (e.eventType !== "dial_outbound" && e.eventType !== "sms_outbound") continue;
          const p = localParts(fmt, e.occurredAt);
          if (p) calls.push(p);
        }
        const derived = deriveWindow(calls);
        // Absent stays absent when we can't tell — the reader falls back to the
        // team's hours and the card says which it used.
        if (derived) {
          await ctx.db.patch(args.rosterId, { derivedHours: { ...derived, computedAt: Date.now() } });
        } else if (roster.derivedHours) {
          await ctx.db.patch(args.rosterId, { derivedHours: undefined });
        }
      }
    } catch (err) {
      console.error(`[setterWorkingHours] ${args.rosterId} failed, continuing the chain:`, err);
    }

    const [next, ...rest] = args.nextIds;
    if (next) {
      await ctx.scheduler.runAfter(0, internal.setterWorkingHours.deriveForRoster, { rosterId: next, nextIds: rest });
    }
  },
});

/** Kick the chain for every active roster row on every team that has the flag. */
export const deriveAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const teams = await ctx.db.query("teams").collect();
    const flagged = teams.filter((t) => ((t as { betaFeatures?: string[] }).betaFeatures ?? []).includes("setter_teams"));
    const ids: Id<"setterRoster">[] = [];
    for (const team of flagged) {
      const roster: Doc<"setterRoster">[] = await ctx.db
        .query("setterRoster")
        .withIndex("by_team", (q) => q.eq("teamId", team._id))
        .collect();
      for (const r of roster) if (r.active && r.crmUserId) ids.push(r._id);
    }
    const [first, ...rest] = ids;
    if (!first) return { rosters: 0 };
    await ctx.scheduler.runAfter(0, internal.setterWorkingHours.deriveForRoster, { rosterId: first, nextIds: rest });
    return { rosters: ids.length };
  },
});

/** A manager pinning someone's hours by hand, or clearing the pin. */
export const setHoursOverride = mutation({
  args: {
    clerkId: v.string(),
    rosterId: v.id("setterRoster"),
    /** null clears the override and hands the setter back to their derived window. */
    hours: v.union(v.object({ days: v.array(v.number()), startHour: v.number(), endHour: v.number() }), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId || (user.role !== "admin" && user.role !== "manager")) {
      throw new ConvexError("Only managers can set working hours");
    }
    const roster = await ctx.db.get(args.rosterId);
    if (!roster || String(roster.teamId) !== String(user.teamId)) throw new ConvexError("That setter isn't on your team");
    if (args.hours) {
      const { days, startHour, endHour } = args.hours;
      if (days.length === 0) throw new ConvexError("Pick at least one day");
      if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new ConvexError("Days must be 0 (Sunday) to 6");
      for (const h of [startHour, endHour]) {
        if (!Number.isInteger(h) || h < 0 || h > 23) throw new ConvexError("Hours must be whole numbers from 0 to 23");
      }
      if (startHour === endHour) throw new ConvexError("Start and end can't be the same hour");
      await ctx.db.patch(args.rosterId, { hoursOverride: { days: Array.from(new Set(days)).sort(), startHour, endHour } });
    } else {
      await ctx.db.patch(args.rosterId, { hoursOverride: undefined });
    }
    return { ok: true };
  },
});
