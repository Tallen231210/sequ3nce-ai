import React, { useState } from 'react';

export interface SpotlightCandidate {
  sessionId: string;
  userName: string;
  photoUrl?: string | null;
}

interface SpotlightPickerModalProps {
  /** Non-coach attendees eligible to be spotlighted. Excludes coach + local. */
  candidates: SpotlightCandidate[];
  onClose: () => void;
  onStart: (sessionId: string) => void;
}

// Coach-only modal. Pick exactly one attendee → they replace the coach at
// the top of the classroom view (coach drops into the bottom rows). No
// timer, no objection — just a single-person focus promotion.
//
// Separate from Role Play (which picks 2). Spotlight is the coach going
// "I want everyone to watch this person for a minute" — e.g., highlighting
// a big closer's win, giving an attendee a turn to present, etc.
export function SpotlightPickerModal({
  candidates,
  onClose,
  onStart,
}: SpotlightPickerModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const canStart = selected !== null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[440px] max-h-[85vh] rounded-xl bg-zinc-900 border border-white/10 shadow-2xl flex flex-col">
        <div className="px-6 pt-5 pb-3 border-b border-white/10">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">
            Coach control
          </div>
          <div className="text-[18px] font-bold text-white">Spotlight an attendee</div>
          <p className="text-[12px] text-white/50 mt-1 leading-snug">
            The person you pick replaces you in the top slot. Everyone's view
            centers on them until you end the spotlight.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {candidates.length === 0 ? (
            <div className="text-[12px] text-white/40 text-center py-6">
              No attendees in the call yet.
            </div>
          ) : (
            <div className="space-y-1">
              {candidates.map((c) => {
                const isSelected = selected === c.sessionId;
                return (
                  <button
                    key={c.sessionId}
                    onClick={() => setSelected(c.sessionId)}
                    className={`w-full px-3 py-2.5 rounded-lg text-left transition-colors flex items-center gap-3 ${
                      isSelected
                        ? 'bg-amber-400/15 border border-amber-400/50'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="shrink-0 w-9 h-9 rounded-full bg-white/10 overflow-hidden flex items-center justify-center">
                      {c.photoUrl ? (
                        <img src={c.photoUrl} alt={c.userName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[13px] font-bold text-white/70">
                          {c.userName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="flex-1 text-[13px] text-white">{c.userName}</span>
                    {isSelected && (
                      <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-amber-300">
                        ✓ Selected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-white/70 hover:bg-white/5 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => canStart && onStart(selected as string)}
            disabled={!canStart}
            className="px-5 py-2 text-[13px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Start Spotlight
          </button>
        </div>
      </div>
    </div>
  );
}
