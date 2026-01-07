// Preload script - exposes safe IPC methods to renderer
import { contextBridge, ipcRenderer } from 'electron';

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
  testLoopback: () => Promise<{ success: boolean; hasAudio: boolean; error?: string }>;
  onStatusChange: (callback: (status: AudioStatus) => void) => () => void;
  onError: (callback: (error: string) => void) => () => void;
  onAudioLevel: (callback: (level: number) => void) => () => void;
  onCallIdUpdated: (callback: (callId: string) => void) => () => void;
}

export interface AppAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<{ platform: string; arch: string; osRelease: string }>;
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

// Expose protected methods to renderer via contextBridge
contextBridge.exposeInMainWorld('electron', {
  audio: {
    getStatus: () => ipcRenderer.invoke('audio:get-status'),
    checkPermissions: () => ipcRenderer.invoke('audio:check-permissions'),
    requestPermissions: () => ipcRenderer.invoke('audio:request-permissions'),
    checkMicrophonePermission: () => ipcRenderer.invoke('audio:check-microphone-permission'),
    requestMicrophonePermission: () => ipcRenderer.invoke('audio:request-microphone-permission'),
    openMicrophonePreferences: () => ipcRenderer.invoke('audio:open-microphone-preferences'),
    start: (config: { teamId: string; closerId: string; prospectName?: string }) =>
      ipcRenderer.invoke('audio:start', config),
    stop: () => ipcRenderer.invoke('audio:stop'),
    sendAudioData: (data: ArrayBuffer) => ipcRenderer.send('audio:data', data),
    sendAudioLevel: (level: number) => ipcRenderer.send('audio:level', level),
    getServiceUrl: () => ipcRenderer.invoke('audio:get-service-url'),
    testLoopback: () => ipcRenderer.invoke('audio:test-loopback'),
    onStatusChange: (callback: (status: AudioStatus) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: AudioStatus) => callback(status);
      ipcRenderer.on('audio:status-change', handler);
      return () => ipcRenderer.removeListener('audio:status-change', handler);
    },
    onError: (callback: (error: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
      ipcRenderer.on('audio:error', handler);
      return () => ipcRenderer.removeListener('audio:error', handler);
    },
    onAudioLevel: (callback: (level: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, level: number) => callback(level);
      ipcRenderer.on('audio:level', handler);
      return () => ipcRenderer.removeListener('audio:level', handler);
    },
    onCallIdUpdated: (callback: (callId: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, callId: string) => callback(callId);
      ipcRenderer.on('audio:call-id-updated', handler);
      return () => ipcRenderer.removeListener('audio:call-id-updated', handler);
    },
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  },
  ammo: {
    toggle: () => ipcRenderer.invoke('ammo:toggle'),
    isVisible: () => ipcRenderer.invoke('ammo:is-visible'),
    setTeamId: (teamId: string) => ipcRenderer.invoke('ammo:set-team-id', teamId),
  },
  auth: {
    sendMagicLink: (email: string) => ipcRenderer.invoke('auth:send-magic-link', email),
    verifySession: (token: string) => ipcRenderer.invoke('auth:verify-session', token),
    signOut: () => ipcRenderer.invoke('auth:sign-out'),
  },
  training: {
    open: () => ipcRenderer.invoke('training:open'),
    setCloserId: (closerId: string | null) => ipcRenderer.invoke('training:set-closer-id', closerId),
  },
} as ElectronAPI);

// Also expose for tray menu actions
ipcRenderer.on('tray:start-recording', () => {
  window.dispatchEvent(new CustomEvent('tray:start-recording'));
});

ipcRenderer.on('tray:stop-recording', () => {
  window.dispatchEvent(new CustomEvent('tray:stop-recording'));
});

// Auth callback from deep link
ipcRenderer.on('auth:callback', (_event, data: { token?: string; error?: string }) => {
  window.dispatchEvent(new CustomEvent('auth:callback', { detail: data }));
});
