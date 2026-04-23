import React, { useEffect, useState } from 'react';

interface BreakoutTransitionOverlayProps {
  groupId: number;
  memberNames: string[];
  /** Seconds to show the overlay before the actual room switch fires. */
  countdownSec: number;
}

// Brief "you'll be placed with…" splash shown on attendee clients right after
// the coach starts breakouts and before their client physically switches
// Daily rooms. Gives them a moment to see their groupmates so the transition
// isn't disorienting.
export function BreakoutTransitionOverlay({
  groupId,
  memberNames,
  countdownSec,
}: BreakoutTransitionOverlayProps) {
  const [remaining, setRemaining] = useState(countdownSec);

  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6">
      <div className="max-w-[480px] w-full text-center">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-300/80 mb-2">
          Role Play Rooms
        </div>
        <div className="text-[22px] font-bold text-white mb-4">
          Joining Group {groupId}
        </div>
        <div className="text-[13px] text-white/60 mb-4">
          You'll be placed with:
        </div>
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {memberNames.map((name) => (
            <span
              key={name}
              className="px-3 py-1.5 rounded-full text-[13px] font-medium bg-white/10 text-white border border-white/15"
            >
              {name}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 text-[11px] font-mono uppercase tracking-wider text-white/50">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          Starting in {remaining}s
        </div>
      </div>
    </div>
  );
}
