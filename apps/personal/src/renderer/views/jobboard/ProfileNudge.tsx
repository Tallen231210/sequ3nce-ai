import React from 'react';

// ============================================================================
// Profile nudge on the job board. Both new members in week one lived here and
// never touched their profile — so the nudge appears where their attention
// already is, the moment they track or apply to a role, with a reason to
// finish. Shown only under the completeness threshold; dismissable for a week.
// ============================================================================

const SNOOZE_STORAGE_PREFIX = 'sequ3nce:profile-nudge:';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function snoozeKey(userId: string | undefined): string {
  return `${SNOOZE_STORAGE_PREFIX}${userId || 'anonymous'}`;
}

/** "Not now" hides the nudge for a week, per member, on this device. */
export function isProfileNudgeSnoozed(userId: string | undefined): boolean {
  try {
    const raw = window.localStorage.getItem(snoozeKey(userId));
    return !!raw && Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snoozeProfileNudge(userId: string | undefined): void {
  try {
    window.localStorage.setItem(snoozeKey(userId), String(Date.now()));
  } catch {
    // Storage unavailable — the nudge simply shows again next session.
  }
}

interface ProfileNudgeProps {
  pct: number;
  onFinish: () => void;
  onDismiss: () => void;
}

export function ProfileNudge({ pct, onFinish, onDismiss }: ProfileNudgeProps) {
  return (
    <div
      data-testid="profile-nudge"
      role="status"
      className="mx-4 sm:mx-5 xl:mx-6 mt-3 rounded-lg border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/70 p-3.5 flex items-start gap-3 min-w-0"
    >
      <div className="w-8 h-8 rounded-lg bg-black dark:bg-white text-white dark:text-black flex items-center justify-center text-[12px] font-bold shrink-0">
        {pct}%
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-gray-900 dark:text-white">
          Closers with a complete profile get referred to partner roles — yours is {pct}%.
        </p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
          A headline, your industries and a photo take about three minutes. It&apos;s the link you send when you reach out.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            data-testid="profile-nudge-finish"
            onClick={onFinish}
            className="rounded-md bg-black dark:bg-white text-white dark:text-black px-3 py-1.5 text-[11px] font-semibold hover:opacity-80"
          >
            Finish it (3 min) →
          </button>
          <button
            type="button"
            data-testid="profile-nudge-dismiss"
            onClick={onDismiss}
            className="text-[11px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
