import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  formatInTimeZone,
  humanReadableDate,
  pad2,
  postDiscordWebhook,
  postSlackMessage,
  type ZonedDate,
} from "./setterDataNotifications";
import { DEFAULT_TIMEZONE } from "./closerPerformance";
import { collectTeamOutstanding } from "./collections";
import type {
  OutstandingBalance,
  OutstandingBalancesResult,
} from "./collections";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================================
// Outstanding balances digest -> Slack / Discord.
//
// Deliberately the same machinery as the two scorecards: hourly cron, gated on
// each team's local delivery hour, deduped per day, dedup recorded only AFTER a
// successful send.
//
// The one rule that is different, and the one this feature lives or dies on:
// IT SENDS NOTHING WHEN NOTHING IS OWED. That silence is what makes a daily
// cadence tolerable — the message only ever appears on a day there is money to
// chase, so it reads as present rather than as noise. A digest that posts
// "nothing outstanding today" every morning becomes wallpaper within a week and
// takes the useful ones down with it.
//
// The message is a prompt for a human, not a report. Whoever chases the money
// replies in the thread with the arrangement ("he's on $500/month") — we carry
// the persistence, they carry the nuance.
// ============================================================================

type ActionCtx = any;
type TeamDoc = Doc<"teams">;

/**
 * Rows shown before the list is cut off with a "+N more" line.
 *
 * Slack renders a wall of forty rows as something to scroll past. The total at
 * the top is the number that matters; the list is there so the top few are
 * actionable without opening anything.
 */
const MAX_ROWS_SHOWN = 12;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The action_id on the digest's button.
 *
 * Lives here rather than with the interaction handler so the message and the
 * router can't drift apart — a renamed action_id would otherwise produce a
 * button that silently does nothing.
 */
export const COLLECTIONS_UPDATE_ACTION = "collections_update";

// ----------------------------------------------------------------------------
// Laying the rows out as a table.
//
// Slack has no table primitive. What it does have is a code block, which renders
// in a monospace font — so padding the columns by hand produces genuinely
// aligned figures. That matters more here than anywhere else in the product:
// this message exists to be scanned for the biggest and oldest numbers, and a
// ragged list of bolded amounts makes the reader do that work themselves.
//
// The cost is a fixed width. Anything past ~56 characters wraps on a phone and
// the alignment collapses, so the columns below are budgeted to fit inside that
// and names are truncated rather than allowed to push the numbers out of line.
// ----------------------------------------------------------------------------

const COL = { prospect: 19, closer: 10, paid: 8, owed: 8, age: 5 };

/** Cut to width, with an ellipsis, so one long name can't break every row. */
function fit(text: string, width: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= width ? clean.padEnd(width) : clean.slice(0, width - 1) + "…";
}

/**
 * "Tyler Allen" → "Tyler A."
 *
 * Truncating a full name to the column width produces "Tyler A…", which reads
 * as a mistake. An initial is a convention people already recognise, and it's
 * how a sales floor refers to each other anyway.
 */
