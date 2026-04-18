import React, { useState } from 'react';
import type { StatsVerificationRequest } from '../../convex';
import { approveVerificationRequest, rejectVerificationRequest } from '../../convex';

interface VerificationRequestCardProps {
  founderId: string;
  request: StatsVerificationRequest;
  onActionComplete: () => void;
  onOpenImage: (url: string) => void;
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) {
    const k = Math.round(n / 100) / 10;
    return k === Math.floor(k) ? `$${k}k` : `$${k.toFixed(1)}k`;
  }
  return `$${n.toLocaleString()}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function VerificationRequestCard({
  founderId,
  request,
  onActionComplete,
  onOpenImage,
}: VerificationRequestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setSubmitting(true);
    setError(null);
    const res = await approveVerificationRequest(founderId, request.requestId);
    setSubmitting(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    onActionComplete();
  }

  async function handleReject() {
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await rejectVerificationRequest(founderId, request.requestId, reason.trim());
    setSubmitting(false);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    onActionComplete();
  }

  const statusPillClass =
    request.status === 'pending'
      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
      : request.status === 'approved'
        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="shrink-0">
          {request.user?.photoUrl ? (
            <img src={request.user.photoUrl} alt={request.user.name} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">
              {request.user?.name?.charAt(0) ?? '?'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {request.user?.name ?? 'Unknown user'}
            </span>
            <span className={`text-[9px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${statusPillClass}`}>
              {request.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            <span>{formatDate(request.submittedAt)}</span>
            <span>·</span>
            <span>{request.payStubUrls.length} pay {request.payStubUrls.length === 1 ? 'stub' : 'stubs'}</span>
            {request.crmUrls.length > 0 && (
              <>
                <span>·</span>
                <span>{request.crmUrls.length} CRM</span>
              </>
            )}
          </div>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100 dark:border-gray-800">
          {/* Claimed stats */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Claimed stats
            </p>
            <div className="grid grid-cols-3 gap-2">
              <StatPill
                label="Cash Collected"
                value={
                  request.claimedStats.cashCollected != null
                    ? formatCurrency(request.claimedStats.cashCollected)
                    : '—'
                }
              />
              <StatPill
                label="Close Rate"
                value={
                  request.claimedStats.closeRate != null
                    ? `${request.claimedStats.closeRate}%`
                    : '—'
                }
              />
              <StatPill
                label="Calls"
                value={
                  request.claimedStats.callsCompleted != null
                    ? request.claimedStats.callsCompleted.toLocaleString()
                    : '—'
                }
              />
            </div>
          </div>

          {/* Context */}
          {request.context && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Context
              </p>
              <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{request.context}</p>
            </div>
          )}

          {/* Pay stubs */}
          {request.payStubUrls.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Pay stubs
              </p>
              <div className="grid grid-cols-4 gap-2">
                {request.payStubUrls.map((url, i) => (
                  <button
                    key={`stub-${i}`}
                    onClick={() => onOpenImage(url)}
                    className="block w-full h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-black/30 dark:hover:ring-white/30"
                  >
                    <img src={url} alt={`Pay stub ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CRM */}
          {request.crmUrls.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                CRM screenshots
              </p>
              <div className="grid grid-cols-4 gap-2">
                {request.crmUrls.map((url, i) => (
                  <button
                    key={`crm-${i}`}
                    onClick={() => onOpenImage(url)}
                    className="block w-full h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-black/30 dark:hover:ring-white/30"
                  >
                    <img src={url} alt={`CRM ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Rejection reason (read-only if already rejected) */}
          {request.status === 'rejected' && request.rejectionReason && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40">
              <p className="text-[10px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider mb-0.5">
                Rejection reason
              </p>
              <p className="text-xs text-red-800 dark:text-red-300">{request.rejectionReason}</p>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-md bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Actions — only show for pending */}
          {request.status === 'pending' && (
            <>
              {showRejectForm ? (
                <div className="space-y-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value.slice(0, 1000))}
                    rows={3}
                    placeholder="Explain why this couldn't be approved (will be sent to the user via Sequ3nce Inbox)..."
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/10 text-gray-900 dark:text-white placeholder-gray-400"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setShowRejectForm(false); setReason(''); setError(null); }}
                      disabled={submitting}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={submitting || !reason.trim()}
                      className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40"
                    >
                      {submitting ? 'Rejecting…' : 'Reject + send reason'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowRejectForm(true)}
                    disabled={submitting}
                    className="px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={submitting}
                    className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:opacity-80 transition-opacity disabled:opacity-40"
                  >
                    {submitting ? 'Approving…' : 'Approve'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <p className="text-[9px] font-mono font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}
