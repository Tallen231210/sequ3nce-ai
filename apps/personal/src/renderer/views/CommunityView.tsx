import React, { useState, useEffect, useRef } from 'react';
import type { CloserInfo } from '../convex';
import { getCommunityChannels, getMoneyBellsUnreadCount, getPendingFriendRequestCount, getUnreadChannels, markChannelRead } from '../convex';
import type { CommunityChannel } from './community/types';
import { ChannelSidebar } from './community/ChannelSidebar';
import { CommunityHeader } from './community/CommunityHeader';
import { MembersPanel } from './community/MembersPanel';
import { Feed } from './community/Feed';
import { ChannelPostList } from './community/ChannelPostList';
import { Training } from './community/Training';
import { ClassroomView } from './community/classroom/ClassroomView';
import { WelcomeBanner } from './community/WelcomeBanner';
import { PostSearch } from './community/PostSearch';
import { CallOfTheWeekView } from './community/CallOfTheWeekView';
import { FeatureRequestsView } from './community/FeatureRequestsView';
import { BugReportView } from './community/BugReportView';
import { MoneyBellsView } from './community/moneyBells/MoneyBellsView';
import { CoachingView } from './community/coaching/CoachingView';

interface CommunityViewProps {
  closerInfo: CloserInfo;
  onNavigateToMessage?: (recipientId: string, recipientName: string, recipientPhotoUrl: string | null) => void;
}

const REQUEST_COUNT_POLL = 30_000;
const UNREAD_POLL_INTERVAL = 15_000;
const MONEY_BELLS_UNREAD_POLL = 20_000;
const MONEY_BELLS_LAST_VIEWED_KEY = 'sequ3nce_money_bells_last_viewed';
const SPECIAL_VIEWS = new Set(['feed', 'training', 'classroom', 'call-of-the-week', 'feature-requests', 'bug-report', 'money-bells', 'coaching']);

