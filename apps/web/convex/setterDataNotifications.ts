import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { Doc } from "./_generated/dataModel";
import type { ScorecardData, ScorecardSetterRow } from "./setterDataMetrics";
import { buildBookingMatcherIndex } from "./setterCloserBookings";

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

// ============================================================================
// runUntouchedAlertSweep — every 2 min cron entry (Phase 2)
// ============================================================================
//
// Finds leads that have been sitting untouched longer than the team's
// configured threshold. Posts a Slack/Discord alert with the lead name +
// assigned setter. Dedup uses 15-min buckets — a lead crossing the
// threshold gets one alert per 15-min window, not one every 2 min while
// it sits there.
// ============================================================================

// Maximum age a lead can be (since GHL date_added) and still qualify for an
// untouched-lead alert. Tightened from the original 7-day window after a
// customer reported alerts feeling random and chaotic: "lead from today,
// then lead from 9 days ago." A 24h cap restricts the alert stream to
// genuinely fresh leads, which is the only state where a setter response
// is still meaningful. Anything older drops out and is treated as
// permanently stale for notification purposes (the dashboard still shows
// the lead — this only governs what fires into Slack/Discord).
const UNTOUCHED_MAX_LEAD_AGE_MS = 24 * 60 * 60 * 1000;

export const runUntouchedAlertSweep = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    teamsChecked: number;
    leadsAlerted: number;
    teamsErrored: number;
  }> => {
    const teams = (await ctx.runQuery(
      internal.setterDataNotifications.getEnabledUntouchedAlertTeams,
      {},
    )) as TeamDoc[];

    let leadsAlerted = 0;
    let teamsErrored = 0;

    for (const team of teams) {
      try {
        const count = await sweepUntouchedAlertsForTeam(ctx, team);
        leadsAlerted += count;
      } catch (err) {
        teamsErrored++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[runUntouchedAlertSweep] Error for team ${team._id}: ${message}`,
          err,
        );
      }
    }

    return { teamsChecked: teams.length, leadsAlerted, teamsErrored };
  },
});

interface UntouchedLead {
  leadId: string;
  ghlContactId: string;
  name?: string;
  email?: string;
  phone?: string;
  dateAdded: number;
  assignedToName?: string;
  assignedToGhlUserId?: string;
}

async function sweepUntouchedAlertsForTeam(
  ctx: ActionCtx,
  team: TeamDoc,
): Promise<number> {
  const thresholdMin = team.setterUntouchedAlertThresholdMinutes ?? 5;
  const cutoff = Date.now() - thresholdMin * 60 * 1000;

  const leads = (await ctx.runQuery(
    internal.setterDataNotifications.getUntouchedLeadsForTeam,
    { teamId: team._id, olderThanMs: cutoff },
  )) as UntouchedLead[];

  if (leads.length === 0) return 0;

  // Pre-flight: where would the alerts go? Skip cleanly if config is
  // incomplete rather than firing into the void.
  const channel = team.setterUntouchedAlertChannel;
  if (channel !== "slack" && channel !== "discord") return 0;

  // GHL location id for the "Open in GHL" deep link. Setter-data customers
  // connect via OAuth (locationId stored on setterGhlInstallations) while
  // the legacy ghlApiKey path stores it on the team row directly. Prefer
  // the OAuth install since that's what every customer on the new setter
  // data flow uses; fall back to the legacy field for older teams.
  // (Bug fix follow-up to 6b7eba5 — original used only team.ghlLocationId,
  // which is null for OAuth-installed customers like Gianni Scott's team.)
  const installation = (await ctx.runQuery(
    internal.setterGhlOauth.getActiveInstallationForTeam,
    { teamId: team._id },
  )) as { locationId: string } | null;
  const ghlLocationId =
    installation?.locationId ?? team.ghlLocationId ?? null;

  let alertsSent = 0;

  // Process oldest-first within the candidate window so a manager reading
  // alerts top-to-bottom sees them in the order each lead crossed the
  // threshold. Without this, the loop order matches whatever the index
  // returned and the stream feels random — the original complaint.
  const sortedLeads = [...leads].sort((a, b) => a.dateAdded - b.dateAdded);

  for (const lead of sortedLeads) {
    // One alert per lead, ever. The old design used a rolling 15-min
    // bucket which meant a single untouched lead would fire ~96 alerts in
    // 24h and ~672 alerts over the original 7-day window. Once a setter
    // has been pinged about a lead, additional pings add noise without
    // information — the dashboard's untouched-leads tab is the durable
    // surface for "what still needs attention."
    const dedupKey = `${team._id}_untouched_${lead.ghlContactId}`;
    const alreadyAlerted = await ctx.runQuery(
      internal.setterDataNotifications.hasNotificationByDedupKey,
      { dedupKey },
    );
    if (alreadyAlerted) continue;

    const minutesUntouched = Math.floor(
      (Date.now() - lead.dateAdded) / 60_000,
    );

    if (channel === "slack") {
      const slackChannelId =
        team.setterUntouchedAlertSlackChannelId || team.slackChannelId;
      if (!team.slackAccessToken || !slackChannelId) continue;
      const result = await postSlackMessage({
        accessToken: team.slackAccessToken,
        channelId: slackChannelId,
        text: `⚠️ Untouched lead alert`,
        blocks: buildUntouchedAlertSlackBlocks({
          lead,
          minutesUntouched,
          ghlLocationId,
        }),
      });
      if (!result.ok) {
        throw new Error(`Slack post failed: ${result.error}`);
      }
    } else {
      const webhookUrl = team.setterUntouchedAlertDiscordWebhookUrl;
      if (!webhookUrl) continue;
      const result = await postDiscordWebhook({
        webhookUrl,
        content: `⚠️ Untouched lead — ${lead.name || lead.email || lead.phone || "Unnamed"}`,
        embed: buildUntouchedAlertDiscordEmbed({
          lead,
          minutesUntouched,
          ghlLocationId,
        }),
      });
      if (!result.ok) {
        throw new Error(`Discord post failed: ${result.error}`);
      }
    }

    await ctx.runMutation(
      internal.setterDataNotifications.recordSentNotification,
      {
        teamId: team._id,
        type: "setter_untouched_alert",
        dedupKey,
      },
    );
    alertsSent++;
  }

  return alertsSent;
}

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
 * Find all teams that have setter data enabled AND untouched-lead
 * alerts enabled. Off by default per Phase 2 design — some teams love
 * real-time alerts, others find them noisy.
 */
export const getEnabledUntouchedAlertTeams = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("teams").collect();
    return all.filter(
      (t) =>
        t.setterDataEnabled !== false &&
        t.setterUntouchedAlertEnabled === true,
    );
  },
});

/**
 * Find leads that have crossed the team's untouched threshold but still
 * have zero contact attempts. Bounded to leads added within
 * UNTOUCHED_MAX_LEAD_AGE_MS (24h) so the stream is always "leads that just
 * came in and weren't worked." Older leads are intentionally excluded —
 * they live on the dashboard as a backlog but don't generate fresh pings.
 */
export const getUntouchedLeadsForTeam = internalQuery({
  args: {
    teamId: v.id("teams"),
    olderThanMs: v.number(),
  },
  handler: async (ctx, args) => {
    const oldestEligible = Date.now() - UNTOUCHED_MAX_LEAD_AGE_MS;
    const candidates = await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date_added", (q: any) =>
        q
          .eq("teamId", args.teamId)
          .gte("dateAdded", oldestEligible)
          .lt("dateAdded", args.olderThanMs),
      )
      .collect();

    return candidates
      .filter(
        (l) =>
          l.dialCount === 0 &&
          l.smsOutboundCount === 0 &&
          l.lastActivityAt === undefined,
      )
      .map((l) => ({
        leadId: l._id,
        ghlContactId: l.ghlContactId,
        name: l.name,
        email: l.email,
        phone: l.phone,
        dateAdded: l.dateAdded,
        assignedToName: l.assignedToName,
        assignedToGhlUserId: l.assignedToGhlUserId,
      }));
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
// Untouched-lead alert formatters
// ----------------------------------------------------------------------------

interface UntouchedAlertFormatArgs {
  lead: UntouchedLead;
  minutesUntouched: number;
  // GHL location id used to build the "Open in GHL" deep link. Optional —
  // legacy teams using only the ghlApiKey path (no OAuth installation) won't
  // have one. When missing, the GHL CTA is omitted and the clickable phone
  // link remains the primary next-step affordance for the setter.
  ghlLocationId: string | null;
}

/**
 * Convert a raw phone string (any GHL format — E.164, dashes, parens, spaces)
 * to a tel: link target. Strips everything except digits + an optional leading
 * +. The display string keeps GHL's original formatting so it reads naturally;
 * only the link target is normalized.
 */
function phoneToTelLink(raw: string): string {
  const cleaned = raw.replace(/[^\d+]/g, "");
  return `tel:${cleaned}`;
}

/**
 * Format a minutes count into a compact human-readable duration. Untouched
 * leads regularly cross the day boundary (especially overnight or weekend
 * sits), and "7735m" is unreadable at a glance. We collapse the largest two
 * units so "5d 8h" / "2h 15m" / "45m" reads instantly. Short form for headers,
 * long form for body sentences.
 */
function formatUntouchedDuration(
  minutes: number,
  variant: "short" | "long" = "short",
): string {
  const totalMinutes = Math.max(0, Math.floor(minutes));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;

  if (variant === "short") {
    if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    return `${mins}m`;
  }

  const pluralize = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days > 0) {
    return hours > 0
      ? `${pluralize(days, "day")} ${pluralize(hours, "hour")}`
      : pluralize(days, "day");
  }
  if (hours > 0) {
    return mins > 0
      ? `${pluralize(hours, "hour")} ${pluralize(mins, "minute")}`
      : pluralize(hours, "hour");
  }
  return pluralize(mins, "minute");
}

function ghlContactUrl(locationId: string, contactId: string): string {
  return `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}`;
}

function buildUntouchedAlertSlackBlocks(
  args: UntouchedAlertFormatArgs,
): unknown[] {
  const { lead, minutesUntouched, ghlLocationId } = args;
  const displayName = lead.name || lead.email || lead.phone || "Unnamed lead";

  // Contact bits — phone gets wrapped in a Slack tel: mrkdwn link so the
  // setter can dial straight from the message on mobile or via their dialer
  // integration on desktop.
  const contactBits: string[] = [];
  if (lead.name && lead.email) contactBits.push(lead.email);
  if (lead.phone) {
    contactBits.push(`<${phoneToTelLink(lead.phone)}|${lead.phone}>`);
  }

  const shortDuration = formatUntouchedDuration(minutesUntouched, "short");
  const longDuration = formatUntouchedDuration(minutesUntouched, "long");

  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `⚠️ Untouched lead — ${shortDuration}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*${displayName}*`,
          contactBits.length > 0 ? contactBits.join(" · ") : null,
          lead.assignedToName
            ? `Assigned to *${lead.assignedToName}*`
            : "Unassigned",
          `Sitting for ${longDuration} with no contact attempts.`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    },
  ];

  // Primary CTA — "Open in GHL" button, only when we have a location id to
  // build the URL. Legacy teams (api-key only) skip this; their phone link
  // is the next-best action.
  if (ghlLocationId && lead.ghlContactId) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open in GHL" },
          url: ghlContactUrl(ghlLocationId, lead.ghlContactId),
          style: "primary",
        },
      ],
    });
  }

  // Secondary context link — Sequ3nce dashboard view of untouched leads.
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "<https://sequ3nce.ai/dashboard/setter-data?tab=leads&filter=untouched|View untouched leads →>",
      },
    ],
  });

  return blocks;
}

function buildUntouchedAlertDiscordEmbed(
  args: UntouchedAlertFormatArgs,
): unknown {
  const { lead, minutesUntouched, ghlLocationId } = args;
  const displayName = lead.name || lead.email || lead.phone || "Unnamed lead";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (lead.email) {
    fields.push({ name: "Email", value: lead.email, inline: true });
  }
  if (lead.phone) {
    // Discord renders [text](tel:...) as a clickable link.
    fields.push({
      name: "Phone",
      value: `[${lead.phone}](${phoneToTelLink(lead.phone)})`,
      inline: true,
    });
  }
  if (lead.assignedToName) {
    fields.push({ name: "Assigned", value: lead.assignedToName, inline: true });
  }

  const shortDuration = formatUntouchedDuration(minutesUntouched, "short");
  const longDuration = formatUntouchedDuration(minutesUntouched, "long");

  // Append the GHL CTA to the description as a markdown link — Discord
  // embeds don't have real buttons, but bold markdown link reads as one.
  let description = `**${displayName}** has been sitting for ${longDuration} with no contact attempts.`;
  if (ghlLocationId && lead.ghlContactId) {
    description += `\n\n[**Open in GHL →**](${ghlContactUrl(ghlLocationId, lead.ghlContactId)})`;
  }

  return {
    title: `⚠️ Untouched lead — ${shortDuration}`,
    description,
    url: "https://sequ3nce.ai/dashboard/setter-data?tab=leads&filter=untouched",
    color: 0xf59e0b, // amber
    fields,
    footer: { text: "Sequ3nce Setter Data" },
  };
}

// ============================================================================
// runCoverageGapDigest — daily digest of yesterday's worst lead-coverage windows
//
// Runs hourly (cron). Per-team gated on enabled flag + local-tz delivery hour.
// Dedup keyed by `{teamId}_coverage_gap_{yesterday-date-in-tz}` so a team gets
// at most one digest per local day. Empty-state behavior: skip send entirely
// when no gaps detected — managers aren't paged for "all clear."
// ============================================================================

export const runCoverageGapDigest = internalAction({
  args: {},
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
      internal.setterDataNotifications.getEnabledCoverageGapTeams,
      {},
    )) as TeamDoc[];

    let processed = 0;
    let skipped = 0;
    let errored = 0;

    for (const team of teams) {
      try {
        const result = await maybeSendCoverageGapForTeam(ctx, team, now);
        if (result.sent) processed++;
        else skipped++;
      } catch (err) {
        errored++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[runCoverageGapDigest] Error for team ${team._id}: ${message}`,
          err,
        );
      }
    }
    return { processed, skipped, errored, candidateTeams: teams.length };
  },
});

