// Main entry point - WebSocket server for audio processing

import "dotenv/config";
import { WebSocketServer, WebSocket } from "ws";
import { CallHandler } from "./call-handler.js";
import { logger } from "./logger.js";
import type { CallMetadata } from "./types.js";

const PORT = parseInt(process.env.PORT || "8080", 10);

// Store active call handlers by connection
const activeCalls = new Map<WebSocket, CallHandler>();

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

logger.info(`Audio processing server starting on port ${PORT}`);

wss.on("connection", async (ws, req) => {
  logger.info(`New WebSocket connection from ${req.socket.remoteAddress}`);

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

          activeCalls.set(ws, callHandler);
          isInitialized = true;

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
  });

  ws.on("error", (error) => {
    logger.error("WebSocket error", error);
  });
});

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
