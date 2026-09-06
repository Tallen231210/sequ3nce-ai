import React, { useEffect, useState } from 'react';
import type { CoachingCall } from '../../../convex';

interface CoachingCallCardProps {
  call: CoachingCall;
  currentUserId: string;
  isFounder?: boolean;
  onJoin?: (call: CoachingCall) => void;
  onStart?: (call: CoachingCall) => void;
  onEnd?: (call: CoachingCall) => void;
  onCancel?: (call: CoachingCall) => void;
  onReschedule?: (call: CoachingCall) => void;
  onWatchReplay?: (call: CoachingCall) => void;
  onDeleteRecording?: (call: CoachingCall) => void;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(min: number): string {
  if (min >= 60 && min % 60 === 0) return `${min / 60}h`;
  if (min > 60) return `${Math.floor(min / 60)}h ${min % 60}m`;
  return `${min}m`;
}

// Live-counting "starts in Xh Ym" label — re-renders every minute
function useCountdownLabel(targetMs: number): string {
  const [, forceRender] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceRender((n) => n + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const diff = targetMs - Date.now();
  if (diff <= 0) return 'starting now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `starts in ${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  if (hours < 24) return `starts in ${hours}h ${remMin}m`;
  const days = Math.floor(hours / 24);
  return `starts in ${days}d ${hours % 24}h`;
}

export function CoachingCallCard({
  call,
  currentUserId,
  isFounder,
  onJoin,
  onStart,
  onEnd,
  onCancel,
  onReschedule,
  onWatchReplay,
  onDeleteRecording,
}: CoachingCallCardProps) {
  const isCoach = call.coachUserId === currentUserId;
  const canManageRecording = isCoach || !!isFounder;
  const countdown = useCountdownLabel(call.scheduledStartTime);

  // Live call layout — pulsing red dot
  if (call.status === 'live') {
    return (
      <div className="p-4 bg-white dark:bg-zinc-900 rounded-xl border-2 border-red-400 dark:border-red-900/60">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                Live now · {call.coachName}
              </span>
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">
              {call.title}
            </h3>
            {call.description && (
              <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                {call.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onJoin?.(call)}
              className={`px-4 py-2 text-[13px] font-semibold rounded-lg transition-colors ${
                isCoach
                  ? 'bg-black text-white dark:bg-white dark:text-black hover:opacity-80'
                  : 'bg-red-500 text-white hover:bg-red-600'
              }`}
            >
              {isCoach ? 'Rejoin' : 'Join now'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Scheduled / upcoming
  if (call.status === 'scheduled') {
    const imminent = call.scheduledStartTime - Date.now() < 10 * 60_000; // within 10 min
    return (
      <div className="p-4 bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
              {call.coachName} · {formatDuration(call.scheduledDurationMin)}
            </div>
            <h3 className="text-[15px] font-semibold text-gray-900 dark:text-white truncate">
              {call.title}
            </h3>
            {call.description && (
              <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                {call.description}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
              <span>{formatDateTime(call.scheduledStartTime)}</span>
              <span className="text-gray-300 dark:text-zinc-600">·</span>
              <span className={imminent ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>
                {countdown}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isCoach ? (
              <>
                <button
                  onClick={() => onStart?.(call)}
                  className="px-4 py-2 text-[13px] font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 transition-opacity"
                >
                  Start call
                </button>
                <button
                  onClick={() => onReschedule?.(call)}
                  className="px-2 py-2 text-[11px] font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => onCancel?.(call)}
                  className="px-2 py-2 text-[11px] font-medium text-gray-500 hover:text-red-600 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <div className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                Not yet started
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Past — show replay if recording ready
  if (call.status === 'ended') {
    const hasReplay = call.recordingStatus === 'ready' && call.recordingUrl;
    const statusText =
      call.recordingStatus === 'processing'
        ? 'Processing recording…'
        : call.recordingStatus === 'failed'
          ? 'No recording available'
          : call.recordingStatus === 'deleted'
            ? 'Recording deleted'
            : 'Call ended';

    return (
      <div className="p-4 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-gray-200 dark:border-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
              {/* For ended calls, prefer the actual time the call ran over the
                  scheduled time — the scheduled time can be hours off if the
                  coach started early or late. */}
              {call.coachName} · {formatDateTime(call.actualStartTime ?? call.scheduledStartTime)}
            </div>
            <h3 className="text-[14px] font-semibold text-gray-700 dark:text-gray-300 truncate">
              {call.title}
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasReplay ? (
              <button
                onClick={() => onWatchReplay?.(call)}
                className="px-3 py-2 text-[12px] font-medium border border-gray-200 dark:border-zinc-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              >
                ▶ Watch replay
              </button>
            ) : (
              <span className="text-[11px] text-gray-400">{statusText}</span>
            )}
            {hasReplay && canManageRecording && onDeleteRecording && (
              <button
                onClick={() => {
                  if (confirm(`Delete the recording of "${call.title}"? This can't be undone.`)) {
                    onDeleteRecording(call);
                  }
                }}
                title="Delete this recording"
                className="px-2 py-2 text-[11px] font-medium text-gray-400 hover:text-red-500 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Cancelled
  return (
    <div className="p-4 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-gray-200 dark:border-zinc-800 opacity-60">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
        Cancelled · {call.coachName}
      </div>
      <h3 className="text-[13px] font-medium text-gray-500 dark:text-gray-400 line-through">
        {call.title}
      </h3>
      {call.cancelledReason && (
        <p className="text-[11px] text-gray-400 mt-1">{call.cancelledReason}</p>
      )}
    </div>
  );
}
