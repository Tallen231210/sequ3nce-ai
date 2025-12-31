// Smart Nudges - Real-time coaching suggestions during calls
// Hybrid approach: keyword triggers for speed + contextual messages for helpfulness

import { logger } from "./logger.js";
import type { AmmoConfig } from "./types.js";

export type NudgeType = "dig_deeper" | "missing_info" | "script_reminder" | "objection_warning";

export interface Nudge {
  type: NudgeType;
  message: string;
  detail?: string;
  triggeredBy?: string;
  priority?: "high" | "medium" | "low";
}

export interface NudgeContext {
  ammoConfig: AmmoConfig | null;
  transcript: string; // Full transcript so far
  callDurationSeconds: number;
  uncoveredInfo: Set<string>; // IDs of required info that has been uncovered
  recentSegment?: string; // Most recent transcript segment (for context)
}

interface NudgeState {
  lastNudgeTime: number;
  lastNudgeByType: Map<NudgeType, number>;
  triggeredKeywords: Set<string>;
  triggeredObjections: Set<string>;
  lastScriptStageReminder: number;
  currentScriptStage: number;
}

// Cooldown settings
const NUDGE_COOLDOWN_MS = 20000; // 20 seconds between any nudges (reduced for more responsive coaching)
const NUDGE_TYPE_COOLDOWN_MS = 90000; // 90 seconds before repeating same type
const SCRIPT_REMINDER_INTERVAL_MS = 180000; // 3 minutes between script reminders

// ============================================================
// DEFAULT NUDGE TRIGGERS - Work without any configuration
// ============================================================

// Default objection triggers (highest priority nudges)
const DEFAULT_OBJECTIONS = [
  // Spouse/Partner Objection
  {
    keywords: ["spouse", "wife", "husband", "partner", "significant other", "better half"],
    message: "Spouse objection incoming",
    detail: "Ask: 'If your [spouse] were here right now and loved it, what would stop you from moving forward today?'",
    priority: "high" as const,
  },
  // Decision Maker Objection
  {
    keywords: ["business partner", "my partner", "check with my", "talk to my", "run it by", "ask my"],
    message: "Decision maker concern",
    detail: "Ask: 'Are they typically supportive of decisions you make for [business/yourself]?'",
    priority: "high" as const,
  },
  // Think About It / Hesitation
  {
    keywords: ["think about it", "let me think", "need to think", "sleep on it", "mull it over"],
    message: "Hesitation detected",
    detail: "Ask: 'I totally get it — when you say think about it, is it the money, the timing, or something else?'",
    priority: "high" as const,
  },
  // Price Objection
  {
    keywords: ["too expensive", "can't afford", "out of my budget", "that's a lot", "don't have the money", "too much money"],
    message: "Budget objection",
    detail: "Pivot to value: 'I hear you. Let me ask — if money wasn't a factor, would this be a no-brainer?'",
    priority: "high" as const,
  },
  // Timing Objection
  {
    keywords: ["bad timing", "not the right time", "maybe later", "in a few months", "not right now", "after the holidays", "next quarter"],
    message: "Timing objection",
    detail: "Create urgency: 'What changes in [time period] that would make this easier?'",
    priority: "high" as const,
  },
  // Past Failure / Trust Issues
  {
    keywords: ["been burned", "tried before", "didn't work", "scam", "ripped off", "waste of money", "skeptical"],
    message: "Trust concern detected",
    detail: "Acknowledge and differentiate: 'What specifically didn't work? Let me show you why this is different.'",
    priority: "high" as const,
  },
  // Sounds Great But...
  {
    keywords: ["sounds great but", "sounds good but", "i like it but", "interesting but", "love it but"],
    message: "Objection incoming",
    detail: "They're about to reveal their real concern — listen carefully and address it head-on",
    priority: "medium" as const,
  },
  // Need More Info
  {
    keywords: ["need more information", "need to research", "do more research", "look into it more", "compare options"],
    message: "Research stall",
    detail: "Ask: 'What specific information would help you make a decision today?'",
    priority: "medium" as const,
  },
  // Not Sure
  {
    keywords: ["not sure", "don't know if", "uncertain", "on the fence", "torn"],
    message: "Uncertainty detected",
    detail: "Dig in: 'What part are you unsure about? Let's talk through it.'",
    priority: "medium" as const,
  },
];

