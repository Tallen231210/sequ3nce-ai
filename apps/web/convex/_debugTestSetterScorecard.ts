/**
 * One-off helper to test-fire the setter-data daily scorecard for a specific
 * team via email lookup. Bypasses cron's hour-of-day gating and the dedup
 * key check — sends yesterday's scorecard right now to whatever Slack
 * channel the team has configured.
 *
 * Intended to be called once via `npx convex run --prod`, then deleted.
 */

import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

export const findTeamByUserEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), args.email.toLowerCase()))
      .first();
    if (!user) return null;
    const team = await ctx.db.get(user.teamId);
    if (!team) return null;
    return {
      teamId: team._id,
      teamName: team.name,
      userEmail: user.email,
      scorecardEnabled: team.setterDailyScorecardEnabled ?? false,
      scorecardChannel: team.setterDailyScorecardChannel ?? null,
      scorecardSlackChannelId:
        team.setterDailyScorecardSlackChannelId ?? team.slackChannelId ?? null,
      scorecardSlackChannelName:
        team.setterDailyScorecardSlackChannelName ?? null,
      scorecardHourLocal: team.setterDailyScorecardHourLocal ?? null,
      slackConnected: !!team.slackAccessToken,
      slackAccessToken: team.slackAccessToken ?? null,
      timezone: team.timezone ?? null,
    };
  },
});

/**
 * Test-fire the scorecard. Bypasses hour-of-day gate + dedup key.
 *
 * Usage:
 *   npx convex run --prod _debugTestSetterScorecard:fireForEmail \
 *     '{"email":"gianni@remotestack.ai"}'
 */
export const fireForEmail = action({
  args: { email: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    sent: boolean;
    reason?: string;
    channel?: string;
    teamName?: string;
  }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lookup: any = await ctx.runQuery(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (internal as any)._debugTestSetterScorecard.findTeamByUserEmail,
      { email: args.email },
    );

    if (!lookup) {
      return { sent: false, reason: `No user found with email ${args.email}` };
    }

    if (!lookup.slackConnected) {
      return {
        sent: false,
        reason: "Team has no Slack OAuth token — connect Slack first",
        teamName: lookup.teamName,
      };
    }
    if (lookup.scorecardChannel !== "slack") {
      return {
        sent: false,
        reason: `Scorecard channel is ${lookup.scorecardChannel ?? "<unset>"} (need 'slack')`,
        teamName: lookup.teamName,
      };
    }
    if (!lookup.scorecardSlackChannelId) {
      return {
        sent: false,
        reason: "No setterDailyScorecardSlackChannelId configured",
        teamName: lookup.teamName,
      };
    }

    // Last 24h UTC range. The scorecard query handles tz-aware bucketing
    // internally; this is a test fire so precision doesn't matter.
    const nowMs = Date.now();
    const startMs = nowMs - 24 * 60 * 60 * 1000;
    const endMs = nowMs;

    let data:
      | {
          totalLeads: number;
          totalDials: number;
          totalConnections: number;
          totalConversations: number;
          totalBookings: number;
          totalShows: number;
          totalCloses: number;
        }
      | undefined;
    try {
      data = (await ctx.runQuery(internal.setterDataMetrics.getScorecardData, {
        teamId: lookup.teamId,
        rangeStart: startMs,
        rangeEnd: endMs,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)) as unknown as typeof data;
    } catch (err) {
      return {
        sent: false,
        reason: `Failed to compute scorecard data: ${
          err instanceof Error ? err.message : String(err)
        }`,
        teamName: lookup.teamName,
      };
    }
    if (!data) {
      return {
        sent: false,
        reason: "Scorecard data was empty",
        teamName: lookup.teamName,
      };
    }

    const text =
      `:rotating_light: TEST FIRE — Setter Scorecard (last 24h, ${lookup.timezone ?? "UTC"})\n` +
      `Leads ingested: ${data.totalLeads}\n` +
      `Dials: ${data.totalDials}\n` +
      `Connections: ${data.totalConnections}\n` +
      `Conversations: ${data.totalConversations}\n` +
      `Bookings: ${data.totalBookings}\n` +
      `Shows: ${data.totalShows}\n` +
      `Closes: ${data.totalCloses}\n` +
      `(Test fire from _debugTestSetterScorecard.ts — not the cron. Channel ID: ${lookup.scorecardSlackChannelId})`;

    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lookup.slackAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: lookup.scorecardSlackChannelId,
        text,
      }),
    });
    const result = (await resp.json()) as { ok?: boolean; error?: string };
    if (!result.ok) {
      return {
        sent: false,
        reason: `Slack error: ${result.error ?? "unknown"}`,
        channel: lookup.scorecardSlackChannelId,
        teamName: lookup.teamName,
      };
    }
    return {
      sent: true,
      channel: lookup.scorecardSlackChannelId,
      teamName: lookup.teamName,
    };
  },
});
