import { v, ConvexError } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import Anthropic from "@anthropic-ai/sdk";
import {
  postSlackMessage,
  postDiscordWebhook,
  formatInTimeZone,
} from "./setterDataNotifications";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { resolveAuthUser } from "./setterGhlOauth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Manager EOD — the end-of-day report for managers and owners.
//
// Built entirely from recordings, on purpose: closers slack on their EOD
// forms and the money side of AI dispositions hasn't earned trust yet, so
// this report depends on neither. Call counts are mechanical (a recording
// either exists or it doesn't; a prospect either spoke or they didn't), the
// "why calls didn't close" section reads the transcripts through the proven
// objection classifier, and money is deliberately absent.
//
// The cash digest is this report's sibling, not its replacement — that one
// reads the Team Performance board for teams that track money by hand.
// ============================================================================

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const DEFAULT_HOUR = 19; // 7pm local — after the last calls, before dinner
const DASHBOARD_CALL_URL = "https://sequ3nce.ai/dashboard/calls";

const OBJECTION_LABELS: Record<string, string> = {
  spouse_partner: "Spouse / partner sign-off",
  price_money: "Price / money",
  timing: "Timing",
  need_to_think: "Need to think about it",
  not_qualified: "Not qualified",
  logistics: "Logistics",
  competitor: "Competitor",
  other: "Other objection",
};

interface EodCallRef {
  callId: string;
  label: string;
}

export interface ManagerEodData {
  dayKey: string;
  callsTaken: number;
  realConversations: number;
  botsNotAdmitted: number;
  closes: number;
  reasons: Array<{ key: string; label: string; count: number; calls: EodCallRef[] }>;
  reviewPick: {
    callId: string;
    label: string;
    durationMin: number;
    outcome: string | null;
    objectionCount: number;
  } | null;
  tomorrowBooked: number;
  unreadCalls: number;
}

/** A real conversation: the prospect actually spoke. Bot calls carry the
 *  Recall roster verdict; desktop/legacy calls fall back to the duration
 *  rule that predates presence tracking. */
function isRealConversation(c: Doc<"calls">): boolean {
  if ((c as any).prospectJoined === true) return true;
  if ((c as any).prospectJoined === false) return false;
  return (c.duration ?? 0) >= 120;
}

