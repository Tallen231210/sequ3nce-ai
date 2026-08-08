// ============================================================================
// Compliance alerts.
//
// One message per call, and only when there is something to look at. A clean
// call sends nothing — see the note in compliance.ts about alerts nobody reads.
//
// This is the only part of the feature that changes anyone's behaviour, because
// it's the only part that arrives without someone deciding to go and look.
// Compliance gets bought and then ignored until the day it matters.
//
// Managers only, by design and without a toggle. The channel is theirs and the
// closer is never in it. A score a rep can see turns "we're protecting you from
// saying something expensive" into "we're grading you", which is the same data
// and the opposite reception.
// ============================================================================

import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { postSlackMessage, postDiscordWebhook } from "./setterDataNotifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * How many findings go in the message itself.
 *
 * The message is a prompt to open the call, not a replacement for it. Three
 * gives a manager enough to judge whether it's worth their next five minutes;
 * past that it's a wall of text in a channel.
 */
const FINDINGS_IN_MESSAGE = 3;

const QUOTE_CHARS = 300;
const RULE_CHARS = 180;

function mmss(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/**
 * Slack renders `>` as a quote block, and a multi-line quote needs the marker
 * on every line or the rest escapes the block and reads as our words rather
 * than the transcript's.
 */
function blockquote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function headline(score: number, findingCount: number, isTest = false): string {
  if (isTest) return "Compliance — test message";
  const things = findingCount === 1 ? "1 thing" : `${findingCount} things`;
  return `Compliance — ${things} to look at (${score}/10)`;
}

/**
 * The message the test button sends.
 *
 * Deliberately made-up content rather than a real call's findings. The button
 * answers one question — does a message from us actually arrive in this
 * channel — and answering it should not put a real quote from a real rep into
 * a channel before anyone has agreed the rules are right. It's also
 * unmistakably not a real finding, which matters in a channel whose whole
 * purpose is that its contents are taken seriously.
 */
const TEST_REVIEW = {
  score: 6,
  summary:
    "This is a test. Real alerts look like this, name the call, and only arrive when something on it is worth a look — never for a clean call.",
  findings: [
    {
      rule: "Example: never promise a specific timeline.",
      quote: "you'll definitely have this sorted within about three weeks",
      concern:
        "An example finding, with the quote and the point in the recording so it can be checked in seconds.",
      timestamp: 742,
    },
  ],
};

function subject(call: {
  prospectName?: string | null;
  closerName?: string | null;
}): string {
  return [call.prospectName || "Unknown prospect", call.closerName || null]
    .filter(Boolean)
    .join(" · ");
}

// ----------------------------------------------------------------------------
// Context
// ----------------------------------------------------------------------------

/**
 * internalQuery on purpose — the team document carries `slackAccessToken`, and
 * Convex queries are callable by anyone who knows the deployment URL. This must
 * never become public.
 */
export const getAlertContext = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args): Promise<any> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;
    const team = await ctx.db.get(call.teamId);
    if (!team) return null;

    // Whose call this was comes off the call record, not the transcript. On
    // auto-joined calls that record has already been corrected by
    // callAttribution, which only moves a call when it's confident.
    const closer = call.closerId ? await ctx.db.get(call.closerId) : null;
    const closerName: string | null = closer?.name ?? null;

    return {
      team: team as Doc<"teams">,
      prospectName: call.prospectName ?? null,
      closerName,
    };
  },
});

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------

interface Finding {
  rule: string;
  quote: string;
  concern: string;
  timestamp?: number;
  speaker?: string;
}

function buildSlackBlocks(
  review: { score: number; summary: string; findings: Finding[] },
  call: { prospectName?: string | null; closerName?: string | null },
  /** Null for a test post — there is no real call behind it to link to. */
  callId: string | null,
): unknown[] {
  const isTest = callId === null;
  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: headline(review.score, review.findings.length, isTest),
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: isTest ? review.summary : subject(call) },
      ],
    },
  ];

  for (const f of review.findings.slice(0, FINDINGS_IN_MESSAGE)) {
    // Both of these are optional — speaker is omitted whenever the transcript
    // doesn't make it unambiguous, which is often. Build the line from what's
    // actually there rather than emitting a blank one.
    const meta = [
      f.speaker ? `*${clip(f.speaker, 40)}*` : null,
      typeof f.timestamp === "number" ? `_${mmss(f.timestamp)}_` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          (meta ? `${meta}\n` : "") +
          `${blockquote(clip(f.quote, QUOTE_CHARS))}\n` +
          `May touch: ${clip(f.rule, RULE_CHARS)}`,
      },
    });
  }

  const more = review.findings.length - FINDINGS_IN_MESSAGE;
  const suffix = more > 0 ? `${more} more · ` : "";
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: isTest
          ? "Sent from Settings → Compliance. Nothing was reviewed to produce this."
          : `${suffix}<https://sequ3nce.ai/dashboard/calls/${callId}|Open the call →>`,
      },
    ],
  });

  return blocks;
}

function buildDiscordEmbed(
  review: { score: number; summary: string; findings: Finding[] },
  call: { prospectName?: string | null; closerName?: string | null },
  callId: string | null,
): unknown {
  const isTest = callId === null;
  const fields = review.findings.slice(0, FINDINGS_IN_MESSAGE).map((f) => ({
    // Discord rejects an empty field name, and both parts are optional.
    name: clip(
      [
        f.speaker ?? null,
        typeof f.timestamp === "number" ? `(${mmss(f.timestamp)})` : null,
      ]
        .filter(Boolean)
        .join(" ") || "Flagged",
      250,
    ),
    value: clip(
      `"${clip(f.quote, QUOTE_CHARS)}"\nMay touch: ${clip(f.rule, RULE_CHARS)}`,
      1000,
    ),
    inline: false,
  }));

  const more = review.findings.length - FINDINGS_IN_MESSAGE;

  return {
    title: headline(review.score, review.findings.length, isTest),
    description: isTest ? review.summary : subject(call),
    color: 0xf59e0b,
    fields,
    url: isTest ? undefined : `https://sequ3nce.ai/dashboard/calls/${callId}`,
    footer: isTest
      ? { text: "Sent from Settings → Compliance" }
      : more > 0
        ? { text: `${more} more on the call page` }
        : undefined,
  };
}

