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
import {
  applyBalanceResolution,
  applyBalanceUndo,
  collectTeamCleared,
  collectTeamOutstanding,
} from "./collections";
import type { OutstandingBalancesResult } from "./collections";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// The manager side of outstanding balances: the list, the two actions, and the
// digest configuration.
//
// Deliberately the same shape as closerScorecardSettings — sparse mutation so
// the UI can emit one field change rather than re-sending the whole config and
// racing itself, and a test-send that proves the channel works rather than
// rendering a preview that proves nothing about tokens or permissions.
// ============================================================================

function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

const DISCORD_PREFIXES = [
  "https://discord.com/api/webhooks/",
  "https://discordapp.com/api/webhooks/",
];

/** Everything the team is still owed. Drives the /dashboard/collections page. */
export const getOutstandingBalances = query({
  args: { clerkId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<(OutstandingBalancesResult & { canEdit: boolean }) | null> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const result = await collectTeamOutstanding(
      ctx,
      user.teamId as Id<"teams">,
      Date.now(),
    );
    return { ...result, canEdit: canEdit(user) };
  },
});

/**
 * Close a balance out from the manager dashboard.
 *
 * Scoped to the caller's own team, resolved server-side from their identity —
 * the client never supplies a team id, so a call id belonging to someone else's
 * team is rejected rather than silently actioned.
 */
export const resolveBalance = mutation({
  args: {
    clerkId: v.string(),
    callId: v.id("calls"),
    resolution: v.union(v.literal("settled"), v.literal("written_off")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; error?: string }> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authorised");
    if (!canEdit(user)) {
      throw new Error("Only managers can clear a balance");
    }

    const call = await ctx.db.get(args.callId);
    if (!call) return { success: false, error: "That call no longer exists." };
    if (String(call.teamId) !== String(user.teamId)) {
      return { success: false, error: "That call isn't on your team." };
    }

    return applyBalanceResolution(
      ctx,
      args.callId,
      args.resolution,
      String(user._id),
    );
  },
});

/**
 * Balances cleared in the last month, most recent first.
 *
 * Clearing is two clicks from a Slack channel. Without this, a mis-tick writes
 * off a real deal permanently and the only way back is someone editing the
 * database by hand.
 */
export const getClearedBalances = query({
  args: { clerkId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<(OutstandingBalancesResult & { canEdit: boolean }) | null> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const result = await collectTeamCleared(
      ctx,
      user.teamId as Id<"teams">,
      Date.now(),
    );
    return { ...result, canEdit: canEdit(user) };
  },
});

/** Put a cleared balance back on the list. */
export const undoBalance = mutation({
  args: { clerkId: v.string(), callId: v.id("calls") },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; error?: string }> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authorised");
    if (!canEdit(user)) throw new Error("Only managers can restore a balance");

    const call = await ctx.db.get(args.callId);
    if (!call) return { success: false, error: "That call no longer exists." };
    if (String(call.teamId) !== String(user.teamId)) {
      return { success: false, error: "That call isn't on your team." };
    }

    return applyBalanceUndo(ctx, args.callId);
  },
});

export const getCollectionsSettings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team) return null;

    return {
      canEdit: canEdit(user),
      timezone: team.timezone || DEFAULT_TIMEZONE,
      enabled: team.collectionsDigestEnabled ?? false,
      channel: team.collectionsDigestChannel ?? null,
      slackChannelId: team.collectionsDigestSlackChannelId ?? null,
      slackChannelName: team.collectionsDigestSlackChannelName ?? null,
      discordWebhookUrl: team.collectionsDigestDiscordWebhookUrl ?? null,
      hourLocal: team.collectionsDigestHourLocal ?? 8,
      cadence: team.collectionsDigestCadence ?? "daily",
      // Whether the team could actually receive a Slack post today.
      slackConnected: !!team.slackAccessToken,
      defaultSlackChannelId: team.slackChannelId ?? null,
    };
  },
});

export const updateCollectionsSettings = mutation({
  args: {
    clerkId: v.string(),
    enabled: v.optional(v.boolean()),
    channel: v.optional(v.string()),
    slackChannelId: v.optional(v.string()),
    slackChannelName: v.optional(v.string()),
    discordWebhookUrl: v.optional(v.string()),
    hourLocal: v.optional(v.number()),
    cadence: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authorised");
    if (!canEdit(user)) {
      throw new Error("Only managers can change collections settings");
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
      throw new Error("hourLocal must be an integer between 0 and 23");
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
    if (args.enabled !== undefined) patch.collectionsDigestEnabled = args.enabled;
    if (args.channel !== undefined) patch.collectionsDigestChannel = args.channel;
    if (args.slackChannelId !== undefined) {
      patch.collectionsDigestSlackChannelId = args.slackChannelId;
    }
    if (args.slackChannelName !== undefined) {
      patch.collectionsDigestSlackChannelName = args.slackChannelName;
    }
    if (args.discordWebhookUrl !== undefined) {
      patch.collectionsDigestDiscordWebhookUrl =
        args.discordWebhookUrl.trim() || undefined;
    }
    if (args.hourLocal !== undefined) {
      patch.collectionsDigestHourLocal = args.hourLocal;
    }
    if (args.cadence !== undefined) patch.collectionsDigestCadence = args.cadence;

    await ctx.db.patch(teamId, patch);
    return { success: true };
  },
});

/**
 * Minimum gap between manual test posts. The button writes into a real channel
 * that real people read, and an impatient click should not turn into a burst of
 * identical messages.
 */
const TEST_SEND_COOLDOWN_MS = 60_000;

/**
 * Post the digest to the configured channel right now, skipping the hour and
 * cadence gates.
 *
 * Note it does NOT skip the silence rule: a team with nothing outstanding gets
 * no test message, and the button says so. Posting an empty digest into a live
 * channel to prove the wiring works would teach the channel exactly the wrong
 * thing about what this message means.
 */
export const sendTestCollectionsDigest = action({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    // Auth resolves to a teamId ONLY. The team document holds slackAccessToken
    // and must not cross into a publicly callable function.
    const target = await ctx.runQuery(
      internal.collectionsSettings.resolveTestTarget,
      { clerkId: args.clerkId },
    );
    if (!target) throw new Error("Not authorised");
    if (!target.canEdit) {
      throw new Error("Only managers can send a test digest");
    }

    const since = target.lastTestAt ? Date.now() - target.lastTestAt : Infinity;
    if (since < TEST_SEND_COOLDOWN_MS) {
      const wait = Math.ceil((TEST_SEND_COOLDOWN_MS - since) / 1000);
      throw new Error(`Just sent one — try again in ${wait}s.`);
    }

    const result = await ctx.runAction(
      internal.collectionsNotifications.sendCollectionsDigestNow,
      { teamId: target.teamId },
    );
    // Only a real post starts the cooldown; a misconfigured channel should be
    // fixable and retryable immediately.
    if (result.sent) {
      await ctx.runMutation(internal.collectionsSettings.markTestSent, {
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
      lastTestAt: team?.collectionsDigestTestSentAt ?? null,
    };
  },
});

/** Stamped only after a send actually succeeded, so a failure is retryable. */
export const markTestSent = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      collectionsDigestTestSentAt: Date.now(),
    });
  },
});
