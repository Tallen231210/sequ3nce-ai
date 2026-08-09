import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  buildCallStartedEmbed,
  buildCallGoingLongEmbed,
  buildCallCompletedEmbed,
} from "./discord";

// ============================================
// SLACK OAUTH
// ============================================

/**
 * Exchange OAuth code for access token and save connection
 * Called by the Next.js API route after Slack redirect
 */
export const exchangeCodeForToken = action({
  args: {
    code: v.string(),
    teamId: v.id("teams"),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    const redirectUri = process.env.SLACK_REDIRECT_URI || "https://sequ3nce.ai/api/slack/callback";

    if (!clientId || !clientSecret) {
      throw new Error("Slack credentials not configured");
    }

    // Exchange code for token
    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: args.code,
        redirect_uri: redirectUri,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error("[Slack] OAuth error:", data.error);
      throw new Error(`Slack OAuth failed: ${data.error}`);
    }

    // Extract the data we need
    const accessToken = data.access_token;
    const slackTeamId = data.team?.id;
    const slackTeamName = data.team?.name;

    // Get the channel from incoming_webhook (if they selected one)
    const channelId = data.incoming_webhook?.channel_id;
    const channelName = data.incoming_webhook?.channel;

    // Save the connection
    await ctx.runMutation(internal.slack.saveSlackConnectionInternal, {
      teamId: args.teamId,
      accessToken,
      channelId: channelId || undefined,
      channelName: channelName || undefined,
      slackTeamId: slackTeamId || undefined,
      slackTeamName: slackTeamName || undefined,
    });

    return {
      success: true,
      channelName: channelName || undefined,
      slackTeamName: slackTeamName || undefined,
    };
  },
});

/**
 * Internal mutation to save Slack connection
 */
export const saveSlackConnectionInternal = internalMutation({
  args: {
    teamId: v.id("teams"),
    accessToken: v.string(),
    channelId: v.optional(v.string()),
    channelName: v.optional(v.string()),
    slackTeamId: v.optional(v.string()),
    slackTeamName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.teamId, {
      slackAccessToken: args.accessToken,
      slackChannelId: args.channelId,
      slackChannelName: args.channelName,
      slackTeamId: args.slackTeamId,
      slackTeamName: args.slackTeamName,
      slackConnectedAt: Date.now(),
      // Clear legacy webhook URL when using OAuth
      slackWebhookUrl: undefined,
    });
  },
});

/**
 * Get available Slack channels for the team
 * Fetches channels where the bot is a member
 */
