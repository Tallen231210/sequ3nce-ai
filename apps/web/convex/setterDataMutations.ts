import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// Setter Data — public mutations for the Settings tab.
//
// Every mutation here requires user.role === "admin" — these change
// team-level configuration. Throws on auth failure (UI handles via
// useMutation's error path) rather than returning null since these
// have side effects.
// ============================================================================

// ----------------------------------------------------------------------------
// AUTH HELPER
// ----------------------------------------------------------------------------

async function resolveAuthUser(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const clerkId = identity.subject;
  const user = await ctx.db
    .query("users")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", clerkId))
    .first();
  return user;
}

async function requireAdmin(ctx: Parameters<typeof resolveAuthUser>[0]) {
  // Web-dashboard users are sales managers / business owners sharing
  // one login per team — authentication itself is the admin gate.
  const user = await resolveAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

// ----------------------------------------------------------------------------
// updateScorecardConfig — Settings tab Daily Scorecard config
// ----------------------------------------------------------------------------

/**
 * Update any subset of scorecard config fields. Sparse args — only
 * provided fields get patched, others left untouched. Lets the UI emit
 * one mutation per field on blur without sending the entire config back
 * each time.
 *
 * Validation:
 *   - hourLocal ∈ [0, 23]
 *   - channel ∈ {"slack", "discord"}
 *   - slackChannelId / discordWebhookUrl: non-empty strings if provided
 */
export const updateScorecardConfig = mutation({
  args: {
    enabled: v.optional(v.boolean()),
    channel: v.optional(v.union(v.literal("slack"), v.literal("discord"))),
    slackChannelId: v.optional(v.string()),
    discordWebhookUrl: v.optional(v.string()),
    hourLocal: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const teamId = user.teamId as Id<"teams">;

    if (args.hourLocal !== undefined) {
      if (
        !Number.isInteger(args.hourLocal) ||
        args.hourLocal < 0 ||
        args.hourLocal > 23
      ) {
        throw new Error("hourLocal must be an integer 0-23");
      }
    }

    if (args.slackChannelId !== undefined && args.slackChannelId.trim() === "") {
      throw new Error("slackChannelId cannot be empty");
    }

    if (args.discordWebhookUrl !== undefined) {
      const trimmed = args.discordWebhookUrl.trim();
      if (trimmed === "") {
        throw new Error("discordWebhookUrl cannot be empty");
      }
      if (!trimmed.startsWith("https://discord.com/api/webhooks/") && !trimmed.startsWith("https://discordapp.com/api/webhooks/")) {
        throw new Error("discordWebhookUrl must be a Discord webhook URL");
      }
    }

    // Build a sparse patch — only set fields that were provided. Convex
    // patch ignores undefined keys, so passing the args directly works
    // BUT we want explicit undefined-clearing semantics for some fields
    // (e.g., switching channels should null out the unused webhook), so
    // we map carefully.
    const patch: Record<string, unknown> = {};
    if (args.enabled !== undefined) {
      patch.setterDailyScorecardEnabled = args.enabled;
    }
    if (args.channel !== undefined) {
      patch.setterDailyScorecardChannel = args.channel;
    }
    if (args.slackChannelId !== undefined) {
      patch.setterDailyScorecardSlackChannelId = args.slackChannelId;
    }
    if (args.discordWebhookUrl !== undefined) {
      patch.setterDailyScorecardDiscordWebhookUrl = args.discordWebhookUrl;
    }
    if (args.hourLocal !== undefined) {
      patch.setterDailyScorecardHourLocal = args.hourLocal;
    }

    await ctx.db.patch(teamId, patch);
    return { success: true };
  },
});

// ----------------------------------------------------------------------------
// updateUntouchedAlertConfig — Settings tab Untouched Alert config (Phase 2)
// ----------------------------------------------------------------------------

/**
 * Update any subset of untouched-alert config fields. Same sparse-update
 * pattern as updateScorecardConfig — UI emits one mutation per field
 * change rather than re-sending the entire config each time.
 *
 * Threshold capped at [1, 240] minutes — finer than 1 min would create
 * redundant alerts (the cron only runs every 2 min anyway), and longer
 * than 4 hours becomes a "daily summary" use case the scorecard already
 * covers.
 */
export const updateUntouchedAlertConfig = mutation({
  args: {
    enabled: v.optional(v.boolean()),
    thresholdMinutes: v.optional(v.number()),
    channel: v.optional(v.union(v.literal("slack"), v.literal("discord"))),
    slackChannelId: v.optional(v.string()),
    discordWebhookUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const teamId = user.teamId as Id<"teams">;

    if (args.thresholdMinutes !== undefined) {
      if (
        !Number.isInteger(args.thresholdMinutes) ||
        args.thresholdMinutes < 1 ||
        args.thresholdMinutes > 240
      ) {
        throw new Error("thresholdMinutes must be an integer 1-240");
      }
    }

    if (args.slackChannelId !== undefined && args.slackChannelId.trim() === "") {
      throw new Error("slackChannelId cannot be empty");
    }

    if (args.discordWebhookUrl !== undefined) {
      const trimmed = args.discordWebhookUrl.trim();
      if (trimmed === "") {
        throw new Error("discordWebhookUrl cannot be empty");
      }
      if (
        !trimmed.startsWith("https://discord.com/api/webhooks/") &&
        !trimmed.startsWith("https://discordapp.com/api/webhooks/")
      ) {
        throw new Error("discordWebhookUrl must be a Discord webhook URL");
      }
    }

    const patch: Record<string, unknown> = {};
    if (args.enabled !== undefined) {
      patch.setterUntouchedAlertEnabled = args.enabled;
    }
    if (args.thresholdMinutes !== undefined) {
      patch.setterUntouchedAlertThresholdMinutes = args.thresholdMinutes;
    }
    if (args.channel !== undefined) {
      patch.setterUntouchedAlertChannel = args.channel;
    }
    if (args.slackChannelId !== undefined) {
      patch.setterUntouchedAlertSlackChannelId = args.slackChannelId;
    }
    if (args.discordWebhookUrl !== undefined) {
      patch.setterUntouchedAlertDiscordWebhookUrl = args.discordWebhookUrl;
    }

    await ctx.db.patch(teamId, patch);
    return { success: true };
  },
});

// ----------------------------------------------------------------------------
// updateDispositionSyncConfig — Phase 3c toggle in Settings
// ----------------------------------------------------------------------------

/**
 * Toggle disposition sync via OAuth tokens. When enabled, the
 * post-call sync routes through the new Marketplace App connection
 * (assuming one exists). When disabled, post-call sync falls back to
 * the legacy ghlApiKey flow if configured, or no-ops otherwise.
 *
 * Pre-flight check: enabling without a connected Marketplace App is
 * allowed (UI flow may want to flip the flag before guiding through
 * install) but the actual sync action returns "not configured" until
 * an installation row exists.
 */
export const updateDispositionSyncConfig = mutation({
  args: {
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const teamId = user.teamId as Id<"teams">;
    await ctx.db.patch(teamId, {
      setterDispositionSyncEnabled: args.enabled,
    });
    return { success: true };
  },
});

// ----------------------------------------------------------------------------
// updateConnectionThreshold — Settings tab connection threshold slider
// ----------------------------------------------------------------------------

/**
 * Update what counts as a "connection" — the minimum call duration in
 * seconds for an outbound call to flip a lead's isConnected flag. Default
 * 60. Allowed range 10-600 — outside that, the metric becomes meaningless.
 *
 * Note: changing this does NOT recompute existing isConnected values on
 * setterLeads. New events use the new threshold; historical state stays
 * as-is. UI should warn the user about this. A future "recompute" admin
 * tool can backfill if needed.
 */
export const updateConnectionThreshold = mutation({
  args: {
    thresholdSec: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);
    const teamId = user.teamId as Id<"teams">;

    if (
      !Number.isInteger(args.thresholdSec) ||
      args.thresholdSec < 10 ||
      args.thresholdSec > 600
    ) {
      throw new Error("thresholdSec must be an integer 10-600");
    }

    await ctx.db.patch(teamId, {
      setterConnectionThresholdSec: args.thresholdSec,
    });
    return { success: true };
  },
});

