// Speechmatics real-time transcription with SPEAKER DIARIZATION
//
// Uses AI-based speaker detection to identify different voices in mixed audio.
// This works well for turn-taking conversations (like sales calls).
//
// Speaker labels: "S1", "S2", etc. (first speaker detected is assumed to be Closer)

import WebSocket from "ws";
import { logger } from "./logger.js";
import type { TranscriptChunk } from "./types.js";

// Buffer settings for grouping words into sentences
const FLUSH_DELAY_MS = 800; // Emit after 0.8 seconds of silence (groups words into natural sentences)
const MAX_BUFFER_WORDS = 18; // Emit if buffer reaches 18 words (smaller chunks for faster display)

const SPEECHMATICS_URL = "wss://eu2.rt.speechmatics.com/v2/en";

export interface SpeechmaticsConnection {
  sendAudio: (audioData: Buffer) => void;
  close: () => Promise<void>;
  isConnected: () => boolean;
}

export function createSpeechmaticsConnection(
  onTranscript: (chunk: TranscriptChunk) => void,
  onError: (error: Error) => void,
  onSilenceWarning?: (silenceDurationSeconds: number) => void,
  sampleRate: number = 48000
): Promise<SpeechmaticsConnection> {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.SPEECHMATICS_API_KEY;
    if (!apiKey) {
      const error = new Error("SPEECHMATICS_API_KEY not set");
      logger.error(error.message);
      reject(error);
      return;
    }

    logger.info("Connecting to Speechmatics...");

    const ws = new WebSocket(SPEECHMATICS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    let isResolved = false;

    // Diagnostic tracking
    let lastMessageTime = Date.now();
    let lastWordTime = 0;
    let audioAddedCount = 0;
    let totalWordsReceived = 0;
    let healthCheckInterval: NodeJS.Timeout | null = null;

    // Create transcript buffer to group words into sentences
    const transcriptBuffer = new TranscriptBuffer(onTranscript);

    ws.on("open", () => {
      logger.info("Speechmatics WebSocket connected");

      // Send StartRecognition with speaker diarization
      const startMessage = {
        message: "StartRecognition",
        transcription_config: {
          language: "en",
          operating_point: "standard", // Standard accuracy (~1-2% less than enhanced, ~50% cheaper)
          diarization: "speaker",
          speaker_diarization_config: {
            speaker_sensitivity: 0.5,
          },
          enable_partials: false, // Disabled — partials fragment transcript into single words
          max_delay: 1.5, // Reduced from 2.0 for faster delivery while keeping good word grouping
        },
        audio_format: {
          type: "raw",
          encoding: "pcm_s16le",
          sample_rate: sampleRate,
        },
      };

      logger.info("Sending StartRecognition with speaker diarization");
      ws.send(JSON.stringify(startMessage));
    });

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        lastMessageTime = Date.now();

        switch (message.message) {
          case "RecognitionStarted":
            logger.info("Speechmatics recognition started", {
              id: message.id,
            });

            // Start health check - log every 15 seconds, warn desktop after 30s of silence
            let silenceWarningSent = false;
            healthCheckInterval = setInterval(() => {
              const timeSinceLastWord = lastWordTime ? Date.now() - lastWordTime : Date.now() - lastMessageTime;
              const timeSinceLastMessage = Date.now() - lastMessageTime;
              const silenceSeconds = Math.round(timeSinceLastWord / 1000);

              if (timeSinceLastWord > 30000) {
                logger.warn(`[Speechmatics Health] No words for ${silenceSeconds}s. ` +
                  `Total words: ${totalWordsReceived}, AudioAdded msgs: ${audioAddedCount}, ` +
                  `Last message: ${Math.round(timeSinceLastMessage / 1000)}s ago, ` +
                  `WS state: ${ws.readyState === WebSocket.OPEN ? 'OPEN' : 'CLOSED'}`);

                // Send silence warning to desktop (only once per silence period)
                if (!silenceWarningSent && onSilenceWarning) {
                  onSilenceWarning(silenceSeconds);
                  silenceWarningSent = true;
                  logger.info(`[Speechmatics] Sent silence warning to desktop after ${silenceSeconds}s`);
                }
              } else {
                // Reset warning flag if speech resumes
                silenceWarningSent = false;
              }
            }, 15000); // Check every 15 seconds

            if (!isResolved) {
              isResolved = true;
              resolve({
                sendAudio: (audioData: Buffer) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(audioData);
                  } else {
                    logger.warn(`[Speechmatics] Cannot send audio - WebSocket state: ${ws.readyState}`);
                  }
                },
                close: async () => {
                  logger.info("Closing Speechmatics connection...");
                  if (healthCheckInterval) {
                    clearInterval(healthCheckInterval);
                    healthCheckInterval = null;
                  }
                  // Flush any remaining buffered words before closing
                  transcriptBuffer.destroy();
                  // Log final stats
                  logger.info(`[Speechmatics] Final stats: totalWords=${totalWordsReceived}, audioAddedMsgs=${audioAddedCount}`);
                  // Just close the WebSocket - EndOfStream message was causing validation errors
                  // Speechmatics will handle the disconnection gracefully
                  ws.close();
                },
                isConnected: () => ws.readyState === WebSocket.OPEN,
              });
            }
            break;

          case "AddTranscript":
            // Count words in this message
            const wordCount = (message.results || []).filter((r: any) => r.type === "word").length;
            if (wordCount > 0) {
              lastWordTime = Date.now();
              totalWordsReceived += wordCount;
            }
            transcriptBuffer.addWords(message);
            break;

          case "AddPartialTranscript":
            // Partial transcripts provide real-time feedback while speech is ongoing
            // Update lastWordTime so silence detection stays accurate
            if ((message.results || []).some((r: any) => r.type === "word")) {
              lastWordTime = Date.now();
            }
            // Partials disabled — just track silence detection timing
            break;

          case "EndOfTranscript":
            logger.info("Speechmatics end of transcript received");
            break;

          case "AudioAdded":
            // Audio chunk acknowledged - track for diagnostics
            audioAddedCount++;
            // Log every 500 AudioAdded messages to confirm audio is flowing
            if (audioAddedCount % 500 === 0) {
              logger.info(`[Speechmatics] AudioAdded count: ${audioAddedCount}, totalWords: ${totalWordsReceived}`);
            }
            break;

          case "Info":
            logger.info("Speechmatics info:", message);
            break;

          case "Warning":
            logger.warn("Speechmatics warning:", message);
            break;

          case "Error":
            logger.error("Speechmatics error:", message);
            onError(new Error(message.reason || "Unknown Speechmatics error"));
            break;

          default:
            logger.debug("Speechmatics message:", message.message);
        }
      } catch (e) {
        logger.error("Failed to parse Speechmatics message:", e);
      }
    });

    ws.on("error", (err) => {
      logger.error("Speechmatics WebSocket error:", err);
      onError(err instanceof Error ? err : new Error(String(err)));
      if (!isResolved) {
        isResolved = true;
        reject(err);
      }
    });

    ws.on("close", (code, reason) => {
      logger.info(`Speechmatics connection closed: ${code} - ${reason}. Final stats: totalWords=${totalWordsReceived}, audioAddedMsgs=${audioAddedCount}`);
      if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
      }
    });

    // Timeout if we don't get RecognitionStarted within 10 seconds
    setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        const error = new Error("Speechmatics connection timeout");
        logger.error(error.message);
        ws.close();
        reject(error);
      }
    }, 10000);
  });
}

