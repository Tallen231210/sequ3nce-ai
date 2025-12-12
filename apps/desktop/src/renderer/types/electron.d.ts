// Type declarations for electron API exposed via preload
export type AudioStatus = 'idle' | 'connecting' | 'capturing' | 'error';

export interface AudioAPI {
  getStatus: () => Promise<AudioStatus>;
  checkPermissions: () => Promise<boolean>;
  requestPermissions: () => Promise<boolean>;
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
}

export interface AppAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<{ platform: string; arch: string }>;
}

export interface AmmoAPI {
  toggle: () => Promise<boolean>;
  isVisible: () => Promise<boolean>;
}

export interface ElectronAPI {
  audio: AudioAPI;
  app: AppAPI;
  ammo: AmmoAPI;
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
}

// Ammo tracker window API (exposed via ammo-tracker-preload.ts)
export interface AmmoTrackerAPI {
  getCallId: () => Promise<string | null>;
  copyToClipboard: (text: string) => Promise<void>;
  close: () => Promise<void>;
  onCallIdChange: (callback: (callId: string | null) => void) => () => void;
  onNewAmmo: (callback: (ammo: AmmoItem) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    ammoTracker?: AmmoTrackerAPI;
  }
}

export {};
