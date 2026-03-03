import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { CloserInfo } from '../convex';
import {
  getOrCreateRolePlayRoom,
  joinRolePlayRoom,
  leaveRolePlayRoom,
  getRolePlayRoomParticipants,
  type RolePlayRoomParticipant,
} from '../convex';

interface RolePlayViewProps {
  closerInfo: CloserInfo;
}

export function RolePlayView({ closerInfo }: RolePlayViewProps) {
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [participants, setParticipants] = useState<RolePlayRoomParticipant[]>([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isInRoom, setIsInRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hasJoinedRef = useRef(false);
  const sessionStartRef = useRef<number | null>(null);
  const participantPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iframeLoadedRef = useRef(false);
  const mountedRef = useRef(true);

  const formattedDuration = (() => {
    const hours = Math.floor(sessionDuration / 3600);
    const minutes = Math.floor((sessionDuration % 3600) / 60);
    const seconds = Math.floor(sessionDuration % 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  })();

  const fetchParticipants = useCallback(async () => {
    try {
      const result = await getRolePlayRoomParticipants(closerInfo.teamId);
      if (mountedRef.current) setParticipants(result);
    } catch (err) {
      console.error('[RolePlay] Failed to fetch participants:', err);
    }
  }, [closerInfo.teamId]);

  const startPolling = useCallback(() => {
    fetchParticipants();
    participantPollRef.current = setInterval(fetchParticipants, 5000);
    sessionStartRef.current = Date.now();
    sessionTimerRef.current = setInterval(() => {
      if (sessionStartRef.current) {
        setSessionDuration((Date.now() - sessionStartRef.current) / 1000);
      }
    }, 1000);
  }, [fetchParticipants]);

  const stopPolling = useCallback(() => {
    if (participantPollRef.current) { clearInterval(participantPollRef.current); participantPollRef.current = null; }
    if (sessionTimerRef.current) { clearInterval(sessionTimerRef.current); sessionTimerRef.current = null; }
  }, []);

  const joinRoom = useCallback(async () => {
    if (hasJoinedRef.current) return;
    const result = await joinRolePlayRoom(closerInfo.teamId, closerInfo.closerId, closerInfo.name);
    if (result.success) {
      hasJoinedRef.current = true;
      startPolling();
    } else {
      setError(result.error || 'Failed to join room');
    }
  }, [closerInfo, startPolling]);

  const handleEnterRoom = async () => {
    setIsLoading(true);
    setError(null);
    iframeLoadedRef.current = false;

    const result = await getOrCreateRolePlayRoom(closerInfo.teamId);
    if (result) {
      setRoomUrl(result.roomUrl);
      setIsInRoom(true);
    } else {
      setError('Failed to create room');
    }
    setIsLoading(false);
  };

  const handleLeaveRoom = async () => {
    stopPolling();
    if (hasJoinedRef.current) {
      await leaveRolePlayRoom(closerInfo.teamId, closerInfo.closerId);
      hasJoinedRef.current = false;
    }
    setIsInRoom(false);
    setRoomUrl(null);
    setParticipants([]);
    setSessionDuration(0);
    sessionStartRef.current = null;
  };

  const handleIframeLoad = useCallback(() => {
    if (iframeLoadedRef.current) return;
    iframeLoadedRef.current = true;
    setTimeout(() => joinRoom(), 2000);
  }, [joinRoom]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (hasJoinedRef.current) {
        leaveRolePlayRoom(closerInfo.teamId, closerInfo.closerId);
      }
      stopPolling();
    };
  }, [closerInfo, stopPolling]);

  const dailyUrl = roomUrl ? `${roomUrl}?userName=${encodeURIComponent(closerInfo.name)}` : null;

  // Lobby state — not in room yet
  if (!isInRoom) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 pt-5 pb-3 shrink-0">
          <h1 className="text-2xl font-bold text-black">Role Play</h1>
          <p className="text-[14px] text-gray-500 mt-1">Practice your sales pitch with teammates.</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
          <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mb-5">
            <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Ready to Practice?</h2>
          <p className="text-[14px] text-gray-500 max-w-sm mb-6">
            Join the team role play room for a live video session with your teammates. Great for rehearsing pitches and overcoming objections.
          </p>

          {error && (
            <p className="text-[13px] text-red-600 mb-3">{error}</p>
          )}

          <button
            onClick={handleEnterRoom}
            disabled={isLoading}
            className="px-6 py-3 text-[14px] font-semibold text-white bg-black rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Loading Room...
              </span>
            ) : (
              'Enter Room'
            )}
          </button>
        </div>
      </div>
    );
  }

  // In-room state — show video iframe
  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-gray-800">Role Play Room</h2>
          {sessionDuration > 0 && (
            <span className="text-[13px] text-gray-500">{formattedDuration}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Participant count */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-md">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[13px] font-medium text-gray-600">{participants.length}</span>
          </div>
          {/* Leave button */}
          <button
            onClick={handleLeaveRoom}
            className="px-3 py-1.5 text-[12px] font-semibold text-red-600 border border-red-300 rounded-md hover:bg-red-50 transition-colors"
          >
            Leave Room
          </button>
        </div>
      </div>

      {/* Daily.co iframe */}
      <div className="flex-1 bg-gray-900 relative">
        {!dailyUrl ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
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

      {/* Participant bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-t border-gray-200 overflow-x-auto shrink-0">
        {participants.length === 0 ? (
          <span className="text-[12px] text-gray-400">No participants yet</span>
        ) : (
          participants.map((p) => (
            <span
              key={p.closerId}
              className="px-2 py-1 text-[11px] font-medium text-gray-600 bg-gray-200 rounded whitespace-nowrap"
            >
              {p.userName}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
