// Main entry point - WebSocket server for audio processing

import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import * as fs from "fs";
import { CallHandler } from "./call-handler.js";
import { logger } from "./logger.js";
import type { CallMetadata } from "./types.js";
import * as liveRelay from "./liveRelay.js";
import {
  createLiveStream,
  endLiveStream,
  updateLiveStreamListenerCount,
  getLiveStreamByVisitorCallId,
  isLiveStreamingEnabled,
  linkCallToBot,
  activateBot,
  completeBot,
} from "./convex.js";

const PORT = parseInt(process.env.PORT || "8080", 10);

// Store active call handlers by connection
const activeCalls = new Map<WebSocket, CallHandler>();

// Store visitorCallId for each closer connection (to enable audio broadcast)
const connectionVisitorCallIds = new Map<WebSocket, string>();

// Create WebSocket server
const wss = new WebSocketServer({
  port: PORT,
  perMessageDeflate: false, // Disable compression — PCM audio doesn't compress well and adds latency
});

logger.info(`Audio processing server starting on port ${PORT}`);

wss.on("connection", async (ws, req) => {
  logger.info(`New WebSocket connection from ${req.socket.remoteAddress}`);

  // Check if this is a manager listener connection
  // Managers connect with ?listen=<visitorCallId>&managerId=<managerId>
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const listenCallId = url.searchParams.get("listen");
  const managerId = url.searchParams.get("managerId");

  if (listenCallId) {
    // This is a manager listener connection
    await handleManagerConnection(ws, listenCallId, managerId);
    return;
  }

  // Check if this is a Meeting BaaS connection (path: /meetingbaas)
  if (url.pathname === "/meetingbaas") {
    handleMeetingBaasConnection(ws, req);
    return;
  }

  // This is a closer connection (existing flow)
  let callHandler: CallHandler | null = null;
  let isInitialized = false;

  ws.on("message", async (data, isBinary) => {
    try {
      // First message should be JSON metadata
      if (!isInitialized) {
        const message = data.toString();

        // Debug logging to diagnose Swift client issues
        logger.info(`[DEBUG] First message received - isBinary: ${isBinary}, length: ${message.length}`);
        logger.info(`[DEBUG] Raw message: "${message}"`);

        // Log reconnection-specific fields
        try {
          const parsed = JSON.parse(message);
          logger.info(`[RECONNECT DEBUG] isReconnect: ${parsed.isReconnect}, convexCallId: ${parsed.convexCallId || 'NOT_PROVIDED'}`);
        } catch {
          // ignore parse error for this debug log
        }

        try {
          const metadata: CallMetadata = JSON.parse(message);

          // Validate required fields
          if (!metadata.callId || !metadata.teamId || !metadata.closerId) {
            logger.error("Invalid metadata - missing required fields", metadata);
            ws.send(JSON.stringify({ error: "Missing required fields: callId, teamId, closerId" }));
            ws.close();
            return;
          }

          // Log sample rate for debugging audio issues
          const sampleRate = metadata.sampleRate || 48000;
          if (metadata.sampleRate) {
            logger.info(`[Audio] Desktop reported sample rate: ${sampleRate}Hz`);
          } else {
            logger.warn(`[Audio] No sample rate in metadata, assuming ${sampleRate}Hz`);
          }
          if (sampleRate !== 48000) {
            logger.warn(`[Audio] ⚠️ Unexpected sample rate: ${sampleRate}Hz (expected 48000Hz)`);
          }

          // Create and start call handler
          callHandler = new CallHandler(metadata);

          // IMPORTANT: Set isInitialized IMMEDIATELY after metadata is validated
          // This prevents race condition where audio arrives before callHandler.start() completes
          isInitialized = true;
          activeCalls.set(ws, callHandler);

          // Store visitorCallId for this connection (used for live relay)
          // The Swift app's metadata.callId is the "visitorCallId" for live streaming
          const visitorCallId = metadata.callId;
          connectionVisitorCallIds.set(ws, visitorCallId);

          // Set up Ammo V2 callback to send analysis to desktop via WebSocket
          callHandler.setAmmoV2Callback((analysis) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "ammo_analysis",
                data: analysis,
              }));
              logger.info(`Sent Ammo V2 analysis to desktop: engagement=${analysis.engagement.level}`);
            }
          });

          // Set up silence warning callback - alerts desktop when no speech detected for 30s+
          callHandler.setSilenceWarningCallback((silenceDurationSeconds) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: "silence_warning",
                silenceDuration: silenceDurationSeconds,
                message: `No speech detected for ${silenceDurationSeconds} seconds. Check your audio connection.`,
              }));
              logger.info(`Sent silence warning to desktop: ${silenceDurationSeconds}s of silence`);
            }
          });

          const convexCallId = await callHandler.start();
          const isReconnect = metadata.isReconnect && metadata.convexCallId;

          // Create live stream record if team has live streaming enabled
          // For reconnections, we need to re-create the stream since it was ended when the old connection closed
          createLiveStream(convexCallId!, visitorCallId, metadata.teamId, metadata.closerId)
            .then((streamId) => {
              if (streamId) {
                logger.info(`[LiveStream] Stream ${isReconnect ? 're-created' : 'created'} for call ${visitorCallId}`);
              }
            })
            .catch((err) => {
              logger.error(`[LiveStream] Failed to create stream: ${err}`);
            });

          // Send back BOTH the original callId AND the Convex-generated callId
          // Desktop MUST use convexCallId for all subsequent operations
          ws.send(JSON.stringify({
            status: "ready",
            callId: metadata.callId,
            convexCallId: convexCallId,  // This is the actual Convex _id to use for queries/mutations
            isReconnect: isReconnect || false
          }));
          logger.info(`Call ${isReconnect ? 'reconnected' : 'initialized'}: ${metadata.callId}, Convex ID: ${convexCallId}`);
        } catch (parseError) {
          logger.error("Failed to parse metadata JSON", parseError);
          ws.send(JSON.stringify({ error: "Invalid JSON metadata" }));
          ws.close();
          return;
        }
      } else if (isBinary && callHandler) {
        // Binary data is audio
        const audioBuffer = Buffer.from(data as Buffer);
        callHandler.processAudio(audioBuffer);

        // Broadcast audio to any connected listeners (managers)
        const visitorCallId = connectionVisitorCallIds.get(ws);
        if (visitorCallId && liveRelay.hasListeners(visitorCallId)) {
          const listenerCount = liveRelay.broadcastAudio(visitorCallId, audioBuffer);
          // Log periodically (every ~10 seconds worth of audio at 16kHz)
          // to avoid log spam but still have visibility
        }
      } else if (!isBinary) {
        // Handle text commands
        const message = data.toString();
        try {
          const command = JSON.parse(message);

          if (command.type === "heartbeat") {
            // Respond to application-level heartbeat (more reliable than WebSocket ping/pong
            // which some networks/firewalls strip)
            ws.send(JSON.stringify({ type: "heartbeat_ack" }));
          } else if (command.type === "end" && callHandler) {
            logger.info(`Received end command for call`);
            await callHandler.end();
            ws.send(JSON.stringify({ status: "ended", stats: callHandler.getStats() }));
          } else if (command.type === "stats" && callHandler) {
            ws.send(JSON.stringify({ status: "stats", stats: callHandler.getStats() }));
          }
        } catch {
          // Ignore non-JSON text messages
        }
      }
    } catch (error) {
      logger.error("Error processing message", error);
    }
  });

  ws.on("close", async () => {
    logger.info("WebSocket connection closed");

    const handler = activeCalls.get(ws);
    if (handler) {
      await handler.end();
      activeCalls.delete(ws);
    }

    // End live stream and notify any listeners
    const visitorCallId = connectionVisitorCallIds.get(ws);
    if (visitorCallId) {
      // Notify listeners that the call has ended
      liveRelay.notifyCallEnded(visitorCallId);

      // End the live stream record in Convex
      endLiveStream(visitorCallId).catch((err) => {
        logger.error(`[LiveStream] Failed to end stream: ${err}`);
      });

      connectionVisitorCallIds.delete(ws);
    }
  });

  ws.on("error", (error) => {
    logger.error("WebSocket error", error);
  });
});

