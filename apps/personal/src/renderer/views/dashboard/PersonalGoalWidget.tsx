import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CloserInfo } from '../../convex';
import {
  getActiveGoalWithProgress,
  getCommissionSettings,
  cancelActivePersonalGoal,
  type ActiveGoalProgress,
  type CommissionSettings,
  type PersonalGoal,
} from '../../convex';
import { GoalProgressBar } from './GoalProgressBar';
import { PersonalGoalSetupModal } from './PersonalGoalSetupModal';

interface PersonalGoalWidgetProps {
  closerInfo: CloserInfo;
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function daysBetween(ms: number): number {
  return Math.ceil(ms / 86_400_000);
}

// Approximate duration in whole months from two timestamps — good enough for
// timeline landmark labels. We bias to "round up to nearest whole month" so a
// 3-month goal doesn't display as "2mo" due to calendar-month variance.
function approxDurationMonths(startMs: number, endMs: number): number {
  const days = (endMs - startMs) / 86_400_000;
  return Math.max(1, Math.round(days / 30.44));
}

function paceLabel(progressPct: number, elapsedPct: number): {
  label: string;
  emoji: string;
  tone: 'ahead' | 'on' | 'behind';
} {
  if (progressPct >= elapsedPct + 0.15) return { label: 'ahead of pace', emoji: '🔥', tone: 'ahead' };
  if (progressPct >= elapsedPct - 0.05) return { label: 'on pace', emoji: '⚡', tone: 'on' };
  return { label: 'behind pace', emoji: '⚠️', tone: 'behind' };
}

export function PersonalGoalWidget({ closerInfo }: PersonalGoalWidgetProps) {
  const userId = closerInfo.b2cUserId;
  const closerId = closerInfo.closerId;
  const [data, setData] = useState<ActiveGoalProgress | null>(null);
  const [commissionSettings, setCommissionSettings] = useState<CommissionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [dismissedTerminalId, setDismissedTerminalId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!userId || !closerId) {
      setLoading(false);
      return;
    }
    const [active, settings] = await Promise.all([
      getActiveGoalWithProgress(userId, closerId),
      getCommissionSettings(userId),
    ]);
    if (!mountedRef.current) return;
    if ('error' in active) {
      // Network hiccup — don't wipe existing state. Just log and bail.
      console.error('[PersonalGoalWidget] load error:', active.error);
      setLoading(false);
      return;
    }
    setData(active);
    setCommissionSettings(settings && !('error' in settings) ? settings : null);
    setLoading(false);
  }, [userId, closerId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  if (!userId || !closerId) return null; // B2C view without login state
  if (loading) return <GoalSkeleton />;

  const active = data?.goal ?? null;
  const terminal = data?.lastTerminal ?? null;
  const showTerminal =
    !active && terminal && terminal._id !== dismissedTerminalId;

  // State 4 — most recent goal was completed or expired, not yet dismissed
  if (showTerminal) {
    return (
      <TerminalGoalTile
        goal={terminal}
        onDismiss={() => setDismissedTerminalId(terminal._id)}
        onStartNew={() => {
          setDismissedTerminalId(terminal._id);
          setShowSetup(true);
        }}
      />
    );
  }

  // State 1 — no active goal
  if (!active) {
    return (
      <>
        <EmptyGoalTile onSetGoal={() => setShowSetup(true)} />
        {showSetup && (
          <PersonalGoalSetupModal
            userId={userId}
            existingCommissionSettings={commissionSettings}
            hasActiveGoal={false}
            onClose={() => setShowSetup(false)}
            onSaved={() => {
              setShowSetup(false);
              void load();
            }}
          />
        )}
      </>
    );
  }

  // State 2 — active goal
  const earned = data?.earned ?? 0;
  const progressFraction = Math.min(1, earned / active.targetAmount);
  const elapsedFraction = Math.min(
    1,
    Math.max(0, (Date.now() - active.startDate) / (active.endDate - active.startDate))
  );
  const pace = paceLabel(progressFraction, elapsedFraction);
  const msLeft = Math.max(0, active.endDate - Date.now());
  const daysLeft = daysBetween(msLeft);
  const remaining = Math.max(0, active.targetAmount - earned);
  const dailyPaceNeeded = daysLeft > 0 ? remaining / daysLeft : remaining;

  return (
    <>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            My goal
          </p>
          <button
            onClick={() => setShowSetup(true)}
            title="Edit or replace your goal"
            className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
        </div>

        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-2xl">{active.emoji ?? '🎯'}</span>
          <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white leading-snug">
            {active.title}
          </h3>
        </div>

        <GoalProgressBar
          progress={progressFraction}
          durationMonths={approxDurationMonths(active.startDate, active.endDate)}
          runnerEmoji={active.emoji}
        />

        <div className="mt-3 flex items-center justify-between">
          <p className="text-[13px] text-gray-700 dark:text-gray-300">
            <span className="font-bold">{formatCurrency(earned)}</span>
            <span className="text-gray-500 dark:text-gray-400"> earned of </span>
            <span className="font-bold">{formatCurrency(active.targetAmount)}</span>
          </p>
          <p className="text-[13px] font-semibold text-gray-900 dark:text-white tabular-nums">
            {Math.round(progressFraction * 100)}%
          </p>
        </div>

        {!data?.hasCommissionSettings ? (
          <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-[11px] text-amber-800 dark:text-amber-300">
            Set up your commission rate so we can track progress.{' '}
            <button
              onClick={() => setShowSetup(true)}
              className="underline font-medium hover:opacity-80"
            >
              Add it now →
            </button>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
            <span>{daysLeft}d left</span>
            <span className="text-gray-300 dark:text-zinc-600">·</span>
            <span className={`inline-flex items-center gap-1 font-medium ${
              pace.tone === 'ahead'
                ? 'text-emerald-600 dark:text-emerald-400'
                : pace.tone === 'on'
                  ? 'text-gray-700 dark:text-gray-300'
                  : 'text-amber-600 dark:text-amber-400'
            }`}>
              {pace.emoji} {pace.label}
            </span>
            {remaining > 0 && daysLeft > 0 && (
              <>
                <span className="text-gray-300 dark:text-zinc-600">·</span>
                <span>{formatCurrency(dailyPaceNeeded)}/day to finish</span>
              </>
            )}
          </div>
        )}
      </div>

      {showSetup && (
        <PersonalGoalSetupModal
          userId={userId}
          existingCommissionSettings={commissionSettings}
          hasActiveGoal={!!active}
          onClose={() => setShowSetup(false)}
          onSaved={() => {
            setShowSetup(false);
            void load();
          }}
        />
      )}
    </>
  );
}

// ==================== Sub-components ====================

function GoalSkeleton() {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-5 animate-pulse">
      <div className="h-3 w-16 bg-gray-200 dark:bg-zinc-800 rounded mb-3" />
      <div className="h-5 w-56 bg-gray-200 dark:bg-zinc-800 rounded mb-4" />
      <div className="h-7 w-full bg-gray-100 dark:bg-zinc-800 rounded-full" />
    </div>
  );
}

