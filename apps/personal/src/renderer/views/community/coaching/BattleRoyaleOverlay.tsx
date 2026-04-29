import React, { useEffect, useState } from 'react';
import type { BattleRoyaleState, BRReveal } from './BattleRoyaleTypes';

interface BattleRoyaleOverlayProps {
  state: BattleRoyaleState;
  /** Attendee submits their rebuttal during the 'submitting' phase. */
  onSubmit: (text: string) => void;
  /** Attendee picks a reveal during the 'voting' phase. Can change vote once. */
  onVote: (revealId: string) => void;
  /** Attendee-side state update for the input text (so coach-side mirror-state
   *  in the parent stays coherent if we ever want to render it). */
  onDraftChange: (text: string) => void;
}

// The in-call overlay shown to ALL participants while a Battle Royale round
// is active. Renders as a centered card over the video grid (doesn't replace
// the video — faces are still visible above/below).
//
// Coach-specific UI for the review phase lives in BattleRoyaleCoachPanel.
export function BattleRoyaleOverlay({
  state,
  onSubmit,
  onVote,
  onDraftChange,
}: BattleRoyaleOverlayProps) {
  if (state.phase === 'idle') return null;

  // Once the attendee has submitted their rebuttal, get the popup out of
  // their way — they don't need to see anything until voting opens. Without
  // this, the overlay sits on screen the entire round (submit → reviewing →
  // voting → complete), which feels like an unkillable modal to the user.
  if (state.phase === 'submitting' && state.mySubmissionId !== null) {
    return null;
  }
  // Reviewing is dead time for attendees (coach is picking) and the coach
  // already has BattleRoyaleCoachPanel as a side panel — the overlay's
  // "Coach is picking finalists" card adds nothing for either role.
  if (state.phase === 'reviewing') {
    return null;
  }

  // Every phase is a visually similar card; phase-specific content inside.
  return (
    <div className="absolute inset-x-0 top-4 z-[20] flex justify-center pointer-events-none">
      <div className="pointer-events-auto w-[min(520px,92%)] rounded-xl bg-zinc-950/95 border border-white/10 shadow-2xl backdrop-blur overflow-hidden">
        {state.phase === 'submitting' && (
          <SubmittingCard
            objection={state.objection}
            endTime={state.submitEndTime}
            myText={state.myText}
            submitted={state.mySubmissionId !== null}
            onDraftChange={onDraftChange}
            onSubmit={onSubmit}
          />
        )}
        {state.phase === 'submitting-coach' && (
          <WaitingCard
            title="Battle Royale in progress"
            subtitle={`${state.received.length} submission${state.received.length === 1 ? '' : 's'} received`}
            objection={state.objection}
            endTime={state.submitEndTime}
            tone="coach"
          />
        )}
        {state.phase === 'reviewing' && (
          <WaitingCard
            title="Coach is picking finalists"
            subtitle="Hang tight — 3 rebuttals are about to go up for a vote."
            objection={state.objection}
            tone="attendee"
          />
        )}
        {state.phase === 'voting' && (
          <VotingCard
            objection={state.objection}
            reveals={state.reveals}
            votes={state.votes}
            myVote={state.myVote}
            endTime={state.voteEndTime}
            onVote={onVote}
          />
        )}
        {state.phase === 'complete' && (
          <WinnerCard objection={state.objection} winner={state.winner} />
        )}
      </div>
    </div>
  );
}

// ==================== Subcomponents ====================

function SubmittingCard({
  objection,
  endTime,
  myText,
  submitted,
  onDraftChange,
  onSubmit,
}: {
  objection: string;
  endTime: number;
  myText: string;
  submitted: boolean;
  onDraftChange: (text: string) => void;
  onSubmit: (text: string) => void;
}) {
  const secondsLeft = useCountdown(endTime);
  const canSubmit = !submitted && myText.trim().length > 0 && secondsLeft > 0;

  return (
    <>
      <Header label="Objection Battle Royale" countdown={secondsLeft} />
      <div className="px-6 py-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/50 mb-1">
          The objection
        </div>
        <div className="text-[14px] font-semibold text-white mb-4 italic">
          &ldquo;{objection}&rdquo;
        </div>

        <div className="text-[10px] font-mono uppercase tracking-wider text-white/50 mb-1">
          Your rebuttal
        </div>
        <textarea
          value={myText}
          onChange={(e) => onDraftChange(e.target.value)}
          disabled={submitted || secondsLeft === 0}
          placeholder="Type the best response you'd use in a real call..."
          rows={3}
          maxLength={1000}
          className="w-full px-3 py-2 text-[13px] bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-white/30 resize-none disabled:opacity-50"
          autoFocus
        />

        <div className="mt-3 flex items-center justify-between">
          <div className="text-[10px] text-white/40">{myText.length}/1000</div>
          <button
            onClick={() => canSubmit && onSubmit(myText.trim())}
            disabled={!canSubmit}
            className="px-4 py-1.5 text-[12px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {submitted ? 'Submitted' : 'Submit'}
          </button>
        </div>
      </div>
    </>
  );
}

