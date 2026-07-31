// ============================================================================
// Clearing balances from inside Slack.
//
// The dashboard can't be the only place this happens. Only managers can sign in
// to the web app — closers use their own app and customer success reps, who are
// usually the ones actually chasing the money, have no login at all. Sending
// them a list they can't act on is how the list grows forever.
//
// Shape: the digest carries one "Update balances" button. Clicking it opens a
// dialog listing every open balance with a checkbox, plus a choice of collected
// or written off. Submitting applies them and rewrites the original message in
// place, so the channel never shows a stale total.
//
// A dialog rather than a button per row, for two reasons. Slack renders aligned
// columns only inside a code block and code blocks can't hold buttons, so
// per-row buttons would cost us the table. And collections is reconciled in
// batches — someone goes through the payment processor once and clears four at
// a time — which a checklist fits better than four separate clicks.
//
// TRUST MODEL: anyone who can see the channel can clear a balance. That is the
// same trust boundary as the channel itself, and it's the point — but it means
// the digest belongs in a channel whose membership you'd be comfortable handing
// write access to.
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { OutstandingBalancesResult } from "./collections";
import {
  buildSlackBlocks,
  headlineFor,
  digestWindowMs,
  COLLECTIONS_UPDATE_ACTION,
} from "./collectionsNotifications";
import { formatInTimeZone } from "./setterDataNotifications";
import { DEFAULT_TIMEZONE } from "./closerPerformance";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Slack allows at most 10 options in one checkbox group. */
const CHECKBOX_GROUP_SIZE = 10;

/**
 * Balances offered in the dialog at once.
 *
 * Five groups of ten. A team with more open than this clears the oldest first
 * and reopens the dialog — which is the right order to work through anyway.
 */
const MAX_SELECTABLE = 50;

export const ACTION_OPEN_DIALOG = COLLECTIONS_UPDATE_ACTION;
export const CALLBACK_RESOLVE = "collections_resolve";
export const ACTION_UNDO = "collections_undo";

/**
 * Slack caps a button's `value` at 2000 characters.
 *
 * Convex ids are ~32 characters, so a batch of roughly fifty still fits. Past
 * that the receipt says so instead of offering an undo that would arrive
 * truncated and silently put back only some of what was cleared.
 */
const MAX_UNDO_VALUE_CHARS = 1800;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Slack option labels are capped at 75 characters. */
function optionLabel(b: {
  prospectName: string;
  balance: number;
  ageDays: number;
}): string {
  const age = b.ageDays === 0 ? "today" : `${b.ageDays}d`;
  const suffix = ` — ${money(b.balance)} · ${age}`;
  const room = 75 - suffix.length;
  const name =
    b.prospectName.length <= room
      ? b.prospectName
      : b.prospectName.slice(0, room - 1) + "…";
  return `${name}${suffix}`;
}

/** The team behind a Slack button, with the token needed to answer it. */
export const getTeamForInteraction = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    teamId: Id<"teams">;
    slackTeamId: string | null;
    accessToken: string | null;
    timezone: string;
    cadence: string;
  } | null> => {
    const team = await ctx.db.get(args.teamId);
    if (!team) return null;
    return {
      teamId: team._id,
      slackTeamId: team.slackTeamId ?? null,
      accessToken: team.slackAccessToken ?? null,
      timezone: team.timezone || DEFAULT_TIMEZONE,
      cadence: team.collectionsDigestCadence ?? "daily",
    };
  },
});

