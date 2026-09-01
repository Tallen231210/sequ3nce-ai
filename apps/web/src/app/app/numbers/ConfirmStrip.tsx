"use client";

import React, { useCallback, useEffect, useState } from 'react';
import {
  addManualCall,
  confirmCallFacts,
  getCallsToConfirm,
  type ConfirmCall,
} from '@/lib/closer/client';
import { CallFactsInlineEditor } from '../_components/CallFactsInlineEditor';

const LABEL = 'text-[11px] font-medium text-gray-500 uppercase tracking-wider';

const OUTCOME_STYLES: Record<string, string> = {
  closed: 'bg-green-50 text-green-700',
  follow_up: 'bg-blue-50 text-blue-700',
  lost: 'bg-gray-100 text-gray-600',
  no_show: 'bg-amber-50 text-amber-700',
  rescheduled: 'bg-purple-50 text-purple-700',
};

const OUTCOME_LABELS: Record<string, string> = {
  closed: 'Closed',
  follow_up: 'Follow-up',
  lost: 'No close',
  no_show: 'No show',
  rescheduled: 'Rescheduled',
};

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) {
    return <span className="text-[11px] text-gray-400">No outcome</span>;
  }
  return (
    <span
      className={
        'inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ' +
        (OUTCOME_STYLES[outcome] ?? 'bg-gray-100 text-gray-600')
      }
    >
      {OUTCOME_LABELS[outcome] ?? outcome}
    </span>
  );
}

function whenLabel(startedAt: number): string {
  return new Date(startedAt).toLocaleString(undefined, {
    weekday: 'short', hour: 'numeric', minute: '2-digit',
  });
}

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

/**
 * The last few days of recorded calls, prefilled with what the AI read, for
 * the closer to confirm or fix in one place. Accuracy machine: every call
 * gets human eyes daily. Self-hiding when there's nothing to show.
 */
export function ConfirmStrip({
  closerId,
  onDataChanged,
}: {
  closerId: string;
  onDataChanged?: () => void;
}) {
  const [calls, setCalls] = useState<ConfirmCall[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addValues, setAddValues] = useState({
    prospectName: '', date: todayIso(), outcome: 'closed', cash: '', contract: '',
  });

  const refetch = useCallback(async () => {
    const res = await getCallsToConfirm(closerId);
    if (res) setCalls(res.calls);
  }, [closerId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!calls || calls.length === 0) return null;

  const unconfirmed = calls.filter((c) => !c.factsConfirmedAt);

  const confirmOne = async (callId: string) => {
    setBusyId(callId);
    setError(null);
    const res = await confirmCallFacts(closerId, callId);
    if (!res.success) setError(res.error ?? 'Could not confirm — try again.');
    await refetch();
    setBusyId(null);
  };

  const confirmAll = async () => {
    setConfirmingAll(true);
    setError(null);
    for (const c of unconfirmed) {
      const res = await confirmCallFacts(closerId, c._id);
      if (!res.success) {
        setError(res.error ?? 'Could not confirm — try again.');
        break;
      }
    }
    await refetch();
    setConfirmingAll(false);
  };

  const submitManual = async () => {
    const name = addValues.prospectName.trim();
    if (!name) {
      setError('Give the prospect a name.');
      return;
    }
    setAddBusy(true);
    setError(null);
    // Noon local on the chosen day — unambiguous inside the team-local day.
    const startedAt = new Date(`${addValues.date}T12:00:00`).getTime();
    const cash = addValues.cash.trim();
    const contract = addValues.contract.trim();
    const res = await addManualCall(closerId, {
      prospectName: name,
      startedAt,
      outcome: addValues.outcome,
      ...(cash !== '' ? { cashCollected: Number(cash.replace(/[$,\s]/g, '')) } : {}),
      ...(contract !== '' ? { contractValue: Number(contract.replace(/[$,\s]/g, '')) } : {}),
    });
    if (!res.success) {
      setError(res.error ?? 'Could not add the call.');
      setAddBusy(false);
      return;
    }
    setAddValues({ prospectName: '', date: todayIso(), outcome: 'closed', cash: '', contract: '' });
    setAdding(false);
    setAddBusy(false);
    await refetch();
    onDataChanged?.();
  };

  return (
    <div className="mb-5 rounded-lg border border-gray-200/60 bg-[#fafafa] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className={LABEL}>Your recent calls — confirm the numbers</p>
        {unconfirmed.length > 0 && (
          <button
            type="button"
            disabled={confirmingAll}
            onClick={() => void confirmAll()}
            className="shrink-0 rounded-md bg-black px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {confirmingAll ? 'Confirming…' : `Confirm all (${unconfirmed.length})`}
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-200/60">
        {calls.map((c) => (
          <div key={c._id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-20 shrink-0 text-[12px] text-gray-400">
                {whenLabel(c.startedAt)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900">
                {c.prospectName}
              </span>
              <OutcomeBadge outcome={c.outcome} />
              <span className="w-24 text-right text-[13px] font-mono">
                {typeof c.cashCollected === 'number' && c.cashCollected > 0 ? (
                  <span className="text-green-700">${c.cashCollected.toLocaleString()}</span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </span>
              {c.outcomeSource === 'ai' && !c.factsConfirmedAt && (
                <span className="text-[11px] text-gray-400" title="Read by AI from the recording — check it">
                  AI-read
                </span>
              )}
              {c.factsConfirmedAt ? (
                <span className="text-[12px] text-green-600">✓ Confirmed</span>
              ) : (
                <button
                  type="button"
                  disabled={busyId === c._id || confirmingAll}
                  onClick={() => void confirmOne(c._id)}
                  className="text-[12px] font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900 disabled:opacity-50"
                >
                  {busyId === c._id ? 'Confirming…' : 'Confirm'}
                </button>
              )}
            </div>
            <div className="mt-1 pl-20">
              <CallFactsInlineEditor
                callId={c._id}
                closerId={closerId}
                outcome={c.outcome ?? undefined}
                cashCollected={c.cashCollected}
                contractValue={c.contractValue}
                outcomeSource={c.outcomeSource}
                onSaved={() => {
                  void refetch();
                  onDataChanged?.();
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-gray-200/60 pt-3">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
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
                value={addValues.prospectName}
                onChange={(e) => setAddValues((v) => ({ ...v, prospectName: e.target.value }))}
                className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] focus:border-black focus:outline-none"
                placeholder="Who was the call with?"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-gray-500">Day</label>
              <input
                type="date"
                value={addValues.date}
                max={todayIso()}
                min={isoDaysAgo(6)}
                onChange={(e) => setAddValues((v) => ({ ...v, date: e.target.value }))}
                className="rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] focus:border-black focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-gray-500">Outcome</label>
              <select
                value={addValues.outcome}
                onChange={(e) => setAddValues((v) => ({ ...v, outcome: e.target.value }))}
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
                value={addValues.cash}
                placeholder="—"
                onChange={(e) => setAddValues((v) => ({ ...v, cash: e.target.value }))}
                className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] font-mono focus:border-black focus:outline-none"
              />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-[10px] text-gray-500">Contract</label>
              <input
                type="number"
                inputMode="decimal"
                value={addValues.contract}
                placeholder="—"
                onChange={(e) => setAddValues((v) => ({ ...v, contract: e.target.value }))}
                className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-[13px] font-mono focus:border-black focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <button
                type="button"
                disabled={addBusy}
                onClick={() => void submitManual()}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
              >
                {addBusy ? 'Adding…' : 'Add call'}
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setError(null); }}
                className="text-[13px] text-gray-500 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
