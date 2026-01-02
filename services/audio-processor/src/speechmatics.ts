// Speechmatics real-time transcription with SPEAKER DIARIZATION
//
// Uses AI-based speaker detection to identify different voices in mixed audio.
// This works well for turn-taking conversations (like sales calls).
//
// Speaker labels: "S1", "S2", etc. (first speaker detected is assumed to be Closer)

import WebSocket from "ws";
import { logger } from "./logger.js";
import type { TranscriptChunk } from "./types.js";

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
          sample_rate: 24000, // Matches actual browser output rate (not requested 48kHz)
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
                  // Just close the WebSocket - EndOfStream message was causing validation errors
                  // Speechmatics will handle the disconnection gracefully
                  ws.close();
                },
              });
            }
            break;

          case "AddTranscript":
            handleFinalTranscript(message, onTranscript);
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
 * Handle final transcript messages from Speechmatics.
 * Collects all words and emits as a single chunk per message.
 */
function handleFinalTranscript(
  message: any,
  onTranscript: (chunk: TranscriptChunk) => void
): void {
  const results = message.results || [];
  if (results.length === 0) return;

  // Log raw message for debugging
  const wordCount = results.filter((r: any) => r.type === "word").length;
  const allWords = results
    .filter((r: any) => r.type === "word")
    .map((r: any) => r.alternatives?.[0]?.content || "")
    .join(" ");
  logger.info(`[Speechmatics] AddTranscript: ${wordCount} words: "${allWords}"`);

  // Collect all words from this message
  const words: Array<{ text: string; speaker: string; startTime: number }> = [];

  for (const result of results) {
    if (result.type === "word") {
      const speaker = result.alternatives?.[0]?.speaker || "UNK";
      const word = result.alternatives?.[0]?.content || "";
      const startTime = result.start_time || 0;

      if (word.trim()) {
        words.push({ text: word, speaker, startTime });
      }
    }
  }

  if (words.length === 0) return;

  // Group consecutive words by speaker
  let currentSpeaker = words[0].speaker;
  let currentText = "";
  let startTime = words[0].startTime;

  for (const word of words) {
    // If speaker changed and we have accumulated text, emit it
    if (word.speaker !== currentSpeaker && currentText.trim()) {
      logger.info(`[Speechmatics] Emitting transcript: speaker=${currentSpeaker}, text="${currentText.trim().substring(0, 50)}..."`);
      onTranscript({
        text: currentText.trim(),
        speaker: currentSpeaker,
        timestamp: Date.now(),
        audioTimestamp: startTime,
        isFinal: true,
      });
      currentText = "";
      startTime = word.startTime;
      currentSpeaker = word.speaker;
    }

    currentText += word.text + " ";
  }

  // Emit remaining text
  if (currentText.trim()) {
    onTranscript({
      text: currentText.trim(),
      speaker: currentSpeaker,
      timestamp: Date.now(),
      audioTimestamp: startTime,
      isFinal: true,
    });
  }
}
