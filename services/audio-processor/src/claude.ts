// Claude AI integration for ammo extraction

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";
import type { AmmoItem } from "./types.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const AMMO_EXTRACTION_PROMPT = `You are analyzing a sales call transcript to extract "ammo" — key moments the sales rep can reference later when handling objections or closing.

Extract ONLY the PROSPECT's exact words (not the sales rep) that fall into these categories:

1. **Emotional statements** - Expressions of frustration, excitement, fear, or desire
   Examples: "I'll be disappointed in myself if I don't take action", "I'm so frustrated with..."

2. **Urgency signals** - Time-sensitive statements or deadlines
   Examples: "I need this done before January", "I can't wait any longer"

3. **Budget indicators** - Statements about money, affordability, or financial readiness
   Examples: "Money isn't the issue", "I just got a bonus", "I've been saving for this"

4. **Commitment signals** - Statements showing readiness or determination
   Examples: "This is exactly what I need", "I'm ready to make a change"

5. **Objection previews** - Potential concerns mentioned early (spouse, timing, skepticism)
   Examples: "My wife handles the finances", "I've been burned before", "I need to think about it"

6. **Pain points** - Specific problems or struggles they're experiencing
   Examples: "I'm losing $10k a month", "My team is falling apart"

RULES:
- ONLY extract the prospect's words, never the sales rep's
- Use their exact words when possible (short quotes, 1-2 sentences max)
- Ignore small talk, greetings, and generic statements
- If nothing qualifies as ammo, return an empty array
- Each item must have real substance — skip vague or meaningless statements

Return ONLY a valid JSON array with this structure (no markdown, no explanation):
[
  {"text": "exact quote from prospect", "type": "emotional|urgency|budget|commitment|objection_preview|pain_point"}
]

If no ammo found, return: []`;

export async function extractAmmo(
  transcriptChunk: string,
  customPrompt?: string
): Promise<AmmoItem[]> {
  if (!transcriptChunk || transcriptChunk.trim().length < 50) {
    // Don't process very short chunks
    return [];
  }

  try {
    const systemPrompt = customPrompt
      ? `${AMMO_EXTRACTION_PROMPT}\n\nADDITIONAL CONTEXT FOR THIS COMPANY:\n${customPrompt}`
      : AMMO_EXTRACTION_PROMPT;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Analyze this transcript segment and extract ammo:\n\n${transcriptChunk}`,
        },
      ],
      system: systemPrompt,
    });

    // Extract text from response
    const responseText = message.content[0].type === "text" ? message.content[0].text : "";

    // Parse JSON response
    const trimmed = responseText.trim();

    // Handle potential markdown code blocks
    let jsonStr = trimmed;
    if (trimmed.startsWith("```")) {
      const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        jsonStr = match[1].trim();
      }
    }

    const ammoItems: AmmoItem[] = JSON.parse(jsonStr);

    // Validate the structure
    const validatedItems = ammoItems.filter(
      (item) =>
        item &&
        typeof item.text === "string" &&
        item.text.length > 0 &&
        ["emotional", "urgency", "budget", "commitment", "objection_preview", "pain_point"].includes(
          item.type
        )
    );

    if (validatedItems.length > 0) {
      logger.info(`Extracted ${validatedItems.length} ammo items`);
    }

    return validatedItems;
  } catch (error) {
    logger.error("Failed to extract ammo", error);
    return [];
  }
}
