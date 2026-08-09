// ============================================================================
// The manager side of compliance: the two settings, reading a call's findings,
// re-running one call, and trying draft rules before switching anything on.
//
// Every function here is manager-gated with no visibility toggle, because the
// closer is not meant to have a surface at all. See complianceNotifications.ts.
//
// Same shape as collectionsSettings: sparse mutation so the UI can send one
// changed field instead of the whole config and race itself.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

function canEdit(user: Doc<"users">): boolean {
  return user.role === "admin" || user.role === "manager";
}

const DISCORD_PREFIXES = [
  "https://discord.com/api/webhooks/",
  "https://discordapp.com/api/webhooks/",
];

/**
 * Generous on purpose. RemoteStack's real document is about 2,700 characters
 * and reads like a page of a sales handbook; a customer pasting three pages of
 * one should not hit a wall. The cap exists to stop someone pasting a novel
 * into every AI request, not to make them edit.
 */
const MAX_RULES_CHARS = 20_000;

/** How far back the "try it" button looks for a call worth testing against. */
const PREVIEW_SEARCH_DEPTH = 12;
const PREVIEW_MIN_CHARS = 1_000;

// ----------------------------------------------------------------------------
// Settings
// ----------------------------------------------------------------------------

export const getComplianceSettings = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    if (!canEdit(user)) return null;

    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team) return null;

    // Config only. `slackAccessToken` lives on this document and must not leave
    // it through a publicly callable query.
    return {
      enabled: team.complianceEnabled === true,
      rules: team.complianceRules ?? "",
      channel: team.complianceChannel ?? null,
      slackChannelId: team.complianceSlackChannelId ?? null,
      slackChannelName: team.complianceSlackChannelName ?? null,
      discordWebhookUrl: team.complianceDiscordWebhookUrl ?? null,
      sharePassword: team.compliancePassword ?? "",
      slackConnected: !!team.slackAccessToken,
    };
  },
});

export const updateComplianceSettings = mutation({
  args: {
    clerkId: v.string(),
    enabled: v.optional(v.boolean()),
    rules: v.optional(v.string()),
    channel: v.optional(v.string()),
    slackChannelId: v.optional(v.string()),
    slackChannelName: v.optional(v.string()),
    discordWebhookUrl: v.optional(v.string()),
    sharePassword: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new Error("Not authorised");
    if (!canEdit(user)) {
      throw new Error("Only managers can change compliance settings");
    }
    const teamId = user.teamId as Id<"teams">;

    if (args.channel !== undefined && !["slack", "discord"].includes(args.channel)) {
      throw new Error("channel must be 'slack' or 'discord'");
    }
    if (args.rules !== undefined && args.rules.length > MAX_RULES_CHARS) {
      throw new Error(
        `Rules are ${args.rules.length.toLocaleString()} characters — the limit is ${MAX_RULES_CHARS.toLocaleString()}.`,
      );
    }
    if (args.slackChannelId !== undefined && args.slackChannelId.length > 100) {
      throw new Error("slackChannelId is too long");
    }
    if (args.slackChannelName !== undefined && args.slackChannelName.length > 100) {
      throw new Error("slackChannelName is too long");
    }
    if (args.sharePassword !== undefined && args.sharePassword.length > 128) {
      throw new Error("That password is too long (128 characters max).");
    }
    if (args.discordWebhookUrl !== undefined) {
      const trimmed = args.discordWebhookUrl.trim();
      if (trimmed !== "" && !DISCORD_PREFIXES.some((p) => trimmed.startsWith(p))) {
        throw new Error("That doesn't look like a Discord webhook URL");
      }
    }

    // Switching it on with an empty rules box would review every call against
    // nothing and quietly find nothing, which looks identical to a clean team.
    if (args.enabled === true) {
      const team = await ctx.db.get(teamId);
      const effective = args.rules !== undefined ? args.rules : team?.complianceRules ?? "";
      if (!effective.trim()) {
        throw new Error("Write your rules before switching compliance on.");
      }
    }

    const patch: Record<string, unknown> = {};
    if (args.enabled !== undefined) patch.complianceEnabled = args.enabled;
    if (args.rules !== undefined) patch.complianceRules = args.rules;
    if (args.channel !== undefined) patch.complianceChannel = args.channel;
    if (args.slackChannelId !== undefined) {
      patch.complianceSlackChannelId = args.slackChannelId;
    }
    if (args.slackChannelName !== undefined) {
      patch.complianceSlackChannelName = args.slackChannelName;
    }
    if (args.discordWebhookUrl !== undefined) {
      patch.complianceDiscordWebhookUrl = args.discordWebhookUrl.trim() || undefined;
    }
    // Empty clears the gate. Existing links are re-gated (or un-gated) the next
    // time an alert touches them, so this isn't a setting that only applies to
    // calls recorded from here.
    if (args.sharePassword !== undefined) {
      patch.compliancePassword = args.sharePassword.trim() || undefined;
    }

    await ctx.db.patch(teamId, patch);

    // Same transaction as the setting itself, so the links can never disagree
    // with what the settings page says the password is.
    if (args.sharePassword !== undefined) {
      await ctx.runMutation(internal.sharedLinks.regateComplianceLinks, {
        teamId,
        password: args.sharePassword,
      });
    }

    return { success: true };
  },
});

