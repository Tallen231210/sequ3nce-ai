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
const CONCERN_CHARS = 320;
const SUMMARY_CHARS = 400;

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

/**
 * Turn "Closer" into the closer's actual name.
 *
 * Findings are stored with the generic role because that is what the
 * transcript's speaker labels carry, and storing a name would freeze it at the
 * moment of review. But a manager reading an alert wants "Nick", not "Closer" —
 * they know who Nick is, and a role tells them nothing they didn't already
 * assume. Resolved at render time so the stored review stays portable.
 */
function speakerName(speaker: string | undefined, call: AlertCall): string | undefined {
  if (!speaker) return undefined;
  const role = speaker.trim().toLowerCase();
  if (role === "closer") return call.closerName || "Closer";
  if (role === "prospect") return call.prospectName || "Prospect";
  return speaker;
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
  score: 5,
  summary:
    "Example alert — a real one names the call and links straight to the recording. Nothing was reviewed to produce this.",
  findings: [
    {
      rule: "Example rule: never promise a specific timeline.",
      quote: "you'll definitely have this sorted within about three weeks",
      concern:
        "A specific timeline was given as a commitment rather than a range. Worth checking against how the guarantee is worded.",
      timestamp: 742,
      speaker: "Closer",
    },
    {
      rule: "Example rule: correct a customer who assumes it's hands-off.",
      quote: "so you handle everything and i just show up — exactly, yeah",
      concern:
        "The customer described the programme as hands-off and it wasn't corrected. Uncorrected assumptions are usually the bigger risk.",
      timestamp: 1893,
      speaker: "Prospect",
    },
  ],
};

/** Stand-in details so the test post has the same shape as a real alert. */
const TEST_CALL: AlertCall = {
  prospectName: "Example Prospect",
  closerName: "Example Closer",
  duration: 2_040,
};

export interface AlertCall {
  prospectName?: string | null;
  closerName?: string | null;
  startedAt?: number | null;
  duration?: number | null;
  timezone?: string | null;
}

/**
 * Everything a manager needs to place the call without opening it.
 *
 * The first version was prospect and closer only, and read as thin in a real
 * channel — a manager seeing "Compliance — 3 things to look at" wants to know
 * whose call, which prospect, when, and how long before deciding whether to
 * spend five minutes on it.
 */
