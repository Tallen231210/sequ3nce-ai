// Type declarations for electron API exposed via preload

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
  getTheme: () => Promise<string>;
  copyToClipboard: (text: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  close: () => Promise<void>;
  minimize: () => Promise<void>;
  expand: () => Promise<void>;
  saveNotes: (callId: string, notes: string) => Promise<{ success: boolean }>;
  getNotes: (callId: string) => Promise<string | null>;
  onThemeChanged: (callback: (theme: string) => void) => () => void;
  onCallIdChange: (callback: (callId: string | null) => void) => () => void;
  onNewAmmo: (callback: (ammo: AmmoItem) => void) => () => void;
  onNewTranscript: (callback: (segment: TranscriptSegment) => void) => () => void;
  // Live Chat methods
  chatGetMessages: (closerId: string, limit?: number) => Promise<ChatMessage[]>;
  chatSendMessage: (teamId: string, closerId: string, closerName: string, message: string) => Promise<unknown>;
  chatMarkAllRead: (closerId: string) => Promise<unknown>;
  chatGetUnreadCount: (closerId: string) => Promise<number>;
  chatGetLatestUnread: (closerId: string) => Promise<ChatMessage | null>;
  chatStartPolling: (closerId: string, teamId: string, closerName: string, intervalMs?: number) => Promise<{ success: boolean }>;
  chatStopPolling: () => Promise<{ success: boolean }>;
  onUnreadCountChanged: (callback: (count: number) => void) => () => void;
  onNewMessage: (callback: (message: ChatMessage) => void) => () => void;
  chatGetCloserInfo: () => Promise<{ closerId: string | null; teamId: string | null; closerName: string | null }>;
  onSwitchToChatTab: (callback: () => void) => () => void;
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

// Calendar event type
export interface CalendarEvent {
  _id: string;
  uid: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  location?: string;
  isAllDay?: boolean;
}

// Calendar status type
export interface CalendarStatus {
  closerId: string;
  connected: boolean;
  icsUrl?: string;
  connectedAt?: number;
  lastSynced?: number;
}

// Schedule window API (exposed via schedule-preload.ts)
export interface ScheduleWindowAPI {
  getCloserEmail: () => Promise<string | null>;
  getCalendarStatus: (email: string) => Promise<CalendarStatus | null>;
  connectCalendar: (email: string, icsUrl: string) => Promise<{ success: boolean }>;
  disconnectCalendar: (email: string) => Promise<{ success: boolean }>;
  syncCalendar: (email: string) => Promise<{ success: boolean; syncedEvents?: number }>;
  getEvents: (email: string, startDate: number, endDate: number) => Promise<CalendarEvent[]>;
  close: () => Promise<void>;
  minimize: () => Promise<void>;
  onCloserEmailChange: (callback: (email: string | null) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    ammoTracker?: AmmoTrackerAPI;
    training?: TrainingWindowAPI;
    schedule?: ScheduleWindowAPI;
  }
}

export {};
