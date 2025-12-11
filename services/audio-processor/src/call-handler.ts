// Call session handler - manages a single call's lifecycle

import { createDeepgramConnection, type DeepgramConnection } from "./deepgram.js";
import { extractAmmo } from "./claude.js";
import { uploadRecording } from "./s3.js";
import {
  createCall,
  updateCallStatus,
  addAmmoItem,
  completeCall,
  addTranscript,
  getTeamCustomPrompt,
} from "./convex.js";
import { logger } from "./logger.js";
import type { CallMetadata, CallSession, TranscriptChunk, AmmoItem } from "./types.js";

const AMMO_EXTRACTION_INTERVAL_MS = 30000; // Extract ammo every 30 seconds
const MIN_TRANSCRIPT_LENGTH_FOR_AMMO = 100; // Minimum characters before attempting extraction

export class CallHandler {
  private session: CallSession;
  private deepgram: DeepgramConnection | null = null;
  private customPrompt?: string;
  private convexCallId: string | null = null;
  private isEnded = false;

  constructor(metadata: CallMetadata) {
    this.session = {
      metadata,
      startedAt: Date.now(),
      speakersDetected: new Set(),
      transcriptBuffer: "",
      audioBuffer: [],
      lastAmmoExtractionTime: Date.now(),
      fullTranscript: "",
    };

    logger.info(`Call handler created for call ${metadata.callId}`, metadata);
  }

  async start(): Promise<void> {
    try {
      // Create call record in Convex
      this.convexCallId = await createCall(this.session.metadata);

      // Get team's custom AI prompt if any
      this.customPrompt = await getTeamCustomPrompt(this.session.metadata.teamId);

      // Initialize Deepgram connection
      this.deepgram = createDeepgramConnection(
        this.handleTranscript.bind(this),
        this.handleSpeakerDetected.bind(this),
        this.handleDeepgramError.bind(this)
      );

      logger.info(`Call started: ${this.session.metadata.callId}`);
    } catch (error) {
      logger.error("Failed to start call", error);
      throw error;
    }
  }

  processAudio(audioData: Buffer): void {
    if (this.isEnded) return;

    // Buffer audio for recording
    this.session.audioBuffer.push(audioData);

    // Send to Deepgram for transcription
    if (this.deepgram) {
      this.deepgram.sendAudio(audioData);
    }
  }

  private async handleTranscript(chunk: TranscriptChunk): Promise<void> {
    if (this.isEnded) return;

    // Add to transcript buffer
    if (chunk.isFinal) {
      const speakerLabel = chunk.speaker === 0 ? "[Closer]" : "[Prospect]";
      const line = `${speakerLabel}: ${chunk.text}`;
      this.session.fullTranscript += line + "\n";
      this.session.transcriptBuffer += chunk.text + " ";

      // Update transcript in Convex periodically
      if (this.convexCallId && this.session.fullTranscript.length % 500 < 100) {
        await addTranscript(this.convexCallId, this.session.fullTranscript);
      }
    }

    // Check if we should extract ammo
    const timeSinceLastExtraction = Date.now() - this.session.lastAmmoExtractionTime;
    const hasEnoughContent = this.session.transcriptBuffer.length >= MIN_TRANSCRIPT_LENGTH_FOR_AMMO;

    if (timeSinceLastExtraction >= AMMO_EXTRACTION_INTERVAL_MS && hasEnoughContent) {
      await this.extractAndSaveAmmo();
    }
  }

  private async handleSpeakerDetected(speakerId: number): Promise<void> {
    if (this.isEnded) return;

    const previousCount = this.session.speakersDetected.size;
    this.session.speakersDetected.add(speakerId);
    const currentCount = this.session.speakersDetected.size;

    // Status change: WAITING -> ON_CALL when 2+ speakers detected
    if (previousCount < 2 && currentCount >= 2 && this.convexCallId) {
      logger.info(`Two speakers detected - call is now active: ${this.session.metadata.callId}`);
      await updateCallStatus(this.convexCallId, "on_call", currentCount);
    }
  }

  private handleDeepgramError(error: Error): void {
    logger.error(`Deepgram error for call ${this.session.metadata.callId}`, error);
    // Don't crash - try to continue
  }

  private async extractAndSaveAmmo(): Promise<void> {
    if (!this.convexCallId || this.session.transcriptBuffer.length < MIN_TRANSCRIPT_LENGTH_FOR_AMMO) {
      return;
    }

    const textToProcess = this.session.transcriptBuffer;
    this.session.transcriptBuffer = ""; // Clear buffer
    this.session.lastAmmoExtractionTime = Date.now();

    try {
      const ammoItems = await extractAmmo(textToProcess, this.customPrompt);

      for (const ammo of ammoItems) {
        const ammoWithTimestamp: AmmoItem = {
          ...ammo,
          timestamp: Date.now(),
        };
        await addAmmoItem(this.convexCallId, this.session.metadata.teamId, ammoWithTimestamp);
      }
    } catch (error) {
      logger.error("Failed to extract/save ammo", error);
    }
  }

  async end(): Promise<void> {
    if (this.isEnded) return;
    this.isEnded = true;

    logger.info(`Ending call: ${this.session.metadata.callId}`);

    // Close Deepgram connection
    if (this.deepgram) {
      this.deepgram.close();
      this.deepgram = null;
    }

    // Extract any remaining ammo
    if (this.session.transcriptBuffer.length >= MIN_TRANSCRIPT_LENGTH_FOR_AMMO) {
      await this.extractAndSaveAmmo();
    }

    // Calculate duration
    const duration = Math.floor((Date.now() - this.session.startedAt) / 1000);

    // Upload recording to S3
    let recordingUrl = "";
    if (this.session.audioBuffer.length > 0) {
      try {
        const combinedBuffer = Buffer.concat(this.session.audioBuffer);
        recordingUrl = await uploadRecording(
          this.session.metadata.teamId,
          this.session.metadata.callId,
          combinedBuffer
        );
      } catch (error) {
        logger.error("Failed to upload recording", error);
      }
    }

    // Mark call as completed in Convex
    if (this.convexCallId) {
      await completeCall(
        this.convexCallId,
        recordingUrl,
        this.session.fullTranscript,
        duration
      );
    }

    logger.info(`Call ended: ${this.session.metadata.callId} (duration: ${duration}s)`);
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