// ----------------------------------------------------------------------------
// Send
// ----------------------------------------------------------------------------

/**
 * Put a message in the team's compliance channel.
 *
 * Shared by the real alert and the test button so there is exactly one piece of
 * code that decides where a compliance message goes. A test that took a
 * different route would prove nothing about the route the real one takes.
 *
 * `soft` distinguishes "this team isn't set up" — expected, not worth paging
 * anyone about — from "Slack rejected us", which is.
 */
async function deliver(
  team: Doc<"teams">,
  review: { score: number; summary: string; findings: Finding[] },
  call: { prospectName?: string | null; closerName?: string | null },
  callId: string | null,
): Promise<{ ok: boolean; error?: string; soft?: boolean }> {
  const isTest = callId === null;
  const fallback = isTest
    ? headline(review.score, review.findings.length, true)
    : `${headline(review.score, review.findings.length)} — ${subject(call)}`;

  if (team.complianceChannel === "slack") {
    // No fallback to the team's general channel. Compliance findings go to the
    // channel they chose or nowhere — spilling them into the room the closers
    // are in is the one unrecoverable mistake here.
    const channelId = team.complianceSlackChannelId;
    if (!team.slackAccessToken || !channelId) {
      return { ok: false, soft: true, error: "Slack isn't connected, or no channel is picked." };
    }
    const result = await postSlackMessage({
      accessToken: team.slackAccessToken,
      channelId,
      text: fallback,
      blocks: buildSlackBlocks(review, call, callId),
    });
    return result.ok
      ? { ok: true }
      : { ok: false, error: `Slack post failed: ${result.error}` };
  }

  if (team.complianceChannel === "discord") {
    const webhookUrl = team.complianceDiscordWebhookUrl;
    if (!webhookUrl) {
      return { ok: false, soft: true, error: "No Discord webhook is set." };
    }
    const result = await postDiscordWebhook({
      webhookUrl,
      content: fallback,
      embed: buildDiscordEmbed(review, call, callId),
    });
    return result.ok
      ? { ok: true }
      : { ok: false, error: `Discord post failed: ${result.error}` };
  }

  return { ok: false, soft: true, error: "No channel has been chosen yet." };
}

/**
 * Post one call's findings.
 *
 * Scheduled from `compliance.reviewCall` after a review is stored, and only
 * when that review found something. It re-reads nothing about whether the
 * findings are worth sending — that decision belongs upstream, where the review
 * actually happened.
 */
export const sendComplianceAlert = internalAction({
  args: { callId: v.id("calls"), review: v.any() },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const review = args.review as {
      score: number;
      summary: string;
      findings: Finding[];
    };
    if (!review?.findings?.length) return { sent: false, reason: "no findings" };

    const info = await ctx.runQuery(internal.complianceNotifications.getAlertContext, {
      callId: args.callId,
    });
    if (!info) return { sent: false, reason: "call or team not found" };

    const team = info.team as Doc<"teams">;
    const channel = team.complianceChannel;
    if (channel !== "slack" && channel !== "discord") {
      // Reviews still get stored and still show on the call page. A team that
      // hasn't picked a channel gets the record without the interruption.
      return { sent: false, reason: "no compliance channel configured" };
    }

    const call = { prospectName: info.prospectName, closerName: info.closerName };

    try {
      const result = await deliver(team, review, call, String(args.callId));
      if (!result.ok) {
        if (result.soft) return { sent: false, reason: result.error };
        throw new Error(result.error);
      }
    } catch (err) {
      // A compliance channel that goes quiet looks exactly like a run of clean
      // calls, which is the most dangerous way for this to fail. Page someone.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Compliance] Alert failed for call ${args.callId}:`, message);
      await ctx.runAction(internal.lib.sentry.captureFromIsolate, {
        message: `Compliance alert failed to send: ${message}`,
        feature: "compliance",
        integration: channel,
        extra: { teamId: String(team._id), callId: String(args.callId) },
      });
      return { sent: false, reason: message };
    }

    return { sent: true };
  },
});

/**
 * Post the test message.
 *
 * Deliberately does NOT require compliance to be switched on — the whole point
 * is proving the channel works during setup, before anything is enabled. It
 * goes down the same `deliver` path as a real alert, so a bot that hasn't been
 * invited to a private channel fails here rather than silently, weeks later,
 * on the first call that actually had something on it.
 */
export const sendComplianceTestAlert = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const team = (await ctx.runQuery(
      internal.complianceNotifications.getTeamForCompliance,
      { teamId: args.teamId },
    )) as Doc<"teams"> | null;
    if (!team) return { sent: false, reason: "Team not found." };

    const result = await deliver(
      team,
      TEST_REVIEW,
      { prospectName: null, closerName: null },
      null,
    );
    return result.ok
      ? { sent: true }
      : { sent: false, reason: result.error ?? "Couldn't send." };
  },
});

/** internalQuery — the team document carries `slackAccessToken`. */
export const getTeamForCompliance = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => await ctx.db.get(args.teamId),
});
