// Deepgram real-time transcription integration with MULTICHANNEL support
//
// Uses stereo audio where:
// - Channel 0 (Left) = Closer's microphone
// - Channel 1 (Right) = System audio (Prospect from Zoom/Meet/Teams)
//
// This eliminates AI-based diarization and provides 100% accurate speaker identification.

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
    // Raw PCM audio format - no container, just interleaved samples
    encoding: "linear16",  // 16-bit signed PCM
    sample_rate: 48000,    // 48kHz (standard AudioContext sample rate)
    // Multichannel configuration for speaker separation
    multichannel: true,    // Enable multichannel transcription
    channels: 2,           // 2 channels: 0=Closer (mic), 1=Prospect (system audio)
    interim_results: true,
    utterance_end_ms: 1000,
    vad_events: true,
  });

  let transcriptCount = 0;
  let channel0Count = 0;
  let channel1Count = 0;

  connection.on(LiveTranscriptionEvents.Open, () => {
    logger.info("Deepgram connection opened with MULTICHANNEL mode (linear16, 48kHz, 2 channels)");
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
    const transcript = data.channel?.alternatives?.[0];
    if (!transcript) return;

    const text = transcript.transcript;
    if (!text || text.trim() === "") return;

    // Get channel index from multichannel response
    // channel_index is [channelNumber, totalChannels], e.g., [0, 2] or [1, 2]
    const channelIndex = data.channel_index?.[0] ?? 0;

    // Debug logging
    transcriptCount++;
    if (channelIndex === 0) channel0Count++;
    if (channelIndex === 1) channel1Count++;

    if (transcriptCount % 10 === 0) {
      logger.info(`[Deepgram Stats] Total: ${transcriptCount}, Channel 0 (Closer): ${channel0Count}, Channel 1 (Prospect): ${channel1Count}`);
    }

    // Log raw channel_index for debugging
    if (transcriptCount <= 5) {
      logger.info(`[Deepgram Debug] Raw channel_index: ${JSON.stringify(data.channel_index)}, is_final: ${data.is_final}`);
    }

    // Get audio-aligned timestamp from words if available
    const words = transcript.words || [];
    let audioTimestamp = 0; // Seconds from start of audio stream

    if (words.length > 0 && words[0].start !== undefined) {
      audioTimestamp = words[0].start;
    }

    const chunk: TranscriptChunk = {
      text,
      channel: channelIndex, // 0 = Closer (mic), 1 = Prospect (system audio)
      timestamp: Date.now(),
      audioTimestamp,
      isFinal: data.is_final || false,
    };

    logger.debug(`Transcript from Channel ${channelIndex} (${channelIndex === 0 ? 'Closer' : 'Prospect'}): "${text.substring(0, 50)}..."`);
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
