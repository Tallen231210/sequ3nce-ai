// ============================================================================
// The end-of-day cash post.
//
// Unlike the collections digest, this one is NOT silent on a quiet day. A
// collections digest with nothing owed has nothing to say; a cash digest
// showing zero is saying something, and a sales team that only hears from the
// board on good days learns to read its absence as bad news anyway.
//
// Same config shape as the collections digest — cadence, local hour, its own
// channel — so a manager who has set one up already knows this one.
// ============================================================================

import { v } from "convex/values";
import { withSlackTestLabel, withDiscordTestLabel } from "./lib/testLabel";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  postSlackMessage,
  postDiscordWebhook,
  formatInTimeZone,
} from "./setterDataNotifications";
import { DEFAULT_TIMEZONE } from "./closerPerformance";
import type { CashDigestData } from "./cashDigest";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** How many closers make the board. Past this it stops being a leaderboard. */
const LEADERS_SHOWN = 10;

const DEFAULT_HOUR = 17;

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateLabel(local: { year: number; month: number; day: number }): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${local.day} ${months[local.month - 1]}`;
}

/**
 * The pace line, or nothing.
 *
 * A team with no goal set gets no pace line at all rather than a projection
 * against zero. "You're $84,000 ahead of a target of nothing" is worse than
 * saying nothing.
 */
function paceLine(d: CashDigestData): string | null {
  if (d.target === null || d.target <= 0) return null;

  // A prize target is a thing to climb toward, not a monthly quota, so it gets
  // progress rather than pace. RemoteStack's is a $4,000,000 trip to Ibiza
  // against a month that does tens of thousands — projecting it as a monthly
  // goal reported them "$1,005,628 behind pace", which is a true division and
  // a useless sentence.
  if (d.targetIsPrize) {
    const pct = Math.min(100, (d.monthToDate / d.target) * 100);
    const name = d.prizeName ? `*${d.prizeName}*` : "*Prize*";
    return (
      `🏆 ${name} · ${money(d.monthToDate)} of ${money(d.target)} ` +
      `(${pct < 1 ? pct.toFixed(1) : Math.round(pct)}%)`
    );
  }

  if (d.projected === null || d.vsPace === null) return null;
  const ahead = d.vsPace >= 0;
  const gap = money(Math.abs(d.vsPace));
  return (
    `*Pace* · ${money(d.projected)} projected against ${money(d.target)}\n` +
    `${ahead ? "🟢" : "🔴"} ${gap} ${ahead ? "ahead of" : "behind"} pace on day ${d.dayOfMonth} of ${d.daysInMonth}`
  );
}

function ratePct(r: number | null): string {
  return r === null ? "—" : `${Math.round(r * 100)}%`;
}

function leaderboardText(d: CashDigestData): string {
  if (d.leaders.length === 0) {
    return "_Nothing collected yet this month._";
  }
  const medals = ["🥇", "🥈", "🥉"];
  return d.leaders
    .slice(0, LEADERS_SHOWN)
    .map((l, i) => {
      const rank = medals[i] ?? `${i + 1}.`;
      const today = l.today > 0 ? `  _(+${money(l.today)} today)_` : "";
      const rate = l.closeRate === null ? "" : `  ·  ${ratePct(l.closeRate)} close`;
      return `${rank} *${l.name}* — ${money(l.month)}${rate}${today}`;
    })
    .join("\n");
}

function buildSlackBlocks(
  d: CashDigestData,
  local: { year: number; month: number; day: number },
  showLeaderboard = true,
): unknown[] {
  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `💰 ${money(d.today)} collected today`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${dateLabel(local)} · ${d.dealsToday} ${d.dealsToday === 1 ? "deal" : "deals"}`,
        },
      ],
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Month to date*\n${money(d.monthToDate)}` },
        { type: "mrkdwn", text: `*Year to date*\n${money(d.yearToDate)}` },
        {
          type: "mrkdwn",
          text: `*Close rate today*\n${ratePct(d.closeRateToday)}`,
        },
        {
          type: "mrkdwn",
          text: `*Close rate this month*\n${ratePct(d.closeRateMonth)}`,
        },
      ],
    },
  ];

  const pace = paceLine(d);
  if (pace) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: pace } });
  }

  if (showLeaderboard) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*This month*\n${leaderboardText(d)}` },
      },
    );
  }

  if (d.truncated) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_Year-to-date figure is capped — this team has more calls than one pass can read._",
        },
      ],
    });
  }

  return blocks;
}

function buildDiscordEmbed(
  d: CashDigestData,
  local: { year: number; month: number; day: number },
  showLeaderboard = true,
): unknown {
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Today", value: money(d.today), inline: true },
    { name: "Month to date", value: money(d.monthToDate), inline: true },
    { name: "Year to date", value: money(d.yearToDate), inline: true },
    { name: "Close rate today", value: ratePct(d.closeRateToday), inline: true },
    { name: "Close rate month", value: ratePct(d.closeRateMonth), inline: true },
  ];

  const pace = paceLine(d);
  if (pace) {
    fields.push({
      name: "Pace",
      value: pace.replace(/\*/g, ""),
      inline: false,
    });
  }

  if (showLeaderboard) {
    fields.push({
      name: "This month",
      value: leaderboardText(d).replace(/\*/g, "").slice(0, 1000),
      inline: false,
    });
  }

  return {
    title: `💰 ${money(d.today)} collected — ${dateLabel(local)}`,
    color: d.today > 0 ? 3066993 : 9807270,
    fields,
  };
}

