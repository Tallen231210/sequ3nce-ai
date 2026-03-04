import React, { useState, useEffect, useRef } from 'react';
import type { CloserInfo } from '../convex';
import { getCommunityChannels, getPendingFriendRequestCount } from '../convex';
import type { CommunityChannel } from './community/types';
import { Feed } from './community/Feed';
import { Channels } from './community/Channels';
import { Members } from './community/Members';
import { Training } from './community/Training';
import { Friends } from './community/Friends';

type CommunityTab = 'feed' | 'channels' | 'training' | 'members' | 'friends';

interface CommunityViewProps {
  closerInfo: CloserInfo;
  onStartDM?: (userId: string, name: string, photoUrl: string | null) => void;
}

const TABS: { id: CommunityTab; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'channels', label: 'Channels' },
  { id: 'training', label: 'Training' },
  { id: 'members', label: 'Members' },
  { id: 'friends', label: 'Friends' },
];

const REQUEST_COUNT_POLL = 30_000;

export function CommunityView({ closerInfo, onStartDM }: CommunityViewProps) {
  const [activeTab, setActiveTab] = useState<CommunityTab>('feed');
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const mountedRef = useRef(true);

  const userId = closerInfo.b2cUserId || '';
  const isAdmin = closerInfo.role === 'admin';

  useEffect(() => {
    mountedRef.current = true;
    loadChannels();
    if (userId) loadRequestCount();
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Community</h1>
        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
          Connect with other closers
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              // Refresh count when leaving friends tab
              if (tab.id !== 'friends' && activeTab === 'friends' && userId) {
                loadRequestCount();
              }
            }}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
            }`}
          >
            {tab.label}
            {tab.id === 'friends' && pendingRequestCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">
                {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loadingChannels && activeTab !== 'members' && activeTab !== 'training' && activeTab !== 'friends' ? (
        <div className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">
          Loading community...
        </div>
      ) : (
        <>
          {activeTab === 'feed' && <Feed userId={userId} channels={channels} isAdmin={isAdmin} onMessageAuthor={onStartDM} />}
          {activeTab === 'channels' && <Channels userId={userId} channels={channels} isAdmin={isAdmin} onMessageAuthor={onStartDM} />}
          {activeTab === 'training' && <Training />}
          {activeTab === 'members' && <Members currentUserId={userId} onStartDM={onStartDM} />}
          {activeTab === 'friends' && <Friends userId={userId} onStartDM={onStartDM} />}
        </>
      )}
    </div>
  );
}
