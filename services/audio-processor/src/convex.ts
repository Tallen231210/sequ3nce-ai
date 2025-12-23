// Convex database client for writing call data

import { ConvexHttpClient } from "convex/browser";
import { logger } from "./logger.js";
import type { AmmoItem, AmmoConfig, CallMetadata } from "./types.js";
import type { Nudge } from "./nudges.js";
import type { DetectionResults } from "./detection.js";

const convexUrl = process.env.CONVEX_URL!;
const convex = new ConvexHttpClient(convexUrl);

// We'll call mutations using the generic mutation method since we don't have generated types here
// The audio processor uses HTTP client to call Convex functions

export async function createCall(metadata: CallMetadata): Promise<string | null> {
  try {
    // Call the Convex mutation to create a call record
    const callId = await convex.mutation("calls:createCall" as any, {
      teamId: metadata.teamId,
      closerId: metadata.closerId,
      prospectName: metadata.prospectName,
      status: "waiting",
      speakerCount: 1,
    });

    logger.info(`Call created in Convex: ${callId}`);
    return callId as string;
  } catch (error) {
    logger.error("Failed to create call in Convex", error);
    return null;
  }
}

export async function updateCallStatus(
  callId: string,
  status: string,
  speakerCount: number
): Promise<void> {
  try {
    await convex.mutation("calls:updateCallStatus" as any, {
      callId,
      status,
      speakerCount,
    });
    logger.info(`Call status updated: ${callId} -> ${status}`);
  } catch (error) {
    logger.error("Failed to update call status", error);
  }
}

export async function addTranscript(callId: string, transcript: string): Promise<void> {
  try {
    await convex.mutation("calls:updateTranscript" as any, {
      callId,
      transcript,
    });
  } catch (error) {
    logger.error("Failed to update transcript", error);
  }
}

// Add individual transcript segment for real-time display
export async function addTranscriptSegment(
  callId: string,
  teamId: string,
  speaker: string,
  text: string,
  timestamp: number
): Promise<void> {
  try {
    await convex.mutation("calls:addTranscriptSegment" as any, {
      callId,
      teamId,
      speaker,
      text,
      timestamp,
    });
    logger.info(`Transcript segment added: [${speaker}] "${text.substring(0, 50)}..."`);
  } catch (error) {
    logger.error("Failed to add transcript segment", error);
  }
}

export async function addAmmoItem(
  callId: string,
  teamId: string,
  ammo: AmmoItem
): Promise<void> {
  try {
    await convex.mutation("calls:addAmmo" as any, {
      callId,
      teamId,
      text: ammo.text,
      type: ammo.type,
      timestamp: ammo.timestamp,
      // Scoring fields
      score: ammo.score,
      repetitionCount: ammo.repetitionCount,
      isHeavyHitter: ammo.isHeavyHitter,
      categoryId: ammo.categoryId,
      suggestedUse: ammo.suggestedUse,
    });
    const heavyHitterLabel = ammo.isHeavyHitter ? " [HEAVY HITTER]" : "";
    logger.info(`Ammo added: "${ammo.text.substring(0, 50)}..." (${ammo.type}, score: ${ammo.score || 0})${heavyHitterLabel}`);
  } catch (error) {
    logger.error("Failed to add ammo item", error);
  }
}

export async function getAmmoConfig(teamId: string): Promise<AmmoConfig | null> {
  try {
    const config = await convex.query("admin:getAmmoConfig" as any, { teamId });
    if (config) {
      logger.info(`Loaded ammo config for team ${teamId}`);
      return config as AmmoConfig;
    }
    logger.info(`No ammo config found for team ${teamId}, will use defaults`);
    return null;
  } catch (error) {
    logger.error("Failed to get ammo config", error);
    return null;
  }
}

export async function completeCall(
  callId: string,
  recordingUrl: string,
  transcript: string,
  duration: number
): Promise<void> {
  try {
    await convex.mutation("calls:completeCall" as any, {
      callId,
      recordingUrl,
      transcript,
      duration,
      status: "completed",
    });
    logger.info(`Call completed: ${callId}`);
  } catch (error) {
    logger.error("Failed to complete call", error);
  }
}

export async function getTeamCustomPrompt(teamId: string): Promise<string | undefined> {
  try {
    const team = await convex.query("teams:getTeamById" as any, { teamId });
    return team?.customAiPrompt;
  } catch (error) {
    logger.error("Failed to get team custom prompt", error);
    return undefined;
  }
}

// Set initial speaker mapping when 2 speakers are detected
// Desktop app will prompt closer to confirm or swap
export async function setSpeakerMapping(
  callId: string,
  closerSpeaker: string,
  sampleText?: string
): Promise<void> {
  try {
    await convex.mutation("calls:setSpeakerMapping" as any, {
      callId,
      closerSpeaker,
      sampleText,
    });
    logger.info(`Speaker mapping set: ${callId} -> closer is ${closerSpeaker}`);
  } catch (error) {
    logger.error("Failed to set speaker mapping", error);
  }
}

// Add a smart nudge for real-time coaching
export async function addNudge(
  callId: string,
  teamId: string,
  nudge: Nudge
): Promise<void> {
  try {
    await convex.mutation("calls:addNudge" as any, {
      callId,
      teamId,
      type: nudge.type,
      message: nudge.message,
      detail: nudge.detail,
      triggeredBy: nudge.triggeredBy,
    });
    logger.info(`Nudge added: [${nudge.type}] ${nudge.message}`);
  } catch (error) {
    logger.error("Failed to add nudge", error);
  }
}

// Update AI detection results on the call
export async function updateCallDetection(
  callId: string,
  detection: DetectionResults
): Promise<void> {
  try {
    await convex.mutation("calls:updateCallDetection" as any, {
      callId,
      budgetDiscussion: detection.budgetDiscussion,
      timelineUrgency: detection.timelineUrgency,
      decisionMakerDetection: detection.decisionMakerDetection,
      spousePartnerMentions: detection.spousePartnerMentions,
      objectionsDetected: detection.objectionsDetected,
    });
    logger.info(`Detection results saved for call ${callId}`);
  } catch (error) {
    logger.error("Failed to update call detection", error);
  }
}