// ============================================
// MEETING BAAS CONNECTION HANDLER
// ============================================

/**
 * Handle a Meeting BaaS bot connecting to stream audio from a meeting.
 *
 * Meeting BaaS connects to our streaming URL and sends:
 * - Binary messages: raw PCM audio chunks
 * - JSON arrays: speaker metadata ([{ name, id, timestamp, isSpeaking }])
 * - JSON objects: heartbeat/control messages
 *
 * Metadata (botId, closerId, teamId) is extracted from URL query parameters
 * set when creating the bot via the Meeting BaaS API.
 */
function handleMeetingBaasConnection(ws: WebSocket, req: import("http").IncomingMessage): void {
  logger.info(`[MeetingBaaS] New bot connection`);

  // Extract metadata from URL query parameters
  const url = new URL(req.url || "/", `wss://${req.headers.host || "localhost"}`);
  const botId = url.searchParams.get("botId");
  const closerId = url.searchParams.get("closerId");
  const teamId = url.searchParams.get("teamId");
  const prospectName = url.searchParams.get("prospectName");

  if (!botId || !closerId || !teamId) {
    logger.error(`[MeetingBaaS] Missing required query params - botId: ${botId}, closerId: ${closerId}, teamId: ${teamId}`);
    ws.close();
    return;
  }

  logger.info(`[MeetingBaaS] Connection params - botId: ${botId}, closerId: ${closerId}, teamId: ${teamId}, prospectName: ${prospectName || "unknown"}`);

  // === RAW AUDIO DIAGNOSTIC: Save incoming audio to file for quality analysis ===
  const rawAudioPath = `/tmp/meetingbaas-raw-${Date.now()}.pcm`;
  const rawAudioStream = fs.createWriteStream(rawAudioPath);
  let diagLastChunkTime = Date.now();
  let diagTotalBytes = 0;
  let diagChunkCount = 0;
  let diagGapHistogram: Record<string, number> = {}; // bucket gaps for summary
  const diagStartTime = Date.now();
  logger.info(`[MeetingBaaS][DIAG] Saving raw audio to ${rawAudioPath}`);
  // === END DIAGNOSTIC SETUP ===

  // Create CallHandler immediately with metadata from URL params
  const callMetadata: CallMetadata = {
    callId: botId,
    teamId,
    closerId,
    prospectName: prospectName || undefined,
    sampleRate: 24000, // Meeting BaaS sends 24kHz (default quality; good balance of fidelity and bandwidth)
  };

  const callHandler = new CallHandler(callMetadata, {
    source: "meetingbaas",
    recordingType: "video",
  });

  activeCalls.set(ws, callHandler);
  connectionVisitorCallIds.set(ws, botId);

  // Activate the bot immediately — this is the primary signal that the bot is in the call.
  // Meeting BaaS v2 does NOT send a "meeting.started" webhook, so the audio processor
  // WebSocket connection is the only signal that the bot has joined.
  activateBot(botId).catch((err) => {
    logger.error(`[MeetingBaaS] Failed to activate bot: ${err}`);
  });

  // Start the call handler (creates Convex call record, connects to Speechmatics, etc.)
  callHandler.start()
    .then((convexCallId) => {
      logger.info(`[MeetingBaaS] Call initialized: botId=${botId}, Convex ID: ${convexCallId}`);

      // Link this call to the meeting bot so the desktop app can find it
      // The bot record needs callId to return in getActiveCallForCloserBot
      if (convexCallId) {
        linkCallToBot(botId, convexCallId).catch((err) => {
          logger.error(`[MeetingBaaS] Failed to link call to bot: ${err}`);
        });
      }

      // Create live stream record if team has live streaming enabled
      createLiveStream(convexCallId!, botId, teamId, closerId)
        .then((streamId) => {
          if (streamId) {
            logger.info(`[MeetingBaaS] Live stream created for bot ${botId}`);
          }
        })
        .catch((err) => {
          logger.error(`[MeetingBaaS] Failed to create live stream: ${err}`);
        });
    })
    .catch((err) => {
      logger.error(`[MeetingBaaS] Failed to start call handler: ${err}`);
    });

  ws.on("message", async (data, isBinary) => {
    try {
      if (isBinary) {
        // Binary data is raw PCM audio from Meeting BaaS
        const audioBuffer = Buffer.from(data as Buffer);

        // === RAW AUDIO DIAGNOSTIC: Log chunk timing and save raw audio ===
        const diagNow = Date.now();
        const diagGap = diagNow - diagLastChunkTime;
        diagLastChunkTime = diagNow;
        diagTotalBytes += audioBuffer.length;
        diagChunkCount++;

        // Bucket gaps for summary logging
        const bucket = diagGap < 10 ? "0-9ms" : diagGap < 30 ? "10-29ms" : diagGap < 60 ? "30-59ms" : diagGap < 100 ? "60-99ms" : diagGap < 200 ? "100-199ms" : diagGap < 500 ? "200-499ms" : "500ms+";
        diagGapHistogram[bucket] = (diagGapHistogram[bucket] || 0) + 1;

        // Log every 100 chunks
        if (diagChunkCount % 100 === 0) {
          logger.info(`[MeetingBaaS][DIAG] Chunk #${diagChunkCount}: size=${audioBuffer.length}b, gap=${diagGap}ms, totalBytes=${diagTotalBytes}, histogram=${JSON.stringify(diagGapHistogram)}`);
        }

        // Save raw audio before any processing
        rawAudioStream.write(audioBuffer);
        // === END DIAGNOSTIC ===

        callHandler.processAudio(audioBuffer);

        // Broadcast normalized audio (48kHz stereo) to listeners
        // Meeting BaaS sends 24kHz mono — upsample to 48kHz stereo for dashboard
        if (liveRelay.hasListeners(botId)) {
          const normalized = callHandler.normalizeForBroadcast(audioBuffer);
          liveRelay.broadcastAudio(botId, normalized);
        }
      } else {
        // Text messages from Meeting BaaS
        const message = data.toString();
        try {
          const parsed = JSON.parse(message);

          if (Array.isArray(parsed)) {
            // Speaker metadata array: [{ name, id, timestamp, isSpeaking }]
            // Forward to CallHandler for Speechmatics speaker ID → participant name mapping
            callHandler.updateMeetingBaasSpeakers(parsed);
            logger.info(`[MeetingBaaS] Speaker update: ${JSON.stringify(parsed)}`);
          } else if (parsed.type === "heartbeat" || parsed.type === "ping") {
            ws.send(JSON.stringify({ type: "heartbeat_ack" }));
          } else if (parsed.type === "end") {
            logger.info(`[MeetingBaaS] Received end command`);
            await callHandler.end();
            ws.send(JSON.stringify({ status: "ended", stats: callHandler.getStats() }));
          } else {
            logger.info(`[MeetingBaaS] Received message: ${message}`);
          }
        } catch {
          // Non-JSON text message - log and ignore
          logger.info(`[MeetingBaaS] Non-JSON message: ${message}`);
        }
      }
    } catch (error) {
      logger.error("[MeetingBaaS] Error processing message", error);
    }
  });

  ws.on("close", async () => {
    logger.info("[MeetingBaaS] Bot connection closed (bot left meeting)");

    // === RAW AUDIO DIAGNOSTIC: Close file and log summary ===
    rawAudioStream.end();
    const diagDuration = (Date.now() - diagStartTime) / 1000;
    const expectedBytes = 24000 * 2 * diagDuration; // 24kHz * 16-bit * seconds
    logger.info(`[MeetingBaaS][DIAG] SUMMARY: duration=${diagDuration.toFixed(1)}s, chunks=${diagChunkCount}, totalBytes=${diagTotalBytes}, expectedBytes=${Math.round(expectedBytes)}, ratio=${(diagTotalBytes / expectedBytes).toFixed(2)}, file=${rawAudioPath}`);
    logger.info(`[MeetingBaaS][DIAG] Gap histogram: ${JSON.stringify(diagGapHistogram)}`);
    // === END DIAGNOSTIC ===

    const handler = activeCalls.get(ws);
    if (handler) {
      await handler.end();
      activeCalls.delete(ws);
    }

    // Mark the bot as "completed" immediately — don't wait for the Meeting BaaS webhook
    // which may arrive late or not at all. This triggers the macOS app to close the
    // ammo panel and show the post-call questionnaire.
    completeBot(botId).catch((err) => {
      logger.error(`[MeetingBaaS] Failed to complete bot: ${err}`);
    });

    // End live stream and notify any listeners
    liveRelay.notifyCallEnded(botId);
    endLiveStream(botId).catch((err) => {
      logger.error(`[MeetingBaaS] Failed to end live stream: ${err}`);
    });
    connectionVisitorCallIds.delete(ws);
  });

  ws.on("error", (error) => {
    logger.error("[MeetingBaaS] WebSocket error", error);
  });
}

