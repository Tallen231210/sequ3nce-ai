// ============================================================================
// The weekly data-health post: Mondays, at the team's local hour, to the
// same channel as the daily setter scorecard. Same spine as that post —
// enabled → hour → weekday → dedup → data → silence-when-empty → deliver →
// record — so a transient outage never permanently swallows a week.
// ============================================================================

import { v, ConvexError } from "convex/values";
import { internalAction, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { addDaysKey, weekStartKeyFor } from "./dataHealthCore";
import { buildDataHealthDiscordEmbed, buildDataHealthSlackBlocks, dataHealthFallbackText } from "./dataHealthPost";
import type { DataHealthWeek } from "./dataHealthQueries";
import { withDiscordTestLabel, withSlackTestLabel } from "./lib/testLabel";
import { formatInTimeZone } from "./setterDataNotifications";
import { deliver } from "./setterEodNotifications";
import { resolveAuthUser } from "./setterGhlOauth";
import { SETTER_TEAMS_FLAG, teamHasSetterTeams } from "./setterTeamQueries";

const DEFAULT_HOUR = 9;

export const getEnabledTeams = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"teams">[]> => {
    const teams = await ctx.db.query("teams").take(1000);
    return teams.filter((t) => t.setterDataHealthEnabled === true && teamHasSetterTeams(t));
  },
});

async function maybeSend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  team: Doc<"teams">,
  nowMs: number,
  opts?: { force?: boolean; dedupSuffix?: string; weekStartKey?: string },
): Promise<{ sent: boolean; reason?: string }> {
  if (team.setterDataHealthEnabled !== true && !opts?.force) return { sent: false, reason: "disabled" };
  const tz = team.timezone || DEFAULT_TIMEZONE;
  const local = formatInTimeZone(new Date(nowMs), tz);
  const targetHour = team.setterDataHealthHourLocal ?? DEFAULT_HOUR;
  if (!opts?.force) {
    if (local.hour !== targetHour) return { sent: false, reason: `hour ${local.hour} != ${targetHour}` };
    if (local.weekday !== "Mon") return { sent: false, reason: `weekly cadence, today is ${local.weekday}` };
  }
  // The finished week: the Monday before today's Monday.
  const todayKey = dayKeyInTz(nowMs, tz);
  const weekStartKey = opts?.weekStartKey ?? addDaysKey(weekStartKeyFor(todayKey), -7);
  const dedupKey = `${team._id}_datahealth_${weekStartKey}${opts?.dedupSuffix ?? ""}`;
  const alreadySent = await ctx.runQuery(internal.setterDataNotifications.hasNotificationByDedupKey, { dedupKey });
  if (alreadySent) return { sent: false, reason: "already sent for this week" };

  const data: DataHealthWeek | null = await ctx.runQuery(internal.dataHealthQueries.getDataHealthForPost, {
    teamId: team._id,
    weekStartKey,
  });
  if (!data) return { sent: false, reason: "team not found" };
  if (data.bookings === 0 && !opts?.force) return { sent: false, reason: "no sales bookings that week" };

  const isTest = opts?.dedupSuffix?.includes("_test") === true;
  const blocks = buildDataHealthSlackBlocks(data);
  const embed = buildDataHealthDiscordEmbed(data);
  const delivered = await deliver(
    team,
    team.setterEodScorecardSlackChannelId,
    dataHealthFallbackText(data),
    isTest ? withSlackTestLabel(blocks) : blocks,
    isTest ? withDiscordTestLabel(embed) : embed,
  );
  if (!delivered.ok) return { sent: false, reason: delivered.reason };
  await ctx.runMutation(internal.setterDataNotifications.recordSentNotification, {
    teamId: team._id,
    type: "data_health",
    dedupKey,
  });
  return { sent: true };
}

