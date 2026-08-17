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
// Config for the "who hasn't filed their end-of-day" nudge.
//
// Deliberately a copy of closerScorecardSettings rather than a shared
// abstraction: the two are configured side by side and will drift apart (this
// one may grow a "chase the closer directly" option), and a premature shared
// helper across notification types is how one team's setting change starts
// silently altering another's.
// ============================================================================

function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

const DISCORD_PREFIXES = [
  "https://discord.com/api/webhooks/",
  "https://discordapp.com/api/webhooks/",
];

export const getEodNudgeSettings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team) return null;

    return {
      canEdit: canEdit(user),
      timezone: team.timezone || DEFAULT_TIMEZONE,
      enabled: team.eodNudgeEnabled ?? false,
      channel: team.eodNudgeChannel ?? null,
      slackChannelId: team.eodNudgeSlackChannelId ?? null,
      slackChannelName: team.eodNudgeSlackChannelName ?? null,
      discordWebhookUrl: team.eodNudgeDiscordWebhookUrl ?? null,
      // No default hour. A nudge that starts firing at a time nobody chose is
      // worse than one that waits to be configured.
      hourLocal: team.eodNudgeHourLocal ?? null,
      reportDays: team.eodNudgeDays ?? DEFAULT_REPORT_DAYS,
      slackConnected: !!team.slackAccessToken,
      defaultSlackChannelId: team.slackChannelId ?? null,
    };
  },
});

export const updateEodNudgeSettings = mutation({
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
      throw new Error("Only managers can change notification settings");
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
        throw new Error("Pick at least one day, or switch the nudge off");
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

    // Switching on without a delivery hour would mean a nudge that silently
    // never fires, which reads as a broken feature rather than a missing setting.
    if (args.enabled === true) {
      const team = await ctx.db.get(teamId);
      const hour = args.hourLocal ?? team?.eodNudgeHourLocal;
      if (typeof hour !== "number") {
        throw new Error("Pick a delivery time before switching the nudge on");
      }
    }

    // Sparse patch — only what was actually sent, so two settings changed in
    // quick succession can't clobber each other.
    const patch: Record<string, unknown> = {};
    if (args.enabled !== undefined) patch.eodNudgeEnabled = args.enabled;
    if (args.channel !== undefined) patch.eodNudgeChannel = args.channel;
    if (args.slackChannelId !== undefined) {
      patch.eodNudgeSlackChannelId = args.slackChannelId;
    }
    if (args.slackChannelName !== undefined) {
      patch.eodNudgeSlackChannelName = args.slackChannelName;
    }
    if (args.discordWebhookUrl !== undefined) {
      patch.eodNudgeDiscordWebhookUrl = args.discordWebhookUrl.trim() || undefined;
    }
    if (args.hourLocal !== undefined) patch.eodNudgeHourLocal = args.hourLocal;
    if (args.reportDays !== undefined) {
      patch.eodNudgeDays = [...args.reportDays].sort((a, b) => a - b);
    }

    await ctx.db.patch(teamId, patch);
    return { success: true };
  },
});

/** Minimum gap between manual test posts into a live channel. */
const TEST_SEND_COOLDOWN_MS = 60_000;

/**
 * Post the nudge now, skipping the hour, weekday and dedup gates.
 *
 * Note this can legitimately answer "nothing to send" — if everyone filed
 * yesterday there is no message, and saying so is more useful than inventing
 * a sample one that names nobody.
 */
export const sendTestEodNudge = action({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const target = await ctx.runQuery(internal.eodNudgeSettings.resolveTestTarget, {
      clerkId: args.clerkId,
    });
    if (!target) throw new Error("Not authorised");
    if (!target.canEdit) throw new Error("Only managers can send a test");

    const since = target.lastTestAt ? Date.now() - target.lastTestAt : Infinity;
    if (since < TEST_SEND_COOLDOWN_MS) {
      const wait = Math.ceil((TEST_SEND_COOLDOWN_MS - since) / 1000);
      throw new Error(`Just sent one — try again in ${wait}s.`);
    }

    const result = await ctx.runAction(
      internal.eodNudgeNotifications.sendEodNudgeForTeamNow,
      { teamId: target.teamId },
    );
    if (result.sent) {
      await ctx.runMutation(internal.eodNudgeSettings.markTestSent, {
        teamId: target.teamId,
      });
    }
    return result;
  },
});

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
      lastTestAt: team?.eodNudgeTestSentAt ?? null,
    };
  },
});

/** Stamped only after a send actually succeeded, so a failure is retryable. */
export const markTestSent = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, { eodNudgeTestSentAt: Date.now() });
  },
});
