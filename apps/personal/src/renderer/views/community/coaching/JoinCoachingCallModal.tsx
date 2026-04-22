import React, { useEffect, useState } from 'react';
import { getCoachingCall, type CoachingCall } from '../../../convex';
import iconImage from '../../../../assets/icon.png';

interface JoinCoachingCallModalProps {
  callId: string;
  onClose: () => void;
  onJoin: (call: CoachingCall) => void;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(min: number): string {
  if (min >= 60 && min % 60 === 0) return `${min / 60} hour${min === 60 ? '' : 's'}`;
  if (min > 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${min} minutes`;
}

// Live-counting "starts in X" — ticks every 30s
function useCountdown(targetMs: number): string {
  const [, force] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const diff = targetMs - Date.now();
  if (diff <= 0) return 'Starting now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `Starts in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Starts in ${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `Starts in ${days}d ${hours % 24}h`;
}

export function JoinCoachingCallModal({ callId, onClose, onJoin }: JoinCoachingCallModalProps) {
  const [call, setCall] = useState<(CoachingCall & { attendeeCount?: number }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(call?.scheduledStartTime ?? Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await getCoachingCall(callId);
      if (cancelled) return;
      if (!res || 'error' in res) {
        setError(res && 'error' in res ? res.error : 'Call not found');
        setLoading(false);
        return;
      }
      setCall(res);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [callId]);

  const renderCTA = () => {
    if (!call) return null;
    if (call.status === 'cancelled') {
      return (
        <div className="text-center text-[13px] font-medium text-gray-500 dark:text-gray-400">
          This call was cancelled.
          {call.cancelledReason && <div className="mt-1 text-[12px]">{call.cancelledReason}</div>}
        </div>
      );
    }
    if (call.status === 'ended') {
      return (
        <div className="text-center text-[13px] font-medium text-gray-500 dark:text-gray-400">
          This call has ended.
          {call.recordingStatus === 'ready' && (
            <div className="mt-1 text-[12px]">
              Replay available in Community → Training.
            </div>
          )}
        </div>
      );
    }
    if (call.status === 'live') {
      return (
        <button
          onClick={() => onJoin(call)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-[14px] font-semibold text-white bg-red-600 rounded-lg hover:bg-red-500 transition-colors"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-300 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          Join Sequ3nce Coaching Call
        </button>
      );
    }
    // scheduled
    return (
      <div className="w-full">
        <button
          disabled
          className="w-full px-4 py-3 text-[14px] font-semibold text-gray-400 bg-gray-100 dark:bg-zinc-800 rounded-lg cursor-not-allowed"
        >
          {countdown}
        </button>
        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 text-center">
          The Join button will unlock once Coach {call.coachName} starts the call.
        </p>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-[460px] max-h-[92vh] overflow-y-auto border border-gray-200 dark:border-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Branded header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-zinc-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <img
                src={iconImage}
                alt="Sequ3nce"
                className="h-5 w-auto dark:[filter:invert(1)_contrast(1.2)_brightness(1.1)]"
              />
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                Coaching Call
              </span>
            </div>
            {loading ? (
              <div className="h-5 w-40 bg-gray-100 dark:bg-zinc-800 rounded animate-pulse" />
            ) : (
              <h2 className="text-base font-bold text-gray-900 dark:text-white leading-snug">
                {call?.title ?? 'Unknown call'}
              </h2>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 shrink-0 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Details */}
        <div className="px-5 py-4 space-y-4">
          {loading ? (
            <div className="py-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-[12px] text-red-600 dark:text-red-400">{error}</div>
          ) : call ? (
            <>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[13px]">
                <span className="text-gray-500 dark:text-gray-400 font-mono uppercase tracking-wider text-[10px] mt-0.5">
                  Host
                </span>
                <span className="text-gray-900 dark:text-white font-medium">
                  Coach {call.coachName}
                </span>

                <span className="text-gray-500 dark:text-gray-400 font-mono uppercase tracking-wider text-[10px] mt-0.5">
                  When
                </span>
                <span className="text-gray-900 dark:text-white">
                  {formatDateTime(call.scheduledStartTime)}
                </span>

                <span className="text-gray-500 dark:text-gray-400 font-mono uppercase tracking-wider text-[10px] mt-0.5">
                  Duration
                </span>
                <span className="text-gray-900 dark:text-white">
                  {formatDuration(call.scheduledDurationMin)}
                </span>
              </div>

              {call.description && (
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                    About
                  </div>
                  <p className="text-[13px] text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-snug">
                    {call.description}
                  </p>
                </div>
              )}

              <div className="pt-2">{renderCTA()}</div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
