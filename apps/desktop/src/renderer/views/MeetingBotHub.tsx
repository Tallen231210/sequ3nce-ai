import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CloserInfo, ActiveBotCall } from '../convex';
import { usePoll } from '../lib/usePoll';
import {
  needsCalendarOnboarding,
  getActiveCallForCloserBot,
  endCallManually,
  getUnreadFeedbackCount,
  getUnreadSharedMomentsCount,
  getPendingQuestionnaireInfo,
} from '../convex';
import { useTheme } from '../ThemeContext';
import logoImage from '../../assets/logo.png';
import { DashboardView } from './DashboardView';
import { StatsView } from './StatsView';
import { PerformanceView } from './PerformanceView';
import { CallHistoryView } from './CallHistoryView';
import { CoachingView } from './CoachingView';
import { BotOnboardingView } from './BotOnboardingView';
import { QuickBotModal } from './QuickBotModal';
import { ScheduleView } from './schedule/ScheduleView';
import { ResourcesView } from './ResourcesView';
import { SettingsView } from './SettingsView';
import { MessagesView } from './MessagesView';
import { RolePlayView } from './RolePlayView';

// Sidebar navigation items — matches Swift app's SidebarItem enum
type SidebarItem =
  | 'dashboard'
  | 'stats'
  | 'calls'
  | 'performance'
  | 'schedule'
  | 'roleplay'
  | 'messages'
  | 'resources'
  | 'coaching'
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
    id: 'performance',
    label: 'My Numbers',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2H5zm3 3a1 1 0 000 2h4a1 1 0 100-2H8zm-1 4a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm1 3a1 1 0 100 2h4a1 1 0 100-2H8z" clipRule="evenodd" />
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
    id: 'roleplay',
    label: 'Role Play',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
      </svg>
    ),
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
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
    id: 'coaching',
    label: 'Coaching',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" />
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
// Bot polling interval — bumped from 3s to 10s. Closer's UX tolerance for
// "the floating ammo panel opens" is ~10s; the previous 3s was overkill
// and was a top contributor to Convex action saturation (task #348).
const BOT_POLL_INTERVAL = 10_000;

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

  // Post-call pending state (soft prompt instead of auto-fire)
  const [callEndedPending, setCallEndedPending] = useState<{
    callId: string;
    prospectName?: string;
  } | null>(null);

  // Quick bot modal
  const [showQuickBot, setShowQuickBot] = useState(false);

  // Sidebar badge counts
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [coachingUnreadCount, setCoachingUnreadCount] = useState(0);
  const [callsPendingCount, setCallsPendingCount] = useState(0);

  // Check calendar onboarding on mount
  useEffect(() => {
    needsCalendarOnboarding(closerInfo.closerId).then((needs) => {
      setShowOnboarding(needs);
      setOnboardingChecked(true);
    });
  }, [closerInfo.closerId]);

  // Listen for message unread count from main process IPC
  useEffect(() => {
    const unsub = window.electron?.chat?.onUnreadCountChanged?.((count: number) => {
      setMessageUnreadCount(count);
    });
    // Also fetch initial count
    window.electron?.chat?.getUnreadCount?.(closerInfo.closerId).then((count: number) => {
      setMessageUnreadCount(count);
    }).catch(() => {});
    return () => { unsub?.(); };
  }, [closerInfo.closerId]);

  // Poll coaching unread counts (feedback + shared moments) — 30s.
  // Note: CoachingView ALSO polls these endpoints when open. Pre-fix
  // both fired simultaneously; per task #348's audit we drop the
  // CoachingView duplicate and keep this one as the source of truth.
  usePoll(
    'coachingUnread',
    async () => {
      const [fc, mc] = await Promise.all([
        getUnreadFeedbackCount(closerInfo.closerId),
        getUnreadSharedMomentsCount(closerInfo.closerId),
      ]);
      setCoachingUnreadCount(fc + mc);
    },
    30_000,
  );

  // Poll pending questionnaire count for Calls tab badge — 15s
  // (bumped from 10s; matches the CallHistoryView bump for consistency).
  usePoll(
    'callsPending',
    async () => {
      const info = await getPendingQuestionnaireInfo(closerInfo.closerId);
      setCallsPendingCount(info.count);
    },
    15_000,
  );

  // Clear badge when switching to Messages or Coaching tab
  useEffect(() => {
    if (selectedItem === 'messages') setMessageUnreadCount(0);
    if (selectedItem === 'coaching') setCoachingUnreadCount(0);
  }, [selectedItem]);

  // Theme sync to floating windows is now handled by ThemeContext.tsx

  // Bot polling — every 10s (bumped from 3s; see BOT_POLL_INTERVAL).
  // Detects call start/end and sends IPC to open/close floating windows.
  usePoll(
    'botActiveCall',
    async () => {
      const call = await getActiveCallForCloserBot(closerInfo.closerId);

      if (call) {
        if (!activeCallStartRef.current) {
          activeCallStartRef.current = Date.now();
        }
        setActiveCall(call);
        previousCallRef.current = call;
        setCallEndedPending(null);

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
        if (previousCallRef.current && activeCallStartRef.current) {
          const elapsed = (Date.now() - activeCallStartRef.current) / 1000;
          if (elapsed >= MIN_CALL_DURATION) {
            setCallEndedPending({
              callId: previousCallRef.current.callId,
              prospectName: previousCallRef.current.prospectName || undefined,
            });
          }
        }
        setActiveCall(null);
        activeCallStartRef.current = null;
        previousCallRef.current = null;
        botCallNotifiedRef.current = null;
      }
    },
    BOT_POLL_INTERVAL,
  );

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  // Manual "End Call" — user clicks this when their call is done
  const handleEndCall = useCallback(async () => {
    // 1. Write to Convex FIRST — prevents poll from seeing this call as active
    await endCallManually(closerInfo.closerId);
    // 2. Close ammo panel via IPC
    window.electron?.bot?.callEnded({ callId: activeCall?.callId || '', closerId: closerInfo.closerId });
    // 3. Open post-call form immediately for THIS call
    window.electron?.bot?.openQuestionnaire({
      callId: activeCall?.callId || '',
      closerId: closerInfo.closerId,
      closerName: closerInfo.name,
      teamId: closerInfo.teamId,
      prospectName: activeCall?.prospectName || undefined,
    });
    // 4. Clear local state
    setActiveCall(null);
    activeCallStartRef.current = null;
    previousCallRef.current = null;
    setCallEndedPending(null);
  }, [activeCall, closerInfo]);

  // Soft prompt "Fill Out Form" — opens form directly
  const handleGoToPostCallForm = useCallback(() => {
    if (callEndedPending) {
      window.electron?.bot?.openQuestionnaire({
        callId: callEndedPending.callId,
        closerId: closerInfo.closerId,
        closerName: closerInfo.name,
        teamId: closerInfo.teamId,
        prospectName: callEndedPending.prospectName,
      });
    }
    setCallEndedPending(null);
  }, [callEndedPending, closerInfo]);

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
          <img src={logoImage} alt="Sequ3nce" className="h-[60px] mb-3 dark-invert" />
          <div className="text-sm font-semibold text-gray-900 truncate text-center px-3">{closerInfo.name}</div>
          <div className="text-xs text-gray-500 truncate text-center px-3">{closerInfo.teamName}</div>
        </div>

        <div className="mx-4 border-t border-gray-200" />

        {/* Nav items */}
        <nav className="flex-1 px-2 pt-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const badge =
              item.id === 'messages' ? messageUnreadCount :
              item.id === 'coaching' ? coachingUnreadCount :
              item.id === 'calls' ? callsPendingCount : 0;
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
        <div className="titlebar h-14 border-b border-gray-100 flex items-center justify-end px-5">
          <button
            onClick={() => setShowQuickBot(true)}
            className="no-drag flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-white bg-black rounded-lg hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Quick Bot
          </button>
        </div>

        {/* Active Call Banner */}
        {activeCall && (
          <div className="bg-green-500 text-white px-4 py-2 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-sm font-medium">
                Active Call: {activeCall.prospectName || activeCall.meetingTitle || 'In Progress'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.electron?.ammo?.toggle()}
                className="text-xs font-medium bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md transition-colors"
              >
                Show Ammo Panel
              </button>
              <button
                onClick={handleEndCall}
                className="text-xs font-medium bg-white text-green-700 hover:bg-green-50 px-3 py-1 rounded-md transition-colors"
              >
                End Call
              </button>
            </div>
          </div>
        )}

        {/* Call Ended — Soft Prompt (replaces auto-fire) */}
        {!activeCall && callEndedPending && (
          <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between shrink-0">
            <span className="text-sm font-medium">
              {callEndedPending.prospectName
                ? `Call with ${callEndedPending.prospectName} ended — fill out your post-call form`
                : 'Call ended — fill out your post-call form'}
            </span>
            <button
              onClick={handleGoToPostCallForm}
              className="text-xs font-medium bg-white text-amber-700 hover:bg-amber-50 px-3 py-1 rounded-md transition-colors"
            >
              Fill Out Form
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {renderContent(selectedItem, closerInfo, setSelectedItem, onLogout, handleOpenQuestionnaire)}
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
  onOpenQuestionnaire?: (callId: string, prospectName?: string) => void
): React.ReactNode {
  switch (item) {
    case 'dashboard':
      return <DashboardView closerInfo={closerInfo} onNavigate={(id) => onNavigate(id as SidebarItem)} />;
    case 'stats':
      return <StatsView closerInfo={closerInfo} />;
    case 'performance':
      return <PerformanceView closerInfo={closerInfo} />;
    case 'calls':
      return <CallHistoryView closerInfo={closerInfo} onOpenQuestionnaire={onOpenQuestionnaire} />;
    case 'coaching':
      return <CoachingView closerInfo={closerInfo} />;
    case 'schedule':
      return <ScheduleView closerInfo={closerInfo} />;
    case 'resources':
      return <ResourcesView closerInfo={closerInfo} />;
    case 'settings':
      return <SettingsView closerInfo={closerInfo} onLogout={onLogout} />;
    case 'messages':
      return <MessagesView closerInfo={closerInfo} />;
    case 'roleplay':
      return <RolePlayView closerInfo={closerInfo} />;
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
