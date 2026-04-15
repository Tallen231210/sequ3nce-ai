import React, { useState, useEffect, useRef } from 'react';
import type { CloserInfo } from '../convex';
import { getCommunityChannels, getPendingFriendRequestCount, getUnreadChannels, markChannelRead } from '../convex';
import type { CommunityChannel } from './community/types';
import { ChannelSidebar } from './community/ChannelSidebar';
import { CommunityHeader } from './community/CommunityHeader';
import { MembersPanel } from './community/MembersPanel';
import { Feed } from './community/Feed';
import { ChannelPostList } from './community/ChannelPostList';
import { Training } from './community/Training';
import { WelcomeBanner } from './community/WelcomeBanner';
import { PostSearch } from './community/PostSearch';
import { CallOfTheWeekView } from './community/CallOfTheWeekView';
import { FeatureRequestsView } from './community/FeatureRequestsView';
import { BugReportView } from './community/BugReportView';

interface CommunityViewProps {
  closerInfo: CloserInfo;
  onNavigateToMessage?: (recipientId: string, recipientName: string, recipientPhotoUrl: string | null) => void;
}

const REQUEST_COUNT_POLL = 30_000;
const UNREAD_POLL_INTERVAL = 15_000;
const SPECIAL_VIEWS = new Set(['feed', 'training', 'call-of-the-week', 'wins', 'feature-requests', 'bug-report']);

export function CommunityView({ closerInfo, onNavigateToMessage }: CommunityViewProps) {
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [selectedView, setSelectedView] = useState<string>('feed');
  const [showPanel, setShowPanel] = useState(false);
  const [panelMode, setPanelMode] = useState<'members' | 'friends'>('members');
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [unreadChannelIds, setUnreadChannelIds] = useState<Set<string>>(new Set());
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
    if (selectedView === 'call-of-the-week') return { title: 'Call of the Week', description: 'Weekly contest — vote for the best call' };
    if (selectedView === 'wins') return { title: 'Wins', description: 'Celebrate your closes and milestones' };
    if (selectedView === 'feature-requests') return { title: 'Feature Requests', description: 'Vote on what we build next' };
    if (selectedView === 'bug-report') return { title: 'Report a Bug', description: 'Help us improve by reporting issues' };
    if (selectedView === 'training') return { title: 'Training', description: 'Courses and modules' };
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
          ) : loadingChannels && selectedView !== 'training' ? (
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
              {selectedView === 'call-of-the-week' && (
                <CallOfTheWeekView closerInfo={closerInfo} />
              )}
              {selectedView === 'wins' && (() => {
                const winsChannel = channels.find(c => c.slug === 'wins');
                return winsChannel ? (
                  <ChannelPostList
                    channelId={winsChannel._id}
                    userId={userId}
                    isAdmin={isAdmin}
                    onNavigateToMessage={onNavigateToMessage}
                  />
                ) : (
                  <div className="p-8 text-center text-gray-500 text-[13px]">Wins channel loading...</div>
                );
              })()}
              {selectedView === 'feature-requests' && (
                <FeatureRequestsView closerInfo={closerInfo} />
              )}
              {selectedView === 'bug-report' && (
                <BugReportView closerInfo={closerInfo} />
              )}
              {selectedView === 'training' && <Training />}
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