export const getEnabledCoverageGapTeams = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("teams").collect();
    return all.filter(
      (t) =>
        t.setterDataEnabled !== false &&
        t.setterCoverageGapEnabled === true,
    );
  },
});

async function maybeSendCoverageGapForTeam(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  team: TeamDoc,
  nowMs: number,
): Promise<{ sent: boolean; reason?: string }> {
  const targetHour = team.setterCoverageGapHourLocal ?? 9;
  const tz = team.timezone || DEFAULT_TIMEZONE;
  const localNow = formatInTimeZone(new Date(nowMs), tz);
  if (localNow.hour !== targetHour) {
    return { sent: false, reason: `hour ${localNow.hour} != target ${targetHour}` };
  }

  // Compute yesterday's date in team timezone.
  const yesterday = formatInTimeZone(new Date(nowMs - 24 * 60 * 60 * 1000), tz);
  const yesterdayDateStr = `${yesterday.year}-${pad2(yesterday.month)}-${pad2(yesterday.day)}`;

  const dedupKey = `${team._id}_coverage_gap_${yesterdayDateStr}`;
  const alreadySent = await ctx.runQuery(
    internal.setterDataNotifications.hasNotificationByDedupKey,
    { dedupKey },
  );
  if (alreadySent) {
    return { sent: false, reason: "already sent for this date" };
  }

  const minLeads = team.setterCoverageGapMinLeadsThreshold ?? 3;
  const digest = await ctx.runQuery(
    internal.setterData.getCoverageGapDigestInternal,
    {
      teamId: team._id,
      targetYear: yesterday.year,
      targetMonth: yesterday.month,
      targetDay: yesterday.day,
      timezone: tz,
      minLeadsThreshold: minLeads,
    },
  );

  // Empty state — skip the send entirely. We still record the dedup row
  // so the cron doesn't redundantly re-check this team every hour all day.
  if (!digest || digest.windows.length === 0) {
    await ctx.runMutation(
      internal.setterDataNotifications.recordSentNotification,
      {
        teamId: team._id,
        type: "setter_coverage_gap_skip",
        dedupKey,
      },
    );
    return { sent: false, reason: "no gaps detected" };
  }

  const channel = team.setterCoverageGapChannel;
  if (channel !== "slack" && channel !== "discord") {
    return { sent: false, reason: "no notification channel configured" };
  }

  const fallbackText = `📍 Coverage gaps for ${humanReadableDate(yesterday)} — ${digest.windows.length} window${digest.windows.length === 1 ? "" : "s"}`;

  if (channel === "slack") {
    const slackChannelId =
      team.setterCoverageGapSlackChannelId || team.slackChannelId;
    if (!team.slackAccessToken || !slackChannelId) {
      return { sent: false, reason: "slack not connected or no channel" };
    }
    const blocks = buildCoverageGapSlackBlocks({
      digest,
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
    const webhookUrl = team.setterCoverageGapDiscordWebhookUrl;
    if (!webhookUrl) {
      return { sent: false, reason: "no discord webhook configured" };
    }
    const embed = buildCoverageGapDiscordEmbed({ digest, yesterday });
    const result = await postDiscordWebhook({
      webhookUrl,
      content: fallbackText,
      embed,
    });
    if (!result.ok) {
      throw new Error(`Discord post failed: ${result.error}`);
    }
  }

  await ctx.runMutation(
    internal.setterDataNotifications.recordSentNotification,
    {
      teamId: team._id,
      type: "setter_coverage_gap",
      dedupKey,
    },
  );
  return { sent: true };
}

interface CoverageGapDigestData {
  date: string;
  timezone: string;
  windows: Array<{
    dayLabel: string;
    startHour: number;
    endHour: number;
    leadCount: number;
    medianTimeToFirstDialMs: number | null;
    neverDialedCount: number;
  }>;
  baselineMedianMs: number | null;
  totalLeadsInDay: number;
}

function buildCoverageGapSlackBlocks(args: {
  digest: CoverageGapDigestData;
  yesterday: ZonedDate;
  yesterdayDateStr: string;
}): unknown[] {
  const { digest, yesterday } = args;
  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📍 Coverage gaps — ${humanReadableDate(yesterday)}`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${digest.totalLeadsInDay} leads yesterday · times in ${digest.timezone}${digest.baselineMedianMs !== null ? ` · 30-day baseline median ${formatDuration(digest.baselineMedianMs)}` : ""}`,
        },
      ],
    },
    { type: "divider" },
  ];
  for (const w of digest.windows) {
    const hourLine = `*${w.dayLabel} ${formatHourSlack(w.startHour)}–${formatHourSlack(w.endHour)}*`;
    const detailParts: string[] = [`${w.leadCount} ${w.leadCount === 1 ? "lead" : "leads"}`];
    if (w.neverDialedCount > 0) {
      detailParts.push(`${w.neverDialedCount} never dialed`);
    }
    if (w.medianTimeToFirstDialMs !== null) {
      detailParts.push(`median time-to-dial ${formatDuration(w.medianTimeToFirstDialMs)}`);
    }
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${hourLine}\n${detailParts.join(" · ")}`,
      },
    });
  }
  return blocks;
}

function buildCoverageGapDiscordEmbed(args: {
  digest: CoverageGapDigestData;
  yesterday: ZonedDate;
}): unknown {
  const { digest, yesterday } = args;
  const fields = digest.windows.map((w) => {
    const detailParts: string[] = [
      `${w.leadCount} ${w.leadCount === 1 ? "lead" : "leads"}`,
    ];
    if (w.neverDialedCount > 0) {
      detailParts.push(`${w.neverDialedCount} never dialed`);
    }
    if (w.medianTimeToFirstDialMs !== null) {
      detailParts.push(
        `median ${formatDuration(w.medianTimeToFirstDialMs)}`,
      );
    }
    return {
      name: `${w.dayLabel} ${formatHourSlack(w.startHour)}–${formatHourSlack(w.endHour)}`,
      value: detailParts.join(" · "),
    };
  });
  return {
    title: `📍 Coverage gaps — ${humanReadableDate(yesterday)}`,
    color: 0xf59e0b,
    fields,
    footer: { text: `Sequ3nce Setter Data · ${digest.timezone}` },
  };
}

function formatHourSlack(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
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

// ============================================================================
// runUncontactedDigest — daily end-of-day digest of uncontacted leads
//
// Runs hourly (cron). Per-team gated on enabled flag + local-tz delivery
// hour (default 17 = 5pm). Sends a Slack/Discord message listing every
// lead added today (team-local) that still has zero contact attempts at
// report time. Complementary to the real-time untouched alert: that one
// fires on threshold-cross; this one is the catch-up batch view for
// setters who couldn't keep up during the day. Even leads that fired a
// real-time alert earlier get excluded here if they've been contacted by
// the time the digest runs — the report always reflects current state.
// Dedup keyed by `{teamId}_uncontacted_digest_{today-date-in-tz}` so a
// team gets at most one digest per local day.
// ============================================================================

const DEFAULT_UNCONTACTED_DIGEST_HOUR = 17; // 5pm local

export const runUncontactedDigest = internalAction({
  args: {},
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
      internal.setterDataNotifications.getEnabledUncontactedDigestTeams,
      {},
    )) as TeamDoc[];

    let processed = 0;
    let skipped = 0;
    let errored = 0;

    for (const team of teams) {
      try {
        const result = await maybeSendUncontactedDigestForTeam(ctx, team, now);
        if (result.sent) processed++;
        else skipped++;
      } catch (err) {
        errored++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[runUncontactedDigest] Error for team ${team._id}: ${message}`,
          err,
        );
      }
    }

    return { processed, skipped, errored, candidateTeams: teams.length };
  },
});

