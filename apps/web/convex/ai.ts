// AI-powered features using Claude
"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const REDACTION_PROMPT = `You are a compliance redaction engine for sales call transcripts. Your job is to replace sensitive information with [REDACTED] while preserving the conversation flow.

REDACT (replace with [REDACTED]):
- Prospect/client names (first, last, full)
- Credit card numbers, bank account info, SSNs
- Company names and business entities
- Specific dollar amounts, deal values, pricing ("$5,000" → "[REDACTED]")
- Product/service names being sold
- Email addresses, phone numbers, physical addresses
- Personal details (age, family info, medical info, employment history)

PRESERVE (do NOT redact):
- The closer/salesperson's name
- Generic sales language ("let me walk you through", "does that make sense")
- Time references ("next Tuesday", "in 30 days")
- Generic roles ("the prospect", "my manager")
- Conversational fillers and greetings

Return a JSON array where each element has: { "text": "redacted text here" }
The array must have exactly the same number of elements as the input, in the same order.
Only return the JSON array, nothing else.`;

const SUMMARY_PROMPT = `You are analyzing a completed sales call transcript to create a bullet-point summary for a sales manager.

Generate exactly these bullet points (use • character):

• Topic: [One sentence - what product/service was discussed]
• Pain Points: [One sentence - prospect's main needs or frustrations]
• Objections: [One sentence - what actually stood between them and yes. A stated objection is often cover for the real one, and a good salesperson probes past it — if it moved, say where it ended up rather than where it started: "opened on needing to speak to his wife, which came down to the price". Or "None raised"]
• Outcome: [One sentence - result and any next steps]
• Sentiment: [One word + brief explanation - e.g. "Interested - asked follow-up questions about pricing"]

• Buyer Language: [Yes/No] - [Brief explanation. Yes examples: "I'm ready", "let's do it", "how do I sign up". No examples: "I need to think about it", "not sure", "maybe later"]
• Why Purchased/Didn't Purchase: [One sentence - the key factor that led to the outcome]
• Price Pitched: [Dollar amount mentioned, e.g. "$5,000" or "Not mentioned"]

RULES:
- Each bullet point should be ONE concise sentence
- Use plain language, no sales jargon
- If info isn't clear from transcript, write "Unclear from transcript"
- Don't include timestamps or speaker labels
- Return ONLY the bullet points, nothing else
- Use the exact format shown above with • character`;

// Generate a summary for a completed call (internal only — triggered by backend scheduling)
export const generateCallSummary = internalAction({
  args: {
    callId: v.id("calls"),
    transcript: v.string(),
    outcome: v.optional(v.string()),
    prospectName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { callId, transcript, outcome, prospectName } = args;

    // Skip if transcript is too short
    if (!transcript || transcript.trim().length < 100) {
      const briefSummary = outcome
        ? `Brief call with ${prospectName || "prospect"} - ${formatOutcome(outcome)}.`
        : `Brief call with ${prospectName || "prospect"} - no substantial conversation recorded.`;

      await ctx.runMutation(internal.calls.updateCallSummary, {
        callId,
        summary: briefSummary,
      });
      return briefSummary;
    }

    try {
      // Build context for Claude
      let userMessage = `Here is the sales call transcript:\n\n${transcript}`;

      if (outcome) {
        userMessage += `\n\nCall outcome: ${formatOutcome(outcome)}`;
      }

      if (prospectName) {
        userMessage += `\nProspect name: ${prospectName}`;
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system: SUMMARY_PROMPT,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      // Extract the summary text
      const summary =
        message.content[0].type === "text" ? message.content[0].text.trim() : "";

      if (summary) {
        // Save the summary to the call record
        await ctx.runMutation(internal.calls.updateCallSummary, {
          callId,
          summary,
        });

        // Smart notification: check if closer already submitted questionnaire
        const call = await ctx.runQuery(api.calls.getCallById, { callId: callId as string }) as {
          outcome?: string;
        } | null;

        if (call?.outcome) {
          // Closer already submitted — fire notification immediately with full data
          await ctx.runAction(internal.slack.sendCallCompletedNotification, {
            callId,
          });
        } else {
          // Closer hasn't submitted yet — hold the summary for five minutes.
          // If they submit inside that window calls.ts cancels this job and
          // fires immediately with the full data, so a prompt closer costs
          // nobody any delay. The wait exists so "no post-call form" means
          // they moved on rather than hadn't got to it yet — at the old ninety
          // seconds that flag would have fired on nearly every call.
          await ctx.runMutation(internal.slack.scheduleCallCompletedNotification, {
            callId,
            delayMs: 300_000,
          });
        }
      }

      return summary;
    } catch (error) {
      console.error("Failed to generate call summary:", error);
      // Don't throw - we don't want to block call completion
      return null;
    }
  },
});

// Helper to format outcome for display
function formatOutcome(outcome: string): string {
  switch (outcome) {
    case "closed":
      return "Deal closed";
    case "follow_up":
      return "Follow-up scheduled";
    case "lost":
      return "Not closed";
    case "no_show":
      return "No-show";
    default:
      return outcome;
  }
}

// Live summary prompt for mid-call summaries (30/60 min)
const LIVE_SUMMARY_PROMPT = `You are analyzing an ongoing sales call transcript to create a brief mid-call summary for a sales manager who may need to check in.

Generate exactly these bullet points (use • character):

• Topic: [One sentence - what product/service is being discussed]
• Pain Points: [One sentence - prospect's main needs or frustrations mentioned so far]
• Objections: [One sentence - any objections raised, or "None yet"]
• Sentiment: [One word + brief explanation - e.g. "Interested - asking detailed questions about pricing"]

RULES:
- Keep it brief - this is a mid-call check-in
- Each bullet point should be ONE concise sentence
- Use plain language, no sales jargon
- If info isn't clear from transcript, write "Not yet discussed"
- Don't include timestamps or speaker labels
- Return ONLY the bullet points, nothing else
- Use the exact format shown above with • character`;

/**
 * Generate a live summary for an ongoing call (for 30/60 min Slack notifications)
 */
export const generateLiveSummary = internalAction({
  args: {
    callId: v.id("calls"),
    transcript: v.string(),
    prospectName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { callId, transcript, prospectName } = args;

    // Skip if transcript is too short
    if (!transcript || transcript.trim().length < 200) {
      return "Call in progress - not enough conversation yet to summarize.";
    }

    try {
      // Build context for Claude
      let userMessage = `Here is the ongoing sales call transcript (call still in progress):\n\n${transcript}`;

      if (prospectName) {
        userMessage += `\n\nProspect name: ${prospectName}`;
      }

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: LIVE_SUMMARY_PROMPT,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      // Extract the summary text
      const summary =
        message.content[0].type === "text" ? message.content[0].text.trim() : "";

      return summary || "Unable to generate summary at this time.";
    } catch (error) {
      console.error("Failed to generate live summary:", error);
      return "Unable to generate summary at this time.";
    }
  },
});

// Deep analysis prompt for post-call chapter generation + sales process scoring
const ANALYSIS_PROMPT = `You are a senior sales call analyst. Analyze this completed sales call transcript and produce a structured JSON analysis.

Your analysis must include:

1. **Chapters** — Break the call into 3-8 chronological sections (like YouTube chapters). Each chapter should represent a distinct phase or topic shift in the conversation. Estimate timestamps in seconds from the start of the call based on the transcript flow.

2. **Sales Process Analysis** — Score each of the 5 sales process dimensions as "strong", "adequate", or "weak" with a 1-2 sentence explanation:
   - **Opening**: Did the closer build rapport, set an agenda, and establish authority?
   - **Discovery**: Did the closer ask deep questions to uncover pain points, goals, and urgency?
   - **Presentation**: Was the solution presented in a way that connected to the prospect's specific needs?
   - **Objection Handling**: Were objections addressed effectively, or deflected/ignored?
   - **Closing**: Was there a clear ask? Did the closer guide the prospect toward a decision?

3. **Call Sequence** — A brief ordered list of what happened in the call (e.g. "Small talk → Discovery questions → Product demo → Price discussion → Objection handling → Close attempt").

Return ONLY valid JSON in this exact format, nothing else:
{
  "chapters": [
    { "title": "Chapter Title", "startTime": 0, "endTime": 120, "summary": "Brief description of what happened" }
  ],
  "analysis": {
    "opening": { "score": "strong|adequate|weak", "summary": "1-2 sentences" },
    "discovery": { "score": "strong|adequate|weak", "summary": "1-2 sentences" },
    "presentation": { "score": "strong|adequate|weak", "summary": "1-2 sentences" },
    "objectionHandling": { "score": "strong|adequate|weak", "summary": "1-2 sentences" },
    "closing": { "score": "strong|adequate|weak", "summary": "1-2 sentences" }
  },
  "callSequence": [
    { "phase": "Phase Name", "description": "Brief description" }
  ]
}

RULES:
- Chapters must cover the entire call chronologically with no gaps
- Estimate timestamps proportionally based on transcript length and conversation flow
- Be honest in scoring — don't inflate scores
- Keep chapter titles short (3-6 words)
- Keep chapter summaries to 1-2 sentences
- Return ONLY the JSON object, no markdown code blocks or other text`;

/**
 * Generate deep call analysis with chapters and sales process scoring.
 * Uses Claude Haiku for cost efficiency (~$0.01/call).
 * Triggered automatically after call summary generation.
 */
export const generateCallAnalysis = internalAction({
  args: {
    callId: v.id("calls"),
    transcript: v.string(),
    outcome: v.optional(v.string()),
    prospectName: v.optional(v.string()),
    duration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { callId, transcript, outcome, prospectName, duration } = args;

    // Skip if transcript is too short for meaningful analysis
    if (!transcript || transcript.trim().length < 200) {
      console.log(`[CallAnalysis] Skipping analysis for call ${callId} — transcript too short`);
      return null;
    }

    // Compliance review is scheduled here rather than at the end, and as its own
    // action rather than inline. Every path that produces a transcript — bot,
    // Fathom, desktop, speaker re-verification — funnels through this function,
    // so it's the one hook that covers all of them. Scheduling it up front means
    // a malformed analysis response below doesn't quietly take compliance with
    // it; the two are independent judgements about the same call.
    //
    // `reviewCall` decides for itself whether the team has it switched on.
    await ctx.scheduler.runAfter(0, internal.compliance.reviewCall, {
      callId,
      transcript,
    });

    // Read the post-call numbers off the transcript, for teams that have asked
    // for it. Same hook, same reasoning: every transcript source funnels
    // through this function, and scheduling it as its own action means a
    // malformed analysis below can't take it down.
    //
    // `extractCall` decides for itself whether the team is switched on, whether
    // a human already answered, and whether the call is worth reading.
    await ctx.scheduler.runAfter(0, internal.callExtractionRun.extractCall, {
      callId,
      transcript,
    });

    try {
      let userMessage = `Here is the completed sales call transcript:\n\n${transcript}`;

      if (outcome) {
        userMessage += `\n\nCall outcome: ${formatOutcome(outcome)}`;
      }
      if (prospectName) {
        userMessage += `\nProspect name: ${prospectName}`;
      }
      if (duration) {
        userMessage += `\nCall duration: ${Math.round(duration / 60)} minutes`;
      }

      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: ANALYSIS_PROMPT,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      });

      const firstBlock = message.content?.[0];
      const rawText =
        firstBlock && firstBlock.type === "text" ? firstBlock.text.trim() : "";

      if (!rawText) {
        console.error(`[CallAnalysis] Empty response for call ${callId}`);
        return null;
      }

      // Parse JSON — strip markdown code blocks if present
      const jsonStr = rawText.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      const parsed = JSON.parse(jsonStr);

      // Validate required top-level fields
      if (!Array.isArray(parsed.chapters) || !parsed.analysis || !Array.isArray(parsed.callSequence)) {
        console.error(`[CallAnalysis] Missing or malformed required fields for call ${callId}`);
        return null;
      }

      // Validate analysis dimensions exist with expected shape
      const dims = ["opening", "discovery", "presentation", "objectionHandling", "closing"] as const;
      for (const dim of dims) {
        const d = parsed.analysis[dim];
        if (!d || typeof d.score !== "string" || typeof d.summary !== "string") {
          console.error(`[CallAnalysis] Missing or malformed analysis dimension '${dim}' for call ${callId}`);
          return null;
        }
      }

      // Validate chapters have required fields
      for (const ch of parsed.chapters) {
        if (typeof ch.title !== "string" || typeof ch.startTime !== "number" || typeof ch.endTime !== "number") {
          console.error(`[CallAnalysis] Malformed chapter for call ${callId}:`, ch);
          return null;
        }
      }

      const callAnalysis = {
        chapters: parsed.chapters.map((ch: { title: string; startTime: number; endTime: number; summary?: string }) => ({
          title: ch.title,
          startTime: ch.startTime,
          endTime: ch.endTime,
          summary: ch.summary || "",
        })),
        analysis: {
          opening: { score: parsed.analysis.opening.score, summary: parsed.analysis.opening.summary },
          discovery: { score: parsed.analysis.discovery.score, summary: parsed.analysis.discovery.summary },
          presentation: { score: parsed.analysis.presentation.score, summary: parsed.analysis.presentation.summary },
          objectionHandling: { score: parsed.analysis.objectionHandling.score, summary: parsed.analysis.objectionHandling.summary },
          closing: { score: parsed.analysis.closing.score, summary: parsed.analysis.closing.summary },
        },
        callSequence: parsed.callSequence.map((s: { phase: string; description: string }) => ({
          phase: s.phase,
          description: s.description,
        })),
        analyzedAt: Date.now(),
      };

      await ctx.runMutation(internal.calls.updateCallAnalysis, {
        callId,
        callAnalysis,
      });

      console.log(`[CallAnalysis] Analysis saved for call ${callId} — ${parsed.chapters.length} chapters`);
      return callAnalysis;
    } catch (error) {
      console.error(`[CallAnalysis] Failed for call ${callId}:`, error);
      return null;
    }
  },
});

// ──────────────────────────────────────────────
// TRANSCRIPT REDACTION (for compliance-safe share links)
// ──────────────────────────────────────────────

export const redactTranscript = internalAction({
  args: {
    segments: v.array(v.object({
      speaker: v.string(),
      text: v.string(),
      timestamp: v.number(),
    })),
  },
  handler: async (_ctx, args) => {
    const { segments } = args;

    if (segments.length === 0) return segments;

    // Build numbered input for Claude (just the text portions)
    const numberedTexts = segments.map((s, i) => `${i}: ${s.text}`).join("\n");

    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: `Here are ${segments.length} transcript segments to redact:\n\n${numberedTexts}`,
          },
        ],
        system: REDACTION_PROMPT,
      });

      const content = response.content[0];
      if (content.type !== "text") {
        console.error("[Redaction] Unexpected response type:", content.type);
        return segments;
      }

      const parsed = JSON.parse(content.text);
      if (!Array.isArray(parsed) || parsed.length !== segments.length) {
        console.error(`[Redaction] Array length mismatch: got ${parsed.length}, expected ${segments.length}`);
        return segments;
      }

      // Merge: use AI-provided text but preserve original speaker + timestamp
      return segments.map((s, i) => ({
        speaker: s.speaker,
        text: typeof parsed[i]?.text === "string" ? parsed[i].text : s.text,
        timestamp: s.timestamp,
      }));
    } catch (error) {
      console.error("[Redaction] Failed, returning original transcript:", error);
      return segments;
    }
  },
});

// ============================================================================
// SETTER CALL TRANSCRIPTS — fetched from GHL's transcription endpoint and
// summarized for the Setter Data dashboard's lead + setter drilldowns.
// ============================================================================

// Prompt tuned for QUALIFYING calls (setter ↔ prospect), not closer sales
// calls. The voice differs: setters are screening fit + scheduling, not
// closing a deal. Manager wants to see "did the prospect qualify, what
// did they say they care about, what's the next step?" — not the full
// 8-bullet sales analysis we do for closer calls.
const SETTER_SUMMARY_PROMPT = `You are summarizing a brief qualifying call between a sales setter and a prospect, for a sales manager reviewing setter activity.

Generate exactly these bullet points (use • character):

• Outcome: [One sentence — did the call connect? did the setter book an appointment? was it a voicemail? was it disqualified?]
• Prospect interest: [One sentence — gauge from prospect's tone and what they said. Use plain language like "Highly interested", "Curious but cautious", "Not interested", "No conversation (voicemail)"]
• Key objection: [One sentence — the main pushback or hesitation the prospect raised, or "None raised"]
• Next step: [One sentence — what was agreed at the end. e.g. "Booked appointment for Tuesday", "Setter to follow up next week", "Prospect agreed to receive case study email", "No next step — closed out"]

RULES:
- Each bullet should be ONE concise sentence.
- If the call was a voicemail (typically very short, only one speaker, no conversation), say so clearly in the Outcome and leave the other bullets as "N/A — voicemail".
- Plain language, no sales jargon.
- If something isn't clear from the transcript, write "Unclear from transcript".
- Return ONLY the four bullets, nothing else.`;

interface GhlTranscriptWord {
  word?: string;
  speaker?: number;
  start?: number;
  end?: number;
  confidence?: number;
  speakerConfidence?: number;
}

interface GhlTranscriptSentence {
  speaker?: number;
  mediaChannel?: number;
  sentenceIndex?: number;
  transcript?: string;
  startTime?: number;
  endTime?: number;
  words?: GhlTranscriptWord[];
}

type GhlTranscript = GhlTranscriptSentence[];

/**
 * Compute total speaking time per speaker (seconds) from per-word
 * timestamps. Falls back to sentence-level start/end if word-level
 * data is missing. Returns 0/0 if the transcript is unparseable.
 */
function computeTalkTimes(transcript: GhlTranscript): {
  speaker0Sec: number;
  speaker1Sec: number;
} {
  let s0 = 0;
  let s1 = 0;
  for (const sentence of transcript) {
    const words = sentence.words ?? [];
    if (words.length > 0) {
      for (const w of words) {
        if (typeof w.start !== "number" || typeof w.end !== "number") continue;
        const dur = Math.max(0, w.end - w.start);
        if (w.speaker === 0) s0 += dur;
        else if (w.speaker === 1) s1 += dur;
      }
    } else if (
      typeof sentence.startTime === "number" &&
      typeof sentence.endTime === "number"
    ) {
      const dur = Math.max(0, sentence.endTime - sentence.startTime);
      if (sentence.speaker === 0) s0 += dur;
      else if (sentence.speaker === 1) s1 += dur;
    }
  }
  return { speaker0Sec: s0, speaker1Sec: s1 };
}

/**
 * Heuristic to guess which speaker index (0 or 1) is the setter. We
 * don't get this labeled by GHL. For outbound calls the prospect
 * usually says "hello?" first (very short), then the setter introduces
 * themselves (longer). For inbound calls it's the reverse.
 *
 * Returns null when the heuristic can't decide confidently — UI then
 * renders "Speaker A / Speaker B" instead of setter/prospect labels.
 */
function guessSetterSpeakerIndex(
  transcript: GhlTranscript,
  direction: "outbound" | "inbound",
): 0 | 1 | null {
  // Count words spoken by each speaker in the first 8 seconds. The
  // intro pattern dominates here; later word counts drown out the signal.
  let s0Words = 0;
  let s1Words = 0;
  for (const sentence of transcript) {
    for (const w of sentence.words ?? []) {
      if (typeof w.start !== "number" || w.start > 8) continue;
      if (w.speaker === 0) s0Words++;
      else if (w.speaker === 1) s1Words++;
    }
  }

  // Abstain if we don't have enough words to discriminate.
  if (s0Words + s1Words < 5) return null;

  // Abstain if both speakers say roughly equal amounts in the intro —
  // the heuristic only works when one is clearly the "hello?" speaker.
  const ratio = Math.min(s0Words, s1Words) / Math.max(s0Words, s1Words);
  if (ratio > 0.6) return null;

  // In the first 8 sec, the speaker with FEWER words is usually the
  // one who said "hello?" — i.e. the receiver. The receiver is the
  // PROSPECT on outbound, the SETTER on inbound.
  const fewer: 0 | 1 = s0Words < s1Words ? 0 : 1;
  const more: 0 | 1 = fewer === 0 ? 1 : 0;
  return direction === "outbound" ? more : fewer;
}

/**
 * Classify whether an error from GHL or Anthropic is transient (we
 * should retry on the next reconcile tick) vs hard (the call needs a
 * code change to fix). Mirrors `isTransientGhlError` in setterGhlSync.ts;
 * adding it here so ai.ts stays self-contained.
 */
function isTransientUpstreamError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // GHL upstream 5xx / Cloudflare 524 / rate limit
  if (/GHL API 5\d\d/.test(msg)) return true;
  if (/GHL API 429/.test(msg)) return true;
  // Anthropic API transient signals
  if (/HTTP 429|HTTP 5\d\d|overloaded_error|rate_limit_error/i.test(msg)) {
    return true;
  }
  // Generic Node fetch / network errors
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(msg)) {
    return true;
  }
  return false;
}

const TRANSCRIPT_MAX_FETCH_ATTEMPTS = 5;

/**
 * Fetch a single call's transcript from GHL, parse it, compute
 * talk-time metrics, persist, and schedule the AI summary. Called via
 * scheduler.runAfter from setterGhlWebhooks.recordCallEvent the moment
 * a new call event is dispatched. Idempotent at the row level — the
 * caller is responsible for upserting the row first, this action
 * patches it.
 */
export const fetchAndProcessTranscript = internalAction({
  args: {
    transcriptRowId: v.id("setterCallTranscripts"),
  },
  handler: async (ctx, args): Promise<void> => {
    const { ghlFetch } = await import("./setterGhlClient");
    const { captureAndPersist } = await import("./lib/sentry");

    const row = await ctx.runQuery(
      internal.setterCallTranscriptsMutations.getTranscriptRow,
      { rowId: args.transcriptRowId },
    );
    if (!row) {
      console.warn(
        `[fetchAndProcessTranscript] Row not found: ${args.transcriptRowId}`,
      );
      return;
    }

    // Idempotency:
    // - "available" rows have a transcript; nothing to do.
    // - "not_available" rows USED to be a permanent verdict, but we
    //   discovered GHL transcribes async — early 400s often resolve to
    //   real transcripts within hours. So now we re-attempt them too,
    //   gated by fetchAttempts + the 24h notAvailableFirstSeenAt window.
    //   Outside the window or over the attempt cap → permanent.
    if (row.transcriptionStatus === "available") {
      return;
    }
    if (row.transcriptionStatus === "not_available") {
      const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
      const firstSeen = row.notAvailableFirstSeenAt ?? row.fetchedAt ?? 0;
      const outsideWindow = firstSeen <= Date.now() - TWENTY_FOUR_HOURS_MS;
      if (outsideWindow) return;
    }

    // Cap retries so a chronically-failing fetch doesn't loop forever.
    if ((row.fetchAttempts ?? 0) >= TRANSCRIPT_MAX_FETCH_ATTEMPTS) {
      console.warn(
        `[fetchAndProcessTranscript] Max attempts reached for row ${args.transcriptRowId} — giving up`,
      );
      return;
    }

    // Find the active installation for this team. The schema doesn't
    // pin transcripts to a specific installationId — we look it up so
    // a re-install of GHL doesn't strand pending rows.
    const installation = await ctx.runQuery(
      internal.setterGhlOauth.getActiveInstallationForTeam,
      { teamId: row.teamId },
    );
    if (!installation) {
      console.warn(
        `[fetchAndProcessTranscript] No active installation for team ${row.teamId}`,
      );
      // Leave the row in pending — if the customer reinstalls later
      // the reconcile cron will pick it up.
      return;
    }

    // Skip if we've already learned this team doesn't have transcription
    // enabled (and the 7-day re-detection window hasn't elapsed).
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    if (
      installation.transcriptionDisabled === true &&
      (installation.transcriptionDisabledAt ?? 0) >
        Date.now() - SEVEN_DAYS_MS
    ) {
      await ctx.runMutation(
        internal.setterCallTranscriptsMutations.markTranscriptNotAvailable,
        { rowId: args.transcriptRowId },
      );
      return;
    }

    try {
      const transcriptJson = await ghlFetch<GhlTranscript>(
        ctx,
        installation._id,
        `/conversations/locations/${installation.locationId}/messages/${row.ghlMessageId}/transcription`,
      );

      // Some short calls / voicemails return an empty array (200 OK,
      // body = []). Treat that as "not_available" — there's nothing
      // useful for the dashboard.
      if (!Array.isArray(transcriptJson) || transcriptJson.length === 0) {
        await ctx.runMutation(
          internal.setterCallTranscriptsMutations.markTranscriptNotAvailable,
          { rowId: args.transcriptRowId },
        );
        return;
      }

      const { speaker0Sec, speaker1Sec } = computeTalkTimes(transcriptJson);
      const setterSpeakerIndex = guessSetterSpeakerIndex(
        transcriptJson,
        row.direction,
      );

      let setterTalkTimeSec: number | undefined;
      let prospectTalkTimeSec: number | undefined;
      if (setterSpeakerIndex !== null) {
        setterTalkTimeSec =
          setterSpeakerIndex === 0 ? speaker0Sec : speaker1Sec;
        prospectTalkTimeSec =
          setterSpeakerIndex === 0 ? speaker1Sec : speaker0Sec;
      }

      await ctx.runMutation(
        internal.setterCallTranscriptsMutations.markTranscriptAvailable,
        {
          rowId: args.transcriptRowId,
          transcriptJson: JSON.stringify(transcriptJson),
          setterTalkTimeSec,
          prospectTalkTimeSec,
          setterSpeakerIndex: setterSpeakerIndex ?? undefined,
        },
      );

      // If this team was previously flagged as not-transcribing, clear
      // the flag — they've enabled it (or always had it on and we
      // mis-detected). Re-detection is cheap.
      if (installation.transcriptionDisabled) {
        await ctx.runMutation(
          internal.setterGhlSyncMutations.clearTranscriptionDisabled,
          { installationId: installation._id },
        );
      }

      // Schedule the summary on the same tick. Summary failures don't
      // block the transcript being viewable in the UI.
      await ctx.scheduler.runAfter(0, internal.ai.generateSetterCallSummary, {
        transcriptRowId: args.transcriptRowId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const is400 = /GHL API 400/.test(message);

      if (is400) {
        // "Transcription does not exist" — call too short, or customer
        // doesn't have transcription enabled. Either way, no point
        // retrying. NOT captured to Sentry (expected case).
        await ctx.runMutation(
          internal.setterCallTranscriptsMutations.markTranscriptNotAvailable,
          { rowId: args.transcriptRowId },
        );
        // Increment the consecutive-not-available counter for this team
        // so we can auto-flag the install as transcription-disabled.
        await ctx.runMutation(
          internal.setterGhlSyncMutations.bumpTranscriptionNotAvailableCount,
          { installationId: installation._id },
        );
        return;
      }

      console.error(
        `[fetchAndProcessTranscript] error for row ${args.transcriptRowId}:`,
        message,
      );

      const transient = isTransientUpstreamError(err);
      await captureAndPersist(
        err,
        async () => {
          await ctx.runMutation(
            internal.setterCallTranscriptsMutations.markTranscriptFailed,
            {
              rowId: args.transcriptRowId,
              lastFetchError: message.slice(0, 300),
            },
          );
        },
        {
          feature: transient
            ? "fetchAndProcessTranscript.transient"
            : "fetchAndProcessTranscript",
          integration: "ghl-marketplace",
          extra: {
            transcriptRowId: String(args.transcriptRowId),
            messageId: row.ghlMessageId,
          },
        },
      );
    }
  },
});

const SETTER_SUMMARY_MIN_TRANSCRIPT_CHARS = 100;

/**
 * Run a transcript through Claude and persist the summary. Called via
 * scheduler.runAfter from fetchAndProcessTranscript once a transcript
 * is successfully fetched. Failures here are recoverable — the
 * transcript stays available in the UI, the summary just shows as
 * "unavailable" until the next retry pass picks it up.
 */
export const generateSetterCallSummary = internalAction({
  args: {
    transcriptRowId: v.id("setterCallTranscripts"),
  },
  handler: async (ctx, args): Promise<void> => {
    const { captureAndPersist } = await import("./lib/sentry");

    const row = await ctx.runQuery(
      internal.setterCallTranscriptsMutations.getTranscriptRow,
      { rowId: args.transcriptRowId },
    );
    if (!row) return;
    if (row.aiSummary) return; // already summarized
    if (row.transcriptionStatus !== "available" || !row.transcriptJson) {
      return; // nothing to summarize
    }

    // Flatten the structured transcript into a plain-text dialogue so
    // Claude can read it efficiently. Use "Speaker N:" prefixes — the
    // exact identity (setter vs prospect) is captured separately on the
    // row via setterSpeakerIndex; the prompt doesn't need it.
    let dialogueText: string;
    try {
      const parsed = JSON.parse(row.transcriptJson) as GhlTranscript;
      dialogueText = parsed
        .map((s) => {
          const speaker = s.speaker ?? "?";
          const text = (s.transcript ?? "").trim();
          return text ? `Speaker ${speaker}: ${text}` : null;
        })
        .filter((line): line is string => line !== null)
        .join("\n");
    } catch (err) {
      // Malformed transcript JSON. Capture as hard error — this means
      // GHL changed their response shape and our parser needs an update.
      console.error(
        `[generateSetterCallSummary] transcript JSON parse failed for row ${args.transcriptRowId}:`,
        err,
      );
      await captureAndPersist(err, async () => {}, {
        feature: "generateSetterCallSummary",
        integration: "ghl-marketplace",
        extra: { transcriptRowId: String(args.transcriptRowId) },
      });
      return;
    }

    // Very short transcripts (voicemails, hang-ups) get a stock summary
    // rather than a Claude call. Saves cost + gives a cleaner UI than
    // an LLM straining to summarize 5 words.
    if (dialogueText.length < SETTER_SUMMARY_MIN_TRANSCRIPT_CHARS) {
      const stockSummary =
        "• Outcome: Brief call — likely a voicemail or short hang-up.\n" +
        "• Prospect interest: N/A — voicemail.\n" +
        "• Key objection: N/A — voicemail.\n" +
        "• Next step: N/A — voicemail.";
      await ctx.runMutation(
        internal.setterCallTranscriptsMutations.markTranscriptSummary,
        { rowId: args.transcriptRowId, summary: stockSummary },
      );
      return;
    }

    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: SETTER_SUMMARY_PROMPT,
        messages: [
          {
            role: "user",
            content: `Here is a qualifying call transcript between a sales setter and a prospect:\n\n${dialogueText}`,
          },
        ],
      });

      const summary =
        message.content?.[0]?.type === "text"
          ? message.content[0].text.trim()
          : "";

      if (!summary) {
        console.error(
          `[generateSetterCallSummary] empty Anthropic response for row ${args.transcriptRowId}`,
        );
        // Leave aiSummary unset; the retry pass will pick it up.
        return;
      }

      await ctx.runMutation(
        internal.setterCallTranscriptsMutations.markTranscriptSummary,
        { rowId: args.transcriptRowId, summary },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[generateSetterCallSummary] error for row ${args.transcriptRowId}:`,
        message,
      );

      const transient = isTransientUpstreamError(err);
      await captureAndPersist(err, async () => {}, {
        feature: transient
          ? "generateSetterCallSummary.transient"
          : "generateSetterCallSummary",
        integration: "anthropic",
        extra: { transcriptRowId: String(args.transcriptRowId) },
      });
      // Leave the row's aiSummary unset. The reconcile retry pass picks
      // up `transcriptionStatus: available + !aiSummary` rows after 15 min.
    }
  },
});

/**
 * One-shot backfill orchestrator: resets all not_available transcript
 * rows for a team into the retry window and schedules a fresh fetch for
 * each. Used to recover rows that were marked permanently not_available
 * before the async-transcription retry fix landed. Safe to re-run —
 * `fetchAndProcessTranscript`'s idempotency check keeps already-resolved
 * rows from being re-processed.
 */
export const backfillRetryNotAvailable = internalAction({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args): Promise<{ scheduled: number }> => {
    const rowIds: Array<Id<"setterCallTranscripts">> = await ctx.runMutation(
      internal.setterCallTranscriptsMutations.resetNotAvailableForRetry,
      { teamId: args.teamId },
    );
    for (const rowId of rowIds) {
      await ctx.scheduler.runAfter(0, internal.ai.fetchAndProcessTranscript, {
        transcriptRowId: rowId,
      });
    }
    return { scheduled: rowIds.length };
  },
});