function subject(call: AlertCall): string {
  const parts = [call.prospectName || "Unknown prospect"];
  if (call.closerName) parts.push(call.closerName);

  if (typeof call.startedAt === "number") {
    try {
      parts.push(
        new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: call.timezone || "America/New_York",
        }).format(new Date(call.startedAt)),
      );
    } catch {
      // A bad timezone string must not cost us the whole alert.
    }
  }

  if (typeof call.duration === "number" && call.duration > 0) {
    parts.push(`${Math.round(call.duration / 60)} min`);
  }

  return parts.join(" · ");
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
      startedAt: call.startedAt ?? call.createdAt ?? null,
      duration: call.duration ?? null,
      timezone: (team as any).timezone ?? null,
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
  call: AlertCall,
  /** Null only when there is genuinely no call behind the message. */
  callId: string | null,
  /** Marked as a test in the footer; everything else renders identically. */
  isTest = false,
): unknown[] {
  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: headline(review.score, review.findings.length, isTest),
        emoji: true,
      },
    },
    // Which call, whose, when, how long. Then the one-sentence summary, which
    // was being generated and stored and never actually sent — a manager
    // should be able to decide whether to open the call without scrolling
    // through three quotes to work out what it's about.
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: subject(call) }],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: clip(review.summary, SUMMARY_CHARS) },
    },
    { type: "divider" },
  ];

  for (const f of review.findings.slice(0, FINDINGS_IN_MESSAGE)) {
    // Both of these are optional — speaker is omitted whenever the transcript
    // doesn't make it unambiguous, which is often. Build the line from what's
    // actually there rather than emitting a blank one.
    const meta = [
      f.speaker ? `*${clip(speakerName(f.speaker, call) ?? '', 40)}*` : null,
      typeof f.timestamp === "number" ? `_${mmss(f.timestamp)}_` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    // The concern was missing here, which is what made the message read as
    // thin: a quote and a rule without the reason they were put together
    // leaves the manager to work out for themselves why it was flagged. It's
    // the sentence that decides whether they open the call.
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          (meta ? `${meta}\n` : "") +
          `${blockquote(clip(f.quote, QUOTE_CHARS))}\n` +
          `*May touch:* ${clip(f.rule, RULE_CHARS)}\n` +
          `${clip(f.concern, CONCERN_CHARS)}`,
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
  call: AlertCall,
  callId: string | null,
  isTest = false,
): unknown {
  const fields = review.findings.slice(0, FINDINGS_IN_MESSAGE).map((f) => ({
    // Discord rejects an empty field name, and both parts are optional.
    name: clip(
      [
        speakerName(f.speaker, call) ?? null,
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
    description: `${subject(call)}\n\n${clip(review.summary, SUMMARY_CHARS)}`,
    color: 0xf59e0b,
    fields,
    url: callId ? `https://sequ3nce.ai/dashboard/calls/${callId}` : undefined,
    footer: {
      text: [
        more > 0 ? `${more} more on the call page` : null,
        isTest ? "test, sent from Settings → Compliance" : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    },
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
  call: AlertCall,
  callId: string | null,
  isTest = false,
): Promise<{ ok: boolean; error?: string; soft?: boolean }> {
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
      blocks: buildSlackBlocks(review, call, callId, isTest),
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
      embed: buildDiscordEmbed(review, call, callId, isTest),
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

    const call: AlertCall = {
      prospectName: info.prospectName,
      closerName: info.closerName,
      startedAt: info.startedAt,
      duration: info.duration,
      timezone: info.timezone,
    };

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
 * It reviews a REAL recent call against the team's own saved rules and posts
 * the actual result — same names, same quotes, same timestamps, same working
 * link to the recording. Only the footer says it was a test.
 *
 * It started as invented sample content, on the reasoning that a test
 * shouldn't put a real quote from a real rep into a channel before anyone had
 * agreed the rules were right. That was wrong in practice: what a customer sees
 * when they press the test button IS what they believe the feature is, and a
 * reduced version made a good feature look thin. If the rules aren't right yet,
 * seeing that on a real call is the useful outcome, not a hazard.
 *
 * Falls back to sample content only when there's nothing real to review — a
 * brand-new team with no calls yet, or no rules written.
 *
 * Deliberately does NOT require compliance to be switched on. The whole point
 * is proving the channel works during setup, before anything is enabled, so a
 * bot that was never invited to a private channel fails here rather than
 * silently weeks later on the first call that had something on it.
 */
export const sendComplianceTestAlert = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ sent: boolean; reason?: string }> => {
    const team = (await ctx.runQuery(
      internal.complianceNotifications.getTeamForCompliance,
      { teamId: args.teamId },
    )) as Doc<"teams"> | null;
    if (!team) return { sent: false, reason: "Team not found." };

    // Try for the real thing first.
    const rules = (team.complianceRules ?? "").trim();
    if (rules) {
      const callId = await ctx.runQuery(
        internal.compliance.findReviewableCallForTeam,
        { teamId: args.teamId },
      );
      if (callId) {
        const preview = await ctx.runAction(internal.compliance.previewReview, {
          callId,
          rules,
        });
        // A clean call has nothing to show, and a test that posts "0 things to
        // look at" teaches nothing about what a real alert looks like. Fall
        // through to the sample in that case.
        if (preview?.ok && preview.review?.findings?.length > 0) {
          const info = await ctx.runQuery(
            internal.complianceNotifications.getAlertContext,
            { callId },
          );
          if (info) {
            const result = await deliver(
              team,
              preview.review,
              {
                prospectName: info.prospectName,
                closerName: info.closerName,
                startedAt: info.startedAt,
                duration: info.duration,
                timezone: info.timezone,
              },
              String(callId),
              true,
            );
            return result.ok
              ? { sent: true }
              : { sent: false, reason: result.error ?? "Couldn't send." };
          }
        }
      }
    }

    const result = await deliver(team, TEST_REVIEW, TEST_CALL, null, true);
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
