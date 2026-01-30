import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { buildReinforcementBlocks } from "./slack";
import { buildReinforcementEmbed } from "./discord";

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new reinforcement request from a closer
 * Called by the desktop app when closer clicks "Request Reinforcements"
 */
export const createRequest = mutation({
  args: {
    teamId: v.id("teams"),
    closerId: v.id("closers"),
    closerName: v.string(),
    callId: v.optional(v.id("calls")),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Create the request
    const requestId = await ctx.db.insert("reinforcementRequests", {
      teamId: args.teamId,
      closerId: args.closerId,
      closerName: args.closerName,
      callId: args.callId,
      message: args.message,
      status: "pending",
      slackNotificationSent: false,
      createdAt: now,
    });

    // Schedule the Slack notification action
    await ctx.scheduler.runAfter(0, internal.reinforcements.sendSlackNotificationInternal, {
      requestId,
    });

    return { requestId, success: true };
  },
});

/**
 * Acknowledge a reinforcement request (manager clicks "Acknowledge" on the alert)
 */
export const acknowledgeRequest = mutation({
  args: {
    requestId: v.id("reinforcementRequests"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Request not found");
    }

    if (request.status !== "pending") {
      // Already acknowledged or resolved
      return { success: true, alreadyHandled: true };
    }

    await ctx.db.patch(args.requestId, {
      status: "acknowledged",
      acknowledgedBy: args.userId,
      acknowledgedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Resolve a reinforcement request (call ended or manager explicitly resolves)
 */
export const resolveRequest = mutation({
  args: {
    requestId: v.id("reinforcementRequests"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Request not found");
    }

    await ctx.db.patch(args.requestId, {
      status: "resolved",
      resolvedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Internal mutation to mark Slack notification as sent
 */
export const markSlackNotificationSent = internalMutation({
  args: {
    requestId: v.id("reinforcementRequests"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      slackNotificationSent: true,
    });
  },
});

// ============================================
// QUERIES
// ============================================

/**
 * Get all active (pending + acknowledged) requests for a team
 * Used by the web dashboard to show alerts
 */
export const getActiveRequestsForTeam = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    // Get pending requests
    const pending = await ctx.db
      .query("reinforcementRequests")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "pending")
      )
      .collect();

    // Get acknowledged requests
    const acknowledged = await ctx.db
      .query("reinforcementRequests")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "acknowledged")
      )
      .collect();

    // Combine and sort by createdAt (newest first)
    const all = [...pending, ...acknowledged].sort(
      (a, b) => b.createdAt - a.createdAt
    );

    return all;
  },
});

/**
 * Get count of pending requests for a team (for badge display)
 */
export const getPendingCountForTeam = query({
  args: {
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("reinforcementRequests")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "pending")
      )
      .collect();

    return { count: pending.length };
  },
});

/**
 * Get request history for a closer
 */
export const getRequestHistoryForCloser = query({
  args: {
    closerId: v.id("closers"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const requests = await ctx.db
      .query("reinforcementRequests")
      .withIndex("by_closer", (q) => q.eq("closerId", args.closerId))
      .order("desc")
      .take(args.limit || 20);

    return requests;
  },
});

// ============================================
// ACTIONS
// ============================================

// Internal types for Slack notification result
type SlackNotificationResult =
  | { success: true }
  | { success: true; skipped: true; reason: string }
  | { success: false; error: string };

/**
 * Internal action to send Slack notification
 * Uses the unified slack.sendSlackNotification which supports both OAuth and legacy webhook
 */
export const sendSlackNotificationInternal = internalAction({
  args: {
    requestId: v.id("reinforcementRequests"),
  },
  returns: v.union(
    v.object({ success: v.literal(true) }),
    v.object({ success: v.literal(true), skipped: v.literal(true), reason: v.string() }),
    v.object({ success: v.literal(false), error: v.string() })
  ),
  handler: async (ctx, args): Promise<SlackNotificationResult> => {
    try {
      console.log("[Reinforcements] sendSlackNotificationInternal started for request:", args.requestId);

      // Get the request details
      const request = await ctx.runQuery(api.reinforcements.getRequestById, {
        requestId: args.requestId,
      });

      console.log("[Reinforcements] Request fetched:", request ? "found" : "not found");

      if (!request) {
        console.error("[Reinforcements] Request not found:", args.requestId);
        return { success: false, error: "Request not found" };
      }

      console.log("[Reinforcements] Request teamId:", request.teamId);

      // Build the message using the unified formatter
      const { blocks, text } = buildReinforcementBlocks(
        request.closerName,
        request.message,
        request.createdAt
      );

      // Send via unified Slack notification system
      const result = await ctx.runAction(internal.slack.sendSlackNotification, {
        teamId: request.teamId,
        callId: request.callId,
        type: "reinforcement",
        blocks,
        text,
      });

      if (!result.success) {
        if ("skipped" in result && (result as any).skipped) {
          const reason = (result as any).reason || "Unknown";
          console.log("[Reinforcements] Notification skipped:", reason);
          return { success: true, skipped: true, reason };
        }
        console.error("[Reinforcements] Failed to send:", (result as any).error);
        return { success: false, error: (result as any).error || "Unknown error" };
      }

      // Mark as sent
      await ctx.runMutation(internal.reinforcements.markSlackNotificationSent, {
        requestId: args.requestId,
      });

      console.log("[Reinforcements] Slack notification sent successfully for request:", args.requestId);

      // Also send to Discord (if configured)
      try {
        const { content, embeds } = buildReinforcementEmbed(
          request.closerName,
          request.message,
          request.createdAt
        );

        await ctx.runAction(internal.discord.sendDiscordNotification, {
          teamId: request.teamId,
          callId: request.callId,
          type: "reinforcement",
          content,
          embeds,
        });
        console.log("[Reinforcements] Discord notification sent for request:", args.requestId);
      } catch (discordError) {
        // Log but don't fail the overall notification if Discord fails
        console.error("[Reinforcements] Discord notification failed:", discordError);
      }

      return { success: true };
    } catch (error) {
      console.error("[Reinforcements] ERROR in sendSlackNotificationInternal:", error);
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Test Slack webhook connection
 */
export const testSlackWebhook = action({
  args: {
    webhookUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "✅ *Sequ3nce Slack Integration Test*\n\nYour Slack webhook is working correctly! You'll receive reinforcement request notifications in this channel.",
        },
      },
    ];

    try {
      const response = await fetch(args.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ blocks }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Slack webhook failed: ${response.status} - ${errorText}` };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
});

// ============================================
// HELPER QUERIES (for internal use)
// ============================================

/**
 * Get a single request by ID
 */
export const getRequestById = query({
  args: {
    requestId: v.id("reinforcementRequests"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.requestId);
  },
});
