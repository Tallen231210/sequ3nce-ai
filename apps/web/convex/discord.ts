import { v } from "convex/values";
import { query, action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================
// DISCORD EMBED COLORS
// ============================================

// Discord colors are decimal representations of hex colors
const DISCORD_COLORS = {
  reinforcement: 15158332, // Red #E74C3C
  callStarted: 3447003, // Blue #3498DB
  callSummary: 10181046, // Purple #9B59B6
  callGoingLong: 15105570, // Orange #E67E22
  success: 3066993, // Green #2ECC71
};

// ============================================
// TYPES
// ============================================

type DiscordNotificationResult =
  | { success: true }
  | { success: true; skipped: true; reason: string }
  | { success: false; error: string };

type NotificationChannelKey = "reinforcement" | "callStarted" | "callSummary" | "callGoingLong" | "callCompleted";

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  timestamp?: string;
  footer?: { text: string };
  url?: string;
}

interface TeamWithDiscord {
  discordNotificationChannels?: {
    reinforcement?: { enabled: boolean; webhookUrl?: string; channelName?: string };
    callStarted?: { enabled: boolean; webhookUrl?: string; channelName?: string };
    callSummary?: { enabled: boolean; webhookUrl?: string; channelName?: string };
    callGoingLong?: { enabled: boolean; webhookUrl?: string; channelName?: string };
    callCompleted?: { enabled: boolean; webhookUrl?: string; channelName?: string };
  };
  discordConnectedAt?: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

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

// ============================================
// EMBED BUILDERS
// ============================================

/**
 * Build Discord embed for reinforcement request
 */
export function buildReinforcementEmbed(
  closerName: string,
  message?: string,
  createdAt?: number
): { content: string; embeds: DiscordEmbed[] } {
  const embed: DiscordEmbed = {
    title: "Reinforcement Requested",
    description: `**${closerName}** needs help on a call!${message ? `\n\n> ${message}` : ""}`,
    color: DISCORD_COLORS.reinforcement,
    timestamp: new Date(createdAt || Date.now()).toISOString(),
    footer: { text: "Sequ3nce.ai" },
    url: "https://sequ3nce.ai/dashboard",
  };

  return {
    content: `${closerName} needs help on a call!`,
    embeds: [embed],
  };
}

/**
 * Build Discord embed for call started notification
 */
export function buildCallStartedEmbed(
  closerName: string,
  prospectName?: string,
  callId?: string
): { content: string; embeds: DiscordEmbed[] } {
  const dashboardUrl = callId
    ? `https://sequ3nce.ai/dashboard/calls/${callId}`
    : "https://sequ3nce.ai/dashboard";

  const embed: DiscordEmbed = {
    title: "Call Started",
    color: DISCORD_COLORS.callStarted,
    fields: [
      { name: "Closer", value: closerName, inline: true },
      { name: "Prospect", value: prospectName || "Unknown", inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "Sequ3nce.ai" },
    url: dashboardUrl,
  };

  return {
    content: `${closerName} is now on a call with ${prospectName || "a prospect"}`,
    embeds: [embed],
  };
}

/**
 * Build Discord embed for call going long notification
 */
export function buildCallGoingLongEmbed(
  closerName: string,
  prospectName: string | undefined,
  durationMinutes: number,
  estimatedMinutes?: number,
  nextCallTime?: string,
  nextCallProspect?: string
): { content: string; embeds: DiscordEmbed[] } {
  // Format estimated time nicely
  const estimateText = estimatedMinutes
    ? estimatedMinutes >= 60
      ? `~${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60 > 0 ? `${estimatedMinutes % 60}m` : ""}`
      : `~${estimatedMinutes} more minutes`
    : null;

  // Format duration nicely
  const durationText =
    durationMinutes >= 60
      ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
      : `${durationMinutes}m`;

  const description = estimateText
    ? `**${closerName}** needs ${estimateText}`
    : `**${closerName}**'s call is running over`;

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Prospect", value: prospectName || "Unknown", inline: true },
    { name: "Current Duration", value: durationText, inline: true },
  ];

  if (nextCallTime) {
    fields.push({
      name: "Next Scheduled Call",
      value: `${nextCallTime}${nextCallProspect ? ` with ${nextCallProspect}` : ""}`,
      inline: false,
    });
  }

  const embed: DiscordEmbed = {
    title: "Call Running Long",
    description: description + "\n\n*May need coverage for next appointment.*",
    color: DISCORD_COLORS.callGoingLong,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: "Sequ3nce.ai" },
    url: "https://sequ3nce.ai/dashboard",
  };

  return {
    content: `${closerName}'s call is running long (${durationText})${nextCallTime ? `. Next call at ${nextCallTime}` : ""}`,
    embeds: [embed],
  };
}

/**
 * Build Discord embed for call completed notification (post-call summary)
 */