export const getEnabledUncontactedDigestTeams = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("teams").collect();
    return all.filter(
      (t) =>
        t.setterDataEnabled !== false &&
        t.setterUncontactedDigestEnabled === true,
    );
  },
});

/**
 * Find every lead added during the given UTC range that still has zero
 * contact attempts. Used by the daily digest to enumerate "still
 * uncontacted as of now" — even if an untouched alert fired earlier in
 * the day, contacted leads are excluded here because the filter checks
 * current state (dialCount + smsOutboundCount + lastActivityAt) not
 * historical alert delivery.
 */
export const getUncontactedLeadsInRange = internalQuery({
  args: {
    teamId: v.id("teams"),
    rangeStartMs: v.number(),
    rangeEndMs: v.number(),
  },
  handler: async (ctx, args) => {
    const candidates = await ctx.db
      .query("setterLeads")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team_and_date_added", (q: any) =>
        q
          .eq("teamId", args.teamId)
          .gte("dateAdded", args.rangeStartMs)
          .lte("dateAdded", args.rangeEndMs),
      )
      .collect();

    return candidates
      .filter(
        (l) =>
          l.dialCount === 0 &&
          l.smsOutboundCount === 0 &&
          l.lastActivityAt === undefined,
      )
      .sort((a, b) => a.dateAdded - b.dateAdded)
      .map((l) => ({
        leadId: l._id,
        ghlContactId: l.ghlContactId,
        name: l.name,
        email: l.email,
        phone: l.phone,
        dateAdded: l.dateAdded,
        assignedToName: l.assignedToName,
      }));
  },
});

