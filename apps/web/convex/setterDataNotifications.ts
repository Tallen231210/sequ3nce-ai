import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { ScorecardData, ScorecardSetterRow } from "./setterDataMetrics";

// ============================================================================
// Setter Data — daily scorecard notification cron.
//
// Runs hourly (registered in crons.ts). For each team where:
//   - setterDataEnabled !== false
//   - setterDailyScorecardEnabled === true
//   - setterDailyScorecardHourLocal matches the current hour in
//     team.timezone
// We compute yesterday's metrics, format them as Slack blocks + Discord
// embed, and post to whichever channel the team has configured (slack
// XOR discord — set via the Settings tab in Phase 1.11).
//
// Dedup uses the `dedupKey` column on slackNotifications added in Phase 1.3.
// Key format: `${teamId}_scorecard_${YYYY-MM-DD}` where the date is
// yesterday's date in the team's local timezone. This means a team
// gets at most one scorecard per local-day even if the hourly cron
// re-runs (clock skew, deploy restart, etc.).
// ============================================================================

const DEFAULT_TIMEZONE = "America/New_York";

// ----------------------------------------------------------------------------
// MAIN CRON ENTRY
// ----------------------------------------------------------------------------

export const runScorecards = internalAction({
  args: {},
  // Explicit return type breaks the circular inference TypeScript otherwise
  // does through the api.d.ts back-reference to this same function.
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
      internal.setterDataNotifications.getEnabledScorecardTeams,
      {},
    )) as TeamDoc[];

    let processed = 0;
    let skipped = 0;
    let errored = 0;

    for (const team of teams) {
      try {
        const result = await maybeSendScorecardForTeam(ctx, team, now);
        if (result.sent) processed++;
        else skipped++;
      } catch (err) {
        errored++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[runScorecards] Error for team ${team._id}: ${message}`,
          err,
        );
      }
    }

    return { processed, skipped, errored, candidateTeams: teams.length };
  },
});

// ----------------------------------------------------------------------------
// Per-team gating + send orchestration
// ----------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionCtx = any;
type TeamDoc = Doc<"teams">;

async function maybeSendScorecardForTeam(
  ctx: ActionCtx,
  team: TeamDoc,
  nowMs: number,
): Promise<{ sent: boolean; reason?: string }> {
  const targetHour = team.setterDailyScorecardHourLocal;
  if (typeof targetHour !== "number") {
    return { sent: false, reason: "no target hour configured" };
  }

  const tz = team.timezone || DEFAULT_TIMEZONE;
  const localNow = formatInTimeZone(new Date(nowMs), tz);

  // Only fire if the current local hour matches the team's configured
  // delivery hour. The cron runs every 60 min; the hour comparison gives
  // us a 1-hour window so we'll always catch the right moment even if
  // cron timing drifts slightly.
  if (localNow.hour !== targetHour) {
    return { sent: false, reason: `hour ${localNow.hour} != target ${targetHour}` };
  }

  // Compute yesterday's date in team timezone.
  const yesterday = formatInTimeZone(new Date(nowMs - 24 * 60 * 60 * 1000), tz);
  const yesterdayDateStr = `${yesterday.year}-${pad2(yesterday.month)}-${pad2(yesterday.day)}`;

  // Dedup check.
  const dedupKey = `${team._id}_scorecard_${yesterdayDateStr}`;
  const alreadySent = await ctx.runQuery(
    internal.setterDataNotifications.hasNotificationByDedupKey,
    { dedupKey },
  );
  if (alreadySent) {
    return { sent: false, reason: "already sent for this date" };
  }

  // Compute yesterday's UTC ms range.
  const range = getLocalDateRangeUtc(yesterdayDateStr, tz);

  const data: ScorecardData = await ctx.runQuery(
    internal.setterDataMetrics.getScorecardData,
    {
      teamId: team._id,
      rangeStart: range.startMs,
      rangeEnd: range.endMs,
    },
  );

  // Pre-flight: do we have anywhere to send?
  const channel = team.setterDailyScorecardChannel;
  if (channel !== "slack" && channel !== "discord") {
    return { sent: false, reason: "no notification channel configured" };
  }

  const fallbackText = `📊 Setter Scorecard — ${humanReadableDate(yesterday)}`;

  if (channel === "slack") {
    const slackChannelId =
      team.setterDailyScorecardSlackChannelId || team.slackChannelId;
    if (!team.slackAccessToken || !slackChannelId) {
      return { sent: false, reason: "slack not connected or no channel" };
    }
    const blocks = buildScorecardSlackBlocks({
      data,
      yesterday,
      yesterdayDateStr,
    });
    const result = await postSlackMessage({
      accessToken: team.slackAccessToken,
      channelId: slackChannelId,
      text: fallbackText,
      blocks,
    });
    if (!result.ok) {
      throw new Error(`Slack post failed: ${result.error}`);
    }
  } else {
    const webhookUrl = team.setterDailyScorecardDiscordWebhookUrl;
    if (!webhookUrl) {
      return { sent: false, reason: "no discord webhook configured" };
    }
    const embed = buildScorecardDiscordEmbed({
      data,
      yesterday,
      yesterdayDateStr,
    });
    const result = await postDiscordWebhook({
      webhookUrl,
      content: fallbackText,
      embed,
    });
    if (!result.ok) {
      throw new Error(`Discord post failed: ${result.error}`);
    }
  }

  // Record dedup AFTER successful send so a transient send error doesn't
  // permanently mark the day as delivered.
  await ctx.runMutation(internal.setterDataNotifications.recordSentNotification, {
    teamId: team._id,
    type: "setter_daily_scorecard",
    dedupKey,
  });

  return { sent: true };
}

// ----------------------------------------------------------------------------
// Internal queries + mutations (V8 isolate runtime)
// ----------------------------------------------------------------------------

/**
 * Find all teams that have setter data enabled AND daily scorecard
 * enabled. Filtering happens in JS — the candidate set is bounded to
 * one row per B2B customer.
 */
export const getEnabledScorecardTeams = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("teams").collect();
    return all.filter(
      (t) =>
        t.setterDataEnabled !== false &&
        t.setterDailyScorecardEnabled === true &&
        typeof t.setterDailyScorecardHourLocal === "number",
    );
  },
});

/**
 * Look up whether we've already sent a notification for a given dedup
 * key. Used by the scorecard cron to avoid double-sending.
 */
export const hasNotificationByDedupKey = internalQuery({
  args: { dedupKey: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("slackNotifications")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_dedup_key", (q: any) => q.eq("dedupKey", args.dedupKey))
      .first();
    return existing !== null;
  },
});

/**
 * Insert a dedup row for a non-call notification (scorecards, untouched
 * alerts, etc.). callId is intentionally omitted; the dedupKey is the
 * uniqueness boundary.
 */
export const recordSentNotification = internalMutation({
  args: {
    teamId: v.id("teams"),
    type: v.string(),
    dedupKey: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("slackNotifications", {
      teamId: args.teamId,
      callId: undefined,
      type: args.type,
      sentAt: Date.now(),
      dedupKey: args.dedupKey,
    });
  },
});

// ----------------------------------------------------------------------------
// Slack + Discord HTTP senders (kept inline so we can use the dedicated
// setterDailyScorecard* fields as channel routing rather than fitting
// into slack.ts / discord.ts which key off slackNotificationChannels).
// ----------------------------------------------------------------------------

interface SlackPostArgs {
  accessToken: string;
  channelId: string;
  text: string;
  blocks: unknown[];
}

async function postSlackMessage(args: SlackPostArgs): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: args.channelId,
      text: args.text,
      blocks: args.blocks,
    }),
  });
  const data = (await response.json()) as { ok?: boolean; error?: string };
  if (!data.ok) {
    return { ok: false, error: data.error || "unknown slack error" };
  }
  return { ok: true };
}

interface DiscordPostArgs {
  webhookUrl: string;
  content: string;
  embed: unknown;
}

async function postDiscordWebhook(args: DiscordPostArgs): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(args.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: args.content,
      embeds: [args.embed],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, error: `${response.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}

// ----------------------------------------------------------------------------
// Formatters
// ----------------------------------------------------------------------------

interface FormatArgs {
  data: ScorecardData;
  yesterday: ZonedDate;
  yesterdayDateStr: string;
}

function buildScorecardSlackBlocks(args: FormatArgs): unknown[] {
  const { data, yesterday } = args;
  const dateLabel = humanReadableDate(yesterday);

  // Header.
  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `📊 Setter Scorecard — ${dateLabel}` },
    },
  ];

  // KPI summary line.
  const kpiLines: string[] = [];
  if (data.avgSpeedMs !== null) {
    kpiLines.push(`*Speed to lead (avg):* ${formatDuration(data.avgSpeedMs)}`);
    if (data.p50SpeedMs !== null) {
      kpiLines.push(`*Median:* ${formatDuration(data.p50SpeedMs)}`);
    }
    if (data.p90SpeedMs !== null) {
      kpiLines.push(`*P90:* ${formatDuration(data.p90SpeedMs)}`);
    }
  } else {
    kpiLines.push("*Speed to lead:* —");
  }

  if (data.totalLeads > 0) {
    const ratePct = data.connectedRate !== null ? Math.round(data.connectedRate * 100) : 0;
    kpiLines.push(
      `*Connections:* ${data.connectedLeads} of ${data.totalLeads} (${ratePct}%)`,
    );
  } else {
    kpiLines.push("*Connections:* — (no leads yesterday)");
  }
  kpiLines.push(`*Untouched:* ${data.untouchedLeads}`);

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: kpiLines.join("\n") },
  });

  // Per-setter top performers.
  if (data.perSetter.length > 0) {
    blocks.push({ type: "divider" });
    const topRows = data.perSetter.slice(0, 3);
    const lines = topRows.map((row) => formatSetterLine(row));
    if (lines.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Top performers:*\n${lines.join("\n")}`,
        },
      });
    }

    // If there are setters at the bottom (slow/missing) and at least one of
    // them is meaningfully slower, surface them too.
    if (data.perSetter.length > 3) {
      const bottomRows = data.perSetter.slice(-Math.min(3, data.perSetter.length - 3));
      const bottomLines = bottomRows
        .filter((r) => r.avgSpeedMs !== null) // skip the never-dialed setters
        .map((row) => formatSetterLine(row));
      if (bottomLines.length > 0) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Needs attention:*\n${bottomLines.join("\n")}`,
          },
        });
      }
    }
  }

  // Empty-state callout when no leads at all.
  if (data.totalLeads === 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_No setter activity yesterday — leaderboard resets today._",
        },
      ],
    });
  }

  // Footer with link.
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "<https://sequ3nce.ai/dashboard/setter-data|View full report →>",
      },
    ],
  });

  return blocks;
}

