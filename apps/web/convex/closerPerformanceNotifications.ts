import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  formatInTimeZone,
  humanReadableDate,
  pad2,
  postDiscordWebhook,
  postSlackMessage,
  type ZonedDate,
} from "./setterDataNotifications";
import { DEFAULT_TIMEZONE } from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Daily Team Performance scoreboard -> Slack / Discord.
//
// Deliberately the same machinery as the setter scorecard: hourly cron, gated
// on each team's local delivery hour, deduped on
// `${teamId}_closer_scorecard_${date}`, dedup recorded only AFTER a
// successful send so a transient failure doesn't permanently swallow a day.
//
// Numbers come from the same rollup the dashboard reads, so the post and the
// tab can never disagree.
// ============================================================================

type ActionCtx = any;
type TeamDoc = Doc<"teams">;

/** 0=Sun..6=Sat, matching JS getDay() and the schema field. */
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Report on Mon-Fri activity unless the team says otherwise. */
export const DEFAULT_REPORT_DAYS = [1, 2, 3, 4, 5];

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);
/** "1 close" / "2 closes" — a scoreboard reading "1 closes" looks unfinished. */
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Teams with the closer scoreboard switched on and an hour configured. */
export const getEnabledCloserScorecardTeams = internalQuery({
  args: {},
  handler: async (ctx): Promise<TeamDoc[]> => {
    const teams = await ctx.db.query("teams").take(1000);
    return teams.filter(
      (t) =>
        t.closerDailyScorecardEnabled === true &&
        typeof t.closerDailyScorecardHourLocal === "number",
    ) as TeamDoc[];
  },
});

