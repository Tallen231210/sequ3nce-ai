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
const AMMO_V2_SYSTEM_PROMPT = `You are an expert sales call analyst. Your job is to COUNT EVIDENCE of buying beliefs from the prospect's words.

## CONTEXT
This is a sales call between a Closer (sales rep) and a Prospect (potential customer).
[Closer] = Sales representative
[Prospect] = Potential customer

## YOUR TASK: COUNT EVIDENCE

For each buying belief, count how many times the prospect has PROVIDED EVIDENCE for that belief. Each piece of evidence adds to the score.

**CRITICAL: INTRODUCTIONS ARE NOT EVIDENCE**
- Greetings like "Hi", "Thanks for calling", "Nice to meet you" = 0% (NO evidence)
- Small talk about weather, weekend, how they're doing = 0% (NO evidence)
- Polite acknowledgments like "Sure", "Okay", "Sounds good" = 0% (NO evidence)
- ONLY count SUBSTANTIVE statements about their actual situation, problems, desires, or concerns
- The first 1-2 minutes of a call is typically introductions - expect 0% for everything during this time

**EVIDENCE-BASED SCORING:**
- 0%: No evidence found (DEFAULT - start here, stay here during introductions)
- 10-20%: 1 brief mention or hint about a real issue/desire
- 25-40%: 1-2 clear statements about this topic
- 45-60%: Multiple mentions OR one detailed discussion
- 65-80%: Several clear statements with emotional weight
- 85-100%: Repeated emphasis, strong emotion, explicit statements

**KEY PRINCIPLE:** Scores should ACCUMULATE as the prospect provides more evidence throughout the call. More mentions = higher score. More detail = higher score.

## WHAT TO ANALYZE

### 1. ENGAGEMENT LEVEL
How engaged is the prospect RIGHT NOW in this conversation?

- "high" - Giving substantive answers, expanding on topics, sharing details voluntarily, emotionally invested, seems interested
- "medium" - Responding adequately, neutral tone, answering questions but not elaborating much
- "low" - Very short answers, seems distracted or disinterested, resistant, wants to get off the call

### 2. BUYING BELIEFS (Count Evidence)
For each belief, count the evidence the prospect has given:

1. **problem** - Evidence they believe they have a real problem
   - Count: mentions of struggles, frustrations, challenges, things not working

2. **solution** - Evidence they believe a solution exists
   - Count: mentions of wanting to fix it, belief that things can change, openness to help

3. **vehicle** - Evidence they believe THIS solution could work for them
   - Count: positive reactions to the offer, questions showing interest, statements like "that makes sense"

4. **self** - Evidence they believe THEY can succeed with it
   - Count: confidence statements, past successes mentioned, willingness to put in work

5. **time** - Evidence they believe NOW is the right time
   - Count: urgency statements, deadlines mentioned, "can't keep going like this"

6. **money** - Evidence they see the value / aren't blocked by price
   - Count: value statements, budget flexibility mentioned, "it's not about the money"

7. **urgency** - Evidence there's pressure to decide soon
   - Count: timeline mentions, consequences of waiting, external deadlines

### 3. OBJECTION PREDICTION
Based on what you've heard, predict likely objections:
- "think_about_it" - Need time to think/decide
- "spouse" - Need to talk to spouse/partner
- "money" - Price/budget concerns
- "time" - Bad timing, too busy
- "trust" - Skeptical it will work
- "comparison" - Wants to look at other options

### 4. PAIN POINTS
Extract exact quotes where the PROSPECT expresses pain, frustration, or problems.

**CRITICAL: ONLY include quotes from [Prospect] lines. NEVER include quotes from [Closer] lines.**
- Look for lines starting with "[Prospect]:" and extract pain/frustration quotes from those ONLY
- If you see a quote from [Closer], do NOT include it even if it sounds like a pain point
- Pain points = prospect describing THEIR struggles, problems, frustrations, fears, or desires

### 5. LIVE SUMMARY
Write a brief 2-3 sentence summary of what's happening in the call RIGHT NOW.
- What topic is currently being discussed?
- How is the conversation progressing?
- Keep it concise and useful for the closer to glance at during the call

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
  "pain_points": ["exact quote 1", "exact quote 2"],
  "live_summary": "2-3 sentence summary of what's happening in the call"
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
  liveSummary?: string;
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
  live_summary?: string;
}

export class AmmoAnalyzer {
  private lastTranscriptLength = 0;
  private analysisInterval: NodeJS.Timeout | null = null;
  private callId: string;
  private teamId: string;
  private onAnalysisCallback: ((analysis: AmmoV2Analysis) => void) | null = null;
  // High water mark: track previous scores so they only go up, never down
  private previousScores: AmmoV2Analysis['beliefs'] | null = null;
  // Accumulate all pain points across the call
  private allPainPoints: Set<string> = new Set();

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
        liveSummary: rawAnalysis.live_summary || undefined,
      };

      // Apply high water mark: scores can only go UP, never down
      if (this.previousScores) {
        analysis.beliefs = {
          problem: Math.max(this.previousScores.problem, analysis.beliefs.problem),
          solution: Math.max(this.previousScores.solution, analysis.beliefs.solution),
          vehicle: Math.max(this.previousScores.vehicle, analysis.beliefs.vehicle),
          self: Math.max(this.previousScores.self, analysis.beliefs.self),
          time: Math.max(this.previousScores.time, analysis.beliefs.time),
          money: Math.max(this.previousScores.money, analysis.beliefs.money),
          urgency: Math.max(this.previousScores.urgency, analysis.beliefs.urgency),
        };
      }
      // Save current scores as the new high water mark
      this.previousScores = { ...analysis.beliefs };

      // Accumulate pain points across the call (never lose them)
      for (const point of analysis.painPoints) {
        this.allPainPoints.add(point);
      }
      // No limit - capture all pain points, let UI handle scrolling
      analysis.painPoints = Array.from(this.allPainPoints);

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
    // Reset high water mark for next call
    this.previousScores = null;
    this.allPainPoints.clear();
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
            liveSummary: analysis.liveSummary,
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
