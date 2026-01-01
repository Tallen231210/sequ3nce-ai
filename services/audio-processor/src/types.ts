// Types for the audio processing service

export interface CallMetadata {
  callId: string;
  visitorId?: string;
  teamId: string;
  closerId: string;
  prospectName?: string;
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
  channel: number; // 0 = Closer (mic), 1 = Prospect (system audio) - from Deepgram multichannel
  timestamp: number;
  audioTimestamp: number; // Deepgram's audio-aligned timestamp (seconds from audio start)
  isFinal: boolean;
}

export interface CallSession {
  metadata: CallMetadata;
  startedAt: number;
  speakersDetected: Set<number>;
  transcriptBuffer: string;
  audioBuffer: Buffer[];
  lastAmmoExtractionTime: number;
  fullTranscript: string;
  // Talk-to-listen ratio tracking
  closerTalkTimeMs: number;
  prospectTalkTimeMs: number;
  lastTalkTimeUpdateTime: number;
}
