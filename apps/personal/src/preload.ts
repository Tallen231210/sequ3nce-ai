// Preload script - exposes safe IPC methods to renderer
import { contextBridge, ipcRenderer } from 'electron';

export interface AppAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<{ platform: string; arch: string; osRelease: string }>;
  setWindowSize: (width: number, height: number) => Promise<void>;
  themeChanged: (theme: string) => Promise<void>;
  setBadgeCount: (count: number) => Promise<void>;
  /**
   * Requests camera + microphone access from the OS. On macOS, this triggers
   * the system permission prompts (silent-denied on web getUserMedia without
   * this). On other platforms, resolves true without prompting.
   */
  requestMediaAccess: () => Promise<{ camera: boolean; microphone: boolean }>;
  /**
   * Returns the current macOS Screen Recording TCC status. Possible values:
   * 'not-determined' (first run, never asked), 'granted', 'denied',
   * 'restricted', 'unknown'. On non-macOS platforms always returns 'granted'.
   */
  getScreenAccessStatus: () => Promise<'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'>;
  /** Opens the macOS Screen Recording settings pane directly so the user can
   *  grant permission without hunting through System Settings. No-op on other platforms. */
  openScreenSettings: () => Promise<boolean>;
  /**
   * Subscribes to 'display-media:request' events from the main process. Fires
   * whenever the renderer calls getDisplayMedia() and the main process needs
   * the renderer to show a picker. Returns an unsubscribe function.
   */
  onDisplayMediaRequest: (handler: (sources: ScreenSource[]) => void) => () => void;
  /**
   * Resolves a deferred display-media request with the user's pick. Pass the
   * source id to share that source, or null to cancel without sharing.
   */
  selectDisplayMediaSource: (sourceId: string | null) => Promise<void>;
  /**
   * Fetches the list of capturable screens + windows up front (without
   * triggering any getDisplayMedia flow). Used by the coaching screen share
   * to render a picker BEFORE calling daily.startScreenShare with the chosen
   * source's id.
   */
  getScreenSources: () => Promise<ScreenSource[]>;
}

export interface ScreenSource {
  id: string;
  name: string;
  type: 'screen' | 'window';
  /** PNG data URL of the source preview, ~320x200. */
  thumbnail: string;
  /** PNG data URL of the application icon (windows only); null for whole screens. */
  appIcon: string | null;
}

export interface AuthAPI {
  sendMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifySession: (token: string) => Promise<boolean>;
  signOut: () => Promise<void>;
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
}

export interface DiagnosticsAPI {
  collect: () => Promise<{
    system: Record<string, unknown>;
    websocket: Record<string, unknown>;
    audio: Record<string, unknown>;
  }>;
}

export interface FreeHireSearchParams {
  lane: 'for-you' | 'sales' | 'closer' | 'account-executive' | 'high-ticket' | 'leadership';
  sort?: 'newest' | 'relevance';
  workMode?: 'remote' | 'hybrid' | 'onsite';
  country?: string;
  postedWithinDays?: 7 | 30;
  minSalary?: 75000 | 100000 | 150000 | 200000;
  limit?: number;
  offset?: number;
}

export interface FreeHireJob {
  id: string;
  title: string;
  company: string;
  logoUrl: string;
  location: string;
  description: string;
  descriptionBlocks: Array<{
    type: 'heading' | 'paragraph' | 'bullet';
    text: string;
  }>;
  applyUrl: string;
  source: string;
  workMode: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  skills: string[];
  employmentType: string;
  seniority: string;
  salary: string;
  postedAt: string | null;
  discoveredAt: string | null;
  lastSeenAt: string | null;
  appliedCount: number;
  domains: string[];
  countries: string[];
  reality: {
    classification: string;
    ageDays: number | null;
    repostCount: number;
    massPostingCount: number;
    fakeFreshness: boolean;
  } | null;
}

export interface FreeHireSearchResponse {
  jobs: FreeHireJob[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  fetchedAt: string;
}

export interface FreeHireJobDetail {
  description: string;
  descriptionBlocks: FreeHireJob['descriptionBlocks'];
  salary: string;
  employmentType: string;
  seniority: string;
}

export interface FreeHireFacetResponse {
  total: number;
  pastSevenDaysTotal: number;
  facets: Record<string, Record<string, number>>;
  fetchedAt: string;
}

export interface FreeHireRoleInsight {
  category: string;
  seniority: string;
  openCount: number;
  growth: number;
}

export interface FreeHireSkillInsight {
  skill: string;
  openCount: number;
  growth: number;
}

export interface FreeHireSalaryInsight {
  seniority: string;
  currency: string;
  period: string;
  sampleSize: number;
  p25: number;
  p50: number;
  p75: number;
}

export interface FreeHireVelocityInsight {
  period: string;
  added: number;
  removed: number;
}

export interface FreeHireMarketInsightsResponse {
  roles: FreeHireRoleInsight[];
  skills: FreeHireSkillInsight[];
  salary: FreeHireSalaryInsight[];
  velocity: FreeHireVelocityInsight[];
  fetchedAt: string;
}

export interface FreeHireAPI {
  search: (params: FreeHireSearchParams) => Promise<FreeHireSearchResponse>;
  getJob: (slug: string) => Promise<FreeHireJobDetail>;
  facets: (params: FreeHireSearchParams) => Promise<FreeHireFacetResponse>;
  marketInsights: (params: { country?: string }) => Promise<FreeHireMarketInsightsResponse>;
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
  auth: AuthAPI;
  chat: ChatAPI;
  bot: BotAPI;
  diagnostics: DiagnosticsAPI;
  stream: StreamAPI;
  freeHire: FreeHireAPI;
}

// Expose protected methods to renderer via contextBridge
contextBridge.exposeInMainWorld('electron', {
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getPlatform: () => ipcRenderer.invoke('app:get-platform'),
    setWindowSize: (width: number, height: number) => ipcRenderer.invoke('app:set-window-size', width, height),
    themeChanged: (theme: string) => ipcRenderer.invoke('app:theme-changed', theme),
    setBadgeCount: (count: number) => ipcRenderer.invoke('app:set-badge-count', count),
    requestMediaAccess: () => ipcRenderer.invoke('app:request-media-access'),
    getScreenAccessStatus: () => ipcRenderer.invoke('app:get-screen-access-status'),
    openScreenSettings: () => ipcRenderer.invoke('app:open-screen-settings'),
    onDisplayMediaRequest: (handler: (sources: ScreenSource[]) => void) => {
      const wrapped = (_evt: Electron.IpcRendererEvent, sources: ScreenSource[]) => handler(sources);
      ipcRenderer.on('display-media:request', wrapped);
      return () => ipcRenderer.off('display-media:request', wrapped);
    },
    selectDisplayMediaSource: (sourceId: string | null) =>
      ipcRenderer.invoke('app:select-display-media-source', sourceId),
    getScreenSources: () => ipcRenderer.invoke('app:get-screen-sources'),
  },
  auth: {
    sendMagicLink: (email: string) => ipcRenderer.invoke('auth:send-magic-link', email),
    verifySession: (token: string) => ipcRenderer.invoke('auth:verify-session', token),
    signOut: () => ipcRenderer.invoke('auth:sign-out'),
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
  freeHire: {
    search: (params: FreeHireSearchParams) => ipcRenderer.invoke('freehire:search', params),
    getJob: (slug: string) => ipcRenderer.invoke('freehire:get-job', slug),
    facets: (params: FreeHireSearchParams) => ipcRenderer.invoke('freehire:facets', params),
    marketInsights: (params: { country?: string }) => ipcRenderer.invoke('freehire:market-insights', params),
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
