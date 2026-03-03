import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CloserInfo, ActiveBotCall } from '../convex';
import {
  needsCalendarOnboarding,
  getActiveCallForCloserBot,
  getPendingQuestionnaireInfo,
  getDMUnreadCount,
} from '../convex';
import { useTheme } from '../ThemeContext';
import logoImage from '../../assets/logo.png';
import { DashboardView } from './DashboardView';
import { StatsView } from './StatsView';
import { CallHistoryView } from './CallHistoryView';
import { BotOnboardingView } from './BotOnboardingView';
import { QuickBotModal } from './QuickBotModal';
import { ScheduleView } from './schedule/ScheduleView';
import { ResourcesView } from './ResourcesView';
import { SettingsView } from './SettingsView';
import { ProfileView } from './ProfileView';
import { CommunityView } from './CommunityView';
import { DirectMessagesView } from './DirectMessagesView';

// Sidebar navigation items for Sequ3nce Personal (B2C)
type SidebarItem =
  | 'dashboard'
  | 'stats'
  | 'calls'
  | 'schedule'
  | 'resources'
  | 'jobboard'
  | 'profile'
  | 'messages'
  | 'community'
  | 'settings';

interface NavItem {
  id: SidebarItem;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>
    ),
  },
  {
    id: 'stats',
    label: 'Stats',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    id: 'calls',
    label: 'Calls',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
      </svg>
    ),
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'resources',
    label: 'Resources',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
    ),
  },
  {
    id: 'jobboard',
    label: 'Job Board',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm-2 5a1 1 0 100 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
        <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
        <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
      </svg>
    ),
  },
  {
    id: 'community',
    label: 'Community',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
      </svg>
    ),
  },
];

// Minimum call duration in seconds before showing questionnaire
const MIN_CALL_DURATION = 30;
// Bot polling interval in ms
const BOT_POLL_INTERVAL = 3000;

interface MeetingBotHubProps {
  closerInfo: CloserInfo;
  onLogout: () => void;
}