// ============================================
// MANAGER LISTENER CONNECTION HANDLER
// ============================================

/**
 * Handle a manager connecting to listen to a live call
 * Managers connect with URL params: ?listen=<visitorCallId>&managerId=<managerId>
 */
async function handleManagerConnection(
  ws: WebSocket,
  visitorCallId: string,
  managerId: string | null
): Promise<void> {
  logger.info(`[LiveRelay] Manager ${managerId || "unknown"} attempting to connect to call ${visitorCallId}`);

  // Validate that the stream exists and is active
  const stream = await getLiveStreamByVisitorCallId(visitorCallId);

  if (!stream) {
    logger.warn(`[LiveRelay] No active stream found for visitorCallId: ${visitorCallId}`);
    ws.send(JSON.stringify({ error: "Stream not found", code: "STREAM_NOT_FOUND" }));
    ws.close();
    return;
  }

  if (stream.status !== "active") {
    logger.warn(`[LiveRelay] Stream is not active for visitorCallId: ${visitorCallId}, status: ${stream.status}`);
    ws.send(JSON.stringify({ error: "Stream has ended", code: "STREAM_ENDED" }));
    ws.close();
    return;
  }

  // Add this manager as a listener
  liveRelay.addListener(visitorCallId, ws, managerId || undefined);

  // Update listener count in Convex (non-blocking)
  updateLiveStreamListenerCount(visitorCallId, 1).catch((err) => {
    logger.error(`[LiveRelay] Failed to update listener count: ${err}`);
  });

  // Send confirmation to the manager
  ws.send(JSON.stringify({
    status: "connected",
    visitorCallId,
    message: "Connected to live audio stream",
  }));

  // Set up heartbeat ping every 30 seconds to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);

  // Handle manager disconnection
  ws.on("close", () => {
    logger.info(`[LiveRelay] Manager ${managerId || "unknown"} disconnected from call ${visitorCallId}`);
    clearInterval(pingInterval);
    liveRelay.removeListener(ws);

    // Update listener count in Convex (non-blocking)
    updateLiveStreamListenerCount(visitorCallId, -1).catch((err) => {
      logger.error(`[LiveRelay] Failed to update listener count: ${err}`);
    });
  });

  ws.on("error", (error) => {
    logger.error(`[LiveRelay] Manager WebSocket error:`, error);
    clearInterval(pingInterval);
  });

  // Handle text messages from manager (for future commands like mute, volume, etc.)
  ws.on("message", (data, isBinary) => {
    if (!isBinary) {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
        // Future: handle other commands
      } catch {
        // Ignore non-JSON messages
      }
    }
  });
}

