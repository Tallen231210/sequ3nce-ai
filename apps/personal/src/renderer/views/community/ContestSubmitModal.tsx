import React, { useState, useEffect } from 'react';
import { getHighlightClips, submitContestEntry } from '../../convex';
import type { HighlightClip } from '../../convex';

interface ContestSubmitModalProps {
  contestId: string;
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
}

type TabId = 'highlight' | 'share_link';

export function ContestSubmitModal({ contestId, userId, onClose, onSubmitted }: ContestSubmitModalProps) {
  const [tab, setTab] = useState<TabId>('highlight');
  const [title, setTitle] = useState('');
  const [clips, setClips] = useState<HighlightClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadingClips, setLoadingClips] = useState(true);

  useEffect(() => {
    (async () => {
      const result = await getHighlightClips(userId);
      setClips(result);
      setLoadingClips(false);
    })();
  }, [userId]);

  const canSubmit =
    title.trim().length > 0 &&
    (tab === 'highlight' ? !!selectedClipId : shareUrl.startsWith('https://sequ3nce.ai/'));

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');

    const result = await submitContestEntry(
      userId,
      contestId,
      tab,
      title.trim(),
      tab === 'highlight' ? selectedClipId ?? undefined : undefined,
      tab === 'share_link' ? shareUrl.trim() : undefined,
    );

    if (result.error) {
      setError(result.error);
      setSubmitting(false);
    } else {
      onSubmitted();
    }
  };

  const formatDuration = (clip: HighlightClip) => {
    const dur = Math.round(clip.endTime - clip.startTime);
    const m = Math.floor(dur / 60);
    const s = dur % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Submit Your Call</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {(['highlight', 'share_link'] as TabId[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                tab === t
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t === 'highlight' ? 'Highlight Clip' : 'Share Link'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 100))}
              placeholder="e.g. Perfect close on a $5k deal"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Highlight tab content */}
          {tab === 'highlight' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Select a Clip
              </label>
              {loadingClips ? (
                <p className="text-xs text-gray-400">Loading clips...</p>
              ) : clips.length === 0 ? (
                <p className="text-xs text-gray-400">No highlight clips found. Create one first from a call.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {clips.map((clip) => (
                    <button
                      key={clip._id}
                      onClick={() => setSelectedClipId(clip._id)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                        selectedClipId === clip._id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="font-medium">{clip.label}</span>
                      <span className="ml-2 text-gray-400">{formatDuration(clip)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Share link tab content */}
          {tab === 'share_link' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Share Link URL
              </label>
              <input
                type="url"
                value={shareUrl}
                onChange={(e) => setShareUrl(e.target.value.slice(0, 500))}
                placeholder="https://sequ3nce.ai/..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              {shareUrl && !shareUrl.startsWith('https://sequ3nce.ai/') && (
                <p className="text-[10px] text-red-500 mt-1">Must be a Sequ3nce share link</p>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 font-medium">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
