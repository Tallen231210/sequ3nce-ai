import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MoneyBellsHallOfFameWinner,
  MoneyBellsLeaderboard as LeaderboardData,
  MoneyBellsMonthStats,
  MoneyBellsPrize,
  MoneyBellsUserRank,
} from '../../../convex';
import {
  getMoneyBellsHallOfFame,
  getMoneyBellsLeaderboard,
  getMoneyBellsMonthStats,
  getMoneyBellsPrize,
  getMoneyBellsUserRank,
  setMoneyBellsMonthlyPrize,
} from '../../../convex';
import { MoneyBellsHallOfFame } from './MoneyBellsHallOfFame';
import { MoneyBellsRaceLane } from './MoneyBellsRaceLane';
import { MoneyBellsYourRank } from './MoneyBellsYourRank';
import { getAvatarGradient, getInitials } from '../types';

const LEADERBOARD_POLL_MS = 30_000;

export interface MoneyBellsLeaderboardProps {
  userId: string;
  userName: string;
  userPhotoUrl: string | null;
  refreshKey?: number;
  isAdmin?: boolean;
}

function getCurrentMonthKey(): string {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatMonthDisplay(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const date = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatCashShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) {
    // Round to the nearest $100 ($0.1k) so e.g. $7,500 shows as "$7.5k", not "$8k".
    const rounded = Math.round(n / 100) / 10;
    return rounded === Math.floor(rounded) ? `$${rounded}k` : `$${rounded.toFixed(1)}k`;
  }
  return `$${n.toLocaleString()}`;
}

