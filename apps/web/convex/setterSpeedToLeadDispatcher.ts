"use node";

// ============================================================================
// Per-lead speed-to-lead Slack/Discord ping.
//
// Triggered from setterGhlWebhooks.recordCallEvent the instant a lead's
// firstDialAt transitions from undefined to set. Contextualizes the per-lead
// speed with the team's historical decay curve so the manager doesn't just
// see "Jeffrey called James in 4m 23s" — they see
// "Jeffrey called James in 4m 23s ✅. Expected connect rate at that speed:
// 28% (your team's last 30 days)."
//
// Off by default per team (setterSpeedToLeadEnabled). Dedup'd via
// slackNotifications by leadId — once per lead lifetime — so the same
// lead never produces a second ping even if recordCallEvent fires twice.
//
// Lives in a "use node" file because the Sentry error pipeline
// (captureAndPersist) imports @sentry/node. The V8 helper query
// (getSpeedToLeadContext) lives in setterDataNotifications.ts.
// ============================================================================

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const SPEED_TO_LEAD_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const SPEED_TO_LEAD_DEFAULT_SLOW_THRESHOLD_MS = 30 * 60 * 1000; // 30 min

export const sendSpeedToLeadNotification = internalAction({
  args: {
    leadId: v.id("setterLeads"),
    dialerGhlUserId: v.string(),
    firstDialAt: v.number(),
    dateAdded: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const { captureAndPersist } = await import("./lib/sentry");

    try {
      const ctxData: any = await ctx.runQuery(
        internal.setterDataNotifications.getSpeedToLeadContext,
        { leadId: args.leadId, dialerGhlUserId: args.dialerGhlUserId },
      );
      if (!ctxData) {
        // Lead or team was deleted between scheduling and execution. Skip.
        return;
      }
      const { team, lead, setterName } = ctxData;

      // Gating: opt-in per team.
      if (team.setterSpeedToLeadEnabled !== true) return;
      const channel = team.setterSpeedToLeadChannel;
      if (channel !== "slack" && channel !== "discord") return;

      // Dedup — once per lead, ever.
      const dedupKey = `speed_to_lead:${args.leadId}`;
      const alreadySent = await ctx.runQuery(
        internal.setterDataNotifications.hasNotificationByDedupKey,
        { dedupKey },
      );
      if (alreadySent) return;

      // Compute speed and pull team's last-30d decay curve to contextualize.
      const speedMs = Math.max(0, args.firstDialAt - args.dateAdded);
      const lookbackStart = args.firstDialAt - SPEED_TO_LEAD_LOOKBACK_MS;
      const decay: any = await ctx.runQuery(
        internal.setterData.getLeadAgeDecayCurveInternal,
        {
          teamId: team._id,
          rangeStart: lookbackStart,
          rangeEnd: args.firstDialAt,
        },
      );
      const bucketLabel = pickDecayBucketLabel(speedMs);
      const bucketRow = decay?.buckets?.find((b: any) => b.label === bucketLabel);
      // Only show the expected-rate context when we have a meaningful sample
      // size — small-N buckets produce misleading benchmarks.
      const expectedRate =
        bucketRow && bucketRow.leadCount >= 5 ? bucketRow.rate : null;

      // Slow-call badging — visual cue without forcing manager judgment.
      const slowThresholdMs =
        team.setterSpeedToLeadSlowThresholdMs ??
        SPEED_TO_LEAD_DEFAULT_SLOW_THRESHOLD_MS;
      let badge = "✅";
      if (speedMs >= slowThresholdMs * 3) badge = "🚨";
      else if (speedMs >= slowThresholdMs) badge = "⚠️";

      // Cap displayed speed at ">24h" for ancient leads re-engaging — the
      // raw number isn't actionable past 24h, and the badge already
      // conveys "very slow." Edge case for duplicate contacts that GHL
      // dedupes to the original dateAdded years ago.
      const displaySpeed =
        speedMs > 24 * 60 * 60 * 1000 ? ">24h" : formatDuration(speedMs);

      const setterLabel = setterName ?? "(unknown setter)";
      const leadLabel = lead.name?.trim() || lead.email || "(unnamed lead)";
      const fallbackText = `${badge} ${setterLabel} called ${leadLabel} in ${displaySpeed}`;

      if (channel === "slack") {
        const slackChannelId =
          team.setterSpeedToLeadSlackChannelId || team.slackChannelId;
        if (!team.slackAccessToken || !slackChannelId) {
          // Enabled but misconfigured — log + skip. Not Sentry-worthy.
          console.warn(
            `[sendSpeedToLeadNotification] team ${team._id} enabled but Slack not connected or no channel`,
          );
          return;
        }
        const blocks = buildSpeedToLeadSlackBlocks({
          badge,
          setterLabel,
          leadLabel,
          displaySpeed,
          expectedRate,
          decayLeadCount: bucketRow?.leadCount ?? 0,
        });
        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${team.slackAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: slackChannelId,
            text: fallbackText,
            blocks,
          }),
        });
        const data = (await response.json()) as { ok?: boolean; error?: string };
        if (!data.ok) {
          throw new Error(`Slack post failed: ${data.error || "unknown"}`);
        }
      } else {
        const webhookUrl = team.setterSpeedToLeadDiscordWebhookUrl;
        if (!webhookUrl) {
          console.warn(
            `[sendSpeedToLeadNotification] team ${team._id} enabled but no Discord webhook`,
          );
          return;
        }
        const embed = buildSpeedToLeadDiscordEmbed({
          badge,
          setterLabel,
          leadLabel,
          displaySpeed,
          expectedRate,
          decayLeadCount: bucketRow?.leadCount ?? 0,
        });
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: fallbackText, embeds: [embed] }),
        });
        if (!response.ok) {
          throw new Error(
            `Discord post failed: ${response.status} ${response.statusText}`,
          );
        }
      }

      // Record dedup AFTER successful send so a transient send error
      // doesn't permanently mark the lead as already pinged.
      await ctx.runMutation(
        internal.setterDataNotifications.recordSentNotification,
        {
          teamId: team._id,
          type: "setter_speed_to_lead",
          dedupKey,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[sendSpeedToLeadNotification] lead ${args.leadId}: ${message}`,
      );
      const transient = isTransientNotificationError(err);
      await captureAndPersist(err, async () => {}, {
        feature: transient
          ? "sendSpeedToLeadNotification.transient"
          : "sendSpeedToLeadNotification",
        integration: transient ? "slack-discord" : "setter-data",
        extra: {
          leadId: String(args.leadId),
          dialerGhlUserId: args.dialerGhlUserId,
        },
      });
    }
  },
});

// Mirror of pickDecayBucketLabel in setterData.ts. Re-declared here because
// the V8 module's exports aren't trivially importable into a "use node"
// file. Kept in lock-step manually; verified by the smoke test in the
// verification step.
function pickDecayBucketLabel(speedMs: number): string | null {
  if (!Number.isFinite(speedMs) || speedMs < 0) return null;
  if (speedMs < 60_000) return "<1m";
  if (speedMs < 5 * 60_000) return "1-5m";
  if (speedMs < 15 * 60_000) return "5-15m";
  if (speedMs < 60 * 60_000) return "15-60m";
  if (speedMs < 4 * 60 * 60_000) return "1-4h";
  if (speedMs < 24 * 60 * 60_000) return "4-24h";
  if (speedMs < 3 * 24 * 60 * 60_000) return "1-3d";
  return ">3d";
}

function isTransientNotificationError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/5\d\d|429|fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    return true;
  }
  if (/ratelimited|server_error|service_unavailable/i.test(msg)) return true;
  return false;
}

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

interface SpeedToLeadFormatArgs {
  badge: string;
  setterLabel: string;
  leadLabel: string;
  displaySpeed: string;
  expectedRate: number | null;
  decayLeadCount: number;
}

function buildSpeedToLeadSlackBlocks(args: SpeedToLeadFormatArgs): unknown[] {
  const speedLine = `${args.badge} *${args.setterLabel}* called *${args.leadLabel}* in *${args.displaySpeed}*`;
  const blocks: unknown[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: speedLine },
    },
  ];
  if (args.expectedRate !== null) {
    const ratePct = Math.round(args.expectedRate * 100);
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Expected connect rate at this speed: *${ratePct}%* — based on ${args.decayLeadCount} similar dials in the last 30 days.`,
        },
      ],
    });
  } else {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Not enough recent dials at this speed for a benchmark yet.",
        },
      ],
    });
  }
  return blocks;
}

function buildSpeedToLeadDiscordEmbed(args: SpeedToLeadFormatArgs): unknown {
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Setter", value: args.setterLabel, inline: true },
    { name: "Lead", value: args.leadLabel, inline: true },
    { name: "Speed to lead", value: args.displaySpeed, inline: true },
  ];
  if (args.expectedRate !== null) {
    const ratePct = Math.round(args.expectedRate * 100);
    fields.push({
      name: "Expected connect rate",
      value: `${ratePct}% — based on ${args.decayLeadCount} similar dials in the last 30 days.`,
    });
  }
  let color = 0x10b981; // emerald
  if (args.badge === "⚠️") color = 0xf59e0b;
  if (args.badge === "🚨") color = 0xef4444;
  return {
    title: `${args.badge} Speed to lead`,
    color,
    fields,
    footer: { text: "Sequ3nce Setter Data" },
  };
}
