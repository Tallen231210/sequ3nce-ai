import React, { useEffect, useState } from 'react';
import { useAdoptionChecklist } from './useAdoptionChecklist';
import { AdoptionChecklistPopover } from './AdoptionChecklistPopover';
import { SETUP_TASKS } from './tasks';
import type { CtaTarget } from './types';

interface AdoptionChecklistButtonProps {
  userId: string | undefined;
  /** Called when the user clicks a task's CTA. The parent (MeetingBotHub)
   *  routes to the right tab/modal and closes the popover. */
  onCta: (target: CtaTarget) => void;
}

const PULSE_DAYS = 7;

// Titlebar button + popover anchor. Phase-driven label:
//   - "Get started" with N/5 progress count while Setup is active
//   - "Earn" when Setup is hidden (complete or day 31+)
// Pulse for 7 days after firstSeenAt. Red dot when there's a new monetary
// opportunity since the user last opened the panel.
export function AdoptionChecklistButton({ userId, onCta }: AdoptionChecklistButtonProps) {
  const checklist = useAdoptionChecklist(userId);
  const [open, setOpen] = useState(false);
  const [autoOpenChecked, setAutoOpenChecked] = useState(false);

  // Ensure the row exists once we have data (or lack thereof).
  useEffect(() => {
    if (!userId) return;
    if (checklist.data?.state) return;
    void checklist.ensureRow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, checklist.data?.state]);

  // Auto-open once on first encounter (only after data loads + row exists).
  useEffect(() => {
    if (autoOpenChecked) return;
    if (!checklist.data) return;
    const state = checklist.data.state;
    if (!state) return; // row not yet created — wait for ensureRow
    setAutoOpenChecked(true);
    if (state.setupAutoOpenedAt) return; // already auto-opened in a past session
    if (state.setupCompletedAt) return; // already finished — no need to interrupt

    setOpen(true);
    void checklist.markAutoOpened();
  }, [checklist, autoOpenChecked]);

  if (!userId || !checklist.data) {
    // Render placeholder so titlebar layout doesn't shift between auth states.
    return null;
  }

  const data = checklist.data;
  const setupCompleted = SETUP_TASKS.filter((t) => data.setup[t.id]).length;
  const setupTotal = SETUP_TASKS.length;
  const setupAllDone = setupCompleted === setupTotal;
  const ageDays = data.state ? (Date.now() - data.state.firstSeenAt) / 86_400_000 : 0;
  const setupHidden =
    setupAllDone ||
    !!data.state?.setupDismissedAt ||
    ageDays >= 31;

  // Label.
  const label = setupHidden ? 'Earn' : 'Get started';
  const showCount = !setupHidden;
  const countText = `${setupCompleted}/${setupTotal}`;

  // Pulse — first 7 days only.
  const showPulse = !!data.state && ageDays < PULSE_DAYS && !open;

  // Red dot — for now: any non-paid recent activity in the Earn surface,
  // computed against earnRedDotLastSeenAt. For v1 we surface the dot when
  // there's never been an open AND there's anything to look at (Money Bells
  // contest exists, or a paid clip exists, etc.). Refine later.
  const earnHasNews =
    !data.state?.earnRedDotLastSeenAt ||
    (data.earn.testimonial?.status === 'approved' || data.earn.testimonial?.status === 'paid') ||
    data.earn.creatorCash.totalEarned > 0;
  const showRedDot = setupHidden && earnHasNews && !open;

  function handleToggle() {
    if (!open) {
      // Opening — clear the earn red dot.
      void checklist.markEarnSeen();
    }
    setOpen((v) => !v);
  }

  function handleCta(target: CtaTarget) {
    setOpen(false);
    onCta(target);
  }

  return (
    <>
      <button
        onClick={handleToggle}
        className={`no-drag relative flex items-center gap-2 px-3 py-2 text-[13px] font-semibold rounded-lg border transition-colors ${
          showPulse
            ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100 animate-pulse'
            : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
        }`}
        title={setupHidden ? 'Earn through Sequ3nce' : 'Get started checklist'}
      >
        <span className="text-[14px] leading-none">{setupHidden ? '$' : '🚀'}</span>
        <span>{label}</span>
        {showCount && (
          <span className="text-[11px] font-mono text-gray-500">{countText}</span>
        )}
        {showRedDot && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />
        )}
      </button>
      {open && (
        <AdoptionChecklistPopover
          data={data}
          onClose={() => setOpen(false)}
          onCta={handleCta}
          onDismissSetup={() => {
            void checklist.dismissSetup();
          }}
        />
      )}
    </>
  );
}
