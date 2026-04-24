import React from 'react';
import type { BattleRoyaleState } from './BattleRoyaleTypes';

interface BattleRoyaleCoachPanelProps {
  state: BattleRoyaleState;
  /** Toggle a submission's selection during the reviewing phase. */
  onToggleSelect: (submissionId: string) => void;
  /** Reveal the coach's 3 selected submissions to everyone for voting. */
  onReveal: () => void;
  /** End voting early and announce winner (uses current highest-voted). */
  onEndVoting: () => void;
  /** Abandon the current round (no winner). */
  onAbort: () => void;
}

// Side panel shown only to the coach. Replaces the usual chat/queue side panel
// while a round is active so the coach has a dedicated workspace for it.
//
// Phases we render here:
//   - reviewing: show all received submissions, let coach check 3, then Reveal.
//   - voting: show the 3 reveals with live vote counts + End voting button.
// Other phases render nothing (attendee overlay covers the center of the screen).
export function BattleRoyaleCoachPanel({
  state,
  onToggleSelect,
  onReveal,
  onEndVoting,
  onAbort,
}: BattleRoyaleCoachPanelProps) {
  if (state.phase !== 'reviewing' && state.phase !== 'voting') return null;

  if (state.phase === 'reviewing') {
    // If fewer than 3 submissions arrived, everyone gets to be a "finalist"
    // automatically (there's nothing to pick from). Coach's picker pre-selects
    // all of them; the Reveal button uses a dynamic target instead of a hard 3.
    const maxPick = Math.min(3, state.received.length);
    const canReveal = state.selected.size === maxPick && maxPick > 0;
    const noneReceived = state.received.length === 0;
    const pickerLabel = state.received.length < 3
      ? `Reveal all ${state.received.length}`
      : `Pick top 3`;
    const subLabel = state.received.length < 3
      ? `${state.received.length} submission${state.received.length === 1 ? '' : 's'} — all will be revealed`
      : `${state.received.length} submissions · selected ${state.selected.size}/3`;

    return (
      <div className="w-[340px] shrink-0 border-l border-white/10 flex flex-col bg-zinc-950/60">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-200/80">
              {pickerLabel}
            </div>
            <div className="text-[12px] text-white/60">
              {subLabel}
            </div>
          </div>
          <button
            onClick={onAbort}
            title="Abort round"
            className="text-[10px] font-mono uppercase tracking-wider text-white/40 hover:text-red-400 transition-colors"
          >
            Abort
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {noneReceived ? (
            <div className="text-[11px] text-white/40 text-center pt-6 font-mono leading-relaxed">
              No submissions received.<br />Click Abort to end this round.
            </div>
          ) : (
            state.received.map((sub) => {
              const selected = state.selected.has(sub.id);
              const canSelect = selected || state.selected.size < maxPick;
              return (
                <button
                  key={sub.id}
                  onClick={() => canSelect && onToggleSelect(sub.id)}
                  disabled={!canSelect}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selected
                      ? 'border-amber-400/60 bg-amber-400/10'
                      : canSelect
                      ? 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                      : 'border-white/5 bg-white/[0.01] opacity-40 cursor-not-allowed'
                  }`}
                >
                  <div className="text-[12.5px] text-white leading-snug whitespace-pre-wrap">
                    {sub.text}
                  </div>
                  {selected && (
                    <div className="mt-1.5 text-[9px] font-mono uppercase tracking-wider text-amber-300/90">
                      ✓ Selected
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="px-3 py-3 border-t border-white/10">
          <button
            onClick={onReveal}
            disabled={!canReveal}
            className="w-full px-4 py-2 text-[12px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {state.received.length < 3 && !noneReceived
              ? `Reveal all ${state.received.length} for voting`
              : 'Reveal top 3'}
          </button>
          {!canReveal && !noneReceived && (
            <div className="mt-1.5 text-[10px] text-white/40 text-center">
              {state.received.length < 3
                ? 'All submissions already pre-selected.'
                : 'Select exactly 3 to reveal.'}
            </div>
          )}
        </div>
      </div>
    );
  }

  // state.phase === 'voting'
  const sorted = state.reveals
    .map((r) => ({ ...r, count: state.votes[r.id] ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="w-[340px] shrink-0 border-l border-white/10 flex flex-col bg-zinc-950/60">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-200/80">
            Live votes
          </div>
          <div className="text-[12px] text-white/60">
            Total: {sorted.reduce((a, b) => a + b.count, 0)}
          </div>
        </div>
        <button
          onClick={onAbort}
          title="Abort round"
          className="text-[10px] font-mono uppercase tracking-wider text-white/40 hover:text-red-400 transition-colors"
        >
          Abort
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {sorted.map((r, i) => (
          <div
            key={r.id}
            className="p-3 rounded-lg border border-white/10 bg-white/[0.02]"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                  Rank #{i + 1}
                </span>
                {r.from && (
                  <span className="text-[10px] font-mono text-white/40">· {r.from}</span>
                )}
              </div>
              <span className="text-[12px] font-mono font-bold tabular-nums text-white">
                {r.count}
              </span>
            </div>
            <div className="text-[12px] text-white/80 leading-snug whitespace-pre-wrap">
              {r.text}
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 py-3 border-t border-white/10">
        <button
          onClick={onEndVoting}
          className="w-full px-4 py-2 text-[12px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 transition-opacity"
        >
          End voting + announce winner
        </button>
      </div>
    </div>
  );
}
