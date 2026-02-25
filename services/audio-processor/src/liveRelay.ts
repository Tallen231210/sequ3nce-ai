// Live Relay - Manages WebSocket connections for managers listening to live calls
// Broadcasts audio from closers to connected managers
// Includes jitter buffer to smooth out variable-timing audio chunks

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

// Jitter buffer: accumulate audio chunks and flush at regular intervals
// This smooths out variable-timing chunks from cross-region WebSocket connections
const JITTER_BUFFER_MS = 400; // Cross-region EU→US needs larger buffer to absorb TCP jitter
const BROADCAST_SAMPLE_RATE = 48000; // broadcast format is 48kHz stereo
const BYTES_PER_FRAME = 4; // 16-bit stereo = 4 bytes per frame
const JITTER_BUFFER_BYTES = Math.floor(BROADCAST_SAMPLE_RATE * (JITTER_BUFFER_MS / 1000)) * BYTES_PER_FRAME;

interface CallBuffer {
  chunks: Buffer[];
  totalBytes: number;
  timer: NodeJS.Timeout | null;
}

const callBuffers = new Map<string, CallBuffer>();

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
 * Flush the jitter buffer for a call — concatenate and broadcast all buffered chunks
 */
function flushBuffer(visitorCallId: string): void {
  const buf = callBuffers.get(visitorCallId);
  if (!buf || buf.chunks.length === 0) return;

  // Concatenate all buffered chunks into one
  const combined = Buffer.concat(buf.chunks);
  buf.chunks = [];
  buf.totalBytes = 0;
  if (buf.timer) {
    clearTimeout(buf.timer);
    buf.timer = null;
  }

  // Send to all listeners
  const listeners = listenersByCall.get(visitorCallId);
  if (!listeners || listeners.size === 0) return;

  const deadConnections: WebSocket[] = [];

  for (const ws of listeners) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(combined);
      } catch (error) {
        logger.error(`[LiveRelay] Error sending to listener:`, error);
        deadConnections.push(ws);
      }
    } else {
      deadConnections.push(ws);
    }
  }

  for (const ws of deadConnections) {
    removeListener(ws);
  }
}

/**
 * Broadcast audio data to all listeners for a specific call.
 * Uses a jitter buffer to accumulate chunks and flush at regular intervals,
 * smoothing out variable-timing from cross-region WebSocket streams.
 * Returns the number of listeners for the call.
 */
export function broadcastAudio(visitorCallId: string, audioData: Buffer): number {
  const listeners = listenersByCall.get(visitorCallId);
  if (!listeners || listeners.size === 0) {
    return 0;
  }

  // Get or create jitter buffer for this call
  let buf = callBuffers.get(visitorCallId);
  if (!buf) {
    buf = { chunks: [], totalBytes: 0, timer: null };
    callBuffers.set(visitorCallId, buf);
  }

  // Add chunk to buffer
  buf.chunks.push(audioData);
  buf.totalBytes += audioData.length;

  // Flush if buffer has accumulated enough data
  if (buf.totalBytes >= JITTER_BUFFER_BYTES) {
    flushBuffer(visitorCallId);
  } else if (!buf.timer) {
    // Set fallback timer to flush after JITTER_BUFFER_MS even if threshold not reached
    // This prevents stale audio during pauses or low-bitrate periods
    buf.timer = setTimeout(() => {
      flushBuffer(visitorCallId);
    }, JITTER_BUFFER_MS);
  }

  return listeners.size;
}

/**
 * Notify all listeners that the call has ended
 */
export function notifyCallEnded(visitorCallId: string): void {
  // Flush any remaining buffered audio
  flushBuffer(visitorCallId);
  cleanupBuffer(visitorCallId);

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
 * Clean up jitter buffer for a call
 */
function cleanupBuffer(visitorCallId: string): void {
  const buf = callBuffers.get(visitorCallId);
  if (buf) {
    if (buf.timer) clearTimeout(buf.timer);
    callBuffers.delete(visitorCallId);
  }
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
  // Flush and clean up all jitter buffers
  for (const visitorCallId of callBuffers.keys()) {
    flushBuffer(visitorCallId);
    cleanupBuffer(visitorCallId);
  }
  for (const [visitorCallId, listeners] of listenersByCall) {
    notifyCallEnded(visitorCallId);
  }
  listenersByCall.clear();
  listenerInfo.clear();
  callBuffers.clear();
  logger.info("[LiveRelay] All listeners cleaned up");
}
