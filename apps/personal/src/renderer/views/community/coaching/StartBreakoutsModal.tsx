import React, { useState } from 'react';

interface StartBreakoutsModalProps {
  /** Current attendee count (excludes coach) so we can preview group math. */
  attendeeCount: number;
  onClose: () => void;
  onStart: (args: { groupSize: number; durationMin: number }) => void;
}

const GROUP_SIZE_CHOICES = [2, 3, 4, 5, 6] as const;
const DURATION_CHOICES = [5, 7, 10, 15, 20] as const;

export function StartBreakoutsModal({
  attendeeCount,
  onClose,
  onStart,
}: StartBreakoutsModalProps) {
  const [groupSize, setGroupSize] = useState<number>(4);
  const [durationMin, setDurationMin] = useState<number>(7);

  // Preview: if an attendee leftover group would be smaller than 2, the
  // backend merges it up into the previous group (see startBreakouts impl).
  const nGroups = Math.max(1, Math.floor(attendeeCount / groupSize));
  const canStart = attendeeCount >= 2;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[480px] rounded-xl bg-zinc-900 border border-white/10 shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-white/10">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">
            Coach control
          </div>
          <div className="text-[18px] font-bold text-white">Start Role Play Rooms</div>
          <p className="text-[12px] text-white/50 mt-1 leading-snug">
            Split the room into small groups for peer role-play. Attendees get auto-placed.
            You can hop between rooms to listen in. Everyone rejoins the main room when the timer ends.
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Group size */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/50">
              Group size
            </label>
            <div className="mt-1 grid grid-cols-5 gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
              {GROUP_SIZE_CHOICES.map((n) => (
                <button
                  key={n}
                  onClick={() => setGroupSize(n)}
                  className={`py-1.5 text-[12px] font-semibold rounded-md transition-colors ${
                    groupSize === n ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-white/50">
              Duration
            </label>
            <div className="mt-1 grid grid-cols-5 gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
              {DURATION_CHOICES.map((m) => (
                <button
                  key={m}
                  onClick={() => setDurationMin(m)}
                  className={`py-1.5 text-[12px] font-semibold rounded-md transition-colors ${
                    durationMin === m ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="px-3 py-2.5 rounded-lg bg-white/5 border border-white/10">
            <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-0.5">
              Preview
            </div>
            <div className="text-[13px] text-white">
              {canStart
                ? `${attendeeCount} attendee${attendeeCount === 1 ? '' : 's'} → ~${nGroups} group${nGroups === 1 ? '' : 's'} of ~${groupSize} for ${durationMin} minutes.`
                : `Need at least 2 connected attendees to start.`}
            </div>
          </div>
        </div>

        <div className="px-6 pb-5 pt-2 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-white/70 hover:bg-white/5 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => canStart && onStart({ groupSize, durationMin })}
            disabled={!canStart}
            className="px-5 py-2 text-[13px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Start breakouts
          </button>
        </div>
      </div>
    </div>
  );
}
