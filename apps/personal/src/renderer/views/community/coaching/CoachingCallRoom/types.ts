// Shared types used by CoachingCallRoom.tsx and its extracted subcomponents.

import type { FocusMode } from '../FocusModeTypes';

export interface ChatMessage {
  id: string;
  from: string;
  body: string;
  at: number;
}

export interface VideoGridProps {
  coachUserId: string;
  /** Resolved via userData handshake — identifies which tile is the coach
   *  for styling (border + COACH badge) and for the classroom top slot. */
  coachSessionId?: string | null;
  isCoachView: boolean;
  callId: string;
  currentUserId: string;
  viewMode: 'speaker' | 'gallery';
  focusMode: FocusMode;
  raisedHands: Record<string, { sessionId: string; userName: string; at: number }>;
  liveReactions: Array<{ id: string; sessionId: string; emoji: string }>;
  onSpotlight: (sessionId: string) => void;
  onKickError: (msg: string) => void;
}