export const runWeeklyDataHealth = internalAction({
  args: {},
  handler: async (ctx): Promise<{ sent: number; skipped: number; errored: number }> => {
    const now = Date.now();
    const teams: Doc<"teams">[] = await ctx.runQuery(internal.dataHealthNotifications.getEnabledTeams, {});
    let sent = 0;
    let skipped = 0;
    let errored = 0;
    for (const team of teams) {
      try {
        const r = await maybeSend(ctx, team, now);
        if (r.sent) sent++;
        else skipped++;
      } catch (e) {
        errored++;
        console.error(`[dataHealth] team ${team._id}:`, e);
        try {
          await ctx.runAction(internal.lib.sentry.captureFromIsolate, {
            message: `Weekly data-health post failed for team ${team._id}: ${e instanceof Error ? e.message : String(e)}`,
            feature: "data-health",
            integration: "slack",
            extra: { teamId: String(team._id) },
          });
        } catch {
          /* Sentry is best-effort here */
        }
      }
    }
    if (sent > 0 || errored > 0) console.log(`[dataHealth] sent ${sent}, skipped ${skipped}, errored ${errored}`);
    return { sent, skipped, errored };
  },
});

/** Force one post now (last finished week), ignoring hour/day/dedup — setup verification. */
export const sendTest = internalAction({
  args: { teamId: v.id("teams"), weekStartKey: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const team = await ctx.runQuery(internal.cashDigestNotifications.getTeamForCashDigest, { teamId: args.teamId });
    if (!team) return { sent: false, reason: "team not found" };
    return await maybeSend(ctx, team, Date.now(), {
      force: true,
      dedupSuffix: `_test_${Math.floor(Date.now() / 60000)}`,
      weekStartKey: args.weekStartKey,
    });
  },
});

/** The post fully rendered, posted nowhere — the bench tool. */
export const preview = internalAction({
  args: { teamId: v.id("teams"), weekStartKey: v.optional(v.string()) },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: async (ctx, args): Promise<any> => {
    const team = await ctx.runQuery(internal.cashDigestNotifications.getTeamForCashDigest, { teamId: args.teamId });
    if (!team) return { error: "team not found" };
    const tz = team.timezone || DEFAULT_TIMEZONE;
    const weekStartKey = args.weekStartKey ?? addDaysKey(weekStartKeyFor(dayKeyInTz(Date.now(), tz)), -7);
    const data = await ctx.runQuery(internal.dataHealthQueries.getDataHealthForPost, { teamId: team._id, weekStartKey });
    if (!data) return { error: "no data" };
    return { weekStartKey, text: dataHealthFallbackText(data), blocks: buildDataHealthSlackBlocks(data), data };
  },
});

// ----------------------------------------------------------------------------
// Config — the card on the Setter EODs tab. Channel = the scorecard's.
// ----------------------------------------------------------------------------

export const getConfig = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team || !teamHasSetterTeams(team)) return null;
    return {
      enabled: team.setterDataHealthEnabled === true,
      hourLocal: team.setterDataHealthHourLocal ?? DEFAULT_HOUR,
      channelName: team.setterEodScorecardSlackChannelName ?? null,
      channelReady: !!team.slackAccessToken ? !!team.setterEodScorecardSlackChannelId : !!team.setterEodDiscordWebhookUrl,
      flag: SETTER_TEAMS_FLAG,
    };
  },
});

export const setConfig = mutation({
  args: { clerkId: v.string(), enabled: v.boolean(), hourLocal: v.number() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) throw new ConvexError("Not authorised");
    if (user.role !== "admin" && user.role !== "manager") throw new ConvexError("Only managers can do that");
    if (!Number.isInteger(args.hourLocal) || args.hourLocal < 0 || args.hourLocal > 23) {
      throw new ConvexError("Pick an hour between 0 and 23");
    }
    await ctx.db.patch(user.teamId as Id<"teams">, {
      setterDataHealthEnabled: args.enabled,
      setterDataHealthHourLocal: args.hourLocal,
    });
    return { ok: true };
  },
});
