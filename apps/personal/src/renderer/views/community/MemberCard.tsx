import React from 'react';
import type { CommunityMember } from './types';
import type { FriendshipStatus } from '../../convex';
import { getInitials, getAvatarGradient } from './types';

interface MemberCardProps {
  member: CommunityMember;
  isCurrentUser?: boolean;
  friendshipStatus?: FriendshipStatus;
  onMessage?: (userId: string, name: string, photoUrl: string | null) => void;
  onAddFriend?: (userId: string) => void;
  onAcceptFriend?: (userId: string) => void;
}

export function MemberCard({ member, isCurrentUser, friendshipStatus, onMessage, onAddFriend, onAcceptFriend }: MemberCardProps) {
  const initials = getInitials(member.name);
  const gradient = getAvatarGradient(member.name);

  return (
    <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl p-4 flex flex-col items-center text-center hover:shadow-md transition-shadow">
      {/* Avatar */}
      {member.photoUrl ? (
        <img
          src={member.photoUrl}
          alt={member.name}
          className="w-14 h-14 rounded-full object-cover mb-3"
        />
      ) : (
        <div
          className={`w-14 h-14 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold text-lg mb-3`}
        >
          {initials}
        </div>
      )}

      {/* Name */}
      <div className="font-semibold text-gray-900 dark:text-white text-sm truncate w-full">
        {member.name}
      </div>

      {/* Headline */}
      {member.headline && (
        <div className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5 truncate w-full">
          {member.headline}
        </div>
      )}

      {/* Location */}
      {member.location && (
        <div className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5 truncate w-full">
          {member.location}
        </div>
      )}

      {/* Industries */}
      {member.industries.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1 mt-2">
          {member.industries.slice(0, 2).map((ind) => (
            <span
              key={ind}
              className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 rounded-full"
            >
              {ind}
            </span>
          ))}
        </div>
      )}

      {/* Action buttons — hidden for own card */}
      {!isCurrentUser && (
        <div className="flex gap-2 mt-3 w-full">
          {/* Message button */}
          {onMessage && (
            <button
              onClick={() => onMessage(member.userId, member.name, member.photoUrl)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-zinc-200 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
              </svg>
              Message
            </button>
          )}

          {/* Friend status button */}
          {friendshipStatus === 'none' && onAddFriend && (
            <button
              onClick={() => onAddFriend(member.userId)}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity"
              title="Add Friend"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
              </svg>
              Add
            </button>
          )}
          {friendshipStatus === 'pending_sent' && (
            <span className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-400 dark:text-zinc-500">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Requested
            </span>
          )}
          {friendshipStatus === 'pending_received' && onAcceptFriend && (
            <button
              onClick={() => onAcceptFriend(member.userId)}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Accept
            </button>
          )}
          {friendshipStatus === 'accepted' && (
            <span className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-600 dark:text-green-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
              Friends
            </span>
          )}
        </div>
      )}
    </div>
  );
}
