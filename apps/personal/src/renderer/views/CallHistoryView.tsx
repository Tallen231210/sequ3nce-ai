import React, { useEffect, useState, useMemo } from 'react';
import type { CloserInfo, CallHistoryItem, PendingDisposition } from '../convex';
import { getCallHistory, getPendingDispositions } from '../convex';
import { CallDetailSheet } from './CallDetailSheet';
import { TaskHintBanner } from './adoption-checklist/TaskHintBanner';
import { usePoll } from '../lib/usePoll';

type OutcomeFilter = 'all' | 'closed' | 'lost' | 'no_show' | 'follow_up';

const OUTCOME_FILTERS: { value: OutcomeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'closed', label: 'Closed' },
  { value: 'lost', label: 'Not Closed' },
  { value: 'no_show', label: 'No Show' },
  { value: 'follow_up', label: 'Follow Up' },
];

interface CallHistoryViewProps {
  closerInfo: CloserInfo;
  onOpenQuestionnaire?: (callId: string, prospectName?: string) => void;
}

export function CallHistoryView({ closerInfo, onOpenQuestionnaire }: CallHistoryViewProps) {
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [selectedCall, setSelectedCall] = useState<CallHistoryItem | null>(null);
  const [pendingInfo, setPendingInfo] = useState<{ count: number; calls: PendingDisposition[] }>({ count: 0, calls: [] });

  useEffect(() => {
    setIsLoading(true);
    getCallHistory(closerInfo.closerId, 100).then((result) => {
      setCalls(result);
      setIsLoading(false);
    });
    // Also fetch pending dispositions for the banner
    getPendingDispositions(closerInfo.closerId).then(setPendingInfo);
  }, [closerInfo.closerId]);

  // Refresh pending info — bumped 3s → 15s. Task #348: 3s was wildly
  // aggressive; the "Fill Out Now" banner appearing within 15s of End
  // Call is fine UX, and 3s was a top contributor to saturation.
  usePoll(
    'pendingDispositions',
    async () => {
      const info = await getPendingDispositions(closerInfo.closerId);
      setPendingInfo(info);
    },
    15_000,
    { immediate: false },
  );

  const firstPending = pendingInfo.calls[0];

  const filteredCalls = useMemo(() => {
    let result = calls;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.prospectName?.toLowerCase().includes(q));
    }

    // Outcome filter
    if (outcomeFilter !== 'all') {
      if (outcomeFilter === 'lost') {
        // "Not Closed" includes lost + no outcome
        result = result.filter((c) => c.outcome === 'lost' || !c.outcome);
      } else {
        result = result.filter((c) => c.outcome === outcomeFilter);
      }
    }

    return result;
  }, [calls, search, outcomeFilter]);

  function handleCallUpdated(updatedCall: CallHistoryItem) {
    setCalls((prev) =>
      prev.map((c) => (c._id === updatedCall._id ? updatedCall : c))
    );
    setSelectedCall(updatedCall);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <span className="w-6 h-6 border-2 border-gray-400 dark:border-gray-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-[14px] text-gray-500 dark:text-gray-400">Loading calls...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TaskHintBanner taskId="highlightClip" />
      {/* Call Detail Sheet (overlay) */}
      {selectedCall && (
        <CallDetailSheet
          closerInfo={closerInfo}
          call={selectedCall}
          onClose={() => setSelectedCall(null)}
          onCallUpdated={handleCallUpdated}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Calls</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400">{filteredCalls.length} calls</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="px-6 pb-3 space-y-2 shrink-0">
        {/* Search bar */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by prospect name..."
            className="w-full pl-9 pr-8 py-2 text-[13px] bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

        {/* Outcome filter buttons */}
        <div className="flex gap-1.5">
          {OUTCOME_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setOutcomeFilter(f.value)}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                outcomeFilter === f.value
                  ? 'bg-black dark:bg-white text-white dark:text-black'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pending Questionnaire Banner */}
      {pendingInfo.count > 0 && (
        <div className="mx-6 mb-3 shrink-0">
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-medium text-amber-800 dark:text-amber-300">
                {pendingInfo.count} call{pendingInfo.count === 1 ? '' : 's'} need{pendingInfo.count === 1 ? 's' : ''} outcomes
              </span>
              {firstPending?.prospectName && (
                <span className="text-[12px] text-amber-600 dark:text-amber-400 ml-1">
                  — {firstPending.prospectName}
                </span>
              )}
              {firstPending?.aiFilled && (
                <span className="text-[12px] text-amber-600 dark:text-amber-400 ml-1">
                  (pre-filled from the recording — confirm the numbers)
                </span>
              )}
            </div>
            {firstPending && onOpenQuestionnaire && (
              <button
                onClick={() => {
                  onOpenQuestionnaire(firstPending.callId, firstPending.prospectName ?? undefined);
                  // Bounded fast repoll so the banner clears promptly after a
                  // submit; if the user dismisses the form instead, the regular
                  // 15s poll takes over rather than this looping forever.
                  let tries = 0;
                  const repoll = () => getPendingDispositions(closerInfo.closerId).then((info) => {
                    setPendingInfo(info);
                    if (info.count > 0 && ++tries < 6) setTimeout(repoll, 5000);
                  });
                  setTimeout(repoll, 3000);
                }}
                className="px-3 py-1.5 text-[12px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/30 hover:bg-amber-200 dark:hover:bg-amber-800/50 rounded-md transition-colors shrink-0"
              >
                Fill Out Now
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6">
        {filteredCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
            <h3 className="text-[15px] font-medium text-gray-600 dark:text-gray-400 mb-1">No calls yet</h3>
            <p className="text-[13px] text-gray-400 dark:text-gray-500">Calls will appear here once bots start recording</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="flex items-center gap-2 px-3 py-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900 z-10">
              <span className="w-[140px]">Date / Time</span>
              <span className="flex-1">Prospect</span>
              <span className="w-[90px] text-center">Outcome</span>
              <span className="w-[80px] text-right">Cash</span>
              <span className="w-[50px] text-right">Talk</span>
              <span className="w-[30px] text-center">
                <svg className="w-3 h-3 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </span>
              <span className="w-[80px] text-center">Review</span>
            </div>

            {/* Rows */}
            {filteredCalls.map((call, i) => (
              <CallRow
                key={call._id}
                call={call}
                isOdd={i % 2 === 1}
                onClick={() => setSelectedCall(call)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function CallRow({
  call,
  isOdd,
  onClick,
}: {
  call: CallHistoryItem;
  isOdd: boolean;
  onClick: () => void;
}) {
  const talkPercent = (() => {
    const closer = call.closerTalkTime || 0;
    const prospect = call.prospectTalkTime || 0;
    const total = closer + prospect;
    return total > 0 ? Math.round((closer / total) * 100) : null;
  })();

  const hasVideo = call.recordingType === 'video' && !!call.recordingUrl;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-gray-100/80 dark:hover:bg-gray-800/80 ${
        isOdd ? 'bg-gray-50/50 dark:bg-gray-800/50' : 'bg-white dark:bg-gray-900'
      }`}
    >
      {/* Date/Time */}
      <span className="w-[140px] text-[12px] text-gray-600 dark:text-gray-400 shrink-0">
        {formatCallDate(call.startedAt)}
      </span>

      {/* Prospect */}
      <span className="flex-1 text-[13px] font-medium text-black dark:text-white truncate">
        {call.prospectName || 'Unknown'}
      </span>

      {/* Outcome badge */}
      <span className="w-[90px] flex justify-center shrink-0">
        <OutcomeBadge outcome={call.outcome} />
      </span>

      {/* Cash collected */}
      <span className="w-[80px] text-[12px] text-right shrink-0">
        {call.cashCollected && call.cashCollected > 0 ? (
          <span className="text-green-600 font-medium">${call.cashCollected.toLocaleString()}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </span>

      {/* Talk % */}
      <span className="w-[50px] text-[12px] text-gray-500 dark:text-gray-400 text-right shrink-0">
        {talkPercent !== null ? `${talkPercent}%` : '—'}
      </span>

      {/* Video icon */}
      <span className="w-[30px] flex justify-center shrink-0">
        {hasVideo && (
          <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm12.553 1.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
          </svg>
        )}
      </span>

      {/* Review status */}
      <span className="w-[80px] flex justify-center shrink-0">
        <ReviewBadge flagged={call.flaggedForReview} reviewStatus={call.reviewStatus} />
      </span>
    </button>
  );
}

function OutcomeBadge({ outcome }: { outcome?: string }) {
  if (!outcome) return <span className="text-[11px] text-gray-400">—</span>;

  const config: Record<string, { text: string; bg: string; label: string }> = {
    closed: { text: 'text-green-700', bg: 'bg-green-50', label: 'Closed' },
    lost: { text: 'text-red-600', bg: 'bg-red-50', label: 'Lost' },
    no_show: { text: 'text-gray-600', bg: 'bg-gray-100', label: 'No Show' },
    follow_up: { text: 'text-blue-600', bg: 'bg-blue-50', label: 'Follow Up' },
  };

  const c = config[outcome];
  if (!c) return <span className="text-[11px] text-gray-400">{outcome}</span>;

  return (
    <span className={`px-2 py-0.5 text-[11px] font-medium rounded ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function ReviewBadge({ flagged, reviewStatus }: { flagged?: boolean; reviewStatus?: string }) {
  if (reviewStatus === 'reviewed') {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-green-700 bg-green-50 rounded">
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
        Reviewed
      </span>
    );
  }
  if (flagged) {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 bg-orange-50 rounded">
        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 6a3 3 0 013-3h2.25a3 3 0 013 3v2.25a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm9.47.47a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 11-1.06-1.06L15.19 12H10.5a.75.75 0 010-1.5h4.69l-2.72-2.72a.75.75 0 010-1.06z" clipRule="evenodd" /></svg>
        Flagged
      </span>
    );
  }
  return null;
}

function formatCallDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}
