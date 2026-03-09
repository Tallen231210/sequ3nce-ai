import React from 'react';
import { Members } from './Members';
import { Friends } from './Friends';

interface MembersPanelProps {
  mode: 'members' | 'friends';
  onModeChange: (mode: 'members' | 'friends') => void;
  currentUserId: string;
  onStartDM?: (userId: string, name: string, photoUrl: string | null) => void;
  onClose: () => void;
}

export function MembersPanel({
  mode,
  onModeChange,
  currentUserId,
  onStartDM,
  onClose,
}: MembersPanelProps) {
  return (
    <div className="w-[280px] flex-shrink-0 border-l border-gray-200 dark:border-zinc-700 flex flex-col h-full bg-white dark:bg-zinc-900">
      {/* Header with tabs and close button */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex gap-1 bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
          <button
            onClick={() => onModeChange('members')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'members'
                ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
            }`}
          >
            Members
          </button>
          <button
            onClick={() => onModeChange('friends')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'friends'
                ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200'
            }`}
          >
            Friends
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          title="Close panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {mode === 'members' ? (
          <Members currentUserId={currentUserId} onStartDM={onStartDM} />
        ) : (
          <Friends userId={currentUserId} onStartDM={onStartDM} />
        )}
      </div>
    </div>
  );
}