export const getSlackChannels = action({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args): Promise<{ channels: { id: string; name: string; isPrivate: boolean }[] } | { error: string }> => {
    const user = await ctx.runQuery(api.teams.getMyUser, { clerkId: args.clerkId }) as { teamId: string } | null;
    if (!user) {
      return { error: "User not found" };
    }

    const team = await ctx.runQuery(api.teams.getTeamById, { teamId: user.teamId as any }) as { slackAccessToken?: string } | null;
    if (!team) {
      return { error: "Team not found" };
    }

    if (!team.slackAccessToken) {
      return { error: "Slack not connected" };
    }

    try {
      // Paginate through all channels — Slack defaults to a small page size
      const allChannels: { id: string; name: string; isPrivate: boolean }[] = [];
      let cursor: string | undefined;

      do {
        const url = new URL("https://slack.com/api/conversations.list");
        url.searchParams.set("types", "public_channel,private_channel");
        url.searchParams.set("exclude_archived", "true");
        url.searchParams.set("limit", "1000");
        if (cursor) {
          url.searchParams.set("cursor", cursor);
        }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${team.slackAccessToken}`,
          },
        });

        const data = await response.json();

        if (!data.ok) {
          console.error("[Slack] Failed to fetch channels:", data.error);
          return { error: data.error };
        }

        // Return every channel the OAuth token can see (public + private channels
        // the installer added during OAuth). The UI calls joinSlackChannel to
        // auto-add the bot when a channel is selected (channels:join scope).
        // Pre-filtering on is_member here was the historical setup blocker —
        // fresh integrations had the bot in zero channels, so the picker was
        // empty and the auto-join code was unreachable.
        // isPrivate flows to the UI so the picker can show a lock icon and
        // surface actionable copy when conversations.join fails on private channels.
        for (const ch of data.channels || []) {
          allChannels.push({
            id: ch.id,
            name: ch.name,
            isPrivate: ch.is_private === true,
          });
        }

        cursor = data.response_metadata?.next_cursor || undefined;
      } while (cursor);

      allChannels.sort((a, b) => a.name.localeCompare(b.name));
      console.log("[Slack] Returning channels:", allChannels.length);

      return { channels: allChannels };
    } catch (error) {
      console.error("[Slack] Error fetching channels:", error);
      await ctx.scheduler.runAfter(0, internal.lib.sentry.captureFromIsolate, {
        message: error instanceof Error ? error.message : String(error),
        feature: "getSlackChannels",
        integration: "slack",
      });
      return { error: String(error) };
    }
  },
});

/**
 * Auto-join the bot to a Slack channel when selected for notifications.
 * Uses conversations.join (only works for public channels — private channels
 * still need a manual /invite).
 */
export const joinSlackChannel = action({
  args: {
    clerkId: v.string(),
    channelId: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const user = await ctx.runQuery(api.teams.getMyUser, { clerkId: args.clerkId }) as { teamId: string } | null;
    if (!user) return { success: false, error: "User not found" };

    const team = await ctx.runQuery(api.teams.getTeamById, { teamId: user.teamId as any }) as { slackAccessToken?: string } | null;
    if (!team?.slackAccessToken) return { success: false, error: "Slack not connected" };

    try {
      const response = await fetch("https://slack.com/api/conversations.join", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${team.slackAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ channel: args.channelId }),
      });

      const data = await response.json();
      if (!data.ok && data.error !== "already_in_channel") {
        // "method_not_supported_for_channel_type" means it's a private channel
        if (data.error === "method_not_supported_for_channel_type") {
          return { success: false, error: "Private channels require a manual /invite @Sequ3nce in Slack" };
        }
        return { success: false, error: data.error };
      }
      return { success: true };
    } catch (error) {
      await ctx.scheduler.runAfter(0, internal.lib.sentry.captureFromIsolate, {
        message: error instanceof Error ? error.message : String(error),
        feature: "joinSlackChannel",
        integration: "slack",
        extra: { channelId: args.channelId },
      });
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Disconnect Slack integration
 */
export const disconnectSlack = mutation({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user.teamId, {
      slackAccessToken: undefined,
      slackChannelId: undefined,
      slackChannelName: undefined,
      slackTeamId: undefined,
      slackTeamName: undefined,
      slackConnectedAt: undefined,
      slackNotificationChannels: undefined,
    });

    return { success: true };
  },
});

/**
 * Get Slack connection status
 */
export const getSlackStatus = query({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (!user) {
      return null;
    }

    const team = await ctx.db.get(user.teamId);
    if (!team) {
      return null;
    }

    // Check for OAuth connection first
    if (team.slackAccessToken) {
      return {
        connected: true,
        method: "oauth" as const,
        channelName: team.slackChannelName,
        slackTeamName: team.slackTeamName,
        connectedAt: team.slackConnectedAt,
        notificationChannels: team.slackNotificationChannels,
      };
    }

    // Fall back to legacy webhook
    if (team.slackWebhookUrl) {
      return {
        connected: true,
        method: "webhook" as const,
        channelName: undefined,
        slackTeamName: undefined,
        connectedAt: undefined,
      };
    }

    return {
      connected: false,
      method: undefined,
      channelName: undefined,
      slackTeamName: undefined,
      connectedAt: undefined,
    };
  },
});

// ============================================
// SLACK NOTIFICATIONS
// ============================================

// Notification types
export type SlackNotificationType =
  | "reinforcement"
  | "call_started"
  | "call_going_long"
  | "call_completed";

/**
 * Check if a notification has already been sent for a call
 */
export const hasNotificationBeenSent = query({
  args: {
    callId: v.id("calls"),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("slackNotifications")
      .withIndex("by_call_and_type", (q) =>
        q.eq("callId", args.callId).eq("type", args.type)
      )
      .first();

    return !!existing;
  },
});

/**
 * Record that a notification was sent
 */
export const recordNotificationSent = internalMutation({
  args: {
    teamId: v.id("teams"),
    callId: v.optional(v.id("calls")),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("slackNotifications", {
      teamId: args.teamId,
      callId: args.callId,
      type: args.type,
      sentAt: Date.now(),
    });
  },
});

// Result type for Slack notification
type SlackNotificationResult =
  | { success: true }
  | { success: true; skipped: true; reason: string }
  | { success: false; error: string };

// Map notification type strings to slackNotificationChannels keys
type NotificationChannelKey = "reinforcement" | "callStarted" | "callGoingLong" | "callCompleted";

function getNotificationChannelKey(type: string): NotificationChannelKey | null {
  switch (type) {
    case "reinforcement":
      return "reinforcement";
    case "call_started":
      return "callStarted";
    case "call_going_long":
      return "callGoingLong";
    case "call_completed":
      return "callCompleted";
    default:
      return null;
  }
}

// Type for team with Slack configuration
interface TeamWithSlack {
  slackAccessToken?: string;
  slackChannelId?: string;
  slackWebhookUrl?: string;
  slackNotificationChannels?: {
    reinforcement?: { enabled: boolean; channelId?: string; channelName?: string };
    callStarted?: { enabled: boolean; channelId?: string; channelName?: string };
    callSummary?: { enabled: boolean; channelId?: string; channelName?: string };
    callGoingLong?: { enabled: boolean; channelId?: string; channelName?: string };
    callCompleted?: { enabled: boolean; channelId?: string; channelName?: string };
  };
}

/**
 * Send a Slack notification using OAuth token or fallback to webhook
 * Now supports per-notification channel configuration
 */
export const sendSlackNotification = internalAction({
  args: {
    teamId: v.id("teams"),
    callId: v.optional(v.id("calls")),
    type: v.string(), // SlackNotificationType
    blocks: v.array(v.any()), // Slack Block Kit blocks
    text: v.string(), // Fallback text
  },
  handler: async (ctx, args): Promise<SlackNotificationResult> => {
    try {
      // Get the team
      const team = await ctx.runQuery(api.teams.getTeamById, {
        teamId: args.teamId,
      }) as TeamWithSlack | null;

      if (!team) {
        console.error("[Slack] Team not found:", args.teamId);
        return { success: false, error: "Team not found" };
      }

      // Try OAuth token first
      if (team.slackAccessToken) {
        // Determine which channel to use based on notification type
        let channelId: string | undefined;

        // Check per-notification channel configuration
        const channelKey = getNotificationChannelKey(args.type);
        if (channelKey && team.slackNotificationChannels) {
          const channelConfig = team.slackNotificationChannels[channelKey];

          if (channelConfig) {
            // Notification type has been configured
            if (!channelConfig.enabled) {
              // Explicitly disabled
              console.log(`[Slack] Notification type ${args.type} is disabled for team`);
              return { success: true, skipped: true, reason: "Notification type disabled" };
            }
            if (channelConfig.channelId) {
              channelId = channelConfig.channelId;
            }
          }
        }

        // Fall back to legacy single channel if per-notification not configured
        if (!channelId) {
          channelId = team.slackChannelId;
        }

        // If still no channel, we can't send
        if (!channelId) {
          console.log(`[Slack] No channel configured for notification type ${args.type}`);
          return { success: true, skipped: true, reason: "No channel configured" };
        }

        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${team.slackAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: channelId,
            blocks: args.blocks,
            text: args.text,
          }),
        });

        const data = await response.json();

        if (!data.ok) {
          console.error("[Slack] API error:", data.error);
          return { success: false, error: data.error };
        }

        // Record the notification
        if (args.callId) {
          await ctx.runMutation(internal.slack.recordNotificationSent, {
            teamId: args.teamId,
            callId: args.callId,
            type: args.type,
          });
        }

        return { success: true };
      }

      // Fall back to webhook (legacy)
      if (team.slackWebhookUrl) {
        const response = await fetch(team.slackWebhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ blocks: args.blocks, text: args.text }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[Slack] Webhook error:", errorText);
          return { success: false, error: `Webhook failed: ${response.status}` };
        }

        // Record the notification
        if (args.callId) {
          await ctx.runMutation(internal.slack.recordNotificationSent, {
            teamId: args.teamId,
            callId: args.callId,
            type: args.type,
          });
        }

        return { success: true };
      }

      // No Slack configured
      return { success: true, skipped: true, reason: "No Slack configured" };
    } catch (error) {
      console.error("[Slack] Error sending notification:", error);
      await ctx.scheduler.runAfter(0, internal.lib.sentry.captureFromIsolate, {
        message: error instanceof Error ? error.message : String(error),
        feature: "sendSlackNotification",
        integration: "slack",
        extra: { teamId: args.teamId, callId: args.callId, type: args.type },
      });
      return { success: false, error: String(error) };
    }
  },
});

// ============================================
// MESSAGE FORMATTERS
// ============================================

/**
 * Build Slack blocks for reinforcement request
 */
export function buildReinforcementBlocks(
  closerName: string,
  message?: string,
  createdAt?: number
) {
  const timestamp = createdAt ? Math.floor(createdAt / 1000) : Math.floor(Date.now() / 1000);

  return {
    blocks: [
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
          text: `*${closerName}* needs help on a call!${message ? `\n\n> ${message}` : ""}`,
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
            text: `Requested at <!date^${timestamp}^{time}|${new Date(timestamp * 1000).toLocaleTimeString()}>`,
          },
        ],
      },
    ],
    text: `🚨 ${closerName} needs help on a call!${message ? ` "${message}"` : ""}`,
  };
}

/**
 * Build Slack blocks for call started notification
 */
export function buildCallStartedBlocks(
  closerName: string,
  prospectName?: string,
  callId?: string
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const dashboardUrl = callId
    ? `https://sequ3nce.ai/dashboard/calls/${callId}`
    : "https://sequ3nce.ai/dashboard";

  return {
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "📞 Call Started",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Closer:*\n${closerName}`,
          },
          {
            type: "mrkdwn",
            text: `*Prospect:*\n${prospectName || "Unknown"}`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Started at <!date^${timestamp}^{time}|${new Date().toLocaleTimeString()}>`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Listen Live",
              emoji: true,
            },
            url: dashboardUrl,
            action_id: "listen_live",
          },
        ],
      },
    ],
    text: `📞 ${closerName} is now on a call with ${prospectName || "a prospect"}`,
  };
}

