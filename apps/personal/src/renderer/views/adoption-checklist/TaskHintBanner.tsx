import React, { useEffect, useState } from 'react';
import { getSetupTask } from './tasks';
import type { SetupTaskId } from './types';

interface TaskHintBannerProps {
  /** The task this banner represents. Banner only renders if the URL hash
   *  contains `setup=<taskId>` matching this prop. */
  taskId: SetupTaskId;
}

// Reads the URL hash for `setup=<taskId>`. If present and matches this
// component's taskId, renders a soft amber banner with the task's banner
// copy. User can dismiss with × Skip; banner clears the hash param so it
// doesn't reappear on hot reload.
export function TaskHintBanner({ taskId }: TaskHintBannerProps) {
  const [visible, setVisible] = useState(() => hashHasSetup(taskId));

  // React to hash changes (e.g., user clicks a Try-it-now CTA from the
  // popover while already on this tab).
  useEffect(() => {
    function onHashChange() {
      setVisible(hashHasSetup(taskId));
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [taskId]);

  if (!visible) return null;

  const task = getSetupTask(taskId);

  function dismiss() {
    setVisible(false);
    // Strip the setup= param from the hash so it doesn't re-trigger.
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    params.delete('setup');
    const next = params.toString();
    window.location.hash = next ? `#${next}` : '';
  }

  return (
    <div className="px-4 py-2.5 bg-amber-50/80 border-b border-amber-200/70 flex items-center gap-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 shrink-0">
        Setup
      </div>
      <div className="flex-1 text-[12.5px] text-amber-900 leading-snug">
        {task.bannerCopy}
      </div>
      <button
        onClick={dismiss}
        className="shrink-0 text-[11px] text-amber-700 hover:text-amber-900 transition-colors"
        title="Skip this hint"
      >
        × Skip
      </button>
    </div>
  );
}

function hashHasSetup(taskId: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('setup') === taskId;
}
