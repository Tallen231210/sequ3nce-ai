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
  /** Unread indicators shown on the mini. Cleared when user maximizes. */
  unreadChat: boolean;
  unreadHands: boolean;
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
  const [unreadChat, setUnreadChat] = useState(false);
  const [unreadHands, setUnreadHands] = useState(false);

  // Reset view + unread state whenever a session starts or ends so a fresh
  // call always opens in full view with no leftover badges.
  const setActiveSession = useCallback((session: ActiveCoachingSession | null) => {
    setActiveSessionState(session);
    setViewMode('full');
    setUnreadChat(false);
    setUnreadHands(false);
  }, []);

  const minimize = useCallback(() => setViewMode('mini'), []);
  const maximize = useCallback(() => {
    setViewMode('full');
    // When the user maximizes, they're about to see chat + hand queue again,
    // so clear the unread indicators.
    setUnreadChat(false);
    setUnreadHands(false);
  }, []);

  // Badges are only meaningful while minimized — events fired during full
  // view are already visible, no unread state needed.
  const markChatUnread = useCallback(() => {
    setUnreadChat((prev) => prev || true);
  }, []);
  const markHandsUnread = useCallback(() => {
    setUnreadHands((prev) => prev || true);
  }, []);

  const value = useMemo<CoachingSessionContextValue>(
    () => ({
      activeSession,
      setActiveSession,
      viewMode,
      setViewMode,
      minimize,
      maximize,
      unreadChat,
      unreadHands,
      markChatUnread,
      markHandsUnread,
    }),
    [activeSession, setActiveSession, viewMode, minimize, maximize, unreadChat, unreadHands, markChatUnread, markHandsUnread],
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
