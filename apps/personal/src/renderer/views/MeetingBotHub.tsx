import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CloserInfo, ActiveBotCall } from '../convex';
import { usePoll } from '../lib/usePoll';
import {
  needsCalendarOnboarding,
  getActiveCallForCloserBot,
  endCallManually,
  getPendingDispositions,
  getIncomingFriendRequests,
  getDMUnreadCount,
  sendHeartbeat,
  getOnlineUserIds,
  getPendingContentSubmissions,
  getTeamUnreadCount,
  getMoneyBellsUnreadCount,
  getPendingVerificationCount,
} from '../convex';
import { useTheme } from '../ThemeContext';
import { playNotificationChime } from './notificationSound';
import logoImage from '../../assets/logo.png';
import { DashboardView } from './DashboardView';
import { PostCallFormView } from './PostCallFormView';
import { StatsView } from './StatsView';
import { CallHistoryView } from './CallHistoryView';
import { BotOnboardingView } from './BotOnboardingView';
import { QuickBotModal } from './QuickBotModal';
import { StreamModal } from './stream/StreamModal';
import { ScheduleView } from './schedule/ScheduleView';
import { ResourcesView } from './ResourcesView';
import { SettingsView } from './SettingsView';
import { ProfileView } from './ProfileView';
import { CommunityView } from './CommunityView';
import { CoachingSessionProvider, useCoachingSession } from './community/coaching/CoachingSessionContext';
import { CoachingCallLayer } from './community/coaching/CoachingCallLayer';
import { JobBoardView } from './JobBoardView';
import { DirectMessagesView } from './DirectMessagesView';
import { HighlightsView } from './HighlightsView';
import { ContentSubmissionsView } from './ContentSubmissionsView';
import { ContentReviewView } from './ContentReviewView';
import { NotificationsView } from './notifications/NotificationsView';
import { StatsVerificationReviewView } from './statsVerification/StatsVerificationReviewView';
import { AdoptionChecklistButton } from './adoption-checklist/AdoptionChecklistButton';
import type { CtaTarget } from './adoption-checklist/types';

// Sidebar navigation items for Sequ3nce Personal (B2C)
type SidebarItem =
  | 'dashboard'
  | 'stats'
  | 'calls'
  | 'highlights'
  | 'submissions'
  | 'contentreview'
  | 'schedule'
  | 'resources'
  | 'jobboard'
  | 'messages'
  | 'notifications'
  | 'verification-review'
  | 'profile'
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
    id: 'highlights',
    label: 'Highlights',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
      </svg>
    ),
  },
  {
    id: 'contentreview',
    label: 'Content Review',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />
      </svg>
    ),
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
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
    id: 'community',
    label: 'Community',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
      </svg>
    ),
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    id: 'verification-review',
    label: 'Verification Review',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
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
// Bot polling interval — bumped from 3s to 10s. Top contributor to
// Convex action saturation per task #348; the active-call banner appearing
// within ~10s is fine UX.
const BOT_POLL_INTERVAL = 10_000;

interface MeetingBotHubProps {
  closerInfo: CloserInfo;
  onLogout: () => void;
}

// Outer wrapper — provides CoachingSessionContext so any descendant (including
// ScheduleView and CommunityView→CoachingView) can start/stop/minimize a
// coaching call without prop-drilling, and the CoachingCallLayer survives
// tab navigation because it mounts here, not inside a tab view.
export function MeetingBotHub(props: MeetingBotHubProps) {
  return (
    <CoachingSessionProvider>
      <MeetingBotHubInner {...props} />
    </CoachingSessionProvider>
  );
}