// Default pain point triggers (dig deeper nudges)
const DEFAULT_PAIN_TRIGGERS = [
  // Financial Pain
  {
    keywords: ["losing money", "wasting money", "bleeding cash", "revenue down", "sales dropped", "can't grow"],
    message: "Financial pain detected",
    detail: "Get specifics: 'How much would you say that's costing you per month?'",
    category: "financial",
  },
  // Emotional Pain
  {
    keywords: ["stressed", "overwhelmed", "frustrated", "exhausted", "burned out", "can't sleep", "anxious", "worried"],
    message: "Emotional pain detected",
    detail: "Dig deeper: 'How long have you been dealing with this? How is it affecting you?'",
    category: "emotional",
  },
  // Time Pain
  {
    keywords: ["no time", "too busy", "working 60 hours", "working weekends", "never see my family", "missing out"],
    message: "Time pain detected",
    detail: "Quantify it: 'How many hours a week would you say this is costing you?'",
    category: "situational",
  },
  // Relationship Pain
  {
    keywords: ["wife is frustrated", "husband doesn't understand", "family is suffering", "marriage strain", "kids don't see me"],
    message: "Relationship impact",
    detail: "Heavy hitter! Get them to elaborate on the personal cost.",
    category: "emotional",
  },
  // Failure/Stuck
  {
    keywords: ["tried everything", "nothing works", "stuck", "plateau", "at my limit", "don't know what else"],
    message: "Stuck point detected",
    detail: "Ask: 'What have you tried before? Why do you think it didn't work?'",
    category: "situational",
  },
  // Urgency Signals
  {
    keywords: ["need this now", "can't wait", "have to fix this", "deadline", "running out of time", "before"],
    message: "Urgency signal",
    detail: "Lock it down: 'What happens if this doesn't get fixed by [deadline]?'",
    category: "situational",
  },
];

// Default script stages (for calls without custom framework)
const DEFAULT_SCRIPT_STAGES = [
  { name: "Rapport & Agenda", durationPercent: 10, reminder: "Set the agenda and build initial rapport" },
  { name: "Situation & Background", durationPercent: 15, reminder: "Understand their current situation" },
  { name: "Pain Discovery", durationPercent: 25, reminder: "Uncover the real pain — financial, emotional, situational" },
  { name: "Future Pacing", durationPercent: 15, reminder: "Paint the picture of success — what does life look like after?" },
  { name: "Solution Presentation", durationPercent: 15, reminder: "Present your solution tied to their specific pain points" },
  { name: "Handle Objections", durationPercent: 10, reminder: "Address concerns using their own words (ammo)" },
  { name: "Close", durationPercent: 10, reminder: "Ask for the commitment — use their pain and urgency" },
];

// Default required info to uncover
const DEFAULT_REQUIRED_INFO = [
  { id: "budget", label: "Budget/Investment capacity", keywords: ["budget", "afford", "invest", "spend", "cost"] },
  { id: "timeline", label: "Timeline/Urgency", keywords: ["when", "deadline", "soon", "urgent", "immediately"] },
  { id: "decision_maker", label: "Decision maker", keywords: ["decide", "spouse", "partner", "boss", "alone"] },
  { id: "pain_point", label: "Core pain point", keywords: ["problem", "struggle", "challenge", "issue", "pain"] },
  { id: "goal", label: "Desired outcome", keywords: ["want", "goal", "achieve", "result", "outcome"] },
];

// ============================================================
// NUDGE STATE MANAGEMENT
// ============================================================

export function createNudgeState(): NudgeState {
  return {
    lastNudgeTime: 0,
    lastNudgeByType: new Map(),
    triggeredKeywords: new Set(),
    triggeredObjections: new Set(),
    lastScriptStageReminder: 0,
    currentScriptStage: 0,
  };
}

function canSendNudge(state: NudgeState, type: NudgeType): boolean {
  const now = Date.now();

  // Global cooldown
  if (now - state.lastNudgeTime < NUDGE_COOLDOWN_MS) {
    return false;
  }

  // Type-specific cooldown
  const lastTypeTime = state.lastNudgeByType.get(type) || 0;
  if (now - lastTypeTime < NUDGE_TYPE_COOLDOWN_MS) {
    return false;
  }

  return true;
}

function markNudgeSent(state: NudgeState, type: NudgeType): void {
  const now = Date.now();
  state.lastNudgeTime = now;
  state.lastNudgeByType.set(type, now);
}

