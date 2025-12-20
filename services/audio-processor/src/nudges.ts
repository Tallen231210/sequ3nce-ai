// Smart Nudges - Real-time coaching suggestions during calls

import { logger } from "./logger.js";
import type { AmmoConfig } from "./types.js";

export type NudgeType = "dig_deeper" | "missing_info" | "script_reminder" | "objection_warning";

export interface Nudge {
  type: NudgeType;
  message: string;
  detail?: string;
  triggeredBy?: string;
}

export interface NudgeContext {
  ammoConfig: AmmoConfig | null;
  transcript: string; // Full transcript so far
  callDurationSeconds: number;
  uncoveredInfo: Set<string>; // IDs of required info that has been uncovered
}

interface NudgeState {
  lastNudgeTime: number;
  lastNudgeByType: Map<NudgeType, number>;
  triggeredKeywords: Set<string>;
  triggeredObjections: Set<string>;
  lastScriptStageReminder: number;
}

const NUDGE_COOLDOWN_MS = 30000; // 30 seconds between any nudges
const NUDGE_TYPE_COOLDOWN_MS = 120000; // 2 minutes before repeating same type
const SCRIPT_REMINDER_INTERVAL_MS = 180000; // 3 minutes between script reminders

// Create initial nudge state for a new call
export function createNudgeState(): NudgeState {
  return {
    lastNudgeTime: 0,
    lastNudgeByType: new Map(),
    triggeredKeywords: new Set(),
    triggeredObjections: new Set(),
    lastScriptStageReminder: 0,
  };
}

// Check if we can send a nudge (respecting cooldowns)
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

// Mark that we sent a nudge
function markNudgeSent(state: NudgeState, type: NudgeType): void {
  const now = Date.now();
  state.lastNudgeTime = now;
  state.lastNudgeByType.set(type, now);
}

// Default nudge detection for teams without config
function detectDefaultNudges(
  transcript: string,
  state: NudgeState
): Nudge | null {
  const lowerTranscript = transcript.toLowerCase();

  // Default objection keywords
  const defaultObjections = [
    { keyword: "spouse", message: "Spouse mentioned", detail: "Prepare for spouse objection - consider asking about decision-making process" },
    { keyword: "wife", message: "Spouse mentioned", detail: "Prepare for spouse objection - consider asking about decision-making process" },
    { keyword: "husband", message: "Spouse mentioned", detail: "Prepare for spouse objection - consider asking about decision-making process" },
    { keyword: "think about it", message: "Hesitation detected", detail: "Prospect needs to think - dig into what specifically they need to consider" },
    { keyword: "let me think", message: "Hesitation detected", detail: "Prospect needs to think - dig into what specifically they need to consider" },
    { keyword: "too expensive", message: "Price objection", detail: "Price concern raised - focus on value and ROI" },
    { keyword: "can't afford", message: "Budget concern", detail: "Budget constraint mentioned - explore payment options or true priority" },
    { keyword: "not sure", message: "Uncertainty detected", detail: "Prospect is uncertain - ask clarifying questions to uncover the real concern" },
    { keyword: "been burned", message: "Trust issue", detail: "Past negative experience - address trust and differentiate your solution" },
  ];

  for (const obj of defaultObjections) {
    if (
      lowerTranscript.includes(obj.keyword) &&
      !state.triggeredObjections.has(obj.keyword) &&
      canSendNudge(state, "objection_warning")
    ) {
      state.triggeredObjections.add(obj.keyword);
      markNudgeSent(state, "objection_warning");
      return {
        type: "objection_warning",
        message: obj.message,
        detail: obj.detail,
        triggeredBy: obj.keyword,
      };
    }
  }

  return null;
}

