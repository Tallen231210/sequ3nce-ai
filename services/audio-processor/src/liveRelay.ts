// Live Relay - Manages WebSocket connections for managers listening to live calls
// Broadcasts audio from closers to connected managers

import { WebSocket } from "ws";
import { logger } from "./logger.js";

// Store listeners by visitorCallId
// Each call can have multiple manager listeners
const listenersByCall = new Map<string, Set<WebSocket>>();

// Store metadata for each listener connection
interface ListenerInfo {
  visitorCallId: string;
  managerId?: string;
  connectedAt: number;
}
const listenerInfo = new Map<WebSocket, ListenerInfo>();

/**
 * Add a manager as a listener for a specific call
 */
export function addListener(
  visitorCallId: string,
  ws: WebSocket,
  managerId?: string
): void {
  // Get or create listener set for this call
  let listeners = listenersByCall.get(visitorCallId);
  if (!listeners) {
    listeners = new Set();
    listenersByCall.set(visitorCallId, listeners);
  }

  // Add this WebSocket to listeners
  listeners.add(ws);

  // Store listener info for cleanup
  listenerInfo.set(ws, {
    visitorCallId,
    managerId,
    connectedAt: Date.now(),
  });

  logger.info(
    `[LiveRelay] Manager ${managerId || "unknown"} connected to call ${visitorCallId}. Total listeners: ${listeners.size}`
  );
}

/**
 * Remove a manager listener
 */
export function removeListener(ws: WebSocket): void {
  const info = listenerInfo.get(ws);
  if (!info) return;

  const listeners = listenersByCall.get(info.visitorCallId);
  if (listeners) {
    listeners.delete(ws);
    logger.info(
      `[LiveRelay] Manager ${info.managerId || "unknown"} disconnected from call ${info.visitorCallId}. Remaining listeners: ${listeners.size}`
    );

    // Clean up empty sets
    if (listeners.size === 0) {
      listenersByCall.delete(info.visitorCallId);
    }
  }

  listenerInfo.delete(ws);
}

/**
 * Broadcast audio data to all listeners for a specific call
 * Returns the number of listeners that received the audio
 */
export function broadcastAudio(visitorCallId: string, audioData: Buffer): number {
  const listeners = listenersByCall.get(visitorCallId);
  if (!listeners || listeners.size === 0) {
    return 0;
  }

  let sentCount = 0;
  const deadConnections: WebSocket[] = [];

  for (const ws of listeners) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(audioData);
        sentCount++;
      } catch (error) {
        logger.error(`[LiveRelay] Error sending to listener:`, error);
        deadConnections.push(ws);
      }
    } else {
      // Connection is no longer open, mark for cleanup
      deadConnections.push(ws);
    }
  }

  // Clean up dead connections
  for (const ws of deadConnections) {
    removeListener(ws);
  }

  return sentCount;
}

/**
 * Notify all listeners that the call has ended
 */
export function notifyCallEnded(visitorCallId: string): void {
  const listeners = listenersByCall.get(visitorCallId);
  if (!listeners || listeners.size === 0) {
    return;
  }

  const endMessage = JSON.stringify({ type: "stream-ended" });

  for (const ws of listeners) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(endMessage);
      } catch (error) {
        logger.error(`[LiveRelay] Error sending end notification:`, error);
      }
    }
  }

  logger.info(
    `[LiveRelay] Notified ${listeners.size} listeners that call ${visitorCallId} ended`
  );

  // Clean up all listeners for this call
  for (const ws of listeners) {
    listenerInfo.delete(ws);
  }
  listenersByCall.delete(visitorCallId);
}

/**
 * Get the number of listeners for a specific call
 */
export function getListenerCount(visitorCallId: string): number {
  const listeners = listenersByCall.get(visitorCallId);
  return listeners?.size ?? 0;
}

/**
 * Check if a call has any listeners
 */
export function hasListeners(visitorCallId: string): boolean {
  return getListenerCount(visitorCallId) > 0;
}

/**
 * Get all active call IDs that have listeners
 */
export function getActiveCallIds(): string[] {
  return Array.from(listenersByCall.keys());
}

/**
 * Clean up all listeners (for graceful shutdown)
 */
export function cleanupAll(): void {
  for (const [visitorCallId, listeners] of listenersByCall) {
    notifyCallEnded(visitorCallId);
  }
  listenersByCall.clear();
  listenerInfo.clear();
  logger.info("[LiveRelay] All listeners cleaned up");
}
