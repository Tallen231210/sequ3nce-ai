import { v } from "convex/values";
import { withSlackTestLabel, withDiscordTestLabel } from "./lib/testLabel";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { formatInTimeZone } from "./setterDataNotifications";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { deliver } from "./setterEodNotifications";
import {
  buildSetterScorecardDiscordEmbed,
  buildSetterScorecardSlackBlocks,
  setterScorecardFallbackText,
  type SetterDayRow,
  type SetterScorecardData,
} from "./setterScorecardPost";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Daily setter scorecard post — the numbers setters filed, where they look.
//
// Sibling of the closer scoreboard: one section per setter who filed, team
// totals, week-to-date. Reads setterEodEntries only, so by construction it
// carries nothing a setter didn't type in. Config (hour/days/channel) lives
// with the other setter EOD notifications; the manager sets it on the
// Setter EODs tab.
//
// WHICH DAY: an evening post (5pm local or later) reports TODAY — the EODs
// have been filed by then. A morning post reports YESTERDAY. Same rule the
// manager sees in the tab copy.
// ============================================================================

const EVENING_HOUR = 17;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function addDaysKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The Saturday (team-local) that starts the week containing `dayKey`. Same
 *  convention as scorecard.ts, so the Slack week matches the app's week. */
function weekStartFor(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
  const back = (dow + 1) % 7; // Sat→0, Sun→1, … Fri→6
  return addDaysKey(dayKey, -back);
}

export const getEnabledTeams = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"teams">[]> => {
    const teams = await ctx.db.query("teams").collect();
    return teams.filter((t: any) => t.setterEodScorecardEnabled === true);
  },
});

export const getSetterScorecardData = internalQuery({
  args: { teamId: v.id("teams"), reportDayKey: v.string() },
  handler: async (ctx, args): Promise<SetterScorecardData> => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.reportDayKey)) {
      throw new Error("Bad day key");
    }
    const weekStartKey = weekStartFor(args.reportDayKey);

    const roster = (
      await ctx.db
        .query("setterRoster")
        .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
        .collect()
    ).filter((r: any) => r.active);

    const byRoster = new Map<string, SetterDayRow>();
    for (const r of roster) {
      byRoster.set(String(r._id), {
        rosterId: String(r._id),
        name: r.name,
        filed: false,
        dials: 0, pickUps: 0, sets: 0, onCal: 0, shown: 0, closed: 0, cash: 0,
        cashReported: false,
        week: { sets: 0, cash: 0, cashReported: false },
      });
    }

    // Week so far, day by day (≤7 reads on by_team_and_day). The reported
    // day itself fills both the day row and the week-to-date.
    let dayKey = weekStartKey;
    while (dayKey <= args.reportDayKey) {
      const entries = await ctx.db
        .query("setterEodEntries")
        .withIndex("by_team_and_day", (q: any) =>
          q.eq("teamId", args.teamId).eq("dayKey", dayKey),
        )
        .collect();
      const isReportDay = dayKey === args.reportDayKey;
      for (const e of entries) {
        const row = byRoster.get(String(e.rosterId));
        if (!row) continue; // deactivated setter — absence is information
        // Blank means "not reporting", 0 means "the real answer is zero" —
        // the rule printed on the setters' handout. A day where nobody
        // typed a cash figure renders "—", never a misleading $0.
        const cashReported = e.cashCollected !== undefined;
        row.week.sets += e.sets;
        row.week.cash += e.cashCollected ?? 0;
        row.week.cashReported = row.week.cashReported || cashReported;
        if (isReportDay) {
          row.filed = true;
          row.dials += e.dials;
          row.pickUps += e.pickUps;
          row.sets += e.sets;
          row.onCal += e.callsOnCalendar ?? 0;
          row.shown += e.callsShown ?? 0;
          row.closed += e.callsClosed ?? 0;
          row.cash += e.cashCollected ?? 0;
          row.cashReported = row.cashReported || cashReported;
        }
      }
      dayKey = addDaysKey(dayKey, 1);
    }

    // Cash first, then sets, then name — a statistic ordering, nothing more.
    const rows = Array.from(byRoster.values()).sort(
      (a, b) => b.cash - a.cash || b.sets - a.sets || a.name.localeCompare(b.name),
    );
    const team = { dials: 0, pickUps: 0, sets: 0, onCal: 0, shown: 0, closed: 0, cash: 0, cashReported: false };
    const week = { sets: 0, cash: 0, cashReported: false };
    for (const r of rows) {
      team.dials += r.dials; team.pickUps += r.pickUps; team.sets += r.sets;
      team.onCal += r.onCal; team.shown += r.shown; team.closed += r.closed;
      team.cash += r.cash; team.cashReported = team.cashReported || r.cashReported;
      week.sets += r.week.sets; week.cash += r.week.cash;
      week.cashReported = week.cashReported || r.week.cashReported;
    }
    return {
      reportDayKey: args.reportDayKey,
      weekStartKey,
      rows,
      team,
      week,
      filedCount: rows.filter((r) => r.filed).length,
      rosterCount: rows.length,
    };
  },
});