function MeetingBotHubInner({ closerInfo, onLogout }: MeetingBotHubProps) {
  const { theme, toggleTheme } = useTheme();
  const [selectedItem, setSelectedItem] = useState<SidebarItem>('dashboard');

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // Active call state (drives the banner)
  const [activeCall, setActiveCall] = useState<ActiveBotCall | null>(null);
  const activeCallStartRef = useRef<number | null>(null);
  const previousCallRef = useRef<ActiveBotCall | null>(null);
  const botCallNotifiedRef = useRef<string | null>(null); // Track which callId we've sent IPC for

  // Post-call pending state (soft prompt instead of auto-fire)
  const [callEndedPending, setCallEndedPending] = useState<{
    callId: string;
    prospectName?: string;
  } | null>(null);

  // In-app post-call form (replaces the old floating post-call window)
  const [postCallForm, setPostCallForm] = useState<{
    callId: string;
    prospectName?: string;
  } | null>(null);

  // Quick bot modal
  const [showQuickBot, setShowQuickBot] = useState(false);
  const [showStream, setShowStream] = useState(false);
  const [streamEnabled, setStreamEnabled] = useState(false);

  // Messages slide-out panel
  const [showMessages, setShowMessages] = useState(false);

  // Sidebar badge counts
  const [callsPendingCount, setCallsPendingCount] = useState(0);
  const [friendRequestCount, setFriendRequestCount] = useState(0);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const prevDmUnreadRef = useRef(0);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [contentPendingCount, setContentPendingCount] = useState(0);
  const [teamNotificationUnreadCount, setTeamNotificationUnreadCount] = useState(0);
  const prevTeamNotifUnreadRef = useRef(0);
  const [moneyBellsUnreadCount, setMoneyBellsUnreadCount] = useState(0);
  const [verificationPendingCount, setVerificationPendingCount] = useState(0);

  // Whether user has founder badge (for content review access + notifications admin)
  const isFounder = (closerInfo.badges?.includes('founder') ?? false) || (closerInfo.badges?.includes('admin') ?? false);

  // Cross-navigation state for DMs from Community
  const [dmRecipient, setDmRecipient] = useState<{
    id: string;
    name: string;
    photoUrl: string | null;
  } | null>(null);

  // Push signed-in B2C user id to the main process so the Sequ3nce Stream
  // overlay can attribute transcriptions. Clears on unmount so logout resets state.
  useEffect(() => {
    if (!closerInfo.b2cUserId) return;
    window.electron?.stream?.setUserId(closerInfo.b2cUserId).catch((err) => {
      console.error('[MeetingBotHub] stream.setUserId failed:', err);
    });
    return () => {
      window.electron?.stream?.setUserId(null).catch(() => {
        // ignore
      });
    };
  }, [closerInfo.b2cUserId]);

  // Check calendar onboarding on mount
  useEffect(() => {
    needsCalendarOnboarding(closerInfo.closerId).then((needs) => {
      setShowOnboarding(needs);
      setOnboardingChecked(true);
    });
  }, [closerInfo.closerId]);

  // All sidebar badge polls migrated to usePoll for backoff + jitter +
  // visibility-pause (task #348). Intervals bumped where they were
  // unnecessarily aggressive (10s → 15s for non-time-critical badges).

  usePoll(
    'callsPending',
    async () => {
      const info = await getPendingDispositions(closerInfo.closerId);
      setCallsPendingCount(info.count);
    },
    15_000,
  );

  usePoll(
    'friendRequests',
    async () => {
      if (!closerInfo.b2cUserId) return;
      const friendResult = await getIncomingFriendRequests(closerInfo.b2cUserId).catch(
        () => ({ requests: [] }),
      );
      setFriendRequestCount(friendResult.requests.length);
    },
    15_000,
    { enabled: !!closerInfo.b2cUserId },
  );

  usePoll(
    'dmUnread',
    async () => {
      if (!closerInfo.b2cUserId) return;
      const count = await getDMUnreadCount(closerInfo.b2cUserId);
      setDmUnreadCount(count);
      if (count > prevDmUnreadRef.current && selectedItem !== 'messages') {
        new Notification('New Message', { body: 'You have a new message', silent: true });
        playNotificationChime();
      }
      prevDmUnreadRef.current = count;
    },
    15_000,
    { enabled: !!closerInfo.b2cUserId },
  );

  // Money Bells unread badge (propagated into the Community sidebar-tab badge).
  // The sub-tab badge inside ChannelSidebar uses the same endpoint, and clicking
  // the Money Bells sub-tab updates the localStorage lastViewed → clears both.
  usePoll(
    'moneyBellsUnread',
    async () => {
      if (!closerInfo.b2cUserId) return;
      const MONEY_BELLS_LAST_VIEWED_KEY = 'sequ3nce_money_bells_last_viewed';
      const since = Number(localStorage.getItem(MONEY_BELLS_LAST_VIEWED_KEY)) || Date.now();
      const res = await getMoneyBellsUnreadCount(closerInfo.b2cUserId, since);
      if ('count' in res) setMoneyBellsUnreadCount(res.count);
    },
    20_000,
    { enabled: !!closerInfo.b2cUserId },
  );

  // Founder-only: pending stats-verification requests badge
  usePoll(
    'verificationPending',
    async () => {
      if (!closerInfo.b2cUserId || !isFounder) return;
      const res = await getPendingVerificationCount(closerInfo.b2cUserId);
      if ('count' in res) setVerificationPendingCount(res.count);
    },
    20_000,
    { enabled: !!closerInfo.b2cUserId && isFounder },
  );

  // Founder-only: team-notification inbox unread badge + chime
  usePoll(
    'teamNotifUnread',
    async () => {
      if (!closerInfo.b2cUserId || !isFounder) return;
      const res = await getTeamUnreadCount(closerInfo.b2cUserId);
      if ('count' in res) {
        setTeamNotificationUnreadCount(res.count);
        if (
          res.count > prevTeamNotifUnreadRef.current &&
          selectedItem !== 'notifications' &&
          selectedItem !== 'messages'
        ) {
          new Notification('New reply to Sequ3nce Team', {
            body: 'A user replied to an official notification.',
            silent: true,
          });
          playNotificationChime();
        }
        prevTeamNotifUnreadRef.current = res.count;
      }
    },
    20_000,
    { enabled: !!closerInfo.b2cUserId && isFounder },
  );

  // Content review pending count (founder only)
  usePoll(
    'contentPending',
    async () => {
      if (!closerInfo.b2cUserId || !isFounder) return;
      const submissions = await getPendingContentSubmissions(closerInfo.b2cUserId);
      setContentPendingCount(submissions.length);
    },
    20_000,
    { enabled: !!closerInfo.b2cUserId && isFounder },
  );

  // Update dock/taskbar badge when either count changes
  useEffect(() => {
    const totalBadge = friendRequestCount + dmUnreadCount;
    window.electron?.app?.setBadgeCount?.(totalBadge).catch(() => {});
    return () => {
      window.electron?.app?.setBadgeCount?.(0).catch(() => {});
    };
  }, [friendRequestCount, dmUnreadCount]);

  // Heartbeat for online presence — every 60 seconds. Does NOT pause when
  // hidden — heartbeat is the source of "user is online" truth and must
  // fire even with the window minimized.
  usePoll(
    'heartbeat',
    async () => {
      if (!closerInfo.b2cUserId) return;
      await sendHeartbeat(closerInfo.b2cUserId);
    },
    60_000,
    { enabled: !!closerInfo.b2cUserId, pauseWhenHidden: false },
  );

  // Online user IDs — every 30 seconds; pauses when hidden.
  usePoll(
    'onlineUsers',
    async () => {
      const ids = await getOnlineUserIds();
      setOnlineUserIds(new Set(ids));
    },
    30_000,
  );

  const handleNavigateToMessage = useCallback((recipientId: string, recipientName: string, recipientPhotoUrl: string | null) => {
    setDmRecipient({ id: recipientId, name: recipientName, photoUrl: recipientPhotoUrl });
    setShowMessages(true);
  }, []);

  const handleDmRecipientConsumed = useCallback(() => {
    setDmRecipient(null);
  }, []);

  // Theme sync to floating windows is now handled by ThemeContext.tsx

  // Bot polling — every 10s (bumped from 3s; see BOT_POLL_INTERVAL).
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
    // Guard: if there's no active call, there's nothing to end — do not open a
    // post-call form with an empty callId (would produce a broken questionnaire).
    if (!activeCall?.callId) {
      console.warn('[MeetingBotHub] handleEndCall invoked with no activeCall — skipping.');
      return;
    }
    const callId = activeCall.callId;
    const prospectName = activeCall.prospectName || undefined;
    // 1. Write to Convex FIRST — prevents poll from seeing this call as active
    await endCallManually(closerInfo.closerId);
    // 2. Tell the main process the call ended (clears its call context)
    window.electron?.bot?.callEnded({ callId, closerId: closerInfo.closerId });
    // 3. Open the in-app post-call form for THIS call
    setPostCallForm({ callId, prospectName });
    // 4. Clear local state
    setActiveCall(null);
    activeCallStartRef.current = null;
    previousCallRef.current = null;
    setCallEndedPending(null);
  }, [activeCall, closerInfo]);

  // Soft prompt "Fill Out Form" — opens the in-app form
  const handleGoToPostCallForm = useCallback(() => {
    if (callEndedPending?.callId) {
      setPostCallForm({
        callId: callEndedPending.callId,
        prospectName: callEndedPending.prospectName,
      });
    }
    setCallEndedPending(null);
  }, [callEndedPending]);

  // Open the in-app post-call form (used by "Fill Out Now" banner in CallHistoryView)
  const handleOpenQuestionnaire = useCallback((callId: string, prospectName?: string) => {
    if (!callId) {
      console.warn('[MeetingBotHub] handleOpenQuestionnaire invoked with empty callId — skipping.');
      return;
    }
    setPostCallForm({ callId, prospectName });
  }, []);

  // Form closed — refresh the Calls badge right away when an outcome was saved
  const handlePostCallFormClose = useCallback((submitted: boolean) => {
    setPostCallForm(null);
    if (submitted) {
      getPendingDispositions(closerInfo.closerId).then((info) => {
        setCallsPendingCount(info.count);
      });
    }
  }, [closerInfo.closerId]);

  // Routes the deep-link target from an adoption-checklist task CTA.
  // Tabs: switch active sidebar tab. Modals: open the relevant modal.
  // Subviews: switch tab AND set a hash param the destination tab reads.
  function handleAdoptionCta(target: CtaTarget) {
    if (target.kind === 'tab') {
      setSelectedItem(target.tabId as SidebarItem);
      window.location.hash = `#tab=${target.tabId}&setup=${tabIdToTaskId(target.tabId)}`;
    } else if (target.kind === 'subview') {
      setSelectedItem(target.tabId as SidebarItem);
      window.location.hash = `#tab=${target.tabId}&subview=${target.subview}&setup=${tabIdToTaskId(target.subview)}`;
    } else if (target.kind === 'modal') {
      if (target.modalId === 'quickBot') {
        window.location.hash = '#setup=firstCall';
        setShowQuickBot(true);
      } else if (target.modalId === 'stream') {
        window.location.hash = '#setup=stream';
        setShowStream(true);
      }
    }
  }

  // Maps a tabId or subview to its corresponding setup task id, so the
  // destination view can read `?setup=<taskId>` and render the correct banner.
  function tabIdToTaskId(idOrSubview: string): string {
    if (idOrSubview === 'profile') return 'profile';
    if (idOrSubview === 'calls') return 'highlightClip';
    if (idOrSubview === 'coaching') return 'coachingCall';
    return idOrSubview;
  }

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

      {/* Sequ3nce Stream modal */}
      {showStream && (
        <StreamModal
          closerInfo={closerInfo}
          onClose={() => setShowStream(false)}
          streamEnabled={streamEnabled}
          onStreamEnabledChange={setStreamEnabled}
        />
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
          {NAV_ITEMS.filter((item) => (item.id !== 'contentreview' || isFounder) && (item.id !== 'notifications' || isFounder) && (item.id !== 'verification-review' || isFounder)).map((item) => {
            const badgeCounts: Partial<Record<SidebarItem, number>> = {
              calls: callsPendingCount,
              community: friendRequestCount + moneyBellsUnreadCount,
              messages: dmUnreadCount,
              contentreview: contentPendingCount,
              notifications: teamNotificationUnreadCount,
              'verification-review': verificationPendingCount,
            };
            const badge = badgeCounts[item.id] ?? 0;
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

        {/* Bottom utility bar: Theme toggle + Rewards */}
        <div className="px-3 py-3 border-t border-gray-200 flex items-center justify-between">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-200/70 transition-colors"
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>
          {/* Rewards button */}
          <button
            onClick={() => setSelectedItem('submissions')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              selectedItem === 'submissions'
                ? 'bg-black text-white'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/70'
            }`}
            title="Rewards"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1 0 9.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1 1 14.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
            Rewards
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Draggable titlebar region across content with Messages + Quick Bot buttons */}
        <div className="titlebar h-14 border-b border-gray-100 flex items-center justify-end px-5 gap-2">
          {/* Adoption Checklist button — phase-driven Get Started / Earn */}
          <AdoptionChecklistButton
            userId={closerInfo.b2cUserId}
            onCta={handleAdoptionCta}
          />
          {/* Messages button */}
          <button
            onClick={() => setShowMessages(!showMessages)}
            className="no-drag relative flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Messages"
          >
            <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
              <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
            </svg>
            {dmUnreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center text-[9px] font-bold rounded-full bg-red-500 text-white px-1">
                {dmUnreadCount > 99 ? '99+' : dmUnreadCount}
              </span>
            )}
          </button>
          {/* Sequ3nce Stream button (dictation) */}
          <button
            onClick={() => setShowStream(true)}
            className="no-drag flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
            title="Sequ3nce Stream — hold-to-talk dictation"
          >
            {/* Status dot */}
            <span className={`w-2 h-2 rounded-full shrink-0 ${streamEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
            {/* Waveform icon */}
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke={streamEnabled ? '#10b981' : '#9ca3af'} strokeWidth={2} strokeLinecap="round">
              <line x1="4" y1="8" x2="4" y2="16" />
              <line x1="7.5" y1="5" x2="7.5" y2="19" />
              <line x1="11" y1="3" x2="11" y2="21" />
              <line x1="14.5" y1="6" x2="14.5" y2="18" />
              <line x1="18" y1="9" x2="18" y2="15" />
              <line x1="21" y1="10" x2="21" y2="14" />
            </svg>
            Sequ3nce Stream
          </button>
          {/* Quick Bot button */}
          <button onClick={() => setShowQuickBot(true)}
            className="no-drag flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-white bg-black rounded-lg hover:bg-gray-800 transition-colors">
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
            <button
              onClick={handleEndCall}
              className="text-xs font-medium bg-white text-green-700 hover:bg-green-50 px-3 py-1 rounded-md transition-colors"
            >
              End Call
            </button>
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
          {renderContent(selectedItem, closerInfo, setSelectedItem, onLogout, handleOpenQuestionnaire, {
            dmRecipientId: dmRecipient?.id ?? null,
            dmRecipientName: dmRecipient?.name,
            dmRecipientPhotoUrl: dmRecipient?.photoUrl,
            onDmRecipientConsumed: handleDmRecipientConsumed,
            onlineUserIds,
            onNavigateToMessage: handleNavigateToMessage,
          })}
        </div>

        {/* In-app post-call form (bottom sheet) */}
        {postCallForm && (
          <PostCallFormView
            callId={postCallForm.callId}
            prospectName={postCallForm.prospectName}
            closerInfo={closerInfo}
            onClose={handlePostCallFormClose}
          />
        )}

        {/* Messages slide-out panel */}
        {showMessages && (
          <>
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/20 z-40"
              onClick={() => setShowMessages(false)}
            />
            {/* Panel */}
            <div className="absolute top-0 right-0 h-full w-[700px] bg-white dark:bg-zinc-900 shadow-2xl z-50 flex flex-col border-l border-gray-200 dark:border-zinc-700">
              {/* Close button overlaid on top-right */}
              <button
                onClick={() => setShowMessages(false)}
                className="absolute top-3 right-3 z-10 flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {/* DM view */}
              <div className="flex-1 overflow-hidden">
                <DirectMessagesView
                  closerInfo={closerInfo}
                  initialRecipientId={dmRecipient?.id ?? null}
                  initialRecipientName={dmRecipient?.name}
                  initialRecipientPhotoUrl={dmRecipient?.photoUrl}
                  onRecipientConsumed={handleDmRecipientConsumed}
                  onlineUserIds={onlineUserIds}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Floating coaching-call layer — renders full overlay or PiP mini
          when a session is active. Lives at hub level so it survives tab
          navigation (the Daily callObject stays alive). */}
      <CoachingCallLayerMount currentUserId={closerInfo.b2cUserId || ''} />
    </div>
  );
}

// Route sidebar selection to the correct view component
interface RenderContentExtras {
  dmRecipientId: string | null;
  dmRecipientName?: string;
  dmRecipientPhotoUrl?: string | null;
  onDmRecipientConsumed: () => void;
  onlineUserIds: Set<string>;
  onNavigateToMessage: (recipientId: string, recipientName: string, recipientPhotoUrl: string | null) => void;
}

function renderContent(
  item: SidebarItem,
  closerInfo: CloserInfo,
  onNavigate: (item: SidebarItem) => void,
  onLogout: () => void,
  onOpenQuestionnaire?: (callId: string, prospectName?: string) => void,
  extras?: RenderContentExtras,
): React.ReactNode {
  switch (item) {
    case 'dashboard':
      return <DashboardView closerInfo={closerInfo} onNavigate={(id) => onNavigate(id as SidebarItem)} />;
    case 'stats':
      return <StatsView closerInfo={closerInfo} />;
    case 'calls':
      return <CallHistoryView closerInfo={closerInfo} onOpenQuestionnaire={onOpenQuestionnaire} />;
    case 'highlights':
      return <HighlightsView closerInfo={closerInfo} />;
    case 'submissions':
      return <ContentSubmissionsView closerInfo={closerInfo} />;
    case 'contentreview':
      return <ContentReviewView closerInfo={closerInfo} />;
    case 'schedule':
      return <ScheduleView closerInfo={closerInfo} />;
    case 'resources':
      return <ResourcesView closerInfo={closerInfo} />;
    case 'settings':
      return <SettingsView closerInfo={closerInfo} onLogout={onLogout} />;
    case 'profile':
      return <ProfileView closerInfo={closerInfo} />;
    case 'community':
      return <CommunityView closerInfo={closerInfo} onNavigateToMessage={extras?.onNavigateToMessage} />;
    case 'jobboard':
      return <JobBoardView closerInfo={closerInfo} />;
    case 'messages':
      return (
        <DirectMessagesView
          closerInfo={closerInfo}
          initialRecipientId={extras?.dmRecipientId}
          initialRecipientName={extras?.dmRecipientName}
          initialRecipientPhotoUrl={extras?.dmRecipientPhotoUrl}
          onRecipientConsumed={extras?.onDmRecipientConsumed}
          onlineUserIds={extras?.onlineUserIds}
        />
      );
    case 'notifications':
      return <NotificationsView closerInfo={closerInfo} />;
    case 'verification-review':
      return <StatsVerificationReviewView closerInfo={closerInfo} />;
    default:
      return <PlaceholderView name={NAV_ITEMS.find((i) => i.id === item)?.label || item} />;
  }
}

// Thin wrapper — reads the coaching-session context and passes an onLeave
// that clears the active session (which unmounts CoachingCallLayer and tears
// down the Daily callObject cleanly).
function CoachingCallLayerMount({ currentUserId }: { currentUserId: string }) {
  const { setActiveSession } = useCoachingSession();
  return <CoachingCallLayer currentUserId={currentUserId} onLeave={() => setActiveSession(null)} />;
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
