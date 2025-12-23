// Call session handler - manages a single call's lifecycle

import { createDeepgramConnection, type DeepgramConnection } from "./deepgram.js";
import { extractAmmo, type ExtractionContext } from "./claude.js";
import { uploadRecording } from "./s3.js";
import {
  createCall,
  updateCallStatus,
  addAmmoItem,
  completeCall,
  addTranscript,
  addTranscriptSegment,
  getTeamCustomPrompt,
  setSpeakerMapping,
  getAmmoConfig,
  addNudge,
  updateCallDetection,
} from "./convex.js";
import { analyzeTranscriptForDetection } from "./detection.js";
import { getManifestoForCall } from "./manifesto.js";
import { logger } from "./logger.js";
import type { CallMetadata, CallSession, TranscriptChunk, AmmoItem, AmmoConfig } from "./types.js";
import {
  generateNudge,
  createNudgeState,
  checkUncoveredInfo,
  type NudgeContext,
} from "./nudges.js";

const AMMO_EXTRACTION_INTERVAL_MS = 30000; // Extract ammo every 30 seconds
const MIN_TRANSCRIPT_LENGTH_FOR_AMMO = 100; // Minimum characters before attempting extraction

export class CallHandler {
  private session: CallSession;
  private deepgram: DeepgramConnection | null = null;
  private customPrompt?: string;
  private ammoConfig?: AmmoConfig | null;
  private repetitionTracker: Map<string, number> = new Map();
  private nudgeState = createNudgeState();
  private uncoveredInfo: Set<string> = new Set();
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

  async start(): Promise<string | null> {
    try {
      // Create call record in Convex - this returns the Convex _id
      this.convexCallId = await createCall(this.session.metadata);

      // Get team's ammo config (custom categories, offer details, etc.)
      this.ammoConfig = await getAmmoConfig(this.session.metadata.teamId);

      // Get team's custom AI prompt if any (legacy, still used as fallback)
      this.customPrompt = await getTeamCustomPrompt(this.session.metadata.teamId);

      // Initialize Deepgram connection
      this.deepgram = createDeepgramConnection(
        this.handleTranscript.bind(this),
        this.handleSpeakerDetected.bind(this),
        this.handleDeepgramError.bind(this)
      );

      logger.info(`Call started: ${this.session.metadata.callId}, Convex ID: ${this.convexCallId}, hasAmmoConfig: ${!!this.ammoConfig}`);

      // Return the Convex-generated call ID so desktop can use it
      return this.convexCallId;
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
    if (chunk.isFinal && chunk.text.trim()) {
      const speakerLabel = chunk.speaker === 0 ? "[Closer]" : "[Prospect]";
      const line = `${speakerLabel}: ${chunk.text}`;
      this.session.fullTranscript += line + "\n";
      this.session.transcriptBuffer += chunk.text + " ";

      // CRITICAL: Add transcript segment to Convex for real-time display in dashboard
      if (this.convexCallId) {
        const speaker = chunk.speaker === 0 ? "closer" : "prospect";
        // Use Deepgram's audio-aligned timestamp (accurate to the actual recording)
        // This ensures playbook snippets play at the correct position
        const timestampSeconds = Math.floor(chunk.audioTimestamp);

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
    }

    // Check if we should extract ammo
    const timeSinceLastExtraction = Date.now() - this.session.lastAmmoExtractionTime;
    const hasEnoughContent = this.session.transcriptBuffer.length >= MIN_TRANSCRIPT_LENGTH_FOR_AMMO;

    if (timeSinceLastExtraction >= AMMO_EXTRACTION_INTERVAL_MS && hasEnoughContent) {
      await this.extractAndSaveAmmo();
    }

    // Check for nudges (non-blocking)
    this.checkAndSendNudge().catch(err => logger.error("Failed to check nudges", err));
  }

  private async checkAndSendNudge(): Promise<void> {
    if (!this.convexCallId || this.session.fullTranscript.length < 100) {
      return;
    }

    // Update uncovered info tracking
    if (this.ammoConfig?.requiredInfo) {
      this.uncoveredInfo = checkUncoveredInfo(
        this.session.fullTranscript,
        this.ammoConfig.requiredInfo
      );
    }

    // Build nudge context
    const callDurationSeconds = Math.floor((Date.now() - this.session.startedAt) / 1000);
    const context: NudgeContext = {
      ammoConfig: this.ammoConfig || null,
      transcript: this.session.fullTranscript,
      callDurationSeconds,
      uncoveredInfo: this.uncoveredInfo,
    };

    // Generate nudge if applicable
    const nudge = generateNudge(context, this.nudgeState);
    if (nudge) {
      await addNudge(this.convexCallId, this.session.metadata.teamId, nudge);
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

      // Trigger speaker identification popup in desktop app
      // Get a sample of what speaker_0 said from the transcript
      const sampleText = this.getSpeakerSampleText(0);
      await setSpeakerMapping(this.convexCallId, "speaker_0", sampleText);
    }
  }

  // Get a sample of what a specific speaker said from the transcript
  private getSpeakerSampleText(speakerId: number): string {
    const speakerLabel = speakerId === 0 ? "[Closer]" : "[Prospect]";
    const lines = this.session.fullTranscript.split('\n').filter(l => l.trim());

    // Find lines from this speaker
    const speakerLines = lines.filter(line => line.startsWith(speakerLabel));

    if (speakerLines.length > 0) {
      // Return the first non-empty line from this speaker (without the label)
      const firstLine = speakerLines[0].replace(speakerLabel + ': ', '');
      // Limit to reasonable length for popup
      return firstLine.substring(0, 150);
    }

    return "";
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
      // Build extraction context with ammo config and repetition tracking
      const context: ExtractionContext = {
        ammoConfig: this.ammoConfig,
        customPrompt: this.customPrompt,
        repetitionTracker: this.repetitionTracker,
      };

      // Extract ammo with scoring
      const { items: ammoItems, updatedRepetitions } = await extractAmmo(textToProcess, context);

      // Update repetition tracker for next extraction
      this.repetitionTracker = updatedRepetitions;

      // Save each ammo item with scoring fields
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
          combinedBuffer
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
