// Call session handler - manages a single call's lifecycle

import { createSpeechmaticsConnection, type SpeechmaticsConnection } from "./speechmatics.js";
import { extractAmmo } from "./claude.js";
import { uploadRecording } from "./s3.js";
import {
  createCall,
  updateCallStatus,
  addAmmoItem,
  completeCall,
  addTranscript,
  addTranscriptSegment,
  getTeamCustomPrompt,
  getAmmoConfig,
  updateCallDetection,
  updateTalkTime,
} from "./convex.js";
import { analyzeTranscriptForDetection } from "./detection.js";
import { getManifestoForCall } from "./manifesto.js";
import { logger } from "./logger.js";
import type { CallMetadata, CallSession, TranscriptChunk, AmmoItem, AmmoConfig } from "./types.js";

const AMMO_EXTRACTION_INTERVAL_MS = 30000; // Extract ammo every 30 seconds
const MIN_TRANSCRIPT_LENGTH_FOR_AMMO = 100; // Minimum characters before attempting extraction
const TALK_TIME_UPDATE_INTERVAL_MS = 15000; // Update talk time every 15 seconds

export class CallHandler {
  private session: CallSession;
  private speechmatics: SpeechmaticsConnection | null = null;
  private customPrompt?: string;
  private ammoConfig?: AmmoConfig | null;
  private convexCallId: string | null = null;
  private isEnded = false;
  private hasStartedCall = false; // Track if we've updated status to on_call
  private firstSpeaker: string | null = null; // First speaker detected = Closer
  private sampleRate: number; // Audio sample rate from desktop

  constructor(metadata: CallMetadata) {
    this.sampleRate = metadata.sampleRate || 48000;
    this.session = {
      metadata,
      startedAt: Date.now(),
      speakersDetected: new Set(),
      transcriptBuffer: "",
      audioBuffer: [],
      lastAmmoExtractionTime: Date.now(),
      fullTranscript: "",
      // Talk time tracking
      closerTalkTimeMs: 0,
      prospectTalkTimeMs: 0,
      lastTalkTimeUpdateTime: Date.now(),
      // Audio timestamp for ammo (seconds from audio start)
      lastAudioTimestamp: 0,
    };

    logger.info(`Call handler created for call ${metadata.callId} (sampleRate: ${this.sampleRate}Hz)`, metadata);
  }

  async start(): Promise<string | null> {
    try {
      // Create call record in Convex - this returns the Convex _id
      this.convexCallId = await createCall(this.session.metadata);

      // Get team's ammo config (custom categories, offer details, etc.)
      this.ammoConfig = await getAmmoConfig(this.session.metadata.teamId);

      // Get team's custom AI prompt if any (legacy, still used as fallback)
      this.customPrompt = await getTeamCustomPrompt(this.session.metadata.teamId);

      // Initialize Speechmatics connection with speaker diarization
      // First speaker detected will be assumed to be the Closer
      this.speechmatics = await createSpeechmaticsConnection(
        this.handleTranscript.bind(this),
        this.handleSpeechmaticsError.bind(this)
      );

      logger.info(`Call started: ${this.session.metadata.callId}, Convex ID: ${this.convexCallId}, hasAmmoConfig: ${!!this.ammoConfig}, mode: SPEECHMATICS_SPEAKER_DIARIZATION`);

      // Return the Convex-generated call ID so desktop can use it
      return this.convexCallId;
    } catch (error) {
      logger.error("Failed to start call", error);
      throw error;
    }
  }

  private audioChunkCount = 0;
  private lastAudioLogTime = 0;

