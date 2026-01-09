// Hook for managing Role Play Room state and lifecycle
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getOrCreateRolePlayRoom,
  joinRolePlayRoom,
  leaveRolePlayRoom,
  getRolePlayRoomParticipants,
  type RolePlayRoomParticipant,
} from '../convex';

interface UseRolePlayRoomProps {
  teamId: string;
  closerId: string;
  userName: string;
  isOpen: boolean;
  onError?: (error: string) => void;
}

interface UseRolePlayRoomReturn {
  roomUrl: string | null;
  participants: RolePlayRoomParticipant[];
  sessionDuration: number;
  isLoading: boolean;
  error: string | null;
  formattedDuration: string;
  leave: () => Promise<void>;
}

export function useRolePlayRoom({
  teamId,
  closerId,
  userName,
  isOpen,
  onError,
}: UseRolePlayRoomProps): UseRolePlayRoomReturn {
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [participants, setParticipants] = useState<RolePlayRoomParticipant[]>([]);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (!teamId) return;
    const result = await getRolePlayRoomParticipants(teamId);
    setParticipants(result);
  }, [teamId]);

  // Start participant polling (every 5 seconds)
  const startParticipantPolling = useCallback(() => {
    // Fetch immediately
    fetchParticipants();

    // Then poll every 5 seconds
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
    if (hasJoinedRef.current || !teamId || !closerId || !userName) return;

    console.log('[RolePlayRoom] Joining room...');
    const result = await joinRolePlayRoom(teamId, closerId, userName);

    if (result.success) {
      hasJoinedRef.current = true;
      startParticipantPolling();
      startSessionTimer();
      console.log('[RolePlayRoom] Successfully joined room');
    } else {
      console.error('[RolePlayRoom] Failed to join room:', result.error);
      setError(result.error || 'Failed to join room');
      onError?.(result.error || 'Failed to join room');
    }
  }, [teamId, closerId, userName, startParticipantPolling, startSessionTimer, onError]);

  // Leave the room
  const leave = useCallback(async () => {
    console.log('[RolePlayRoom] Leaving room...');
    stopParticipantPolling();
    stopSessionTimer();

    if (hasJoinedRef.current && teamId && closerId) {
      await leaveRolePlayRoom(teamId, closerId);
      hasJoinedRef.current = false;
      console.log('[RolePlayRoom] Left room');
    }
  }, [teamId, closerId, stopParticipantPolling, stopSessionTimer]);

  // Called when Daily.co iframe loads
  const handleIframeLoad = useCallback(() => {
    if (iframeLoadedRef.current) return;
    iframeLoadedRef.current = true;

    console.log('[RolePlayRoom] Iframe loaded, joining room in 2 seconds...');

    // Wait 2 seconds before joining (matches Swift behavior)
    setTimeout(() => {
      joinRoom();
    }, 2000);
  }, [joinRoom]);

  // Load room URL on mount
  useEffect(() => {
    if (!isOpen || !teamId) return;

    let mounted = true;

    const loadRoom = async () => {
      setIsLoading(true);
      setError(null);

      console.log('[RolePlayRoom] Loading room for team:', teamId);
      const result = await getOrCreateRolePlayRoom(teamId);

      if (!mounted) return;

      if (result) {
        setRoomUrl(result.roomUrl);
        console.log('[RolePlayRoom] Room URL:', result.roomUrl);
      } else {
        setError('Failed to load room');
        onError?.('Failed to load room');
      }

      setIsLoading(false);
    };

    loadRoom();

    return () => {
      mounted = false;
    };
  }, [isOpen, teamId, onError]);

  // Cleanup on unmount or when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Modal closed - leave room
      leave();
      setRoomUrl(null);
      setParticipants([]);
      setSessionDuration(0);
      iframeLoadedRef.current = false;
    }

    return () => {
      // Component unmounting - leave room
      if (hasJoinedRef.current && teamId && closerId) {
        leaveRolePlayRoom(teamId, closerId);
      }
      stopParticipantPolling();
      stopSessionTimer();
    };
  }, [isOpen, leave, teamId, closerId, stopParticipantPolling, stopSessionTimer]);

  // Expose iframe load handler via custom event
  useEffect(() => {
    const handler = () => handleIframeLoad();
    window.addEventListener('roleplay-iframe-loaded', handler);
    return () => window.removeEventListener('roleplay-iframe-loaded', handler);
  }, [handleIframeLoad]);

  return {
    roomUrl,
    participants,
    sessionDuration,
    isLoading,
    error,
    formattedDuration,
    leave,
  };
}

// Separate hook for polling participant count (used on main screen button)
export function useRolePlayRoomParticipantCount(teamId: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!teamId) {
      setCount(0);
      return;
    }

    // Fetch immediately
    const fetchCount = async () => {
      const participants = await getRolePlayRoomParticipants(teamId);
      setCount(participants.length);
    };

    fetchCount();

    // Poll every 10 seconds for button badge (less frequent than modal)
    const interval = setInterval(fetchCount, 10000);

    return () => clearInterval(interval);
  }, [teamId]);

  return count;
}