/**
 * Build Slack blocks for call going long notification
 */
export function buildCallGoingLongBlocks(
  closerName: string,
  prospectName: string | undefined,
  durationMinutes: number,
  estimatedMinutes?: number, // How much longer they estimate needing
  nextCallTime?: string, // Formatted time string like "3:00 PM"
  nextCallProspect?: string
) {
  // Format estimated time nicely
  const estimateText = estimatedMinutes
    ? estimatedMinutes >= 60
      ? `~${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60 > 0 ? `${estimatedMinutes % 60}m` : ""}`
      : `~${estimatedMinutes} more minutes`
    : null;

  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "⏰ Call Running Long",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: estimateText
          ? `*${closerName}* needs ${estimateText}`
          : `*${closerName}*'s call is running over`,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Prospect:*\n${prospectName || "Unknown"}`,
        },
        {
          type: "mrkdwn",
          text: `*Current Duration:*\n${durationMinutes >= 60 ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m` : `${durationMinutes}m`}`,
        },
      ],
    },
  ];

  // Add next call info if available
  if (nextCallTime) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Next scheduled call:* ${nextCallTime}${nextCallProspect ? ` with ${nextCallProspect}` : ""}`,
      },
    });
  }

  blocks.push(
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "May need coverage for next appointment.",
        },
      ],
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
    }
  );

  return {
    blocks,
    text: `⏰ ${closerName}'s call is running long (${durationMinutes}min)${nextCallTime ? `. Next call at ${nextCallTime}` : ""}`,
  };
}

