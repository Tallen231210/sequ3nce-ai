import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// The manager scheduling pass.
//
// A SEPARATE cron from auto-schedule-meeting-bots rather than a branch inside
// it. That function is the most bug-prone code in the product — five bugs, all
// found in production — and the cheapest way to guarantee Manager Mode can't
// regress it is to never open the file.
// ============================================================================

/** How far ahead to dispatch. Recall holds the bot until join_at, so this only
 *  needs to be wider than the cron interval, with room for a missed run. */
const DISPATCH_WINDOW_MS = 30 * 60 * 1000;

export const getSchedulableEvents = internalQuery({
  args: { userId: v.id("users"), until: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const events = await ctx.db
      .query("managerCalendarEvents")
      .withIndex("by_user_and_start", (q) =>
        q.eq("userId", args.userId).gte("startTime", now),
      )
      .collect();

    return events
      .filter((e) => e.startTime <= args.until)
      .filter((e) => !!e.meetingUrl)
      .filter((e) => e.excluded !== true)
      .map((e) => ({
        _id: e._id,
        title: e.title,
        startTime: e.startTime,
      }));
  },
});

/**
 * Bots whose meeting has moved or vanished.
 *
 * Without this the bot still turns up: Recall is holding a join_at that no
 * longer matches anything on the calendar.
 */
export const getOrphanedBots = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const bots = await ctx.db
      .query("managerMeetingBots")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const out = [];
    for (const b of bots) {
      if (b.status !== "scheduled") continue;
      // Already started — leave it alone, the webhook owns it from here.
      if (b.scheduledStartTime < Date.now()) continue;

      const ev = await ctx.db.get(b.calendarEventId);
      if (!ev) {
        out.push({ botId: b._id, recallBotId: b.recallBotId, reason: "meeting deleted" });
        continue;
      }
      if (ev.excluded === true) {
        out.push({ botId: b._id, recallBotId: b.recallBotId, reason: "manager excluded it" });
        continue;
      }
      if (ev.startTime !== b.scheduledStartTime) {
        out.push({ botId: b._id, recallBotId: b.recallBotId, reason: "meeting moved" });
      }
    }
    return out;
  },
});

export const autoScheduleManagerBots = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    managers: number;
    synced: number;
    scheduled: number;
    cancelled: number;
    skipped: string[];
    dryRun: boolean;
    wouldSchedule: Array<{ manager: string; title: string; startsAt: string }>;
  }> => {
    const dryRun = args.dryRun === true;

    const managers = await ctx.runQuery(
      internal.managerCalendar.getManagersWithCalendars,
      {},
    );

    let synced = 0;
    let scheduled = 0;
    let cancelled = 0;
    const skipped: string[] = [];
    const wouldSchedule: Array<{ manager: string; title: string; startsAt: string }> = [];

    for (const mgr of managers) {
      try {
        // Refresh the calendar first. A meeting booked ten minutes ago is
        // exactly the one most likely to be missed otherwise.
        if (!dryRun) {
          await ctx.runAction(internal.managerCalendarSync.syncManagerCalendar, {
            userId: mgr.userId,
          });
        }
        synced++;

        // Retire bots whose meeting moved or vanished, before scheduling new
        // ones — a moved meeting otherwise gets two bots, the stale one and
        // the new one.
        const orphans = await ctx.runQuery(
          internal.managerMeetingBotSchedule.getOrphanedBots,
          { userId: mgr.userId },
        );
        for (const o of orphans) {
          if (dryRun) { cancelled++; continue; }
          await ctx.runAction(internal.managerMeetingBot.cancelManagerBot, {
            botId: o.botId as Id<"managerMeetingBots">,
            recallBotId: o.recallBotId,
            reason: o.reason,
          });
          cancelled++;
        }

        const due = await ctx.runQuery(
          internal.managerMeetingBotSchedule.getSchedulableEvents,
          { userId: mgr.userId, until: Date.now() + DISPATCH_WINDOW_MS },
        );

        for (const ev of due) {
          if (dryRun) {
            wouldSchedule.push({
              manager: mgr.name,
              title: ev.title,
              startsAt: new Date(ev.startTime).toISOString(),
            });
            continue;
          }
          const res = await ctx.runAction(internal.managerMeetingBot.createManagerBot, {
            calendarEventId: ev._id as Id<"managerCalendarEvents">,
          });
          if (res.botId) scheduled++;
          else if (res.skipped) skipped.push(`${ev.title}: ${res.skipped}`);
        }
      } catch (err) {
        // One manager's revoked token must not stop everyone else's meetings
        // being recorded.
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[managerSchedule] ${mgr.name} failed:`, message);
        skipped.push(`${mgr.name}: ${message}`);
        await ctx.runAction(internal.lib.sentry.captureFromIsolate, {
          message: `Manager bot scheduling failed: ${message}`,
          feature: "manager-mode",
          integration: "recall",
          extra: { userId: String(mgr.userId) },
        });
      }
    }

    return { managers: managers.length, synced, scheduled, cancelled, skipped, dryRun, wouldSchedule };
  },
});
