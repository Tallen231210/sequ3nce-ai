import React, { useState, useEffect, useRef } from 'react';
import type { HighlightShareInfo } from '../convex';
import {
  createHighlightShare,
  getHighlightSharesByClip,
  revokeHighlightShare,
} from '../convex';

interface ClipShareModalProps {
  clipId: string;
  userId: string;
  clipLabel: string;
  onClose: () => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ClipShareModal({ clipId, userId, clipLabel, onClose }: ClipShareModalProps) {
  const [shares, setShares] = useState<HighlightShareInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadShares();
    return () => { mountedRef.current = false; };
  }, [clipId]);

  const loadShares = async () => {
    setLoading(true);
    const result = await getHighlightSharesByClip(clipId);
    if (mountedRef.current) {
      setShares(result);
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);

    const result = await createHighlightShare(
      clipId,
      userId,
      usePassword ? password.trim() : undefined
    );

    if (mountedRef.current) {
      setCreating(false);
      if (result.error) {
        setError(result.error);
      } else if (result.url) {
        setGeneratedUrl(result.url);
        setPassword('');
        setUsePassword(false);
        loadShares();
      }
    }
  };

  const handleRevoke = async (shareId: string) => {
    const result = await revokeHighlightShare(shareId, userId);
    if (result.success && mountedRef.current) {
      setShares((prev) => prev.filter((s) => s._id !== shareId));
    }
  };

  const handleCopy = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[420px] max-h-[600px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Share Highlight</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[300px]">{clipLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {/* Create new link */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Create Share Link
            </div>

            {/* Password toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400">Password protect</span>
            </label>

            {usePassword && (
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value.slice(0, 128))}
                placeholder="Enter password..."
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-400"
              />
            )}

            <button
              onClick={handleCreate}
              disabled={creating || (usePassword && !password.trim())}
              className="w-full py-2 text-xs font-semibold bg-black text-white dark:bg-white dark:text-black rounded-lg hover:opacity-80 disabled:opacity-40 transition-opacity"
            >
              {creating ? 'Generating...' : 'Generate Link'}
            </button>

            {error && <div className="text-xs text-red-500">{error}</div>}

            {/* Generated URL */}
            {generatedUrl && (
              <div className="flex items-center gap-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-2">
                <input
                  type="text"
                  value={generatedUrl}
                  readOnly
                  className="flex-1 text-xs text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none"
                />
                <button
                  onClick={() => handleCopy(generatedUrl, 'new')}
                  className="px-2 py-1 text-[10px] font-medium bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                >
                  {copied === 'new' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
          </div>

          {/* Active links */}
          {!loading && shares.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Active Links ({shares.length})
              </div>
              {shares.map((share) => {
                const url = `https://sequ3nce.ai/h/${share.token}`;
                return (
                  <div
                    key={share._id}
                    className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-600 dark:text-gray-400 truncate">{url}</div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        {formatDate(share.createdAt)}
                        {share.hasPassword && (
                          <span className="text-amber-500">
                            <svg className="w-2.5 h-2.5 inline" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopy(url, share._id)}
                      className="px-2 py-1 text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      {copied === share._id ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={() => handleRevoke(share._id)}
                      className="px-2 py-1 text-[10px] text-red-500 hover:text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      Revoke
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