wss.on("listening", () => {
  logger.info(`Audio processing server listening on ws://localhost:${PORT}`);
  logger.info("Waiting for connections...");
});

wss.on("error", (error) => {
  logger.error("WebSocket server error", error);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Shutting down...");

  // Clean up all live relay listeners
  liveRelay.cleanupAll();

  // End all active calls
  for (const [ws, handler] of activeCalls) {
    await handler.end();
    ws.close();
  }

  wss.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

// Health check endpoint info
logger.info("Service ready. Protocol:");
logger.info("  Closer (desktop app):");
logger.info("    1. Connect via WebSocket to ws://localhost:" + PORT);
logger.info("    2. Send JSON metadata: { callId, teamId, closerId, prospectName? }");
logger.info("    3. Receive { status: 'ready' } confirmation");
logger.info("    4. Stream binary audio data (48kHz stereo PCM)");
logger.info("    5. Send { type: 'end' } when call ends");
logger.info("  Meeting BaaS (bot):");
logger.info("    1. Connect via WebSocket to ws://localhost:" + PORT + "/meetingbaas");
logger.info("    2. Send JSON metadata: { type: 'meetingbaas', botId, meetingUrl, closerId, teamId }");
logger.info("    3. Receive { status: 'ready' } confirmation");
logger.info("    4. Stream binary audio data");
logger.info("    5. Connection close = bot left meeting");