/**
 * Build Slack blocks for call completed notification (post-call summary)
 */
export function buildCallCompletedBlocks(
  closerName: string,
  prospectName: string | undefined,
  outcome: string | undefined,
  durationMinutes: number,
  summary: string,
  cashCollected?: number,
  contractValue?: number,
  callId?: string,
  /**
   * Call out a missing post-call form. Off unless the team asked for it.
   *
   * Only meaningful because the notification waits five minutes before
   * sending — long enough that "no form" means the closer moved on, not that
   * they hadn't got to it yet. At the old ninety seconds this would have
   * fired on nearly every call and meant nothing.
   */
  flagMissingForm?: boolean
) {
  // Emoji based on outcome (⏳ = pending, closer hasn't submitted questionnaire yet)
  const outcomeEmoji = outcome === "closed" ? "🎉" : outcome === "follow_up" ? "📅" :
                        outcome ? "❌" : "⏳";
  const outcomeText = outcome === "closed" ? "Closed" :
                      outcome === "follow_up" ? "Follow-up" :
                      outcome === "lost" ? "Not Closed" :
                      outcome === "no_show" ? "No Show" :
                      outcome ? outcome : "Pending";

  const dashboardUrl = callId
    ? `https://sequ3nce.ai/dashboard/calls/${callId}`
    : "https://sequ3nce.ai/dashboard";

  // Format duration nicely
  const durationText =
    durationMinutes >= 60
      ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
      : `${durationMinutes}m`;

  // Slack has no red text, so the red circle is doing that job. First line of
  // the message, above everything, because a manager scrolling a busy channel
  // decides whether to stop on the first line.
  const missingForm = flagMissingForm === true && !outcome;

  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${outcomeEmoji} Call Completed - ${outcomeText}`,
        emoji: true,
      },
    },
    ...(missingForm
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🔴 *POST-CALL FORM NOT COMPLETED* — no outcome, cash or contract value recorded for this call.`,
            },
          },
        ]
      : []),
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Closer:*\n${closerName}`,
        },
        {
          type: "mrkdwn",
          text: `*Prospect:*\n${prospectName || "Unknown"}`,
        },
        {
          type: "mrkdwn",
          text: `*Duration:*\n${durationText}`,
        },
      ],
    },
  ];

  // Add deal values for closed deals
  if (outcome === "closed" && (cashCollected || contractValue)) {
    const dealFields: any[] = [];
    if (cashCollected) {
      dealFields.push({
        type: "mrkdwn",
        text: `*💰 Cash Collected:*\n$${cashCollected.toLocaleString()}`,
      });
    }
    if (contractValue) {
      dealFields.push({
        type: "mrkdwn",
        text: `*📄 Contract Value:*\n$${contractValue.toLocaleString()}`,
      });
    }
    if (dealFields.length > 0) {
      blocks.push({
        type: "section",
        fields: dealFields,
      });
    }
  }

  // Add summary section
  blocks.push(
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*📝 Summary:*\n${summary}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Call Details",
            emoji: true,
          },
          url: dashboardUrl,
          action_id: "view_call",
        },
      ],
    }
  );

  return {
    blocks,
    text: `${outcomeEmoji} Call completed - ${outcomeText}: ${closerName} with ${prospectName || "prospect"} (${durationText})`,
  };
}

/**
 * Test Slack OAuth connection by sending a test message
 * Finds any available channel to send the test to
 */
export const testSlackConnection = action({
  args: {
    clerkId: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const user = await ctx.runQuery(api.teams.getMyUser, { clerkId: args.clerkId }) as { teamId: string } | null;
    if (!user) {
      return { success: false, error: "User not found" };
    }

    const team = await ctx.runQuery(api.teams.getTeamById, { teamId: user.teamId as any }) as TeamWithSlack | null;
    if (!team) {
      return { success: false, error: "Team not found" };
    }

    if (!team.slackAccessToken) {
      return { success: false, error: "Slack not connected" };
    }

    // Find a channel to send the test message to
    // Priority: configured notification channels > legacy slackChannelId > fetch first available
    let testChannelId: string | undefined;

    // Check per-notification channels first
    if (team.slackNotificationChannels) {
      const channels = team.slackNotificationChannels;
      testChannelId = channels.reinforcement?.channelId ||
                      channels.callStarted?.channelId ||
                      channels.callSummary?.channelId ||
                      channels.callGoingLong?.channelId;
    }

    // Fall back to legacy channel
    if (!testChannelId && team.slackChannelId) {
      testChannelId = team.slackChannelId;
    }

    // If still no channel, fetch available channels and use the first one
    if (!testChannelId) {
      try {
        const channelsResponse = await fetch("https://slack.com/api/conversations.list", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${team.slackAccessToken}`,
          },
        });
        const channelsData = await channelsResponse.json();
        if (channelsData.ok && channelsData.channels) {
          const memberChannel = channelsData.channels.find((ch: any) => ch.is_member);
          if (memberChannel) {
            testChannelId = memberChannel.id;
          }
        }
      } catch (e) {
        console.error("[Slack] Error fetching channels for test:", e);
      }
    }

    if (!testChannelId) {
      return { success: false, error: "No channel available. Invite the bot to a channel first." };
    }

    // Send test message
    const response: Response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${team.slackAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: testChannelId,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "✅ *Sequ3nce Slack Integration Test*\n\nYour Slack connection is working correctly! You'll receive notifications in configured channels.",
            },
          },
        ],
        text: "✅ Sequ3nce Slack Integration Test - Your connection is working!",
      }),
    });

    const data: { ok: boolean; error?: string } = await response.json();

    if (!data.ok) {
      return { success: false, error: data.error };
    }

    return { success: true };
  },
});

