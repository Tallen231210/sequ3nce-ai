// ============================================================================
// A closer fixing the numbers on their own call.
//
// The post-call form is gone, so these figures are read off the recording. That
// works well for a deal paid in full and less well for a payment plan, where
// what was actually charged today can be a detail buried in a sentence.
//
// The closer is the one person who knows for certain. This is the fastest place
// for them to say so — they are already looking at the call — and it is the same
// record Collections and the team board read, so a correction here lands
// everywhere at once.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { updateOwnCallFacts } from '../convex';

const OUTCOMES = [
  { value: 'closed', label: 'Closed' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'lost', label: 'Not closed' },
  { value: 'no_show', label: 'No show' },
  { value: 'rescheduled', label: 'Rescheduled' },
];

/** Empty clears the value; anything unparseable is rejected rather than guessed. */
function toNumberOrNull(raw: string): number | null | undefined {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

interface Props {
  callId: string;
  closerId: string;
  outcome?: string;
  cashCollected?: number | null;
  contractValue?: number | null;
  outcomeSource?: string | null;
  onSaved?: () => void;
}

export function CallFactsInlineEditor({
  callId,
  closerId,
  outcome: initialOutcome,
  cashCollected: initialCash,
  contractValue: initialContract,
  outcomeSource,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState(initialOutcome ?? '');
  const [cash, setCash] = useState(initialCash != null ? String(initialCash) : '');
  const [contract, setContract] = useState(
    initialContract != null ? String(initialContract) : '',
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extraction can land while the sheet is open, so follow the record.
  useEffect(() => {
    setOutcome(initialOutcome ?? '');
    setCash(initialCash != null ? String(initialCash) : '');
    setContract(initialContract != null ? String(initialContract) : '');
  }, [initialOutcome, initialCash, initialContract]);

  const isAi = outcomeSource === 'ai';

  // Nothing to save until something changed. Without this, opening the panel
  // and pressing Save stamps "a human confirmed this" on a call carrying no
  // figures at all — which quietly removes it from any future backfill.
  const dirty =
    outcome !== (initialOutcome ?? '') ||
    cash !== (initialCash != null ? String(initialCash) : '') ||
    contract !== (initialContract != null ? String(initialContract) : '');

  async function save() {
    const cashValue = toNumberOrNull(cash);
    const contractValue = toNumberOrNull(contract);
    if (cashValue === undefined || contractValue === undefined) {
      setError('Those need to be numbers.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await updateOwnCallFacts(callId, closerId, {
      outcome: outcome === '' ? null : outcome,
      cashCollected: cashValue,
      contractValue,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? "Couldn't save that.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setOpen(false);
    onSaved?.();
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => setOpen(true)}
          className="text-[12px] font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
        >
          {isAi ? 'Check these figures' : 'Edit figures'}
        </button>
        {saved && <span className="text-[12px] text-green-600">Saved</span>}
      </div>
    );
  }

  const inputClass =
    'w-full rounded-md border border-gray-300 px-2 py-1.5 text-[13px] outline-none focus:border-gray-900';

  return (
    <div className="mt-2 space-y-2.5 rounded-lg border border-gray-200 bg-white p-3">
      {isAi && (
        <p className="text-[12px] leading-relaxed text-gray-500">
          These were read off the recording. If this was a payment plan, cash
          collected should be what was actually charged on the day.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <label className="flex-1 min-w-[110px]">
          <span className="text-[11px] font-medium text-gray-500">Outcome</span>
          <select
            value={outcome}
            disabled={busy}
            onChange={(e) => setOutcome(e.target.value)}
            className={`mt-0.5 ${inputClass}`}
          >
            <option value="">Not set</option>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex-1 min-w-[100px]">
          <span className="text-[11px] font-medium text-gray-500">Cash collected</span>
          <input
            value={cash}
            disabled={busy}
            inputMode="decimal"
            placeholder="—"
            onChange={(e) => setCash(e.target.value)}
            className={`mt-0.5 ${inputClass}`}
          />
        </label>
        <label className="flex-1 min-w-[100px]">
          <span className="text-[11px] font-medium text-gray-500">Contract value</span>
          <input
            value={contract}
            disabled={busy}
            inputMode="decimal"
            placeholder="—"
            onChange={(e) => setContract(e.target.value)}
            className={`mt-0.5 ${inputClass}`}
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-[13px] text-gray-500 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>

      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
