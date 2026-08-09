// ============================================================================
// The manager side of the end-of-day cash digest.
//
// Deliberately the same shape as collectionsSettings — sparse mutation so the
// UI can send one changed field rather than the whole config and race itself,
// and a test-send that proves the channel works rather than a preview that
// proves nothing about tokens or permissions.
// ============================================================================

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

/* eslint-disable @typescript-eslint/no-explicit-any */

function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

const DISCORD_PREFIXES = [
  "https://discord.com/api/webhooks/",
  "https://discordapp.com/api/webhooks/",
];

const TEST_SEND_COOLDOWN_MS = 60_000;

export const getCashDigestSettings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user || !canEdit(user)) return null;

    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team) return null;

    // Config only. `slackAccessToken` lives on this document and must not
    // leave it through a publicly callable query.
    return {
      enabled: team.cashDigestEnabled === true,
      cadence: team.cashDigestCadence ?? "daily",
      hourLocal: team.cashDigestHourLocal ?? 17,
      channel: team.cashDigestChannel ?? null,
      slackChannelId: team.cashDigestSlackChannelId ?? null,
      slackChannelName: team.cashDigestSlackChannelName ?? null,
      defaultSlackChannelId: team.slackChannelId ?? null,
      discordWebhookUrl: team.cashDigestDiscordWebhookUrl ?? null,
      showLeaderboard: team.cashDigestShowLeaderboard !== false,
      timezone: team.timezone || DEFAULT_TIMEZONE,
      slackConnected: !!team.slackAccessToken,
      canEdit: canEdit(user),
    };
  },
});

export const updateCashDigestSettings = mutation({
  args: {
    clerkId: v.string(),
    enabled: v.optional(v.boolean()),
    cadence: v.optional(v.string()),
    hourLocal: v.optional(v.number()),
    channel: v.optional(v.string()),
    slackChannelId: v.optional(v.string()),
    slackChannelName: v.optional(v.string()),
    discordWebhookUrl: v.optional(v.string()),
    showLeaderboard: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authorised");
    if (!canEdit(user)) {
      throw new Error("Only managers can change the cash digest");
    }
    const teamId = user.teamId as Id<"teams">;

    if (args.channel !== undefined && !["slack", "discord"].includes(args.channel)) {
      throw new Error("channel must be 'slack' or 'discord'");
    }
    if (args.cadence !== undefined && !["daily", "weekly"].includes(args.cadence)) {
      throw new Error("cadence must be 'daily' or 'weekly'");
    }
    if (
      args.hourLocal !== undefined &&
      (!Number.isInteger(args.hourLocal) || args.hourLocal < 0 || args.hourLocal > 23)
    ) {
      throw new Error("hourLocal must be a whole hour between 0 and 23");
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
    if (args.enabled !== undefined) patch.cashDigestEnabled = args.enabled;
    if (args.cadence !== undefined) patch.cashDigestCadence = args.cadence;
    if (args.hourLocal !== undefined) patch.cashDigestHourLocal = args.hourLocal;
    if (args.channel !== undefined) patch.cashDigestChannel = args.channel;
    if (args.slackChannelId !== undefined) {
      patch.cashDigestSlackChannelId = args.slackChannelId;
    }
    if (args.slackChannelName !== undefined) {
      patch.cashDigestSlackChannelName = args.slackChannelName;
    }
    if (args.discordWebhookUrl !== undefined) {
      patch.cashDigestDiscordWebhookUrl = args.discordWebhookUrl.trim() || undefined;
    }
    if (args.showLeaderboard !== undefined) {
      patch.cashDigestShowLeaderboard = args.showLeaderboard;
    }

    await ctx.db.patch(teamId, patch);
    return { success: true };
  },
});

/**
 * Post the digest now, skipping the hour and cadence gates.
 *
 * Unlike the collections digest this does NOT skip on a quiet day — a cash
 * post showing zero is still saying something, and a manager testing at 11am
 * should see the real message rather than "nothing to send".
 */
export const sendTestCashDigest = action({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const target = await ctx.runQuery(internal.cashDigestSettings.resolveTestTarget, {
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
      internal.cashDigestNotifications.sendCashDigestNow,
      { teamId: target.teamId },
    );
    // Only a real post starts the cooldown, so a misconfigured channel stays
    // immediately retryable while someone is fixing it.
    if (result.sent) {
      await ctx.runMutation(internal.cashDigestSettings.markTestSent, {
        teamId: target.teamId,
      });
    }
    return result;
  },
});

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
      lastTestAt: team?.cashDigestTestSentAt ?? null,
    };
  },
});

export const markTestSent = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, { cashDigestTestSentAt: Date.now() });
  },
});
