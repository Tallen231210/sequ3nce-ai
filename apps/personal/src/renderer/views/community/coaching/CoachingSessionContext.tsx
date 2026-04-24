import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { CoachingCall } from '../../../convex';

// Session state while the current user is inside a live call — holds the
// Daily room URL + token so the overlay can connect, plus the user's own
// profile photo URL to broadcast to other participants after join.
//
// This type used to live inside CoachingView.tsx. We moved it here when we
// hoisted the session state to the app hub so the PiP mini can survive
// navigation away from the Community tab.
export interface ActiveCoachingSession {
  call: CoachingCall;
  roomUrl: string;
  token: string;
  selfPhotoUrl: string | null;
}

export type CoachingCallViewMode = 'full' | 'mini';

interface CoachingSessionContextValue {
  activeSession: ActiveCoachingSession | null;
  setActiveSession: (session: ActiveCoachingSession | null) => void;
  viewMode: CoachingCallViewMode;
  setViewMode: (mode: CoachingCallViewMode) => void;
  minimize: () => void;
  maximize: () => void;
  /** Unread counters shown as number badges on the mini. Cleared on maximize. */
  unreadChatCount: number;
  unreadHandsCount: number;
  markChatUnread: () => void;
  markHandsUnread: () => void;
}

const CoachingSessionContext = createContext<CoachingSessionContextValue | null>(null);

// Provider lives at the app-hub level (MeetingBotHub) so the session survives
// tab navigation. Any descendant that needs to read or mutate the call state
// uses `useCoachingSession()`.
export function CoachingSessionProvider({ children }: { children: React.ReactNode }) {
  const [activeSession, setActiveSessionState] = useState<ActiveCoachingSession | null>(null);
  const [viewMode, setViewMode] = useState<CoachingCallViewMode>('full');
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [unreadHandsCount, setUnreadHandsCount] = useState(0);

  // Reset view + unread state whenever a session starts or ends so a fresh
  // call always opens in full view with no leftover badges.
  const setActiveSession = useCallback((session: ActiveCoachingSession | null) => {
    setActiveSessionState(session);
    setViewMode('full');
    setUnreadChatCount(0);
    setUnreadHandsCount(0);
  }, []);

  const minimize = useCallback(() => setViewMode('mini'), []);
  const maximize = useCallback(() => {
    setViewMode('full');
    // When the user maximizes, they're about to see chat + hand queue again,
    // so clear the unread indicators.
    setUnreadChatCount(0);
    setUnreadHandsCount(0);
  }, []);

  // Badges are only meaningful while minimized — events fired during full
  // view are already visible, no unread state needed.
  const markChatUnread = useCallback(() => {
    setUnreadChatCount((prev) => prev + 1);
  }, []);
  const markHandsUnread = useCallback(() => {
    setUnreadHandsCount((prev) => prev + 1);
  }, []);

  const value = useMemo<CoachingSessionContextValue>(
    () => ({
      activeSession,
      setActiveSession,
      viewMode,
      setViewMode,
      minimize,
      maximize,
      unreadChatCount,
      unreadHandsCount,
      markChatUnread,
      markHandsUnread,
    }),
    [activeSession, setActiveSession, viewMode, minimize, maximize, unreadChatCount, unreadHandsCount, markChatUnread, markHandsUnread],
  );

  return (
    <CoachingSessionContext.Provider value={value}>{children}</CoachingSessionContext.Provider>
  );
}

export function useCoachingSession(): CoachingSessionContextValue {
  const ctx = useContext(CoachingSessionContext);
  if (!ctx) {
    throw new Error('useCoachingSession must be used inside a CoachingSessionProvider');
  }
  return ctx;
}
