// Call session handler - manages a single call's lifecycle

import { createSpeechmaticsConnection, type SpeechmaticsConnection } from "./speechmatics.js";
import { uploadRecording } from "./s3.js";
import {
  createCall,
  updateCallStatus,
  completeCall,
  addTranscript,
  addTranscriptSegment,
  getTeamCustomPrompt,
  getAmmoConfig,
  updateCallDetection,
  updateTalkTime,
  getLastTranscriptTimestamp,
  getBotExistingCallId,
} from "./convex.js";
import { analyzeTranscriptForDetection } from "./detection.js";
import { getManifestoForCall } from "./manifesto.js";
import { AmmoAnalyzer, type AmmoV2Analysis } from "./ammoAnalyzer.js";
import { logger } from "./logger.js";
import type { CallMetadata, CallSession, TranscriptChunk, AmmoConfig, CallSource } from "./types.js";

const TALK_TIME_UPDATE_INTERVAL_MS = 15000; // Update talk time every 15 seconds
const MAX_CALL_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours max call duration

// Callback type for sending Ammo V2 analysis to desktop
export type OnAmmoV2AnalysisCallback = (analysis: AmmoV2Analysis) => void;

// Callback type for silence warning
export type OnSilenceWarningCallback = (silenceDurationSeconds: number) => void;

export interface CallHandlerOptions {
  source?: CallSource; // "closer" (default) or "recall"
  recordingType?: "audio" | "video"; // "audio" (default) or "video" for meeting bot recordings
  skipSpeechmatics?: boolean; // true for Recall.ai (provides its own transcription)
}

export class CallHandler {
  private session: CallSession;
  private speechmatics: SpeechmaticsConnection | null = null;
  private customPrompt?: string;
  private ammoConfig?: AmmoConfig | null;
  private convexCallId: string | null = null;
  private isEnded = false;
  private hasStartedCall = false; // Track if we've updated status to on_call
  private firstSpeaker: string | null = null; // First speaker detected = Closer (fallback heuristic)
  private sampleRate: number; // Audio sample rate from desktop

  // Recall.ai participant join order tracking: first non-bot participant = closer
  private firstParticipantJoined: string | null = null;
  private maxDurationTimeout: NodeJS.Timeout | null = null; // Auto-end after 2 hours

  // Ammo V2: Real-time AI analysis
  private ammoAnalyzer: AmmoAnalyzer | null = null;
  private ammoV2Enabled = false;
  private onAmmoV2Analysis: OnAmmoV2AnalysisCallback | null = null;

  // Silence warning callback
  private onSilenceWarning: OnSilenceWarningCallback | null = null;

  // Timestamp offset for reconnection (adds to Speechmatics timestamps to maintain ordering)
  private timestampOffset: number = 0;

  // Source tracking: "closer" (desktop app) or "recall"
  private source: CallSource;
  private recordingType: "audio" | "video";
  private skipSpeechmatics: boolean;

  constructor(metadata: CallMetadata, options?: CallHandlerOptions) {
    this.source = options?.source || "closer";
    this.recordingType = options?.recordingType || "audio";
    this.skipSpeechmatics = options?.skipSpeechmatics || false;
    this.sampleRate = metadata.sampleRate || 48000;
    this.session = {
      metadata,
      startedAt: Date.now(),
      speakersDetected: new Set(),
      audioBuffer: [],
      fullTranscript: "",
      // Talk time tracking
      closerTalkTimeMs: 0,
      prospectTalkTimeMs: 0,
      lastTalkTimeUpdateTime: Date.now(),
      // Audio timestamp for ammo (seconds from audio start)
      lastAudioTimestamp: 0,
    };

    logger.info(`Call handler created for call ${metadata.callId} (source: ${this.source}, sampleRate: ${this.sampleRate}Hz)`, metadata);
  }

  /**
   * Set callback for Ammo V2 analysis results (sends to desktop WebSocket)
   */
  setAmmoV2Callback(callback: OnAmmoV2AnalysisCallback): void {
    this.onAmmoV2Analysis = callback;
  }

  /**
   * Set callback for silence warning (sends to desktop WebSocket when no speech for 30s+)
   */
  setSilenceWarningCallback(callback: OnSilenceWarningCallback): void {
    this.onSilenceWarning = callback;
  }

