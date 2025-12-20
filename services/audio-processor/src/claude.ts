// Claude AI integration for ammo extraction with scoring

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";
import type { AmmoItem, AmmoConfig } from "./types.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Default prompt when no custom config exists
const DEFAULT_AMMO_EXTRACTION_PROMPT = `You are analyzing a sales call transcript to extract "ammo" — key moments the sales rep can reference later when handling objections or closing.

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

For each ammo item, also provide:
- emotionalIntensity: true if the statement has strong emotional language (frustration, excitement, fear, urgency)
- hasSpecifics: true if it contains specific numbers, dates, names, or concrete details
- repetitionKeywords: an array of 2-3 key words/phrases that could be used to detect if this topic is mentioned again

Return ONLY a valid JSON array with this structure (no markdown, no explanation):
[
  {
    "text": "exact quote from prospect",
    "type": "emotional|urgency|budget|commitment|objection_preview|pain_point",
    "emotionalIntensity": true/false,
    "hasSpecifics": true/false,
    "repetitionKeywords": ["keyword1", "keyword2"]
  }
]

If no ammo found, return: []`;

// Build custom prompt when ammo config exists
function buildCustomPrompt(config: AmmoConfig): string {
  const categoryList = config.ammoCategories
    .map((cat, i) => `${i + 1}. **${cat.name}** - Listen for: ${cat.keywords.join(", ")}`)
    .join("\n");

  return `You are analyzing a sales call transcript to extract "ammo" — key moments the sales rep can reference later when handling objections or closing.

BUSINESS CONTEXT:
- What they sell: ${config.offerDescription}
- Problem it solves: ${config.problemSolved}

Extract ONLY the PROSPECT's exact words (not the sales rep) that fall into these custom categories:

${categoryList}

Also look for standard categories if not covered above:
- **Emotional statements** - Expressions of frustration, excitement, fear, or desire
- **Urgency signals** - Time-sensitive statements or deadlines
- **Budget indicators** - Statements about money, affordability, or financial readiness
- **Commitment signals** - Statements showing readiness or determination
- **Pain points** - Specific problems or struggles they're experiencing

RULES:
- ONLY extract the prospect's words, never the sales rep's
- Use their exact words when possible (short quotes, 1-2 sentences max)
- Ignore small talk, greetings, and generic statements
- If nothing qualifies as ammo, return an empty array
- Each item must have real substance — skip vague or meaningless statements

For each ammo item, also provide:
- emotionalIntensity: true if the statement has strong emotional language (frustration, excitement, fear, urgency)
- hasSpecifics: true if it contains specific numbers, dates, names, or concrete details
- isOfferRelevant: true if directly related to the business's offer (${config.offerDescription})
- repetitionKeywords: an array of 2-3 key words/phrases that could be used to detect if this topic is mentioned again
- suggestedUse: ONE sentence starting with an action verb on how the closer can use this to close (e.g., "Remind them they're losing $10k monthly to justify the investment")
- customCategoryId: if it matches a custom category, provide the category ID, otherwise null

Custom category IDs: ${config.ammoCategories.map(c => `"${c.id}"`).join(", ")}

Return ONLY a valid JSON array with this structure (no markdown, no explanation):
[
  {
    "text": "exact quote from prospect",
    "type": "emotional|urgency|budget|commitment|objection_preview|pain_point",
    "emotionalIntensity": true/false,
    "hasSpecifics": true/false,
    "isOfferRelevant": true/false,
    "repetitionKeywords": ["keyword1", "keyword2"],
    "suggestedUse": "action-oriented suggestion",
    "customCategoryId": "category_id or null"
  }
]

If no ammo found, return: []`;
}

// Calculate score based on extraction results and repetition data
function calculateScore(
  item: {
    emotionalIntensity?: boolean;
    hasSpecifics?: boolean;
    isOfferRelevant?: boolean;
  },
  repetitionCount: number
): number {
  let score = 20; // Base score

  // +30 if mentioned 2+ times (repetition)
  if (repetitionCount >= 2) {
    score += 30;
  }

  // +25 if strong emotional language (intensity)
  if (item.emotionalIntensity) {
    score += 25;
  }

  // +15 if contains specific numbers/dates/names (specificity)
  if (item.hasSpecifics) {
    score += 15;
  }

  // +10 if directly relevant to business's offer (relevance)
  if (item.isOfferRelevant) {
    score += 10;
  }

  return Math.min(score, 100); // Cap at 100
}

