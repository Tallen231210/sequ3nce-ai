import React, { useCallback, useEffect, useRef, useState } from 'react';
import { listTeamBroadcasts, type TeamBroadcast } from '../../convex';

const POLL_MS = 30_000;

interface NotificationHistoryPanelProps {
  founderId: string;
  refreshToken: number; // Bumped by parent after a successful send to force refetch
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function NotificationHistoryPanel({ founderId, refreshToken }: NotificationHistoryPanelProps) {
  const [broadcasts, setBroadcasts] = useState<TeamBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    const res = await listTeamBroadcasts(founderId, 30);
    if (!mountedRef.current) return;
    if ('broadcasts' in res) {
      setBroadcasts(res.broadcasts);
    }
    setLoading(false);
  }, [founderId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const interval = setInterval(() => {
      if (mountedRef.current) void load();
    }, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [load, refreshToken]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Sent notifications</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Aggregate read counts update every 30s.</p>
      </div>

      {loading ? (
        <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">Loading…</div>
      ) : broadcasts.length === 0 ? (
        <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">
          No notifications sent yet.
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {broadcasts.map((b) => {
            const expanded = expandedId === b._id;
            const readPct = b.recipientCount > 0 ? Math.round((b.readCount / b.recipientCount) * 100) : 0;
            return (
              <button
                key={b._id}
                onClick={() => setExpandedId(expanded ? null : b._id)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {formatDate(b.sentAt)}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">·</span>
                  <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">
                    {b.recipientMode === 'all'
                      ? `All users (${b.recipientCount})`
                      : `${b.recipientCount} specific ${b.recipientCount === 1 ? 'user' : 'users'}`}
                  </span>
                  <span
                    className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      b.repliesAllowed
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {b.repliesAllowed ? 'Replies on' : 'One-way'}
                  </span>
                </div>
                <div className="text-sm text-gray-900 dark:text-white mb-1">
                  {expanded ? (
                    <span className="whitespace-pre-wrap">{b.body}</span>
                  ) : (
                    <span className="line-clamp-1">{b.body}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="tabular-nums">
                    {b.readCount.toLocaleString()} / {b.recipientCount.toLocaleString()} seen
                  </span>
                  <span className="flex-1 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden max-w-[140px]">
                    <span
                      className="block h-full bg-gray-900 dark:bg-white"
                      style={{ width: `${readPct}%` }}
                    />
                  </span>
                  <span className="tabular-nums">{readPct}%</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
