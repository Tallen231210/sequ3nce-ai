import React, { useState, useEffect, useRef } from 'react';
import type { CloserInfo } from '../convex';
import { getCommunityChannels } from '../convex';
import type { CommunityChannel } from './community/types';
import { Feed } from './community/Feed';
import { Channels } from './community/Channels';
import { Members } from './community/Members';
import { Training } from './community/Training';

type CommunityTab = 'feed' | 'channels' | 'training' | 'members';

interface CommunityViewProps {
  closerInfo: CloserInfo;
  onStartDM?: (userId: string, name: string, photoUrl: string | null) => void;
}

const TABS: { id: CommunityTab; label: string }[] = [
  { id: 'feed', label: 'Feed' },
  { id: 'channels', label: 'Channels' },
  { id: 'training', label: 'Training' },
  { id: 'members', label: 'Members' },
];

export function CommunityView({ closerInfo, onStartDM }: CommunityViewProps) {
  const [activeTab, setActiveTab] = useState<CommunityTab>('feed');
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadChannels();
    return () => { mountedRef.current = false; };
  }, []);

  const loadChannels = async () => {
    const result = await getCommunityChannels();
    if (mountedRef.current) {
      setChannels(result);
      setLoadingChannels(false);
    }
  };

  const userId = closerInfo.b2cUserId || '';

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
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loadingChannels && activeTab !== 'members' && activeTab !== 'training' ? (
        <div className="text-sm text-gray-400 dark:text-zinc-500 text-center py-8">
          Loading community...
        </div>
      ) : (
        <>
          {activeTab === 'feed' && <Feed userId={userId} channels={channels} onMessageAuthor={onStartDM} />}
          {activeTab === 'channels' && <Channels userId={userId} channels={channels} onMessageAuthor={onStartDM} />}
          {activeTab === 'training' && <Training />}
          {activeTab === 'members' && <Members currentUserId={userId} onStartDM={onStartDM} />}
        </>
      )}
    </div>
  );
}
