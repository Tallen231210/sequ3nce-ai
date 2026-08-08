// ============================================================================
// Compliance review.
//
// A business writes a paragraph saying what's fine to say on their calls and
// what isn't. We read the transcript against it and report what may conflict.
//
// The rejected version, for anyone tempted to build it: source the actual FTC
// guidance for every industry a customer might be in. It never finishes, the
// documents change constantly, and it still wouldn't say what THIS business
// cares about. Their own paragraph is simpler and more accurate.
//
// THREE RULES THIS IS BUILT ON, all of which are about not causing harm:
//
// 1. It reviews the CONVERSATION, not the person. Partly because transcripts
//    sometimes swap closer and prospect, and flagging a rep for the prospect's
//    words would destroy trust in this instantly. But mostly because it's more
//    correct: if a prospect says "so this is guaranteed income, right?" and the
//    closer doesn't correct them, that is a problem too — arguably a worse one.
//
// 2. It never asserts a violation. Findings say what was said and which rule it
//    may touch, with a quote and a timestamp so a human decides in ten seconds.
//    If we tell a customer a call is "9/10 compliant" and they later face a
//    complaint, our number becomes part of their story.
//
// 3. It is quiet when there is nothing to say. An alert that fires on every
//    call is one nobody reads, including on the day it matters.
// ============================================================================

import { v } from "convex/values";
import Anthropic from "@anthropic-ai/sdk";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/* eslint-disable @typescript-eslint/no-explicit-any */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Below this there isn't enough conversation to judge.
 *
 * Matches the existing analysis guard. Auto-join means no-shows now produce
 * calls — one recent example was 101 characters of a voicemail greeting — and
 * scoring those would fill the channel with findings about nothing.
 */
const MIN_TRANSCRIPT_CHARS = 200;

const REVIEW_PROMPT = `You review sales call transcripts against a specific company's own compliance rules.

You will be given: the company's rules, in their own words, and a call transcript.

Report anything in the conversation that MAY conflict with those rules.

How to judge:

- Review the WHOLE conversation, not just the salesperson. If a customer states something incorrect — a guaranteed return, a medical claim, a promise the company can't keep — and it is left uncorrected, that is worth reporting. Uncorrected claims are often the real risk.
- Speaker labels in transcripts are sometimes wrong. Never say who said something unless the transcript makes it unambiguous. When unsure, report what was said without attributing it.
- Quote exactly. A reviewer must be able to find the moment and decide for themselves in seconds.
- Report only what plausibly touches THEIR stated rules. Do not invent general legal advice, and do not import rules they did not write.
- If nothing conflicts, say so and return an empty findings list. That is a good outcome, not a failure to find something.

What NOT to report. These three make the difference between a list somebody reads and one they stop opening:

- ONE FINDING PER MOMENT. If the same passage touches two or three of their rules, report it once, under the rule it conflicts with most clearly. The same quote appearing twice under different headings makes a call look worse than it is and wastes the reviewer's time.
- EVERY FINDING MUST QUOTE WORDS THAT WERE ACTUALLY SPOKEN. Do not report a question the salesperson didn't ask, a condition they didn't spell out, or a topic that never came up. The single exception is an incorrect claim left uncorrected — and that still has a quote: the claim itself.
- A CUSTOMER DESCRIBING THEIR OWN SITUATION, GOALS OR PREFERENCES IS NOT A CONFLICT. Rules about who a company should or shouldn't sell to are only touched when the conversation shows the problem happening, not when the customer merely mentions something adjacent to one.

Scoring, 1-10. Anchor it:
- 10: nothing in the conversation touches their rules.
- 7-9: minor or ambiguous — loose phrasing, something worth a word in coaching.
- 4-6: at least one clear conflict with a stated rule.
- 1-3: repeated or serious conflicts, or a claim that could plainly mislead a customer.

Never state that something IS a violation. Phrase concerns as what a reviewer should look at and why it might matter.

Respond with ONLY valid JSON:
{
  "score": 8,
  "summary": "One sentence a manager can read without opening the call.",
  "findings": [
    {
      "rule": "the rule of theirs this may touch, in their words",
      "quote": "exact words from the transcript",
      "timestamp": 412,
      "speaker": "only if unambiguous, otherwise omit",
      "concern": "why this is worth a look, phrased as a question for a human"
    }
  ]
}`;

export const getReviewContext = internalQuery({
  args: { callId: v.id("calls") },
  handler: async (ctx, args): Promise<any> => {
    const call = await ctx.db.get(args.callId);
    if (!call) return null;
    const team = await ctx.db.get(call.teamId);

    const content = await ctx.db
      .query("callContent")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .first();

    return {
      teamId: String(call.teamId),
      enabled: team?.complianceEnabled === true,
      rules: team?.complianceRules ?? "",
      transcript: content?.transcriptText ?? "",
      alreadyReviewed: !!content?.complianceReview,
      // A team meeting is not a sales call and shouldn't be judged as one.
      classifiedAs: call.classifiedAs ?? null,
      prospectName: call.prospectName ?? null,
    };
  },
});

export const saveReview = internalMutation({
  args: { callId: v.id("calls"), teamId: v.id("teams"), review: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("callContent")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { complianceReview: args.review });
    } else {
      await ctx.db.insert("callContent", {
        callId: args.callId,
        teamId: args.teamId,
        complianceReview: args.review,
      });
    }

    // Denormalised onto the call so the Completed Calls list can sort and filter
    // without opening callContent for all 100 rows. See the note in schema.ts.
    await ctx.db.patch(args.callId, {
      complianceScore: args.review.score,
      complianceFindingCount: args.review.findings?.length ?? 0,
    });
  },
});