async function maybeSend(
  ctx: any,
  team: any,
  nowMs: number,
  opts?: { force?: boolean; dedupSuffix?: string },
): Promise<{ sent: boolean; reason?: string }> {
  if (team.setterEodScorecardEnabled !== true && !opts?.force) {
    return { sent: false, reason: "disabled" };
  }
  const tz = team.timezone || DEFAULT_TIMEZONE;
  const local = formatInTimeZone(new Date(nowMs), tz);
  const targetHour = team.setterEodScorecardHourLocal ?? 9;

  if (!opts?.force) {
    if (local.hour !== targetHour) {
      return { sent: false, reason: `hour ${local.hour} != ${targetHour}` };
    }
    const days: string[] =
      team.setterEodScorecardDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    if (!days.includes(local.weekday)) {
      return { sent: false, reason: `${local.weekday} not in configured days` };
    }
  }

  const todayKey = dayKeyInTz(nowMs, tz);
  const reportDayKey = targetHour >= EVENING_HOUR ? todayKey : addDaysKey(todayKey, -1);
  const postDayKey = `${local.year}-${pad2(local.month)}-${pad2(local.day)}`;
  const dedupKey = `${team._id}_setterscore_${postDayKey}${opts?.dedupSuffix ?? ""}`;
  const alreadySent = await ctx.runQuery(
    internal.setterDataNotifications.hasNotificationByDedupKey,
    { dedupKey },
  );
  if (alreadySent) return { sent: false, reason: "already sent today" };

  const data: SetterScorecardData = await ctx.runQuery(
    internal.setterScorecardNotifications.getSetterScorecardData,
    { teamId: team._id, reportDayKey },
  );
  if (data.rosterCount === 0) return { sent: false, reason: "no active setters on the roster" };
  // Silence beats a post full of zeros: a day nobody filed is a job for the
  // missing-report, not the scoreboard.
  if (data.filedCount === 0 && !opts?.force) {
    return { sent: false, reason: "nobody filed for the reported day" };
  }

  const isTest = opts?.dedupSuffix?.includes("_test") === true;
  const blocks = buildSetterScorecardSlackBlocks(data);
  const embed = buildSetterScorecardDiscordEmbed(data);
  const delivered = await deliver(
    team,
    team.setterEodScorecardSlackChannelId,
    setterScorecardFallbackText(data),
    isTest ? withSlackTestLabel(blocks) : blocks,
    isTest ? withDiscordTestLabel(embed) : embed,
  );
  if (!delivered.ok) return { sent: false, reason: delivered.reason };

  await ctx.runMutation(internal.setterDataNotifications.recordSentNotification, {
    teamId: team._id,
    type: "setter_scorecard",
    dedupKey,
  });
  return { sent: true };
}

export const runSetterScorecard = internalAction({
  args: {},
  handler: async (ctx): Promise<{ sent: number; skipped: number; errored: number }> => {
    const now = Date.now();
    const teams: Doc<"teams">[] = await ctx.runQuery(
      internal.setterScorecardNotifications.getEnabledTeams,
      {},
    );
    let sent = 0, skipped = 0, errored = 0;
    for (const team of teams) {
      try {
        const r = await maybeSend(ctx, team, now);
        if (r.sent) sent++; else skipped++;
      } catch (e) {
        errored++;
        console.error(`[setterScorecard] team ${team._id}:`, e);
      }
    }
    if (sent > 0 || errored > 0) {
      console.log(`[setterScorecard] sent ${sent}, skipped ${skipped}, errored ${errored}`);
    }
    return { sent, skipped, errored };
  },
});

/** Force one post now, ignoring hour/days/dedup — setup verification. */
export const sendTest = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const team = await ctx.runQuery(
      internal.cashDigestNotifications.getTeamForCashDigest,
      { teamId: args.teamId },
    );
    if (!team) return { sent: false, reason: "team not found" };
    return await maybeSend(ctx, team, Date.now(), {
      force: true,
      dedupSuffix: `_test_${Math.floor(Date.now() / 60000)}`,
    });
  },
});

/** The post fully rendered for a given day, posted nowhere — the bench tool. */
export const preview = internalAction({
  args: { teamId: v.id("teams"), reportDayKey: v.optional(v.string()) },
  handler: async (ctx, args): Promise<any> => {
    const team: any = await ctx.runQuery(
      internal.cashDigestNotifications.getTeamForCashDigest,
      { teamId: args.teamId },
    );
    if (!team) return { error: "team not found" };
    const tz = team.timezone || DEFAULT_TIMEZONE;
    const reportDayKey = args.reportDayKey ?? addDaysKey(dayKeyInTz(Date.now(), tz), -1);
    const data = await ctx.runQuery(
      internal.setterScorecardNotifications.getSetterScorecardData,
      { teamId: team._id, reportDayKey },
    );
    return {
      reportDayKey,
      fallback: setterScorecardFallbackText(data),
      blocks: buildSetterScorecardSlackBlocks(data),
      data,
    };
  },
});
