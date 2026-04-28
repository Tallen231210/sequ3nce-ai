import React, { useEffect, useRef } from 'react';
import type { CoachingCall } from '../../../convex';
import { recordReplayProgress } from '../../../convex';

interface ReplayPlayerModalProps {
  call: CoachingCall;
  onClose: () => void;
  /** b2cUserId of the viewer — used to track watch progress for the
   *  adoption-checklist "watch a coaching replay" task.  Optional: if
   *  undefined, telemetry is silently skipped. */
  currentUserId?: string;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ReplayPlayerModal({ call, onClose, currentUserId }: ReplayPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Reports replay progress every 10 s while the user is actively watching.
  // Used by the adoption-checklist "watch a coaching replay" task — the task
  // is satisfied when watchedSeconds >= 30 for any (user, call) row.
  useEffect(() => {
    if (!currentUserId || !call._id) return;
    const interval = setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused || v.ended) return;
      const seconds = Math.floor(v.currentTime);
      if (seconds <= 0) return;
      void recordReplayProgress(currentUserId, call._id, seconds);
    }, 10_000);
    return () => clearInterval(interval);
  }, [currentUserId, call._id]);

  if (!call.recordingUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/85 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-[900px] max-h-[92vh] overflow-hidden border border-gray-200 dark:border-zinc-700 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-gray-100 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Replay · {call.coachName} · {formatDate(call.scheduledStartTime)}
            </div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white mt-1 truncate">
              {call.title}
            </h2>
            {call.description && (
              <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                {call.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 shrink-0 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 bg-black flex items-center justify-center min-h-0">
          <video
            ref={videoRef}
            src={call.recordingUrl}
            controls
            autoPlay
            className="max-w-full max-h-full"
          />
        </div>
      </div>
    </div>
  );
}
