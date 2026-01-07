// Ammo V2: Real-time AI-powered sales call analysis using Claude Haiku
// Analyzes engagement, buying beliefs, objection prediction, and pain points

import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Convex site URL for HTTP calls
const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || process.env.CONVEX_URL?.replace('.convex.cloud', '.convex.site');

// System prompt for Ammo V2 analysis
const AMMO_V2_SYSTEM_PROMPT = `You are an expert sales call analyst. Analyze the transcript and return a JSON analysis.

## CONTEXT
This is a sales call between a Closer (sales rep) and a Prospect (potential customer).
[Closer] = Sales representative
[Prospect] = Potential customer

## WHAT TO ANALYZE

### 1. ENGAGEMENT LEVEL
Assess how engaged the prospect is in the conversation:
- "high" - Prospect is asking questions, sharing details, actively participating
- "medium" - Prospect is responding but not highly invested
- "low" - Short answers, distracted, not opening up

### 2. BUYING BELIEFS (Cole Gordon's 7 Beliefs Framework)
Rate each belief from 0-100 based on evidence in the transcript:

1. **problem** - Does the prospect believe they have a real problem?
   - 0-30: Doesn't think they have a problem
   - 40-60: Acknowledges issues but not urgent
   - 70-100: Clearly recognizes they have a significant problem

2. **solution** - Does the prospect believe a solution exists?
   - 0-30: Skeptical that anything can help
   - 40-60: Open to the idea but not convinced
   - 70-100: Believes solutions exist

3. **vehicle** - Does the prospect believe THIS solution is the right one?
   - 0-30: Doubts this specific offering
   - 40-60: Interested but comparing options
   - 70-100: Sees this as the right vehicle

4. **self** - Does the prospect believe THEY can succeed with it?
   - 0-30: Doubts their ability to implement/use it
   - 40-60: Some confidence concerns
   - 70-100: Believes they can do it

5. **time** - Does the prospect believe NOW is the right time?
   - 0-30: Wants to wait, bad timing mentioned
   - 40-60: Timing not ideal but open
   - 70-100: Ready to act now

6. **money** - Does the prospect believe it's worth the investment?
   - 0-30: Price is a major concern
   - 40-60: Weighing value vs cost
   - 70-100: Sees value, money not primary concern

7. **urgency** - Is there urgency to make a decision?
   - 0-30: No time pressure
   - 40-60: Some motivation but not urgent
   - 70-100: Strong urgency to solve this

IMPORTANT: Start all beliefs at 0 if not mentioned. Only increase based on EVIDENCE in the transcript.

### 3. OBJECTION PREDICTION
Based on the conversation, predict which objections the prospect is likely to raise:
- "think_about_it" - Need time to think/decide
- "spouse" - Need to talk to spouse/partner
- "money" - Price/budget concerns
- "time" - Bad timing, too busy
- "trust" - Skeptical it will work
- "comparison" - Wants to look at other options

Rate probability 0-100 for top 2-3 most likely objections.

### 4. PAIN POINTS
Extract 0-5 exact quotes where the prospect expresses pain, frustration, or problems.
These should be verbatim quotes from the [Prospect] only.

## OUTPUT FORMAT

Return ONLY valid JSON (no markdown, no explanation):
{
  "engagement": {
    "level": "high|medium|low",
    "reason": "Brief explanation"
  },
  "beliefs": {
    "problem": 0-100,
    "solution": 0-100,
    "vehicle": 0-100,
    "self": 0-100,
    "time": 0-100,
    "money": 0-100,
    "urgency": 0-100
  },
  "objection_prediction": [
    {"type": "string", "probability": 0-100}
  ],
  "pain_points": ["exact quote 1", "exact quote 2"]
}`;

// Types for Ammo V2 analysis
export interface AmmoV2Analysis {
  engagement: {
    level: "high" | "medium" | "low";
    reason: string;
  };
  beliefs: {
    problem: number;
    solution: number;
    vehicle: number;
    self: number;
    time: number;
    money: number;
    urgency: number;
  };
  objectionPrediction: Array<{
    type: string;
    probability: number;
  }>;
  painPoints: string[];
}

// Raw response from Claude (snake_case)
interface RawAmmoV2Response {
  engagement: {
    level: string;
    reason: string;
  };
  beliefs: {
    problem: number;
    solution: number;
    vehicle: number;
    self: number;
    time: number;
    money: number;
    urgency: number;
  };
  objection_prediction: Array<{
    type: string;
    probability: number;
  }>;
  pain_points: string[];
}

export class AmmoAnalyzer {
  private lastTranscriptLength = 0;
  private analysisInterval: NodeJS.Timeout | null = null;
  private callId: string;
  private teamId: string;
  private onAnalysisCallback: ((analysis: AmmoV2Analysis) => void) | null = null;

  constructor(callId: string, teamId: string) {
    this.callId = callId;
    this.teamId = teamId;
  }

  /**
   * Run a single analysis on the current transcript
   */
  async analyze(transcript: string): Promise<AmmoV2Analysis | null> {
    // Skip if transcript too short (less than ~500 chars)
    if (!transcript || transcript.length < 500) {
      logger.info(`[AmmoAnalyzer] Transcript too short for analysis (${transcript?.length || 0} chars)`);
      return null;
    }

    // Skip if no new content since last analysis
    if (transcript.length === this.lastTranscriptLength) {
      logger.info(`[AmmoAnalyzer] No new content since last analysis`);
      return null;
    }

    this.lastTranscriptLength = transcript.length;

    // Truncate if too long (keep most recent ~32k chars for context window)
    const maxChars = 32000;
    const preparedTranscript = transcript.length > maxChars
      ? transcript.slice(-maxChars)
      : transcript;

    try {
      logger.info(`[AmmoAnalyzer] Running analysis on ${preparedTranscript.length} chars of transcript`);

      const response = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        system: AMMO_V2_SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Analyze this sales call transcript and return the JSON analysis.\n\nTRANSCRIPT:\n${preparedTranscript}`
        }]
      });

      // Extract text response
      const responseText = response.content[0].type === "text" ? response.content[0].text : "";

      // Parse JSON response
      let jsonStr = responseText.trim();

      // Handle potential markdown code blocks
      if (jsonStr.startsWith("```")) {
        const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) {
          jsonStr = match[1].trim();
        }
      }