// ============================================================
// NUDGE DETECTION FUNCTIONS
// ============================================================

// Check for objection triggers (works with or without config)
function detectObjections(
  transcript: string,
  state: NudgeState,
  customObjections?: AmmoConfig["commonObjections"]
): Nudge | null {
  const lowerTranscript = transcript.toLowerCase();

  // Build combined objection list (defaults + custom)
  const allObjections = [...DEFAULT_OBJECTIONS];

  // Add custom objections if provided (LAYER on top of defaults)
  if (customObjections) {
    for (const obj of customObjections) {
      allObjections.push({
        keywords: obj.keywords,
        message: `"${obj.label}" detected`,
        detail: "Prepare to handle this objection",
        priority: "high" as const,
      });
    }
  }

  // Check each objection
  for (const objection of allObjections) {
    for (const keyword of objection.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (
        lowerTranscript.includes(lowerKeyword) &&
        !state.triggeredObjections.has(lowerKeyword) &&
        canSendNudge(state, "objection_warning")
      ) {
        state.triggeredObjections.add(lowerKeyword);
        markNudgeSent(state, "objection_warning");

        logger.info(`Nudge triggered: objection_warning for "${keyword}"`);

        return {
          type: "objection_warning",
          message: objection.message,
          detail: objection.detail,
          triggeredBy: keyword,
          priority: objection.priority,
        };
      }
    }
  }

  return null;
}

// Check for pain point triggers (dig deeper nudges)
function detectPainPoints(
  transcript: string,
  state: NudgeState,
  customCategories?: AmmoConfig["ammoCategories"]
): Nudge | null {
  const lowerTranscript = transcript.toLowerCase();

  // Build combined pain trigger list
  const allTriggers = [...DEFAULT_PAIN_TRIGGERS];

  // Add custom category keywords if provided (LAYER on top of defaults)
  if (customCategories) {
    for (const cat of customCategories) {
      allTriggers.push({
        keywords: cat.keywords,
        message: `${cat.name} topic detected`,
        detail: `Dig deeper on this ${cat.name.toLowerCase()} topic`,
        category: cat.name.toLowerCase(),
      });
    }
  }

  // Check each trigger
  for (const trigger of allTriggers) {
    for (const keyword of trigger.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (
        lowerTranscript.includes(lowerKeyword) &&
        !state.triggeredKeywords.has(lowerKeyword) &&
        canSendNudge(state, "dig_deeper")
      ) {
        state.triggeredKeywords.add(lowerKeyword);
        markNudgeSent(state, "dig_deeper");

        logger.info(`Nudge triggered: dig_deeper for "${keyword}"`);

        return {
          type: "dig_deeper",
          message: trigger.message,
          detail: trigger.detail,
          triggeredBy: keyword,
          priority: "medium",
        };
      }
    }
  }

  return null;
}

// Check for missing required info (after sufficient call time)
function detectMissingInfo(
  transcript: string,
  callDurationSeconds: number,
  state: NudgeState,
  uncoveredInfo: Set<string>,
  customRequiredInfo?: AmmoConfig["requiredInfo"]
): Nudge | null {
  // Only check after 5 minutes into the call
  if (callDurationSeconds < 300) {
    return null;
  }

  if (!canSendNudge(state, "missing_info")) {
    return null;
  }

  const lowerTranscript = transcript.toLowerCase();

  // Build required info list (defaults + custom)
  const allRequired = customRequiredInfo && customRequiredInfo.length > 0
    ? customRequiredInfo
    : DEFAULT_REQUIRED_INFO;

  // Find first missing piece of info
  for (const info of allRequired) {
    if (uncoveredInfo.has(info.id)) {
      continue; // Already uncovered
    }

    // Check if any keywords for this info appear in transcript
    const keywords = (info as any).keywords || info.label.toLowerCase().split(/\s+/);
    const found = keywords.some((kw: string) => lowerTranscript.includes(kw.toLowerCase()));

    if (!found) {
      markNudgeSent(state, "missing_info");

      logger.info(`Nudge triggered: missing_info for "${info.label}"`);

      return {
        type: "missing_info",
        message: `Haven't uncovered: ${info.label}`,
        detail: (info as any).description || `Ask about their ${info.label.toLowerCase()}`,
        priority: "low",
      };
    }
  }

  return null;
}