function buildScorecardDiscordEmbed(args: FormatArgs): unknown {
  const { data, yesterday } = args;
  const dateLabel = humanReadableDate(yesterday);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (data.avgSpeedMs !== null) {
    fields.push({
      name: "Speed to lead (avg)",
      value: formatDuration(data.avgSpeedMs),
      inline: true,
    });
  }
  if (data.totalLeads > 0) {
    const ratePct = data.connectedRate !== null ? Math.round(data.connectedRate * 100) : 0;
    fields.push({
      name: "Connections",
      value: `${data.connectedLeads} / ${data.totalLeads} (${ratePct}%)`,
      inline: true,
    });
  }
  fields.push({
    name: "Untouched",
    value: String(data.untouchedLeads),
    inline: true,
  });

  if (data.perSetter.length > 0) {
    const topLines = data.perSetter
      .slice(0, 3)
      .map((row) => formatSetterLine(row));
    fields.push({
      name: "Top performers",
      value: topLines.join("\n") || "—",
    });
  }

  if (data.totalLeads === 0) {
    fields.push({
      name: "Status",
      value: "No setter activity yesterday — leaderboard resets today.",
    });
  }

  return {
    title: `📊 Setter Scorecard — ${dateLabel}`,
    url: "https://sequ3nce.ai/dashboard/setter-data",
    color: 0x6366f1, // indigo — matches dashboard accent
    fields,
    footer: { text: "Sequ3nce Setter Data" },
  };
}

