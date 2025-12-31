// Type declarations for electron API exposed via preload
export type AudioStatus = 'idle' | 'connecting' | 'capturing' | 'error';

export interface AudioAPI {
  getStatus: () => Promise<AudioStatus>;
  checkPermissions: () => Promise<boolean>;
  requestPermissions: () => Promise<boolean>;
  checkMicrophonePermission: () => Promise<string>;
  requestMicrophonePermission: () => Promise<boolean>;
  openMicrophonePreferences: () => Promise<void>;
  start: (config: {
    teamId: string;
    closerId: string;
    prospectName?: string;
  }) => Promise<{ success: boolean; callId?: string; error?: string }>;
  stop: () => Promise<{ success: boolean; hasRecording?: boolean; error?: string }>;
  sendAudioData: (data: ArrayBuffer) => void;
  sendAudioLevel: (level: number) => void;
  getServiceUrl: () => Promise<string>;
  onStatusChange: (callback: (status: AudioStatus) => void) => () => void;
  onError: (callback: (error: string) => void) => () => void;
  onAudioLevel: (callback: (level: number) => void) => () => void;
  onCallIdUpdated: (callback: (callId: string) => void) => () => void;
}

export interface AppAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<{ platform: string; arch: string }>;
}

export interface AmmoAPI {
  toggle: () => Promise<boolean>;
  isVisible: () => Promise<boolean>;
  setTeamId: (teamId: string) => Promise<void>;
}

export interface AuthAPI {
  sendMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifySession: (token: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

export interface TrainingAPI {
  open: () => Promise<boolean>;
  setCloserId: (closerId: string | null) => Promise<boolean>;
}

export interface ElectronAPI {
  audio: AudioAPI;
  app: AppAPI;
  ammo: AmmoAPI;
  auth: AuthAPI;
  training: TrainingAPI;
}

// Ammo item type
export interface AmmoItem {
  _id: string;
  callId: string;
  teamId: string;
  text: string;
  type: 'emotional' | 'urgency' | 'budget' | 'commitment' | 'objection_preview' | 'pain_point';
  timestamp?: number;
  createdAt: number;
  // Scoring fields for heavy hitter detection
  score?: number; // 0-100 heavy hitter score
  repetitionCount?: number; // How many times this topic was mentioned
  isHeavyHitter?: boolean; // score >= 50
  categoryId?: string; // Custom category ID from ammoConfig
  suggestedUse?: string; // AI-generated suggestion for how to use this ammo
}

// Transcript segment type
export interface TranscriptSegment {
  _id: string;
  callId: string;
  speaker: string;
  text: string;
  timestamp: number;
  createdAt: number;
}

// Smart Nudge type (real-time coaching suggestions)
export interface Nudge {
  _id: string;
  callId: string;
  teamId: string;
  type: 'dig_deeper' | 'missing_info' | 'script_reminder' | 'objection_warning';
  message: string;
  detail?: string;
  status: 'active' | 'saved' | 'dismissed';
  triggeredBy?: string;
  createdAt: number;
}

// Ammo tracker window API (exposed via ammo-tracker-preload.ts)
export interface AmmoTrackerAPI {
  getCallId: () => Promise<string | null>;
  getTeamId: () => Promise<string | null>;
  copyToClipboard: (text: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  close: () => Promise<void>;
  saveNotes: (callId: string, notes: string) => Promise<{ success: boolean }>;
  getNotes: (callId: string) => Promise<string | null>;
  onCallIdChange: (callback: (callId: string | null) => void) => () => void;
  onNewAmmo: (callback: (ammo: AmmoItem) => void) => () => void;
  onNewTranscript: (callback: (segment: TranscriptSegment) => void) => () => void;
}

// Training playlist types
export interface TrainingPlaylist {
  _id: string;
  name: string;
  description?: string;
  itemCount: number;
  totalDuration: number;
  assignedAt: number;
  assignedByName: string;
}

export interface TrainingHighlight {
  _id: string;
  title: string;
  notes?: string;
  category: string;
  transcriptText: string;
  startTimestamp: number;
  endTimestamp: number;
  recordingUrl: string | null;
  closerName: string;
}

export interface TrainingPlaylistItem {
  _id: string;
  order: number;
  highlight: TrainingHighlight;
}

export interface TrainingPlaylistWithItems extends TrainingPlaylist {
  items: TrainingPlaylistItem[];
}

// Training window API (exposed via training-preload.ts)
export interface TrainingWindowAPI {
  getCloserId: () => Promise<string | null>;
  getAssignedPlaylists: (closerId: string) => Promise<TrainingPlaylist[]>;
  getPlaylistDetails: (playlistId: string, closerId: string) => Promise<TrainingPlaylistWithItems | null>;
  close: () => Promise<void>;
  minimize: () => Promise<void>;
  onCloserIdChange: (callback: (closerId: string | null) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    ammoTracker?: AmmoTrackerAPI;
    training?: TrainingWindowAPI;
  }
}

export {};
