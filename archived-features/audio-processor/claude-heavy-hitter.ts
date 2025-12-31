// Claude AI integration for ammo extraction with scoring

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";
import type { AmmoItem, AmmoConfig } from "./types.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Updated ammo extraction prompt with detailed criteria and examples
const DEFAULT_AMMO_EXTRACTION_PROMPT = `You are analyzing a sales call transcript to extract "ammo" — key moments the sales rep can reference later when handling objections or closing.

**CRITICAL: Only extract the PROSPECT's exact words. NEVER include anything the closer/sales rep said.**

The transcript uses labels: [Closer] for the sales rep and [Prospect] for the potential customer.
ONLY extract quotes that come after [Prospect]:

## CATEGORIES

Extract ammo into these 3 categories:

1. **Financial** - Money, costs, losses, investments, ROI
   - Specific dollar amounts ("losing $5,000 every month")
   - Revenue/profit impact ("lost two clients worth $50k")
   - Budget/affordability statements ("money isn't the issue")

2. **Emotional** - Feelings, frustrations, relationships, stress
   - Strong emotional language ("fed up", "can't sleep", "desperate")
   - Spouse/partner involvement with emotion ("my wife is frustrated with me")
   - Breaking point statements ("I can't keep living like this")
   - Physical/mental impact ("haven't slept in weeks")

3. **Situational** - Timelines, past experiences, circumstances
   - Specific deadlines ("need this fixed before January")
   - Past failures with specifics ("tried 3 other programs")
   - Urgency signals ("something has to change now")
   - External pressures ("busy season starts soon")

## HEAVY HITTER SCORING

A heavy hitter is ammo that will actually help close the deal. Score each item:

**Score 80-100 (DEFINITELY include):**
- Specific numbers or dollar amounts ("losing $5k a month", "gained 30 pounds")
- Strong emotional language ("fed up", "can't sleep", "desperate", "at my breaking point")
- Spouse/partner involvement with emotion ("my wife is frustrated with me")
- Specific timelines or deadlines ("need this done before January")
- Past failures with specifics ("tried 3 other programs and none worked")
- Urgency signals ("I can't keep doing this", "something has to change")

**Score 50-79 (Maybe include if nothing better):**
- General pain without specifics ("it's been stressful")
- Vague timeline ("sometime soon")
- Mentioned a problem but no emotion or numbers
- Spouse mentioned but no emotion attached

**Score 0-49 (DON'T include):**
- Generic statements ("yeah it's tough")
- Closer's words (not prospect's) - AUTOMATIC 0
- Off-topic conversation
- Logistics without emotion ("I'm in California")
- Questions without revealing pain ("how does it work?")

## EXAMPLES OF GOOD AMMO

**Example 1: Financial — Score 95**
Prospect says: "Honestly, I've been losing about $5,000 every single month because I can't figure this out."
- Quote: "losing about $5,000 every single month"
- Category: financial
- Suggested use: "You mentioned losing $5k every month — that's $60k a year. Our program pays for itself in the first 30 days."

**Example 2: Emotional — Score 90**
Prospect says: "My wife is honestly fed up with me. She keeps asking when I'm going to fix this."
- Quote: "wife is honestly fed up with me"
- Category: emotional
- Suggested use: "You said your wife is fed up — imagine how she'll feel when you come home and tell her it's handled."

**Example 3: Situational — Score 85**
Prospect says: "I need to get this sorted out before January because that's when our busy season starts."
- Quote: "need to get this sorted out before January"
- Category: situational
- Suggested use: "You mentioned January is your busy season — if we start now, you'll be ready."

**Example 4: Emotional — Score 90**
Prospect says: "I haven't slept properly in weeks. I just lay there thinking about this problem."
- Quote: "haven't slept properly in weeks"
- Category: emotional
- Suggested use: "You said you haven't slept in weeks — what would it mean to finally have this off your plate?"

**Example 5: Financial — Score 95**
Prospect says: "Every month I don't fix this, I'm probably leaving $10k on the table. It's killing me."
- Quote: "leaving $10k on the table"
- Category: financial
- Suggested use: "You said you're leaving $10k on the table every month — that's the cost of NOT making a decision today."

**Example 6: Situational — Score 85**
Prospect says: "I've tried like three other coaches and none of them worked. I'm starting to think maybe it's me."
- Quote: "tried three other coaches and none of them worked"
- Category: situational
- Suggested use: "You've tried 3 other coaches — so you know what doesn't work. Let me show you why this is different."

**Example 7: Emotional — Score 90**
Prospect says: "I'm just so done with this. Something has to change. I can't keep living like this."
- Quote: "I can't keep living like this"
- Category: emotional
- Suggested use: "You said you can't keep living like this — and you don't have to. That's exactly why we're talking."

**Example 8: Financial — Score 95**
Prospect says: "Last quarter we lost two major clients because of this issue. That was probably $50k in revenue."
- Quote: "lost two major clients... $50k in revenue"
- Category: financial
- Suggested use: "You lost $50k last quarter — what happens if you lose two more clients next quarter?"

## EXAMPLES OF WHAT NOT TO INCLUDE

**Bad Example A: Too Vague — Score 25**
Prospect says: "Yeah, things have been kind of hard lately."
- NOT included: No specifics, no numbers, no strong emotion. Generic statement.

**Bad Example B: Wrong Speaker — Score 0**
Closer says: "So it sounds like you're losing money every month, right?"
- NOT included: This is the CLOSER speaking, not the prospect. NEVER extract closer speech.

**Bad Example C: Logistics — Score 10**
Prospect says: "I'm based in Texas and I work from home mostly."
- NOT included: Just logistics. No pain, no emotion, no urgency.

## OUTPUT RULES

1. Return 3-5 heavy hitter items when possible
2. Only include items scoring 50 or higher
3. If fewer than 3 items score 50+, include what you have
4. If nothing scores 50+, return an empty array
5. Prioritize quality over quantity — 2 great items beats 5 mediocre ones

Return ONLY a valid JSON array with this structure (no markdown, no explanation):
[
  {
    "text": "exact quote from prospect",
    "type": "financial|emotional|situational",
    "score": 0-100,
    "emotionalIntensity": true/false,
    "hasSpecifics": true/false,
    "repetitionKeywords": ["keyword1", "keyword2"],
    "suggestedUse": "One sentence on how to use this to close"
  }
]

If no ammo found or nothing scores 50+, return: []`;

