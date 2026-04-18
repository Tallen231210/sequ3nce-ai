import React from 'react';
import type { MoneyBellsHallOfFameWinner } from '../../../convex';
import { getAvatarGradient, getInitials } from '../types';

export interface MoneyBellsHallOfFameProps {
  winners: MoneyBellsHallOfFameWinner[];
}

function formatMonth(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function MoneyBellsHallOfFame({ winners }: MoneyBellsHallOfFameProps) {
  if (winners.length === 0) return null;

  return (
    <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 flex items-center gap-3 overflow-x-auto">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex-shrink-0">
        Past Champs
      </span>
      <div className="flex items-center gap-3">
        {winners.slice(0, 6).map((w) => {
          const gradient = getAvatarGradient(w.winnerName);
          const initials = getInitials(w.winnerName);
          return (
            <div
              key={`${w.month}-${w.winnerUserId ?? 'none'}`}
              className="flex items-center gap-1.5 flex-shrink-0"
              title={`${formatMonth(w.month)} — ${w.winnerName} — $${w.winnerCashCollected.toLocaleString()} — Prize: ${w.prizeText1 ?? (w.prizeAmount ? `$${w.prizeAmount}` : '—')}`}
            >
              {w.photoUrl ? (
                <img src={w.photoUrl} alt={w.winnerName} className="w-5 h-5 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
              ) : (
                <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[8px] font-bold border border-gray-200 dark:border-gray-700`}>
                  {initials}
                </div>
              )}
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-900 dark:text-white">{w.winnerName.split(' ')[0]}</span>
                <span className="text-gray-400 dark:text-gray-500 ml-1">{formatMonth(w.month)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
