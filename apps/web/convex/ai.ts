// AI-powered features using Claude
"use node";

import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
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
• Objections: [One sentence - key objections raised, or "None raised"]
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
        model: "claude-sonnet-4-20250514",
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

        // Send call completed notification (Slack and Discord)
        await ctx.runAction(internal.slack.sendCallCompletedNotification, {
          callId,
        });
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
        model: "claude-sonnet-4-20250514",
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