interface UncontactedDigestLead {
  leadId: Id<"setterLeads">;
  ghlContactId: string;
  name?: string;
  email?: string;
  phone?: string;
  dateAdded: number;
  assignedToName?: string;
}

async function maybeSendUncontactedDigestForTeam(
  ctx: ActionCtx,
  team: TeamDoc,
  nowMs: number,
): Promise<{ sent: boolean; reason?: string }> {
  const targetHour =
    team.setterUncontactedDigestHourLocal ?? DEFAULT_UNCONTACTED_DIGEST_HOUR;
  const tz = team.timezone || DEFAULT_TIMEZONE;
  const localNow = formatInTimeZone(new Date(nowMs), tz);
  if (localNow.hour !== targetHour) {
    return { sent: false, reason: `hour ${localNow.hour} != target ${targetHour}` };
  }

  // Today's local date string for dedup. Digest fires once per local day,
  // regardless of how many cron ticks land within the target hour.
  const todayDateStr = `${localNow.year}-${pad2(localNow.month)}-${pad2(localNow.day)}`;
  const dedupKey = `${team._id}_uncontacted_digest_${todayDateStr}`;
  const alreadySent = await ctx.runQuery(
    internal.setterDataNotifications.hasNotificationByDedupKey,
    { dedupKey },
  );
  if (alreadySent) {
    return { sent: false, reason: "already sent for this date" };
  }

  // "Today" = start-of-day local through current moment. Captures every
  // lead that landed today and is still uncontacted as of the report.
  const range = getLocalDateRangeUtc(todayDateStr, tz);
  const leads = (await ctx.runQuery(
    internal.setterDataNotifications.getUncontactedLeadsInRange,
    {
      teamId: team._id,
      rangeStartMs: range.startMs,
      rangeEndMs: nowMs,
    },
  )) as UncontactedDigestLead[];

  // Pre-flight channel check before composing — skip cleanly if config is
  // half-set rather than firing into nothing.
  const channel = team.setterUncontactedDigestChannel;
  if (channel !== "slack" && channel !== "discord") {
    return { sent: false, reason: "no notification channel configured" };
  }

  // GHL deep-link location id — same OAuth-then-legacy fallback as the
  // untouched-lead alert.
  const installation = (await ctx.runQuery(
    internal.setterGhlOauth.getActiveInstallationForTeam,
    { teamId: team._id },
  )) as { locationId: string } | null;
  const ghlLocationId =
    installation?.locationId ?? team.ghlLocationId ?? null;

  const dateLabel = humanReadableDate(localNow);
  const fallbackText =
    leads.length === 0
      ? `📋 Uncontacted Leads Report — ${dateLabel}: all clear`
      : `📋 ${leads.length} uncontacted lead${leads.length === 1 ? "" : "s"} — ${dateLabel}`;

  if (channel === "slack") {
    const slackChannelId =
      team.setterUncontactedDigestSlackChannelId || team.slackChannelId;
    if (!team.slackAccessToken || !slackChannelId) {
      return { sent: false, reason: "slack not connected or no channel" };
    }
    const blocks = buildUncontactedDigestSlackBlocks({
      leads,
      dateLabel,
      ghlLocationId,
      nowMs,
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
    const webhookUrl = team.setterUncontactedDigestDiscordWebhookUrl;
    if (!webhookUrl) {
      return { sent: false, reason: "no discord webhook configured" };
    }
    const embed = buildUncontactedDigestDiscordEmbed({
      leads,
      dateLabel,
      ghlLocationId,
      nowMs,
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

  await ctx.runMutation(internal.setterDataNotifications.recordSentNotification, {
    teamId: team._id,
    type: "setter_uncontacted_digest",
    dedupKey,
  });

  return { sent: true };
}

interface UncontactedDigestFormatArgs {
  leads: UncontactedDigestLead[];
  dateLabel: string;
  ghlLocationId: string | null;
  nowMs: number;
}

// Slack message format: header + summary + per-lead lines. Each lead line
// shows the wait time, name, contact, assignment, and an inline GHL deep
// link. List is truncated at 40 leads to stay under Slack's 50-block
// limit — overflow is summarized as "+N more" with a dashboard link.
const MAX_DIGEST_LEADS_SHOWN = 40;

function buildUncontactedDigestSlackBlocks(
  args: UncontactedDigestFormatArgs,
): unknown[] {
  const { leads, dateLabel, ghlLocationId, nowMs } = args;

  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text:
          leads.length === 0
            ? `📋 Uncontacted Leads — ${dateLabel}`
            : `📋 ${leads.length} uncontacted ${leads.length === 1 ? "lead" : "leads"} — ${dateLabel}`,
      },
    },
  ];

  if (leads.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "✅ Every lead that came in today has at least one contact attempt. Nice work.",
      },
    });
    return blocks;
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `Leads added today that still have *zero* dials, SMS, or activity — sorted by how long they've been waiting.`,
    },
  });
  blocks.push({ type: "divider" });

  const shown = leads.slice(0, MAX_DIGEST_LEADS_SHOWN);
  for (const lead of shown) {
    const waitedFor = formatUntouchedDuration(
      Math.floor((nowMs - lead.dateAdded) / 60_000),
      "short",
    );
    const displayName = lead.name || lead.email || lead.phone || "Unnamed";

    const contactBits: string[] = [];
    if (lead.name && lead.email) contactBits.push(lead.email);
    if (lead.phone) {
      contactBits.push(`<${phoneToTelLink(lead.phone)}|${lead.phone}>`);
    }
    const assignment = lead.assignedToName
      ? `Assigned: ${lead.assignedToName}`
      : "Unassigned";

    const ghlLink =
      ghlLocationId && lead.ghlContactId
        ? ` · <${ghlContactUrl(ghlLocationId, lead.ghlContactId)}|Open in GHL>`
        : "";

    const text = [
      `*${waitedFor}* — *${displayName}*`,
      contactBits.length > 0 ? contactBits.join(" · ") : null,
      `${assignment}${ghlLink}`,
    ]
      .filter(Boolean)
      .join("\n");

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text },
    });
  }

  if (leads.length > MAX_DIGEST_LEADS_SHOWN) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `+${leads.length - MAX_DIGEST_LEADS_SHOWN} more — <https://sequ3nce.ai/dashboard/setter-data?tab=leads&filter=untouched|view full list →>`,
        },
      ],
    });
  } else {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "<https://sequ3nce.ai/dashboard/setter-data?tab=leads&filter=untouched|View all uncontacted leads →>",
        },
      ],
    });
  }

  return blocks;
}