function shortName(full: string): string {
  const parts = full.replace(/\s+/g, " ").trim().split(" ");
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** "24d" / "today" — short enough to keep the column narrow. */
function shortAge(days: number): string {
  return days === 0 ? "today" : `${days}d`;
}

function tableRow(b: OutstandingBalance): string {
  // An asterisk rather than a column: the sheet is fixed-width and a whole
  // column spent on provenance would cost more than it tells, but a balance we
  // READ off a recording still must not look identical to one a person
  // confirmed — this list is what decides who gets chased for money.
  const name = b.outcomeSource === "ai" ? `${b.prospectName}*` : b.prospectName;
  return [
    fit(name, COL.prospect),
    fit(shortName(b.closerName), COL.closer),
    money(b.cashCollected).padStart(COL.paid),
    money(b.balance).padStart(COL.owed),
    shortAge(b.ageDays).padStart(COL.age),
  ].join(" ");
}

function tableHeader(): string {
  const head = [
    "PROSPECT".padEnd(COL.prospect),
    "CLOSER".padEnd(COL.closer),
    "PAID".padStart(COL.paid),
    "OWED".padStart(COL.owed),
    "AGE".padStart(COL.age),
  ].join(" ");
  return `${head}\n${"─".repeat(head.length)}`;
}

/**
 * A section of the sheet, as a fenced block.
 *
 * Paid and Owed rather than Paid and Contract: the contract value is the sum of
 * the two, so showing it would spend a column on a number the reader can do in
 * their head — and Owed is the one being acted on.
 */
function table(rows: OutstandingBalance[], moreCount = 0): string {
  const lines = [tableHeader(), ...rows.map(tableRow)];
  if (moreCount > 0) lines.push(`… and ${moreCount} more`);
  if (rows.some((r) => r.outcomeSource === "ai")) {
    lines.push("");
    lines.push("* read from the call recording — worth checking before chasing");
  }
  return "```\n" + lines.join("\n") + "\n```";
}

/** Teams with the balances digest switched on and an hour configured. */
export const getEnabledCollectionsTeams = internalQuery({
  args: {},
  handler: async (ctx): Promise<TeamDoc[]> => {
    const teams = await ctx.db.query("teams").take(1000);
    return teams.filter(
      (t) =>
        t.collectionsDigestEnabled === true &&
        typeof t.collectionsDigestHourLocal === "number",
    ) as TeamDoc[];
  },
});

/**
 * Compose the digest without sending it.
 *
 * Exists so the message can be reviewed — during development, and by a manager
 * before they switch the thing on — without posting into a live channel to find
 * out what it says. It runs the same scan and the same block builders the real
 * send does, because a preview that doesn't share a code path with the thing it
 * previews is worth very little.
 *
 * Returns the rendered blocks and a plain-text rendering of the same content,
 * so it's readable from the CLI as well as from a UI.
 */
export const previewCollectionsDigest = internalQuery({
  args: { teamId: v.id("teams"), nowMs: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{
    wouldSend: boolean;
    reason?: string;
    text: string;
    plain: string;
    blocks: any[];
    embed: any;
  }> => {
    const now = args.nowMs ?? Date.now();
    const team = await ctx.db.get(args.teamId);
    const tz = team?.timezone || DEFAULT_TIMEZONE;
    const zd = formatInTimeZone(new Date(now), tz);
    const weekly = team?.collectionsDigestCadence === "weekly";
    const newSinceMs = now - (weekly ? 7 : 1) * 86_400_000;

    const data = await collectTeamOutstanding(ctx, args.teamId, now);

    if (data.count === 0) {
      return {
        wouldSend: false,
        reason: "nothing outstanding — no message is sent",
        text: "",
        plain: "",
        blocks: [],
        embed: null,
      };
    }

    return {
      wouldSend: true,
      text: headline(data),
      plain: renderPlainText(data, newSinceMs, zd),
      blocks: buildSlackBlocks(data, newSinceMs, zd, String(args.teamId)),
      embed: buildDiscordEmbed(data, newSinceMs, zd),
    };
  },
});

/** The same content as the blocks, flattened for reading in a terminal. */
function renderPlainText(
  data: OutstandingBalancesResult,
  newSinceMs: number,
  zd: ZonedDate,
): string {
  const { fresh, ageing } = partition(data.balances, newSinceMs);
  const strip = (s: string) => s.replace(/```/g, "").trim();
  const lines: string[] = [headline(data), humanReadableDate(zd), ""];

  if (fresh.length > 0) {
    lines.push("NEW", strip(table(fresh)), "");
  }

  if (ageing.length > 0) {
    const shown = ageing.slice(0, MAX_ROWS_SHOWN);
    lines.push(
      fresh.length > 0 ? "STILL OUTSTANDING" : "OUTSTANDING",
      strip(table(shown, ageing.length - shown.length)),
      "",
    );
  }

  lines.push("[ Open collections list ]");
  lines.push("");
  lines.push("Reply in thread with payment arrangements.");
  if (data.truncated) {
    lines.push("⚠️ More open balances than this digest can total.");
  }
  return lines.join("\n");
}

export const getTeamForCollections = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<TeamDoc | null> => {
    return (await ctx.db.get(args.teamId)) as TeamDoc | null;
  },
});

/**
 * Split into what's new since the last digest and what's still sitting there.
 *
 * A balance closed this morning needs a different response from one that's been
 * open three weeks — the first needs the arrangement writing down while the
 * closer still remembers the call, the second needs someone to pick up a phone.
 */
function partition(
  balances: OutstandingBalance[],
  newSinceMs: number,
): { fresh: OutstandingBalance[]; ageing: OutstandingBalance[] } {
  return {
    fresh: balances.filter((b) => b.closedAt >= newSinceMs),
    ageing: balances.filter((b) => b.closedAt < newSinceMs),
  };
}

function headline(data: OutstandingBalancesResult): string {
  return `💰 ${money(data.total)} outstanding across ${plural(data.count, "deal", "deals")}`;
}

/** Exported so a message being rewritten after a Slack action reads identically. */
export const headlineFor = headline;

/**
 * How far back counts as "new" for a given cadence.
 *
 * A weekly team should see a week of closes under New, not one day's worth and
 * six days of deals nobody ever called new.
 */
export function digestWindowMs(cadence: string | undefined): number {
  return (cadence === "weekly" ? 7 : 1) * 86_400_000;
}

export function buildSlackBlocks(
  data: OutstandingBalancesResult,
  newSinceMs: number,
  zd: ZonedDate,
  teamId: string,
): any[] {
  const { fresh, ageing } = partition(data.balances, newSinceMs);
  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headline(data), emoji: true },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: humanReadableDate(zd) }],
    },
  ];

  if (fresh.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*New*\n${table(fresh)}` },
    });
  }

  if (ageing.length > 0) {
    const shown = ageing.slice(0, MAX_ROWS_SHOWN);
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${fresh.length > 0 ? "Still outstanding" : "Outstanding"}*\n` +
          table(shown, ageing.length - shown.length),
      },
    });
  }

  // Clearing happens here, not on the dashboard.
  //
  // There was a link to the web app instead. It was the wrong answer: only
  // managers can sign in, and the people who chase money — customer success,
  // and the closers who know what was arranged — mostly can't. A list you can't
  // act on where you read it is a list that grows forever.
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        style: "primary",
        text: { type: "plain_text", text: "Update balances", emoji: true },
        action_id: COLLECTIONS_UPDATE_ACTION,
        // Read back on the way in, so the handler never has to guess which
        // team a click belongs to.
        value: teamId,
      },
    ],
  });

  // The instruction is the feature. Without it this is a report nobody acts on;
  // with it the thread becomes the record of what was agreed.
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text:
          "Reply in thread with payment arrangements, and use *Update balances* " +
          "as the money comes in. Amounts are what the closer logged after the call.",
      },
    ],
  });

  if (data.truncated) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "⚠️ More open balances than this digest can total — the figure above is understated.",
        },
      ],
    });
  }

  return blocks;
}

export function buildDiscordEmbed(
  data: OutstandingBalancesResult,
  newSinceMs: number,
  zd: ZonedDate,
): any {
  const { fresh, ageing } = partition(data.balances, newSinceMs);
  const fields: any[] = [];

  // Discord renders fenced blocks in monospace too, so the same table works.
  if (fresh.length > 0) {
    fields.push({
      name: "New",
      value: table(fresh).slice(0, 1024),
      inline: false,
    });
  }

  if (ageing.length > 0) {
    const shown = ageing.slice(0, MAX_ROWS_SHOWN);
    fields.push({
      name: fresh.length > 0 ? "Still outstanding" : "Outstanding",
      value: table(shown, ageing.length - shown.length).slice(0, 1024),
      inline: false,
    });
  }

  let footer =
    "Reply in thread with payment arrangements. Mark anything already paid as collected.";
  if (data.truncated) {
    footer += "\n⚠️ More open balances than this digest can total.";
  }

  return {
    title: headline(data),
    description: humanReadableDate(zd),
    color: 0x18181b,
    fields,
    footer: { text: footer.slice(0, 2048) },
  };
}

export async function maybeSendForTeam(
  ctx: ActionCtx,
  team: TeamDoc,
  nowMs: number,
  opts?: { force?: boolean; dedupSuffix?: string },
): Promise<{ sent: boolean; reason?: string }> {
  const tz = team.timezone || DEFAULT_TIMEZONE;
  const localNow = formatInTimeZone(new Date(nowMs), tz);
  const weekly = team.collectionsDigestCadence === "weekly";

  // `force` is the "send test now" path: skip the gates so a manager can see
  // the real message in their real channel instead of trusting a preview.
  if (!opts?.force) {
    const targetHour = team.collectionsDigestHourLocal;
    if (typeof targetHour !== "number") {
      return { sent: false, reason: "no target hour configured" };
    }
    // The cron fires hourly; matching on the local hour gives a one-hour
    // window so slight cron drift still lands in the right slot.
    if (localNow.hour !== targetHour) {
      return {
        sent: false,
        reason: `hour ${localNow.hour} != target ${targetHour}`,
      };
    }
    if (weekly && localNow.weekday !== "Mon") {
      return { sent: false, reason: `weekly cadence, today is ${localNow.weekday}` };
    }
  }

  const dayKey = `${localNow.year}-${pad2(localNow.month)}-${pad2(localNow.day)}`;
  const dedupKey = `${team._id}_collections_${dayKey}${opts?.dedupSuffix ?? ""}`;
  const alreadySent = await ctx.runQuery(
    internal.setterDataNotifications.hasNotificationByDedupKey,
    { dedupKey },
  );
  if (alreadySent) return { sent: false, reason: "already sent for this date" };

  const data = (await ctx.runQuery(
    internal.collections.getTeamOutstandingBalances,
    { teamId: team._id, nowMs },
  )) as OutstandingBalancesResult;

  // The rule the whole feature rests on. Nothing owed, nothing sent — even on
  // the forced test path, because posting an empty digest into a live channel
  // to prove the wiring works teaches exactly the wrong thing about what this
  // message means.
  if (data.count === 0) return { sent: false, reason: "nothing outstanding" };

  // What counts as "new" is the span since the last digest would have run, so
  // a weekly team sees a week of closes under New rather than one day's worth
  // and six days of things that were never called new to anyone.
  const newSinceMs = nowMs - (weekly ? 7 : 1) * 86_400_000;

  const channel = team.collectionsDigestChannel;
  if (channel !== "slack" && channel !== "discord") {
    return { sent: false, reason: "no notification channel configured" };
  }

  const fallbackText = headline(data);

  if (channel === "slack") {
    const slackChannelId =
      team.collectionsDigestSlackChannelId || team.slackChannelId;
    if (!team.slackAccessToken || !slackChannelId) {
      return { sent: false, reason: "slack not connected or no channel" };
    }
    const result = await postSlackMessage({
      accessToken: team.slackAccessToken,
      channelId: slackChannelId,
      text: fallbackText,
      blocks: buildSlackBlocks(data, newSinceMs, localNow, String(team._id)),
    });
    if (!result.ok) throw new Error(`Slack post failed: ${result.error}`);
  } else {
    const webhookUrl = team.collectionsDigestDiscordWebhookUrl;
    if (!webhookUrl) {
      return { sent: false, reason: "no discord webhook configured" };
    }
    const result = await postDiscordWebhook({
      webhookUrl,
      content: fallbackText,
      embed: buildDiscordEmbed(data, newSinceMs, localNow),
    });
    if (!result.ok) throw new Error(`Discord post failed: ${result.error}`);
  }

  // Recorded only after a successful send, so a transient outage doesn't mark
  // the day delivered and silently skip it forever.
  await ctx.runMutation(internal.setterDataNotifications.recordSentNotification, {
    teamId: team._id,
    type: "collections_digest",
    dedupKey,
  });

  return { sent: true };
}

export const runCollectionsDigest = internalAction({
  args: {},
  // Explicit return type — without it TypeScript recurses through the
  // api.d.ts back-reference to this same function.
  handler: async (
    ctx,
  ): Promise<{
    processed: number;
    skipped: number;
    errored: number;
    candidateTeams: number;
  }> => {
    const now = Date.now();
    const teams = (await ctx.runQuery(
      internal.collectionsNotifications.getEnabledCollectionsTeams,
      {},
    )) as TeamDoc[];

    let processed = 0;
    let skipped = 0;
    let errored = 0;

    for (const team of teams) {
      try {
        const result = await maybeSendForTeam(ctx, team, now);
        if (result.sent) processed++;
        else skipped++;
      } catch (err) {
        // One team's misconfigured webhook must not stop everyone else's post.
        errored++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[runCollectionsDigest] Error for team ${team._id}:`, message);
        // An expired Slack token stops the digest and changes nothing else, so
        // the only signal is a channel going quiet. Page someone instead.
        await ctx.runAction(internal.lib.sentry.captureFromIsolate, {
          message: `Collections digest failed to send: ${message}`,
          feature: "collections-digest",
          integration: team.collectionsDigestChannel ?? "unknown",
          extra: { teamId: String(team._id) },
        });
      }
    }

    return { processed, skipped, errored, candidateTeams: teams.length };
  },
});

/**
 * Send one team's digest immediately, bypassing the hour and cadence gates.
 *
 * internalAction on purpose: it loads the team doc, which carries
 * slackAccessToken. Convex queries are callable by anyone holding the
 * deployment URL, so that document must never be returned to a public caller —
 * the public entry point passes a teamId and gets back a result, nothing more.
 */
export const sendCollectionsDigestNow = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const team = (await ctx.runQuery(
      internal.collectionsNotifications.getTeamForCollections,
      { teamId: args.teamId },
    )) as TeamDoc | null;
    if (!team) return { sent: false, reason: "team not found" };
    return maybeSendForTeam(ctx, team, Date.now(), {
      force: true,
      dedupSuffix: `_test_${Date.now()}`,
    });
  },
});
