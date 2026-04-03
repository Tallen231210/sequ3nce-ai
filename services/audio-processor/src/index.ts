// Main entry point - WebSocket server for audio processing

import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
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

logger.info(`[AudioProcessor] Process started at ${new Date().toISOString()}, PID: ${process.pid}`);
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

  // Check if this is a Recall.ai connection (path: /recall)
  if (url.pathname === "/recall") {
    handleRecallConnection(ws, req);
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

  ws.on("close", async (code, reason) => {
    const reasonStr = reason?.toString() || 'none';
    logger.info(`WebSocket connection closed. Code: ${code}, Reason: ${reasonStr}`);

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
// RECALL.AI CONNECTION HANDLER
// ============================================

/**
 * Handle a Recall.ai bot connecting to stream audio and events from a meeting.
 *
 * Recall.ai connects to our WebSocket URL (configured per-bot in realtime_endpoints)
 * and sends JSON events:
 * - audio_mixed_raw.data: base64-encoded 16kHz mono S16LE PCM audio
 * - transcript.data: real-time transcript with speaker/participant info
 * - participant_events.join/leave: participant metadata
 *
 * Metadata (botId, closerId, teamId) is extracted from URL query parameters
 * set when creating the bot via the Recall.ai API.
 */
function handleRecallConnection(ws: WebSocket, req: import("http").IncomingMessage): void {
  logger.info(`[Recall] New bot connection`);

  // Extract metadata from URL query parameters
  const url = new URL(req.url || "/", `wss://${req.headers.host || "localhost"}`);
  const botId = url.searchParams.get("botId");
  const closerId = url.searchParams.get("closerId");
  const teamId = url.searchParams.get("teamId");
  const closerName = url.searchParams.get("closerName");
  const prospectName = url.searchParams.get("prospectName");

  if (!botId || !closerId || !teamId) {
    logger.error(`[Recall] Missing required query params - botId: ${botId}, closerId: ${closerId}, teamId: ${teamId}`);
    ws.close();
    return;
  }

  logger.info(`[Recall] Connection params - botId: ${botId}, closerId: ${closerId}, teamId: ${teamId}, closerName: ${closerName || "unknown"}, prospectName: ${prospectName || "unknown"}`);

  const connectionStartTime = Date.now();

  // Create CallHandler with Recall-specific config
  const callMetadata: CallMetadata = {
    callId: botId,
    teamId,
    closerId,
    closerName: closerName || undefined,
    prospectName: prospectName || undefined,
    sampleRate: 16000, // Recall.ai sends 16kHz mono S16LE PCM
  };

  const callHandler = new CallHandler(callMetadata, {
    source: "recall",
    recordingType: "video",
    skipSpeechmatics: true, // Recall.ai provides transcription via transcript.data events
  });

  activeCalls.set(ws, callHandler);
  connectionVisitorCallIds.set(ws, botId);

  // Activate the bot immediately — signals the bot has joined the call
  activateBot(botId).catch((err) => {
    logger.error(`[Recall] Failed to activate bot: ${err}`);
  });

  // Track the Convex call ID once created — used as relay key for live streaming
  let relayCallId: string | null = null;

  // Start the call handler (creates Convex call record, etc.)
  callHandler.start()
    .then(async (convexCallId) => {
      logger.info(`[Recall] Call initialized: botId=${botId}, Convex ID: ${convexCallId}`);
      relayCallId = convexCallId || null;

      // Also register this call ID for cleanup on disconnect
      if (convexCallId) {
        connectionVisitorCallIds.set(ws, convexCallId);

        // CRITICAL: Await linkCallToBot so the bot record has callId before
        // transcript webhooks arrive. Without this, webhooks see callId=null
        // and transcripts are lost.
        try {
          await linkCallToBot(botId, convexCallId);
        } catch (err) {
          logger.error(`[Recall] Failed to link call to bot: ${err}`);
        }
      }

      // Create live stream record — use convexCallId as visitorCallId so the
      // web dashboard listener key matches the audio broadcast relay key
      createLiveStream(convexCallId!, convexCallId!, teamId, closerId)
        .then((streamId) => {
          if (streamId) {
            logger.info(`[Recall] Live stream created for call ${convexCallId}`);
          }
        })
        .catch((err) => {
          logger.error(`[Recall] Failed to create live stream: ${err}`);
        });
    })
    .catch((err) => {
      logger.error(`[Recall] Failed to start call handler: ${err}`);
    });

  // No ping/pong — transcripts now delivered via webhook, not WebSocket.
  // WebSocket only carries audio + participant events. Closes fast when meeting ends.

  let messageCount = 0;
  let audioEventCount = 0;

  // Health log every 60 seconds
  const healthLogInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - connectionStartTime) / 1000);
    logger.info(`[Recall] Health: bot=${botId}, elapsed=${elapsed}s, msgs=${messageCount}, audio=${audioEventCount}`);
  }, 60000);

  ws.on("message", async (data, isBinary) => {
    messageCount++;

    // Log first 5 messages in detail + periodic summary
    if (messageCount <= 5) {
      const preview = data.toString().slice(0, 300);
      logger.info(`[Recall] MSG #${messageCount} (binary=${isBinary}, len=${data.toString().length}): ${preview}`);
    } else if (messageCount % 100 === 0) {
      logger.info(`[Recall] Stats: ${messageCount} msgs, ${audioEventCount} audio`);
    }

    try {
      // Recall.ai sends all events as JSON text messages
      const message = JSON.parse(data.toString());
      const eventType = message.event || message.type;

      switch (eventType) {
        case "audio_mixed_raw.data": {
          audioEventCount++;
          // Base64-encoded 16kHz mono S16LE PCM audio
          // Recall.ai nests payload under data.data
          const rawData = message.data?.data || message.data;
          const bufferStr = rawData?.buffer || rawData?.data;
          if (!bufferStr) {
            if (audioEventCount <= 3) {
              logger.error(`[Recall] Audio event missing buffer. Keys: ${JSON.stringify(Object.keys(message.data || {}))}. data.data keys: ${JSON.stringify(Object.keys(message.data?.data || {}))}`);
            }
            break;
          }
          const audioBuffer = Buffer.from(bufferStr, "base64");
          callHandler.processAudio(audioBuffer);

          // Broadcast normalized audio to live stream listeners (using Convex call ID)
          const audioRelayId = relayCallId || botId;
          if (liveRelay.hasListeners(audioRelayId)) {
            const normalized = callHandler.normalizeForBroadcast(audioBuffer);
            liveRelay.broadcastAudio(audioRelayId, normalized);
          }
          break;
        }

        case "transcript.data": {
          // Webhook handles DB storage — process here for in-memory ammo extraction + fullTranscript
          const transcriptData = eventData?.data || eventData;
          const words = transcriptData?.words || [];
          const text = words.map((w: any) => w.text).join(" ");
          const participant = transcriptData?.participant?.name || "Unknown";
          const startMs = words[0]?.start_timestamp?.relative || 0;

          if (text.trim() && callHandler) {
            callHandler.handleRecallTranscript({
              text,
              speaker: participant,
              timestamp: Math.floor(startMs),
              startMs,
            }).catch(err => logger.error(`[Recall] Failed to process transcript for ammo: ${err}`));
          }
          break;
        }
        case "transcript.partial_data": {
          // Partial transcripts not needed — final transcript.data is sufficient
          break;
        }

        case "participant_events.join": {
          const participant = message.data?.data?.participant || message.data?.participant;
          logger.info(`[Recall] Participant joined: ${participant?.name} (host: ${participant?.is_host})`);
          // Track participant join order for speaker identification fallback
          if (participant?.name) {
            callHandler.trackParticipantJoin(participant.name);
          }
          break;
        }

        case "participant_events.leave": {
          const participant = message.data?.data?.participant || message.data?.participant;
          logger.info(`[Recall] Participant left: ${participant?.name}`);
          break;
        }

        default: {
          logger.info(`[Recall] Unknown event: ${eventType}`);
        }
      }
    } catch (error) {
      logger.error(`[Recall] Error processing message #${messageCount}`, error);
    }
  });

  ws.on("close", async (code, reason) => {
    clearInterval(healthLogInterval);
    const reasonStr = reason?.toString() || 'none';
    const elapsedSec = Math.floor((Date.now() - connectionStartTime) / 1000);
    logger.info(`[Recall] Bot connection closed. Code: ${code}, Reason: ${reasonStr}, Elapsed: ${elapsedSec}s, Total: ${messageCount} msgs, ${audioEventCount} audio`);

    const handler = activeCalls.get(ws);
    if (handler) {
      await handler.end();
      activeCalls.delete(ws);
    }

    // Mark the bot as "completed" immediately
    completeBot(botId).catch((err) => {
      logger.error(`[Recall] Failed to complete bot: ${err}`);
    });

    // End live stream and notify any listeners (use Convex call ID if available)
    const closeRelayId = relayCallId || botId;
    liveRelay.notifyCallEnded(closeRelayId);
    endLiveStream(closeRelayId).catch((err) => {
      logger.error(`[Recall] Failed to end live stream: ${err}`);
    });
    connectionVisitorCallIds.delete(ws);
  });

  ws.on("error", (error) => {
    logger.error("[Recall] WebSocket error", error);
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
logger.info("  Recall.ai (bot):");
logger.info("    1. Connect via WebSocket to ws://localhost:" + PORT + "/recall?botId=...&closerId=...&teamId=...");
logger.info("    2. Bot streams JSON events (audio, transcript, participant joins)");
