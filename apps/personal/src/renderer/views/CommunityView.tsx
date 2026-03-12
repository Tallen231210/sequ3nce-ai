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

interface CommunityViewProps {
  closerInfo: CloserInfo;
  onStartDM?: (userId: string, name: string, photoUrl: string | null) => void;
}

const REQUEST_COUNT_POLL = 30_000;
const UNREAD_POLL_INTERVAL = 15_000;

export function CommunityView({ closerInfo, onStartDM }: CommunityViewProps) {
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

  // Determine if the selected view is a channel ID
  const isChannelView = selectedView !== 'feed' && selectedView !== 'training';

  // Build header title + description
  const getHeaderInfo = () => {
    if (selectedView === 'feed') return { title: 'Feed', description: 'All posts across channels' };
    if (selectedView === 'training') return { title: 'Training', description: 'Courses and modules' };
    const channel = channels.find((c) => c._id === selectedView);
    if (channel) return { title: `# ${channel.slug}`, description: channel.description };
    return { title: 'Community' };
  };

  const headerInfo = getHeaderInfo();

  const handleSelectView = (view: string) => {
    setSelectedView(view);
    setShowSearch(false);
    // Mark channel as read when selecting it
    const isChannel = view !== 'feed' && view !== 'training';
    if (isChannel && userId) {
      markChannelRead(userId, view);
      setUnreadChannelIds((prev) => {
        const next = new Set(prev);
        next.delete(view);
        return next;
      });
    }
  };

  const handleToggleMembers = () => {
    if (showPanel && panelMode === 'members') {
      setShowPanel(false);
    } else {
      setPanelMode('members');
      setShowPanel(true);
    }
  };

  const handleToggleFriends = () => {
    if (showPanel && panelMode === 'friends') {
      setShowPanel(false);
    } else {
      setPanelMode('friends');
      setShowPanel(true);
    }
  };

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
              onMessageAuthor={onStartDM}
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
                <Feed userId={userId} channels={channels} isAdmin={isAdmin} onMessageAuthor={onStartDM} />
              )}
              {selectedView === 'training' && <Training />}
              {isChannelView && (
                <ChannelPostList
                  channelId={selectedView}
                  userId={userId}
                  channels={channels}
                  isAdmin={isAdmin}
                  onMessageAuthor={onStartDM}
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
          onStartDM={onStartDM}
          onClose={() => setShowPanel(false)}
        />
      )}
    </div>
  );
}
