// Convex database client for writing call data

import { ConvexHttpClient } from "convex/browser";
import { logger } from "./logger.js";
import type { AmmoItem, CallMetadata } from "./types.js";

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
    });
    logger.info(`Ammo added: "${ammo.text.substring(0, 50)}..." (${ammo.type})`);
  } catch (error) {
    logger.error("Failed to add ammo item", error);
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
