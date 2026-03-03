// Role Play Room Modal with Daily.co video embed
// Matches the Swift implementation layout and behavior

import React, { useEffect, useRef } from 'react';
import { useRolePlayRoom } from '../../hooks/useRolePlayRoom';

interface RolePlayRoomModalProps {
  teamId: string;
  closerId: string;
  userName: string;
  onClose: () => void;
}

export function RolePlayRoomModal({
  teamId,
  closerId,
  userName,
  onClose,
}: RolePlayRoomModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const {
    roomUrl,
    participants,
    isLoading,
    error,
    formattedDuration,
    leave,
  } = useRolePlayRoom({
    teamId,
    closerId,
    userName,
    isOpen: true,
    onError: (err) => console.error('[RolePlayRoomModal] Error:', err),
  });

  // Handle close - leave room first
  const handleClose = async () => {
    await leave();
    onClose();
  };

  // Handle Leave button click
  const handleLeave = async () => {
    await handleClose();
  };

  // Notify hook when iframe loads
  const handleIframeLoad = () => {
    console.log('[RolePlayRoomModal] Iframe loaded');
    window.dispatchEvent(new Event('roleplay-iframe-loaded'));
  };

  // Build Daily.co URL with username
  const dailyUrl = roomUrl
    ? `${roomUrl}?userName=${encodeURIComponent(userName)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-[900px] h-[700px] min-w-[700px] min-h-[500px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-gray-800">Role Play Room</h2>
            {formattedDuration && (
              <span className="text-sm text-gray-500">
                You've been here for {formattedDuration}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Participant count badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-md">
              <svg
                className="w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span className="text-sm font-medium text-gray-600">
                {participants.length}
              </span>
            </div>

            {/* Close button */}
            <button
              onClick={handleClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content - Daily.co iframe */}
        <div className="flex-1 bg-gray-900 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
                <span className="text-sm text-gray-400">Loading room...</span>
              </div>
            </div>
          )}

          {error && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
              <div className="flex flex-col items-center gap-3 text-center px-4">
                <svg
                  className="w-12 h-12 text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <span className="text-sm text-red-400">{error}</span>
                <button
                  onClick={handleClose}
                  className="mt-2 px-4 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {dailyUrl && !isLoading && !error && (
            <iframe
              ref={iframeRef}
              src={dailyUrl}
              onLoad={handleIframeLoad}
              className="w-full h-full border-0"
              allow="camera; microphone; fullscreen; display-capture; autoplay"
              title="Role Play Room"
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
          {/* Participant list */}
          <div className="flex items-center gap-2 overflow-x-auto max-w-[600px]">
            {participants.length === 0 ? (
              <span className="text-sm text-gray-400">No participants yet</span>
            ) : (
              participants.map((participant) => (
                <span
                  key={participant.closerId}
                  className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded whitespace-nowrap"
                >
                  {participant.userName}
                </span>
              ))
            )}
          </div>

          {/* Leave button */}
          <button
            onClick={handleLeave}
            className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
          >
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}
