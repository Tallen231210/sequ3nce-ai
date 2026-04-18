import React from 'react';
import type { MoneyBellsUserRank } from '../../../convex';
import { getAvatarGradient, getInitials } from '../types';

export interface MoneyBellsYourRankProps {
  userRank: MoneyBellsUserRank | null;
  userName: string;
  userPhotoUrl: string | null;
}

function formatCash(n: number): string {
  return `$${n.toLocaleString()}`;
}

function formatCashShort(n: number): string {
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `$${n.toLocaleString()}`;
}

export function MoneyBellsYourRank({ userRank, userName, userPhotoUrl }: MoneyBellsYourRankProps) {
  const gradient = getAvatarGradient(userName || 'You');
  const initials = getInitials(userName || 'You');

  if (!userRank || userRank.rank === null) {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#111] dark:bg-[#f5f5f5] text-white dark:text-[#111] border-t border-[#e5e7eb] dark:border-[#2a2a2a]">
        {userPhotoUrl ? (
          <img src={userPhotoUrl} alt={userName} className="w-6 h-6 rounded-full object-cover flex-shrink-0 ring-1 ring-white/30 dark:ring-gray-900/30" />
        ) : (
          <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ring-1 ring-white/30 dark:ring-gray-900/30`}>
            {initials}
          </div>
        )}
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] opacity-70">You</span>
        <span className="font-mono text-[10px] tracking-wider uppercase ml-auto opacity-75">
          <b className="font-bold">No broadcasts yet</b> · Close a deal to enter
        </span>
      </div>
    );
  }

  const { rank, totalCash, gapToNext } = userRank;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-[#111] dark:bg-[#f5f5f5] text-white dark:text-[#111] border-t border-[#e5e7eb] dark:border-[#2a2a2a]">
      {userPhotoUrl ? (
        <img src={userPhotoUrl} alt={userName} className="w-6 h-6 rounded-full object-cover flex-shrink-0 ring-1 ring-white/30 dark:ring-gray-900/30" />
      ) : (
        <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 ring-1 ring-white/30 dark:ring-gray-900/30`}>
          {initials}
        </div>
      )}
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] opacity-70">You</span>
      <span className="font-mono text-[11px] font-bold tabular-nums">#{rank}</span>
      <span className="text-[14px] font-bold tracking-tight tabular-nums">{formatCash(totalCash)}</span>
      {gapToNext !== null && gapToNext > 0 && (
        <span className="font-mono text-[10px] tracking-wider uppercase ml-auto opacity-75">
          Need <b className="font-bold opacity-100">{formatCashShort(gapToNext)}</b> to pass #{rank - 1}
        </span>
      )}
    </div>
  );
}
