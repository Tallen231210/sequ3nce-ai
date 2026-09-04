import { v } from "convex/values";
import { withSlackTestLabel, withDiscordTestLabel } from "./lib/testLabel";
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

/**
 * 0=Sun..6=Sat, matching JS getDay() and the schema field.
 *
 * Exported so the end-of-day nudge gates on weekdays the same way rather than
 * keeping its own copy that can drift.
 */
export const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Report on Mon-Fri activity unless the team says otherwise. */
export const DEFAULT_REPORT_DAYS = [1, 2, 3, 4, 5];

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** Cash ÷ calls taken. "—" until a call was taken, never $0 for an idle day. */
const perLive = (cash: number, taken: number) =>
  taken > 0 ? money(cash / taken) : "—";
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

/**
 * Slack renders at most 50 blocks and truncates the rest silently. Two blocks
 * per closer plus the header and footers keeps a 20-rep team inside that, and
 * anything beyond is reported rather than dropped.
 */
const MAX_CLOSERS_SHOWN = 20;
const shown = (rows: any[]) => rows.slice(0, MAX_CLOSERS_SHOWN);

/**
 * " (+3)" / " (-$400)" — or nothing at all.
 *
 * Absent when there's no previous day and when the number didn't move, because
 * a column of "(0)" is noise that hides the deltas that matter. Cash gets the
 * money formatter; counts print bare.
 */
function delta(
  now: number,
  before: number | undefined,
  fmt: (n: number) => string = (n) => String(n),
): string {
  if (before === undefined || before === null) return "";
  const diff = now - before;
  if (diff === 0) return "";
  return `  _(${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))})_`;
}

/** Same as `delta`, without Slack's italics — Discord renders `_..._` literally here. */
function dDelta(
  now: number,
  before: number | undefined,
  fmt: (n: number) => string = (n) => String(n),
): string {
  if (before === undefined || before === null) return "";
  const diff = now - before;
  if (diff === 0) return "";
  return ` (${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))})`;
}

