// ============================================================================
// What deactivating a closer must ALSO do, beyond flipping status.
//
// Found 2026-09-03 on E2: four departed closers still had auto-join on and
// live Google tokens, so their calendars kept syncing every cycle for
// nothing. The sweep filters to active closers so no bots resulted, but a
// departed person's diary has no business feeding anything — and a token we
// no longer need is a token we should not hold.
// ============================================================================

import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { disconnectCloserCalendarTx } from "./calendarOAuth";

export interface OffboardResult {
  autoJoinCleared: boolean;
  calendarCleared: boolean;
  botsCancelled: number;
  eventsRemoved: number;
}

/**
 * Switch off auto-join, disconnect every calendar, and cancel queued bots.
 * Idempotent: a closer already clean reports zeros. Bot cancellation talks
 * to Recall, so it is scheduled as the existing cancelBot action rather than
 * attempted inside this transaction.
 */
export async function offboardCloserTx(
  ctx: MutationCtx,
  closerId: Id<"closers">,
): Promise<OffboardResult> {
  const closer = await ctx.db.get(closerId);
  if (!closer) throw new Error("Closer not found");

  const hadAutoJoin = closer.autoJoinEnabled === true;
  const hadCalendar =
    !!closer.googleCalendarRefreshToken ||
    !!closer.microsoftCalendarRefreshToken ||
    !!(closer as any).icsUrl;

  if (hadAutoJoin) await ctx.db.patch(closerId, { autoJoinEnabled: false });

  let eventsRemoved = 0;
  if (hadCalendar) {
    const r = await disconnectCloserCalendarTx(ctx, closerId);
    eventsRemoved = r.eventsRemoved;
    if ((closer as any).icsUrl) await ctx.db.patch(closerId, { icsUrl: undefined } as any);
  }

  const queued = await ctx.db
    .query("meetingBots")
    .withIndex("by_closer_and_status", (q) =>
      q.eq("closerId", closerId).eq("status", "scheduled"),
    )
    .collect();
  for (const bot of queued) {
    await ctx.scheduler.runAfter(0, api.meetingBot.cancelBot, { botId: bot._id });
  }

  return {
    autoJoinCleared: hadAutoJoin,
    calendarCleared: hadCalendar,
    botsCancelled: queued.length,
    eventsRemoved,
  };
}

/**
 * One-off (and re-runnable) sweep: apply offboarding to every closer already
 * marked deactivated, on every team. Dry run lists what it WOULD touch.
 */
export const cleanupDeactivatedClosers = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("closers").take(5000);
    const targets = all.filter(
      (c) =>
        c.status === "deactivated" &&
        (c.autoJoinEnabled === true ||
          !!c.googleCalendarRefreshToken ||
          !!c.microsoftCalendarRefreshToken ||
          !!(c as any).icsUrl),
    );
    const report: Array<{ name: string; team: string } & Partial<OffboardResult>> = [];
    for (const c of targets) {
      if (args.dryRun) {
        report.push({ name: c.name, team: String(c.teamId) });
        continue;
      }
      const r = await offboardCloserTx(ctx, c._id);
      report.push({ name: c.name, team: String(c.teamId), ...r });
    }
    return { dryRun: !!args.dryRun, touched: report.length, report };
  },
});
