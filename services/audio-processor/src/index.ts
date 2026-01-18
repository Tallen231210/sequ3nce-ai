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
} from "./convex.js";

const PORT = parseInt(process.env.PORT || "8080", 10);

// Store active call handlers by connection
const activeCalls = new Map<WebSocket, CallHandler>();

// Store visitorCallId for each closer connection (to enable audio broadcast)
const connectionVisitorCallIds = new Map<WebSocket, string>();

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

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
        logger.info(`[DEBUG] First 20 char codes: ${[...message.slice(0, 20)].map(c => c.charCodeAt(0)).join(', ')}`);

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

          const convexCallId = await callHandler.start();

          // Create live stream record if team has live streaming enabled
          // This is non-blocking - we don't wait for it
          createLiveStream(convexCallId!, visitorCallId, metadata.teamId, metadata.closerId)
            .then((streamId) => {
              if (streamId) {
                logger.info(`[LiveStream] Stream created for call ${visitorCallId}`);
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
            convexCallId: convexCallId  // This is the actual Convex _id to use for queries/mutations
          }));
          logger.info(`Call initialized: ${metadata.callId}, Convex ID: ${convexCallId}`);
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

          if (command.type === "end" && callHandler) {
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
logger.info("1. Connect via WebSocket to ws://localhost:" + PORT);
logger.info("2. Send JSON metadata: { callId, teamId, closerId, prospectName? }");
logger.info("3. Receive { status: 'ready' } confirmation");
logger.info("4. Stream binary audio data");
logger.info("5. Send { type: 'end' } when call ends");
logger.info("6. Receive { status: 'ended', stats } confirmation");
