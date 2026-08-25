import { v, ConvexError } from "convex/values";
import { withSlackTestLabel, withDiscordTestLabel } from "./lib/testLabel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  postSlackMessage,
  postDiscordWebhook,
  formatInTimeZone,
} from "./setterDataNotifications";
import { DEFAULT_TIMEZONE, dayKeyInTz } from "./closerPerformance";
import { resolveAuthUser } from "./setterGhlOauth";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Setter EOD notifications — two of them, both on the manager's schedule.
//
// 1. The REMINDER: posted where the setters look, listing each active
//    setter by name with their personal filing link. The names come only
//    from the roster the manager built on the Setter EODs tab — nothing
//    inferred from the CRM.
// 2. The MISSING report: posted for the manager, naming who still hasn't
//    filed today. When everyone has, it says so — silence would read as
//    "the report broke", and a manager checking compliance deserves the
//    good news too.
//
// Hour AND days are configurable per notification, from the tab itself.
// ============================================================================

const EOD_LINK_BASE = "https://www.sequ3nce.ai/setter-eod";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const dayList = v.array(
  v.union(
    v.literal("Sun"),
    v.literal("Mon"),
    v.literal("Tue"),
    v.literal("Wed"),
    v.literal("Thu"),
    v.literal("Fri"),
    v.literal("Sat"),
  ),
);

// ----------------------------------------------------------------------------
// Config — read and written from the Setter EODs tab by the manager.
// ----------------------------------------------------------------------------

export const getNotificationConfig = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) return null;
    const team: any = await ctx.db.get(user.teamId as Id<"teams">);
    if (!team) return null;
    return {
      // A connected workspace is what matters — this platform picks a
      // channel per notification, not one team-wide default.
      channelReady:
        !!team.slackAccessToken || !!team.setterEodDiscordWebhookUrl,
      reminder: {
        enabled: team.setterEodReminderEnabled === true,
        hourLocal: team.setterEodReminderHourLocal ?? 18,
        days: team.setterEodReminderDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"],
        slackChannelId: team.setterEodReminderSlackChannelId ?? null,
        slackChannelName: team.setterEodReminderSlackChannelName ?? null,
      },
      missing: {
        enabled: team.setterEodMissingEnabled === true,
        hourLocal: team.setterEodMissingHourLocal ?? 20,
        days: team.setterEodMissingDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"],
        slackChannelId: team.setterEodMissingSlackChannelId ?? null,
        slackChannelName: team.setterEodMissingSlackChannelName ?? null,
      },
    };
  },
});

export const setNotificationConfig = mutation({
  args: {
    clerkId: v.string(),
    which: v.union(v.literal("reminder"), v.literal("missing")),
    enabled: v.boolean(),
    hourLocal: v.number(),
    days: dayList,
    slackChannelId: v.optional(v.string()),
    slackChannelName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await resolveAuthUser(ctx, args.clerkId);
    if (!user?.teamId) throw new ConvexError("Not authorised");
    if (
      !Number.isInteger(args.hourLocal) ||
      args.hourLocal < 0 ||
      args.hourLocal > 23
    ) {
      throw new ConvexError("Pick an hour between 0 and 23");
    }
    const patch: Record<string, unknown> =
      args.which === "reminder"
        ? {
            setterEodReminderEnabled: args.enabled,
            setterEodReminderHourLocal: args.hourLocal,
            setterEodReminderDays: args.days,
            ...(args.slackChannelId !== undefined
              ? {
                  setterEodReminderSlackChannelId: args.slackChannelId,
                  setterEodReminderSlackChannelName: args.slackChannelName,
                }
              : {}),
          }
        : {
            setterEodMissingEnabled: args.enabled,
            setterEodMissingHourLocal: args.hourLocal,
            setterEodMissingDays: args.days,
            ...(args.slackChannelId !== undefined
              ? {
                  setterEodMissingSlackChannelId: args.slackChannelId,
                  setterEodMissingSlackChannelName: args.slackChannelName,
                }
              : {}),
          };
    await ctx.db.patch(user.teamId as Id<"teams">, patch as any);
    return { ok: true };
  },
});

/** CLI lever for the delivery details the tab doesn't expose — a dedicated
 *  Slack channel or a Discord webhook, per notification or shared. */
export const configureDelivery = internalMutation({
  args: {
    teamId: v.id("teams"),
    reminderSlackChannelId: v.optional(v.string()),
    missingSlackChannelId: v.optional(v.string()),
    discordWebhookUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) throw new Error("Team not found");
    await ctx.db.patch(args.teamId, {
      ...(args.reminderSlackChannelId !== undefined
        ? { setterEodReminderSlackChannelId: args.reminderSlackChannelId }
        : {}),
      ...(args.missingSlackChannelId !== undefined
        ? { setterEodMissingSlackChannelId: args.missingSlackChannelId }
        : {}),
      ...(args.discordWebhookUrl !== undefined
        ? { setterEodDiscordWebhookUrl: args.discordWebhookUrl }
        : {}),
    } as any);
    return { team: team.name };
  },
});