// Script stage reminders
function detectScriptStageReminder(
  callDurationSeconds: number,
  state: NudgeState,
  customFramework?: AmmoConfig["scriptFramework"]
): Nudge | null {
  // Only remind after 1 minute into the call
  if (callDurationSeconds < 60) {
    return null;
  }

  // Check cooldown
  if (Date.now() - state.lastScriptStageReminder < SCRIPT_REMINDER_INTERVAL_MS) {
    return null;
  }

  if (!canSendNudge(state, "script_reminder")) {
    return null;
  }

  // Use custom framework if available, otherwise defaults
  const framework = customFramework && customFramework.length > 0
    ? customFramework.map((s, i) => ({
        name: s.name,
        durationPercent: 100 / customFramework.length,
        reminder: s.description || `Focus on ${s.name}`,
      }))
    : DEFAULT_SCRIPT_STAGES;

  // Calculate expected stage based on 30-minute call assumption
  const assumedCallLength = 1800; // 30 minutes in seconds
  const progressPercent = (callDurationSeconds / assumedCallLength) * 100;

  let cumulativePercent = 0;
  let expectedStage = framework[0];
  let expectedStageIndex = 0;

  for (let i = 0; i < framework.length; i++) {
    cumulativePercent += framework[i].durationPercent;
    if (progressPercent <= cumulativePercent) {
      expectedStage = framework[i];
      expectedStageIndex = i;
      break;
    }
  }

  // Only remind if we've moved to a new stage
  if (expectedStageIndex <= state.currentScriptStage) {
    return null;
  }

  state.currentScriptStage = expectedStageIndex;
  state.lastScriptStageReminder = Date.now();
  markNudgeSent(state, "script_reminder");

  logger.info(`Nudge triggered: script_reminder for stage "${expectedStage.name}"`);

  return {
    type: "script_reminder",
    message: `Stage: ${expectedStage.name}`,
    detail: expectedStage.reminder,
    priority: "low",
  };
}

// ============================================================
// MAIN NUDGE GENERATION FUNCTION
// ============================================================

export function generateNudge(
  context: NudgeContext,
  state: NudgeState
): Nudge | null {
  const { transcript, callDurationSeconds, uncoveredInfo, ammoConfig } = context;

  // Priority 1: Objection warnings (highest priority)
  const objectionNudge = detectObjections(
    transcript,
    state,
    ammoConfig?.commonObjections
  );
  if (objectionNudge) {
    return objectionNudge;
  }

  // Priority 2: Pain point dig deeper prompts
  const painNudge = detectPainPoints(
    transcript,
    state,
    ammoConfig?.ammoCategories
  );
  if (painNudge) {
    return painNudge;
  }

  // Priority 3: Missing info alerts (after 5 mins)
  const missingInfoNudge = detectMissingInfo(
    transcript,
    callDurationSeconds,
    state,
    uncoveredInfo,
    ammoConfig?.requiredInfo
  );
  if (missingInfoNudge) {
    return missingInfoNudge;
  }

  // Priority 4: Script stage reminders
  const scriptNudge = detectScriptStageReminder(
    callDurationSeconds,
    state,
    ammoConfig?.scriptFramework
  );
  if (scriptNudge) {
    return scriptNudge;
  }

  return null;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Check which required info has been uncovered in the transcript
export function checkUncoveredInfo(
  transcript: string,
  requiredInfo?: Array<{ id: string; label: string; description?: string }>
): Set<string> {
  const uncovered = new Set<string>();
  const lowerTranscript = transcript.toLowerCase();

  // Use custom required info if provided, otherwise defaults
  const infoToCheck = requiredInfo && requiredInfo.length > 0
    ? requiredInfo
    : DEFAULT_REQUIRED_INFO;

  for (const info of infoToCheck) {
    // Get keywords to check
    const keywords = (info as any).keywords ||
      [...info.label.toLowerCase().split(/\s+/), ...(info.description?.toLowerCase().split(/\s+/) || [])];

    // Filter to significant words only
    const significantKeywords = keywords.filter((w: string) => w.length > 3);

    // If at least half the significant words appear, consider it uncovered
    const matchingWords = significantKeywords.filter((word: string) =>
      lowerTranscript.includes(word)
    );

    if (matchingWords.length >= Math.ceil(significantKeywords.length / 2)) {
      uncovered.add(info.id);
    }
  }

  return uncovered;
}
