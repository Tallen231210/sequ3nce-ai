// Types for the audio processing service

export interface CallMetadata {
  callId: string;
  visitorId?: string;
  teamId: string;
  closerId: string;
  prospectName?: string;
  sampleRate?: number; // Audio sample rate from desktop (e.g., 48000)
  // Reconnection fields - sent when desktop reconnects after network interruption
  convexCallId?: string; // Existing Convex call ID to resume
  isReconnect?: boolean; // True if this is a reconnection attempt
}

// Meeting BaaS connection metadata (first message on /meetingbaas path)
export interface MeetingBaasMetadata {
  type: "meetingbaas";
  botId: string;
  meetingUrl: string;
  closerId: string;
  teamId: string;
  prospectName?: string;
  sampleRate?: number; // Audio sample rate (may differ from desktop's 48kHz)
}

// Source type for call handler - determines behavior differences
export type CallSource = "closer" | "meetingbaas" | "recall";

// Speaker metadata sent by Meeting BaaS as JSON arrays
export interface MeetingBaasSpeakerEvent {
  name: string;
  id: string | number;
  timestamp?: number;
  isSpeaking: boolean;
}

export interface AmmoItem {
  text: string;
  type: "emotional" | "urgency" | "budget" | "commitment" | "objection_preview" | "pain_point";
  timestamp?: number;
  // Scoring fields for heavy hitter detection
  score?: number; // 0-100 heavy hitter score
  repetitionCount?: number; // How many times this topic was mentioned
  isHeavyHitter?: boolean; // score >= 50
  categoryId?: string; // Custom category ID from ammoConfig (if using custom categories)
  suggestedUse?: string; // AI-generated suggestion for how to use this ammo
}

// Call Manifesto types for structured sales frameworks
export interface ManifestoStage {
  id: string;
  name: string;
  goal?: string;
  goodBehaviors: string[];
  badBehaviors: string[];
  keyMoments: string[];
  order: number;
}

export interface ManifestoObjection {
  id: string;
  name: string;
  rebuttals: string[];
}

export interface CallManifesto {
  stages: ManifestoStage[];
  objections: ManifestoObjection[];
}

// Ammo config from the team's settings
export interface AmmoConfig {
  teamId: string;
  requiredInfo: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  scriptFramework: Array<{
    id: string;
    name: string;
    description?: string;
    order: number;
  }>;
  commonObjections: Array<{
    id: string;
    label: string;
    keywords: string[];
  }>;
  ammoCategories: Array<{
    id: string;
    name: string;
    color: string;
    keywords: string[];
  }>;
  offerDescription: string;
  problemSolved: string;
  // Call Framework (Manifesto) - optional, uses defaults if not set
  callManifesto?: CallManifesto;
}

// Track repetition of key phrases across the call
export interface RepetitionTracker {
  phrases: Map<string, number>; // phrase -> count
}

export interface TranscriptChunk {
  text: string;
  speaker: string; // "S1", "S2", etc. from Speechmatics speaker diarization (first speaker = Closer)
  timestamp: number;
  audioTimestamp: number; // Audio-aligned timestamp (seconds from audio start)
  isFinal: boolean;
}

export interface CallSession {
  metadata: CallMetadata;
  startedAt: number;
  speakersDetected: Set<string>; // Speaker labels from Speechmatics ("S1", "S2", etc.)
  audioBuffer: Buffer[];
  fullTranscript: string;
  // Talk-to-listen ratio tracking
  closerTalkTimeMs: number;
  prospectTalkTimeMs: number;
  lastTalkTimeUpdateTime: number;
  // Audio timestamp tracking for ammo (seconds from audio start)
  lastAudioTimestamp: number;
}
