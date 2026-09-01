"use client";

import React, { useCallback, useEffect, useState } from 'react';
import {
  confirmCallFacts,
  getCallsToConfirm,
  type ConfirmCall,
} from '@/lib/closer/client';
import { AddMissedCallRow } from './AddMissedCallRow';
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

  const refetch = useCallback(async () => {
    const res = await getCallsToConfirm(closerId);
    if (res) setCalls(res.calls);
  }, [closerId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  if (!calls) return null; // still loading

  // Zero recorded calls is EXACTLY when "add a call we missed" matters most
  // (bot never admitted all week) — so the card stays, slimmed down.
  if (calls.length === 0) {
    return (
      <div className="mb-5 rounded-lg border border-gray-200/60 bg-[#fafafa] p-4">
        <p className={LABEL}>Your recent calls</p>
        <p className="mt-2 text-[12px] text-gray-500">
          No recorded calls in the last few days. If you took calls the bot
          missed, add them here so they count.
        </p>
        <AddMissedCallRow
          closerId={closerId}
          onAdded={() => {
            void refetch();
            onDataChanged?.();
          }}
        />
      </div>
    );
  }

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

      <AddMissedCallRow
        closerId={closerId}
        onAdded={() => {
          void refetch();
          onDataChanged?.();
        }}
      />

      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
