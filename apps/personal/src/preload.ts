// Preload script - exposes safe IPC methods to renderer
import { contextBridge, ipcRenderer } from 'electron';

export interface AppAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<{ platform: string; arch: string; osRelease: string }>;
  setWindowSize: (width: number, height: number) => Promise<void>;
  themeChanged: (theme: string) => Promise<void>;
  setBadgeCount: (count: number) => Promise<void>;
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

export interface BotAPI {
  callStarted: (data: {
    callId: string;
    teamId: string;
    closerId: string;
    closerName: string;
    prospectName?: string;
    meetingTitle?: string;
    botId?: string;
  }) => Promise<void>;
  callEnded: (data: {
    callId: string;
    closerId: string;
    prospectName?: string;
  }) => Promise<void>;
  openQuestionnaire: (data: {
    callId: string;
    closerId: string;
    closerName: string;
    teamId: string;
    prospectName?: string;
  }) => Promise<void>;
}

export interface DiagnosticsAPI {
  collect: () => Promise<{
    system: Record<string, unknown>;
    websocket: Record<string, unknown>;
    audio: Record<string, unknown>;
  }>;
}

// Sequ3nce Stream (dictation) — see apps/personal/src/stream/
export interface StreamPermissionsState {
  microphone: boolean;
  accessibility: boolean;
  platform: string;
}

export interface StreamAPI {
  checkPermissions: () => Promise<StreamPermissionsState>;
  requestMicrophone: () => Promise<{ granted: boolean }>;
  requestAccessibility: () => Promise<{ opened: boolean }>;
  rebindHotkey: (hotkeyName: string) => Promise<{ success: boolean; error?: string }>;
  getStatus: () => Promise<{ overlayReady: boolean; hotkeyAvailable: boolean; appVersion: string }>;
  setUserId: (userId: string | null) => Promise<{ success: boolean; error?: string }>;
  setEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
}

export interface ElectronAPI {
  app: AppAPI;
  ammo: AmmoAPI;
  auth: AuthAPI;
  training: TrainingAPI;
  roleplay: RoleplayAPI;
  schedule: ScheduleAPI;
  chat: ChatAPI;
  bot: BotAPI;
  diagnostics: DiagnosticsAPI;
  stream: StreamAPI;
}

// Expose protected methods to renderer via contextBridge
contextBridge.exposeInMainWorld('electron', {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    setWindowSize: (width: number, height: number) => ipcRenderer.invoke('app:set-window-size', width, height),
    themeChanged: (theme: string) => ipcRenderer.invoke('app:theme-changed', theme),
    setBadgeCount: (count: number) => ipcRenderer.invoke('app:set-badge-count', count),
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
  bot: {
    callStarted: (data: {
      callId: string;
      teamId: string;
      closerId: string;
      closerName: string;
      prospectName?: string;
      meetingTitle?: string;
      botId?: string;
    }) => ipcRenderer.invoke('bot:call-started', data),
    callEnded: (data: {
      callId: string;
      closerId: string;
      prospectName?: string;
    }) => ipcRenderer.invoke('bot:call-ended', data),
    openQuestionnaire: (data: {
      callId: string;
      closerId: string;
      closerName: string;
      teamId: string;
      prospectName?: string;
      b2cUserId?: string;
    }) => ipcRenderer.invoke('bot:open-questionnaire', data),
  },
  diagnostics: {
    collect: () => ipcRenderer.invoke('diagnostics:collect'),
  },
  stream: {
    checkPermissions: () => ipcRenderer.invoke('stream:check-permissions'),
    requestMicrophone: () => ipcRenderer.invoke('stream:request-microphone'),
    requestAccessibility: () => ipcRenderer.invoke('stream:request-accessibility'),
    rebindHotkey: (hotkeyName: string) => ipcRenderer.invoke('stream:rebind-hotkey', hotkeyName),
    getStatus: () => ipcRenderer.invoke('stream:get-status'),
    setUserId: (userId: string | null) => ipcRenderer.invoke('stream:set-user-id', userId),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('stream:set-enabled', enabled),
  },
} as ElectronAPI);

// Auth callback from deep link
ipcRenderer.on('auth:callback', (_event, data: { token?: string; error?: string }) => {
  window.dispatchEvent(new CustomEvent('auth:callback', { detail: data }));
});

// Google Calendar connected callback from deep link
ipcRenderer.on('calendar:connected', (_event, data: { closerId: string }) => {
  window.dispatchEvent(new CustomEvent('calendar:connected', { detail: data }));
});
