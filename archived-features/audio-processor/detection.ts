// AI Detection Module - Analyzes transcripts for key sales indicators
// Detects: Budget discussion, Timeline/Urgency, Decision Maker status, Spouse mentions, Objections

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";
import type { AmmoConfig, CallManifesto } from "./types.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Detection result types (matching Convex schema)
export interface BudgetDiscussion {
  detected: boolean;
  mentionCount: number;
  quotes: string[];
}

export interface TimelineUrgency {
  detected: boolean;
  mentionCount: number;
  quotes: string[];
  isUrgent?: string; // "yes" | "no" | "unclear"
}

export interface DecisionMakerDetection {
  detected: boolean;
  mentionCount: number;
  quotes: string[];
  isSoleDecisionMaker?: string; // "yes" | "no" | "unclear"
}

export interface SpousePartnerMentions {
  detected: boolean;
  mentionCount: number;
  quotes: string[];
}

export interface ObjectionDetected {
  type: string;
  quotes: string[];
  timestamp?: number;
}

export interface DetectionResults {
  budgetDiscussion: BudgetDiscussion;
  timelineUrgency: TimelineUrgency;
  decisionMakerDetection: DecisionMakerDetection;
  spousePartnerMentions: SpousePartnerMentions;
  objectionsDetected: ObjectionDetected[];
}

// Build the detection prompt
function buildDetectionPrompt(ammoConfig?: AmmoConfig | null, manifesto?: CallManifesto): string {
  // Get objection types from manifesto or use defaults
  const objectionTypes = manifesto?.objections?.map(o => o.name) || [
    "Spouse/Partner",
    "Price/Money",
    "Timing",
    "Need to think about it"
  ];

  // Add custom objections from ammoConfig if available
  const customObjections = ammoConfig?.commonObjections?.map(o => o.label) || [];
  const allObjectionTypes = [...new Set([...objectionTypes, ...customObjections])];

  return `You are analyzing a sales call transcript to detect key indicators that help sales managers understand the call dynamics.

Analyze the transcript and extract the following:

## 1. BUDGET DISCUSSION
Look for any mention of:
- Money, price, cost, investment, afford, budget
- Specific dollar amounts
- Financial constraints or readiness
- Payment plans, financing

## 2. TIMELINE/URGENCY
Look for:
- Deadlines, dates, timeframes
- "Need to decide by...", "Before the end of..."
- Urgency indicators: "soon", "immediately", "right away", "ASAP"
- Timing concerns: "not right now", "later", "next month"

Determine if there's genuine urgency (yes/no/unclear).

## 3. DECISION MAKER STATUS
Look for:
- References to needing to consult someone else
- "I'm the one who decides", "It's my call"
- Mentions of business partners, bosses, boards
- "I need to talk to my..."

Determine if prospect is sole decision maker (yes/no/unclear).

## 4. SPOUSE/PARTNER MENTIONS
Look for specific mentions of:
- Wife, husband, spouse, partner
- "My wife/husband", "I need to talk to my partner"
- Any indication of needing spousal approval

## 5. OBJECTIONS
Identify any objections from these categories:
${allObjectionTypes.map((t, i) => `${i + 1}. ${t}`).join("\n")}

For each category, extract:
- Whether it was detected (true/false)
- How many times it was mentioned (count distinct mentions)
- Direct quotes from the prospect (exact words, 1-2 sentences each, max 3 quotes per category)

IMPORTANT RULES:
- Only extract PROSPECT's words, not the sales rep's
- Use exact quotes when possible
- Be conservative - only mark as detected if clearly mentioned
- For objections, categorize them into the provided types

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "budgetDiscussion": {
    "detected": true/false,
    "mentionCount": number,
    "quotes": ["quote1", "quote2"]
  },
  "timelineUrgency": {
    "detected": true/false,
    "mentionCount": number,
    "quotes": ["quote1", "quote2"],
    "isUrgent": "yes" | "no" | "unclear"
  },
  "decisionMakerDetection": {
    "detected": true/false,
    "mentionCount": number,
    "quotes": ["quote1", "quote2"],
    "isSoleDecisionMaker": "yes" | "no" | "unclear"
  },
  "spousePartnerMentions": {
    "detected": true/false,
    "mentionCount": number,
    "quotes": ["quote1", "quote2"]
  },
  "objectionsDetected": [
    {
      "type": "objection category name",
      "quotes": ["quote1", "quote2"]
    }
  ]
}`;
}

// Default empty results
function getEmptyResults(): DetectionResults {
  return {
    budgetDiscussion: { detected: false, mentionCount: 0, quotes: [] },
    timelineUrgency: { detected: false, mentionCount: 0, quotes: [], isUrgent: "unclear" },
    decisionMakerDetection: { detected: false, mentionCount: 0, quotes: [], isSoleDecisionMaker: "unclear" },
    spousePartnerMentions: { detected: false, mentionCount: 0, quotes: [] },
    objectionsDetected: [],
  };
}

// Main detection function - analyzes full transcript
export async function analyzeTranscriptForDetection(
  transcript: string,
  ammoConfig?: AmmoConfig | null,
  manifesto?: CallManifesto
): Promise<DetectionResults> {
  // Need minimum transcript length for meaningful analysis
  if (!transcript || transcript.trim().length < 200) {
    logger.info("Transcript too short for detection analysis");
    return getEmptyResults();
  }

  try {
    const systemPrompt = buildDetectionPrompt(ammoConfig, manifesto);

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Analyze this sales call transcript:\n\n${transcript}`,
        },
      ],
      system: systemPrompt,
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

    const results = JSON.parse(jsonStr) as DetectionResults;

    // Validate and log results
    const detectedCategories = [];
    if (results.budgetDiscussion?.detected) detectedCategories.push("budget");
    if (results.timelineUrgency?.detected) detectedCategories.push("timeline");
    if (results.decisionMakerDetection?.detected) detectedCategories.push("decision-maker");
    if (results.spousePartnerMentions?.detected) detectedCategories.push("spouse");
    if (results.objectionsDetected?.length > 0) {
      detectedCategories.push(`objections(${results.objectionsDetected.length})`);
    }

    if (detectedCategories.length > 0) {
      logger.info(`Detection complete: Found ${detectedCategories.join(", ")}`);
    } else {
      logger.info("Detection complete: No key indicators found");
    }

    return results;
  } catch (error) {
    logger.error("Failed to analyze transcript for detection", error);
    return getEmptyResults();
  }
}
