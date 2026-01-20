// Preload script - exposes safe IPC methods to renderer
import { contextBridge, ipcRenderer } from 'electron';

export type AudioStatus = 'idle' | 'connecting' | 'capturing' | 'reconnecting' | 'error';

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
  onReconnecting: (callback: (info: { attempt: number; maxAttempts: number }) => void) => () => void;
  onReconnected: (callback: () => void) => () => void;
  onSilenceWarning: (callback: (info: { silenceDuration: number; message: string }) => void) => () => void;
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

export interface RoleplayAPI {
  open: (userInfo: { teamId: string; closerId: string; userName: string }) => Promise<boolean>;
}

export interface ScheduleAPI {
  open: () => Promise<boolean>;
  setCloserEmail: (email: string | null) => Promise<boolean>;
  setTeamId: (teamId: string | null) => Promise<boolean>;
}

export interface ChatMessage {
  _id: string;
  senderType: 'manager' | 'closer';
  senderName: string;
  message: string;
  isRead: boolean;
  createdAt: number;
}

export interface ChatAPI {
  getMessages: (closerId: string, limit?: number) => Promise<ChatMessage[]>;
  sendMessage: (teamId: string, closerId: string, closerName: string, message: string) => Promise<unknown>;
  markAllRead: (closerId: string) => Promise<unknown>;
  getUnreadCount: (closerId: string) => Promise<number>;
  getLatestUnread: (closerId: string) => Promise<ChatMessage | null>;
  startPolling: (closerId: string, teamId: string, closerName: string, intervalMs?: number) => Promise<{ success: boolean }>;
  stopPolling: () => Promise<{ success: boolean }>;
  onUnreadCountChanged: (callback: (count: number) => void) => () => void;
  onNewMessage: (callback: (message: ChatMessage) => void) => () => void;
}

export interface ElectronAPI {
  audio: AudioAPI;
  app: AppAPI;
  ammo: AmmoAPI;
  auth: AuthAPI;
  training: TrainingAPI;
  roleplay: RoleplayAPI;
  schedule: ScheduleAPI;
  chat: ChatAPI;
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
    onReconnecting: (callback: (info: { attempt: number; maxAttempts: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { attempt: number; maxAttempts: number }) => callback(info);
      ipcRenderer.on('audio:reconnecting', handler);
      return () => ipcRenderer.removeListener('audio:reconnecting', handler);
    },
    onReconnected: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('audio:reconnected', handler);
      return () => ipcRenderer.removeListener('audio:reconnected', handler);
    },
    onSilenceWarning: (callback: (info: { silenceDuration: number; message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, info: { silenceDuration: number; message: string }) => callback(info);
      ipcRenderer.on('audio:silence-warning', handler);
      return () => ipcRenderer.removeListener('audio:silence-warning', handler);
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
  roleplay: {
    open: (userInfo: { teamId: string; closerId: string; userName: string }) =>
      ipcRenderer.invoke('roleplay:open', userInfo),
  },
  schedule: {
    open: () => ipcRenderer.invoke('schedule:open'),
    setCloserEmail: (email: string | null) => ipcRenderer.invoke('schedule:set-closer-email', email),
    setTeamId: (teamId: string | null) => ipcRenderer.invoke('schedule:set-team-id', teamId),
  },
  chat: {
    getMessages: (closerId: string, limit?: number) =>
      ipcRenderer.invoke('chat:get-messages', closerId, limit),
    sendMessage: (teamId: string, closerId: string, closerName: string, message: string) =>
      ipcRenderer.invoke('chat:send-message', teamId, closerId, closerName, message),
    markAllRead: (closerId: string) =>
      ipcRenderer.invoke('chat:mark-all-read', closerId),
    getUnreadCount: (closerId: string) =>
      ipcRenderer.invoke('chat:get-unread-count', closerId),
    getLatestUnread: (closerId: string) =>
      ipcRenderer.invoke('chat:get-latest-unread', closerId),
    startPolling: (closerId: string, teamId: string, closerName: string, intervalMs?: number) =>
      ipcRenderer.invoke('chat:start-polling', closerId, teamId, closerName, intervalMs),
    stopPolling: () =>
      ipcRenderer.invoke('chat:stop-polling'),
    onUnreadCountChanged: (callback: (count: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, count: number) => callback(count);
      ipcRenderer.on('chat:unread-count-changed', handler);
      return () => ipcRenderer.removeListener('chat:unread-count-changed', handler);
    },
    onNewMessage: (callback: (message: unknown) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, message: unknown) => callback(message);
      ipcRenderer.on('chat:new-message', handler);
      return () => ipcRenderer.removeListener('chat:new-message', handler);
    },
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