export const getManagerEodData = internalQuery({
  args: { teamId: v.id("teams"), nowMs: v.number() },
  handler: async (ctx, args): Promise<ManagerEodData> => {
    const team = await ctx.db.get(args.teamId);
    const tz = team?.timezone || DEFAULT_TIMEZONE;
    const todayKey = dayKeyInTz(args.nowMs, tz);
    const tomorrowKey = dayKeyInTz(args.nowMs + 24 * 3600_000, tz);

    // 36h window then exact local-day filter — cheap and DST-proof.
    const calls = (
      await ctx.db
        .query("calls")
        .withIndex("by_team_and_date", (q: any) =>
          q.eq("teamId", args.teamId).gte("createdAt", args.nowMs - 36 * 3600_000),
        )
        .take(500)
    ).filter(
      (c: any) =>
        dayKeyInTz(c.createdAt, tz) === todayKey &&
        c.status === "completed" &&
        c.countsTowardStats !== false &&
        c.classifiedAs !== "internal",
    );

    const convos = calls.filter(isRealConversation);
    const closes = convos.filter((c: any) => c.outcome === "closed").length;

    // Meetings the bot was booked for but never got into today — the honest
    // context line for "why is this number lower than my calendar".
    const bots = await ctx.db
      .query("meetingBots")
      .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(300);
    const botsNotAdmitted = bots.filter(
      (b: any) =>
        b.source === "calendar" &&
        !b.joinedAt &&
        b.status !== "cancelled" &&
        dayKeyInTz(b.scheduledAt ?? b.createdAt, tz) === todayKey &&
        (b.scheduledAt ?? b.createdAt) < args.nowMs,
    ).length;

    // Why calls didn't close: real conversations that ended anywhere but
    // "closed", grouped by the extraction's primary objection. No-shows and
    // reschedules aren't objection material and stay out.
    const notClosed = convos.filter(
      (c: any) =>
        c.outcome !== "closed" &&
        c.outcome !== "no_show" &&
        c.outcome !== "rescheduled",
    );
    const byReason = new Map<string, EodCallRef[]>();
    let unreadCalls = 0;
    for (const c of notClosed) {
      if (c.outcome == null && !(c as any).primaryObjection) {
        // Disposition hasn't landed yet — counted, never guessed.
        unreadCalls++;
        continue;
      }
      const key = (c as any).primaryObjection || "unclear";
      const list = byReason.get(key) ?? [];
      list.push({
        callId: String(c._id),
        label: c.prospectName || "Call",
      });
      byReason.set(key, list);
    }
    const reasons = [...byReason.entries()]
      .map(([key, refs]) => ({
        key,
        label:
          key === "unclear"
            ? "No clear objection stated"
            : OBJECTION_LABELS[key] ?? key,
        count: refs.length,
        calls: refs.slice(0, 3),
      }))
      .sort((a, b) => b.count - a.count);

    // One call worth reviewing: the non-closed conversation with the most
    // resistance, ties broken by length. Mechanical, so it's always real.
    let reviewPick: ManagerEodData["reviewPick"] = null;
    let bestScore = -1;
    for (const c of notClosed) {
      const objectionCount =
        ((c as any).objections?.length as number | undefined) ??
        ((c as any).primaryObjection ? 1 : 0);
      const score = objectionCount * 10 + Math.min((c.duration ?? 0) / 60, 90) / 10;
      if (score > bestScore) {
        bestScore = score;
        reviewPick = {
          callId: String(c._id),
          label: c.prospectName || "Call",
          durationMin: Math.round((c.duration ?? 0) / 60),
          outcome: c.outcome ?? null,
          objectionCount,
        };
      }
    }

    // Tomorrow's load: calendar meetings with video links, deduped by URL so
    // a meeting visible on three closers' shared calendars counts once.
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_team_and_time", (q: any) =>
        q
          .eq("teamId", args.teamId)
          .gte("startTime", args.nowMs)
          .lte("startTime", args.nowMs + 48 * 3600_000),
      )
      .take(500);
    const tomorrowUrls = new Set<string>();
    for (const e of events) {
      if (!e.meetingUrl) continue;
      if (dayKeyInTz(e.startTime, tz) !== tomorrowKey) continue;
      tomorrowUrls.add(e.meetingUrl);
    }

    return {
      dayKey: todayKey,
      callsTaken: calls.length,
      realConversations: convos.length,
      botsNotAdmitted,
      closes,
      reasons,
      reviewPick,
      tomorrowBooked: tomorrowUrls.size,
      unreadCalls,
    };
  },
});

/** The in-app version of the report, for Manager Mode's EOD tab. Mechanical
 *  parts only — the AI's read of the day arrives with the Slack post. */
export const getManagerEodReport = query({
  args: { clerkId: v.string(), dayOffset: v.optional(v.number()) },
  handler: async (ctx, args): Promise<ManagerEodData | null> => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    const offset = Math.max(-7, Math.min(0, args.dayOffset ?? 0));
    const nowMs = Date.now() + offset * 24 * 3600_000;
    return await ctx.runQuery(internal.managerEodDigest.getManagerEodData, {
      teamId: user.teamId as Id<"teams">,
      nowMs,
    });
  },
});

// ----------------------------------------------------------------------------
// The AI's read of the day — one Haiku call over the day's outcomes, never
// over money. "Generally correct" is the bar; the counts beside it are exact.
// ----------------------------------------------------------------------------

