// Convex database client for writing call data

import { ConvexHttpClient } from "convex/browser";
import { logger } from "./logger.js";
import type { AmmoConfig, CallMetadata } from "./types.js";
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

// Get the last transcript timestamp for a call (used for reconnection offset)
export async function getLastTranscriptTimestamp(callId: string): Promise<number> {
  try {
    const timestamp = await convex.query("calls:getLastTranscriptTimestamp" as any, {
      callId,
    });
    logger.info(`Last transcript timestamp for ${callId}: ${timestamp}`);
    return timestamp as number;
  } catch (error) {
    logger.error("Failed to get last transcript timestamp", error);
    return 0;
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

// Update talk-to-listen ratio
export async function updateTalkTime(
  callId: string,
  closerTalkTime: number,
  prospectTalkTime: number
): Promise<void> {
  try {
    await convex.mutation("calls:updateTalkTime" as any, {
      callId,
      closerTalkTime,
      prospectTalkTime,
    });
    logger.info(`Talk time updated: closer=${closerTalkTime}s, prospect=${prospectTalkTime}s`);
  } catch (error) {
    logger.error("Failed to update talk time", error);
  }
}

// Set a meeting bot's status to "active" when the audio processor connects.
// The WebSocket connection is the primary signal that the bot has joined the call.
export async function activateBot(botId: string): Promise<void> {
  try {
    await convex.mutation("meetingBot:activateBotFromAudioProcessor" as any, {
      botId,
    });
    logger.info(`[Bot] Bot activated: ${botId}`);
  } catch (error) {
    logger.error(`[Bot] Failed to activate bot: ${error}`);
  }
}

// Mark a meeting bot as "completed" when the audio processor WebSocket closes.
// This immediately triggers the macOS app's post-call questionnaire flow.
export async function completeBot(botId: string): Promise<void> {
  try {
    await convex.mutation("meetingBot:completeBotFromAudioProcessor" as any, {
      botId,
    });
    logger.info(`[Bot] Bot completed: ${botId}`);
  } catch (error) {
    logger.error(`[Bot] Failed to complete bot: ${error}`);
  }
}

// Get a bot's existing linked callId (for reconnection — reuse instead of creating duplicate)
export async function getBotExistingCallId(botId: string): Promise<string | null> {
  try {
    const result = await convex.query("meetingBot:getBotCallId" as any, { botId });
    if (result?.callId) {
      logger.info(`[Bot] Found existing call for bot ${botId}: ${result.callId}`);
      return result.callId;
    }
    return null;
  } catch (error) {
    logger.error(`[Bot] Failed to get existing call for bot ${botId}: ${error}`);
    return null;
  }
}

// Link a call to a meeting bot (so desktop app can find the call with ammo data)
export async function linkCallToBot(botId: string, callId: string): Promise<void> {
  try {
    await convex.mutation("meetingBot:linkCallToBot" as any, {
      botId,
      callId,
    });
    logger.info(`[MeetingBaaS] Linked call ${callId} to bot ${botId}`);
  } catch (error) {
    logger.error(`[MeetingBaaS] Failed to link call to bot: ${error}`);
  }
}

// ============================================
// LIVE STREAMING FUNCTIONS
// ============================================

/**
 * Check if a team has live streaming enabled
 */
export async function isLiveStreamingEnabled(teamId: string): Promise<boolean> {
  try {
    const enabled = await convex.query("liveStreams:isLiveStreamingEnabled" as any, { teamId });
    return enabled === true;
  } catch (error) {
    logger.error("Failed to check live streaming enabled", error);
    return false;
  }
}

/**
 * Create a live stream record when a call starts
 * Only creates if team has live streaming enabled
 */
export async function createLiveStream(
  callId: string,
  visitorCallId: string,
  teamId: string,
  closerId: string
): Promise<string | null> {
  try {
    const streamId = await convex.mutation("liveStreams:createLiveStream" as any, {
      callId,
      visitorCallId,
      teamId,
      closerId,
    });
    if (streamId) {
      logger.info(`[LiveStream] Created stream ${streamId} for call ${callId}`);
    }
    return streamId as string | null;
  } catch (error) {
    logger.error("Failed to create live stream", error);
    return null;
  }
}

/**
 * End a live stream when a call ends
 */
export async function endLiveStream(visitorCallId: string): Promise<void> {
  try {
    await convex.mutation("liveStreams:endLiveStream" as any, { visitorCallId });
    logger.info(`[LiveStream] Ended stream for visitorCallId ${visitorCallId}`);
  } catch (error) {
    logger.error("Failed to end live stream", error);
  }
}

/**
 * Update the listener count for a live stream
 */
export async function updateLiveStreamListenerCount(
  visitorCallId: string,
  delta: number
): Promise<void> {
  try {
    await convex.mutation("liveStreams:updateListenerCount" as any, {
      visitorCallId,
      delta,
    });
    logger.info(`[LiveStream] Updated listener count for ${visitorCallId}: ${delta > 0 ? '+' : ''}${delta}`);
  } catch (error) {
    logger.error("Failed to update listener count", error);
  }
}

/**
 * Get live stream by visitorCallId (for manager connection validation)
 */
export async function getLiveStreamByVisitorCallId(
  visitorCallId: string
): Promise<{ teamId: string; status: string } | null> {
  try {
    const stream = await convex.query("liveStreams:getLiveStreamByVisitorCallId" as any, {
      visitorCallId,
    });
    if (stream) {
      return { teamId: stream.teamId, status: stream.status };
    }
    return null;
  } catch (error) {
    logger.error("Failed to get live stream by visitorCallId", error);
    return null;
  }
}
