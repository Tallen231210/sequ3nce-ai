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

export interface ElectronAPI {
  audio: AudioAPI;
  app: AppAPI;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
