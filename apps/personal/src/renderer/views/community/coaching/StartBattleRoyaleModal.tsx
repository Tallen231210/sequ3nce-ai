import React, { useState } from 'react';

interface StartBattleRoyaleModalProps {
  onClose: () => void;
  onStart: (args: { objection: string; submitSec: number; voteSec: number }) => void;
}

// Coaches pick from a small set of canonical objections OR type a custom one.
// Sourcing these here hardcoded is deliberate for v1 — a future iteration
// could pull the top Playbook entries so the BR cycle feeds itself.
const PRESET_OBJECTIONS: string[] = [
  'I need to think about it.',
  "I can't afford it right now.",
  'I need to talk to my spouse.',
  "Your competitor is cheaper.",
  "I need to do more research.",
  "I've tried something like this before and it didn't work.",
];

const TIMER_CHOICES = [30, 45, 60] as const;

export function StartBattleRoyaleModal({ onClose, onStart }: StartBattleRoyaleModalProps) {
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [preset, setPreset] = useState<string>(PRESET_OBJECTIONS[0]);
  const [custom, setCustom] = useState('');
  const [submitSec, setSubmitSec] = useState<number>(45);
  const [voteSec, setVoteSec] = useState<number>(45);

  const objection = mode === 'preset' ? preset : custom.trim();
  const canStart = !!objection;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[520px] rounded-xl bg-zinc-900 border border-white/10 shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-white/10">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">
            Coach control
          </div>
          <div className="text-[18px] font-bold text-white">Start Objection Battle Royale</div>
          <p className="text-[12px] text-white/50 mt-1 leading-snug">
            Broadcast an objection to everyone in the call. Each attendee gets a timer to type their best rebuttal.
            You pick the top 3, the group votes, and the winner saves to the Playbook.
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Objection source picker */}
          <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10 w-fit">
            <button
              onClick={() => setMode('preset')}
              className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                mode === 'preset' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              Preset
            </button>
            <button
              onClick={() => setMode('custom')}
              className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                mode === 'custom' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              Custom
            </button>
          </div>

          {mode === 'preset' ? (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                Objection
              </label>
              <select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-[13px] bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-white/30"
              >
                {PRESET_OBJECTIONS.map((o) => (
                  <option key={o} value={o} className="bg-zinc-900">
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                Custom objection
              </label>
              <input
                type="text"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder='e.g., "I need to see ROI before committing"'
                maxLength={300}
                className="mt-1 w-full px-3 py-2 text-[13px] bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-white/30"
              />
            </div>
          )}

          {/* Timer choices */}
          <div className="grid grid-cols-2 gap-4">
            <TimerPicker
              label="Submit timer"
              value={submitSec}
              onChange={setSubmitSec}
            />
            <TimerPicker
              label="Vote timer"
              value={voteSec}
              onChange={setVoteSec}
            />
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
            onClick={() => canStart && onStart({ objection, submitSec, voteSec })}
            disabled={!canStart}
            className="px-5 py-2 text-[13px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            Start round
          </button>
        </div>
      </div>
    </div>
  );
}

function TimerPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-mono uppercase tracking-wider text-white/50">
        {label}
      </label>
      <div className="mt-1 grid grid-cols-3 gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
        {TIMER_CHOICES.map((sec) => (
          <button
            key={sec}
            onClick={() => onChange(sec)}
            className={`py-1 text-[11px] font-semibold rounded-md transition-colors ${
              value === sec ? 'bg-white text-black' : 'text-white/60 hover:text-white'
            }`}
          >
            {sec}s
          </button>
        ))}
      </div>
    </div>
  );
}