// ----------------------------------------------------------------------------
// Data
// ----------------------------------------------------------------------------

export const getRosterFilingState = internalQuery({
  args: { teamId: v.id("teams"), nowMs: v.number() },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    const tz = (team as any)?.timezone || DEFAULT_TIMEZONE;
    const today = dayKeyInTz(args.nowMs, tz);

    const roster = (
      await ctx.db
        .query("setterRoster")
        .withIndex("by_team", (q: any) => q.eq("teamId", args.teamId))
        .collect()
    ).filter((r: any) => r.active);

    const rows = [];
    for (const r of roster) {
      const filed = await ctx.db
        .query("setterEodEntries")
        .withIndex("by_roster_and_day", (q: any) =>
          q.eq("rosterId", r._id).eq("dayKey", today),
        )
        .first();
      rows.push({ name: r.name, token: r.token, filedToday: !!filed });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return { today, setters: rows };
  },
});

export const getEnabledTeams = internalQuery({
  args: {},
  handler: async (ctx): Promise<Doc<"teams">[]> => {
    const teams = await ctx.db.query("teams").collect();
    return teams.filter(
      (t: any) =>
        t.setterEodReminderEnabled === true || t.setterEodMissingEnabled === true,
    );
  },
});

// ----------------------------------------------------------------------------
// Send
// ----------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

async function deliver(
  team: any,
  slackChannelOverride: string | undefined,
  fallbackText: string,
  blocks: any[],
  embed: any,
): Promise<{ ok: boolean; reason?: string }> {
  const slackChannel = slackChannelOverride || team.slackChannelId;
  if (team.slackAccessToken && !slackChannel) {
    return { ok: false, reason: "slack connected but no channel picked for this notification" };
  }
  if (team.slackAccessToken && slackChannel) {
    const r = await postSlackMessage({
      accessToken: team.slackAccessToken,
      channelId: slackChannel,
      text: fallbackText,
      blocks,
    });
    if (!r.ok) throw new Error(`Slack post failed: ${r.error}`);
    return { ok: true };
  }
  if (team.setterEodDiscordWebhookUrl) {
    const r = await postDiscordWebhook({
      webhookUrl: team.setterEodDiscordWebhookUrl,
      content: fallbackText,
      embed,
    });
    if (!r.ok) throw new Error(`Discord post failed: ${r.error}`);
    return { ok: true };
  }
  return { ok: false, reason: "no channel configured" };
}