// Build custom prompt that LAYERS on top of default (doesn't replace)
function buildCustomPrompt(config: AmmoConfig): string {
  // Build custom category list
  const customCategoryList = config.ammoCategories
    .map((cat) => `- **${cat.name}** - Listen for: ${cat.keywords.join(", ")}`)
    .join("\n");

  // Build custom objection list
  const customObjectionList = config.commonObjections
    .map((obj) => `- "${obj.label}" (keywords: ${obj.keywords.join(", ")})`)
    .join("\n");

  return `${DEFAULT_AMMO_EXTRACTION_PROMPT}

---

## BUSINESS-SPECIFIC CONTEXT (LAYERED ON TOP OF DEFAULT)

**What this business sells:** ${config.offerDescription}
**Problem it solves:** ${config.problemSolved}

### ADDITIONAL CUSTOM CATEGORIES
These are IN ADDITION to Financial, Emotional, and Situational:

${customCategoryList}

When you detect these custom categories, use the custom category ID in your response.
Custom category IDs: ${config.ammoCategories.map(c => `"${c.id}": "${c.name}"`).join(", ")}

### ADDITIONAL OBJECTIONS TO WATCH FOR
These are IN ADDITION to standard objection detection:

${customObjectionList}

### SCORING BOOST
- Items directly related to "${config.offerDescription}" get +10 to their score
- Items matching custom category keywords get +10 to their score

Return the same JSON structure, but include:
- "customCategoryId": the category ID if it matches a custom category, otherwise null
- "isOfferRelevant": true if directly related to this business's offer`;
}

