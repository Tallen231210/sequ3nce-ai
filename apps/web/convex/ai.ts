// AI-powered features using Claude
"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const SUMMARY_PROMPT = `You are analyzing a completed sales call transcript to create a brief summary for a sales manager.

Write a 3-5 sentence summary that includes:
1. What product/service was discussed (if clear from context)
2. The prospect's main pain points or needs mentioned
3. Key objections raised (if any)
4. The outcome and any next steps
5. Overall prospect sentiment (interested, hesitant, not interested, ready to buy)

After the summary, add a blank line and then these three bullet points:

• Buyer Language: [Yes/No] - [Brief explanation of buying signals or lack thereof. Examples of buyer language: "I'm ready", "let's do it", "how do I sign up", "I want this". Examples of non-buyer language: "I need to think about it", "not sure", "maybe later".]

• Why Purchased/Didn't Purchase: [One sentence explaining the key factor that led to the outcome. If closed, what convinced them. If not closed, what was the main objection or hesitation.]

• Price Pitched: [The dollar amount mentioned for the offer/program, e.g. "$5,000" or "$10K". If no clear price was stated during the call, write "Not mentioned".]

RULES:
- Keep the summary concise - the manager should read it in 10 seconds
- Use plain language, avoid sales jargon
- If the call was very short or the transcript is sparse, just summarize what you can
- Focus on actionable insights the manager would care about
- Don't include timestamps or speaker labels in the summary
- Always include the three bullet points at the end, even if you have to write "Unclear from transcript"

Return the summary text followed by the bullet points. No markdown headers or extra formatting.`;

// Generate a summary for a completed call
export const generateCallSummary = action({
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