function VotingCard({
  objection,
  reveals,
  votes,
  myVote,
  endTime,
  onVote,
}: {
  objection: string;
  reveals: BRReveal[];
  votes: Record<string, number>;
  myVote: string | null;
  endTime: number;
  onVote: (revealId: string) => void;
}) {
  const secondsLeft = useCountdown(endTime);
  const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);

  return (
    <>
      <Header label="Vote for the best rebuttal" countdown={secondsLeft} />
      <div className="px-6 py-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/50 mb-1">
          The objection
        </div>
        <div className="text-[13px] text-white/80 mb-4 italic">
          &ldquo;{objection}&rdquo;
        </div>

        <div className="space-y-2">
          {reveals.map((r, i) => {
            const count = votes[r.id] ?? 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const selected = myVote === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onVote(r.id)}
                disabled={secondsLeft === 0}
                className={`relative w-full text-left p-3 rounded-lg border transition-colors overflow-hidden ${
                  selected
                    ? 'border-white bg-white/10'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {/* Vote-progress bar behind the text */}
                <div
                  className="absolute inset-y-0 left-0 bg-white/5 transition-all"
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 text-white/70 text-[11px] font-bold flex items-center justify-center">
                    {String.fromCharCode(65 + i)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-white leading-snug whitespace-pre-wrap">
                      {r.text}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-[11px] font-mono font-bold text-white/70 tabular-nums">
                    {count}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function WinnerCard({ objection, winner }: { objection: string; winner: BRReveal }) {
  return (
    <>
      <Header label="Winner" />
      <div className="px-6 py-5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/50 mb-1">
          Community's pick for
        </div>
        <div className="text-[12px] text-white/60 italic mb-4">
          &ldquo;{objection}&rdquo;
        </div>

        <div className="p-4 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-400/5 border border-amber-400/30">
          <div className="text-[14px] text-white leading-snug whitespace-pre-wrap mb-3">
            {winner.text}
          </div>
          {winner.from && (
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-300/80">
              — {winner.from}
            </div>
          )}
        </div>

        <div className="mt-3 text-[11px] text-white/40 italic">
          Saved to the Objection Playbook.
        </div>
      </div>
    </>
  );
}

function WaitingCard({
  title,
  subtitle,
  objection,
  endTime,
  tone,
}: {
  title: string;
  subtitle: string;
  objection: string;
  endTime?: number;
  tone: 'coach' | 'attendee';
}) {
  const secondsLeft = useCountdown(endTime);
  return (
    <>
      <Header label={title} countdown={endTime !== undefined ? secondsLeft : undefined} />
      <div className="px-6 py-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-white/50 mb-1">
          Objection
        </div>
        <div className="text-[13px] text-white/80 mb-3 italic">&ldquo;{objection}&rdquo;</div>
        <div className={`text-[12px] ${tone === 'coach' ? 'text-white/70' : 'text-white/50'}`}>
          {subtitle}
        </div>
      </div>
    </>
  );
}

function Header({ label, countdown }: { label: string; countdown?: number }) {
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-gradient-to-r from-amber-500/20 to-amber-400/0">
      <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-200/80">
        {label}
      </span>
      {countdown !== undefined && (
        <span className="text-[11px] font-mono font-bold tabular-nums text-white">
          {countdown}s
        </span>
      )}
    </div>
  );
}

// ---- Small hook ----
function useCountdown(endTime: number | undefined): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (endTime === undefined) return;
    const iv = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(iv);
  }, [endTime]);
  if (endTime === undefined) return 0;
  return Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
}
