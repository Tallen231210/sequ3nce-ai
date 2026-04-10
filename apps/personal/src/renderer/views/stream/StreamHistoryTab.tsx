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
        <div className="w-5 h-5 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (transcriptions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-16 px-8">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="text-[14px] font-semibold text-black">
            No transcriptions yet
          </div>
          <div className="text-[12px] text-gray-500 leading-relaxed">
            Set up your hotkey in Settings, then hold it anywhere on your screen and speak. Your dictations will show up here.
          </div>
          <button
            onClick={onSwitchToSettings}
            className="mt-2 px-3 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 transition-colors"
          >
            Open Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-3">
      <div className="flex flex-col">
        {transcriptions.map((t, idx) => (
          <div
            key={t._id}
            className={`group flex items-start justify-between gap-3 px-1 py-3 ${
              idx > 0 ? 'border-t border-gray-100' : ''
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-gray-400 mb-1 flex items-center gap-2">
                <span>{formatRelativeTime(t.createdAt)}</span>
                {t.durationSec && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-gray-300" />
                    <span>{t.durationSec.toFixed(1)}s</span>
                  </>
                )}
              </div>
              <div className="text-[13px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words">
                {t.text}
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={() => handleCopy(t._id, t.text)}
                className="px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                title="Copy text"
              >
                {copiedId === t._id ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={() => handleDelete(t._id)}
                disabled={deletingId === t._id}
                className="px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50 transition-colors"
                title="Delete"
              >
                {deletingId === t._id ? '…' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
