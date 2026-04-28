import React, { useEffect } from 'react';
import { SetupSection } from './SetupSection';
import { EarnSection } from './EarnSection';
import { SETUP_TASKS } from './tasks';
import type { AdoptionChecklistData } from '../../convex';
import type { CtaTarget } from './types';

interface AdoptionChecklistPopoverProps {
  data: AdoptionChecklistData;
  onClose: () => void;
  onCta: (target: CtaTarget) => void;
  onDismissSetup: () => void;
}

const SETUP_PROMINENT_DAYS = 14;
const SETUP_HIDDEN_DAY = 30;

// Computes which lifecycle phase Setup is in based on the spec's Approach C
// rules: prominent for 14 days from firstSeenAt, collapsed days 15–30,
// hidden day 31+. Also hidden when 100% complete OR explicitly dismissed.
function setupPhase(state: AdoptionChecklistData['state'], setupComplete: boolean):
  | 'prominent' | 'collapsed' | 'hidden' {
  if (setupComplete) return 'hidden';
  if (!state) return 'prominent';
  if (state.setupDismissedAt) return 'hidden';
  const ageDays = (Date.now() - state.firstSeenAt) / 86_400_000;
  if (ageDays >= SETUP_HIDDEN_DAY) return 'hidden';
  if (ageDays >= SETUP_PROMINENT_DAYS) return 'collapsed';
  return 'prominent';
}

export function AdoptionChecklistPopover({
  data,
  onClose,
  onCta,
  onDismissSetup,
}: AdoptionChecklistPopoverProps) {
  // Esc closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setupCompletedCount = SETUP_TASKS.filter((t) => data.setup[t.id]).length;
  const setupAllDone = setupCompletedCount === SETUP_TASKS.length;
  const phase = setupPhase(data.state, setupAllDone);

  return (
    <>
      {/* Click-outside backdrop. Transparent — popover sits on top. */}
      <div className="fixed inset-0 z-[150]" onClick={onClose} />
      <div
        className="fixed top-14 right-5 z-[160] w-[380px] max-h-[80vh] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {phase !== 'hidden' && (
          <SetupSection
            setup={data.setup}
            phase={phase === 'prominent' ? 'prominent' : 'collapsed'}
            onCta={onCta}
            onDismiss={onDismissSetup}
          />
        )}
        <EarnSection earn={data.earn} onCta={onCta} />
      </div>
    </>
  );
}