export function MoneyBellsLeaderboard({ userId, userName, userPhotoUrl, refreshKey = 0, isAdmin = false }: MoneyBellsLeaderboardProps) {
  const month = getCurrentMonthKey();
  const [page, setPage] = useState(1);
  const [showPrizeModal, setShowPrizeModal] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [userRank, setUserRank] = useState<MoneyBellsUserRank | null>(null);
  const [prize, setPrize] = useState<MoneyBellsPrize | null>(null);
  const [hallOfFame, setHallOfFame] = useState<MoneyBellsHallOfFameWinner[]>([]);
  const [monthStats, setMonthStats] = useState<MoneyBellsMonthStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    const [lb, rank, p, hof, stats] = await Promise.all([
      getMoneyBellsLeaderboard(month, page),
      getMoneyBellsUserRank(userId, month),
      getMoneyBellsPrize(month),
      getMoneyBellsHallOfFame(),
      getMoneyBellsMonthStats(month),
    ]);
    if (!mountedRef.current) return;
    if ('entries' in lb) setLeaderboard(lb);
    if ('totalBroadcasters' in rank) setUserRank(rank);
    if (!('error' in p)) setPrize(p);
    if ('winners' in hof) setHallOfFame(hof.winners);
    if (!('error' in stats)) setMonthStats(stats as MoneyBellsMonthStats);
    setIsLoading(false);
  }, [userId, month, page]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    const interval = setInterval(() => {
      if (mountedRef.current) load();
    }, LEADERBOARD_POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [load, refreshKey]);

  const totalPages = leaderboard?.totalPages ?? 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const entries = leaderboard?.entries ?? [];
  const topEntry = entries[0];

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-4">
      {/* Top strip — title + prize + live + pager */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[13px] font-bold text-gray-900 dark:text-white tracking-tight">
            Money Bells · {formatMonthDisplay(month)}
          </h3>
          {prize?.active ? (
            <PrizePillRow prize={prize} isAdmin={isAdmin} onEdit={() => setShowPrizeModal(true)} />
          ) : (
            isAdmin && (
              <button
                type="button"
                onClick={() => setShowPrizeModal(true)}
                className="px-2 py-0.5 text-[11px] font-semibold border border-dashed border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                + Set prize
              </button>
            )
          )}
        </div>
        <div className="flex items-center gap-3">
          {prize && (
            <span className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <span className="mb-live-dot" />
              Live · {prize.daysLeft}d left
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => canPrev && setPage((p) => p - 1)}
              disabled={!canPrev}
              className="w-5 h-5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 flex items-center justify-center text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              ‹
            </button>
            <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => canNext && setPage((p) => p + 1)}
              disabled={!canNext}
              className="w-5 h-5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 flex items-center justify-center text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Micro-stats row */}
      {monthStats && (
        <div className="grid grid-cols-3 border-b border-gray-200 dark:border-gray-700">
          <StatCell label="Total" value={formatCashShort(monthStats.totalPool)} sub={`${monthStats.broadcasterCount} closers`} />
          <StatCell label="Broadcasts" value={String(monthStats.broadcastCount)} sub={`avg ${formatCashShort(monthStats.avgBroadcast)}`} />
          <StatCell label="Biggest" value={monthStats.biggestDeal ? formatCashShort(monthStats.biggestDeal.cashCollected) : '—'} sub="single deal" last />
        </div>
      )}

      {/* Race track */}
      <div className="px-4 pt-3 pb-2.5">
        {isLoading ? (
          <div className="py-8 text-center text-[12px] text-gray-400 dark:text-gray-500">Loading leaderboard…</div>
        ) : !leaderboard || entries.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-gray-500 dark:text-gray-400">
            No broadcasts yet · Close a deal to claim #1
          </div>
        ) : (
          <>
            {/* Axis labels */}
            <div className="flex justify-between px-1 pb-2 text-[9px] font-mono font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-400 border-b border-dashed border-gray-200 dark:border-gray-600 mb-2">
              <span>Month start</span>
              <span className="text-gray-900 dark:text-white">Month end →</span>
            </div>
            <div className="space-y-1.5">
              {entries.map((entry) => (
                <MoneyBellsRaceLane
                  key={entry.userId}
                  rank={entry.rank}
                  userId={entry.userId}
                  userName={entry.userName}
                  photoUrl={entry.photoUrl}
                  totalCash={entry.totalCash}
                  monthlyGoal={leaderboard.monthlyGoal}
                  isCurrentUser={entry.userId === userId}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Data table — ranks with deals, delta, trend */}
      {entries.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-[48px_1fr_60px_110px] px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 text-[9px] font-mono font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <span>#</span>
            <span>Closer</span>
            <span className="text-right">Deals</span>
            <span className="text-right">This Month</span>
          </div>
          {entries.map((entry) => {
            const gradient = getAvatarGradient(entry.userName);
            const initials = getInitials(entry.userName);
            const isLeader = entry.rank === 1;
            return (
              <div
                key={entry.userId}
                className="grid grid-cols-[48px_1fr_60px_110px] items-center px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
              >
                <span className={`font-mono text-[11px] font-bold tracking-wider ${isLeader ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                  {String(entry.rank).padStart(2, '0')}
                </span>
                <div className="flex items-center gap-2.5 min-w-0">
                  {entry.photoUrl ? (
                    <img src={entry.photoUrl} alt={entry.userName} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0`}>
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-gray-900 dark:text-white truncate tracking-tight">
                      {entry.userName}
                    </div>
                    {entry.userBadges?.includes('founder') && (
                      <div className="font-mono text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-0.5">
                        Founder
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-right tabular-nums text-[13px] text-gray-600 dark:text-gray-400 font-medium">
                  {entry.broadcastCount}
                </span>
                <span className="text-right tabular-nums text-[15px] font-bold text-gray-900 dark:text-white tracking-tight">
                  ${entry.totalCash.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Your rank — inverted black strip with signal yellow accent */}
      <MoneyBellsYourRank userRank={userRank} userName={userName} userPhotoUrl={userRank?.photoUrl ?? userPhotoUrl} />

      {/* Hall of Fame */}
      <MoneyBellsHallOfFame winners={hallOfFame} />

      {showPrizeModal && (
        <SetPrizeModal
          userId={userId}
          month={month}
          currentPrize={prize}
          onClose={() => setShowPrizeModal(false)}
          onSaved={() => {
            setShowPrizeModal(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

const MEDAL_META: Array<{ rank: 1 | 2 | 3; emoji: string; label: string }> = [
  { rank: 1, emoji: '🥇', label: '1st place prize' },
  { rank: 2, emoji: '🥈', label: '2nd place prize' },
  { rank: 3, emoji: '🥉', label: '3rd place prize' },
];

function PrizePillRow({
  prize,
  isAdmin,
  onEdit,
}: {
  prize: MoneyBellsPrize;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  const slots: Array<{ rank: 1 | 2 | 3; emoji: string; text: string | null }> = [
    { rank: 1, emoji: '🥇', text: prize.prizeText1 ?? null },
    { rank: 2, emoji: '🥈', text: prize.prizeText2 ?? null },
    { rank: 3, emoji: '🥉', text: prize.prizeText3 ?? null },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {slots.map((s) => {
        if (s.text) {
          return (
            <button
              key={s.rank}
              type="button"
              onClick={() => isAdmin && onEdit()}
              disabled={!isAdmin}
              title={isAdmin ? 'Edit prizes' : undefined}
              className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded ${
                isAdmin ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'
              }`}
            >
              <span className="text-[12px] leading-none">{s.emoji}</span>
              <span className="truncate max-w-[140px]">{s.text}</span>
            </button>
          );
        }
        // Empty slot: admins get a dashed placeholder to fill in; others see nothing.
        if (!isAdmin) return null;
        return (
          <button
            key={s.rank}
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold border border-dashed border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded hover:border-gray-900 dark:hover:border-white hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <span className="text-[12px] leading-none opacity-60">{s.emoji}</span>
            <span>Set</span>
          </button>
        );
      })}
    </div>
  );
}

function SetPrizeModal({
  userId,
  month,
  currentPrize,
  onClose,
  onSaved,
}: {
  userId: string;
  month: string;
  currentPrize: MoneyBellsPrize | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Seed from current text slots; fall back to legacy amount for slot 1
  const legacyFirst =
    currentPrize?.prizeAmount && !currentPrize.prizeText1
      ? `$${currentPrize.prizeAmount.toLocaleString()}`
      : '';
  const [text1, setText1] = useState(currentPrize?.prizeText1 ?? legacyFirst ?? '');
  const [text2, setText2] = useState(currentPrize?.prizeText2 ?? '');
  const [text3, setText3] = useState(currentPrize?.prizeText3 ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAny = [text1, text2, text3].some((t) => t.trim().length > 0);
  const canSubmit = !submitting && hasAny;
  const isEdit = !!(currentPrize?.prizeText1 || currentPrize?.prizeText2 || currentPrize?.prizeText3 || currentPrize?.prizeAmount);

  async function handleSave() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const res = await setMoneyBellsMonthlyPrize(userId, month, {
      prizeText1: text1.trim(),
      prizeText2: text2.trim(),
      prizeText3: text3.trim(),
    });
    setSubmitting(false);
    if (!res.success) {
      setError(res.error || 'Failed to save');
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-[420px] border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {isEdit ? 'Edit prizes' : 'Set prizes'}
          </p>
          <h2 className="text-base font-bold text-gray-900 dark:text-white mt-1">
            {formatMonthDisplay(month)}
          </h2>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">
            Prizes can be anything — cash, gift cards, a Rolex. Leave any slot blank to skip it. Payout is handled outside the app after month-end.
          </p>
        </div>

        <div className="px-5 pb-3 space-y-3">
          {MEDAL_META.map(({ rank, emoji, label }) => {
            const value = rank === 1 ? text1 : rank === 2 ? text2 : text3;
            const setValue = rank === 1 ? setText1 : rank === 2 ? setText2 : setText3;
            return (
              <div key={rank}>
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                  <span className="text-[13px] leading-none">{emoji}</span>
                  {label}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value.slice(0, 60))}
                  placeholder={
                    rank === 1 ? 'e.g. $1,000 cash' : rank === 2 ? 'e.g. $500 Amazon gift card' : 'e.g. Airpods Pro'
                  }
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 text-gray-900 dark:text-white placeholder-gray-400"
                />
              </div>
            );
          })}
        </div>

        {error && (
          <div className="px-5 text-[11px] text-red-600 dark:text-red-400 mb-2">{error}</div>
        )}

        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSubmit}
            className="px-4 py-2 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Save prizes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCell({ label, value, sub, last }: { label: string; value: string; sub: string; last?: boolean }) {
  return (
    <div className={`px-3 py-2.5 ${last ? '' : 'border-r border-gray-200 dark:border-gray-700'}`}>
      <div className="font-mono text-[9px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className="text-[15px] font-bold text-gray-900 dark:text-white tabular-nums tracking-tight mt-0.5">
        {value}
      </div>
      <div className="font-mono text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">
        {sub}
      </div>
    </div>
  );
}
