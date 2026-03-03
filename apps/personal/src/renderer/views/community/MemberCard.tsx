import React from 'react';
import type { CommunityMember } from './types';
import { getInitials, getAvatarGradient } from './types';

interface MemberCardProps {
  member: CommunityMember;
  isCurrentUser?: boolean;
  onMessage?: (userId: string, name: string, photoUrl: string | null) => void;
}

export function MemberCard({ member, isCurrentUser, onMessage }: MemberCardProps) {
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

      {/* Message button — hidden for own card */}
      {!isCurrentUser && onMessage && (
        <button
          onClick={() => onMessage(member.userId, member.name, member.photoUrl)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-zinc-200 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-600 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
            <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
          </svg>
          Message
        </button>
      )}
    </div>
  );
}