function buildUncontactedDigestDiscordEmbed(
  args: UncontactedDigestFormatArgs,
): unknown {
  const { leads, dateLabel, ghlLocationId, nowMs } = args;

  if (leads.length === 0) {
    return {
      title: `📋 Uncontacted Leads — ${dateLabel}`,
      description:
        "✅ Every lead that came in today has at least one contact attempt. Nice work.",
      color: 0x10b981, // emerald
      footer: { text: "Sequ3nce Setter Data" },
    };
  }

  const shown = leads.slice(0, MAX_DIGEST_LEADS_SHOWN);
  const lines: string[] = [];
  for (const lead of shown) {
    const waitedFor = formatUntouchedDuration(
      Math.floor((nowMs - lead.dateAdded) / 60_000),
      "short",
    );
    const displayName = lead.name || lead.email || lead.phone || "Unnamed";
    const contactBit = lead.email ?? lead.phone ?? "";
    const assignment = lead.assignedToName
      ? ` · ${lead.assignedToName}`
      : " · Unassigned";
    const ghlLink =
      ghlLocationId && lead.ghlContactId
        ? ` · [GHL](${ghlContactUrl(ghlLocationId, lead.ghlContactId)})`
        : "";
    lines.push(
      `**${waitedFor}** — ${displayName}${contactBit ? ` · ${contactBit}` : ""}${assignment}${ghlLink}`,
    );
  }
  let description = `Leads added today still with zero contact attempts — oldest first.\n\n${lines.join("\n")}`;
  if (leads.length > MAX_DIGEST_LEADS_SHOWN) {
    description += `\n\n_+${leads.length - MAX_DIGEST_LEADS_SHOWN} more_`;
  }

  return {
    title: `📋 ${leads.length} uncontacted lead${leads.length === 1 ? "" : "s"} — ${dateLabel}`,
    description,
    url: "https://sequ3nce.ai/dashboard/setter-data?tab=leads&filter=untouched",
    color: 0xf59e0b, // amber
    footer: { text: "Sequ3nce Setter Data" },
  };
}