// ============================================
// NOTIFICATION TRIGGERS
// ============================================

/**
 * Send call started notification
 * Called when a call transitions to "on_call" status
 */
export const sendCallStartedNotification = internalAction({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args): Promise<SlackNotificationResult> => {
    try {
      // Check if already sent
      const alreadySent = await ctx.runQuery(api.slack.hasNotificationBeenSent, {
        callId: args.callId,
        type: "call_started",
      });

      if (alreadySent) {
        console.log("[Slack] Call started notification already sent for:", args.callId);
        return { success: true, skipped: true, reason: "Already sent" };
      }

      // Get call details
      const call = await ctx.runQuery(api.calls.getCallById, { callId: args.callId as string }) as { closerId: string; teamId: any; prospectName?: string } | null;
      if (!call) {
        console.error("[Slack] Call not found:", args.callId);
        return { success: false, error: "Call not found" };
      }

      // Record dedup BEFORE sending to prevent duplicates (especially for Discord-only teams)
      await ctx.runMutation(internal.slack.recordNotificationSent, {
        teamId: call.teamId,
        callId: args.callId,
        type: "call_started",
      });

      // Get closer details
      const closer = await ctx.runQuery(api.closers.getCloserById, { closerId: call.closerId }) as { name: string } | null;
      if (!closer) {
        console.error("[Slack] Closer not found:", call.closerId);
        return { success: false, error: "Closer not found" };
      }

      // Build the message
      const { blocks, text } = buildCallStartedBlocks(
        closer.name,
        call.prospectName,
        args.callId
      );

      // Send via unified notification system
      const result: SlackNotificationResult = await ctx.runAction(internal.slack.sendSlackNotification, {
        teamId: call.teamId,
        callId: args.callId,
        type: "call_started",
        blocks,
        text,
      });

      // Also send to Discord (if configured)
      try {
        const { content, embeds } = buildCallStartedEmbed(
          closer.name,
          call.prospectName,
          args.callId
        );

        await ctx.runAction(internal.discord.sendDiscordNotification, {
          teamId: call.teamId,
          callId: args.callId,
          type: "call_started",
          content,
          embeds,
        });
        console.log("[Discord] Call started notification sent for call:", args.callId);
      } catch (discordError) {
        // Log but don't fail the overall notification if Discord fails
        console.error("[Discord] Call started notification failed:", discordError);
      }

      return result;
    } catch (error) {
      console.error("[Slack] Error sending call started notification:", error);
      await ctx.scheduler.runAfter(0, internal.lib.sentry.captureFromIsolate, {
        message: error instanceof Error ? error.message : String(error),
        feature: "sendCallStartedNotification",
        integration: "slack",
        extra: { callId: args.callId },
      });
      return { success: false, error: String(error) };
    }
  },
});