function buildSlackBlocks(data: any, zd: ZonedDate): any[] {
  const t = data.dayTotals;
  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `🏆 Team Performance — ${humanReadableDate(zd)}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Cash*\n${money(t.cash)}` },
        { type: "mrkdwn", text: `*Closes*\n${t.closes}` },
        { type: "mrkdwn", text: `*Booked*\n${t.booked}` },
        { type: "mrkdwn", text: `*Taken*\n${t.taken}` },
      ],
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Show rate*\n${pct(data.dayRates.showPct)}` },
        { type: "mrkdwn", text: `*Close rate*\n${pct(data.dayRates.closePct)}` },
      ],
    },
  ];

  if (data.rows.length > 0) {
    const medals = ["🥇", "🥈", "🥉"];
    const lines = data.rows
      .map((r: any, i: number) => {
        const badge = medals[i] ?? `${i + 1}.`;
        const parts = [plural(r.taken, "call", "calls")];
        if (r.closes > 0) parts.push(`${plural(r.closes, "close", "closes")}`);
        return `${badge} *${r.name}* — ${money(r.cash)}  _(${parts.join(", ")})_`;
      })
      .join("\n");
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*By closer*\n${lines}` },
    });
  }

  // Month to date gives a single day its meaning — a slow Tuesday inside a
  // record month is a different message from a slow Tuesday in a slow month.
  const m = data.monthTotals;
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Month to date: *${money(m.cash)}* · ${plural(m.closes, "close", "closes")} · ${plural(m.taken, "call taken", "calls taken")}`,
      },
    ],
  });

  // Say when the numbers are incomplete rather than let a quiet zero read as
  // a bad day.
  if (data.dayCoverage.lowCoverage && data.dayCoverage.taken > 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `⚠️ ${data.dayCoverage.missingOutcomes} of ${data.dayCoverage.taken} calls have no outcome logged, so closes and cash are understated.`,
        },
      ],
    });
  }

  return blocks;
}

function buildDiscordEmbed(data: any, zd: ZonedDate): any {
  const t = data.dayTotals;
  const fields: any[] = [
    { name: "Cash", value: money(t.cash), inline: true },
    { name: "Closes", value: String(t.closes), inline: true },
    { name: "Booked", value: String(t.booked), inline: true },
    { name: "Taken", value: String(t.taken), inline: true },
    { name: "Show rate", value: pct(data.dayRates.showPct), inline: true },
    { name: "Close rate", value: pct(data.dayRates.closePct), inline: true },
  ];

  if (data.rows.length > 0) {
    fields.push({
      name: "By closer",
      value: data.rows
        .map(
          (r: any, i: number) =>
            `${i + 1}. **${r.name}** — ${money(r.cash)} (${plural(r.taken, "call", "calls")}${r.closes > 0 ? `, ${plural(r.closes, "close", "closes")}` : ""})`,
        )
        .join("\n")
        .slice(0, 1024),
      inline: false,
    });
  }

  const m = data.monthTotals;
  let footer = `Month to date: ${money(m.cash)} · ${plural(m.closes, "close", "closes")} · ${plural(m.taken, "call taken", "calls taken")}`;
  if (data.dayCoverage.lowCoverage && data.dayCoverage.taken > 0) {
    footer += `\n⚠️ ${data.dayCoverage.missingOutcomes} of ${data.dayCoverage.taken} calls have no outcome logged`;
  }

  return {
    title: `🏆 Team Performance — ${humanReadableDate(zd)}`,
    color: 0x18181b,
    fields,
    footer: { text: footer.slice(0, 2048) },
  };
}

export async function maybeSendForTeam(
  ctx: ActionCtx,
  team: TeamDoc,
  nowMs: number,
  opts?: { force?: boolean; dedupSuffix?: string },
): Promise<{ sent: boolean; reason?: string }> {
  const tz = team.timezone || DEFAULT_TIMEZONE;

  // `force` is the "send test now" path: skip the hour gate so a manager can
  // see the real message in their real channel instead of trusting a preview.
  if (!opts?.force) {
    const targetHour = team.closerDailyScorecardHourLocal;
    if (typeof targetHour !== "number") {
      return { sent: false, reason: "no target hour configured" };
    }
    const localNow = formatInTimeZone(new Date(nowMs), tz);
    // The cron fires hourly; matching on the local hour gives a one-hour
    // window so slight cron drift still lands in the right slot.
    if (localNow.hour !== targetHour) {
      return {
        sent: false,
        reason: `hour ${localNow.hour} != target ${targetHour}`,
      };
    }
  }

  const yesterday = formatInTimeZone(new Date(nowMs - 86_400_000), tz);
  const dayKey = `${yesterday.year}-${pad2(yesterday.month)}-${pad2(yesterday.day)}`;

  // Gate on the weekday of the day being REPORTED, not the day we post. A
  // team that works Mon-Fri wants Friday's numbers on Saturday morning if
  // that's their delivery hour; what they don't want is a Monday post about
  // a dead Sunday.
  const reportedWeekday = WEEKDAY_INDEX[yesterday.weekday] ?? -1;
  const allowedDays = team.closerDailyScorecardDays ?? DEFAULT_REPORT_DAYS;
  if (!opts?.force && !allowedDays.includes(reportedWeekday)) {
    return { sent: false, reason: `weekday ${reportedWeekday} not selected` };
  }
  const monthKey = dayKey.slice(0, 7);

  const dedupKey = `${team._id}_closer_scorecard_${dayKey}${opts?.dedupSuffix ?? ""}`;
  const alreadySent = await ctx.runQuery(
    internal.setterDataNotifications.hasNotificationByDedupKey,
    { dedupKey },
  );
  if (alreadySent) return { sent: false, reason: "already sent for this date" };

  const data = await ctx.runQuery(
    internal.closerScorecardData.getCloserScorecardData,
    { teamId: team._id, dayKey, monthKey },
  );

  // A post saying "0 booked, 0 taken" every weekend teaches the channel to
  // ignore the bot. Silence on a dead day is the correct message.
  if (!data) return { sent: false, reason: "no data" };
  if (data.isEmpty && !opts?.force) {
    return { sent: false, reason: "no activity for this day" };
  }

  const channel = team.closerDailyScorecardChannel;
  if (channel !== "slack" && channel !== "discord") {
    return { sent: false, reason: "no notification channel configured" };
  }

  const fallbackText = `🏆 Team Performance — ${humanReadableDate(yesterday)}`;

  if (channel === "slack") {
    const slackChannelId =
      team.closerDailyScorecardSlackChannelId || team.slackChannelId;
    if (!team.slackAccessToken || !slackChannelId) {
      return { sent: false, reason: "slack not connected or no channel" };
    }
    const result = await postSlackMessage({
      accessToken: team.slackAccessToken,
      channelId: slackChannelId,
      text: fallbackText,
      blocks: buildSlackBlocks(data, yesterday),
    });
    if (!result.ok) throw new Error(`Slack post failed: ${result.error}`);
  } else {
    const webhookUrl = team.closerDailyScorecardDiscordWebhookUrl;
    if (!webhookUrl) {
      return { sent: false, reason: "no discord webhook configured" };
    }
    const result = await postDiscordWebhook({
      webhookUrl,
      content: fallbackText,
      embed: buildDiscordEmbed(data, yesterday),
    });
    if (!result.ok) throw new Error(`Discord post failed: ${result.error}`);
  }

  // Recorded only after a successful send, so a transient outage doesn't mark
  // the day delivered and silently skip it forever.
  await ctx.runMutation(
    internal.setterDataNotifications.recordSentNotification,
    { teamId: team._id, type: "closer_daily_scorecard", dedupKey },
  );

  return { sent: true };
}

export const runCloserScorecards = internalAction({
  args: {},
  // Explicit return type — without it TypeScript recurses through the
  // api.d.ts back-reference to this same function.
  handler: async (
    ctx,
  ): Promise<{
    processed: number;
    skipped: number;
    errored: number;
    candidateTeams: number;
  }> => {
    const now = Date.now();
    const teams = (await ctx.runQuery(
      internal.closerPerformanceNotifications.getEnabledCloserScorecardTeams,
      {},
    )) as TeamDoc[];

    let processed = 0;
    let skipped = 0;
    let errored = 0;

    for (const team of teams) {
      try {
        const result = await maybeSendForTeam(ctx, team, now);
        if (result.sent) processed++;
        else skipped++;
      } catch (err) {
        // One team's misconfigured webhook must not stop everyone else's post.
        errored++;
        console.error(
          `[runCloserScorecards] Error for team ${team._id}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    return { processed, skipped, errored, candidateTeams: teams.length };
  },
});

/**
 * Send one team's scoreboard immediately, bypassing the hour gate.
 *
 * internalAction on purpose: it loads the team doc, which carries
 * slackAccessToken. Convex queries are callable by anyone holding the
 * deployment URL, so that document must never be returned to a public
 * caller — the public entry point passes a teamId and gets back a result,
 * nothing more.
 */
export const sendScorecardForTeamNow = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const team = (await ctx.runQuery(
      internal.closerPerformanceNotifications.getTeamForScorecard,
      { teamId: args.teamId },
    )) as TeamDoc | null;
    if (!team) return { sent: false, reason: "team not found" };
    return maybeSendForTeam(ctx, team, Date.now(), {
      force: true,
      dedupSuffix: `_test_${Date.now()}`,
    });
  },
});

export const getTeamForScorecard = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<TeamDoc | null> => {
    return (await ctx.db.get(args.teamId)) as TeamDoc | null;
  },
});
