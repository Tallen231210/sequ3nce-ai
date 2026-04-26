import React, { useEffect, useRef, useState } from 'react';

// Single "Host" button that expands into a menu of coach-only actions.
// Collapsing Battle Royale / Spotlight / Role Play into one button keeps the
// top bar narrow — a row of 3 individually-visible buttons caused hover /
// click issues in v1.14 due to overflow at typical window widths.
export function HostControlsDropdown({
  onStartBattleRoyale,
  onStartSpotlight,
  onStartRolePlay,
}: {
  onStartBattleRoyale: () => void;
  onStartSpotlight: () => void;
  onStartRolePlay: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative ml-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase tracking-wider bg-amber-400/20 text-amber-200 hover:bg-amber-400/30 transition-colors border border-amber-400/30"
        title="Host controls"
      >
        ✦ Host
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-2 w-[240px] rounded-lg bg-zinc-900 border border-white/10 shadow-xl overflow-hidden z-[30]">
          <button
            onClick={() => { setOpen(false); onStartSpotlight(); }}
            className="w-full px-3 py-2.5 text-left text-[12.5px] text-white/90 hover:bg-white/5 transition-colors flex items-start gap-2 border-b border-white/5"
          >
            <span className="shrink-0 text-amber-300">★</span>
            <div>
              <div className="font-semibold">Spotlight an attendee</div>
              <div className="text-[10px] text-white/50 mt-0.5">Feature 1 person in the top slot</div>
            </div>
          </button>
          <button
            onClick={() => { setOpen(false); onStartRolePlay(); }}
            className="w-full px-3 py-2.5 text-left text-[12.5px] text-white/90 hover:bg-white/5 transition-colors flex items-start gap-2 border-b border-white/5"
          >
            <span className="shrink-0 text-sky-300">⇄</span>
            <div>
              <div className="font-semibold">Start Role Play</div>
              <div className="text-[10px] text-white/50 mt-0.5">2 attendees share the top slot</div>
            </div>
          </button>
          <button
            onClick={() => { setOpen(false); onStartBattleRoyale(); }}
            className="w-full px-3 py-2.5 text-left text-[12.5px] text-white/90 hover:bg-white/5 transition-colors flex items-start gap-2"
          >
            <span className="shrink-0 text-amber-300">⚔</span>
            <div>
              <div className="font-semibold">Start Battle Royale</div>
              <div className="text-[10px] text-white/50 mt-0.5">Crowd-built rebuttal contest</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