  processAudio(audioData: Buffer): void {
    if (this.isEnded) return;

    // Buffer audio for recording (keep original format for S3)
    this.session.audioBuffer.push(audioData);
    this.audioChunkCount++;

    // Resample and send to Speechmatics for transcription
    if (this.speechmatics) {
      const resampled = this.resampleAudio(audioData);

      // Log BOTH input and resampled stats for the SAME chunk (every 50 chunks)
      if (this.audioChunkCount % 50 === 1) {
        // Input stats - check ALL samples, not just first 1000 bytes
        let inputMaxLeft = 0;
        let inputMaxRight = 0;
        for (let i = 0; i < audioData.length - 3; i += 4) {
          const left = Math.abs(audioData.readInt16LE(i));
          const right = Math.abs(audioData.readInt16LE(i + 2));
          if (left > inputMaxLeft) inputMaxLeft = left;
          if (right > inputMaxRight) inputMaxRight = right;
        }

        // Resampled stats - check ALL samples
        let resampledMax = 0;
        for (let i = 0; i < resampled.length - 1; i += 2) {
          const sample = Math.abs(resampled.readInt16LE(i));
          if (sample > resampledMax) resampledMax = sample;
        }

        const expectedSize = (audioData.length / 4) * 2; // stereo to mono, no decimation
        logger.info(`[Audio] Chunk #${this.audioChunkCount}: input=${audioData.length}b L=${inputMaxLeft} R=${inputMaxRight} -> mono=${resampled.length}b (exp=${expectedSize}) max=${resampledMax}`);
      }

      this.speechmatics.sendAudio(resampled);
    }
  }

  /**
   * Convert stereo to mono at 48kHz (NO resampling - send at native rate).
   * Input: 48kHz, 16-bit stereo interleaved (4 bytes per sample pair)
   * Output: 48kHz, 16-bit mono (2 bytes per sample)
   *
   * Previous 16kHz decimation was causing aliasing artifacts that made
   * speech sound like gibberish ("puff puff"). Sending at 48kHz avoids this.
   */
  private resampleAudio(buffer: Buffer): Buffer {
    const inputSamplePairs = buffer.length / 4; // 4 bytes per stereo sample pair
    const output = Buffer.alloc(inputSamplePairs * 2); // 2 bytes per mono sample (no decimation)

    for (let i = 0; i < inputSamplePairs; i++) {
      const inputIndex = i * 4; // 4 bytes per stereo pair

      // Check bounds
      if (inputIndex + 3 >= buffer.length) break;

      // Mix left + right channels to mono (both may have audio now)
      const left = buffer.readInt16LE(inputIndex);
      const right = buffer.readInt16LE(inputIndex + 2);
      const mono = Math.round((left + right) / 2);

      output.writeInt16LE(mono, i * 2);
    }

    return output;
  }