export function buildCallCompletedEmbed(
  closerName: string,
  prospectName: string | undefined,
  outcome: string | undefined,
  durationMinutes: number,
  summary: string,
  cashCollected?: number,
  contractValue?: number,
  callId?: string
): { content: string; embeds: DiscordEmbed[] } {
  const dashboardUrl = callId
    ? `https://sequ3nce.ai/dashboard/calls/${callId}`
    : "https://sequ3nce.ai/dashboard";

  // Color based on outcome: Green=closed, Yellow=follow-up, Red=lost, Grey=pending
  const color = outcome === "closed" ? 3066993 :
                outcome === "follow_up" ? 15844367 :
                outcome ? 15158332 : 9807270;

  // Format outcome text
  const outcomeText = outcome === "closed" ? "Closed" :
                      outcome === "follow_up" ? "Follow-up" :
                      outcome === "lost" ? "Not Closed" :
                      outcome === "no_show" ? "No Show" :
                      outcome ? outcome : "Pending";

  // Emoji based on outcome (⏳ = pending, closer hasn't submitted questionnaire yet)
  const outcomeEmoji = outcome === "closed" ? "🎉" : outcome === "follow_up" ? "📅" :
                        outcome ? "❌" : "⏳";

  // Format duration nicely
  const durationText =
    durationMinutes >= 60
      ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
      : `${durationMinutes}m`;

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Closer", value: closerName, inline: true },
    { name: "Prospect", value: prospectName || "Unknown", inline: true },
    { name: "Duration", value: durationText, inline: true },
    { name: "Outcome", value: `${outcomeEmoji} ${outcomeText}`, inline: true },
  ];

  // Add deal values for closed deals
  if (outcome === "closed") {
    if (cashCollected) {
      fields.push({ name: "💰 Cash Collected", value: `$${cashCollected.toLocaleString()}`, inline: true });
    }
    if (contractValue) {
      fields.push({ name: "📄 Contract Value", value: `$${contractValue.toLocaleString()}`, inline: true });
    }
  }

  const embed: DiscordEmbed = {
    title: `${outcomeEmoji} Call Completed - ${outcomeText}`,
    description: `**Summary:**\n${summary}`,
    color,
    fields,
    timestamp: new Date().toISOString(),
    footer: { text: "Sequ3nce.ai" },
    url: dashboardUrl,
  };

  return {
    content: `${outcomeEmoji} Call completed - ${outcomeText}: ${closerName} with ${prospectName || "prospect"} (${durationText})`,
    embeds: [embed],
  };
}

// ============================================
// QUERIES
// ============================================

/**
 * Get Discord connection status for a team
 */
export const getDiscordStatus = query({
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

    // Check if any Discord notification channel is configured
    const channels = team.discordNotificationChannels;
    const hasAnyWebhook =
      channels?.reinforcement?.webhookUrl ||
      channels?.callStarted?.webhookUrl ||
      channels?.callSummary?.webhookUrl ||
      channels?.callGoingLong?.webhookUrl;

    return {
      connected: !!hasAnyWebhook,
      connectedAt: team.discordConnectedAt,
      notificationChannels: team.discordNotificationChannels,
    };
  },
});

// ============================================
// ACTIONS
// ============================================

/**
 * Test a Discord webhook by sending a test message
 */
export const testDiscordWebhook = action({
  args: {
    webhookUrl: v.string(),
    channelName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    try {
      const embed: DiscordEmbed = {
        title: "Sequ3nce Discord Integration Test",
        description:
          "Your Discord webhook is working correctly! You'll receive notifications in this channel.",
        color: DISCORD_COLORS.success,
        timestamp: new Date().toISOString(),
        footer: { text: "Sequ3nce.ai" },
      };

      const response = await fetch(args.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Sequ3nce Discord Integration Test - Your connection is working!",
          embeds: [embed],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Discord] Webhook test failed:", response.status, errorText);
        return {
          success: false,
          error: `Webhook failed: ${response.status}${errorText ? ` - ${errorText}` : ""}`,
        };
      }

      return { success: true };
    } catch (error) {
      console.error("[Discord] Error testing webhook:", error);
      return { success: false, error: String(error) };
    }
  },
});

/**
 * Send a Discord notification
 * This is the unified sender for all notification types
 */
export const sendDiscordNotification = internalAction({
  args: {
    teamId: v.id("teams"),
    callId: v.optional(v.id("calls")),
    type: v.string(), // "reinforcement" | "call_started" | "summary_30" | "summary_60" | "call_going_long"
    content: v.string(), // Fallback text
    embeds: v.array(v.any()), // Discord embeds
  },
  handler: async (ctx, args): Promise<DiscordNotificationResult> => {
    try {
      // Get the team
      const team = (await ctx.runQuery(api.teams.getTeamById, {
        teamId: args.teamId,
      })) as TeamWithDiscord | null;

      if (!team) {
        console.error("[Discord] Team not found:", args.teamId);
        return { success: false, error: "Team not found" };
      }

      // Check if Discord is configured
      if (!team.discordNotificationChannels) {
        console.log("[Discord] No Discord channels configured for team");
        return { success: true, skipped: true, reason: "No Discord configured" };
      }

      // Get the appropriate channel config for this notification type
      const channelKey = getNotificationChannelKey(args.type);
      if (!channelKey) {
        console.error("[Discord] Unknown notification type:", args.type);
        return { success: false, error: `Unknown notification type: ${args.type}` };
      }

      const channelConfig = team.discordNotificationChannels[channelKey];

      // Check if this notification type is configured and enabled
      if (!channelConfig) {
        console.log(`[Discord] Notification type ${args.type} not configured`);
        return { success: true, skipped: true, reason: "Notification type not configured" };
      }

      if (!channelConfig.enabled) {
        console.log(`[Discord] Notification type ${args.type} is disabled`);
        return { success: true, skipped: true, reason: "Notification type disabled" };
      }

      if (!channelConfig.webhookUrl) {
        console.log(`[Discord] No webhook URL for notification type ${args.type}`);
        return { success: true, skipped: true, reason: "No webhook URL configured" };
      }

      // Send the notification
      const response = await fetch(channelConfig.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: args.content,
          embeds: args.embeds,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Discord] API error:", response.status, errorText);
        return {
          success: false,
          error: `Discord API error: ${response.status}${errorText ? ` - ${errorText}` : ""}`,
        };
      }

      console.log(`[Discord] Successfully sent ${args.type} notification`);
      return { success: true };
    } catch (error) {
      console.error("[Discord] Error sending notification:", error);
      return { success: false, error: String(error) };
    }
  },
});
