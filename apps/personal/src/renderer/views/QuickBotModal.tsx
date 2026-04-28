import React, { useState, useEffect } from 'react';
import type { CloserInfo } from '../convex';
import { createQuickBot } from '../convex';
import { TaskHintBanner } from './adoption-checklist/TaskHintBanner';

interface QuickBotModalProps {
  closerInfo: CloserInfo;
  onClose: () => void;
}

export function QuickBotModal({ closerInfo, onClose }: QuickBotModalProps) {
  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [prospectName, setProspectName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canJoin = (() => {
    const url = meetingUrl.trim();
    return url.length > 0 && (
      url.includes('zoom.us') ||
      url.includes('zoom.com') ||
      url.includes('meet.google.com') ||
      url.includes('teams.microsoft.com') ||
      url.startsWith('https://')
    );
  })();

  async function handleJoin() {
    if (!canJoin) return;
    setIsJoining(true);
    setError(null);

    const ok = await createQuickBot(
      meetingUrl.trim(),
      closerInfo.closerId,
      closerInfo.teamId,
      prospectName.trim() || undefined
    );

    setIsJoining(false);

    if (ok) {
      onClose();
    } else {
      setError('Failed to send bot. Please check the URL and try again.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[420px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-black">Quick Bot</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <TaskHintBanner taskId="firstCall" />

        <p className="px-5 text-[13px] text-gray-500 mb-5">
          Paste a meeting URL to send a bot to record and coach you.
        </p>

        {/* Form */}
        <div className="px-5 space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">Meeting URL</label>
            <input
              type="text"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              className="w-full px-3 py-2.5 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-1">
              Prospect Name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={prospectName}
              onChange={(e) => setProspectName(e.target.value)}
              placeholder="e.g., John Smith"
              className="w-full px-3 py-2.5 text-[13px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-400"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="px-5 mt-2 text-[12px] text-red-600">{error}</p>
        )}

        {/* Actions */}
        <div className="px-5 pt-5 pb-5">
          <button
            onClick={handleJoin}
            disabled={!canJoin || isJoining}
            className={`w-full py-3 text-[14px] font-semibold rounded-lg transition-colors ${
              canJoin && !isJoining
                ? 'bg-black text-white hover:bg-gray-800'
                : 'bg-gray-300 text-white cursor-not-allowed'
            }`}
          >
            {isJoining ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending Bot...
              </span>
            ) : (
              'Join Meeting'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