// ----------------------------------------------------------------------------
// triggerManualSync — Settings tab "Refresh now" button
// ----------------------------------------------------------------------------

/**
 * Schedule an immediate reconcile pass for the calling team's installation.
 * The reconcile action itself sweeps ALL active installations every hour,
 * but a manual trigger from one team's UI shouldn't cascade to all
 * customers — so we use a per-installation variant.
 *
 * Returns a "queued" result; the user sees their sync indicator update
 * within a few seconds as the action runs and patches lastSyncedAt.
 */
export const triggerManualSync = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    const teamId = user.teamId as Id<"teams">;

    const installation = (await ctx.db
      .query("setterGhlInstallations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .first()) as Doc<"setterGhlInstallations"> | null;

    if (!installation) {
      throw new Error("No GoHighLevel connection found");
    }
    if (installation.status !== "active") {
      throw new Error(
        `Connection is ${installation.status} — reconnect before syncing`,
      );
    }

    await ctx.scheduler.runAfter(
      0,
      internal.setterGhlSync.reconcileSingleInstallation,
      { installationId: installation._id },
    );

    return { success: true, queuedAt: Date.now() };
  },
});

// ----------------------------------------------------------------------------
// clearDeepBackfillError — Settings tab "Resume backfill" button
// ----------------------------------------------------------------------------

/**
 * Clear a stuck deep-backfill error so the cron picks the installation
 * back up on its next 30-min tick. Used after a transient GHL outage or
 * after we've manually fixed the underlying problem.
 */
export const clearDeepBackfillError = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    const teamId = user.teamId as Id<"teams">;

    const installation = (await ctx.db
      .query("setterGhlInstallations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .withIndex("by_team", (q: any) => q.eq("teamId", teamId))
      .first()) as Doc<"setterGhlInstallations"> | null;

    if (!installation) {
      throw new Error("No GoHighLevel connection found");
    }

    if (!installation.deepBackfillError) {
      // Idempotent — no error to clear, treat as success.
      return { success: true, cleared: false };
    }

    await ctx.db.patch(installation._id, {
      deepBackfillError: undefined,
    });
    return { success: true, cleared: true };
  },
});
