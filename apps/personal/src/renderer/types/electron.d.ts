// Type declarations for electron API exposed via preload

export interface AppAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<{ platform: string; arch: string; osRelease: string }>;
  setWindowSize: (width: number, height: number) => Promise<void>;
  themeChanged: (theme: string) => Promise<void>;
  setBadgeCount: (count: number) => Promise<void>;
  requestMediaAccess: () => Promise<{ camera: boolean; microphone: boolean }>;
  getScreenAccessStatus: () => Promise<'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'>;
  openScreenSettings: () => Promise<boolean>;
  onDisplayMediaRequest: (handler: (sources: ScreenSource[]) => void) => () => void;
  selectDisplayMediaSource: (sourceId: string | null) => Promise<void>;
  getScreenSources: () => Promise<ScreenSource[]>;
}

export interface ScreenSource {
  id: string;
  name: string;
  type: 'screen' | 'window';
  thumbnail: string;
  appIcon: string | null;
}

export interface AuthAPI {
  sendMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifySession: (token: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

// Chat message type for Live Chat feature
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
    call: Record<string, unknown>;
    context: Record<string, unknown>;
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
  auth: AuthAPI;
  chat: ChatAPI;
  bot: BotAPI;
  diagnostics: DiagnosticsAPI;
  stream: StreamAPI;
}

// Training playlist types (in-app Training tab)
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

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