  private async handleTranscript(chunk: TranscriptChunk): Promise<void> {
    if (this.isEnded) return;

    // Mark call as active on first transcript (replaces old 2-speaker detection)
    if (!this.hasStartedCall && this.convexCallId) {
      this.hasStartedCall = true;
      logger.info(`First transcript received - call is now active: ${this.session.metadata.callId}`);
      await updateCallStatus(this.convexCallId, "on_call", 2);
    }

    // Add to transcript buffer
    if (chunk.isFinal && chunk.text.trim()) {
      // Speaker diarization: first speaker detected is assumed to be Closer
      const isCloser = this.getIsCloser(chunk.speaker);
      const speakerLabel = isCloser ? "[Closer]" : "[Prospect]";
      const line = `${speakerLabel}: ${chunk.text}`;
      this.session.fullTranscript += line + "\n";
      this.session.transcriptBuffer += chunk.text + " ";

      // Track talk time based on audio duration
      // Estimate duration from text length (average speaking rate: ~150 words/min = 2.5 words/sec)
      // Each word averages ~5 chars, so ~12.5 chars/sec
      const estimatedDurationMs = (chunk.text.length / 12.5) * 1000;
      if (isCloser) {
        this.session.closerTalkTimeMs += estimatedDurationMs;
      } else {
        this.session.prospectTalkTimeMs += estimatedDurationMs;
      }

      // CRITICAL: Add transcript segment to Convex for real-time display in dashboard
      if (this.convexCallId) {
        const speaker = isCloser ? "closer" : "prospect";
        // Use Speechmatics' audio-aligned timestamp (accurate to the actual recording)
        // This ensures playbook snippets play at the correct position
        const timestampSeconds = Math.floor(chunk.audioTimestamp);

        // Track latest audio timestamp for ammo extraction
        this.session.lastAudioTimestamp = timestampSeconds;

        // Add segment for real-time viewing (non-blocking)
        addTranscriptSegment(
          this.convexCallId,
          this.session.metadata.teamId,
          speaker,
          chunk.text,
          timestampSeconds
        ).catch(err => logger.error("Failed to add transcript segment", err));
      }

      // Update full transcript more frequently (every 5 lines instead of sporadic)
      const lineCount = this.session.fullTranscript.split('\n').filter(l => l.trim()).length;
      if (this.convexCallId && lineCount % 5 === 0) {
        addTranscript(this.convexCallId, this.session.fullTranscript)
          .catch(err => logger.error("Failed to update transcript", err));
      }

      // Update talk time periodically
      const timeSinceLastTalkTimeUpdate = Date.now() - this.session.lastTalkTimeUpdateTime;
      if (timeSinceLastTalkTimeUpdate >= TALK_TIME_UPDATE_INTERVAL_MS && this.convexCallId) {
        const closerSecs = Math.round(this.session.closerTalkTimeMs / 1000);
        const prospectSecs = Math.round(this.session.prospectTalkTimeMs / 1000);
        updateTalkTime(this.convexCallId, closerSecs, prospectSecs)
          .catch(err => logger.error("Failed to update talk time", err));
        this.session.lastTalkTimeUpdateTime = Date.now();
      }
    }

    // Check if we should extract ammo
    const timeSinceLastExtraction = Date.now() - this.session.lastAmmoExtractionTime;
    const hasEnoughContent = this.session.transcriptBuffer.length >= MIN_TRANSCRIPT_LENGTH_FOR_AMMO;

    if (timeSinceLastExtraction >= AMMO_EXTRACTION_INTERVAL_MS && hasEnoughContent) {
      await this.extractAndSaveAmmo();
    }
  }

  private handleSpeechmaticsError(error: Error): void {
    logger.error(`Speechmatics error for call ${this.session.metadata.callId}`, error);
    // Don't crash - try to continue
  }

  /**
   * Determine if a speaker is the Closer based on first-speaker heuristic.
   * The first speaker detected in the call is assumed to be the Closer
   * (they typically start with a greeting).
   */
  private getIsCloser(speaker: string): boolean {
    if (!this.firstSpeaker) {
      this.firstSpeaker = speaker;
      logger.info(`First speaker detected: ${speaker} (will be treated as Closer)`);
    }
    return speaker === this.firstSpeaker;
  }

  private async extractAndSaveAmmo(): Promise<void> {
    if (!this.convexCallId || this.session.transcriptBuffer.length < MIN_TRANSCRIPT_LENGTH_FOR_AMMO) {
      return;
    }

    const textToProcess = this.session.transcriptBuffer;
    this.session.transcriptBuffer = ""; // Clear buffer
    this.session.lastAmmoExtractionTime = Date.now();

    try {
      // Extract ammo (simple version - just quotes and categories)
      const ammoItems = await extractAmmo(textToProcess);

      // Save each ammo item with audio-aligned timestamp (seconds from start)
      for (const ammo of ammoItems) {
        const ammoWithTimestamp: AmmoItem = {
          ...ammo,
          timestamp: this.session.lastAudioTimestamp,
        };
        await addAmmoItem(this.convexCallId, this.session.metadata.teamId, ammoWithTimestamp);
      }
    } catch (error) {
      logger.error("Failed to extract/save ammo", error);
    }
  }