// ----------------------------------------------------------------------------
// Context
// ----------------------------------------------------------------------------

export const getEnabledCashDigestTeams = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"teams">[]> => {
    const teams = await ctx.db.query("teams").collect();
    return teams.filter((t) => t.cashDigestEnabled === true);
  },
});

export const getTeamForCashDigest = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => await ctx.db.get(args.teamId),
});

// ----------------------------------------------------------------------------
// Send
// ----------------------------------------------------------------------------

async function maybeSendForTeam(
  ctx: any,
  team: Doc<"teams">,
  nowMs: number,
  opts?: { force?: boolean; dedupSuffix?: string },
): Promise<{ sent: boolean; reason?: string }> {
  const tz = team.timezone || DEFAULT_TIMEZONE;
  const local = formatInTimeZone(new Date(nowMs), tz);
  const weekly = team.cashDigestCadence === "weekly";

  if (!opts?.force) {
    const targetHour = team.cashDigestHourLocal ?? DEFAULT_HOUR;
    if (local.hour !== targetHour) {
      return { sent: false, reason: `hour ${local.hour} != target ${targetHour}` };
    }
    if (weekly && local.weekday !== "Mon") {
      return { sent: false, reason: `weekly cadence, today is ${local.weekday}` };
    }
  }

  // Keyed on the team's local date, so an hourly cron that fires twice in the
  // target hour still posts once.
  const dayKey = `${local.year}-${pad2(local.month)}-${pad2(local.day)}`;
  const dedupKey = `${team._id}_cash_${dayKey}${opts?.dedupSuffix ?? ""}`;
  const isTest = opts?.dedupSuffix?.includes("_test") === true;
  const alreadySent = await ctx.runQuery(
    internal.setterDataNotifications.hasNotificationByDedupKey,
    { dedupKey },
  );
  if (alreadySent) return { sent: false, reason: "already sent for this date" };

  const data = (await ctx.runQuery(internal.cashDigest.getCashDigest, {
    teamId: team._id,
    nowMs,
  })) as CashDigestData;

  const channel = team.cashDigestChannel;
  if (channel !== "slack" && channel !== "discord") {
    return { sent: false, reason: "no notification channel configured" };
  }

  // Defaults on — a leaderboard is most of why a team wants this post.
  const showLeaderboard = team.cashDigestShowLeaderboard !== false;

  const fallback = `${money(data.today)} collected today · ${money(data.monthToDate)} month to date`;

  if (channel === "slack") {
    const channelId = team.cashDigestSlackChannelId || team.slackChannelId;
    if (!team.slackAccessToken || !channelId) {
      return { sent: false, reason: "slack not connected or no channel" };
    }
    const result = await postSlackMessage({
      accessToken: team.slackAccessToken,
      channelId,
      text: fallback,
      blocks: isTest
        ? withSlackTestLabel(buildSlackBlocks(data, local, showLeaderboard))
        : buildSlackBlocks(data, local, showLeaderboard),
    });
    if (!result.ok) throw new Error(`Slack post failed: ${result.error}`);
  } else {
    const webhookUrl = team.cashDigestDiscordWebhookUrl;
    if (!webhookUrl) return { sent: false, reason: "no discord webhook configured" };
    const result = await postDiscordWebhook({
      webhookUrl,
      content: fallback,
      embed: buildDiscordEmbed(data, local, showLeaderboard),
    });
    if (!result.ok) throw new Error(`Discord post failed: ${result.error}`);
  }

  // Recorded only after a successful send, so a transient outage doesn't mark
  // the day delivered and silently skip it.
  await ctx.runMutation(internal.setterDataNotifications.recordSentNotification, {
    teamId: team._id,
    type: "cash_digest",
    dedupKey,
  });

  return { sent: true };
}

export const runCashDigest = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ processed: number; skipped: number; errored: number }> => {
    const now = Date.now();
    const teams = (await ctx.runQuery(
      internal.cashDigestNotifications.getEnabledCashDigestTeams,
      {},
    )) as Doc<"teams">[];

    let processed = 0;
    let skipped = 0;
    let errored = 0;

    for (const team of teams) {
      try {
        const result = await maybeSendForTeam(ctx, team, now);
        if (result.sent) processed++;
        else skipped++;
      } catch (err) {
        // One team's dead webhook must not stop everyone else's post.
        errored++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[runCashDigest] Error for team ${team._id}:`, message);
        await ctx.runAction(internal.lib.sentry.captureFromIsolate, {
          message: `Cash digest failed to send: ${message}`,
          feature: "cash-digest",
          integration: team.cashDigestChannel ?? "unknown",
          extra: { teamId: String(team._id) },
        });
      }
    }

    return { processed, skipped, errored };
  },
});

/**
 * Post one team's digest now, skipping the hour and cadence gates.
 *
 * internalAction on purpose: it loads the team document, which carries
 * `slackAccessToken`, and that must never be returned to a public caller.
 */
export const sendCashDigestNow = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const team = (await ctx.runQuery(
      internal.cashDigestNotifications.getTeamForCashDigest,
      { teamId: args.teamId },
    )) as Doc<"teams"> | null;
    if (!team) return { sent: false, reason: "team not found" };
    return maybeSendForTeam(ctx, team, Date.now(), {
      force: true,
      dedupSuffix: `_test_${Date.now()}`,
    });
  },
});

export type { Id };
