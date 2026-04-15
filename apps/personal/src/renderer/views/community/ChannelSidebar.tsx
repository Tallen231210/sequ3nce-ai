import React from 'react';
import type { CommunityChannel } from './types';

interface ChannelSidebarProps {
  channels: CommunityChannel[];
  selectedView: string; // 'feed' | channelId | 'training'
  onSelect: (view: string) => void;
  unreadChannelIds: Set<string>;
  pendingRequestCount: number;
  onToggleMembers: () => void;
  onToggleFriends: () => void;
}

function navButtonClass(isActive: boolean): string {
  if (isActive) {
    return 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold';
  }
  return 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800';
}

export function ChannelSidebar({
  channels,
  selectedView,
  onSelect,
  unreadChannelIds,
  pendingRequestCount,
  onToggleMembers,
  onToggleFriends,
}: ChannelSidebarProps) {
  return (
    <div className="w-[220px] flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
      {/* Feed entry */}
      <div className="px-2 pt-3 pb-1">
        <button
          onClick={() => onSelect('feed')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${navButtonClass(selectedView === 'feed')}`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          Feed
        </button>
      </div>

      {/* Call of the Week */}
      <div className="px-2 pb-1">
        <button
          onClick={() => onSelect('call-of-the-week')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${navButtonClass(selectedView === 'call-of-the-week')}`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-4.5A3.375 3.375 0 0 0 13.125 10.875h-2.25A3.375 3.375 0 0 0 7.5 14.25v4.5m9 0H7.5M12 3.75l2.25 3h-4.5L12 3.75Z" />
          </svg>
          Call of the Week
        </button>
      </div>

      {/* Wins */}
      <div className="px-2 pb-1">
        <button
          onClick={() => onSelect('wins')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${navButtonClass(selectedView === 'wins')}`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
          </svg>
          Wins
        </button>
      </div>

      {/* Feature Requests */}
      <div className="px-2 pb-1">
        <button
          onClick={() => onSelect('feature-requests')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${navButtonClass(selectedView === 'feature-requests')}`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          Feature Requests
        </button>
      </div>

      {/* Report a Bug */}
      <div className="px-2 pb-1">
        <button
          onClick={() => onSelect('bug-report')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${navButtonClass(selectedView === 'bug-report')}`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152-6.135c-.22-2.595-2.112-4.555-4.555-4.555h-5c-2.443 0-4.335 1.96-4.555 4.555a23.91 23.91 0 0 1-1.152 6.135c2.56-.932 5.324-1.44 8.207-1.44ZM9.75 9.75h4.5" />
          </svg>
          Report a Bug
        </button>
      </div>

      {/* Separator */}
      <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-700" />

      {/* Channels label */}
      <div className="px-4 pt-2 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Channels
        </span>
      </div>

      {/* Channel list (filter out "wins" since it has its own sidebar button) */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {channels.filter((ch) => ch.slug !== 'wins').map((ch) => {
          const isActive = selectedView === ch._id;
          const isUnread = unreadChannelIds.has(ch._id);
          return (
            <button
              key={ch._id}
              onClick={() => onSelect(ch._id)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold'
                  : isUnread
                    ? 'text-gray-900 dark:text-white font-semibold hover:bg-gray-100 dark:hover:bg-gray-800'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {isUnread && !isActive && (
                <span className="w-2 h-2 bg-gray-600 dark:bg-gray-400 rounded-full flex-shrink-0" />
              )}
              <span className="truncate">
                <span className="text-gray-400 dark:text-gray-500 mr-0.5">#</span>
                {ch.slug}
              </span>
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-700" />

      {/* Training entry */}
      <div className="px-2 pb-1">
        <button
          onClick={() => onSelect('training')}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${navButtonClass(selectedView === 'training')}`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
          </svg>
          Training
        </button>
      </div>

      {/* Bottom section: Members + Friends */}
      <div className="px-2 pb-3 pt-1 border-t border-gray-100 dark:border-gray-700 mt-1">
        <div className="flex gap-1">
          <button
            onClick={onToggleMembers}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            Members
          </button>
          <button
            onClick={onToggleFriends}
            className="relative flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
            Friends
            {pendingRequestCount > 0 && (
              <span className="absolute -top-0.5 right-0 min-w-[16px] h-[16px] flex items-center justify-center px-1 text-[9px] font-bold bg-gray-600 dark:bg-gray-400 text-white rounded-full">
                {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