/** "Fri 14 Aug" from a YYYY-MM-DD key, for labelling what we compared against. */
function humanReadableDayKey(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function buildSlackBlocks(data: any, zd: ZonedDate): any[] {
  const t = data.dayTotals;
  // Null on a team's very first reported day, and after a fortnight of silence.
  const p = data.prevDayTotals as any | null;
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
        { type: "mrkdwn", text: `*Cash*\n${money(t.cash)}${delta(t.cash, p?.cash, money)}` },
        { type: "mrkdwn", text: `*Closes*\n${t.closes}${delta(t.closes, p?.closes)}` },
        { type: "mrkdwn", text: `*Booked*\n${t.booked}${delta(t.booked, p?.booked)}` },
        { type: "mrkdwn", text: `*Taken*\n${t.taken}${delta(t.taken, p?.taken)}` },
        { type: "mrkdwn", text: `*Offers*\n${t.offers}${delta(t.offers, p?.offers)}` },
        {
          type: "mrkdwn",
          text: `*${data.dealValueShortLabel ?? "Contract"}*\n${money(t.contractValue)}${delta(t.contractValue, p?.contractValue, money)}`,
        },
      ],
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Show rate*\n${pct(data.dayRates.showPct)}` },
        { type: "mrkdwn", text: `*Offer → Close*\n${pct(data.dayRates.offerClosePct)}` },
        { type: "mrkdwn", text: `*Close rate*\n${pct(data.dayRates.closePct)}` },
        { type: "mrkdwn", text: `*Booked %*\n${pct(data.dayRates.bookedPct)}` },
        { type: "mrkdwn", text: `*$ / live call*\n${perLive(t.cash, t.taken)}` },
      ],
    },
  ];

  if (data.rows.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: data.prevDayKey
          ? `*By closer*  _(vs ${humanReadableDayKey(data.prevDayKey)})_`
          : "*By closer*",
      },
    });

    const medals = ["🥇", "🥈", "🥉"];
    // A block per closer rather than one line each. The ask was every field
    // they fill in at end of day, per person — that doesn't fit on a line, and
    // squeezing it onto one produces something nobody reads.
    for (const [i, r] of shown(data.rows).entries()) {
      const badge = medals[i] ?? `${i + 1}.`;
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${badge} *${r.name}* — ${money(r.cash)}${delta(r.cash, r.prev?.cash, money)}`,
        },
        fields: [
          { type: "mrkdwn", text: `*Slots*\n${r.slots}${delta(r.slots, r.prev?.slots)}` },
          { type: "mrkdwn", text: `*Booked*\n${r.booked}${delta(r.booked, r.prev?.booked)}` },
          { type: "mrkdwn", text: `*Taken*\n${r.taken}${delta(r.taken, r.prev?.taken)}` },
          { type: "mrkdwn", text: `*Offers*\n${r.offers}${delta(r.offers, r.prev?.offers)}` },
          { type: "mrkdwn", text: `*Closes*\n${r.closes}${delta(r.closes, r.prev?.closes)}` },
          {
            type: "mrkdwn",
            text: `*${data.dealValueShortLabel ?? "Contract"}*\n${money(r.contractValue)}${delta(r.contractValue, r.prev?.contractValue, money)}`,
          },
        ],
      });
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text:
              `Show ${pct(r.showPct)} · Offer→Close ${pct(r.offerClosePct)} · Close ${pct(r.closePct)} · $/live call ${perLive(r.cash, r.taken)}` +
              (r.prev ? "" : "  ·  _first day with numbers, nothing to compare_"),
          },
        ],
      });
    }

    // Never truncate quietly — a manager reading eight names must not assume
    // that's everyone who worked.
    const hidden = data.rows.length - shown(data.rows).length;
    if (hidden > 0) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_+${hidden} more ${hidden === 1 ? "closer" : "closers"} — see the Team Performance tab for the full list._`,
          },
        ],
      });
    }
  }

  // Month to date gives a single day its meaning — a slow Tuesday inside a
  // record month is a different message from a slow Tuesday in a slow month.
  const m = data.monthTotals;
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Month to date: *${money(m.cash)}* · ${plural(m.closes, "close", "closes")} · ${plural(m.taken, "call taken", "calls taken")} · ${perLive(m.cash, m.taken)} per live call`,
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
  const p = data.prevDayTotals as any | null;
  const fields: any[] = [
    { name: "Cash", value: `${money(t.cash)}${dDelta(t.cash, p?.cash, money)}`, inline: true },
    { name: "Closes", value: `${t.closes}${dDelta(t.closes, p?.closes)}`, inline: true },
    { name: "Booked", value: `${t.booked}${dDelta(t.booked, p?.booked)}`, inline: true },
    { name: "Taken", value: `${t.taken}${dDelta(t.taken, p?.taken)}`, inline: true },
    { name: "Offers", value: `${t.offers}${dDelta(t.offers, p?.offers)}`, inline: true },
    {
      name: data.dealValueShortLabel ?? "Contract",
      value: `${money(t.contractValue)}${dDelta(t.contractValue, p?.contractValue, money)}`,
      inline: true,
    },
    { name: "Show rate", value: pct(data.dayRates.showPct), inline: true },
    { name: "Offer → Close", value: pct(data.dayRates.offerClosePct), inline: true },
    { name: "Close rate", value: pct(data.dayRates.closePct), inline: true },
    { name: "$ / live call", value: perLive(t.cash, t.taken), inline: true },
  ];

  if (data.rows.length > 0) {
    // Discord caps a field value at 1024 characters and drops the overflow, so
    // the per-closer detail is built line by line and stopped deliberately
    // rather than sliced mid-name.
    const lines: string[] = [];
    let used = 0;
    let rendered = 0;
    for (const r of shown(data.rows)) {
      const line =
        `**${r.name}** — ${money(r.cash)}${dDelta(r.cash, r.prev?.cash, money)}\n` +
        `Slots ${r.slots}${dDelta(r.slots, r.prev?.slots)} · ` +
        `Booked ${r.booked}${dDelta(r.booked, r.prev?.booked)} · ` +
        `Taken ${r.taken}${dDelta(r.taken, r.prev?.taken)} · $/live call ${perLive(r.cash, r.taken)} · ` +
        `Offers ${r.offers}${dDelta(r.offers, r.prev?.offers)} · ` +
        `Closes ${r.closes}${dDelta(r.closes, r.prev?.closes)}\n` +
        `Show ${pct(r.showPct)} · Offer→Close ${pct(r.offerClosePct)} · Close ${pct(r.closePct)}`;
      if (used + line.length + 1 > 1000) break;
      lines.push(line);
      used += line.length + 1;
      rendered++;
    }
    const omitted = data.rows.length - rendered;
    if (omitted > 0) lines.push(`_+${omitted} more — see the Team Performance tab._`);
    fields.push({
      name: data.prevDayKey
        ? `By closer (vs ${humanReadableDayKey(data.prevDayKey)})`
        : "By closer",
      value: lines.join("\n\n").slice(0, 1024),
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

  const isTest = opts?.dedupSuffix?.includes("_test") === true;
  const alreadySent = await ctx.runQuery(
    internal.setterDataNotifications.hasNotificationByDedupKey,
    { dedupKey },
  );
  if (alreadySent) return { sent: false, reason: "already sent for this date" };

  const data = await ctx.runQuery(
    internal.closerScorecardData.getCloserScorecardData,
    { teamId: team._id, dayKey, monthKey },
  );
  // Team's own name for the contract-value field (E2: "Deal total").
  data.dealValueShortLabel = (team as any).dealValueShortLabel || (team as any).dealValueLabel || "Contract";

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
      blocks: isTest
        ? withSlackTestLabel(buildSlackBlocks(data, yesterday))
        : buildSlackBlocks(data, yesterday),
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
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[runCloserScorecards] Error for team ${team._id}:`, message);
        // Convex logs alone would leave this invisible: an expired Slack token
        // stops the morning post and nothing else changes, so the only signal
        // is a channel going quiet. Page someone instead.
        await ctx.runAction(internal.lib.sentry.captureFromIsolate, {
          message: `Closer scoreboard failed to send: ${message}`,
          feature: "closer-daily-scorecard",
          integration: team.closerDailyScorecardChannel ?? "unknown",
          extra: { teamId: String(team._id) },
        });
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
