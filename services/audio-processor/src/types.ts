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
}

export interface TranscriptChunk {
  text: string;
  speaker: number;
  timestamp: number;
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
}
