import React, { useState } from 'react';
import { TaskRow } from './TaskRow';
import { SETUP_TASKS } from './tasks';
import { DismissSetupConfirmModal } from './DismissSetupConfirmModal';
import type { AdoptionChecklistData } from '../../convex';
import type { CtaTarget } from './types';

interface SetupSectionProps {
  setup: AdoptionChecklistData['setup'];
  /** Lifecycle phase — drives prominent vs collapsed rendering. Hidden state
   *  is handled by the parent (popover) by not mounting this component. */
  phase: 'prominent' | 'collapsed';
  /** Invoked when the user clicks a task's CTA. Parent routes the deep-link. */
  onCta: (target: CtaTarget) => void;
  /** Invoked when the user clicks × Skip on the section header. */
  onDismiss: () => void;
}

export function SetupSection({ setup, phase, onCta, onDismiss }: SetupSectionProps) {
  const [confirming, setConfirming] = useState(false);
  const completed = SETUP_TASKS.filter((t) => setup[t.id]).length;
  const total = SETUP_TASKS.length;
  const percent = Math.round((completed / total) * 100);
  const remaining = total - completed;

  if (phase === 'collapsed') {
    // Compact one-line summary. User can click to expand by re-opening
    // popover after Setup section is dismissed; expansion not implemented
    // for v1 — collapsed phase is purely informational.
    return (
      <div className="px-3 py-2 text-[12px] text-gray-500 border-b border-gray-100">
        Setup {completed}/{total} — keep going
      </div>
    );
  }

  return (
    <div className="border-b border-gray-100 pb-2">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
            Get set up
          </div>
          <div className="text-[12px] font-medium text-gray-900 mt-0.5">
            {completed} of {total} complete
          </div>
        </div>
        <button
          onClick={() => setConfirming(true)}
          className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
          title="Hide setup checklist"
        >
          × Skip
        </button>
      </div>
      <div className="mx-3 mb-2 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="px-1">
        {SETUP_TASKS.map((task) => (
          <TaskRow
            key={task.id}
            complete={setup[task.id]}
            title={task.title}
            description={task.description}
            cta={{
              label: task.ctaLabel,
              onClick: () => onCta(task.ctaTarget),
            }}
          />
        ))}
      </div>
      {confirming && (
        <DismissSetupConfirmModal
          remainingCount={remaining}
          onConfirm={() => {
            setConfirming(false);
            onDismiss();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