  async start(): Promise<string | null> {
    try {
      // Check if this is a reconnection (desktop sent existing convexCallId)
      const metadataIsReconnect = this.session.metadata.isReconnect;
      const metadataConvexCallId = this.session.metadata.convexCallId;
      const isReconnect = metadataIsReconnect && metadataConvexCallId;

      logger.info(`[RECONNECT CHECK] metadata.isReconnect=${metadataIsReconnect}, metadata.convexCallId=${metadataConvexCallId}, isReconnect=${isReconnect}`);

      if (isReconnect) {
        // RECONNECTION (explicit): Desktop client sent existing convexCallId
        this.convexCallId = metadataConvexCallId!;
        logger.info(`[RECONNECT] Resuming call ${this.session.metadata.callId} with existing Convex ID: ${this.convexCallId}`);

        // Query the last transcript timestamp to use as offset for new segments
        // This ensures new segments appear AFTER existing ones in the transcript
        const lastTimestamp = await getLastTranscriptTimestamp(this.convexCallId);
        this.timestampOffset = lastTimestamp + 1; // Add 1 second buffer to ensure proper ordering
        logger.info(`[RECONNECT] Last transcript timestamp: ${lastTimestamp}, using offset: ${this.timestampOffset}`);

        // Mark the call as active again (in case it was marked as ended)
        await updateCallStatus(this.convexCallId, "on_call", 2);
        logger.info(`[RECONNECT] Call status updated to on_call`);
      } else if (this.source === "recall") {
        // BOT CALL: Check if bot already has a linked call (implicit reconnection)
        // This handles the case where Recall.ai reconnects but doesn't send isReconnect metadata.
        // If the bot already has an active call record, reuse it instead of creating a duplicate.
        const existingCallResult = await getBotExistingCallId(this.session.metadata.callId);
        if (existingCallResult) {
          this.convexCallId = existingCallResult;
          logger.info(`[BOT RECONNECT] Bot ${this.session.metadata.callId} already has call ${existingCallResult} — resuming`);

          const lastTimestamp = await getLastTranscriptTimestamp(this.convexCallId);
          this.timestampOffset = lastTimestamp + 1;
          logger.info(`[BOT RECONNECT] Last transcript timestamp: ${lastTimestamp}, using offset: ${this.timestampOffset}`);

          await updateCallStatus(this.convexCallId, "on_call", 2);
          logger.info(`[BOT RECONNECT] Call status updated to on_call`);
        } else {
          // First connection for this bot — create new call record
          logger.info(`[NEW CALL] Creating new call record for bot ${this.session.metadata.callId}`);
          this.convexCallId = await createCall(this.session.metadata);
          logger.info(`[NEW CALL] Created with Convex ID: ${this.convexCallId}`);
        }
      } else {
        // NEW CALL (desktop closer): Create call record in Convex
        logger.info(`[NEW CALL] Creating new call record for ${this.session.metadata.callId}`);
        this.convexCallId = await createCall(this.session.metadata);
        logger.info(`[NEW CALL] Created with Convex ID: ${this.convexCallId}`);
      }

      // Get team's ammo config (custom categories, offer details, etc.)
      this.ammoConfig = await getAmmoConfig(this.session.metadata.teamId);

      // Get team's custom AI prompt if any (legacy, still used as fallback)
      this.customPrompt = await getTeamCustomPrompt(this.session.metadata.teamId);

      // Initialize Speechmatics connection with speaker diarization
      // Skip for Recall.ai calls (Recall provides its own transcription via WebSocket events)
      if (!this.skipSpeechmatics) {
        // Disable silence detection for bot sessions (only useful for desktop closer)
        const silenceCallback = this.source === "recall"
          ? undefined
          : (this.onSilenceWarning ? this.onSilenceWarning : undefined);
        this.speechmatics = await createSpeechmaticsConnection(
          this.handleTranscript.bind(this),
          this.handleSpeechmaticsError.bind(this),
          silenceCallback,
          this.sampleRate
        );
      }

      logger.info(`Call ${isReconnect ? 'resumed' : 'started'}: ${this.session.metadata.callId}, Convex ID: ${this.convexCallId}, source: ${this.source}, hasAmmoConfig: ${!!this.ammoConfig}, speechmatics: ${!this.skipSpeechmatics}`);

      // Set up max duration timeout (2 hours) to prevent runaway calls
      this.maxDurationTimeout = setTimeout(async () => {
        logger.warn(`Call ${this.session.metadata.callId} reached max duration (2 hours) - auto-ending`);
        await this.end();
      }, MAX_CALL_DURATION_MS);

      // Check if team has Ammo V2 enabled (beta feature)
      this.ammoV2Enabled = await AmmoAnalyzer.isAmmoV2Enabled(this.session.metadata.teamId);
      logger.info(`Ammo V2 enabled for team ${this.session.metadata.teamId}: ${this.ammoV2Enabled}`);

      // Initialize Ammo V2 analyzer if enabled
      if (this.ammoV2Enabled && this.convexCallId) {
        this.ammoAnalyzer = new AmmoAnalyzer(this.convexCallId, this.session.metadata.teamId);

        // Start periodic analysis (every 45 seconds)
        this.ammoAnalyzer.startPeriodicAnalysis(
          () => this.session.fullTranscript,
          (analysis) => {
            // Send to desktop via callback if set
            if (this.onAmmoV2Analysis) {
              this.onAmmoV2Analysis(analysis);
            }
          },
          45000 // 45 seconds
        );

        logger.info(`Ammo V2 analyzer started for call ${this.session.metadata.callId}`);
      }

      // Return the Convex-generated call ID so desktop can use it
      return this.convexCallId;
    } catch (error) {
      logger.error("Failed to start call", error);
      throw error;
    }
  }