function EmptyGoalTile({ onSetGoal }: { onSetGoal: () => void }) {
  return (
    <div className="bg-gradient-to-br from-white to-gray-50 dark:from-zinc-900 dark:to-zinc-950 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6 flex items-center justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
          Keep a goal in view
        </p>
        <h3 className="text-[16px] font-bold text-gray-900 dark:text-white mb-1">
          Set a goal. Stay focused.
        </h3>
        <p className="text-[12px] text-gray-500 dark:text-gray-400 leading-snug max-w-sm">
          Pick what you're chasing, tie a dollar target to it, and watch your progress every time you open the app.
        </p>
      </div>
      <button
        onClick={onSetGoal}
        className="shrink-0 ml-4 px-4 py-2 text-[13px] font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity"
      >
        Set a goal
      </button>
    </div>
  );
}

function TerminalGoalTile({
  goal,
  onDismiss,
  onStartNew,
}: {
  goal: PersonalGoal;
  onDismiss: () => void;
  onStartNew: () => void;
}) {
  const completed = goal.status === 'completed';

  return (
    <div className={`rounded-2xl border p-5 ${
      completed
        ? 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-emerald-800/40'
        : 'bg-gray-50 dark:bg-zinc-900 border-gray-200 dark:border-zinc-800'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <p className={`text-[10px] font-bold uppercase tracking-wider ${
          completed ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'
        }`}>
          {completed ? 'Goal hit 🎉' : "Time's up — but momentum isn't"}
        </p>
        <button
          onClick={onDismiss}
          className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg transition-colors"
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl">{goal.emoji ?? '🎯'}</span>
        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white leading-snug">
          {goal.title}
        </h3>
      </div>

      <GoalProgressBar
        progress={1}
        completed={completed}
        expired={!completed}
        durationMonths={approxDurationMonths(goal.startDate, goal.endDate)}
        runnerEmoji={goal.emoji}
      />

      <p className="mt-3 text-[12px] text-gray-600 dark:text-gray-400 leading-snug">
        {completed
          ? 'You did it. That work is real. Set your next goal and keep going.'
          : "You made progress that matters. Life's a marathon, not a sprint — set the next chapter."}
      </p>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onStartNew}
          className="px-4 py-2 text-[13px] font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity"
        >
          Set a new goal
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-2 text-[12px] font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          Dismiss for now
        </button>
      </div>
    </div>
  );
}
