"use client";

// "+ Add a call we missed" — recording coverage has holes (a bot not
// admitted from the waiting room is normal), so the confirm strip needs a
// way to enter the call that never got recorded. Creates a real call row
// server-side; the recount folds it into the day automatically.

import React, { useState } from 'react';
import { addManualCall } from '@/lib/closer/client';

const MANUAL_OUTCOMES = [
  ['closed', 'Closed'],
  ['follow_up', 'Follow-up'],
  ['lost', 'No close'],
  ['no_show', 'No show'],
] as const;

/** Local YYYY-MM-DD (not toISOString — that rolls to tomorrow every evening
 *  west of Greenwich). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const INPUT =
  'rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] focus:border-black focus:outline-none';

export function AddMissedCallRow({
  closerId,
  onAdded,
}: {
  closerId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState({
    prospectName: '', date: todayIso(), outcome: 'closed', cash: '', contract: '',
  });

  const submit = async () => {
    const name = values.prospectName.trim();
    if (!name) {
      setError('Give the prospect a name.');
      return;
    }
    setBusy(true);
    setError(null);
    // The server places the call inside this TEAM-local day (now if today,
    // noon otherwise) — the browser's clock and timezone stay out of it.
    const cash = values.cash.trim();
    const contract = values.contract.trim();
    const res = await addManualCall(closerId, {
      prospectName: name,
      dayKey: values.date,
      outcome: values.outcome,
      ...(cash !== '' ? { cashCollected: Number(cash.replace(/[$,\s]/g, '')) } : {}),
      ...(contract !== '' ? { contractValue: Number(contract.replace(/[$,\s]/g, '')) } : {}),
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error ?? 'Could not add the call.');
      return;
    }
    setValues({ prospectName: '', date: todayIso(), outcome: 'closed', cash: '', contract: '' });
    setOpen(false);
    onAdded();
  };

  return (
    <div className="mt-3 border-t border-gray-200/60 pt-3">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[12px] font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
        >
          + Add a call we missed
        </button>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-[10px] text-gray-500">Prospect</label>
            <input
              type="text"
              value={values.prospectName}
              onChange={(e) => setValues((v) => ({ ...v, prospectName: e.target.value }))}
              className={`w-full ${INPUT}`}
              placeholder="Who was the call with?"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-gray-500">Day</label>
            <input
              type="date"
              value={values.date}
              max={todayIso()}
              min={isoDaysAgo(6)}
              onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
              className={INPUT}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] text-gray-500">Outcome</label>
            <select
              value={values.outcome}
              onChange={(e) => setValues((v) => ({ ...v, outcome: e.target.value }))}
              className="rounded-md border border-gray-200 px-2 py-1.5 text-[13px] focus:border-black focus:outline-none"
            >
              {MANUAL_OUTCOMES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="w-24">
            <label className="mb-1 block text-[10px] text-gray-500">Cash</label>
            <input
              type="number"
              inputMode="decimal"
              value={values.cash}
              placeholder="—"
              onChange={(e) => setValues((v) => ({ ...v, cash: e.target.value }))}
              className={`w-full font-mono ${INPUT}`}
            />
          </div>
          <div className="w-24">
            <label className="mb-1 block text-[10px] text-gray-500">Contract</label>
            <input
              type="number"
              inputMode="decimal"
              value={values.contract}
              placeholder="—"
              onChange={(e) => setValues((v) => ({ ...v, contract: e.target.value }))}
              className={`w-full font-mono ${INPUT}`}
            />
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Adding…' : 'Add call'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setError(null); }}
              className="text-[13px] text-gray-500 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