/**
 * Review one call.
 *
 * `force` re-runs a call that already has a review — the "re-run this one"
 * button for when a manager has edited the rules and wants an old call looked
 * at again. Editing the rules deliberately does NOT re-score history on its
 * own: a compliance record that changes retroactively is worse than one that is
 * merely incomplete.
 */
export const reviewCall = internalAction({
  args: {
    callId: v.id("calls"),
    force: v.optional(v.boolean()),
    /**
     * The caller's copy of the transcript, when it has one.
     *
     * `generateCallAnalysis` is handed the transcript directly and runs before
     * some paths have written `callContent`. Taking it as an argument removes
     * the ordering question entirely rather than betting on which write lands
     * first.
     */
    transcript: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    const info = await ctx.runQuery(internal.compliance.getReviewContext, {
      callId: args.callId,
    });
    if (!info) return { ok: false, reason: "call not found" };
    if (!info.enabled) return { ok: false, reason: "compliance is off for this team" };
    if (!info.rules.trim()) {
      return { ok: false, reason: "no rules written yet — nothing to judge against" };
    }
    if (info.classifiedAs === "internal") {
      return { ok: false, reason: "internal meeting, not a sales call" };
    }
    if (info.alreadyReviewed && !args.force) {
      // Scored once, stored once. An LLM asked the same question twice gives
      // two answers, and a compliance number that drifts is worse than useless.
      return { ok: false, reason: "already reviewed" };
    }
    const transcript = (args.transcript ?? info.transcript ?? "").trim();
    if (transcript.length < MIN_TRANSCRIPT_CHARS) {
      return { ok: false, reason: "transcript too short to judge" };
    }

    try {
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: REVIEW_PROMPT,
        messages: [
          {
            role: "user",
            content:
              `Our compliance rules:\n\n${info.rules}\n\n` +
              `---\n\nCall transcript:\n\n${transcript}`,
          },
        ],
      });

      const block = message.content?.[0];
      const raw = block && block.type === "text" ? block.text.trim() : "";
      if (!raw) return { ok: false, reason: "empty response" };

      const json = raw
        .replace(/^\s*```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      const parsed = JSON.parse(json);

      if (typeof parsed.score !== "number" || !Array.isArray(parsed.findings)) {
        console.error(`[Compliance] Malformed response for call ${args.callId}`);
        return { ok: false, reason: "malformed response" };
      }

      const review = {
        score: Math.max(1, Math.min(10, Math.round(parsed.score))),
        summary: String(parsed.summary ?? "").slice(0, 500),
        findings: parsed.findings.slice(0, 20).map((f: any) => ({
          rule: String(f.rule ?? "").slice(0, 300),
          quote: String(f.quote ?? "").slice(0, 1000),
          concern: String(f.concern ?? "").slice(0, 500),
          ...(typeof f.timestamp === "number" ? { timestamp: f.timestamp } : {}),
          ...(f.speaker ? { speaker: String(f.speaker).slice(0, 100) } : {}),
        })),
        // Kept so a score stays explicable after the rules are edited.
        rulesUsed: info.rules,
        reviewedAt: Date.now(),
      };

      await ctx.runMutation(internal.compliance.saveReview, {
        callId: args.callId,
        teamId: info.teamId as Id<"teams">,
        review,
      });

      // Silent when clean. A channel that only ever speaks up when something is
      // worth reading is one people still open in six months.
      if (review.findings.length > 0) {
        await ctx.scheduler.runAfter(
          0,
          internal.complianceNotifications.sendComplianceAlert,
          { callId: args.callId, review },
        );
      }

      return { ok: true, review };
    } catch (error) {
      console.error(`[Compliance] Review failed for call ${args.callId}:`, error);
      return { ok: false, reason: String(error) };
    }
  },
});

/**
 * Try it on a real transcript without storing anything.
 *
 * The point of this is to see whether the rules a business wrote actually
 * produce sensible findings BEFORE it starts posting into their channel. Rules
 * that are too vague produce noise; too specific and it misses things. That is
 * a conversation to have with a customer, and this is what makes it concrete.
 */
export const previewReview = internalAction({
  args: { callId: v.id("calls"), rules: v.string() },
  handler: async (ctx, args): Promise<any> => {
    const info = await ctx.runQuery(internal.compliance.getReviewContext, {
      callId: args.callId,
    });
    if (!info) return { ok: false, reason: "call not found" };
    if ((info.transcript ?? "").trim().length < MIN_TRANSCRIPT_CHARS) {
      return {
        ok: false,
        reason: `transcript is ${info.transcript.length} chars — too short to judge`,
      };
    }

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: REVIEW_PROMPT,
      messages: [
        {
          role: "user",
          content:
            `Our compliance rules:\n\n${args.rules}\n\n` +
            `---\n\nCall transcript:\n\n${info.transcript}`,
        },
      ],
    });

    const block = message.content?.[0];
    const raw = block && block.type === "text" ? block.text.trim() : "";
    const json = raw
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    try {
      return { ok: true, transcriptChars: info.transcript.length, review: JSON.parse(json) };
    } catch {
      return { ok: false, reason: "could not parse", raw: raw.slice(0, 600) };
    }
  },
});
