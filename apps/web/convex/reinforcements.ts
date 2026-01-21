import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

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

      // Get the team to check for Slack webhook
      console.log("[Reinforcements] About to fetch team...");
      const team = await ctx.runQuery(api.teams.getTeamById, {
        teamId: request.teamId,
      });

      console.log("[Reinforcements] Team fetched:", team ? "found" : "not found", "slackWebhookUrl:", team?.slackWebhookUrl ? "configured" : "not configured");

      if (!team?.slackWebhookUrl) {
        console.log("[Reinforcements] No Slack webhook configured for team:", request.teamId);
        return { success: true, skipped: true, reason: "No Slack webhook configured" };
      }

      // Build the Slack message
      const blocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🚨 Reinforcement Requested",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${request.closerName}* needs help on a call!${
              request.message ? `\n\n> ${request.message}` : ""
            }`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Open Dashboard",
                emoji: true,
              },
              url: "https://sequ3nce.ai/dashboard",
              action_id: "open_dashboard",
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Requested at <!date^${Math.floor(request.createdAt / 1000)}^{time}|${new Date(request.createdAt).toLocaleTimeString()}>`,
            },
          ],
        },
      ];

      console.log("[Reinforcements] Sending to Slack webhook...");

      const webhookResponse = await fetch(team.slackWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ blocks }),
      });

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text();
        console.error("[Reinforcements] Slack webhook failed:", webhookResponse.status, errorText);
        return { success: false, error: `Slack webhook failed: ${webhookResponse.status}` };
      }

      // Mark as sent
      await ctx.runMutation(internal.reinforcements.markSlackNotificationSent, {
        requestId: args.requestId,
      });

      console.log("[Reinforcements] Slack notification sent successfully for request:", args.requestId);
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
