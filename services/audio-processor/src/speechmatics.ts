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
const FLUSH_DELAY_MS = 1500; // Emit after 1.5 seconds of silence
const MAX_BUFFER_WORDS = 20; // Emit if buffer reaches 20 words

const SPEECHMATICS_URL = "wss://eu2.rt.speechmatics.com/v2/en";

export interface SpeechmaticsConnection {
  sendAudio: (audioData: Buffer) => void;
  close: () => Promise<void>;
}

export function createSpeechmaticsConnection(
  onTranscript: (chunk: TranscriptChunk) => void,
  onError: (error: Error) => void
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

    // Create transcript buffer to group words into sentences
    const transcriptBuffer = new TranscriptBuffer(onTranscript);

    ws.on("open", () => {
      logger.info("Speechmatics WebSocket connected");

      // Send StartRecognition with speaker diarization
      const startMessage = {
        message: "StartRecognition",
        transcription_config: {
          language: "en",
          diarization: "speaker",
          speaker_diarization_config: {
            speaker_sensitivity: 0.5,
          },
          enable_partials: false, // Disable partials - only get final transcripts
          max_delay: 4.0, // Wait up to 4 seconds to group more words together
        },
        audio_format: {
          type: "raw",
          encoding: "pcm_s16le",
          sample_rate: 48000, // Matches desktop AudioContext sample rate
        },
      };

      logger.info("Sending StartRecognition with speaker diarization");
      ws.send(JSON.stringify(startMessage));
    });

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.message) {
          case "RecognitionStarted":
            logger.info("Speechmatics recognition started", {
              id: message.id,
            });

            if (!isResolved) {
              isResolved = true;
              resolve({
                sendAudio: (audioData: Buffer) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(audioData);
                  }
                },
                close: async () => {
                  logger.info("Closing Speechmatics connection...");
                  // Flush any remaining buffered words before closing
                  transcriptBuffer.destroy();
                  // Just close the WebSocket - EndOfStream message was causing validation errors
                  // Speechmatics will handle the disconnection gracefully
                  ws.close();
                },
              });
            }
            break;

          case "AddTranscript":
            transcriptBuffer.addWords(message);
            break;

          case "AddPartialTranscript":
            // Optionally handle partial transcripts for real-time display
            // For now, we only use final transcripts
            break;

          case "EndOfTranscript":
            logger.info("Speechmatics end of transcript received");
            break;

          case "AudioAdded":
            // Audio chunk acknowledged - no action needed
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
      logger.info(`Speechmatics connection closed: ${code} - ${reason}`);
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
      }
    }

    // Reset the flush timer - will flush after silence
    this.resetFlushTimer();
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