async function narrateDay(data: ManagerEodData): Promise<string | null> {
  if (data.reasons.length === 0) return null;
  try {
    const lines = data.reasons
      .map((r) => `${r.label}: ${r.count} call(s)`)
      .join("\n");
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:
        "You write two sentences for a sales manager's end-of-day report. " +
        "Given today's counts of why sales calls did not close, say what the " +
        "day's pattern was and what the manager should address tomorrow. " +
        "Direct and plain. No greetings, no bullet points, no numbers they " +
        "already have. Never mention money.",
      messages: [
        {
          role: "user",
          content: `Calls taken: ${data.callsTaken}. Real conversations: ${data.realConversations}. Closed: ${data.closes}.\nWhy the rest didn't close:\n${lines}`,
        },
      ],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : null;
    return text && text.length > 10 ? text : null;
  } catch (e) {
    // The report ships without the narrative rather than not shipping.
    console.warn("[managerEod] narrative failed", e);
    return null;
  }
}

// ----------------------------------------------------------------------------
// Formatting
// ----------------------------------------------------------------------------

/** Slack link labels can't carry the link syntax's own characters: a title
 *  like "Avenue and Gresham | AI Implementation" would end the label at its
 *  pipe. Strip the delimiters, escape the entities. */
function slackSafe(label: string): string {
  return label
    .replace(/&/g, "&amp;")
    .replace(/</g, "")
    .replace(/>/g, "")
    .replace(/\|/g, "-");
}

function callLink(ref: EodCallRef, shareUrls?: Record<string, string>): string {
  // Slack digests link the PUBLIC watch page when one exists — the channel
  // includes setters, who can't open the manager dashboard. Falls back to
  // the dashboard link for calls with nothing to watch.
  const url = shareUrls?.[String(ref.callId)] ?? `${DASHBOARD_CALL_URL}/${ref.callId}`;
  return `<${url}|${slackSafe(ref.label)}>`;
}

function outcomeWord(outcome: string | null): string {
  if (outcome === "follow_up") return "ended in a follow-up";
  if (outcome === "lost") return "was lost";
  if (outcome === "not_closed") return "didn't close";
  if (outcome == null) return "is still unread";
  return `ended ${outcome.replace(/_/g, " ")}`;
}

function buildSlackBlocks(
  data: ManagerEodData,
  narrative: string | null,
  local: { weekday: string; month: number; day: number },
  shareUrls?: Record<string, string>,
): any[] {
  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Manager EOD — ${local.weekday} ${local.month}/${local.day}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${data.callsTaken}* live call${data.callsTaken === 1 ? "" : "s"} taken · ` +
          `*${data.realConversations}* real conversation${data.realConversations === 1 ? "" : "s"} · ` +
          `*${data.closes}* closed` +
          (data.botsNotAdmitted > 0
            ? `\n_${data.botsNotAdmitted} meeting${data.botsNotAdmitted === 1 ? "" : "s"} the bot couldn't see (not admitted)_`
            : ""),
      },
    },
  ];

  if (data.reasons.length > 0) {
    const lines = data.reasons
      .map(
        (r) =>
          `• *${r.label}* — ${r.count} call${r.count === 1 ? "" : "s"}` +
          (r.calls.length ? `  (${r.calls.map((c) => callLink(c, shareUrls)).join(", ")})` : ""),
      )
      .join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Why calls didn't close*\n${lines}` },
    });
  } else if (data.realConversations > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          data.closes === data.realConversations
            ? "*Every real conversation today closed.*"
            : "*No objections read off today's calls yet.*",
      },
    });
  }

  if (data.unreadCalls > 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `${data.unreadCalls} call${data.unreadCalls === 1 ? "" : "s"} not yet read by the AI — counted above, never guessed at.`,
        },
      ],
    });
  }

  if (narrative) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `_${narrative}_` },
    });
  }

  if (data.reviewPick) {
    const p = data.reviewPick;
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `🔍 *One call worth reviewing:* ${callLink({ callId: p.callId, label: p.label }, shareUrls)} — ` +
          `${p.objectionCount} objection${p.objectionCount === 1 ? "" : "s"}, ${p.durationMin} min, ${outcomeWord(p.outcome)}.`,
      },
    });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `📅 *Tomorrow:* ${data.tomorrowBooked} booked call${data.tomorrowBooked === 1 ? "" : "s"} on the calendar.`,
    },
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "Built entirely from recordings — no forms required.",
      },
    ],
  });

  return blocks;
}