  private audioChunkCount = 0;
  private lastAudioLogTime = 0;
  private lastChunkTime = 0;
  private maxGapMs = 0;
  private gapCount = 0; // chunks with >100ms gap

  processAudio(audioData: Buffer): void {
    if (this.isEnded) return;

    // Track chunk timing to detect gaps
    const now = Date.now();
    if (this.lastChunkTime > 0) {
      const gap = now - this.lastChunkTime;
      if (gap > 100) this.gapCount++;
      if (gap > this.maxGapMs) this.maxGapMs = gap;
    }
    this.lastChunkTime = now;

    // Buffer audio for recording (keep original format for S3)
    this.session.audioBuffer.push(audioData);
    this.audioChunkCount++;

    // Resample and send to Speechmatics for transcription (skip for Recall — it provides its own)
    if (this.speechmatics) {
      let processed: Buffer;

      // Desktop closer audio: 48kHz stereo interleaved PCM -> mono
      processed = this.resampleAudio(audioData);

      // Log BOTH input and resampled stats for the SAME chunk (every 50 chunks)
      if (this.audioChunkCount % 50 === 1) {
        let inputMaxLeft = 0;
        let inputMaxRight = 0;
        for (let i = 0; i < audioData.length - 3; i += 4) {
          const left = Math.abs(audioData.readInt16LE(i));
          const right = Math.abs(audioData.readInt16LE(i + 2));
          if (left > inputMaxLeft) inputMaxLeft = left;
          if (right > inputMaxRight) inputMaxRight = right;
        }

        let resampledMax = 0;
        for (let i = 0; i < processed.length - 1; i += 2) {
          const sample = Math.abs(processed.readInt16LE(i));
          if (sample > resampledMax) resampledMax = sample;
        }

        const expectedSize = (audioData.length / 4) * 2;
        logger.info(`[Audio] Chunk #${this.audioChunkCount}: input=${audioData.length}b L=${inputMaxLeft} R=${inputMaxRight} -> mono=${processed.length}b (exp=${expectedSize}) max=${resampledMax}`);
      }

      this.speechmatics.sendAudio(processed);
    } else if (this.source === "recall") {
      // Recall audio: 16kHz mono — log periodically (transcription comes from Recall events)
      if (this.audioChunkCount % 100 === 1) {
        logger.info(`[Audio][Recall] Chunk #${this.audioChunkCount}: size=${audioData.length}b sampleRate=${this.sampleRate}Hz`);
      }
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

      // Read both channels - Left = Microphone (closer), Right = System audio (prospect)
      const left = buffer.readInt16LE(inputIndex);
      const right = buffer.readInt16LE(inputIndex + 2);

      // Mix both channels but boost the quieter one to prevent one dominating
      // This preserves both speakers while avoiding the volume reduction issue
      const mono = Math.round((left + right) / 2);

      output.writeInt16LE(mono, i * 2);
    }

    return output;
  }