  // Run AI detection analysis on the full transcript
  private async runDetectionAnalysis(): Promise<void> {
    if (!this.convexCallId) return;

    try {
      logger.info(`Running detection analysis for call ${this.session.metadata.callId}`);

      // Get manifesto for context (use team's custom if available, otherwise defaults)
      const manifesto = getManifestoForCall(this.ammoConfig?.callManifesto);

      // Analyze transcript for key indicators
      const detection = await analyzeTranscriptForDetection(
        this.session.fullTranscript,
        this.ammoConfig,
        manifesto
      );

      // Save detection results to Convex
      await updateCallDetection(this.convexCallId, detection);

      logger.info(`Detection analysis complete for call ${this.session.metadata.callId}`);
    } catch (error) {
      logger.error("Failed to run detection analysis", error);
    }
  }

  async end(): Promise<void> {
    if (this.isEnded) return;
    this.isEnded = true;

    logger.info(`Ending call: ${this.session.metadata.callId}`);

    // Close Speechmatics connection
    if (this.speechmatics) {
      await this.speechmatics.close();
      this.speechmatics = null;
    }

    // Extract any remaining ammo
    if (this.session.transcriptBuffer.length >= MIN_TRANSCRIPT_LENGTH_FOR_AMMO) {
      await this.extractAndSaveAmmo();
    }

    // Save final talk time
    if (this.convexCallId && (this.session.closerTalkTimeMs > 0 || this.session.prospectTalkTimeMs > 0)) {
      const closerSecs = Math.round(this.session.closerTalkTimeMs / 1000);
      const prospectSecs = Math.round(this.session.prospectTalkTimeMs / 1000);
      await updateTalkTime(this.convexCallId, closerSecs, prospectSecs);
      logger.info(`Final talk time: closer=${closerSecs}s, prospect=${prospectSecs}s`);
    }

    // Calculate duration
    const duration = Math.floor((Date.now() - this.session.startedAt) / 1000);

    // Run AI detection analysis on full transcript (non-blocking for call completion)
    if (this.convexCallId && this.session.fullTranscript.length >= 200) {
      this.runDetectionAnalysis().catch(err =>
        logger.error("Failed to run detection analysis", err)
      );
    }

    // Upload recording to S3
    let recordingUrl = "";
    const audioChunkCount = this.session.audioBuffer.length;
    logger.info(`Recording upload: ${audioChunkCount} audio chunks collected`);

    if (audioChunkCount > 0) {
      try {
        const combinedBuffer = Buffer.concat(this.session.audioBuffer);
        logger.info(`Recording upload: Combined buffer size = ${combinedBuffer.length} bytes`);

        recordingUrl = await uploadRecording(
          this.session.metadata.teamId,
          this.session.metadata.callId,
          combinedBuffer,
          this.sampleRate
        );

        if (recordingUrl) {
          logger.info(`Recording uploaded successfully: ${recordingUrl}`);
        } else {
          logger.warn(`Recording upload returned empty URL - check S3 configuration`);
        }
      } catch (error) {
        logger.error("Failed to upload recording", error);
      }
    } else {
      logger.warn(`No audio chunks collected for call ${this.session.metadata.callId} - no recording to upload`);
    }

    // Mark call as completed in Convex
    if (this.convexCallId) {
      logger.info(`Completing call in Convex: ${this.convexCallId}, recordingUrl=${recordingUrl ? 'set' : 'empty'}`);
      await completeCall(
        this.convexCallId,
        recordingUrl,
        this.session.fullTranscript,
        duration
      );
    }

    logger.info(`Call ended: ${this.session.metadata.callId} (duration: ${duration}s, chunks: ${audioChunkCount}, hasRecording: ${!!recordingUrl})`);
  }

  getStats() {
    return {
      callId: this.session.metadata.callId,
      duration: Math.floor((Date.now() - this.session.startedAt) / 1000),
      speakerCount: this.session.speakersDetected.size,
      transcriptLength: this.session.fullTranscript.length,
      audioChunks: this.session.audioBuffer.length,
    };
  }
}
