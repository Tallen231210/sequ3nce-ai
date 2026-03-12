import React, { useState, useRef, useEffect } from 'react';
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
  const [isFullCall, setIsFullCall] = useState(!chapter);
  const [startStr, setStartStr] = useState(
    chapter ? formatTimeInput(chapter.startTime) : '0:00'
  );
  const [endStr, setEndStr] = useState(
    chapter ? formatTimeInput(chapter.endTime) : formatTimeInput(call.duration || 0)
  );
  const [label, setLabel] = useState(
    chapter
      ? chapter.title
      : `${call.prospectName || 'Call'} — Full Call`
  );
  const [blurRegion, setBlurRegion] = useState<'left' | 'right' | 'none'>('right');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const savingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Set video preview to start time
  useEffect(() => {
    if (videoRef.current && videoUrl) {
      const startSec = parseTimeInput(startStr);
      if (startSec !== null) {
        videoRef.current.currentTime = startSec;
      }
    }
  }, [startStr, videoUrl]);

  async function handleSave() {
    if (!closerInfo.b2cUserId || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);

    const startTime = isFullCall ? 0 : parseTimeInput(startStr);
    const endTime = isFullCall ? (call.duration || 0) : parseTimeInput(endStr);

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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="w-[480px] bg-white dark:bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden">
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
        <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[500px]">
          {/* Video Preview */}
          {videoUrl && (
            <div className="rounded-lg overflow-hidden bg-black" style={{ maxHeight: 200 }}>
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full"
                style={{ maxHeight: 200 }}
                muted
              />
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
                  setEndStr(formatTimeInput(call.duration || 0));
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