export function MeetingBotHub({ closerInfo, onLogout }: MeetingBotHubProps) {
  const { theme, toggleTheme } = useTheme();
  const [selectedItem, setSelectedItem] = useState<SidebarItem>('dashboard');

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // Active call state (for banner display only — ammo panel is a floating window)
  const [activeCall, setActiveCall] = useState<ActiveBotCall | null>(null);
  const activeCallStartRef = useRef<number | null>(null);
  const previousCallRef = useRef<ActiveBotCall | null>(null);
  const botCallNotifiedRef = useRef<string | null>(null); // Track which callId we've sent IPC for

  // Quick bot modal
  const [showQuickBot, setShowQuickBot] = useState(false);

  // Sidebar badge counts
  const [callsPendingCount, setCallsPendingCount] = useState(0);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);

  // DM navigation state (for cross-view "Message" entry points)
  const [startDMWith, setStartDMWith] = useState<{
    userId: string;
    name: string;
    photoUrl: string | null;
  } | null>(null);

  // Check calendar onboarding on mount
  useEffect(() => {
    needsCalendarOnboarding(closerInfo.closerId).then((needs) => {
      setShowOnboarding(needs);
      setOnboardingChecked(true);
    });
  }, [closerInfo.closerId]);

  // Poll pending questionnaire count for Calls tab badge
  useEffect(() => {
    const poll = () => {
      getPendingQuestionnaireInfo(closerInfo.closerId).then((info) => {
        setCallsPendingCount(info.count);
      }).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [closerInfo.closerId]);

  // Poll DM unread count for Messages badge
  useEffect(() => {
    if (!closerInfo.b2cUserId) return;
    const poll = () => {
      getDMUnreadCount(closerInfo.b2cUserId!).then(setDmUnreadCount).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [closerInfo.b2cUserId]);

  // Theme sync to floating windows is now handled by ThemeContext.tsx

  // Bot polling — every 3 seconds
  // Detects call start/end and sends IPC to main process to open/close floating windows
  useEffect(() => {
    const poll = async () => {
      const call = await getActiveCallForCloserBot(closerInfo.closerId);

      if (call) {
        // Bot is active
        if (!activeCallStartRef.current) {
          activeCallStartRef.current = Date.now();
        }
        setActiveCall(call);
        previousCallRef.current = call;

        // Send IPC to open floating ammo panel (only once per call)
        if (botCallNotifiedRef.current !== call.callId) {
          botCallNotifiedRef.current = call.callId;
          window.electron?.bot?.callStarted({
            callId: call.callId,
            teamId: closerInfo.teamId,
            closerId: closerInfo.closerId,
            closerName: closerInfo.name,
            prospectName: call.prospectName || undefined,
            meetingTitle: call.meetingTitle || undefined,
            botId: call.visitorCallId || undefined,
          });
        }
      } else {
        // No active call
        if (previousCallRef.current && activeCallStartRef.current) {
          // Call just ended — check minimum duration
          const elapsed = (Date.now() - activeCallStartRef.current) / 1000;
          if (elapsed >= MIN_CALL_DURATION) {
            // Send IPC to open floating post-call questionnaire
            window.electron?.bot?.callEnded({
              callId: previousCallRef.current.callId,
              closerId: closerInfo.closerId,
              prospectName: previousCallRef.current.prospectName || undefined,
            });
          }
        }
        setActiveCall(null);
        activeCallStartRef.current = null;
        previousCallRef.current = null;
        botCallNotifiedRef.current = null;
      }
    };

    poll();
    const interval = setInterval(poll, BOT_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [closerInfo.closerId, closerInfo.teamId, closerInfo.name]);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  // Open floating post-call questionnaire via IPC (used by "Fill Out Now" banner in CallHistoryView)
  const handleOpenQuestionnaire = useCallback((callId: string, prospectName?: string) => {
    window.electron?.bot?.openQuestionnaire({
      callId,
      closerId: closerInfo.closerId,
      closerName: closerInfo.name,
      teamId: closerInfo.teamId,
      prospectName,
    });
  }, [closerInfo]);

  return (
    <div className="h-screen flex bg-white text-black">
      {/* Calendar onboarding overlay */}
      {onboardingChecked && showOnboarding && (
        <BotOnboardingView closerInfo={closerInfo} onComplete={handleOnboardingComplete} />
      )}

      {/* Quick Bot modal */}
      {showQuickBot && (
        <QuickBotModal closerInfo={closerInfo} onClose={() => setShowQuickBot(false)} />
      )}

      {/* Sidebar */}
      <div className="w-[200px] flex flex-col border-r border-gray-200 bg-gray-50/80">
        {/* Draggable titlebar region at top of sidebar */}
        <div className="titlebar h-8" />

        {/* Logo + User info */}
        <div className="flex flex-col items-center pt-3 pb-4">
          <img src={logoImage} alt="Sequ3nce Personal" className="h-[60px] mb-3 dark-invert" />
          <div className="text-sm font-semibold text-gray-900 truncate text-center px-3">{closerInfo.name}</div>
          <div className="text-xs text-gray-500 truncate text-center px-3">Personal</div>
        </div>

        <div className="mx-4 border-t border-gray-200" />

        {/* Nav items */}
        <nav className="flex-1 px-2 pt-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const badge = item.id === 'calls' ? callsPendingCount : item.id === 'messages' ? dmUnreadCount : 0;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150 ${
                  selectedItem === item.id
                    ? 'bg-black text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-200/70'
                }`}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <span className="truncate flex-1 text-left">{item.label}</span>
                {badge > 0 && (
                  <span className={`min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full px-1 ${
                    selectedItem === item.id
                      ? 'bg-white text-black'
                      : 'bg-red-500 text-white'
                  }`}>
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Theme toggle + Sign out */}
        <div className="px-3 py-3 border-t border-gray-200 flex items-center justify-between">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-200/70 transition-colors"
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? (
              /* Moon icon — click to go dark */
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              /* Sun icon — click to go light */
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>

          {/* Sign out */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Draggable titlebar region across content with Quick Bot button */}
        <div className="titlebar h-14 border-b border-gray-100" />

        {/* Active Call Banner */}
        {activeCall && (
          <div className="bg-green-500 text-white px-4 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-sm font-medium">
                Active Call: {activeCall.prospectName || activeCall.meetingTitle || 'In Progress'}
              </span>
            </div>
            <button
              onClick={() => window.electron?.ammo?.toggle()}
              className="text-xs font-medium bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md transition-colors"
            >
              Show Ammo Panel
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {renderContent(selectedItem, closerInfo, setSelectedItem, onLogout, handleOpenQuestionnaire, startDMWith, () => setStartDMWith(null), (userId, name, photoUrl) => {
            setStartDMWith({ userId, name, photoUrl });
            setSelectedItem('messages');
          })}
        </div>
      </div>
    </div>
  );
}

// Route sidebar selection to the correct view component
function renderContent(
  item: SidebarItem,
  closerInfo: CloserInfo,
  onNavigate: (item: SidebarItem) => void,
  onLogout: () => void,
  onOpenQuestionnaire?: (callId: string, prospectName?: string) => void,
  startDMWith?: { userId: string; name: string; photoUrl: string | null } | null,
  onDMRecipientConsumed?: () => void,
  onStartDM?: (userId: string, name: string, photoUrl: string | null) => void
): React.ReactNode {
  switch (item) {
    case 'dashboard':
      return <DashboardView closerInfo={closerInfo} onNavigate={(id) => onNavigate(id as SidebarItem)} />;
    case 'stats':
      return <StatsView closerInfo={closerInfo} />;
    case 'calls':
      return <CallHistoryView closerInfo={closerInfo} onOpenQuestionnaire={onOpenQuestionnaire} />;
    case 'schedule':
      return <ScheduleView closerInfo={closerInfo} />;
    case 'resources':
      return <ResourcesView closerInfo={closerInfo} />;
    case 'settings':
      return <SettingsView closerInfo={closerInfo} onLogout={onLogout} />;
    case 'profile':
      return <ProfileView closerInfo={closerInfo} />;
    case 'messages':
      return (
        <DirectMessagesView
          closerInfo={closerInfo}
          initialRecipientId={startDMWith?.userId}
          initialRecipientName={startDMWith?.name}
          initialRecipientPhotoUrl={startDMWith?.photoUrl}
          onRecipientConsumed={onDMRecipientConsumed}
        />
      );
    case 'community':
      return <CommunityView closerInfo={closerInfo} onStartDM={onStartDM} />;
    case 'jobboard':
      return <PlaceholderView name={NAV_ITEMS.find((i) => i.id === item)?.label || item} />;
    default:
      return <PlaceholderView name={NAV_ITEMS.find((i) => i.id === item)?.label || item} />;
  }
}

// Temporary placeholder view for sections not yet built
function PlaceholderView({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 01-1.125-1.125v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-1">{name}</h2>
      <p className="text-sm text-gray-500">Coming soon — this view will be built in a later phase.</p>
    </div>
  );
}