function buildDiscordEmbed(
  data: ManagerEodData,
  narrative: string | null,
  local: { weekday: string; month: number; day: number },
  shareUrls?: Record<string, string>,
): any {
  const reasonsText =
    data.reasons.length > 0
      ? data.reasons
          .map((r) => `• **${r.label}** — ${r.count} call${r.count === 1 ? "" : "s"}`)
          .join("\n")
      : "No objections read off today's calls.";
  const fields = [
    {
      name: "The day",
      value: `${data.callsTaken} live calls · ${data.realConversations} real conversations · ${data.closes} closed`,
    },
    { name: "Why calls didn't close", value: reasonsText },
  ];
  if (data.reviewPick) {
    const p = data.reviewPick;
    fields.push({
      name: "One call worth reviewing",
      value: `[${p.label}](${shareUrls?.[String(p.callId)] ?? `${DASHBOARD_CALL_URL}/${p.callId}`}) — ${p.objectionCount} objections, ${p.durationMin} min, ${outcomeWord(p.outcome)}`,
    });
  }
  fields.push({
    name: "Tomorrow",
    value: `${data.tomorrowBooked} booked calls on the calendar`,
  });
  return {
    title: `Manager EOD — ${local.weekday} ${local.month}/${local.day}`,
    description: narrative ?? undefined,
    color: 3447003,
    fields,
    footer: { text: "Built entirely from recordings — no forms required." },
  };
}

// ----------------------------------------------------------------------------
// Delivery — the cash digest's shape exactly: hourly cron, per-team local
// hour, dedup on the local date, recorded only after a successful send.
// ----------------------------------------------------------------------------

export const getEnabledManagerEodTeams = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"teams">[]> => {
    const teams = await ctx.db.query("teams").collect();
    return teams.filter((t: any) => t.managerEodEnabled === true);
  },
});

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