function formatSetterLine(row: ScorecardSetterRow): string {
  const speed = row.avgSpeedMs !== null ? formatDuration(row.avgSpeedMs) : "no dials";
  const conn =
    row.leadCount > 0
      ? `${row.connectedCount}/${row.leadCount} connected`
      : "0 leads";
  return `• *${row.name}* — ${speed}, ${conn}`;
}

// ----------------------------------------------------------------------------
// Time / date helpers
// ----------------------------------------------------------------------------

interface ZonedDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  weekday: string; // "Mon" | "Tue" | ...
}

/**
 * Format a UTC instant in a given IANA timezone. Returns the local date
 * components (used for "is it the right hour?" gating + "yesterday in
 * team tz" math). Avoids pulling in date-fns-tz; Intl.DateTimeFormat
 * is built into the runtime.
 */
function formatInTimeZone(date: Date, tz: string): ZonedDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = parseInt(get("hour"), 10) % 24; // hour12=false sometimes returns "24"
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour,
    weekday: get("weekday"),
  };
}

/**
 * Given a YYYY-MM-DD date string interpreted in `tz`, return the UTC ms
 * range covering that local day. We look up the timezone offset by
 * formatting noon of that day and seeing which UTC instant produces
 * that local string — Intl doesn't expose offsets directly.
 */
function getLocalDateRangeUtc(
  yyyyMmDd: string,
  tz: string,
): { startMs: number; endMs: number } {
  // Approximate offset at noon local — enough precision since we only
  // need day boundaries.
  const [y, m, d] = yyyyMmDd.split("-").map((s) => parseInt(s, 10));
  const probeUtcMs = Date.UTC(y, m - 1, d, 12, 0, 0);
  const probeLocal = formatInTimeZone(new Date(probeUtcMs), tz);
  // Compute the offset (in minutes) that takes UTC → local. If local
  // says 7:00 when UTC is 12:00, the offset is -5h.
  const localProbeMs = Date.UTC(
    probeLocal.year,
    probeLocal.month - 1,
    probeLocal.day,
    probeLocal.hour,
    0,
    0,
  );
  const offsetMs = localProbeMs - probeUtcMs;

  // Local day starts at 00:00 in `tz`. Convert that to UTC by subtracting
  // the offset.
  const localMidnightUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMs;
  return {
    startMs: localMidnightUtcMs,
    endMs: localMidnightUtcMs + 24 * 60 * 60 * 1000,
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function humanReadableDate(zd: ZonedDate): string {
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${zd.weekday} ${monthNames[zd.month - 1]} ${zd.day}`;
}

/**
 * Render a duration in ms as a compact human string:
 *   < 1m → "Xs"
 *   < 1h → "Xm Ys" (drops Y if 0)
 *   ≥ 1h → "Xh Ym" (drops Y if 0)
 */
function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) {
    const sec = totalSec % 60;
    return sec === 0 ? `${totalMin}m` : `${totalMin}m ${sec}s`;
  }
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min === 0 ? `${hours}h` : `${hours}h ${min}m`;
}