/**
 * TranscriptBuffer accumulates words across multiple Speechmatics messages
 * and emits them as grouped sentences/phrases instead of one word at a time.
 */
class TranscriptBuffer {
  private buffer: Array<{ text: string; speaker: string; startTime: number }> = [];
  private currentSpeaker: string | null = null;
  private startTime: number = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private onTranscript: (chunk: TranscriptChunk) => void;

  constructor(onTranscript: (chunk: TranscriptChunk) => void) {
    this.onTranscript = onTranscript;
  }

  addWords(message: any): void {
    const results = message.results || [];
    if (results.length === 0) return;

    // Log incoming words
    const wordCount = results.filter((r: any) => r.type === "word").length;
    const allWords = results
      .filter((r: any) => r.type === "word")
      .map((r: any) => r.alternatives?.[0]?.content || "")
      .join(" ");

    if (wordCount > 0) {
      logger.debug(`[Speechmatics] Received ${wordCount} words: "${allWords}"`);
    }

    for (const result of results) {
      if (result.type === "word") {
        const speaker = result.alternatives?.[0]?.speaker || "UNK";
        const word = result.alternatives?.[0]?.content || "";
        const startTime = result.start_time || 0;

        if (!word.trim()) continue;

        // If speaker changed, flush current buffer first
        if (this.currentSpeaker && speaker !== this.currentSpeaker) {
          this.flush();
        }

        // Set speaker if not set
        if (!this.currentSpeaker) {
          this.currentSpeaker = speaker;
          this.startTime = startTime;
        }

        this.buffer.push({ text: word, speaker, startTime });

        // Flush if buffer is getting large
        if (this.buffer.length >= MAX_BUFFER_WORDS) {
          this.flush();
        }
      } else if (result.type === "punctuation") {
        // Append punctuation to last word in buffer (don't flush — let natural grouping handle it)
        const punct = result.alternatives?.[0]?.content || "";
        if (this.buffer.length > 0) {
          this.buffer[this.buffer.length - 1].text += punct;
        }
      }
    }

    // Reset the flush timer - will flush after silence
    if (this.buffer.length > 0) {
      this.resetFlushTimer();
    }
  }

  addPartialWords(message: any): void {
    const results = message.results || [];
    if (results.length === 0) return;

    const words = results
      .filter((r: any) => r.type === "word")
      .map((r: any) => r.alternatives?.[0]?.content || "")
      .filter((w: string) => w.trim());

    if (words.length === 0) return;

    const speaker = results.find((r: any) => r.type === "word")?.alternatives?.[0]?.speaker || "UNK";
    const startTime = results.find((r: any) => r.type === "word")?.start_time || 0;
    const text = words.join(" ");

    // Emit as non-final (partial) — call-handler will handle display without persisting
    this.onTranscript({
      text,
      speaker,
      timestamp: Date.now(),
      audioTimestamp: startTime,
      isFinal: false,
    });
  }

  private resetFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flush();
    }, FLUSH_DELAY_MS);
  }

  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0 || !this.currentSpeaker) return;

    const text = this.buffer.map(w => w.text).join(" ");

    logger.info(`[Speechmatics] Emitting: speaker=${this.currentSpeaker}, words=${this.buffer.length}, text="${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);

    this.onTranscript({
      text: text,
      speaker: this.currentSpeaker,
      timestamp: Date.now(),
      audioTimestamp: this.startTime,
      isFinal: true,
    });

    // Reset buffer
    this.buffer = [];
    this.currentSpeaker = null;
    this.startTime = 0;
  }

  destroy(): void {
    this.flush(); // Emit any remaining words
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
