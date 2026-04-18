import React from 'react';
import { getAvatarGradient, getInitials } from '../types';

export interface RaceLaneProps {
  rank: number;
  userId: string;
  userName: string;
  photoUrl: string | null;
  totalCash: number;
  monthlyGoal: number;
  isCurrentUser: boolean;
}

function formatCashShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) {
    const rounded = Math.round(n / 100) / 10;
    return rounded === Math.floor(rounded) ? `$${rounded}k` : `$${rounded.toFixed(1)}k`;
  }
  return `$${n.toLocaleString()}`;
}

export function MoneyBellsRaceLane({
  rank,
  userName,
  photoUrl,
  totalCash,
  monthlyGoal,
  isCurrentUser,
}: RaceLaneProps) {
  const progressPct = Math.min(98, Math.max(2, (totalCash / Math.max(monthlyGoal, 1)) * 100));
  const gradient = getAvatarGradient(userName);
  const initials = getInitials(userName);
  const isLeader = rank === 1;

  return (
    <div
      className={`relative h-7 rounded-full flex items-center border ${
        isCurrentUser
          ? 'bg-[#f3f4f6] dark:bg-[#2a2a2a] border-[#111] dark:border-white'
          : 'bg-[#f9fafb] dark:bg-[#1c1c1c] border-[#e5e7eb] dark:border-[#2f2f2f]'
      }`}
    >
      {/* Lane rank label */}
      <span
        className={`absolute left-2.5 font-mono text-[10px] font-bold tracking-wider z-10 ${
          isLeader
            ? 'bg-[#fde047] text-[#111] px-1.5 py-0.5 rounded'
            : isCurrentUser
              ? 'bg-[#111] text-white dark:bg-white dark:text-[#111] px-1.5 py-0.5 rounded'
              : 'text-gray-400 dark:text-gray-500'
        }`}
      >
        #{rank}
      </span>

      {/* Tick marks at 33% / 66% */}
      <div className="absolute top-0 bottom-0 border-l border-dashed border-[#d1d5db] dark:border-[#444]" style={{ left: '33%' }} />
      <div className="absolute top-0 bottom-0 border-l border-dashed border-[#d1d5db] dark:border-[#444]" style={{ left: '66%' }} />

      {/* Runner — positioned along the track with a transition for smooth animation */}
      <div
        className="absolute flex items-center gap-1.5 transition-all duration-700 ease-out"
        style={{ left: `${progressPct}%`, transform: 'translateX(-50%)' }}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={userName}
            className={`w-5 h-5 rounded-full flex-shrink-0 object-cover border-2 shadow-sm ${
              isLeader
                ? 'border-[#fde047]'
                : isCurrentUser
                  ? 'border-gray-900 dark:border-white'
                  : 'border-white dark:border-gray-900'
            }`}
          />
        ) : (
          <div
            className={`w-5 h-5 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0 border-2 shadow-sm ${
              isLeader
                ? 'border-[#fde047]'
                : isCurrentUser
                  ? 'border-gray-900 dark:border-white'
                  : 'border-white dark:border-gray-900'
            }`}
          >
            {initials}
          </div>
        )}
        <span
          className={`font-mono text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded whitespace-nowrap uppercase ${
            isLeader
              ? 'bg-[#111] text-white dark:bg-white dark:text-[#111]'
              : 'bg-[#ffffff] dark:bg-[#111] border border-[#e5e7eb] dark:border-[#3a3a3a] text-[#111] dark:text-[#f0f0f0]'
          }`}
        >
          {userName.split(' ')[0]} · {formatCashShort(totalCash)}
        </span>
      </div>
    </div>
  );
}