async function maybeSend(
  ctx: any,
  team: any,
  which: "reminder" | "missing",
  nowMs: number,
  opts?: { force?: boolean; dedupSuffix?: string },
): Promise<{ sent: boolean; reason?: string }> {
  const enabled =
    which === "reminder"
      ? team.setterEodReminderEnabled === true
      : team.setterEodMissingEnabled === true;
  if (!enabled && !opts?.force) return { sent: false, reason: "disabled" };

  const tz = team.timezone || DEFAULT_TIMEZONE;
  const local = formatInTimeZone(new Date(nowMs), tz);

  if (!opts?.force) {
    const targetHour =
      which === "reminder"
        ? (team.setterEodReminderHourLocal ?? 18)
        : (team.setterEodMissingHourLocal ?? 20);
    if (local.hour !== targetHour) {
      return { sent: false, reason: `hour ${local.hour} != ${targetHour}` };
    }
    const days: string[] =
      (which === "reminder"
        ? team.setterEodReminderDays
        : team.setterEodMissingDays) ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];
    if (!days.includes(local.weekday)) {
      return { sent: false, reason: `${local.weekday} not in configured days` };
    }
  }

  const dayKey = `${local.year}-${pad2(local.month)}-${pad2(local.day)}`;
  const dedupKey = `${team._id}_seteod_${which}_${dayKey}${opts?.dedupSuffix ?? ""}`;
  const alreadySent = await ctx.runQuery(
    internal.setterDataNotifications.hasNotificationByDedupKey,
    { dedupKey },
  );
  if (alreadySent) return { sent: false, reason: "already sent today" };

  const state = await ctx.runQuery(
    internal.setterEodNotifications.getRosterFilingState,
    { teamId: team._id, nowMs },
  );
  if (state.setters.length === 0) {
    return { sent: false, reason: "no active setters on the roster" };
  }

  let fallback: string;
  let blocks: any[];
  let embed: any;
  let slackChannelOverride: string | undefined;

  if (which === "reminder") {
    slackChannelOverride = team.setterEodReminderSlackChannelId;
    // One shared app link, zero secrets. The per-setter tokenized links used
    // to be posted here — that was fine for a bare form, but the setter app
    // now holds call recordings, and a bearer link in a shared channel can't
    // guard those. Each setter signs into their OWN account at this URL.
    const APP_URL = "https://www.sequ3nce.ai/setter";
    const lines = state.setters
      .map((s: any) => `• *${s.name}*${s.filedToday ? " — filed ✓" : ""}`)
      .join("\n");
    fallback = "EOD time — open the setter app and file your numbers.";
    blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `📝 *EOD time.* <${APP_URL}|Open the setter app>, thirty seconds:\n${lines}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Sign in with your work email — resubmitting updates today's numbers.",
          },
        ],
      },
    ];
    embed = {
      title: "📝 EOD time",
      description:
        `[Open the setter app](${APP_URL}), thirty seconds:\n` + lines.replace(/\*/g, "**"),
      color: 3447003,
    };
  } else {
    slackChannelOverride = team.setterEodMissingSlackChannelId;
    const missing = state.setters.filter((s: any) => !s.filedToday);
    if (missing.length === 0) {
      fallback = `All ${state.setters.length} setters filed their EOD today.`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✅ *All ${state.setters.length} setters filed their EOD today.*`,
          },
        },
      ];
      embed = { title: "✅ EODs complete", description: fallback, color: 3066993 };
    } else {
      const names = missing.map((s: any) => `• ${s.name}`).join("\n");
      fallback = `${missing.length} of ${state.setters.length} setters haven't filed their EOD.`;
      blocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `⏳ *Still no EOD from ${missing.length} of ${state.setters.length} setters:*\n${names}`,
          },
        },
      ];
      embed = {
        title: `⏳ Missing EODs — ${missing.length} of ${state.setters.length}`,
        description: names,
        color: 15105570,
      };
    }
  }

  const isTest = opts?.dedupSuffix?.includes("_test") === true;
  const delivered = await deliver(
    team,
    slackChannelOverride,
    fallback,
    isTest ? withSlackTestLabel(blocks) : blocks,
    isTest && embed ? withDiscordTestLabel(embed) : embed,
  );
  if (!delivered.ok) return { sent: false, reason: delivered.reason };

  await ctx.runMutation(internal.setterDataNotifications.recordSentNotification, {
    teamId: team._id,
    type: `setter_eod_${which}`,
    dedupKey,
  });
  return { sent: true };
}

export const runSetterEodNotifications = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ sent: number; skipped: number; errored: number }> => {
    const now = Date.now();
    const teams: Doc<"teams">[] = await ctx.runQuery(
      internal.setterEodNotifications.getEnabledTeams,
      {},
    );
    let sent = 0;
    let skipped = 0;
    let errored = 0;
    for (const team of teams) {
      for (const which of ["reminder", "missing"] as const) {
        try {
          const r = await maybeSend(ctx, team, which, now);
          if (r.sent) sent++;
          else skipped++;
        } catch (e) {
          errored++;
          console.error(`[setterEodNotify] ${which} for team ${team._id}:`, e);
        }
      }
    }
    if (sent > 0 || errored > 0) {
      console.log(`[setterEodNotify] sent ${sent}, skipped ${skipped}, errored ${errored}`);
    }
    return { sent, skipped, errored };
  },
});

/** Force one notification now, ignoring hour/days/dedup — setup verification. */
export const sendTest = internalAction({
  args: {
    teamId: v.id("teams"),
    which: v.union(v.literal("reminder"), v.literal("missing")),
  },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const team = await ctx.runQuery(
      internal.cashDigestNotifications.getTeamForCashDigest,
      { teamId: args.teamId },
    );
    if (!team) return { sent: false, reason: "team not found" };
    return await maybeSend(ctx, team, args.which, Date.now(), {
      force: true,
      dedupSuffix: `_test_${Math.floor(Date.now() / 60000)}`,
    });
  },
});

/** Both messages fully rendered, posted nowhere — the bench tool. */
export const previewNotifications = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<any> => {
    const state = await ctx.runQuery(
      internal.setterEodNotifications.getRosterFilingState,
      { teamId: args.teamId, nowMs: Date.now() },
    );
    const missing = state.setters.filter((s: any) => !s.filedToday);
    // Mirror of the REAL reminder copy (single app link — the per-setter
    // tokenized links were removed when the setter app shipped; a bearer
    // link in a shared channel can't guard recordings).
    const reminderText =
      `📝 *EOD time.* <https://www.sequ3nce.ai/setter|Open the setter app>, thirty seconds:\n` +
      state.setters
        .map((s: any) => `• *${s.name}*${s.filedToday ? " — filed ✓" : ""}`)
        .join("\n");
    return {
      today: state.today,
      reminderText,
      missingCount: missing.length,
      missingNames: missing.map((s: any) => s.name),
    };
  },
});