function readMoneyBellsLastViewed(): number {
  try {
    const raw = localStorage.getItem(MONEY_BELLS_LAST_VIEWED_KEY);
    if (!raw) {
      // First-time user: seed with current time so they don't see an overwhelming initial count.
      const now = Date.now();
      localStorage.setItem(MONEY_BELLS_LAST_VIEWED_KEY, String(now));
      return now;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : Date.now();
  } catch {
    return Date.now();
  }
}

function writeMoneyBellsLastViewed(ts: number): void {
  try {
    localStorage.setItem(MONEY_BELLS_LAST_VIEWED_KEY, String(ts));
  } catch {
    // Ignore — quota/private mode; badge will poll again soon.
  }
}

export function CommunityView({ closerInfo, onNavigateToMessage }: CommunityViewProps) {
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [selectedView, setSelectedView] = useState<string>('feed');
  const [showPanel, setShowPanel] = useState(false);
  const [panelMode, setPanelMode] = useState<'members' | 'friends'>('members');
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [unreadChannelIds, setUnreadChannelIds] = useState<Set<string>>(new Set());
  const [moneyBellsUnread, setMoneyBellsUnread] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const mountedRef = useRef(true);

  const userId = closerInfo.b2cUserId || '';
  const isAdmin = closerInfo.role === 'admin';

  useEffect(() => {
    mountedRef.current = true;
    loadChannels();
    if (userId) {
      loadRequestCount();
      loadUnreadChannels();
    }
    return () => { mountedRef.current = false; };
  }, []);

  // Honor a `subview=<id>` URL hash param so deep-links from the adoption
  // checklist (e.g., the "Join coaching call" CTA) actually land on the
  // requested subview instead of the default 'feed'. Listens for hashchange
  // too so subsequent CTAs work while the user is already on Community.
  useEffect(() => {
    function applyHashSubview() {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const subview = params.get('subview');
      if (!subview) return;
      // Only honor it if it matches a known special view — channel IDs
      // (Convex doc IDs) shouldn't be deep-linkable via this path.
      if (SPECIAL_VIEWS.has(subview)) {
        setSelectedView(subview);
      }
    }
    applyHashSubview();
    window.addEventListener('hashchange', applyHashSubview);
    return () => window.removeEventListener('hashchange', applyHashSubview);
  }, []);

  // Poll for pending friend request count
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(async () => {
      if (!mountedRef.current) return;
      const count = await getPendingFriendRequestCount(userId);
      if (mountedRef.current) setPendingRequestCount(count);
    }, REQUEST_COUNT_POLL);
    return () => clearInterval(interval);
  }, [userId]);

  // Poll for unread channels
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => {
      if (mountedRef.current) loadUnreadChannels();
    }, UNREAD_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [userId]);

  // Poll for Money Bells unread (new broadcasts by others since last visit).
  // When the user is viewing Money Bells, we keep the badge at 0.
  useEffect(() => {
    if (!userId) return;
    const tick = async () => {
      if (!mountedRef.current) return;
      if (selectedView === 'money-bells') {
        setMoneyBellsUnread(0);
        return;
      }
      const since = readMoneyBellsLastViewed();
      const result = await getMoneyBellsUnreadCount(userId, since);
      if (!mountedRef.current) return;
      if ('count' in result) setMoneyBellsUnread(result.count);
    };
    void tick();
    const interval = setInterval(tick, MONEY_BELLS_UNREAD_POLL);
    return () => clearInterval(interval);
  }, [userId, selectedView]);

  const loadChannels = async () => {
    const result = await getCommunityChannels();
    if (mountedRef.current) {
      setChannels(result);
      setLoadingChannels(false);
    }
  };

  const loadRequestCount = async () => {
    const count = await getPendingFriendRequestCount(userId);
    if (mountedRef.current) setPendingRequestCount(count);
  };

  const loadUnreadChannels = async () => {
    if (!userId) return;
    const result = await getUnreadChannels(userId);
    if (mountedRef.current) setUnreadChannelIds(new Set(result.unreadChannelIds));
  };

  const isChannelView = !SPECIAL_VIEWS.has(selectedView);

  // Build header title + description
  const getHeaderInfo = () => {
    if (selectedView === 'feed') return { title: 'Feed', description: 'All posts across channels' };
    if (selectedView === 'money-bells') return { title: 'Money Bells', description: 'Monthly cash-collected leaderboard' };
    if (selectedView === 'coaching') return { title: 'Coaching Calls', description: 'Live group sessions with Sequ3nce coaches' };
    if (selectedView === 'call-of-the-week') return { title: 'Call of the Week', description: 'Weekly contest — vote for the best call' };
    if (selectedView === 'feature-requests') return { title: 'Feature Requests', description: 'Vote on what we build next' };
    if (selectedView === 'bug-report') return { title: 'Report a Bug', description: 'Help us improve by reporting issues' };
    if (selectedView === 'training') return { title: 'Training', description: 'Courses and modules' };
    if (selectedView === 'classroom') return { title: 'Classroom', description: 'Your coach\u2019s training, replays, and community' };
    const channel = channels.find((c) => c._id === selectedView);
    if (channel) return { title: `# ${channel.slug}`, description: channel.description };
    return { title: 'Community' };
  };

  const headerInfo = getHeaderInfo();

  const handleSelectView = (view: string) => {
    setSelectedView(view);
    setShowSearch(false);
    if (!SPECIAL_VIEWS.has(view) && userId) {
      markChannelRead(userId, view);
      setUnreadChannelIds((prev) => {
        const next = new Set(prev);
        next.delete(view);
        return next;
      });
    }
    if (view === 'money-bells') {
      writeMoneyBellsLastViewed(Date.now());
      setMoneyBellsUnread(0);
    }
  };

  const handleTogglePanel = (mode: 'members' | 'friends') => {
    if (showPanel && panelMode === mode) {
      setShowPanel(false);
    } else {
      setPanelMode(mode);
      setShowPanel(true);
    }
  };

  const handleToggleMembers = () => handleTogglePanel('members');
  const handleToggleFriends = () => handleTogglePanel('friends');

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <ChannelSidebar
        channels={channels}
        selectedView={selectedView}
        onSelect={handleSelectView}
        unreadChannelIds={unreadChannelIds}
        moneyBellsUnreadCount={moneyBellsUnread}
        pendingRequestCount={pendingRequestCount}
        onToggleMembers={handleToggleMembers}
        onToggleFriends={handleToggleFriends}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <CommunityHeader
          title={headerInfo.title}
          description={headerInfo.description}
          onSearchToggle={() => setShowSearch(!showSearch)}
          onMembersToggle={handleToggleMembers}
          showPinFilter={isChannelView}
        />

        <div className="flex-1 overflow-y-auto p-6">
          {showSearch ? (
            <PostSearch
              channelId={isChannelView ? selectedView : undefined}
              userId={userId}
              isAdmin={isAdmin}
              onClose={() => setShowSearch(false)}
            />
          ) : loadingChannels && selectedView !== 'training' && selectedView !== 'classroom' ? (
            <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              Loading community...
            </div>
          ) : (
            <>
              {selectedView === 'feed' && (
                <WelcomeBanner onGoToGeneral={() => {
                  const general = channels.find(c => c.slug === 'general');
                  if (general) handleSelectView(general._id);
                }} />
              )}
              {selectedView === 'feed' && (
                <Feed userId={userId} channels={channels} isAdmin={isAdmin} />
              )}
              {selectedView === 'money-bells' && (
                <MoneyBellsView closerInfo={closerInfo} />
              )}
              {selectedView === 'coaching' && (
                <CoachingView closerInfo={closerInfo} />
              )}
              {selectedView === 'call-of-the-week' && (
                <CallOfTheWeekView closerInfo={closerInfo} />
              )}
              {selectedView === 'feature-requests' && (
                <FeatureRequestsView closerInfo={closerInfo} />
              )}
              {selectedView === 'bug-report' && (
                <BugReportView closerInfo={closerInfo} />
              )}
              {selectedView === 'training' && <Training closerInfo={closerInfo} />}
              {selectedView === 'classroom' && <ClassroomView closerInfo={closerInfo} />}
              {isChannelView && (
                <ChannelPostList
                  channelId={selectedView}
                  userId={userId}
                  channels={channels}
                  isAdmin={isAdmin}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Right panel (Members/Friends) - toggled */}
      {showPanel && (
        <MembersPanel
          mode={panelMode}
          onModeChange={setPanelMode}
          currentUserId={userId}
          onClose={() => setShowPanel(false)}
          onMessageMember={onNavigateToMessage}
        />
      )}
    </div>
  );
}
