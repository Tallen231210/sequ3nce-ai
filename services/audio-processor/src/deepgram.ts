// Deepgram real-time transcription integration with DIARIZATION
//
// Uses AI-based speaker diarization to identify speakers.
// Speaker assignment: First speaker detected = Closer, Second speaker = Prospect
// This is a fallback approach since macOS loopback audio doesn't work reliably.

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
  onError: (error: Error) => void
): DeepgramConnection {
  const connection = deepgram.listen.live({
    model: "nova-2",
    language: "en",
    smart_format: true,
    punctuate: true,
    // Raw PCM audio format - mono for diarization
    encoding: "linear16",  // 16-bit signed PCM
    sample_rate: 48000,    // 48kHz (standard AudioContext sample rate)
    channels: 1,           // Mono audio for diarization
    // Diarization for speaker separation (AI-based)
    diarize: true,         // Enable speaker diarization
    interim_results: true,
    utterance_end_ms: 1000,
    vad_events: true,
  });

  let transcriptCount = 0;
  let speaker0Count = 0;
  let speaker1Count = 0;
  // Track first speaker detected - they will be assigned as Closer
  let firstSpeaker: number | null = null;

  connection.on(LiveTranscriptionEvents.Open, () => {
    logger.info("Deepgram connection opened with DIARIZATION mode (linear16, 48kHz, mono)");
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
    const transcript = data.channel?.alternatives?.[0];
    if (!transcript) return;

    const text = transcript.transcript;
    if (!text || text.trim() === "") return;

    // Get speaker from diarization - speaker ID is in the words array
    const words = transcript.words || [];
    let speakerId = 0;

    // Get the dominant speaker from words (most words win)
    if (words.length > 0) {
      const speakerCounts: Record<number, number> = {};
      for (const word of words) {
        const speaker = word.speaker ?? 0;
        speakerCounts[speaker] = (speakerCounts[speaker] || 0) + 1;
      }
      // Find speaker with most words
      let maxCount = 0;
      for (const [speaker, count] of Object.entries(speakerCounts)) {
        if (count > maxCount) {
          maxCount = count;
          speakerId = parseInt(speaker);
        }
      }
    }

    // Track first speaker - they become the Closer
    if (firstSpeaker === null && data.is_final) {
      firstSpeaker = speakerId;
      logger.info(`[Diarization] First speaker detected: Speaker ${speakerId} -> assigned as CLOSER`);
    }

    // Map speaker to channel: firstSpeaker = 0 (Closer), other = 1 (Prospect)
    // This maintains compatibility with the rest of the codebase
    const channel = (speakerId === firstSpeaker) ? 0 : 1;

    // Debug logging
    transcriptCount++;
    if (channel === 0) speaker0Count++;
    if (channel === 1) speaker1Count++;

    if (transcriptCount % 10 === 0) {
      logger.info(`[Diarization Stats] Total: ${transcriptCount}, Closer: ${speaker0Count}, Prospect: ${speaker1Count}, FirstSpeaker: ${firstSpeaker}`);
    }

    // Log first few transcripts for debugging
    if (transcriptCount <= 5) {
      logger.info(`[Diarization Debug] Speaker ${speakerId} -> Channel ${channel}, is_final: ${data.is_final}, text: "${text.substring(0, 30)}..."`);
    }

    // Get audio-aligned timestamp from words if available
    let audioTimestamp = 0; // Seconds from start of audio stream

    if (words.length > 0 && words[0].start !== undefined) {
      audioTimestamp = words[0].start;
    }

    const chunk: TranscriptChunk = {
      text,
      channel, // 0 = Closer (first speaker), 1 = Prospect (other speakers)
      timestamp: Date.now(),
      audioTimestamp,
      isFinal: data.is_final || false,
    };

    logger.debug(`Transcript from Speaker ${speakerId} (${channel === 0 ? 'Closer' : 'Prospect'}): "${text.substring(0, 50)}..."`);
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
