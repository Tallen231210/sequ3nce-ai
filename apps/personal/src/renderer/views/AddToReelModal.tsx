import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { CloserInfo, CallHistoryItem, CallChapter } from '../convex';
import { addHighlightClip } from '../convex';

interface AddToReelModalProps {
  closerInfo: CloserInfo;
  call: CallHistoryItem;
  chapter?: CallChapter;
  videoUrl: string | null;
  onClose: () => void;
  onAdded: () => void;
}

function formatTimeInput(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTimeInput(value: string): number | null {
  const parts = value.split(':');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(s) || m < 0 || s < 0 || s >= 60) return null;
  return m * 60 + s;
}

export function AddToReelModal({
  closerInfo,
  call,
  chapter,
  videoUrl,
  onClose,
  onAdded,
}: AddToReelModalProps) {
  const duration = call.duration || 0;

  const [isFullCall, setIsFullCall] = useState(!chapter);
  const [startStr, setStartStr] = useState(
    chapter ? formatTimeInput(chapter.startTime) : '0:00'
  );
  const [endStr, setEndStr] = useState(
    chapter ? formatTimeInput(chapter.endTime) : formatTimeInput(duration)
  );
  const [label, setLabel] = useState(
    chapter
      ? chapter.title
      : `${call.prospectName || 'Call'} — Full Call`
  );
  const [blurRegion, setBlurRegion] = useState<'left' | 'right' | 'none'>('right');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Video playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const savingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Seek video when start time changes (and not playing)
  useEffect(() => {
    if (videoRef.current && videoUrl && !isPlaying) {
      const startSec = parseTimeInput(startStr);
      if (startSec !== null) {
        videoRef.current.currentTime = startSec;
        setCurrentTime(startSec);
      }
    }
  }, [startStr, videoUrl]);

  // Handle video time updates (for playhead + auto-pause at end)
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const time = videoRef.current.currentTime;
    setCurrentTime(time);

    const endSec = parseTimeInput(endStr);
    if (endSec !== null && time >= endSec && !isFullCall) {
      videoRef.current.pause();
      videoRef.current.currentTime = endSec;
      setIsPlaying(false);
    }
  }, [endStr, isFullCall]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      // If at or past end, seek to start first
      const startSec = parseTimeInput(startStr) || 0;
      const endSec = parseTimeInput(endStr) || duration;
      if (videoRef.current.currentTime >= endSec) {
        videoRef.current.currentTime = startSec;
      }
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying, startStr, endStr, duration]);

  // Drag handler for range slider handles
  const handleDragStart = useCallback((handle: 'start' | 'end') => (e: React.MouseEvent) => {
    e.preventDefault();
    if (!trackRef.current || duration <= 0) return;

    const onMove = (moveEvent: MouseEvent) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const percent = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
      const time = Math.round(percent * duration);

      if (handle === 'start') {
        const endSec = parseTimeInput(endStr) || duration;
        const clamped = Math.min(time, endSec - 1);
        setStartStr(formatTimeInput(Math.max(0, clamped)));
        if (videoRef.current) {
          videoRef.current.currentTime = Math.max(0, clamped);
          setCurrentTime(Math.max(0, clamped));
        }
      } else {
        const startSec = parseTimeInput(startStr) || 0;
        const clamped = Math.max(time, startSec + 1);
        setEndStr(formatTimeInput(Math.min(duration, clamped)));
        if (videoRef.current) {
          videoRef.current.currentTime = Math.min(duration, clamped);
          setCurrentTime(Math.min(duration, clamped));
        }
      }
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [duration, startStr, endStr]);

  // Click on track to seek video
  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (!trackRef.current || !videoRef.current || duration <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = Math.round(percent * duration);
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, [duration]);

  async function handleSave() {
    if (!closerInfo.b2cUserId || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);

    const startTime = isFullCall ? 0 : parseTimeInput(startStr);
    const endTime = isFullCall ? duration : parseTimeInput(endStr);

    if (startTime === null || endTime === null) {
      setError('Invalid time format. Use mm:ss');
      setIsSaving(false);
      savingRef.current = false;
      return;
    }

    if (endTime <= startTime) {
      setError('End time must be after start time');
      setIsSaving(false);
      savingRef.current = false;
      return;
    }

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError('Label is required');
      setIsSaving(false);
      savingRef.current = false;
      return;
    }

    const result = await addHighlightClip({
      userId: closerInfo.b2cUserId,
      callId: call._id,
      label: trimmedLabel,
      startTime,
      endTime,
      isFullCall,
      blurRegion,
    });

    if (result.success) {
      onAdded();
      onClose();
    } else {
      setError(result.error || 'Failed to add clip');
    }

    setIsSaving(false);
    savingRef.current = false;
  }

  const blurOptions: { value: 'left' | 'right' | 'none'; label: string }[] = [
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
    { value: 'none', label: 'No Blur' },
  ];

  // Calculate slider positions as percentages
  const startSec = parseTimeInput(startStr) || 0;
  const endSec = parseTimeInput(endStr) || duration;
  const startPercent = duration > 0 ? (startSec / duration) * 100 : 0;
  const endPercent = duration > 0 ? (endSec / duration) * 100 : 100;
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="w-[520px] bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-[15px] font-bold text-black dark:text-white">
            Add to Highlight Reel
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[560px]">
          {/* Video Preview — clickable play/pause */}
          {videoUrl && (
            <div
              className="rounded-lg overflow-hidden bg-black relative cursor-pointer group"
              style={{ maxHeight: 240 }}
              onClick={togglePlay}
            >
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full"
                style={{ maxHeight: 240 }}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
              />
              {/* Play/pause overlay */}
              <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
              } bg-black/20 group-hover:bg-black/30`}>
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                  {isPlaying ? (
                    <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.5 3a.5.5 0 01.5.5v13a.5.5 0 01-1 0v-13a.5.5 0 01.5-.5zm9 0a.5.5 0 01.5.5v13a.5.5 0 01-1 0v-13a.5.5 0 01.5-.5z" clipRule="evenodd" />
                      <rect x="4" y="3" width="4" height="14" rx="1" />
                      <rect x="12" y="3" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-black ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  )}
                </div>
              </div>
              {/* Current time badge */}
              <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white font-mono">
                {formatTimeInput(Math.floor(currentTime))} / {formatTimeInput(duration)}
              </div>
            </div>
          )}

          {/* Range Slider — hidden when Full Call */}
          {videoUrl && !isFullCall && duration > 0 && (
            <div className="px-1">
              {/* Time labels */}
              <div className="flex justify-between text-[10px] text-gray-400 font-mono mb-1">
                <span>{formatTimeInput(startSec)}</span>
                <span>{formatTimeInput(endSec)}</span>
              </div>
              {/* Track */}
              <div
                ref={trackRef}
                className="relative h-6 cursor-pointer select-none"
                onClick={handleTrackClick}
              >
                {/* Background track */}
                <div className="absolute top-[10px] left-0 right-0 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full" />
                {/* Selected range */}
                <div
                  className="absolute top-[10px] h-1.5 bg-black dark:bg-white rounded-full"
                  style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
                />
                {/* Playhead */}
                <div
                  className="absolute top-[6px] w-0.5 h-3 bg-gray-400 rounded-full pointer-events-none transition-[left] duration-75"
                  style={{ left: `${playheadPercent}%` }}
                />
                {/* Start handle */}
                <div
                  className="absolute top-[4px] w-4 h-4 bg-black dark:bg-white rounded-full border-2 border-white dark:border-gray-900 shadow-md cursor-grab active:cursor-grabbing hover:scale-110 transition-transform z-10"
                  style={{ left: `calc(${startPercent}% - 8px)` }}
                  onMouseDown={handleDragStart('start')}
                  onClick={(e) => e.stopPropagation()}
                />
                {/* End handle */}
                <div
                  className="absolute top-[4px] w-4 h-4 bg-black dark:bg-white rounded-full border-2 border-white dark:border-gray-900 shadow-md cursor-grab active:cursor-grabbing hover:scale-110 transition-transform z-10"
                  style={{ left: `calc(${endPercent}% - 8px)` }}
                  onMouseDown={handleDragStart('end')}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          {/* Full Call toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isFullCall}
              onChange={(e) => {
                setIsFullCall(e.target.checked);
                if (e.target.checked) {
                  setStartStr('0:00');
                  setEndStr(formatTimeInput(duration));
                }
              }}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-black dark:text-white focus:ring-0"
            />
            <span className="text-[13px] font-medium text-gray-900 dark:text-gray-100">
              Full Call
            </span>
          </label>

          {/* Start / End time inputs */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">Start</label>
              <input
                type="text"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                disabled={isFullCall}
                placeholder="0:00"
                className="w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 disabled:opacity-50 font-mono"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">End</label>
              <input
                type="text"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                disabled={isFullCall}
                placeholder="5:00"
                className="w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 disabled:opacity-50 font-mono"
              />
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-1">
              Label <span className="text-gray-300 dark:text-gray-600">({label.length}/100)</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, 100))}
              placeholder="Handles price objection"
              className="w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:border-gray-400 dark:focus:border-gray-500"
            />
          </div>

          {/* Blur region */}
          <div>
            <label className="block text-[12px] text-gray-500 dark:text-gray-400 mb-2">
              Which side is the prospect?
            </label>
            <div className="flex gap-2">
              {blurOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBlurRegion(opt.value)}
                  className={`flex-1 px-3 py-2 text-[13px] font-medium rounded-lg border transition-colors ${
                    blurRegion === opt.value
                      ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              The prospect&apos;s side will be blurred on your public profile
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[13px] text-red-500 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 text-[13px] font-medium bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Adding...' : 'Add to Reel'}
          </button>
        </div>
      </div>
    </div>
  );
}
