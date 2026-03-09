import React, { useEffect, useState, useRef } from 'react';
import type { HighlightClip } from '../convex';
import {
  getHighlightClips,
  updateHighlightClip,
  deleteHighlightClip,
  reorderHighlightClips,
} from '../convex';

interface HighlightReelEditorProps {
  userId: string;
}

const MAX_CLIPS = 10;

function formatClipDuration(startTime: number, endTime: number): string {
  const totalSec = Math.round(endTime - startTime);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function HighlightReelEditor({ userId }: HighlightReelEditorProps) {
  const [clips, setClips] = useState<HighlightClip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editBlur, setEditBlur] = useState('right');
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const dragItemRef = useRef<number | null>(null);
  const dragOverRef = useRef<number | null>(null);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    loadClips();
  }, [userId]);

  async function loadClips() {
    setIsLoading(true);
    const result = await getHighlightClips(userId);
    if (mountedRef.current) {
      setClips(result);
      setIsLoading(false);
    }
  }

  async function handleDelete(clipId: string) {
    if (!confirm('Remove this clip from your highlight reel?')) return;
    setError(null);
    const result = await deleteHighlightClip(clipId, userId);
    if (result.success) {
      setClips((prev) => prev.filter((c) => c._id !== clipId));
    } else {
      setError(result.error || 'Failed to delete clip');
    }
  }

  function startEdit(clip: HighlightClip) {
    setEditingId(clip._id);
    setEditLabel(clip.label);
    setEditBlur(clip.blurRegion);
  }

  async function saveEdit(clipId: string) {
    setError(null);
    const result = await updateHighlightClip({
      clipId,
      userId,
      label: editLabel,
      blurRegion: editBlur,
    });
    if (result.success) {
      setClips((prev) =>
        prev.map((c) =>
          c._id === clipId ? { ...c, label: editLabel, blurRegion: editBlur } : c
        )
      );
      setEditingId(null);
    } else {
      setError(result.error || 'Failed to update clip');
    }
  }

  function handleDragStart(index: number) {
    dragItemRef.current = index;
  }

  function handleDragEnter(index: number) {
    dragOverRef.current = index;
  }

  async function handleDragEnd() {
    if (dragItemRef.current === null || dragOverRef.current === null) return;
    if (dragItemRef.current === dragOverRef.current) return;

    const reordered = [...clips];
    const [removed] = reordered.splice(dragItemRef.current, 1);
    reordered.splice(dragOverRef.current, 0, removed);
    setClips(reordered);

    dragItemRef.current = null;
    dragOverRef.current = null;

    // Persist reorder
    const clipIds = reordered.map((c) => c._id);
    await reorderHighlightClips(userId, clipIds);
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <span className="w-4 h-4 border-2 border-gray-400 dark:border-zinc-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-[13px] text-gray-500 dark:text-zinc-400">Loading clips...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Counter */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-gray-500 dark:text-zinc-400">
          {clips.length} / {MAX_CLIPS} clips
        </p>
      </div>

      {/* Empty state */}
      {clips.length === 0 && (
        <div className="py-6 px-4 text-center bg-gray-50 dark:bg-zinc-800/50 rounded-xl border border-gray-200 dark:border-zinc-700">
          <svg className="w-8 h-8 mx-auto text-gray-300 dark:text-zinc-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <p className="text-[13px] text-gray-500 dark:text-zinc-400">
            No highlights yet. Open a call from your Calls tab and click
            <span className="font-medium text-gray-700 dark:text-zinc-300"> &quot;Add to Reel&quot; </span>
            to get started.
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-[13px] text-red-500 dark:text-red-400">{error}</p>
      )}

      {/* Clip list */}
      {clips.map((clip, index) => (
        <div
          key={clip._id}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragEnter={() => handleDragEnter(index)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => e.preventDefault()}
          className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing"
        >
          {/* Drag handle */}
          <span className="text-gray-300 dark:text-zinc-600 shrink-0 cursor-grab" title="Drag to reorder">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
            </svg>
          </span>

          {/* Label + metadata */}
          <div className="flex-1 min-w-0">
            {editingId === clip._id ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value.slice(0, 100))}
                  className="w-full px-2 py-1 text-[13px] bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 border border-gray-300 dark:border-zinc-600 rounded focus:outline-none focus:border-gray-400"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(clip._id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <div className="flex gap-1">
                  {(['left', 'right', 'none'] as const).map((br) => (
                    <button
                      key={br}
                      onClick={() => setEditBlur(br)}
                      className={`px-2 py-0.5 text-[11px] rounded ${
                        editBlur === br
                          ? 'bg-black dark:bg-white text-white dark:text-black'
                          : 'bg-gray-100 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400'
                      }`}
                    >
                      {br === 'none' ? 'No Blur' : `Blur ${br}`}
                    </button>
                  ))}
                  <button
                    onClick={() => saveEdit(clip._id)}
                    className="ml-auto px-2 py-0.5 text-[11px] font-medium text-green-600 hover:text-green-700"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-gray-900 dark:text-zinc-100 truncate">
                  {clip.label}
                </span>
                <span className="text-[11px] text-gray-400 dark:text-zinc-500 font-mono shrink-0">
                  {formatClipDuration(clip.startTime, clip.endTime)}
                </span>
                {clip.blurRegion !== 'none' && (
                  <span className="text-[10px] text-gray-400 dark:text-zinc-500 shrink-0">
                    blur {clip.blurRegion}
                  </span>
                )}
                {clip.isFullCall && (
                  <span className="text-[10px] text-blue-500 shrink-0">full</span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          {editingId !== clip._id && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => startEdit(clip)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
                title="Edit"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
              </button>
              <button
                onClick={() => handleDelete(clip._id)}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                title="Remove"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
