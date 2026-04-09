import React, { useCallback, useState } from 'react';
import { deleteStreamTranscription, type StreamTranscription } from './streamClient';
import type { CloserInfo } from '../../convex';

interface StreamHistoryTabProps {
  closerInfo: CloserInfo;
  transcriptions: StreamTranscription[];
  loading: boolean;
  onRefresh: () => void;
  onSwitchToSettings: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function StreamHistoryTab({
  closerInfo,
  transcriptions,
  loading,
  onRefresh,
  onSwitchToSettings,
}: StreamHistoryTabProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCopy = useCallback(async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1200);
    } catch (err) {
      console.error('[Stream history] copy failed:', err);
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!closerInfo.b2cUserId) return;
      setDeletingId(id);
      try {
        await deleteStreamTranscription(closerInfo.b2cUserId, id);
        onRefresh();
      } catch (err) {
        console.error('[Stream history] delete failed:', err);
      } finally {
        setDeletingId(null);
      }
    },
    [closerInfo.b2cUserId, onRefresh],
  );

  if (loading && transcriptions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-gray-200 dark:border-zinc-700 border-t-black dark:border-t-white rounded-full animate-spin" />
          <div className="text-xs text-gray-500 dark:text-gray-400">Loading history…</div>
        </div>
      </div>
    );
  }

  if (transcriptions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-20 px-8">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z M19 10v2a7 7 0 01-14 0v-2 M12 19v4 M8 23h8" />
            </svg>
          </div>
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            No transcriptions yet
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Set up your hotkey in the Settings tab, then hold it anywhere on your screen and speak. Your dictations will show up here.
          </div>
          <button
            onClick={onSwitchToSettings}
            className="mt-2 px-4 py-2 text-xs font-semibold text-white bg-black dark:bg-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
          >
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-4">
      <div className="flex flex-col gap-2">
        {transcriptions.map((t) => (
          <div
            key={t._id}
            className="group rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 hover:border-gray-300 dark:hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5 flex items-center gap-2">
                  <span>{formatRelativeTime(t.createdAt)}</span>
                  {t.durationSec && (
                    <>
                      <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-zinc-700" />
                      <span>{t.durationSec.toFixed(1)}s</span>
                    </>
                  )}
                </div>
                <div className="text-[13px] leading-relaxed text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
                  {t.text}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => handleCopy(t._id, t.text)}
                  className="px-2 py-1 text-[10px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
                  title="Copy text"
                >
                  {copiedId === t._id ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => handleDelete(t._id)}
                  disabled={deletingId === t._id}
                  className="px-2 py-1 text-[10px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md disabled:opacity-50 transition-colors"
                  title="Delete"
                >
                  {deletingId === t._id ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