// Calculate score based on content analysis
function calculateScore(
  item: {
    emotionalIntensity?: boolean;
    hasSpecifics?: boolean;
    isOfferRelevant?: boolean;
    score?: number; // AI-provided score
  },
  repetitionCount: number
): number {
  // If AI already provided a score, use it as base
  if (item.score && item.score > 0) {
    let score = item.score;

    // Boost for repetition (mentioned multiple times = more important)
    if (repetitionCount >= 2) {
      score = Math.min(score + 10, 100);
    }

    // Boost for offer relevance
    if (item.isOfferRelevant) {
      score = Math.min(score + 5, 100);
    }

    return score;
  }

  // Fallback scoring if AI didn't provide a score
  let score = 20; // Base score

  // +40 if contains specific numbers/dates/names (highest weight)
  if (item.hasSpecifics) {
    score += 40;
  }

  // +25 if strong emotional language
  if (item.emotionalIntensity) {
    score += 25;
  }

  // +15 if mentioned 2+ times (repetition)
  if (repetitionCount >= 2) {
    score += 15;
  }

  // +10 if directly relevant to business's offer
  if (item.isOfferRelevant) {
    score += 10;
  }

  return Math.min(score, 100);
}

// Generate template-based suggested use when AI doesn't provide one
function generateDefaultSuggestedUse(type: string, text: string): string {
  const abbreviatedQuote = text.length > 50 ? text.substring(0, 50) + "..." : text;

  switch (type) {
    case "financial":
      return `Use to justify ROI: "You mentioned ${abbreviatedQuote}"`;
    case "emotional":
      return `Anchor their emotion: "You said ${abbreviatedQuote}"`;
    case "situational":
      return `Create urgency: "You mentioned ${abbreviatedQuote}"`;
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
  type: "financial" | "emotional" | "situational";
  score?: number;
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
    // Build prompt - custom config LAYERS on top of default
    let systemPrompt: string;
    if (context.ammoConfig) {
      systemPrompt = buildCustomPrompt(context.ammoConfig);
    } else if (context.customPrompt) {
      systemPrompt = `${DEFAULT_AMMO_EXTRACTION_PROMPT}\n\nADDITIONAL CONTEXT:\n${context.customPrompt}`;
    } else {
      systemPrompt = DEFAULT_AMMO_EXTRACTION_PROMPT;
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Analyze this transcript segment and extract 3-5 heavy hitter ammo items (score 50+):\n\n${transcriptChunk}`,
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
    const validTypes = ["financial", "emotional", "situational"];
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

        // Calculate or validate score
        const score = calculateScore(
          {
            emotionalIntensity: item.emotionalIntensity,
            hasSpecifics: item.hasSpecifics,
            isOfferRelevant: item.isOfferRelevant,
            score: item.score,
          },
          maxRepetition
        );

        // Get suggested use (AI-generated preferred, template fallback)
        const suggestedUse = item.suggestedUse || generateDefaultSuggestedUse(item.type, item.text);

        // Map new types to legacy types for database compatibility
        const legacyType = item.type === "financial" ? "budget" :
                          item.type === "situational" ? "urgency" :
                          item.type;

        return {
          text: item.text,
          type: legacyType as AmmoItem["type"],
          score,
          repetitionCount: maxRepetition,
          isHeavyHitter: score >= 50,
          categoryId: item.customCategoryId || undefined,
          suggestedUse,
        };
      })
      // Filter out items below threshold
      .filter((item) => item.score >= 50);

    // Sort by score descending and limit to top 5
    const sortedItems = processedItems
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5);

    if (sortedItems.length > 0) {
      const heavyHitters = sortedItems.filter(i => i.isHeavyHitter).length;
      logger.info(`Extracted ${sortedItems.length} ammo items (${heavyHitters} heavy hitters, scores: ${sortedItems.map(i => i.score).join(', ')})`);
    }

    return { items: sortedItems, updatedRepetitions };
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