async function maybeSendForTeam(
  ctx: any,
  team: Doc<"teams">,
  nowMs: number,
  opts?: { force?: boolean; dedupSuffix?: string },
): Promise<{ sent: boolean; reason?: string }> {
  const tz = team.timezone || DEFAULT_TIMEZONE;
  const local = formatInTimeZone(new Date(nowMs), tz);

  if (!opts?.force) {
    const targetHour = (team as any).managerEodHourLocal ?? DEFAULT_HOUR;
    if (local.hour !== targetHour) {
      return { sent: false, reason: `hour ${local.hour} != target ${targetHour}` };
    }
  }

  const dayKey = `${local.year}-${pad2(local.month)}-${pad2(local.day)}`;
  const dedupKey = `${team._id}_managereod_${dayKey}${opts?.dedupSuffix ?? ""}`;
  const alreadySent = await ctx.runQuery(
    internal.setterDataNotifications.hasNotificationByDedupKey,
    { dedupKey },
  );
  if (alreadySent) return { sent: false, reason: "already sent for this date" };

  const data: ManagerEodData = await ctx.runQuery(
    internal.managerEodDigest.getManagerEodData,
    { teamId: team._id, nowMs },
  );

  // A day with zero calls still posts — silence reads as "the report broke",
  // and an owner should know a zero-call day happened.
  const narrative = await narrateDay(data);

  // Public watch-links for every call the message mentions. The channel
  // includes setters, who can't open the manager dashboard — Zion's ask.
  const linkedCallIds = new Set<string>();
  for (const r of data.reasons) for (const c of r.calls) linkedCallIds.add(String(c.callId));
  if (data.reviewPick) linkedCallIds.add(String(data.reviewPick.callId));
  const shareUrls: Record<string, string> = {};
  for (const callId of linkedCallIds) {
    try {
      const minted = await ctx.runMutation(
        internal.sharedLinks.getOrCreateDigestShareLink,
        { callId: callId as Id<"calls"> },
      );
      if (minted?.url) shareUrls[callId] = minted.url;
    } catch (e) {
      console.error(`[managerEod] share link mint failed for ${callId}`, e);
    }
  }

  const channel = (team as any).managerEodChannel;
  const fallback = `Manager EOD: ${data.callsTaken} calls, ${data.realConversations} real conversations, ${data.closes} closed`;

  if (channel === "slack") {
    const channelId =
      (team as any).managerEodSlackChannelId || (team as any).slackChannelId;
    if (!(team as any).slackAccessToken || !channelId) {
      return { sent: false, reason: "slack not connected or no channel" };
    }
    const result = await postSlackMessage({
      accessToken: (team as any).slackAccessToken,
      channelId,
      text: fallback,
      blocks: buildSlackBlocks(data, narrative, local, shareUrls),
    });
    if (!result.ok) throw new Error(`Slack post failed: ${result.error}`);
  } else if (channel === "discord") {
    const webhookUrl = (team as any).managerEodDiscordWebhookUrl;
    if (!webhookUrl) return { sent: false, reason: "no discord webhook configured" };
    const result = await postDiscordWebhook({
      webhookUrl,
      content: fallback,
      embed: buildDiscordEmbed(data, narrative, local, shareUrls),
    });
    if (!result.ok) throw new Error(`Discord post failed: ${result.error}`);
  } else {
    return { sent: false, reason: "no notification channel configured" };
  }

  await ctx.runMutation(internal.setterDataNotifications.recordSentNotification, {
    teamId: team._id,
    type: "manager_eod",
    dedupKey,
  });

  return { sent: true };
}

export const runManagerEod = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ processed: number; skipped: number; errored: number }> => {
    const now = Date.now();
    const teams: Doc<"teams">[] = await ctx.runQuery(
      internal.managerEodDigest.getEnabledManagerEodTeams,
      {},
    );
    let processed = 0;
    let skipped = 0;
    let errored = 0;
    for (const team of teams) {
      try {
        const r = await maybeSendForTeam(ctx, team, now);
        if (r.sent) processed++;
        else skipped++;
      } catch (e) {
        errored++;
        console.error(`[managerEod] team ${team._id}:`, e);
      }
    }
    if (processed > 0 || errored > 0) {
      console.log(`[managerEod] sent ${processed}, skipped ${skipped}, errored ${errored}`);
    }
    return { processed, skipped, errored };
  },
});

/**
 * The whole digest — data, narrative, rendered Slack blocks — without
 * posting anywhere. The bench tool: how the report gets judged against a
 * real team's day before anyone's channel sees it.
 */
export const previewManagerEod = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<any> => {
    const nowMs = Date.now();
    const data: ManagerEodData = await ctx.runQuery(
      internal.managerEodDigest.getManagerEodData,
      { teamId: args.teamId, nowMs },
    );
    const narrative = await narrateDay(data);
    const team = await ctx.runQuery(
      internal.cashDigestNotifications.getTeamForCashDigest,
      { teamId: args.teamId },
    );
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const local = formatInTimeZone(new Date(nowMs), tz);
    const linkedCallIds = new Set<string>();
    for (const r of data.reasons) for (const c of r.calls) linkedCallIds.add(String(c.callId));
    if (data.reviewPick) linkedCallIds.add(String(data.reviewPick.callId));
    const shareUrls: Record<string, string> = {};
    for (const callId of linkedCallIds) {
      const minted = await ctx.runMutation(
        internal.sharedLinks.getOrCreateDigestShareLink,
        { callId: callId as Id<"calls"> },
      );
      if (minted?.url) shareUrls[callId] = minted.url;
    }
    return { data, narrative, blocks: buildSlackBlocks(data, narrative, local, shareUrls) };
  },
});

