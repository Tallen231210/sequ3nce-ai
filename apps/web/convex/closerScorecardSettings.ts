import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { resolveAuthUser } from "./setterGhlOauth";
import { DEFAULT_TIMEZONE } from "./closerPerformance";
import { DEFAULT_REPORT_DAYS } from "./closerPerformanceNotifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Config for the daily Team Performance scoreboard post.
//
// Mirrors updateScorecardConfig for the setter scorecard: one sparse mutation
// so the UI can emit a single field change rather than re-sending the whole
// config and racing itself.
// ============================================================================

function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

const DISCORD_PREFIXES = [
  "https://discord.com/api/webhooks/",
  "https://discordapp.com/api/webhooks/",
];

export const getScorecardSettings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team) return null;

    return {
      canEdit: canEdit(user),
      timezone: team.timezone || DEFAULT_TIMEZONE,
      enabled: team.closerDailyScorecardEnabled ?? false,
      channel: team.closerDailyScorecardChannel ?? null,
      slackChannelId: team.closerDailyScorecardSlackChannelId ?? null,
      slackChannelName: team.closerDailyScorecardSlackChannelName ?? null,
      discordWebhookUrl: team.closerDailyScorecardDiscordWebhookUrl ?? null,
      hourLocal: team.closerDailyScorecardHourLocal ?? 9,
      reportDays: team.closerDailyScorecardDays ?? DEFAULT_REPORT_DAYS,
      // Whether the team could actually receive a Slack post today.
      slackConnected: !!team.slackAccessToken,
      defaultSlackChannelId: team.slackChannelId ?? null,
    };
  },
});

export const updateScorecardSettings = mutation({
  args: {
    clerkId: v.string(),
    enabled: v.optional(v.boolean()),
    channel: v.optional(v.string()),
    slackChannelId: v.optional(v.string()),
    slackChannelName: v.optional(v.string()),
    discordWebhookUrl: v.optional(v.string()),
    hourLocal: v.optional(v.number()),
    reportDays: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authorised");
    if (!canEdit(user)) {
      throw new Error("Only managers can change scoreboard settings");
    }
    const teamId = user.teamId as Id<"teams">;

    if (args.channel !== undefined && !["slack", "discord"].includes(args.channel)) {
      throw new Error("channel must be 'slack' or 'discord'");
    }
    if (
      args.hourLocal !== undefined &&
      (!Number.isInteger(args.hourLocal) || args.hourLocal < 0 || args.hourLocal > 23)
    ) {
      throw new Error("hourLocal must be an integer between 0 and 23");
    }
    if (args.reportDays !== undefined) {
      const days = args.reportDays;
      if (days.length === 0) {
        throw new Error("Pick at least one day, or switch the scoreboard off");
      }
      if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new Error("Days must be 0 (Sunday) through 6 (Saturday)");
      }
      if (new Set(days).size !== days.length) {
        throw new Error("Duplicate days");
      }
    }
    if (args.slackChannelId !== undefined && args.slackChannelId.length > 100) {
      throw new Error("slackChannelId is too long");
    }
    if (args.slackChannelName !== undefined && args.slackChannelName.length > 100) {
      throw new Error("slackChannelName is too long");
    }
    if (args.discordWebhookUrl !== undefined) {
      const trimmed = args.discordWebhookUrl.trim();
      if (trimmed !== "" && !DISCORD_PREFIXES.some((p) => trimmed.startsWith(p))) {
        throw new Error("That doesn't look like a Discord webhook URL");
      }
    }

    // Sparse patch — only what was actually sent, so two settings changed in
    // quick succession can't clobber each other.
    const patch: Record<string, unknown> = {};
    if (args.enabled !== undefined) patch.closerDailyScorecardEnabled = args.enabled;
    if (args.channel !== undefined) patch.closerDailyScorecardChannel = args.channel;
    if (args.slackChannelId !== undefined) {
      patch.closerDailyScorecardSlackChannelId = args.slackChannelId;
    }
    if (args.slackChannelName !== undefined) {
      patch.closerDailyScorecardSlackChannelName = args.slackChannelName;
    }
    if (args.discordWebhookUrl !== undefined) {
      patch.closerDailyScorecardDiscordWebhookUrl =
        args.discordWebhookUrl.trim() || undefined;
    }
    if (args.hourLocal !== undefined) {
      patch.closerDailyScorecardHourLocal = args.hourLocal;
    }
    if (args.reportDays !== undefined) {
      patch.closerDailyScorecardDays = [...args.reportDays].sort((a, b) => a - b);
    }

    await ctx.db.patch(teamId, patch);
    return { success: true };
  },
});

/**
 * Post the scoreboard to the configured channel right now, skipping both the
 * hour gate and the daily dedup record.
 *
 * A manager should see the real message in their real channel before trusting
 * it to fire at 8am — a rendered preview proves nothing about tokens, channel
 * permissions or webhook URLs. The test uses its own dedup key so it can
 * never suppress the genuine morning post.
 */
export const sendTestScorecard = action({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    // Auth resolves to a teamId ONLY. The team document holds
    // slackAccessToken and must not cross into a publicly callable function.
    const target = await ctx.runQuery(
      internal.closerScorecardSettings.resolveTestTarget,
      { clerkId: args.clerkId },
    );
    if (!target) throw new Error("Not authorised");
    if (!target.canEdit) {
      throw new Error("Only managers can send a test scoreboard");
    }

    const since = target.lastTestAt ? Date.now() - target.lastTestAt : Infinity;
    if (since < TEST_SEND_COOLDOWN_MS) {
      const wait = Math.ceil((TEST_SEND_COOLDOWN_MS - since) / 1000);
      throw new Error(`Just sent one — try again in ${wait}s.`);
    }

    const result = await ctx.runAction(
      internal.closerPerformanceNotifications.sendScorecardForTeamNow,
      { teamId: target.teamId },
    );
    // Only a real post starts the cooldown; a misconfigured channel should be
    // fixable and retryable immediately.
    if (result.sent) {
      await ctx.runMutation(internal.closerScorecardSettings.markTestSent, {
        teamId: target.teamId,
      });
    }
    return result;
  },
});

/**
 * Minimum gap between manual test posts. The button writes into a real Slack
 * channel that real people read, and a stuck UI or an impatient click should
 * not turn into a burst of identical messages.
 */
const TEST_SEND_COOLDOWN_MS = 60_000;

/** Auth check for the test send. Returns an id and a permission, nothing else. */
export const resolveTestTarget = internalQuery({
  args: { clerkId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    teamId: Id<"teams">;
    canEdit: boolean;
    lastTestAt: number | null;
  } | null> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    return {
      teamId: user.teamId as Id<"teams">,
      canEdit: canEdit(user),
      lastTestAt: team?.closerDailyScorecardTestSentAt ?? null,
    };
  },
});

/** Stamped only after a send actually succeeded, so a failure is retryable. */
export const markTestSent = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      closerDailyScorecardTestSentAt: Date.now(),
    });
  },
});