function buildDialog(
  data: OutstandingBalancesResult,
  metadata: string,
): any {
  const selectable = data.balances.slice(0, MAX_SELECTABLE);

  const blocks: any[] = [
    {
      type: "input",
      block_id: "resolution",
      label: { type: "plain_text", text: "What happened?" },
      element: {
        type: "radio_buttons",
        action_id: "resolution",
        initial_option: {
          text: { type: "plain_text", text: "Collected — the money came in" },
          value: "settled",
        },
        options: [
          {
            text: { type: "plain_text", text: "Collected — the money came in" },
            value: "settled",
          },
          {
            // Named plainly on purpose. Someone clearing a debt that will never
            // be paid should know that's what they're recording, because it is
            // a different fact about the business from being paid.
            text: { type: "plain_text", text: "Write off — it isn't coming" },
            value: "written_off",
          },
        ],
      },
    },
    { type: "divider" },
  ];

  for (let i = 0; i < selectable.length; i += CHECKBOX_GROUP_SIZE) {
    const group = selectable.slice(i, i + CHECKBOX_GROUP_SIZE);
    blocks.push({
      type: "input",
      block_id: `balances_${i / CHECKBOX_GROUP_SIZE}`,
      // Every group must be optional or Slack demands a tick in each one.
      optional: true,
      label: {
        type: "plain_text",
        text: i === 0 ? "Which deals?" : " ",
      },
      element: {
        type: "checkboxes",
        action_id: "picked",
        options: group.map((b) => ({
          text: { type: "plain_text", text: optionLabel(b) },
          value: String(b.callId),
        })),
      },
    });
  }

  if (data.balances.length > selectable.length) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Showing the ${selectable.length} oldest of ${data.balances.length}. Clear these and reopen for the rest.`,
        },
      ],
    });
  }

  return {
    type: "modal",
    callback_id: CALLBACK_RESOLVE,
    private_metadata: metadata,
    title: { type: "plain_text", text: "Update balances" },
    submit: { type: "plain_text", text: "Submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks,
  };
}

/**
 * Someone pressed the button. Open the dialog.
 *
 * Slack expires a trigger_id after three seconds, so this does the minimum:
 * one read, one API call.
 */
export const openResolveDialog = internalAction({
  args: {
    teamId: v.id("teams"),
    slackTeamId: v.string(),
    triggerId: v.string(),
    channelId: v.string(),
    messageTs: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    const team = await ctx.runQuery(
      internal.collectionsSlackActions.getTeamForInteraction,
      { teamId: args.teamId },
    );
    if (!team?.accessToken) return { ok: false, error: "team not connected" };

    // Defence in depth. The team id travels in the button we composed and the
    // payload is signature-verified, but a workspace mismatch would mean
    // something has gone wrong somewhere and the safe move is to refuse.
    if (team.slackTeamId && team.slackTeamId !== args.slackTeamId) {
      return { ok: false, error: "workspace mismatch" };
    }

    const data = (await ctx.runQuery(
      internal.collections.getTeamOutstandingBalances,
      { teamId: args.teamId },
    )) as OutstandingBalancesResult;

    const view =
      data.count === 0
        ? {
            type: "modal",
            title: { type: "plain_text", text: "Update balances" },
            close: { type: "plain_text", text: "Close" },
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "Nothing outstanding — every balance has been cleared.",
                },
              },
            ],
          }
        : buildDialog(
            data,
            JSON.stringify({
              teamId: String(args.teamId),
              channelId: args.channelId,
              messageTs: args.messageTs,
            }),
          );

    const res = await fetch("https://slack.com/api/views.open", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${team.accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ trigger_id: args.triggerId, view }),
    });
    const json: any = await res.json();
    if (!json.ok) {
      console.error("[collections] views.open failed:", json.error);
      return { ok: false, error: String(json.error ?? "unknown") };
    }
    return { ok: true };
  },
});

/**
 * Rewrite the digest in place so the channel never shows a stale total.
 *
 * Scheduled rather than inline: Slack closes the dialog on our response and
 * waits three seconds for it, and redrawing the message is not worth risking
 * that deadline for.
 */
export const refreshDigestMessage = internalAction({
  args: {
    teamId: v.id("teams"),
    channelId: v.string(),
    messageTs: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const team = await ctx.runQuery(
      internal.collectionsSlackActions.getTeamForInteraction,
      { teamId: args.teamId },
    );
    if (!team?.accessToken) return { ok: false };

    const now = Date.now();
    const data = (await ctx.runQuery(
      internal.collections.getTeamOutstandingBalances,
      { teamId: args.teamId },
    )) as OutstandingBalancesResult;

    const zd = formatInTimeZone(new Date(now), team.timezone);
    const cleared = data.count === 0;

    const blocks = cleared
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "✅ *All balances cleared.* Nothing outstanding.",
            },
          },
        ]
      : buildSlackBlocks(
          data,
          now - digestWindowMs(team.cadence),
          zd,
          String(args.teamId),
        );

    const res = await fetch("https://slack.com/api/chat.update", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${team.accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: args.channelId,
        ts: args.messageTs,
        text: cleared ? "All balances cleared" : headlineFor(data),
        blocks,
      }),
    });
    const json: any = await res.json();
    if (!json.ok) console.error("[collections] chat.update failed:", json.error);
    return { ok: !!json.ok };
  },
});

/**
 * Post a receipt in the digest's thread, with an undo.
 *
 * Two jobs at once. It's the audit trail — who cleared what, when, in the same
 * thread where the payment arrangements get written down. And it's where a
 * mis-tick gets put right, at the moment the person still remembers making it.
 *
 * In the thread rather than ephemeral: an ephemeral message vanishes on reload,
 * so the one person who could undo a mistake loses the ability the moment they
 * refresh Slack.
 */
export const postResolutionReceipt = internalAction({
  args: {
    teamId: v.id("teams"),
    channelId: v.string(),
    messageTs: v.string(),
    callIds: v.array(v.string()),
    resolution: v.union(v.literal("settled"), v.literal("written_off")),
    amount: v.number(),
    actorId: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    const team = await ctx.runQuery(
      internal.collectionsSlackActions.getTeamForInteraction,
      { teamId: args.teamId },
    );
    if (!team?.accessToken) return { ok: false };

    const who = args.actorId.startsWith("slack:")
      ? `<@${args.actorId.slice(6)}>`
      : "Someone";
    const verb = args.resolution === "settled" ? "collected" : "written off";
    const n = args.callIds.length;
    const summary =
      `${who} marked ${n} ${n === 1 ? "deal" : "deals"} as ${verb} — ` +
      `${money(args.amount)}.`;

    // Short keys because the whole thing has to fit in Slack's 2000-character
    // button value alongside the ids.
    const undoValue = JSON.stringify({
      t: String(args.teamId),
      c: args.callIds,
      ch: args.channelId,
      m: args.messageTs,
    });
    const canUndo = undoValue.length <= MAX_UNDO_VALUE_CHARS;

    const blocks: any[] = [
      { type: "section", text: { type: "mrkdwn", text: summary } },
    ];
    if (canUndo) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Undo" },
            action_id: ACTION_UNDO,
            value: undoValue,
          },
        ],
      });
    } else {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Too many at once to offer an undo here — reverse them from the dashboard.",
          },
        ],
      });
    }

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${team.accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: args.channelId,
        thread_ts: args.messageTs,
        text: summary,
        blocks,
      }),
    });
    const json: any = await res.json();
    if (!json.ok) console.error("[collections] receipt failed:", json.error);
    return { ok: !!json.ok };
  },
});

/** Put back what a click cleared. */
export const undoResolutions = internalAction({
  args: {
    teamId: v.id("teams"),
    callIds: v.array(v.string()),
    channelId: v.optional(v.string()),
    messageTs: v.optional(v.string()),
    responseUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ restored: number }> => {
    let restored = 0;
    for (const rawId of args.callIds) {
      const result = await ctx.runMutation(
        internal.collections.unresolveBalance,
        { callId: rawId as Id<"calls">, teamId: args.teamId },
      );
      if (result.success) restored++;
    }

    // Replace the receipt so the thread can't offer the same undo twice.
    if (args.responseUrl) {
      await fetch(args.responseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          replace_original: true,
          text: `↩️ Undone — ${restored} ${restored === 1 ? "deal is" : "deals are"} back on the list.`,
        }),
      }).catch((err) => console.error("[collections] undo reply failed:", err));
    }

    if (args.channelId && args.messageTs) {
      await ctx.scheduler.runAfter(
        0,
        internal.collectionsSlackActions.refreshDigestMessage,
        {
          teamId: args.teamId,
          channelId: args.channelId,
          messageTs: args.messageTs,
        },
      );
    }

    return { restored };
  },
});

/**
 * Apply what was ticked in the dialog.
 *
 * Every call id is re-checked against the team before it is touched. The ids
 * arrive inside a signature-verified Slack payload, but they are still values
 * that came back over the wire and a mismatch must not clear someone else's
 * money.
 */
export const applyDialogSubmission = internalAction({
  args: {
    teamId: v.id("teams"),
    callIds: v.array(v.string()),
    resolution: v.union(v.literal("settled"), v.literal("written_off")),
    actorId: v.string(),
    channelId: v.optional(v.string()),
    messageTs: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ applied: number; skipped: number }> => {
    // Read the amounts BEFORE clearing — once a balance is cleared it drops out
    // of the open list, and the receipt would have nothing to total.
    const before = (await ctx.runQuery(
      internal.collections.getTeamOutstandingBalances,
      { teamId: args.teamId },
    )) as OutstandingBalancesResult;
    const wanted = new Set(args.callIds.map(String));
    const amount = before.balances
      .filter((b) => wanted.has(String(b.callId)))
      .reduce((sum, b) => sum + b.balance, 0);

    let applied = 0;
    let skipped = 0;
    const cleared: string[] = [];

    for (const rawId of args.callIds) {
      const result = await ctx.runMutation(internal.collections.resolveBalance, {
        callId: rawId as Id<"calls">,
        resolution: args.resolution,
        actorId: args.actorId,
        teamId: args.teamId,
      });
      if (result.success) {
        applied++;
        cleared.push(rawId);
      } else {
        skipped++;
      }
    }

    if (args.channelId && args.messageTs) {
      await ctx.scheduler.runAfter(
        0,
        internal.collectionsSlackActions.refreshDigestMessage,
        {
          teamId: args.teamId,
          channelId: args.channelId,
          messageTs: args.messageTs,
        },
      );
      if (cleared.length > 0) {
        await ctx.scheduler.runAfter(
          0,
          internal.collectionsSlackActions.postResolutionReceipt,
          {
            teamId: args.teamId,
            channelId: args.channelId,
            messageTs: args.messageTs,
            callIds: cleared,
            resolution: args.resolution,
            amount,
            actorId: args.actorId,
          },
        );
      }
    }

    return { applied, skipped };
  },
});

void api;