// ----------------------------------------------------------------------------
// Proving the channel works
// ----------------------------------------------------------------------------

/**
 * Minimum gap between test posts. The button writes into a real channel that
 * real people read, and an impatient second click shouldn't become a burst of
 * identical messages.
 */
const TEST_SEND_COOLDOWN_MS = 60_000;

/**
 * Send a sample alert to the configured channel.
 *
 * Exists because the most likely way this feature fails is the least visible
 * one: a private Slack channel our bot was never invited to. That failure is
 * indistinguishable from a run of clean calls, so it must be provable during
 * setup rather than discovered on the first call that mattered.
 */
export const sendTestComplianceAlert = action({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    // Auth resolves to a teamId and a permission, nothing more. The team
    // document holds slackAccessToken and must not cross into a public caller.
    const target = await ctx.runQuery(internal.complianceSettings.resolveTestTarget, {
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
      internal.complianceNotifications.sendComplianceTestAlert,
      { teamId: target.teamId },
    );
    // Only a real post starts the cooldown, so a misconfigured channel stays
    // immediately retryable while someone is fixing it.
    if (result.sent) {
      await ctx.runMutation(internal.complianceSettings.markTestSent, {
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
      lastTestAt: team?.complianceTestSentAt ?? null,
    };
  },
});

export const markTestSent = internalMutation({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, { complianceTestSentAt: Date.now() });
  },
});

// ----------------------------------------------------------------------------
// Reading one call
// ----------------------------------------------------------------------------

/**
 * The findings for a single call, for the call detail page.
 *
 * Returns null rather than throwing for a closer, so the page renders without
 * the section instead of erroring — a closer hitting an error where a manager
 * sees a panel tells them exactly what they aren't allowed to see.
 */
export const getCallCompliance = query({
  args: { clerkId: v.string(), callId: v.id("calls") },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user || !canEdit(user)) return null;

    const call = await ctx.db.get(args.callId);
    if (!call || String(call.teamId) !== String(user.teamId)) return null;

    // Deliberately NOT gated on complianceEnabled. Switching the feature off
    // should stop new reviews and new alerts — it must not make the reviews
    // already on record disappear from the calls they describe. A compliance
    // record that vanishes when a setting is toggled is worse than no record.
    const team = await ctx.db.get(user.teamId as Id<"teams">);

    const content = await ctx.db
      .query("callContent")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .first();

    const review = content?.complianceReview ?? null;
    const failure = call.complianceReviewFailed ?? null;

    // Nothing happened here at all — no review, no failure. Most calls on a
    // team that only just switched compliance on are in this state, and the
    // panel shouldn't appear for them.
    if (!review && !failure) return null;

    // A failure is shown INSTEAD of nothing. The whole hazard with this feature
    // is that an absent review reads as a clean call, so the one case that must
    // never be silent is the one where we couldn't produce an answer.
    if (!review) return { review: null, failure, rulesChanged: false };

    // The rules in force when this was scored are stored with it. If they've
    // been edited since, the score is still a true record of a past judgement —
    // it just isn't a judgement against today's rules, and saying so is the
    // difference between an explicable number and a confusing one.
    return {
      review,
      failure,
      rulesChanged: (review.rulesUsed ?? "") !== (team?.complianceRules ?? ""),
    };
  },
});