  /**
   * Normalize audio to 48kHz stereo for live broadcast to web dashboard.
   * - Recall sends 16kHz mono — upsample 3x to 48kHz stereo via linear interpolation.
   * - Desktop audio is already 48kHz stereo and passes through unchanged.
   */
  normalizeForBroadcast(audioData: Buffer): Buffer {
    if (this.source === "closer") {
      return audioData; // Desktop audio already 48kHz stereo
    }

    // Recall: 16kHz mono → 48kHz stereo via linear interpolation (3x upsample)
    const inputSamples = audioData.length / 2; // 16-bit mono = 2 bytes per sample
    const upsampleFactor = 3;
    const output = Buffer.alloc(inputSamples * upsampleFactor * 4); // stereo = 4 bytes per frame

    for (let i = 0; i < inputSamples; i++) {
      const current = audioData.readInt16LE(i * 2);
      const next = (i + 1 < inputSamples) ? audioData.readInt16LE((i + 1) * 2) : current;

      // Linear interpolation: 3 evenly spaced samples between current and next
      const diff = next - current;
      const samples = [
        current,
        Math.round(current + diff / 3),
        Math.round(current + (diff * 2) / 3),
      ];

      for (let r = 0; r < upsampleFactor; r++) {
        const outIdx = (i * upsampleFactor + r) * 4;
        output.writeInt16LE(samples[r], outIdx);     // Left channel
        output.writeInt16LE(samples[r], outIdx + 2); // Right channel (mono → stereo)
      }
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

    // Add to transcript
    if (chunk.isFinal && chunk.text.trim()) {
      // Speaker identification: for Recall calls, role is pre-determined (prefixed with __recall_).
      // For desktop calls, uses the first-speaker heuristic.
      const isRecallPreDetermined = chunk.speaker.startsWith("__recall_");
      const isCloser = isRecallPreDetermined
        ? chunk.speaker === "__recall_closer"
        : this.getIsCloser(chunk.speaker);
      const speakerLabel = isCloser ? "[Closer]" : "[Prospect]";
      const line = `${speakerLabel}: ${chunk.text}`;
      this.session.fullTranscript += line + "\n";

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
      // Skip for Recall calls — webhook handler saves segments to avoid duplicates
      if (this.convexCallId && this.source !== "recall") {
        const speaker = isCloser ? "closer" : "prospect";
        // Use Speechmatics' audio-aligned timestamp (accurate to the actual recording)
        // Add timestampOffset for reconnection scenarios (ensures new segments sort after existing ones)
        const timestampSeconds = Math.floor(chunk.audioTimestamp) + this.timestampOffset;

        // Track latest audio timestamp for ammo extraction
        this.session.lastAudioTimestamp = timestampSeconds;

        // Add segment for real-time viewing (blocking to prevent data loss on process exit)
        try {
          await addTranscriptSegment(
            this.convexCallId,
            this.session.metadata.teamId,
            speaker,
            chunk.text,
            timestampSeconds
          );
        } catch (err) {
          logger.error("Failed to add transcript segment", err);
        }
      } else if (this.convexCallId && this.source === "recall") {
        // For Recall calls, still track the audio timestamp for ammo extraction
        const timestampSeconds = Math.floor(chunk.audioTimestamp) + this.timestampOffset;
        this.session.lastAudioTimestamp = timestampSeconds;
      }

      // Update full transcript more frequently (every 5 lines instead of sporadic)
      // Skip for Recall calls — transcriptText is saved when call ends via completeCall()
      const lineCount = this.session.fullTranscript.split('\n').filter(l => l.trim()).length;
      if (this.convexCallId && this.source !== "recall" && lineCount % 5 === 0) {
        try {
          await addTranscript(this.convexCallId, this.session.fullTranscript);
        } catch (err) {
          logger.error("Failed to update transcript", err);
        }
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
  }

  private handleSpeechmaticsError(error: Error): void {
    logger.error(`Speechmatics error for call ${this.session.metadata.callId}`, error);
    // Don't crash - try to continue
  }

  /**
   * Track participant join order from Recall.ai participant_events.join.
   * The first non-bot participant is the closer (they host the meeting).
   */
  trackParticipantJoin(participantName: string): void {
    // Skip the bot itself — match against known bot name patterns
    const botPatterns = ["sequ3nce.ai", "sequ3nce", "notetaker", "note taker", "meeting bot", "recorder"];
    const nameLower = participantName.toLowerCase();
    if (botPatterns.some(bp => nameLower.includes(bp))) {
      logger.info(`[Recall] Skipping bot participant: "${participantName}"`);
      return;
    }

    if (!this.firstParticipantJoined) {
      this.firstParticipantJoined = participantName;
      logger.info(`[Recall] First non-bot participant joined: "${participantName}" (will be treated as Closer)`);
    } else {
      logger.info(`[Recall] Additional participant joined: "${participantName}"`);
    }
  }

  /**
   * Handle pre-parsed transcript from Recall.ai events.
   * Recall provides speaker names directly (no Speechmatics speaker IDs to map).
   * Determines closer vs prospect from participant name, then feeds into
   * the existing handleTranscript pipeline for AI detection, ammo, and Convex writes.
   */
  async handleRecallTranscript(chunk: {
    text: string;
    speaker: string; // Participant name from Recall (e.g., "John Smith")
    timestamp: number;
    startMs: number;
  }): Promise<void> {
    if (this.isEnded) return;

    // Determine closer vs prospect from participant name
    const isCloser = this.getIsCloserByName(chunk.speaker);
    const role = isCloser ? "closer" : "prospect";
    this.speakerSegmentCounts[role]++;

    // Feed into existing transcript pipeline with pre-determined role.
    // Use a special prefix so handleTranscript knows NOT to re-determine via getIsCloser().
    await this.handleTranscript({
      text: chunk.text,
      speaker: `__recall_${role}`, // Prefixed role — bypasses getIsCloser() in handleTranscript
      timestamp: chunk.timestamp,
      audioTimestamp: chunk.startMs / 1000,
      isFinal: true,
    });
  }

  // Track which participant names we've already logged speaker decisions for (reduce log spam)
  private loggedSpeakerDecisions = new Set<string>();
  // Diagnostic counters for speaker balance
  private speakerSegmentCounts = { closer: 0, prospect: 0 };

  /**
   * Determine if a participant is the Closer by their name (used by Recall.ai).
   *
   * Priority chain:
   * 1. Exact match on closerName → closer
   * 2. Fuzzy match (contains, min 3 chars) on closerName → closer
   * 3. Join order: first non-bot participant to join = closer
   * 4. Exact/fuzzy match on prospectName → prospect (backup)
   * 5. Default → prospect (safe default: unknown speakers are prospects)
   */
  private getIsCloserByName(participantName: string): boolean {
    const name = participantName.toLowerCase().trim();
    const closerName = this.session.metadata.closerName?.toLowerCase().trim();
    const prospectName = this.session.metadata.prospectName?.toLowerCase().trim();
    const shouldLog = !this.loggedSpeakerDecisions.has(name);

    let result: boolean;
    let reason: string;

    // 1. Exact match on closer name
    if (closerName && name === closerName) {
      result = true;
      reason = `matches closerName exactly → Closer`;
    }
    // 2. Fuzzy match: either name contains the other (min 3 chars to avoid false positives like "Al" matching "Alyssa")
    else if (closerName && closerName.length >= 3 && (name.includes(closerName) || closerName.includes(name))) {
      result = true;
      reason = `fuzzy-matches closerName "${this.session.metadata.closerName}" → Closer`;
    }
    // 3. Join order: first non-bot participant is the closer (they host the meeting)
    else if (this.firstParticipantJoined) {
      const firstJoined = this.firstParticipantJoined.toLowerCase().trim();
      if (name === firstJoined) {
        result = true;
        reason = `matches first participant joined "${this.firstParticipantJoined}" → Closer`;
      } else if (firstJoined.length >= 3 && (name.includes(firstJoined) || firstJoined.includes(name))) {
        result = true;
        reason = `fuzzy-matches first participant joined "${this.firstParticipantJoined}" → Closer`;
      } else {
        result = false;
        reason = `is NOT first participant "${this.firstParticipantJoined}" → Prospect`;
      }
    }
    // 4. Backup: check against prospect name
    else if (prospectName) {
      if (name === prospectName) {
        result = false;
        reason = `matches prospectName "${this.session.metadata.prospectName}" → Prospect`;
      } else if (prospectName.length >= 3 && (name.includes(prospectName) || prospectName.includes(name))) {
        result = false;
        reason = `fuzzy-matches prospectName "${this.session.metadata.prospectName}" → Prospect`;
      } else {
        result = false;
        reason = `doesn't match prospectName "${this.session.metadata.prospectName}" → Prospect (safe default)`;
      }
    }
    // 5. No data available — default to prospect
    else {
      result = false;
      reason = `has no matching data — defaulting to Prospect`;
    }

    // Only log the first time we see each participant (avoids log spam at scale)
    if (shouldLog) {
      logger.info(`[Speaker] "${participantName}" ${reason}`);
      this.loggedSpeakerDecisions.add(name);
    }

    return result;
  }

  /**
   * Determine if a speaker is the Closer (desktop/Speechmatics calls only).
   * Uses the first-speaker heuristic: first speaker detected = Closer.
   * Recall calls bypass this entirely via the __recall_ prefix system.
   */
  private getIsCloser(speaker: string): boolean {
    if (!this.firstSpeaker) {
      this.firstSpeaker = speaker;
      logger.info(`First speaker detected: ${speaker} (will be treated as Closer)`);
    }
    return speaker === this.firstSpeaker;
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

    // Clear max duration timeout if set
    if (this.maxDurationTimeout) {
      clearTimeout(this.maxDurationTimeout);
      this.maxDurationTimeout = null;
    }

    // Stop Ammo V2 analyzer if running
    if (this.ammoAnalyzer) {
      this.ammoAnalyzer.stop();
      this.ammoAnalyzer = null;
      logger.info(`Ammo V2 analyzer stopped for call ${this.session.metadata.callId}`);
    }

    // Close Speechmatics connection
    if (this.speechmatics) {
      await this.speechmatics.close();
      this.speechmatics = null;
    }

    // Save final talk time
    if (this.convexCallId && (this.session.closerTalkTimeMs > 0 || this.session.prospectTalkTimeMs > 0)) {
      const closerSecs = Math.round(this.session.closerTalkTimeMs / 1000);
      const prospectSecs = Math.round(this.session.prospectTalkTimeMs / 1000);
      await updateTalkTime(this.convexCallId, closerSecs, prospectSecs);
      logger.info(`Final talk time: closer=${closerSecs}s, prospect=${prospectSecs}s`);
    }

    // Speaker balance diagnostic (Recall.ai calls only)
    const { closer: closerSegs, prospect: prospectSegs } = this.speakerSegmentCounts;
    const totalSegs = closerSegs + prospectSegs;
    if (totalSegs > 0) {
      const closerPct = Math.round((closerSegs / totalSegs) * 100);
      logger.info(`[Speaker Balance] ${closerSegs} closer / ${prospectSegs} prospect segments (${closerPct}% closer)`);
      if (closerPct > 90 && totalSegs > 5) {
        logger.warn(`[Speaker Balance] WARNING: ${closerPct}% of ${totalSegs} segments labeled as closer — possible diarization failure. closerName: "${this.session.metadata.closerName}", firstParticipantJoined: "${this.firstParticipantJoined}", unique speakers: [${Array.from(this.loggedSpeakerDecisions).join(', ')}]`);
      }
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

        // Desktop sends stereo (2 channels), Recall sends mono (1 channel)
        const numChannels = this.source === "recall" ? 1 : 2;
        recordingUrl = await uploadRecording(
          this.session.metadata.teamId,
          this.session.metadata.callId,
          combinedBuffer,
          this.sampleRate,
          numChannels
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

  getSource(): CallSource {
    return this.source;
  }

  getStats() {
    return {
      callId: this.session.metadata.callId,
      duration: Math.floor((Date.now() - this.session.startedAt) / 1000),
      speakerCount: this.session.speakersDetected.size,
      transcriptLength: this.session.fullTranscript.length,
      audioChunks: this.session.audioBuffer.length,
      source: this.source,
    };
  }
}