// Type for active calls from getLiveCallsForSlack
/**
 * Send call going long notification
 * Called when closer clicks "Call Going Long" button in desktop app
 */
export const sendCallGoingLongNotification = internalAction({
  args: {
    closerId: v.id("closers"),
    callId: v.optional(v.id("calls")),
    teamId: v.id("teams"),
    estimatedMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<SlackNotificationResult> => {
    try {
      // Get closer details
      const closer = await ctx.runQuery(api.closers.getCloserById, { closerId: args.closerId as string }) as { name: string } | null;
      if (!closer) {
        return { success: false, error: "Closer not found" };
      }

      // Get call details if provided
      let prospectName: string | undefined;
      let durationMinutes = 0;
      let callId = args.callId;

      if (args.callId) {
        const call = await ctx.runQuery(api.calls.getCallById, { callId: args.callId as string }) as { prospectName?: string; startedAt?: number } | null;
        if (call) {
          prospectName = call.prospectName;
          if (call.startedAt) {
            durationMinutes = Math.floor((Date.now() - call.startedAt) / 60000);
          }
        }
      } else {
        // Try to find active call for this closer
        const activeCall = await ctx.runQuery(api.calls.getActiveCallForCloser, {
          closerId: args.closerId,
        }) as { _id: Id<"calls">; prospectName?: string; startedAt?: number } | null;
        if (activeCall) {
          prospectName = activeCall.prospectName;
          callId = activeCall._id;
          if (activeCall.startedAt) {
            durationMinutes = Math.floor((Date.now() - activeCall.startedAt) / 60000);
          }
        }
      }

      // Check if already sent for this call
      if (callId) {
        const alreadySent = await ctx.runQuery(api.slack.hasNotificationBeenSent, {
          callId: callId,
          type: "call_going_long",
        });

        if (alreadySent) {
          console.log("[Slack] Call going long notification already sent for:", callId);
          return { success: true, skipped: true, reason: "Already sent" };
        }

        // Record dedup BEFORE sending to prevent duplicates (especially for Discord-only teams)
        await ctx.runMutation(internal.slack.recordNotificationSent, {
          teamId: args.teamId,
          callId: callId,
          type: "call_going_long",
        });
      }

      // Look up next calendar event for context
      let nextCallTime: string | undefined;
      let nextCallProspect: string | undefined;

      try {
        const nextEvent = await ctx.runQuery(api.calendar.getNextEventForCloser, {
          closerId: args.closerId,
        }) as { startTime: number; title: string } | null;
        if (nextEvent) {
          nextCallTime = new Date(nextEvent.startTime).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          });
          nextCallProspect = nextEvent.title;
        }
      } catch (error) {
        // Calendar lookup is optional
        console.log("[Slack] Could not get next event:", error);
      }

      // Build the message
      const { blocks, text } = buildCallGoingLongBlocks(
        closer.name,
        prospectName,
        durationMinutes,
        args.estimatedMinutes,
        nextCallTime,
        nextCallProspect
      );

      // Send via unified notification system
      const result: SlackNotificationResult = await ctx.runAction(internal.slack.sendSlackNotification, {
        teamId: args.teamId,
        callId: callId,
        type: "call_going_long",
        blocks,
        text,
      });

      // Also send to Discord (if configured)
      try {
        const { content, embeds } = buildCallGoingLongEmbed(
          closer.name,
          prospectName,
          durationMinutes,
          args.estimatedMinutes,
          nextCallTime,
          nextCallProspect
        );

        await ctx.runAction(internal.discord.sendDiscordNotification, {
          teamId: args.teamId,
          callId: callId,
          type: "call_going_long",
          content,
          embeds,
        });
        console.log("[Discord] Call going long notification sent");
      } catch (discordError) {
        // Log but don't fail the overall notification if Discord fails
        console.error("[Discord] Call going long notification failed:", discordError);
      }

      return result;
    } catch (error) {
      console.error("[Slack] Error sending call going long notification:", error);
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Send call completed notification
 * Called after generateCallSummary completes (when closer submits post-call questionnaire)
 */
export const sendCallCompletedNotification = internalAction({
  args: {
    callId: v.id("calls"),
    /**
     * Re-send a call that has already been notified.
     *
     * For showing a customer what a notification looks like on one of their
     * own real calls. Every call worth demonstrating with has, by definition,
     * already been notified once, so without this the only way to see the
     * message is to wait for the next call and hope it has the right shape.
     *
     * Internal action, so this isn't reachable from any client.
     */
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<SlackNotificationResult> => {
    try {
      // Check if already sent
      const alreadySent = args.force
        ? false
        : await ctx.runQuery(api.slack.hasNotificationBeenSent, {
            callId: args.callId,
            type: "call_completed",
          });

      if (alreadySent) {
        console.log("[Slack] Call completed notification already sent for:", args.callId);
        return { success: true, skipped: true, reason: "Already sent" };
      }

      // Get call details merged with callContent (summary lives on the
      // sibling table post-migration — see calls.ts:getCallWithContent
      // for why this matters).
      const call = await ctx.runQuery(internal.calls.getCallWithContent, {
        callId: args.callId,
      }) as {
        closerId: string;
        teamId: any;
        prospectName?: string;
        outcome?: string;
        summary?: string;
        startedAt?: number;
        endedAt?: number;
        duration?: number;
        cashCollected?: number;
        contractValue?: number;
      } | null;

      if (!call) {
        console.error("[Slack] Call not found for completed notification:", args.callId);
        return { success: false, error: "Call not found" };
      }

      // Skip if no summary (AI hasn't generated it yet)
      if (!call.summary) {
        console.log("[Slack] Call missing summary, skipping notification:", args.callId);
        return { success: true, skipped: true, reason: "Call not fully completed" };
      }

      // Record dedup BEFORE sending to prevent duplicates (especially for Discord-only teams)
      await ctx.runMutation(internal.slack.recordNotificationSent, {
        teamId: call.teamId,
        callId: args.callId,
        type: "call_completed",
      });

      // Get closer details
      const closer = await ctx.runQuery(api.closers.getCloserById, { closerId: call.closerId }) as { name: string } | null;
      if (!closer) {
        console.error("[Slack] Closer not found:", call.closerId);
        return { success: false, error: "Closer not found" };
      }

      // Calculate duration in minutes
      let durationMinutes = 0;
      if (call.duration) {
        durationMinutes = Math.floor(call.duration / 60);
      } else if (call.startedAt && call.endedAt) {
        durationMinutes = Math.floor((call.endedAt - call.startedAt) / 60000);
      }

      // Build the Slack message
      // Read on the way out rather than captured when the job was scheduled —
      // a team that turns this on mid-flight should see it on the next call,
      // not the one after.
      const notifyTeam = await ctx.runQuery(api.teams.getTeamById, {
        teamId: call.teamId,
      });
      const flagMissingForm =
        (notifyTeam as { flagMissingPostCallForm?: boolean } | null)
          ?.flagMissingPostCallForm === true;

      const { blocks, text } = buildCallCompletedBlocks(
        closer.name,
        call.prospectName,
        call.outcome,
        durationMinutes,
        call.summary,
        call.cashCollected,
        call.contractValue,
        args.callId,
        flagMissingForm
      );

      // Send via unified notification system
      const result: SlackNotificationResult = await ctx.runAction(internal.slack.sendSlackNotification, {
        teamId: call.teamId,
        callId: args.callId,
        type: "call_completed",
        blocks,
        text,
      });

      // Also send to Discord (if configured)
      try {
        const { content, embeds } = buildCallCompletedEmbed(
          closer.name,
          call.prospectName,
          call.outcome,
          durationMinutes,
          call.summary,
          call.cashCollected,
          call.contractValue,
          args.callId,
          flagMissingForm
        );

        await ctx.runAction(internal.discord.sendDiscordNotification, {
          teamId: call.teamId,
          callId: args.callId,
          type: "call_completed",
          content,
          embeds,
        });
        console.log("[Discord] Call completed notification sent for call:", args.callId);
      } catch (discordError) {
        // Log but don't fail the overall notification if Discord fails
        console.error("[Discord] Call completed notification failed:", discordError);
      }

      // Also sync to GHL (if configured) — auto-sync, no manual review needed
      try {
        await ctx.runAction(internal.ghlActions.syncCallToGhl, {
          callId: args.callId,
        });
      } catch (ghlError) {
        console.error("[GHL] Auto-sync failed:", ghlError);
      }

      console.log("[Slack] Call completed notification sent for call:", args.callId);
      return result;
    } catch (error) {
      console.error("[Slack] Error sending call completed notification:", error);
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Schedule a delayed call_completed notification.
 * Called from generateCallSummary (action) via ctx.runMutation when the closer
 * hasn't submitted the post-call questionnaire yet.
 * If the closer submits within the delay window, calls.ts cancels this
 * scheduled job and fires the notification immediately with full data.
 */
export const scheduleCallCompletedNotification = internalMutation({
  args: {
    callId: v.id("calls"),
    delayMs: v.number(),
  },
  handler: async (ctx, args) => {
    const scheduledId = await ctx.scheduler.runAfter(
      args.delayMs,
      internal.slack.sendCallCompletedNotification,
      { callId: args.callId }
    );

    // Store the scheduledId on the call so it can be cancelled if closer submits early
    await ctx.db.patch(args.callId, {
      pendingNotificationJobId: String(scheduledId),
    });

    console.log(
      `[Slack] Scheduled call_completed notification for ${args.callId} in ${args.delayMs}ms (job: ${scheduledId})`
    );
  },
});