// Generate template-based suggested use when no config
function generateDefaultSuggestedUse(type: string, text: string): string {
  const abbreviatedQuote = text.length > 50 ? text.substring(0, 50) + "..." : text;

  switch (type) {
    case "budget":
    case "urgency":
      return `Use to justify the investment: You mentioned "${abbreviatedQuote}"`;
    case "emotional":
    case "pain_point":
      return `Anchor their emotion: You said "${abbreviatedQuote}"`;
    case "commitment":
      return `Reinforce their commitment: Remember when you said "${abbreviatedQuote}"`;
    case "objection_preview":
      return `Address proactively: You mentioned "${abbreviatedQuote}"`;
    default:
      return `Reference during close: "${abbreviatedQuote}"`;
  }
}

export interface ExtractionContext {
  ammoConfig?: AmmoConfig | null;
  customPrompt?: string;
  repetitionTracker: Map<string, number>;
}

interface RawAmmoItem {
  text: string;
  type: "emotional" | "urgency" | "budget" | "commitment" | "objection_preview" | "pain_point";
  emotionalIntensity?: boolean;
  hasSpecifics?: boolean;
  isOfferRelevant?: boolean;
  repetitionKeywords?: string[];
  suggestedUse?: string;
  customCategoryId?: string | null;
}

export async function extractAmmo(
  transcriptChunk: string,
  context: ExtractionContext
): Promise<{ items: AmmoItem[]; updatedRepetitions: Map<string, number> }> {
  if (!transcriptChunk || transcriptChunk.trim().length < 50) {
    return { items: [], updatedRepetitions: context.repetitionTracker };
  }

  try {
    // Build prompt based on whether we have config
    let systemPrompt: string;
    if (context.ammoConfig) {
      systemPrompt = buildCustomPrompt(context.ammoConfig);
    } else if (context.customPrompt) {
      systemPrompt = `${DEFAULT_AMMO_EXTRACTION_PROMPT}\n\nADDITIONAL CONTEXT FOR THIS COMPANY:\n${context.customPrompt}`;
    } else {
      systemPrompt = DEFAULT_AMMO_EXTRACTION_PROMPT;
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
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

    const rawItems: RawAmmoItem[] = JSON.parse(jsonStr);

    // Validate and process items
    const validTypes = ["emotional", "urgency", "budget", "commitment", "objection_preview", "pain_point"];
    const updatedRepetitions = new Map(context.repetitionTracker);

    const processedItems: AmmoItem[] = rawItems
      .filter(
        (item) =>
          item &&
          typeof item.text === "string" &&
          item.text.length > 0 &&
          validTypes.includes(item.type)
      )
      .map((item) => {
        // Update repetition tracker with keywords
        let maxRepetition = 1;
        if (item.repetitionKeywords && Array.isArray(item.repetitionKeywords)) {
          for (const keyword of item.repetitionKeywords) {
            const normalizedKeyword = keyword.toLowerCase().trim();
            const currentCount = updatedRepetitions.get(normalizedKeyword) || 0;
            const newCount = currentCount + 1;
            updatedRepetitions.set(normalizedKeyword, newCount);
            maxRepetition = Math.max(maxRepetition, newCount);
          }
        }

        // Calculate score
        const score = calculateScore(
          {
            emotionalIntensity: item.emotionalIntensity,
            hasSpecifics: item.hasSpecifics,
            isOfferRelevant: item.isOfferRelevant,
          },
          maxRepetition
        );

        // Get suggested use (AI-generated if config, template if not)
        const suggestedUse = item.suggestedUse || generateDefaultSuggestedUse(item.type, item.text);

        return {
          text: item.text,
          type: item.type,
          score,
          repetitionCount: maxRepetition,
          isHeavyHitter: score >= 50,
          categoryId: item.customCategoryId || undefined,
          suggestedUse,
        };
      });

    if (processedItems.length > 0) {
      const heavyHitters = processedItems.filter(i => i.isHeavyHitter).length;
      logger.info(`Extracted ${processedItems.length} ammo items (${heavyHitters} heavy hitters)`);
    }

    return { items: processedItems, updatedRepetitions };
  } catch (error) {
    logger.error("Failed to extract ammo", error);
    return { items: [], updatedRepetitions: context.repetitionTracker };
  }
}

// Legacy function signature for backward compatibility
export async function extractAmmoLegacy(
  transcriptChunk: string,
  customPrompt?: string
): Promise<AmmoItem[]> {
  const result = await extractAmmo(transcriptChunk, {
    customPrompt,
    repetitionTracker: new Map(),
  });
  return result.items;
}
