import React, { useState, useRef } from 'react';
import type { HighlightClip } from '../convex';

interface HighlightClipCardProps {
  clip: HighlightClip;
  recordingUrl: string | null;
  onEdit: (clipId: string, label: string, blurRegion: string) => void;
  onDelete: (clipId: string) => void;
  onShare: (clipId: string) => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
  index: number;
}

function formatClipDuration(startTime: number, endTime: number): string {
  const totalSec = Math.round(endTime - startTime);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildVideoSrc(recordingUrl: string | null, clip: HighlightClip): string | null {
  if (!recordingUrl) return null;
  if (clip.isFullCall) return recordingUrl;
  return `${recordingUrl}#t=${clip.startTime},${clip.endTime}`;
}

const BLUR_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'none', label: 'None' },
] as const;

export function HighlightClipCard({
  clip,
  recordingUrl,
  onEdit,
  onDelete,
  onShare,
  onDragStart,
  onDragEnter,
  onDragEnd,
  index,
}: HighlightClipCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(clip.label);
  const [editBlur, setEditBlur] = useState(clip.blurRegion);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const videoSrc = buildVideoSrc(recordingUrl, clip);

  const handlePlayToggle = () => {
    if (!videoRef.current || !videoSrc) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const handleSaveEdit = () => {
    const trimmed = editLabel.trim();
    if (!trimmed || trimmed.length > 100) return;
    onEdit(clip._id, trimmed, editBlur);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditLabel(clip.label);
    setEditBlur(clip.blurRegion);
    setIsEditing(false);
  };

  return (
    <div
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Video container */}
      <div className="relative aspect-video bg-black cursor-pointer" onClick={handlePlayToggle}>
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            className="w-full h-full object-contain"
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xs text-gray-500">Recording unavailable</span>
          </div>
        )}

        {/* Blur overlay */}
        {clip.blurRegion !== 'none' && (
          <div
            className="absolute top-0 bottom-0"
            style={{
              [clip.blurRegion === 'left' ? 'left' : 'right']: 0,
              width: '50%',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              backgroundColor: 'rgba(255,255,255,0.15)',
            }}
          />
        )}

        {/* Play button overlay */}
        {!isPlaying && videoSrc && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
              <div className="w-0 h-0 ml-1 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent border-l-[16px] border-l-black" />
            </div>
          </div>
        )}

        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
          {formatClipDuration(clip.startTime, clip.endTime)}
        </div>
      </div>

      {/* Info + actions */}
      <div className="p-3">
        {isEditing ? (
          <div className="space-y-2">
            <input
              type="text"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value.slice(0, 100))}
              className="w-full px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              autoFocus
            />
            <div className="flex gap-1">
              {BLUR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEditBlur(opt.value)}
                  className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors ${
                    editBlur === opt.value
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  Blur {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1 text-xs font-medium bg-black text-white dark:bg-white dark:text-black rounded-md hover:opacity-80"
              >
                Save
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {clip.label}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {clip.isFullCall && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">Full call</span>
                  )}
                  {clip.blurRegion !== 'none' && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      Blur {clip.blurRegion}
                    </span>
                  )}
                </div>
              </div>

              {/* Drag handle */}
              <div className="cursor-grab text-gray-300 dark:text-gray-600 hover:text-gray-400 dark:hover:text-gray-500">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
                </svg>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => onShare(clip._id)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                Share
              </button>
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                </svg>
                Edit
              </button>
              {confirmDelete ? (
                <button
                  onClick={() => { onDelete(clip._id); setConfirmDelete(false); }}
                  className="px-2 py-1 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                >
                  Confirm
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                  Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
