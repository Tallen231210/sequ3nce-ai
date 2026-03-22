import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CloserInfo, HighlightClip } from '../convex';
import {
  getHighlightClips,
  updateHighlightClip,
  deleteHighlightClip,
  reorderHighlightClips,
  refreshRecordingUrl,
} from '../convex';
import { HighlightClipCard } from './HighlightClipCard';
import { ClipShareModal } from './ClipShareModal';

const MAX_CLIPS = 10;

interface HighlightsViewProps {
  closerInfo: CloserInfo;
}

export function HighlightsView({ closerInfo }: HighlightsViewProps) {
  const userId = closerInfo.b2cUserId || '';

  const [clips, setClips] = useState<HighlightClip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recordingUrls, setRecordingUrls] = useState<Map<string, string>>(new Map());
  const [shareClipId, setShareClipId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const dragItemRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (userId) loadClips();
  }, [userId]);

  const loadClips = async () => {
    setIsLoading(true);
    const result = await getHighlightClips(userId);
    if (!mountedRef.current) return;
    setClips(result);
    setIsLoading(false);

    // Refresh recording URLs for unique callIds
    const uniqueCallIds = [...new Set(result.map((c) => c.callId))];
    const urlMap = new Map<string, string>();
    await Promise.all(
      uniqueCallIds.map(async (callId) => {
        const url = await refreshRecordingUrl(callId);
        if (url) urlMap.set(callId, url);
      })
    );
    if (mountedRef.current) setRecordingUrls(urlMap);
  };

  const handleEdit = useCallback(async (clipId: string, label: string, blurRegion: string) => {
    const result = await updateHighlightClip({ clipId, userId, label, blurRegion });
    if (result.success && mountedRef.current) {
      setClips((prev) =>
        prev.map((c) => (c._id === clipId ? { ...c, label, blurRegion } : c))
      );
    }
  }, [userId]);

  const handleDelete = useCallback(async (clipId: string) => {
    const result = await deleteHighlightClip(clipId, userId);
    if (result.success && mountedRef.current) {
      setClips((prev) => prev.filter((c) => c._id !== clipId));
    }
  }, [userId]);

  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverRef.current = index;
  };

  const handleDragEnd = async () => {
    if (dragItemRef.current === null || dragOverRef.current === null) return;
    if (dragItemRef.current === dragOverRef.current) return;

    const reordered = [...clips];
    const [removed] = reordered.splice(dragItemRef.current, 1);
    reordered.splice(dragOverRef.current, 0, removed);

    setClips(reordered);
    dragItemRef.current = null;
    dragOverRef.current = null;

    await reorderHighlightClips(userId, reordered.map((c) => c._id));
  };

  const shareClip = clips.find((c) => c._id === shareClipId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-400 dark:text-gray-500">Loading highlights...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Highlights</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Your saved call moments
            </p>
          </div>
          {clips.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
              {clips.length} of {MAX_CLIPS}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {clips.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No highlights yet</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
              Save your best call moments here. Go to <strong>Calls</strong>, open a video call, and click <strong>"Add to Reel"</strong> to create your first highlight.
            </p>
          </div>
        ) : (
          /* Clips grid */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {clips.map((clip, index) => (
              <HighlightClipCard
                key={clip._id}
                clip={clip}
                recordingUrl={recordingUrls.get(clip.callId) || null}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onShare={setShareClipId}
                onDragStart={handleDragStart}
                onDragEnter={handleDragEnter}
                onDragEnd={handleDragEnd}
                index={index}
              />
            ))}
          </div>
        )}
      </div>

      {/* Share modal */}
      {shareClip && (
        <ClipShareModal
          clipId={shareClip._id}
          userId={userId}
          clipLabel={shareClip.label}
          onClose={() => setShareClipId(null)}
        />
      )}
    </div>
  );
}
