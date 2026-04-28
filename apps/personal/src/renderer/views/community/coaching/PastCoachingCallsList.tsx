import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPastCoachingCallsWithRecordings,
  deleteCoachingCallRecording,
  type CloserInfo,
  type CoachingCall,
} from '../../../convex';
import { ReplayPlayerModal } from './ReplayPlayerModal';
import iconImage from '../../../../assets/icon.png';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface PastCoachingCallsListProps {
  closerInfo?: CloserInfo;
}

// Full-library replay list — rendered inside the Training tab so users have a
// searchable, paginated archive of past coaching sessions.
export function PastCoachingCallsList({ closerInfo }: PastCoachingCallsListProps = {}) {
  const [calls, setCalls] = useState<CoachingCall[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [replayCall, setReplayCall] = useState<CoachingCall | null>(null);
  const mountedRef = useRef(true);

  // User can delete if they're the coach who hosted OR a founder/admin.
  // Computed per-card below (coach check needs the specific call).
  const userId = closerInfo?.b2cUserId;
  const isFounder =
    closerInfo?.badges?.includes('founder') ||
    closerInfo?.badges?.includes('admin') ||
    false;

  const load = useCallback(async (nextCursor?: number) => {
    const res = await getPastCoachingCallsWithRecordings(nextCursor, 20);
    if (!mountedRef.current) return;
    if ('error' in res) {
      setLoading(false);
      return;
    }
    setCalls((prev) => (nextCursor ? [...prev, ...res.calls] : res.calls));
    setCursor(res.nextCursor);
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="py-8 text-center text-[13px] text-gray-400 dark:text-gray-500">
        No past coaching calls with recordings yet.
      </div>
    );
  }

  async function handleDelete(call: CoachingCall, e: React.MouseEvent) {
    e.stopPropagation();
    if (!userId) return;
    if (!confirm(`Delete the recording of "${call.title}"? This can't be undone.`)) return;
    const res = await deleteCoachingCallRecording(call._id, userId);
    if (res.error) {
      alert(res.error);
      return;
    }
    // Remove from local list immediately
    setCalls((prev) => prev.filter((c) => c._id !== call._id));
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {calls.map((c) => {
          const canDelete = userId && (isFounder || c.coachUserId === userId);
          return (
            <div
              key={c._id}
              onClick={() => setReplayCall(c)}
              className="group text-left p-4 bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600 transition-colors cursor-pointer relative"
            >
              <div className="aspect-video bg-gradient-to-br from-gray-900 to-black rounded-lg mb-3 flex items-center justify-center">
                <img
                  src={iconImage}
                  alt="Sequ3nce"
                  className="h-12 w-auto [filter:invert(1)_contrast(1.2)_brightness(1.1)]"
                />
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                {c.coachName} · {formatDate(c.scheduledStartTime)}
              </div>
              <div className="text-[14px] font-semibold text-gray-900 dark:text-white line-clamp-2">
                {c.title}
              </div>
              {c.description && (
                <div className="mt-1 text-[12px] text-gray-500 dark:text-gray-400 line-clamp-2">
                  {c.description}
                </div>
              )}
              <div className="mt-2 text-[11px] font-medium text-gray-700 dark:text-gray-300">
                ▶ Watch replay
              </div>
              {canDelete && (
                <button
                  onClick={(e) => handleDelete(c, e)}
                  title="Delete this recording"
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-white/80 dark:bg-zinc-800/80 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {cursor && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => void load(cursor)}
            className="px-4 py-2 text-[12px] font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Load more
          </button>
        </div>
      )}

      {replayCall && (
        <ReplayPlayerModal
          call={replayCall}
          onClose={() => setReplayCall(null)}
          currentUserId={userId}
        />
      )}
    </div>
  );
}