/** Re-score one call against the current rules. The "I've edited the rules" button. */
export const rerunComplianceReview = action({
  args: { clerkId: v.string(), callId: v.id("calls") },
  handler: async (ctx, args): Promise<any> => {
    const ok = await ctx.runQuery(internal.complianceSettings.assertCallInTeam, {
      clerkId: args.clerkId,
      callId: args.callId,
    });
    if (!ok) throw new Error("Not authorised");

    return await ctx.runAction(internal.compliance.reviewCall, {
      callId: args.callId,
      force: true,
    });
  },
});

export const assertCallInTeam = internalQuery({
  args: { clerkId: v.string(), callId: v.id("calls") },
  handler: async (ctx, args): Promise<boolean> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user || !canEdit(user)) return false;
    const call = await ctx.db.get(args.callId);
    return !!call && String(call.teamId) === String(user.teamId);
  },
});

// ----------------------------------------------------------------------------
// Trying rules before switching them on
// ----------------------------------------------------------------------------

/**
 * Find a real call from this team long enough to be worth testing against.
 *
 * Deliberately not the single most recent call: with bots auto-joining the
 * calendar, the most recent thing is often a no-show or a two-minute
 * rescheduling call, and rules that find nothing in one of those tell a manager
 * precisely nothing about whether their rules work.
 */
export const findPreviewCall = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user || !canEdit(user)) return null;

    const calls = await ctx.db
      .query("calls")
      .withIndex("by_team_and_status", (q) =>
        q.eq("teamId", user.teamId as Id<"teams">).eq("status", "completed"),
      )
      .order("desc")
      .take(PREVIEW_SEARCH_DEPTH);

    let best: { callId: Id<"calls">; transcript: string; prospectName: string | null } | null =
      null;

    for (const call of calls) {
      if (call.classifiedAs === "internal") continue;
      const content = await ctx.db
        .query("callContent")
        .withIndex("by_call", (q) => q.eq("callId", call._id))
        .first();
      const transcript = content?.transcriptText ?? "";
      if (transcript.length < PREVIEW_MIN_CHARS) continue;
      if (!best || transcript.length > best.transcript.length) {
        best = {
          callId: call._id,
          transcript,
          prospectName: call.prospectName ?? null,
        };
      }
    }

    return best;
  },
});

/**
 * Run draft rules against a real call and return the result without storing it.
 *
 * This is the part that makes the rules box usable. Rules that are too vague
 * produce a wall of findings on a clean call; too narrow and they miss things.
 * Neither is visible from reading your own paragraph back — it needs a real
 * transcript, and it needs to happen before the first alert lands in a channel
 * with the business owner in it.
 */
export const previewComplianceRules = action({
  args: { clerkId: v.string(), rules: v.string() },
  handler: async (ctx, args): Promise<any> => {
    if (!args.rules.trim()) {
      return { ok: false, reason: "Write some rules first." };
    }
    if (args.rules.length > MAX_RULES_CHARS) {
      return { ok: false, reason: "Those rules are too long to test." };
    }

    const target = await ctx.runQuery(internal.complianceSettings.findPreviewCall, {
      clerkId: args.clerkId,
    });
    if (target === null) {
      // Either not a manager, or genuinely no call long enough. Both land here
      // and the message covers the case a manager can actually do something
      // about, since the other one they can't reach this button from.
      return {
        ok: false,
        reason:
          "No recorded call long enough to test against yet — try again once a full call has been recorded.",
      };
    }

    const result = await ctx.runAction(internal.compliance.previewReview, {
      callId: target.callId,
      rules: args.rules,
    });

    return { ...result, testedAgainst: target.prospectName };
  },
});
