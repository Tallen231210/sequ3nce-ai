// Role Play Room Window - Main App Component
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  getOrCreateRolePlayRoom,
  joinRolePlayRoom,
  leaveRolePlayRoom,
  getRolePlayRoomParticipants,
  type RolePlayRoomParticipant,
} from './convex';

// Declare roleplay API from preload
declare global {
  interface Window {
    roleplay: {
      getUserInfo: () => Promise<{ teamId: string; closerId: string; userName: string } | null>;
      close: () => Promise<void>;
      minimize: () => Promise<void>;
      onUserInfoChange: (callback: (info: { teamId: string; closerId: string; userName: string } | null) => void) => () => void;
    };
  }
}

interface UserInfo {
  teamId: string;
  closerId: string;
  userName: string;
}

export function RolePlayApp() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [participants, setParticipants] = useState<RolePlayRoomParticipant[]>([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hasJoinedRef = useRef(false);
  const sessionStartTimeRef = useRef<Date | null>(null);
  const participantPollingRef = useRef<NodeJS.Timeout | null>(null);
  const sessionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const iframeLoadedRef = useRef(false);

  // Format duration like Swift: "Xs" / "Xm Xs" / "Xh Xm"
  const formattedDuration = (() => {
    const hours = Math.floor(sessionDuration / 3600);
    const minutes = Math.floor((sessionDuration % 3600) / 60);
    const seconds = Math.floor(sessionDuration % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  })();

  // Fetch participants
  const fetchParticipants = useCallback(async () => {
    if (!userInfo?.teamId) return;
    const result = await getRolePlayRoomParticipants(userInfo.teamId);
    setParticipants(result);
  }, [userInfo?.teamId]);

  // Start participant polling (every 5 seconds)
  const startParticipantPolling = useCallback(() => {
    fetchParticipants();
    participantPollingRef.current = setInterval(() => {
      fetchParticipants();
    }, 5000);
  }, [fetchParticipants]);

  // Stop participant polling
  const stopParticipantPolling = useCallback(() => {
    if (participantPollingRef.current) {
      clearInterval(participantPollingRef.current);
      participantPollingRef.current = null;
    }
  }, []);

  // Start session timer (every 1 second)
  const startSessionTimer = useCallback(() => {
    sessionStartTimeRef.current = new Date();
    sessionTimerRef.current = setInterval(() => {
      if (sessionStartTimeRef.current) {
        const elapsed = (Date.now() - sessionStartTimeRef.current.getTime()) / 1000;
        setSessionDuration(elapsed);
      }
    }, 1000);
  }, []);

  // Stop session timer
  const stopSessionTimer = useCallback(() => {
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  // Join the room (called after iframe loads)
  const joinRoom = useCallback(async () => {
    if (hasJoinedRef.current || !userInfo) return;

    console.log('[RolePlayApp] Joining room...');
    const result = await joinRolePlayRoom(userInfo.teamId, userInfo.closerId, userInfo.userName);

    if (result.success) {
      hasJoinedRef.current = true;
      startParticipantPolling();
      startSessionTimer();
      console.log('[RolePlayApp] Successfully joined room');
    } else {
      console.error('[RolePlayApp] Failed to join room:', result.error);
      setError(result.error || 'Failed to join room');
    }
  }, [userInfo, startParticipantPolling, startSessionTimer]);

  // Leave the room
  const leaveRoom = useCallback(async () => {
    console.log('[RolePlayApp] Leaving room...');
    stopParticipantPolling();
    stopSessionTimer();

    if (hasJoinedRef.current && userInfo) {
      await leaveRolePlayRoom(userInfo.teamId, userInfo.closerId);
      hasJoinedRef.current = false;
      console.log('[RolePlayApp] Left room');
    }
  }, [userInfo, stopParticipantPolling, stopSessionTimer]);

  // Handle close button
  const handleClose = async () => {
    await leaveRoom();
    window.roleplay.close();
  };

  // Handle Leave button click
  const handleLeave = async () => {
    await handleClose();
  };

  // Handle iframe load
  const handleIframeLoad = useCallback(() => {
    if (iframeLoadedRef.current) return;
    iframeLoadedRef.current = true;

    console.log('[RolePlayApp] Iframe loaded, joining room in 2 seconds...');

    // Wait 2 seconds before joining (matches Swift behavior)
    setTimeout(() => {
      joinRoom();
    }, 2000);
  }, [joinRoom]);

  // Load user info on mount
  useEffect(() => {
    const loadUserInfo = async () => {
      const info = await window.roleplay.getUserInfo();
      setUserInfo(info);
    };
    loadUserInfo();

    // Listen for user info changes
    const unsubscribe = window.roleplay.onUserInfoChange((info) => {
      setUserInfo(info);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Load room URL when user info is available
  useEffect(() => {
    if (!userInfo) return;

    let mounted = true;

    const loadRoom = async () => {
      setIsLoading(true);
      setError(null);

      console.log('[RolePlayApp] Loading room for team:', userInfo.teamId);
      const result = await getOrCreateRolePlayRoom(userInfo.teamId);

      if (!mounted) return;

      if (result) {
        setRoomUrl(result.roomUrl);
        console.log('[RolePlayApp] Room URL:', result.roomUrl);
      } else {
        setError('Failed to load room');
      }

      setIsLoading(false);
    };

    loadRoom();

    return () => {
      mounted = false;
    };
  }, [userInfo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hasJoinedRef.current && userInfo) {
        leaveRolePlayRoom(userInfo.teamId, userInfo.closerId);
      }
      stopParticipantPolling();
      stopSessionTimer();
    };
  }, [userInfo, stopParticipantPolling, stopSessionTimer]);

  // Build Daily.co URL with username
  const dailyUrl = roomUrl && userInfo
    ? `${roomUrl}?userName=${encodeURIComponent(userInfo.userName)}`
    : null;

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-800">Role Play Room</h2>
          {formattedDuration && sessionDuration > 0 && (
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
  );
}
