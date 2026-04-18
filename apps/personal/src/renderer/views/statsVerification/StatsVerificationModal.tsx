import React, { useState } from 'react';
import { submitVerificationRequest } from '../../convex';
import { EvidenceUploadField, type UploadedEvidence } from './EvidenceUploadField';

const MAX_CONTEXT = 500;

interface StatsVerificationModalProps {
  userId: string;
  initialStats?: {
    cashCollected?: number;
    closeRate?: number;
    callsCompleted?: number;
  };
  onClose: () => void;
  onSubmitted: () => void;
}

export function StatsVerificationModal({
  userId,
  initialStats,
  onClose,
  onSubmitted,
}: StatsVerificationModalProps) {
  const [cashCollected, setCashCollected] = useState(
    initialStats?.cashCollected ? String(initialStats.cashCollected) : ''
  );
  const [closeRate, setCloseRate] = useState(
    initialStats?.closeRate ? String(initialStats.closeRate) : ''
  );
  const [callsCompleted, setCallsCompleted] = useState(
    initialStats?.callsCompleted ? String(initialStats.callsCompleted) : ''
  );
  const [context, setContext] = useState('');
  const [payStubs, setPayStubs] = useState<UploadedEvidence[]>([]);
  const [crmShots, setCrmShots] = useState<UploadedEvidence[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAtLeastOneStat =
    parseFloat(cashCollected) > 0 || parseFloat(closeRate) > 0 || parseInt(callsCompleted, 10) > 0;
  const canSubmit = !submitting && payStubs.length >= 1 && hasAtLeastOneStat;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const claimedStats: { cashCollected?: number; closeRate?: number; callsCompleted?: number } = {};
    const cash = parseFloat(cashCollected);
    if (Number.isFinite(cash) && cash > 0) claimedStats.cashCollected = cash;
    const close = parseFloat(closeRate);
    if (Number.isFinite(close) && close > 0) claimedStats.closeRate = close;
    const calls = parseInt(callsCompleted, 10);
    if (Number.isFinite(calls) && calls > 0) claimedStats.callsCompleted = calls;

    const res = await submitVerificationRequest(
      userId,
      claimedStats,
      payStubs.map((p) => p.storageId),
      crmShots.map((c) => c.storageId),
      context.trim() || undefined
    );
    setSubmitting(false);

    if ('error' in res) {
      setError(res.error);
      return;
    }

    // Cleanup object URLs
    for (const p of payStubs) URL.revokeObjectURL(p.previewUrl);
    for (const c of crmShots) URL.revokeObjectURL(c.previewUrl);
    onSubmitted();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6">
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Verify stats
            </p>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
              Submit for verification
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          <div>
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Your claimed stats
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-snug">
              Fill in the stats you want verified on your profile. Leave blank any you can&apos;t back up.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <InputField
                label="Cash Collected ($)"
                value={cashCollected}
                onChange={setCashCollected}
                placeholder="50000"
              />
              <InputField
                label="Close Rate (%)"
                value={closeRate}
                onChange={setCloseRate}
                placeholder="35"
              />
              <InputField
                label="Calls Completed"
                value={callsCompleted}
                onChange={setCallsCompleted}
                placeholder="250"
              />
            </div>
          </div>

          <EvidenceUploadField
            userId={userId}
            label="Pay stubs"
            hint="Upload 1-6 screenshots of recent pay stubs (typically 3 months)."
            minFiles={1}
            maxFiles={6}
            uploaded={payStubs}
            onChange={setPayStubs}
            testId="evidence-paystubs-input"
          />

          <EvidenceUploadField
            userId={userId}
            label="CRM screenshots (optional)"
            hint="Close rate and call volume. Optional but recommended."
            minFiles={0}
            maxFiles={4}
            uploaded={crmShots}
            onChange={setCrmShots}
            testId="evidence-crm-input"
          />

          <div>
            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Context (optional)
            </label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value.slice(0, MAX_CONTEXT))}
              rows={3}
              placeholder="e.g. Last 3 months at Agency X — I hit quota in Feb and Mar but dipped in April"
              className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 text-gray-900 dark:text-white placeholder-gray-400"
            />
            <div className="flex justify-end text-[10px] text-gray-400 mt-0.5">
              {context.length}/{MAX_CONTEXT}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40">
            <p className="text-xs text-yellow-800 dark:text-yellow-300 leading-relaxed">
              <span className="font-bold">⚠ We verify every submission.</span> Sequ3nce uses automated image-analysis tools to detect edited or AI-generated pay stubs. Submitting falsified evidence results in permanent account suspension and loss of all verified status. Only submit what you can honestly back up.
            </p>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-md bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting…' : 'Submit for verification'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-mono font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 text-gray-900 dark:text-white placeholder-gray-400"
      />
    </div>
  );
}
