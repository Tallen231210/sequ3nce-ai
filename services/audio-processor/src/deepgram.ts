// Deepgram real-time transcription integration

import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import type { LiveClient } from "@deepgram/sdk";
import { logger } from "./logger.js";
import type { TranscriptChunk } from "./types.js";

const deepgramApiKey = process.env.DEEPGRAM_API_KEY!;
const deepgram = createClient(deepgramApiKey);

export interface DeepgramConnection {
  connection: LiveClient;
  sendAudio: (audioData: Buffer) => void;
  close: () => void;
}

export function createDeepgramConnection(
  onTranscript: (chunk: TranscriptChunk) => void,
  onSpeakerDetected: (speakerId: number) => void,
  onError: (error: Error) => void
): DeepgramConnection {
  const connection = deepgram.listen.live({
    model: "nova-2",
    language: "en",
    smart_format: true,
    punctuate: true,
    diarize: true, // Enable speaker diarization
    interim_results: true,
    utterance_end_ms: 1000,
    vad_events: true,
  });

  connection.on(LiveTranscriptionEvents.Open, () => {
    logger.info("Deepgram connection opened");
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel?.alternatives?.[0];
    if (!transcript) return;

    const text = transcript.transcript;
    if (!text || text.trim() === "") return;

    // Get speaker and audio-aligned timestamp from words if available
    const words = transcript.words || [];
    let speaker = 0;
    let audioTimestamp = 0; // Seconds from start of audio stream

    if (words.length > 0) {
      // Use Deepgram's audio-aligned timestamp (start time of first word)
      if (words[0].start !== undefined) {
        audioTimestamp = words[0].start;
      }
      if (words[0].speaker !== undefined) {
        speaker = words[0].speaker;
        onSpeakerDetected(speaker);
      }
    }

    const chunk: TranscriptChunk = {
      text,
      speaker,
      timestamp: Date.now(),
      audioTimestamp, // NEW: Actual position in audio stream (seconds)
      isFinal: data.is_final || false,
    };

    onTranscript(chunk);
  });

  connection.on(LiveTranscriptionEvents.Error, (error) => {
    logger.error("Deepgram error", error);
    onError(error instanceof Error ? error : new Error(String(error)));
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    logger.info("Deepgram connection closed");
  });

  return {
    connection,
    sendAudio: (audioData: Buffer) => {
      if (connection.getReadyState() === 1) {
        // Convert Buffer to ArrayBuffer for Deepgram SDK compatibility
        const arrayBuffer = audioData.buffer.slice(
          audioData.byteOffset,
          audioData.byteOffset + audioData.byteLength
        ) as ArrayBuffer;
        connection.send(arrayBuffer);
      }
    },
    close: () => {
      connection.requestClose();
    },
  };
}
