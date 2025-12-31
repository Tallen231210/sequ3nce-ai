// AI-powered features using Claude
"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

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
