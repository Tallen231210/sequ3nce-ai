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