      const rawAnalysis: RawAmmoV2Response = JSON.parse(jsonStr);

      // Convert to camelCase and validate
      const analysis: AmmoV2Analysis = {
        engagement: {
          level: this.validateEngagementLevel(rawAnalysis.engagement?.level),
          reason: rawAnalysis.engagement?.reason || "No reason provided",
        },
        beliefs: {
          problem: this.clampScore(rawAnalysis.beliefs?.problem),
          solution: this.clampScore(rawAnalysis.beliefs?.solution),
          vehicle: this.clampScore(rawAnalysis.beliefs?.vehicle),
          self: this.clampScore(rawAnalysis.beliefs?.self),
          time: this.clampScore(rawAnalysis.beliefs?.time),
          money: this.clampScore(rawAnalysis.beliefs?.money),
          urgency: this.clampScore(rawAnalysis.beliefs?.urgency),
        },
        objectionPrediction: (rawAnalysis.objection_prediction || [])
          .filter(o => o && typeof o.type === "string" && typeof o.probability === "number")
          .map(o => ({
            type: o.type,
            probability: this.clampScore(o.probability),
          }))
          .slice(0, 3), // Max 3 objections
        painPoints: (rawAnalysis.pain_points || [])
          .filter(p => typeof p === "string" && p.length > 0)
          .slice(0, 5), // Max 5 pain points
      };

      logger.info(`[AmmoAnalyzer] Analysis complete: engagement=${analysis.engagement.level}, beliefs=${JSON.stringify(analysis.beliefs)}`);

      return analysis;
    } catch (error) {
      logger.error(`[AmmoAnalyzer] Analysis failed`, error);
      return null;
    }
  }

  /**
   * Start periodic analysis at the specified interval
   */
  startPeriodicAnalysis(
    getTranscript: () => string,
    onAnalysis: (analysis: AmmoV2Analysis) => void,
    intervalMs: number = 45000
  ): void {
    this.onAnalysisCallback = onAnalysis;

    logger.info(`[AmmoAnalyzer] Starting periodic analysis every ${intervalMs / 1000}s for call ${this.callId}`);

    this.analysisInterval = setInterval(async () => {
      try {
        const transcript = getTranscript();
        const analysis = await this.analyze(transcript);

        if (analysis) {
          // Save to Convex
          await this.saveToConvex(analysis);

          // Notify callback (for WebSocket to desktop)
          if (this.onAnalysisCallback) {
            this.onAnalysisCallback(analysis);
          }
        }
      } catch (error) {
        logger.error(`[AmmoAnalyzer] Periodic analysis failed`, error);
      }
    }, intervalMs);
  }

  /**
   * Stop the periodic analysis
   */
  stop(): void {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
      logger.info(`[AmmoAnalyzer] Stopped periodic analysis for call ${this.callId}`);
    }
    this.lastTranscriptLength = 0;
    this.onAnalysisCallback = null;
  }

  /**
   * Save analysis to Convex via HTTP endpoint
   */
  private async saveToConvex(analysis: AmmoV2Analysis): Promise<void> {
    if (!CONVEX_SITE_URL) {
      logger.error(`[AmmoAnalyzer] CONVEX_SITE_URL not configured`);
      return;
    }

    try {
      const response = await fetch(`${CONVEX_SITE_URL}/updateAmmoAnalysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId: this.callId,
          analysis: {
            engagement: analysis.engagement,
            beliefs: analysis.beliefs,
            objectionPrediction: analysis.objectionPrediction,
            painPoints: analysis.painPoints,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`[AmmoAnalyzer] Failed to save to Convex: ${response.status} ${errorText}`);
      } else {
        logger.info(`[AmmoAnalyzer] Analysis saved to Convex for call ${this.callId}`);
      }
    } catch (error) {
      logger.error(`[AmmoAnalyzer] Error saving to Convex`, error);
    }
  }

  /**
   * Check if a team has Ammo V2 enabled
   */
  static async isAmmoV2Enabled(teamId: string): Promise<boolean> {
    if (!CONVEX_SITE_URL) {
      logger.warn(`[AmmoAnalyzer] CONVEX_SITE_URL not configured, defaulting to false`);
      return false;
    }

    try {
      const response = await fetch(`${CONVEX_SITE_URL}/isAmmoV2Enabled?teamId=${encodeURIComponent(teamId)}`);

      if (!response.ok) {
        logger.error(`[AmmoAnalyzer] Failed to check Ammo V2 status: ${response.status}`);
        return false;
      }

      const data = await response.json();
      return data.enabled === true;
    } catch (error) {
      logger.error(`[AmmoAnalyzer] Error checking Ammo V2 status`, error);
      return false;
    }
  }

  /**
   * Validate engagement level
   */
  private validateEngagementLevel(level: string | undefined): "high" | "medium" | "low" {
    if (level === "high" || level === "medium" || level === "low") {
      return level;
    }
    return "medium"; // Default
  }

  /**
   * Clamp score to 0-100 range
   */
  private clampScore(score: number | undefined): number {
    if (typeof score !== "number" || isNaN(score)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