// ============================================================================
// runBookingFlowDetectionSweep — Dashboard Phase 4 cron entry.
// Recomputes setterBookingFlowDetected for teams whose detection is >7 days
// stale (or missing). Classifies by comparing lead.firstDialAt to the matched
// booking's calendarEvent._creationTime: setter-touched-first dominant →
// setter_drives; booking-first dominant → self_book; else mixed or unknown.
// ============================================================================

const BOOKING_FLOW_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const BOOKING_FLOW_DETECT_RANGE_MS = 60 * 24 * 60 * 60 * 1000;
const BOOKING_FLOW_MIN_SAMPLE = 20;
const BOOKING_FLOW_THRESHOLD = 0.70;
const BOOKING_FLOW_MIN_GAP_MS = 10 * 60 * 1000; // dial-vs-booking within 10min is too tight to classify

export const runBookingFlowDetectionSweep = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ processed: number; updated: number; errored: number }> => {
    const teams = (await ctx.runQuery(
      internal.setterDataNotifications.getTeamsNeedingBookingFlowDetection,
      {},
    )) as TeamDoc[];
    let processed = 0;
    let updated = 0;
    let errored = 0;
    for (const team of teams) {
      processed++;
      try {
        const result = await detectFlowForTeam(ctx, team);
        if (result.changed) updated++;
      } catch (err) {
        errored++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[runBookingFlowDetectionSweep] team ${team._id}: ${msg}`,
        );
      }
    }
    return { processed, updated, errored };
  },
});

export const getTeamsNeedingBookingFlowDetection = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("teams").collect();
    const now = Date.now();
    return all.filter(
      (t) =>
        t.setterDataEnabled !== false &&
        (t.setterBookingFlowDetectedAt === undefined ||
          now - t.setterBookingFlowDetectedAt > BOOKING_FLOW_STALE_MS),
    );
  },
});

async function detectFlowForTeam(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  team: TeamDoc,
): Promise<{ changed: boolean }> {
  const now = Date.now();
  const result = await ctx.runQuery(
    internal.setterDataNotifications.classifyBookingFlowForTeam,
    {
      teamId: team._id,
      rangeStart: now - BOOKING_FLOW_DETECT_RANGE_MS,
      rangeEnd: now,
    },
  );
  await ctx.runMutation(
    internal.setterDataNotifications.applyBookingFlowDetection,
    {
      teamId: team._id,
      detected: result.flowType,
      detectedAt: now,
    },
  );
  const prev = team.setterBookingFlowDetected;
  return { changed: prev !== result.flowType };
}

export const classifyBookingFlowForTeam = internalQuery({
  args: {
    teamId: v.id("teams"),
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ flowType: "setter_drives" | "self_book" | "mixed" | "unknown" }> => {
    const matcher = await buildBookingMatcherIndex(
      ctx,
      args.teamId,
      args.rangeStart,
      args.rangeEnd,
    );
    let setterDrove = 0;
    let selfBooked = 0;
    let classified = 0;
    for (const b of matcher.bookings) {
      if (b.leadFirstDialAt === undefined) continue;
      const gap = b.calendarEventCreationTime - b.leadFirstDialAt;
      if (Math.abs(gap) < BOOKING_FLOW_MIN_GAP_MS) continue;
      classified++;
      if (gap > 0) {
        setterDrove++; // dial came BEFORE booking
      } else {
        selfBooked++; // booking came BEFORE dial
      }
    }
    if (classified < BOOKING_FLOW_MIN_SAMPLE) {
      return { flowType: "unknown" };
    }
    const pctSetterDrove = setterDrove / classified;
    if (pctSetterDrove >= BOOKING_FLOW_THRESHOLD) {
      return { flowType: "setter_drives" };
    }
    if (pctSetterDrove <= 1 - BOOKING_FLOW_THRESHOLD) {
      return { flowType: "self_book" };
    }
    return { flowType: "mixed" };
  },
});

export const applyBookingFlowDetection = internalMutation({
  args: {
    teamId: v.id("teams"),
    detected: v.union(
      v.literal("setter_drives"),
      v.literal("self_book"),
      v.literal("mixed"),
      v.literal("unknown"),
    ),
    detectedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      setterBookingFlowDetected: args.detected,
      setterBookingFlowDetectedAt: args.detectedAt,
    });
  },
});
