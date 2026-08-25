import { v } from "convex/values";
import { withSlackTestLabel, withDiscordTestLabel } from "./lib/testLabel";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  formatInTimeZone,
  humanReadableDate,
  pad2,
  postDiscordWebhook,
  postSlackMessage,
  type ZonedDate,
} from "./setterDataNotifications";
import { DEFAULT_TIMEZONE } from "./closerPerformance";
import {
  DEFAULT_REPORT_DAYS,
  WEEKDAY_INDEX,
} from "./closerPerformanceNotifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Delivery for the "who hasn't filed their end-of-day" nudge.
//
// Same plumbing as the Team Performance post — hourly cron, team-local hour
// gate, dedup on a per-day key, one team's dead webhook never stopping the
// rest — so there is one pattern here rather than three.
//
// The one rule specific to this message: it is SILENT when everybody filed.
// A nudge that arrives daily saying "all good" is indistinguishable from
// wallpaper within a week, and then the day it matters nobody reads it.
// ============================================================================

type ActionCtx = any;
type TeamDoc = Doc<"teams">;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

function buildSlackBlocks(data: any, zd: ZonedDate): any[] {
  const names = data.missing.map((m: any) => `*${m.name}*`).join(", ");
  const lines = data.missing
    .map(
      (m: any) =>
        `• *${m.name}* — ${plural(m.taken, "call", "calls")} taken, ${plural(m.booked, "booked", "booked")}`,
    )
    .join("\n");

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📝 End-of-day not submitted — ${humanReadableDate(zd)}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${names} ${data.missing.length === 1 ? "hasn't" : "haven't"} filed their end-of-day.`,
      },
    },
    { type: "section", text: { type: "mrkdwn", text: lines } },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          // Says why it matters, in the terms the manager already cares about.
          text:
            `${data.filed} of ${data.expected} filed · ` +
            "until they do, their closes and cash are missing from the day's numbers.",
        },
      ],
    },
  ];
}

function buildDiscordEmbed(data: any, zd: ZonedDate): any {
  const lines = data.missing
    .map(
      (m: any) =>
        `**${m.name}** — ${plural(m.taken, "call", "calls")} taken, ${plural(m.booked, "booked", "booked")}`,
    )
    .join("\n");
  return {
    title: `📝 End-of-day not submitted — ${humanReadableDate(zd)}`,
    color: 0xf59e0b,
    description: lines.slice(0, 4000),
    footer: {
      text:
        `${data.filed} of ${data.expected} filed · ` +
        "until they do, their closes and cash are missing from the day's numbers.",
    },
  };
}

export const getEnabledEodNudgeTeams = internalQuery({
  args: {},
  handler: async (ctx): Promise<TeamDoc[]> => {
    const teams = await ctx.db.query("teams").collect();
    return teams.filter((t) => t.eodNudgeEnabled === true);
  },
});

export const getTeamForEodNudge = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => await ctx.db.get(args.teamId),
});

export async function maybeSendEodNudgeForTeam(
  ctx: ActionCtx,
  team: TeamDoc,
  nowMs: number,
  opts?: { force?: boolean; dedupSuffix?: string },
): Promise<{ sent: boolean; reason?: string }> {
  const tz = team.timezone || DEFAULT_TIMEZONE;

  if (!opts?.force) {
    const targetHour = team.eodNudgeHourLocal;
    if (typeof targetHour !== "number") {
      return { sent: false, reason: "no target hour configured" };
    }
    const localNow = formatInTimeZone(new Date(nowMs), tz);
    if (localNow.hour !== targetHour) {
      return {
        sent: false,
        reason: `hour ${localNow.hour} != target ${targetHour}`,
      };
    }
  }

  // Chase the day that has just ended. Chasing TODAY at 6pm would nag closers
  // still on calls, which is how a useful nudge becomes a resented one.
  const reported = formatInTimeZone(new Date(nowMs - 86_400_000), tz);
  const dayKey = `${reported.year}-${pad2(reported.month)}-${pad2(reported.day)}`;

  const reportedWeekday = WEEKDAY_INDEX[reported.weekday] ?? -1;
  const allowedDays = team.eodNudgeDays ?? DEFAULT_REPORT_DAYS;
  if (!opts?.force && !allowedDays.includes(reportedWeekday)) {
    return { sent: false, reason: `weekday ${reportedWeekday} not selected` };
  }

  const dedupKey = `${team._id}_eod_nudge_${dayKey}${opts?.dedupSuffix ?? ""}`;
  const alreadySent = await ctx.runQuery(
    internal.setterDataNotifications.hasNotificationByDedupKey,
    { dedupKey },
  );
  if (alreadySent) return { sent: false, reason: "already sent for this date" };

  const data = await ctx.runQuery(internal.eodNudge.getEodNudgeData, {
    teamId: team._id as Id<"teams">,
    dayKey,
  });

  if (!data) return { sent: false, reason: "no data" };
  // The whole point: say nothing when there's nothing to chase.
  if (data.missing.length === 0) {
    return { sent: false, reason: "everyone filed" };
  }

  const channel = team.eodNudgeChannel;
  if (channel !== "slack" && channel !== "discord") {
    return { sent: false, reason: "no notification channel configured" };
  }

  const isTest = opts?.dedupSuffix?.includes("_test") === true;
  const fallbackText = `📝 ${data.missing.length} ${data.missing.length === 1 ? "closer hasn't" : "closers haven't"} filed their end-of-day`;

  if (channel === "slack") {
    const slackChannelId = team.eodNudgeSlackChannelId || team.slackChannelId;
    if (!team.slackAccessToken || !slackChannelId) {
      return { sent: false, reason: "slack not connected or no channel" };
    }
    const result = await postSlackMessage({
      accessToken: team.slackAccessToken,
      channelId: slackChannelId,
      text: fallbackText,
      blocks: isTest
        ? withSlackTestLabel(buildSlackBlocks(data, reported))
        : buildSlackBlocks(data, reported),
    });
    if (!result.ok) throw new Error(`Slack post failed: ${result.error}`);
  } else {
    const webhookUrl = team.eodNudgeDiscordWebhookUrl;
    if (!webhookUrl) {
      return { sent: false, reason: "no discord webhook configured" };
    }
    const result = await postDiscordWebhook({
      webhookUrl,
      content: fallbackText,
      embed: isTest
        ? withDiscordTestLabel(buildDiscordEmbed(data, reported))
        : buildDiscordEmbed(data, reported),
    });
    if (!result.ok) throw new Error(`Discord post failed: ${result.error}`);
  }

  await ctx.runMutation(internal.setterDataNotifications.recordSentNotification, {
    teamId: team._id,
    type: "eod_nudge",
    dedupKey,
  });

  return { sent: true };
}

export const runEodNudges = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ processed: number; skipped: number; errored: number }> => {
    const now = Date.now();
    const teams = (await ctx.runQuery(
      internal.eodNudgeNotifications.getEnabledEodNudgeTeams,
      {},
    )) as TeamDoc[];

    let processed = 0;
    let skipped = 0;
    let errored = 0;

    for (const team of teams) {
      try {
        const result = await maybeSendEodNudgeForTeam(ctx, team, now);
        if (result.sent) processed++;
        else skipped++;
      } catch (err) {
        // One team's dead webhook must not stop everyone else's nudge.
        errored++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[runEodNudges] Error for team ${team._id}:`, message);
        await ctx.runAction(internal.lib.sentry.captureFromIsolate, {
          message: `EOD nudge failed to send: ${message}`,
          feature: "eod-nudge",
          integration: team.eodNudgeChannel ?? "unknown",
          extra: { teamId: String(team._id) },
        });
      }
    }

    return { processed, skipped, errored };
  },
});

/** Send one team's nudge now, skipping the hour, weekday and dedup gates. */
export const sendEodNudgeForTeamNow = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const team = (await ctx.runQuery(
      internal.eodNudgeNotifications.getTeamForEodNudge,
      { teamId: args.teamId },
    )) as TeamDoc | null;
    if (!team) return { sent: false, reason: "team not found" };
    return await maybeSendEodNudgeForTeam(ctx, team, Date.now(), {
      force: true,
      dedupSuffix: `_test_${Date.now()}`,
    });
  },
});
