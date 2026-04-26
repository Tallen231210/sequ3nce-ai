import React, { useState } from 'react';
import type { SpotlightCandidate } from './SpotlightPickerModal';

interface RolePlayPickerModalProps {
  candidates: SpotlightCandidate[];
  onClose: () => void;
  onStart: (sessionIds: [string, string], topic: string) => void;
}

const MAX_TOPIC_LEN = 500;

// Coach-only modal. Pick exactly 2 attendees → they share the top slot
// (50/50 split). Coach drops into the bottom rows. Optional free-form
// topic text describes the scenario (not locked to "objection" language —
// coaches use role plays for many kinds of situations).
//
// The topic lives only while the role play is active. Ending the role play
// discards it (see FocusMode type — topic is scoped to the role-play variant).
export function RolePlayPickerModal({
  candidates,
  onClose,
  onStart,
}: RolePlayPickerModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [topic, setTopic] = useState('');

  function toggle(sessionId: string) {
    setSelected((prev) => {
      if (prev.includes(sessionId)) {
        return prev.filter((id) => id !== sessionId);
      }
      if (prev.length >= 2) {
        // Cap at 2 — if the coach already picked 2, ignore clicks until
        // they deselect one. Alternative: replace oldest; kept simpler.
        return prev;
      }
      return [...prev, sessionId];
    });
  }

  const canStart = selected.length === 2;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[480px] max-h-[85vh] rounded-xl bg-zinc-900 border border-white/10 shadow-2xl flex flex-col">
        <div className="px-6 pt-5 pb-3 border-b border-white/10">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">
            Coach control
          </div>
          <div className="text-[18px] font-bold text-white">Start Role Play</div>
          <p className="text-[12px] text-white/50 mt-1 leading-snug">
            Pick 2 attendees — they'll share the top slot while they role play.
            You drop into the rows below and can interject at any time.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {/* Topic input */}
          <div className="px-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/50">
              Topic (optional)
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, MAX_TOPIC_LEN))}
              placeholder="e.g., prospect says price is too high"
              className="mt-1 w-full px-3 py-2 text-[13px] bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-white/30"
            />
            <div className="mt-1 text-[10px] text-white/30 text-right">
              {topic.length}/{MAX_TOPIC_LEN}
            </div>
          </div>

          {/* Attendee picker */}
          <div>
            <div className="px-2 mb-1 flex items-center justify-between">
              <label className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                Pick 2 attendees
              </label>
              <span className="text-[10px] font-mono text-white/40">
                {selected.length}/2 selected
              </span>
            </div>
            {candidates.length < 2 ? (
              <div className="text-[12px] text-white/40 text-center py-4">
                Need at least 2 attendees in the call.
              </div>
            ) : (
              <div className="space-y-1">
                {candidates.map((c) => {
                  const isSelected = selected.includes(c.sessionId);
                  const canSelect = isSelected || selected.length < 2;
                  return (
                    <button
                      key={c.sessionId}
                      onClick={() => canSelect && toggle(c.sessionId)}
                      disabled={!canSelect}
                      className={`w-full px-3 py-2.5 rounded-lg text-left transition-colors flex items-center gap-3 ${
                        isSelected
                          ? 'bg-sky-400/15 border border-sky-400/50'
                          : canSelect
                          ? 'hover:bg-white/5 border border-transparent'
                          : 'opacity-40 cursor-not-allowed border border-transparent'
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
                        <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-sky-300">
                          ✓ Selected
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-white/70 hover:bg-white/5 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!canStart) return;
              onStart([selected[0], selected[1]], topic.trim());
            }}
            disabled={!canStart}
            className="px-5 py-2 text-[13px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Start Role Play
          </button>
        </div>
      </div>
    </div>
  );
}