/** Force-send now regardless of hour/dedup — for verifying a team's setup. */
export const sendTestManagerEod = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const team = await ctx.runQuery(
      internal.cashDigestNotifications.getTeamForCashDigest,
      { teamId: args.teamId },
    );
    if (!team) return { sent: false, reason: "team not found" };
    return await maybeSendForTeam(ctx, team, Date.now(), {
      force: true,
      dedupSuffix: `_test_${Math.floor(Date.now() / 60000)}`,
    });
  },
});

/** Per-team setup lever, CLI-driven like the cash digest's. */
export const configureManagerEod = internalMutation({
  args: {
    teamId: v.id("teams"),
    enabled: v.boolean(),
    hourLocal: v.optional(v.number()),
    channel: v.optional(v.union(v.literal("slack"), v.literal("discord"))),
    slackChannelId: v.optional(v.string()),
    discordWebhookUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");
    await ctx.db.patch(args.teamId, {
      managerEodEnabled: args.enabled,
      ...(args.hourLocal !== undefined ? { managerEodHourLocal: args.hourLocal } : {}),
      ...(args.channel !== undefined ? { managerEodChannel: args.channel } : {}),
      ...(args.slackChannelId !== undefined
        ? { managerEodSlackChannelId: args.slackChannelId }
        : {}),
      ...(args.discordWebhookUrl !== undefined
        ? { managerEodDiscordWebhookUrl: args.discordWebhookUrl }
        : {}),
    } as any);
    return { team: team.name, enabled: args.enabled };
  },
});

// ----------------------------------------------------------------------------
// Self-serve delivery settings — the same contract as every other
// notification: the manager picks the channel, we never guess.
// ----------------------------------------------------------------------------

export const getManagerEodConfig = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) return null;
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team) return null;
    return {
      enabled: (team as any).managerEodEnabled === true,
      hourLocal: (team as any).managerEodHourLocal ?? 19,
      slackChannelId: (team as any).managerEodSlackChannelId ?? null,
      slackChannelName: (team as any).managerEodSlackChannelName ?? null,
      channelReady:
        !!(team as any).slackAccessToken ||
        !!(team as any).managerEodDiscordWebhookUrl,
    };
  },
});

export const setManagerEodConfig = mutation({
  args: {
    clerkId: v.string(),
    enabled: v.boolean(),
    hourLocal: v.number(),
    slackChannelId: v.optional(v.string()),
    slackChannelName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user) throw new ConvexError("Not signed in");
    if (
      !Number.isInteger(args.hourLocal) ||
      args.hourLocal < 0 ||
      args.hourLocal > 23
    ) {
      throw new ConvexError("Pick an hour between 0 and 23");
    }
    const team = await ctx.db.get(user.teamId as Id<"teams">);
    await ctx.db.patch(user.teamId as Id<"teams">, {
      managerEodEnabled: args.enabled,
      managerEodHourLocal: args.hourLocal,
      // Default the delivery channel to Slack when nothing is configured —
      // "enabled" with channel undefined used to skip silently every night.
      ...((team as any)?.managerEodChannel === undefined &&
      !(team as any)?.managerEodDiscordWebhookUrl
        ? { managerEodChannel: "slack" as const }
        : {}),
      ...(args.slackChannelId !== undefined
        ? {
            managerEodChannel: "slack" as const,
            managerEodSlackChannelId: args.slackChannelId,
            managerEodSlackChannelName: args.slackChannelName,
          }
        : {}),
    });
    return { ok: true };
  },
});
