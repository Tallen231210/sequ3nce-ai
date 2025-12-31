// Claude AI integration for simple ammo extraction
// Extracts prospect quotes with basic categorization - no scoring, no heavy hitters

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";
import type { AmmoItem } from "./types.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Simple ammo extraction prompt - just extract prospect quotes with categories
const AMMO_EXTRACTION_PROMPT = `You are analyzing a sales call transcript to extract key quotes from the prospect.

**CRITICAL: Only extract the PROSPECT's exact words. NEVER include anything the closer/sales rep said.**

The transcript uses labels: [Closer] for the sales rep and [Prospect] for the potential customer.
ONLY extract quotes that come after [Prospect].

## CATEGORIES

Categorize each quote into one of these types:

1. **emotional** - Feelings, frustrations, stress, relationship impact
   - "I'm so frustrated with this"
   - "My wife is fed up"
   - "I can't sleep at night"

2. **budget** - Money, costs, financial impact
   - "We're losing $5,000 a month"
   - "Money isn't the issue"
   - "It's too expensive"

3. **urgency** - Timelines, deadlines, need for speed
   - "I need this fixed before January"
   - "Something has to change now"
   - "We can't wait any longer"

4. **commitment** - Statements showing readiness or interest
   - "I'm ready to make a change"
   - "This sounds like what I need"
   - "I want to move forward"

5. **pain_point** - Specific problems or challenges
   - "The biggest issue is..."
   - "We've tried everything"
   - "Nothing has worked"

6. **objection_preview** - Concerns or hesitations
   - "I need to talk to my spouse"
   - "I'm not sure about the timing"
   - "What if it doesn't work?"

## WHAT TO EXTRACT

Look for:
- Specific problems the prospect mentions
- Emotional statements showing frustration or desire
- Financial impact or budget-related comments
- Timeline or urgency indicators
- Commitments or buying signals
- Potential objections or concerns

## WHAT NOT TO EXTRACT

Skip:
- Generic small talk ("yeah", "okay", "I see")
- Pure logistics without meaning ("I'm in California")
- Questions about how things work without revealing pain
- Anything said by the Closer

## OUTPUT

Return 3-8 relevant quotes. Focus on statements that reveal what matters to the prospect.

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "text": "exact quote from prospect",
    "type": "emotional|budget|urgency|commitment|pain_point|objection_preview"
  }
]

If no meaningful quotes found, return: []`;

interface RawAmmoItem {
  text: string;
  type: string;
}

export async function extractAmmo(
  transcriptChunk: string
): Promise<AmmoItem[]> {
  if (!transcriptChunk || transcriptChunk.trim().length < 50) {
    return [];
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Extract key prospect quotes from this transcript:\n\n${transcriptChunk}`,
        },
      ],
      system: AMMO_EXTRACTION_PROMPT,
    });

    // Extract text from response
    const responseText = message.content[0].type === "text" ? message.content[0].text : "";

    // Parse JSON response
    let jsonStr = responseText.trim();

    // Handle potential markdown code blocks
    if (jsonStr.startsWith("```")) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        jsonStr = match[1].trim();
      }
    }

    const rawItems: RawAmmoItem[] = JSON.parse(jsonStr);

    // Validate and process items
    const validTypes = ["emotional", "budget", "urgency", "commitment", "pain_point", "objection_preview"];

    const items: AmmoItem[] = rawItems
      .filter(
        (item) =>
          item &&
          typeof item.text === "string" &&
          item.text.length > 0 &&
          validTypes.includes(item.type)
      )
      .map((item) => ({
        text: item.text,
        type: item.type as AmmoItem["type"],
      }));

    if (items.length > 0) {
      logger.info(`Extracted ${items.length} ammo items`);
    }

    return items;
  } catch (error) {
    logger.error("Failed to extract ammo", error);
    return [];
  }
}