// Detect nudges based on custom ammo config
function detectConfiguredNudges(
  transcript: string,
  config: AmmoConfig,
  state: NudgeState,
  callDurationSeconds: number,
  uncoveredInfo: Set<string>
): Nudge | null {
  const lowerTranscript = transcript.toLowerCase();

  // 1. Check for objection warnings (highest priority)
  for (const objection of config.commonObjections) {
    for (const keyword of objection.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (
        lowerTranscript.includes(lowerKeyword) &&
        !state.triggeredObjections.has(objection.id) &&
        canSendNudge(state, "objection_warning")
      ) {
        state.triggeredObjections.add(objection.id);
        markNudgeSent(state, "objection_warning");
        return {
          type: "objection_warning",
          message: `"${objection.label}" detected`,
          detail: `Prepare to handle this objection`,
          triggeredBy: keyword,
        };
      }
    }
  }

  // 2. Dig deeper prompts based on ammo categories
  for (const category of config.ammoCategories) {
    for (const keyword of category.keywords) {
      const lowerKeyword = keyword.toLowerCase();
      if (
        lowerTranscript.includes(lowerKeyword) &&
        !state.triggeredKeywords.has(keyword) &&
        canSendNudge(state, "dig_deeper")
      ) {
        state.triggeredKeywords.add(keyword);
        markNudgeSent(state, "dig_deeper");
        return {
          type: "dig_deeper",
          message: `${category.name} topic detected`,
          detail: `Prospect mentioned "${keyword}" - dig deeper to uncover more`,
          triggeredBy: keyword,
        };
      }
    }
  }

  // 3. Missing info alerts (after 5 minutes into the call)
  if (callDurationSeconds >= 300 && canSendNudge(state, "missing_info")) {
    const missingInfo = config.requiredInfo.filter(
      (info) => !uncoveredInfo.has(info.id)
    );

    if (missingInfo.length > 0) {
      const firstMissing = missingInfo[0];
      markNudgeSent(state, "missing_info");
      return {
        type: "missing_info",
        message: `Haven't uncovered: ${firstMissing.label}`,
        detail: firstMissing.description || "Consider asking about this",
      };
    }
  }

  // 4. Script stage reminders (every 3 minutes)
  if (
    callDurationSeconds >= 60 &&
    Date.now() - state.lastScriptStageReminder >= SCRIPT_REMINDER_INTERVAL_MS &&
    config.scriptFramework.length > 0 &&
    canSendNudge(state, "script_reminder")
  ) {
    // Estimate which stage they should be at based on call duration
    const avgStageTime = 600 / config.scriptFramework.length; // Assume 10 min call
    const expectedStageIndex = Math.min(
      Math.floor(callDurationSeconds / avgStageTime),
      config.scriptFramework.length - 1
    );
    const expectedStage = config.scriptFramework[expectedStageIndex];

    if (expectedStage) {
      state.lastScriptStageReminder = Date.now();
      markNudgeSent(state, "script_reminder");
      return {
        type: "script_reminder",
        message: `Framework: ${expectedStage.name}`,
        detail: expectedStage.description || `Focus on the ${expectedStage.name} stage`,
      };
    }
  }

  return null;
}

// Main function to generate nudges based on current call state
export function generateNudge(
  context: NudgeContext,
  state: NudgeState
): Nudge | null {
  // If no config, use default detection
  if (!context.ammoConfig) {
    return detectDefaultNudges(context.transcript, state);
  }

  // Use configured nudge detection
  return detectConfiguredNudges(
    context.transcript,
    context.ammoConfig,
    state,
    context.callDurationSeconds,
    context.uncoveredInfo
  );
}

// Simple heuristic to check if required info has been uncovered
export function checkUncoveredInfo(
  transcript: string,
  requiredInfo: Array<{ id: string; label: string; description?: string }>
): Set<string> {
  const uncovered = new Set<string>();
  const lowerTranscript = transcript.toLowerCase();

  for (const info of requiredInfo) {
    // Check if the label or any words from description appear in transcript
    const labelWords = info.label.toLowerCase().split(/\s+/);
    const descWords = info.description?.toLowerCase().split(/\s+/) || [];
    const allWords = [...labelWords, ...descWords].filter((w) => w.length > 3);

    // If at least half the significant words appear, consider it uncovered
    const matchingWords = allWords.filter((word) =>
      lowerTranscript.includes(word)
    );
    if (matchingWords.length >= Math.ceil(allWords.length / 2)) {
      uncovered.add(info.id);
    }
  }

  return uncovered;
}
