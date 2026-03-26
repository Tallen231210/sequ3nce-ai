import React from 'react';
import type { CommunityMember } from './types';
import type { FriendshipStatus } from '../../convex';
import { getInitials, getAvatarGradient } from './types';
import { ChatBubbleIcon } from './icons';

interface MemberCardProps {
  member: CommunityMember;
  isCurrentUser?: boolean;
  friendshipStatus?: FriendshipStatus;
  onAddFriend?: (userId: string) => void;
  onAcceptFriend?: (userId: string) => void;
  onMessage?: () => void;
}

export function MemberCard({ member, isCurrentUser, friendshipStatus, onAddFriend, onAcceptFriend, onMessage }: MemberCardProps) {
  const initials = getInitials(member.name);
  const gradient = getAvatarGradient(member.name);

  return (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
      {/* Avatar */}
      {member.photoUrl ? (
        <img
          src={member.photoUrl}
          alt={member.name}
          className="w-8 h-8 rounded-full object-cover shrink-0"
        />
      ) : (
        <div
          className={`w-8 h-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-xs shrink-0`}
        >
          {initials}
        </div>
      )}

      {/* Name + headline */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white truncate">
          <span className="truncate">{member.name}</span>
          {member.badges?.includes('founder') && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50 shrink-0">
              <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
              Founder
            </span>
          )}
          {member.badges?.includes('pioneer1') && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-200 dark:border-blue-700/50 shrink-0">
              <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" /></svg>
              Pioneer #1
            </span>
          )}
        </div>
        {member.headline && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {member.headline}
          </div>
        )}
      </div>

      {/* Actions */}
      {!isCurrentUser && (
        <div className="flex items-center gap-1 shrink-0">
          {onMessage && (
            <button
              onClick={onMessage}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="Send message"
            >
              <ChatBubbleIcon />
            </button>
          )}
          {friendshipStatus === 'none' && onAddFriend && (
            <button
              onClick={() => onAddFriend(member.userId)}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
              title="Add Friend"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
              </svg>
            </button>
          )}
          {friendshipStatus === 'pending_sent' && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1.5">Requested</span>
          )}
          {friendshipStatus === 'pending_received' && onAcceptFriend && (
            <button
              onClick={() => onAcceptFriend(member.userId)}
              className="px-2 py-1 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-md hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
            >
              Accept
            </button>
          )}
          {friendshipStatus === 'accepted' && (
            <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          )}
        </div>
      )}
    </div>
  );
}
