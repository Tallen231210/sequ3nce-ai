import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  useDaily,
  useDailyEvent,
} from '@daily-co/daily-react';
import {
  endCoachingCall,
  createPlaybookEntry,
  type CoachingCall,
} from '../../../convex';
import { useCoachingSession } from './CoachingSessionContext';
import { playNotificationChime } from '../../notificationSound';
import type { BattleRoyaleState, BRSubmission, BRReveal } from './BattleRoyaleTypes';
import { DEFAULT_FOCUS_MODE, type FocusMode } from './FocusModeTypes';
import { buildSpotlightCandidates, parseParticipants } from './CoachingCallRoom/participants';
import { StartBattleRoyaleModal } from './StartBattleRoyaleModal';
import { BattleRoyaleOverlay } from './BattleRoyaleOverlay';
import { BattleRoyaleCoachPanel } from './BattleRoyaleCoachPanel';
import { SpotlightPickerModal } from './SpotlightPickerModal';
import { RolePlayPickerModal } from './RolePlayPickerModal';
import { TopicBanner } from './TopicBanner';
import type { ChatMessage } from './CoachingCallRoom/types';
import { Icon } from './CoachingCallRoom/Icon';
import {
  ConnectingState,
  LiveDurationPill,
  ParticipantCountPill,
  ViewModeToggle,
} from './CoachingCallRoom/CtrlButton';
import { CallOnModal } from './CoachingCallRoom/CallOnModal';
import { ScreenPermissionModal } from './CoachingCallRoom/ScreenPermissionModal';
import { ScreenSharePickerModal } from './CoachingCallRoom/ScreenSharePickerModal';
import { StopShareConfirmModal } from './CoachingCallRoom/StopShareConfirmModal';
import { EndCallConfirmModal } from './CoachingCallRoom/EndCallConfirmModal';
import type { ScreenSource } from '../../../types/electron';
import { HostControlsDropdown } from './CoachingCallRoom/HostControlsDropdown';
import { ChatPanel } from './CoachingCallRoom/ChatPanel';
import { HandQueuePanel } from './CoachingCallRoom/HandQueuePanel';
import { PreCallMirror } from './CoachingCallRoom/PreCallMirror';
import { VideoGrid } from './CoachingCallRoom/VideoGrid';
import { BottomControls } from './CoachingCallRoom/BottomControls';
import logoImage from '../../../../assets/logo.png';
import iconImage from '../../../../assets/icon.png';

interface CoachingCallRoomProps {
  call: CoachingCall;
  currentUserId: string;
  roomUrl: string;
  token: string;
  /** Current user's Sequ3nce profile photo URL; broadcast to other participants
   *  via daily.setUserData after join so their tiles can render the real avatar. */
  selfPhotoUrl?: string | null;
  onLeave: () => void;
}

// The full-screen coaching-call overlay. Assumes it's rendered inside a
// DailyProvider (set up by CoachingCallLayer one level up — the provider
// lives at the app-hub level so the call survives tab navigation).
export function CoachingCallRoom({
  call,
  currentUserId,
  roomUrl,
  token,
  selfPhotoUrl,
  onLeave,
}: CoachingCallRoomProps) {
  const daily = useDaily();
  const {
    minimize,
    markChatUnread,
    markHandsUnread,
    viewMode: sessionViewMode,
    focusMode,
    setFocusMode,
  } = useCoachingSession();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Auto-clear positive notices so they don't pile up on screen.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // Local media state — declared early so call-on acceptance can flip mic on.
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  // Join lifecycle phases:
  //   'preview'  — callObject has camera on but hasn't joined the room yet
  //                (shows PreCallMirror so users can fix hair/lighting first)
  //   'joining'  — daily.join() in flight
  //   'joined'   — live in the room
  const [preJoinPhase, setPreJoinPhase] = useState<'preview' | 'joining' | 'joined'>('preview');

  // UI panels (only one side panel visible at a time; for coach, queue wins
  // when both are open so critical workflow takes priority).
  const [showChat, setShowChat] = useState(false);
  const [showHandQueue, setShowHandQueue] = useState(false);

  // Video layout mode. Speaker is the default — most of a coaching call is
  // the coach teaching; active-speaker follow handles the rest.
  const [viewMode, setViewMode] = useState<'speaker' | 'gallery'>('speaker');

  // Chat state lives here (not inside ChatPanel) so closing the panel doesn't
  // wipe the history. The app-message listener likewise stays mounted for the
  // life of the overlay so messages that arrive while chat is hidden are kept.
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  // Unread count for the in-room chat button badge — covers the full-view
  // case (PiP has its own counter in CoachingSessionContext). Increments when
  // a chat arrives while the panel is closed; resets when the panel opens.
  const [unreadChatInRoom, setUnreadChatInRoom] = useState(0);

  // Raised-hand queue. Keyed by sessionId for O(1) lookup; serialized to
  // array for the queue UI. Stays accurate across panel toggles.
  const [raisedHands, setRaisedHands] = useState<Record<string, {
    sessionId: string;
    userName: string;
    at: number;
  }>>({});

  // (Active-speaker-follow removed in v1.15 — classroom layout has coach
  // always at top; role-play / spotlight override that anchor. No jumpy
  // switching based on who happens to make noise.)

  // focusMode is sourced from CoachingSessionContext (hoisted so the mini PiP
  // can read the same truth). Destructured above with the other context
  // values.

  // Floating emoji reactions. Purely ephemeral; garbage-collected after 2.5s.
  const [liveReactions, setLiveReactions] = useState<Array<{
    id: string;
    sessionId: string;
    emoji: string;
  }>>([]);

  // "Coach asked you to speak" prompt. Set when this user's sessionId is
  // named in a `called-on` broadcast. Modal shows Unmute/Decline.
  const [callOnPrompt, setCallOnPrompt] = useState<{ from: string } | null>(null);

  // Objection Battle Royale — coach-driven live game. One round at a time;
  // single state discriminated-union tracks all phases. See BattleRoyaleTypes
  // for the full shape. `idle` is the at-rest value when no round is active.
  const [brState, setBrState] = useState<BattleRoyaleState>({ phase: 'idle' });
  const [showBrModal, setShowBrModal] = useState(false);
  // Coach-only modals for the two FocusMode triggers.
  const [showSpotlightPicker, setShowSpotlightPicker] = useState(false);
  const [showRolePlayPicker, setShowRolePlayPicker] = useState(false);
  const brCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // (Role Play Rooms / breakouts state removed in v1.15 — replaced by inline
  // role-play where coach spotlights 2 attendees into the top slot.)

  const recordingStartedRef = useRef(false);
  const isCoach = call.coachUserId === currentUserId;

  // Anchor the live-duration timer to a stable value. `call.actualStartTime`
  // is authoritative once set; if the host's activeSession briefly lacks it
  // (shouldn't happen post-fix, but belt-and-suspenders), we capture Date.now()
  // exactly once instead of re-evaluating on every daily-react re-render.
  const startMs = useMemo(
    () => call.actualStartTime ?? Date.now(),
    [call.actualStartTime]
  );

  // Broadcast receiver — stays mounted for the whole overlay session.
  // All app-message payloads come through here and route by `kind`. Every
  // incoming payload is field-validated before state mutation so a malformed
  // message from a future-client version can't crash the listener.
  useDailyEvent('app-message', (ev) => {
    const payload = ev?.data as Record<string, unknown> | undefined;
    if (!payload || typeof payload.kind !== 'string') return;

    if (payload.kind === 'chat' && typeof payload.body === 'string') {
      const from = typeof payload.from === 'string' ? payload.from : 'Anon';
      setChatMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          from,
          body: payload.body as string,
          at: Date.now(),
        },
      ]);
      // Notifications fire unless the user can already see the message land:
      //   - Mini mode → mini badge + chime
      //   - Full mode + chat panel actually rendered → no notification (they see it)
      //   - Full mode + chat panel not rendered (toggled closed OR overtaken
      //     by Battle Royale/hand-queue side panel) → in-room badge + chime
      // `brHasSidePanel` is true when the coach's Battle Royale side panel is
      // displacing the chat panel. For attendees this is always false.
      const brHasSidePanel =
        isCoach && (brState.phase === 'reviewing' || brState.phase === 'voting');
      const chatPanelVisible = showChat && !showHandQueue && !brHasSidePanel;
      if (sessionViewMode === 'mini') {
        markChatUnread();
        playNotificationChime();
      } else if (!chatPanelVisible) {
        setUnreadChatInRoom((n) => n + 1);
        playNotificationChime();
      }
      return;
    }

    if (payload.kind === 'hand-raise' && typeof payload.sessionId === 'string') {
      const sessionId = payload.sessionId as string;
      const userName = typeof payload.userName === 'string' ? payload.userName : 'Guest';
      const at = typeof payload.at === 'number' ? payload.at : Date.now();
      setRaisedHands((prev) => ({ ...prev, [sessionId]: { sessionId, userName, at } }));
      // Same logic: BR side panel displaces the hand-queue panel for the
      // coach even if showHandQueue was true.
      const brHasSidePanel =
        isCoach && (brState.phase === 'reviewing' || brState.phase === 'voting');
      const handQueuePanelVisible = isCoach && showHandQueue && !brHasSidePanel;
      if (sessionViewMode === 'mini') {
        markHandsUnread();
        playNotificationChime();
      } else if (!handQueuePanelVisible) {
        playNotificationChime();
      }
      return;
    }

    if (payload.kind === 'hand-lower' && typeof payload.sessionId === 'string') {
      const sessionId = payload.sessionId as string;
      setRaisedHands((prev) => {
        if (!prev[sessionId]) return prev;
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      return;
    }

    if (payload.kind === 'called-on' && typeof payload.sessionId === 'string') {
      // Only surface the prompt if we're the target.
      const myId = daily?.participants().local?.session_id;
      if (myId && payload.sessionId === myId) {
        const from = typeof payload.from === 'string' ? payload.from : 'the coach';
        setCallOnPrompt({ from });
      }
      return;
    }

    // ---- FocusMode broadcasts (spotlight + role-play) ----
    if (payload.kind === 'spotlight-set' && typeof payload.sessionId === 'string') {
      setFocusMode({ kind: 'spotlight', sessionId: payload.sessionId as string });
      return;
    }

    if (payload.kind === 'spotlight-clear') {
      setFocusMode(DEFAULT_FOCUS_MODE);
      return;
    }

    if (
      payload.kind === 'role-play-start' &&
      Array.isArray(payload.sessionIds) &&
      payload.sessionIds.length === 2 &&
      typeof payload.sessionIds[0] === 'string' &&
      typeof payload.sessionIds[1] === 'string'
    ) {
      const topic = typeof payload.topic === 'string' ? (payload.topic as string) : '';
      setFocusMode({
        kind: 'role-play',
        sessionIds: [payload.sessionIds[0] as string, payload.sessionIds[1] as string],
        topic,
      });
      return;
    }

    if (payload.kind === 'role-play-topic-update' && typeof payload.topic === 'string') {
      const topic = payload.topic as string;
      setFocusMode((prev) =>
        prev.kind === 'role-play' ? { ...prev, topic } : prev,
      );
      return;
    }

    if (payload.kind === 'role-play-end') {
      setFocusMode(DEFAULT_FOCUS_MODE);
      return;
    }

    if (
      payload.kind === 'reaction' &&
      typeof payload.sessionId === 'string' &&
      typeof payload.emoji === 'string' &&
      typeof payload.id === 'string'
    ) {
      const reaction = {
        id: payload.id as string,
        sessionId: payload.sessionId as string,
        emoji: payload.emoji as string,
      };
      setLiveReactions((prev) => [...prev, reaction]);
      setTimeout(() => {
        setLiveReactions((prev) => prev.filter((r) => r.id !== reaction.id));
      }, 2500);
      return;
    }

    // ---- Battle Royale message handling ----

    // Coach starts a round — everyone (including coach) transitions into
    // their respective submitting phase.
    if (
      payload.kind === 'br-start' &&
      typeof payload.objection === 'string' &&
      typeof payload.submitEndTime === 'number' &&
      typeof payload.voteSec === 'number'
    ) {
      const isCoachLocal = call.coachUserId === currentUserId;
      if (isCoachLocal) {
        setBrState({
          phase: 'submitting-coach',
          objection: payload.objection as string,
          submitEndTime: payload.submitEndTime as number,
          voteSec: payload.voteSec as number,
          received: [],
        });
      } else {
        setBrState({
          phase: 'submitting',
          objection: payload.objection as string,
          submitEndTime: payload.submitEndTime as number,
          voteSec: payload.voteSec as number,
          myText: '',
          mySubmissionId: null,
        });
      }
      return;
    }

    // Attendee submission — targeted to coach only. Non-coaches ignore.
    if (
      payload.kind === 'br-submit' &&
      typeof payload.id === 'string' &&
      typeof payload.sessionId === 'string' &&
      typeof payload.text === 'string' &&
      typeof payload.from === 'string' &&
      typeof payload.at === 'number'
    ) {
      const isCoachLocal = call.coachUserId === currentUserId;
      if (!isCoachLocal) return;
      const sub: BRSubmission = {
        id: payload.id as string,
        sessionId: payload.sessionId as string,
        from: payload.from as string,
        text: payload.text as string,
        at: payload.at as number,
      };
      setBrState((prev) => {
        if (prev.phase !== 'submitting-coach' && prev.phase !== 'reviewing') return prev;
        // Dedup by id (safety against double-submits from retries).
        if (prev.received.some((s) => s.id === sub.id)) return prev;
        return { ...prev, received: [...prev.received, sub] };
      });
      return;
    }

    // Coach reveals 3 anonymized finalists — everyone moves into voting phase.
    if (
      payload.kind === 'br-reveal' &&
      typeof payload.objection === 'string' &&
      Array.isArray(payload.reveals) &&
      typeof payload.voteEndTime === 'number'
    ) {
      const reveals: BRReveal[] = [];
      for (const r of payload.reveals as unknown[]) {
        if (r && typeof r === 'object' && 'id' in r && 'text' in r) {
          const cast = r as { id: unknown; text: unknown };
          if (typeof cast.id === 'string' && typeof cast.text === 'string') {
            reveals.push({ id: cast.id, text: cast.text });
          }
        }
      }
      if (reveals.length === 0) return;
      const votesInit: Record<string, number> = {};
      for (const r of reveals) votesInit[r.id] = 0;
      setBrState({
        phase: 'voting',
        objection: payload.objection as string,
        reveals,
        voteEndTime: payload.voteEndTime as number,
        votes: votesInit,
        myVote: null,
      });
      return;
    }

    // Any participant casts a vote.
    if (payload.kind === 'br-vote' && typeof payload.revealId === 'string') {
      const revealId = payload.revealId as string;
      const previousVote = typeof payload.previousVote === 'string'
        ? (payload.previousVote as string)
        : null;
      setBrState((prev) => {
        if (prev.phase !== 'voting') return prev;
        const nextVotes = { ...prev.votes };
        if (previousVote && nextVotes[previousVote] !== undefined) {
          nextVotes[previousVote] = Math.max(0, nextVotes[previousVote] - 1);
        }
        if (nextVotes[revealId] === undefined) nextVotes[revealId] = 0;
        nextVotes[revealId] += 1;
        return { ...prev, votes: nextVotes };
      });
      return;
    }

    // Coach announces winner — everyone shows the winner card for 6s.
    if (
      payload.kind === 'br-complete' &&
      typeof payload.objection === 'string' &&
      payload.winner && typeof payload.winner === 'object'
    ) {
      const w = payload.winner as { id?: unknown; text?: unknown; from?: unknown };
      if (typeof w.id !== 'string' || typeof w.text !== 'string') return;
      const winner: BRReveal = {
        id: w.id,
        text: w.text,
        from: typeof w.from === 'string' ? w.from : undefined,
      };
      setBrState({
        phase: 'complete',
        objection: payload.objection as string,
        winner,
      });
      if (brCompleteTimerRef.current) clearTimeout(brCompleteTimerRef.current);
      brCompleteTimerRef.current = setTimeout(() => {
        setBrState({ phase: 'idle' });
      }, 6000);
      return;
    }

    // Coach aborted the round (explicit cancel) — everyone resets.
    if (payload.kind === 'br-abort') {
      setBrState({ phase: 'idle' });
      return;
    }

    // (Breakout app-message handlers removed in v1.15 — inline role-play
    // replaces breakout sub-rooms.)
  });

  // (active-speaker-change listener removed in v1.15 — classroom layout
  // doesn't use active-speaker for focus selection.)

  // Participant-joined — when a new attendee joins mid-session, the coach
  // re-broadcasts the current focus mode TARGETED TO THEM ONLY. Without this,
  // the new joiner's `focusMode` would stay at the default (coach-top) while
  // everyone else sees spotlight/role-play, because app-messages don't
  // replay history to new participants.
  //
  // Targeted (sendAppMessage payload, targetSessionId) instead of broadcast
  // so we don't spam existing clients with redundant state they already have.
  useDailyEvent('participant-joined', (ev) => {
    if (!isCoach || !daily) return;
    const newSessionId = (ev as { participant?: { session_id?: string } })?.participant?.session_id;
    if (!newSessionId) return;
    if (focusMode.kind === 'spotlight') {
      try {
        daily.sendAppMessage(
          { kind: 'spotlight-set', sessionId: focusMode.sessionId },
          newSessionId,
        );
      } catch (err) {
        console.error('[CoachingCallRoom] focus resync (spotlight) failed:', err);
      }
    } else if (focusMode.kind === 'role-play') {
      try {
        daily.sendAppMessage(
          {
            kind: 'role-play-start',
            sessionIds: focusMode.sessionIds,
            topic: focusMode.topic,
          },
          newSessionId,
        );
      } catch (err) {
        console.error('[CoachingCallRoom] focus resync (role-play) failed:', err);
      }
    }
    // No resync needed for focusMode.kind === 'coach' — that's the default
    // the new joiner already has.
  });

  // Participant-left — sweep stale state referencing this session id:
  //   1. Raised-hand queue entries (existing since v1.12).
  //   2. FocusMode targets — if the spotlight/role-play target leaves, reset
  //      to coach mode. Only the coach broadcasts the cleanup so attendees'
  //      clients stay in sync (attendees also auto-reset locally as a
  //      belt-and-suspenders in case the broadcast is missed).
  useDailyEvent('participant-left', (ev) => {
    const sessionId = (ev as { participant?: { session_id?: string } })?.participant?.session_id;
    if (!sessionId) return;

    // Drop from raised-hand queue.
    setRaisedHands((prev) => {
      if (!prev[sessionId]) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });

    // FocusMode reset if the leaver is a current spotlight / role-play target.
    if (focusMode.kind === 'spotlight' && focusMode.sessionId === sessionId) {
      if (isCoach && daily) {
        try { daily.sendAppMessage({ kind: 'spotlight-clear' }, '*'); } catch { /* non-fatal */ }
      }
      setFocusMode(DEFAULT_FOCUS_MODE);
    } else if (
      focusMode.kind === 'role-play' &&
      focusMode.sessionIds.includes(sessionId)
    ) {
      if (isCoach && daily) {
        try { daily.sendAppMessage({ kind: 'role-play-end' }, '*'); } catch { /* non-fatal */ }
      }
      setFocusMode(DEFAULT_FOCUS_MODE);
    }
  });

  function sendChat(body: string) {
    if (!daily) return;
    const myName = daily.participants().local?.user_name || 'You';
    daily.sendAppMessage({ kind: 'chat', body, from: myName }, '*');
    setChatMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-local`, from: myName, body, at: Date.now() },
    ]);
  }

  // Toggle our own raised-hand state + broadcast. Immediate local state
  // update means the button reflects intent even if the broadcast is slow.
  function toggleRaiseHand() {
    if (!daily) return;
    const local = daily.participants().local;
    const myId = local?.session_id;
    if (!myId) return;
    const raised = !!raisedHands[myId];
    try {
      if (raised) {
        daily.sendAppMessage({ kind: 'hand-lower', sessionId: myId }, '*');
        setRaisedHands((prev) => {
          const next = { ...prev };
          delete next[myId];
          return next;
        });
      } else {
        const userName = local?.user_name || 'You';
        const at = Date.now();
        daily.sendAppMessage({ kind: 'hand-raise', sessionId: myId, userName, at }, '*');
        setRaisedHands((prev) => ({ ...prev, [myId]: { sessionId: myId, userName, at } }));
      }
    } catch (err) {
      console.error('[CoachingCallRoom] toggleRaiseHand failed:', err);
    }
  }

  // Coach-only. Sends `called-on`; the named attendee's client handles the
  // prompt. Coach's local queue clears immediately so the UI doesn't wait
  // for a round-trip — if the attendee declines, nothing else happens.
  function callOn(sessionId: string) {
    if (!daily || !isCoach) return;
    const coachName = daily.participants().local?.user_name || 'Coach';
    try {
      daily.sendAppMessage({ kind: 'called-on', sessionId, from: coachName }, '*');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to call on participant');
      return;
    }
    setRaisedHands((prev) => {
      if (!prev[sessionId]) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }

  // Coach dismisses a hand from the queue locally — does not broadcast, so
  // the attendee's hand stays up from their POV. Intentional: prevents
  // accidental dismiss from looking like the coach rejected them.
  function dismissHand(sessionId: string) {
    setRaisedHands((prev) => {
      if (!prev[sessionId]) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
  }

  // Called-on prompt handlers — runs on the attendee who was called on.
  async function acceptCallOn() {
    if (!daily) { setCallOnPrompt(null); return; }
    const myId = daily.participants().local?.session_id;
    try {
      await daily.setLocalAudio(true);
      setMicOn(true);
      if (myId) {
        daily.sendAppMessage({ kind: 'hand-lower', sessionId: myId }, '*');
        setRaisedHands((prev) => {
          if (!prev[myId]) return prev;
          const next = { ...prev };
          delete next[myId];
          return next;
        });
      }
    } catch (err) {
      console.error('[CoachingCallRoom] acceptCallOn failed:', err);
    }
    setCallOnPrompt(null);
  }

  function declineCallOn() {
    if (!daily) { setCallOnPrompt(null); return; }
    const myId = daily.participants().local?.session_id;
    if (myId) {
      daily.sendAppMessage({ kind: 'hand-lower', sessionId: myId }, '*');
      setRaisedHands((prev) => {
        if (!prev[myId]) return prev;
        const next = { ...prev };
        delete next[myId];
        return next;
      });
    }
    setCallOnPrompt(null);
  }

  // Coach-only FocusMode controls (spotlight + role-play). Each fn is the
  // sole source of truth for its transition — broadcasts via app-message AND
  // updates local state optimistically. Every attendee receives the
  // app-message and updates their own FocusMode via the listener.
  function startSpotlight(sessionId: string) {
    if (!daily || !isCoach) return;
    try {
      daily.sendAppMessage({ kind: 'spotlight-set', sessionId }, '*');
      setFocusMode({ kind: 'spotlight', sessionId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to spotlight');
    }
  }

  function endSpotlight() {
    if (!daily || !isCoach) return;
    try {
      daily.sendAppMessage({ kind: 'spotlight-clear' }, '*');
      setFocusMode(DEFAULT_FOCUS_MODE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear spotlight');
    }
  }

  function startRolePlay(sessionIds: [string, string], topic: string) {
    if (!daily || !isCoach) return;
    try {
      daily.sendAppMessage({ kind: 'role-play-start', sessionIds, topic }, '*');
      setFocusMode({ kind: 'role-play', sessionIds, topic });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start role play');
    }
  }

  function updateRolePlayTopic(topic: string) {
    if (!daily || !isCoach) return;
    if (focusMode.kind !== 'role-play') return;
    try {
      daily.sendAppMessage({ kind: 'role-play-topic-update', topic }, '*');
      setFocusMode((prev) => (prev.kind === 'role-play' ? { ...prev, topic } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update topic');
    }
  }

  function endRolePlay() {
    if (!daily || !isCoach) return;
    try {
      daily.sendAppMessage({ kind: 'role-play-end' }, '*');
      setFocusMode(DEFAULT_FOCUS_MODE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end role play');
    }
  }

  // ---- Battle Royale handlers (coach + attendee) ----

  // Coach-only: broadcast the start of a round. Everyone transitions into
  // their role-specific submitting phase.
  function startBattleRoyale(args: { objection: string; submitSec: number; voteSec: number }) {
    if (!daily || !isCoach) return;
    const submitEndTime = Date.now() + args.submitSec * 1000;
    try {
      daily.sendAppMessage(
        {
          kind: 'br-start',
          objection: args.objection,
          submitEndTime,
          voteSec: args.voteSec,
        },
        '*',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start round');
      return;
    }
    // Seed coach's own state (listener will also fire but this avoids a
    // flicker since sendAppMessage echo delivery isn't synchronous).
    setBrState({
      phase: 'submitting-coach',
      objection: args.objection,
      submitEndTime,
      voteSec: args.voteSec,
      received: [],
    });
    setShowBrModal(false);
  }

  // Attendee-only: update local draft while typing. Parent owns this state
  // because the submit timer lives at the parent; the overlay is a pure view.
  function updateBrDraft(text: string) {
    setBrState((prev) =>
      prev.phase === 'submitting' ? { ...prev, myText: text } : prev,
    );
  }

  // Attendee-only: submit rebuttal to the coach (targeted app-message).
  function submitMyRebuttal(text: string) {
    if (!daily) return;
    const local = daily.participants().local;
    if (!local) return;
    const mySessionId = local.session_id;
    const myName = local.user_name || 'Attendee';
    // Find the coach's session id by user_name comparison. The coach's display
    // name is set when the token is minted (coach's real name). If lookup
    // fails, broadcast to all as a fallback — other attendees will ignore.
    const participants = daily.participants();
    const coachSessionId = Object.values(participants).find(
      (p) => p.user_name === call.coachName,
    )?.session_id;
    const subId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const payload = {
        kind: 'br-submit',
        id: subId,
        sessionId: mySessionId,
        text,
        from: myName,
        at: Date.now(),
      };
      if (coachSessionId) {
        daily.sendAppMessage(payload, coachSessionId);
      } else {
        // Fallback broadcast if we can't resolve the coach's session.
        daily.sendAppMessage(payload, '*');
      }
    } catch (err) {
      console.error('[CoachingCallRoom] br-submit failed:', err);
      setError('Failed to submit rebuttal');
      return;
    }
    setBrState((prev) =>
      prev.phase === 'submitting'
        ? { ...prev, myText: text, mySubmissionId: subId }
        : prev,
    );
  }

  // Coach-only: toggle selection during reviewing phase.
  function brToggleSelect(submissionId: string) {
    setBrState((prev) => {
      if (prev.phase !== 'reviewing') return prev;
      const next = new Set(prev.selected);
      if (next.has(submissionId)) next.delete(submissionId);
      else if (next.size < 3) next.add(submissionId);
      return { ...prev, selected: next };
    });
  }

  // Coach-only: reveal the 3 selected submissions to everyone, transition to voting.
  function brReveal() {
    if (!daily || !isCoach) return;
    setBrState((prev) => {
      if (prev.phase !== 'reviewing') return prev;
      if (prev.selected.size !== 3) return prev;
      const reveals: BRReveal[] = prev.received
        .filter((s) => prev.selected.has(s.id))
        .map((s) => ({ id: s.id, text: s.text }));
      const voteEndTime = Date.now() + prev.voteSec * 1000;
      try {
        daily.sendAppMessage(
          {
            kind: 'br-reveal',
            objection: prev.objection,
            reveals,
            voteEndTime,
          },
          '*',
        );
      } catch (err) {
        console.error('[CoachingCallRoom] br-reveal failed:', err);
      }
      const votesInit: Record<string, number> = {};
      for (const r of reveals) votesInit[r.id] = 0;
      // Keep `received` accessible so we can look up the author when ending
      // voting (winner reveal includes from=authorName). Stash via closure:
      brAuthorsRef.current = new Map(prev.received.map((s) => [s.id, s]));
      return {
        phase: 'voting',
        objection: prev.objection,
        reveals,
        voteEndTime,
        votes: votesInit,
        myVote: null,
      };
    });
  }

  // Any participant: cast a vote. Optimistic local + broadcast.
  function castBrVote(revealId: string) {
    if (!daily) return;
    setBrState((prev) => {
      if (prev.phase !== 'voting') return prev;
      if (prev.myVote === revealId) return prev; // already voted for this one
      const previousVote = prev.myVote;
      try {
        daily.sendAppMessage(
          {
            kind: 'br-vote',
            revealId,
            previousVote: previousVote ?? undefined,
          },
          '*',
        );
      } catch (err) {
        console.error('[CoachingCallRoom] br-vote failed:', err);
        return prev;
      }
      const nextVotes = { ...prev.votes };
      if (previousVote && nextVotes[previousVote] !== undefined) {
        nextVotes[previousVote] = Math.max(0, nextVotes[previousVote] - 1);
      }
      nextVotes[revealId] = (nextVotes[revealId] ?? 0) + 1;
      return { ...prev, myVote: revealId, votes: nextVotes };
    });
  }

  // Coach-only: end voting, announce winner, auto-save to Playbook.
  async function endBrVoting() {
    if (!daily || !isCoach) return;
    const state = brState;
    if (state.phase !== 'voting') return;

    // Winner = highest votes; tiebreak = earliest submission (from authorsRef).
    const ranked = state.reveals
      .map((r) => ({
        ...r,
        count: state.votes[r.id] ?? 0,
        at: brAuthorsRef.current.get(r.id)?.at ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => b.count - a.count || a.at - b.at);
    const winnerReveal = ranked[0];
    if (!winnerReveal) return;
    const author = brAuthorsRef.current.get(winnerReveal.id);
    const winnerWithAuthor: BRReveal = {
      id: winnerReveal.id,
      text: winnerReveal.text,
      from: author?.from,
    };

    try {
      daily.sendAppMessage(
        {
          kind: 'br-complete',
          objection: state.objection,
          winner: winnerWithAuthor,
        },
        '*',
      );
    } catch (err) {
      console.error('[CoachingCallRoom] br-complete failed:', err);
    }

    // Show winner locally too.
    setBrState({ phase: 'complete', objection: state.objection, winner: winnerWithAuthor });
    if (brCompleteTimerRef.current) clearTimeout(brCompleteTimerRef.current);
    brCompleteTimerRef.current = setTimeout(() => {
      setBrState({ phase: 'idle' });
    }, 6000);

    // Auto-save to Playbook. Surface success explicitly so the coach knows
    // the round persisted; without it the absence of an error toast is
    // ambiguous (did it save? was the toast missed?). On error, fall back
    // to clipboard so the text isn't lost.
    try {
      const res = await createPlaybookEntry({
        coachUserId: currentUserId,
        rebuttalText: winnerWithAuthor.text,
        objectionText: state.objection,
        authorName: winnerWithAuthor.from || 'Anonymous',
        sourceCallId: call._id,
      });
      if ('error' in res) throw new Error(res.error);
      console.info('[CoachingCallRoom] createPlaybookEntry saved entry', res.entryId);
      setNotice('Winner saved to Objection Playbook ✓');
      // Tell any mounted Training/Playbook list to refetch so the new entry
      // appears without requiring a full tab remount.
      window.dispatchEvent(new CustomEvent('br:playbook-saved'));
    } catch (err) {
      console.error('[CoachingCallRoom] createPlaybookEntry failed:', err);
      try {
        await navigator.clipboard.writeText(winnerWithAuthor.text);
        setError("Couldn't save winner to Playbook — copied text to your clipboard instead.");
      } catch {
        setError("Couldn't save winner to Playbook. Add manually via Community → Training.");
      }
    }
  }

  // Coach-only: abandon the current round (no winner, no save).
  function abortBr() {
    if (!daily || !isCoach) return;
    try {
      daily.sendAppMessage({ kind: 'br-abort' }, '*');
    } catch { /* non-fatal */ }
    setBrState({ phase: 'idle' });
  }

  // Ref holding the full submission list so we can look up authors for the
  // winner reveal after we've dropped down to a reveals[] subset in state.
  const brAuthorsRef = useRef<Map<string, BRSubmission>>(new Map());

  // Phase-timer transitions:
  //   - submit timer ends → BOTH coach + attendees move to 'reviewing'.
  //     Coach sees the picker; attendees see "Coach is picking finalists…".
  //     (Previously only the coach transitioned; attendees hung forever
  //      waiting for br-reveal — v1.14.0 bug.)
  //   - When there are ≤3 submissions total, coach's picker auto-selects
  //     all of them so they can Reveal immediately (no point picking top-3
  //     from a set of 2). With ≥4, coach has to manually select 3.
  //   - Vote timer ends → attendees stay in voting-ended state; coach sees
  //     "End voting" button. We DO NOT auto-end voting — coach confirms.
  useEffect(() => {
    if (brState.phase !== 'submitting' && brState.phase !== 'submitting-coach') return;

    const transitionNow = (prev: BattleRoyaleState): BattleRoyaleState => {
      if (prev.phase === 'submitting-coach') {
        const autoSelect = prev.received.length <= 3
          ? new Set(prev.received.map((s) => s.id))
          : new Set<string>();
        return {
          phase: 'reviewing',
          objection: prev.objection,
          voteSec: prev.voteSec,
          received: prev.received,
          selected: autoSelect,
        };
      }
      if (prev.phase === 'submitting') {
        return {
          phase: 'reviewing',
          objection: prev.objection,
          voteSec: prev.voteSec,
          received: [],
          selected: new Set<string>(),
        };
      }
      return prev;
    };

    const remaining = brState.submitEndTime - Date.now();
    if (remaining <= 0) {
      setBrState((prev) => transitionNow(prev));
      return;
    }
    const timer = setTimeout(() => {
      setBrState((prev) => transitionNow(prev));
    }, remaining);
    return () => clearTimeout(timer);
  }, [brState]);

  // (Breakout handlers + effects removed in v1.15 — replaced by inline
  // role-play via FocusMode. See plan docs for the new model.)

  // Send a reaction. Fire-and-forget — reactions fading for a sender is fine
  // if the broadcast fails, because locally we also render immediately.
  function sendReaction(emoji: string) {
    if (!daily) return;
    const myId = daily.participants().local?.session_id;
    if (!myId) return;
    const reactionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      daily.sendAppMessage(
        { kind: 'reaction', emoji, sessionId: myId, id: reactionId },
        '*'
      );
    } catch (err) {
      console.error('[CoachingCallRoom] sendReaction broadcast failed:', err);
    }
    const reaction = { id: reactionId, sessionId: myId, emoji };
    setLiveReactions((prev) => [...prev, reaction]);
    setTimeout(() => {
      setLiveReactions((prev) => prev.filter((r) => r.id !== reaction.id));
    }, 2500);
  }

  // Two-phase join: start camera on mount for the pre-call mirror, then
  // daily.join() only when the user clicks "Join now." Sharing one callObject
  // across both phases means no double media-permission prompt.
  useEffect(() => {
    let cancelled = false;
    async function startPreview() {
      if (!daily) return;
      try {
        await daily.startCamera();
        if (cancelled) return;
        // Mic starts unmuted by default — user can pre-mute via the mirror
        // controls. `daily.setLocalAudio(true)` at this point guarantees the
        // audio track is live so the mic meter can register level.
        try { await daily.setLocalAudio(true); } catch { /* non-fatal */ }
      } catch (err) {
        // Camera unavailable or permission issue — skip preview and go
        // straight to join so the user isn't blocked. They'll get an error
        // from daily.join() if this is a permission-level problem.
        console.error('[CoachingCallRoom] startCamera failed:', err);
        if (!cancelled) {
          void joinRoom();
        }
      }
    }
    void startPreview();
    return () => {
      cancelled = true;
    };
  }, [daily]);

  // Actually join the Daily room. Triggered by the user from PreCallMirror
  // (or automatically if startCamera fails). After join, coach starts cloud
  // recording and every user publishes their profile photo.
  async function joinRoom() {
    if (!daily) return;
    setPreJoinPhase('joining');
    try {
      await daily.join({ url: roomUrl, token });
      // Broadcast our identity — photo URL is used by other clients to render
      // the avatar when our camera is off; b2cUserId lets every client resolve
      // the coach's session id (by matching this value against call.coachUserId).
      // v1.14 used first-joined as the coach fallback; that's fragile on reconnect.
      try {
        daily.setUserData({
          photoUrl: selfPhotoUrl ?? undefined,
          b2cUserId: currentUserId,
        });
      } catch {
        // non-fatal; photo falls back to initial-letter avatar, coach lookup
        // falls back to first-joined (v1.14 behavior).
      }
      // Coach starts cloud recording. Only the call owner has permission;
      // attendees calling this would get a permission error from Daily.
      // Guard with a ref so React strict-mode double-mount doesn't double-fire.
      if (isCoach && !recordingStartedRef.current) {
        recordingStartedRef.current = true;
        try {
          await daily.startRecording();
        } catch (recErr) {
          console.error('[CoachingCallRoom] startRecording failed:', recErr);
          // Don't block the call — user experience is that recording silently
          // fails to start, which is still better than blocking the whole call.
        }
      }
      setPreJoinPhase('joined');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join call');
      setPreJoinPhase('preview');
    }
  }

  // If the coach ends the call, Daily emits 'left-meeting' for everyone
  useDailyEvent('left-meeting', () => {
    onLeave();
  });

  async function toggleMic() {
    if (!daily) return;
    const next = !micOn;
    setMicOn(next);
    await daily.setLocalAudio(next);
  }
  async function toggleCam() {
    if (!daily) return;
    const next = !camOn;
    setCamOn(next);
    await daily.setLocalVideo(next);
  }
  // Flag raised when macOS Screen Recording permission isn't granted. Triggers
  // a modal directing the coach to System Settings. Gated behind isCoach since
  // attendees can't share anyway.
  const [screenPermissionNeeded, setScreenPermissionNeeded] = useState(false);
  const [pickerSources, setPickerSources] = useState<ScreenSource[] | null>(null);
  const [showStopShareConfirm, setShowStopShareConfirm] = useState(false);
  const [showEndCallConfirm, setShowEndCallConfirm] = useState(false);

  // Subscribe to display-media:request from main when getDisplayMedia is
  // called. The deferred handler in main holds the callback; we render the
  // picker; the user's pick is routed back via selectDisplayMediaSource
  // which fires the callback and resolves getDisplayMedia.
  useEffect(() => {
    const sub = window.electron?.app?.onDisplayMediaRequest;
    if (!sub) return;
    return sub((sources) => setPickerSources(sources));
  }, []);

  async function toggleScreenShare() {
    if (!daily || !isCoach) return;
    if (screenSharing) {
      // Confirm before tearing down a live share — easy to mis-click during
      // a demo. The actual stop happens in confirmStopShare below.
      setShowStopShareConfirm(true);
      return;
    }

    // macOS Screen Recording permission gate. Without this, getDisplayMedia
    // returns a stream with no video track and viewers see a black tile.
    const electronApp = (window as unknown as {
      electron?: { app?: { getScreenAccessStatus?: () => Promise<string> } };
    }).electron?.app;
    if (electronApp?.getScreenAccessStatus) {
      try {
        const status = await electronApp.getScreenAccessStatus();
        if (status !== 'granted') {
          setScreenPermissionNeeded(true);
          return;
        }
      } catch (err) {
        console.error('[CoachingCallRoom] getScreenAccessStatus failed:', err);
        // Fall through and try anyway — might still work on non-macOS.
      }
    }

    // Canonical Daily pattern (per docs.daily.co): renderer calls
    // getDisplayMedia; the resulting MediaStream is passed to startScreenShare.
    //
    //   navigator.mediaDevices.getDisplayMedia({ video: true }).then(stream =>
    //     call.startScreenShare({ mediaStream: stream })
    //   );
    //
    // getDisplayMedia fires our setDisplayMediaRequestHandler in main, which
    // defers and pushes sources to the renderer; ScreenSharePickerModal
    // mounts; user picks; selectDisplayMediaSource fires the deferred
    // callback; getDisplayMedia resolves with a MediaStream backed by the
    // chosen source. Daily then properly creates a screenVideo track on the
    // local participant, which our ScreenShareTile renders for everyone
    // (including the sharer's own preview).
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    } catch (err) {
      // User cancelling the picker fires a benign abort error — silent.
      if (err instanceof Error && /cancel|abort|NotAllowed/i.test(err.message)) {
        return;
      }
      console.error('[CoachingCallRoom] getDisplayMedia failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to capture screen';
      if (/permission|denied|capture/i.test(message)) {
        setScreenPermissionNeeded(true);
      } else {
        setError(message);
      }
      return;
    }

    try {
      await daily.startScreenShare({ mediaStream: stream });
      setScreenSharing(true);
    } catch (err) {
      console.error('[CoachingCallRoom] startScreenShare failed:', err);
      // Daily didn't take the stream — release the OS capture ourselves.
      stream.getTracks().forEach((t) => t.stop());
      setError(err instanceof Error ? err.message : 'Failed to start screen share');
    }
  }

  // Resolves the deferred display-media request triggered by our own
  // getDisplayMedia call above. The renderer-side picker passes the user's
  // pick (or null on cancel) here.
  function confirmScreenShare(sourceId: string | null) {
    setPickerSources(null);
    const api = window.electron?.app?.selectDisplayMediaSource;
    if (api) {
      void api(sourceId);
    }
  }

  function confirmStopShare() {
    setShowStopShareConfirm(false);
    if (!daily) return;
    // Canonical Daily stop pattern (per docs.daily.co): grab the persistent
    // track refs BEFORE calling stopScreenShare, then explicitly stop them.
    // stopScreenShare alone tells Daily to stop sending; the underlying OS
    // capture only releases when track.stop() is called. Without this,
    // macOS keeps the recording-indicator menu-bar icon up indefinitely.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const localTracks = daily.participants().local?.tracks as any;
    const vidTrack: MediaStreamTrack | null | undefined =
      localTracks?.screenVideo?.persistentTrack;
    const audTrack: MediaStreamTrack | null | undefined =
      localTracks?.screenAudio?.persistentTrack;
    try {
      daily.stopScreenShare();
    } catch (err) {
      console.error('[CoachingCallRoom] stopScreenShare failed:', err);
    }
    try {
      vidTrack?.stop();
      audTrack?.stop();
    } catch (err) {
      console.error('[CoachingCallRoom] track.stop() failed:', err);
    }
    setScreenSharing(false);
  }

  async function openScreenSettings() {
    const electronApp = (window as unknown as {
      electron?: { app?: { openScreenSettings?: () => Promise<boolean> } };
    }).electron?.app;
    if (electronApp?.openScreenSettings) {
      try { await electronApp.openScreenSettings(); } catch { /* non-fatal */ }
    }
    setScreenPermissionNeeded(false);
  }

  async function handleLeave() {
    await daily?.leave();
    onLeave();
  }

  function handleEndCall() {
    if (!isCoach) return;
    // Open confirm modal — the actual room teardown happens in confirmEndCall.
    setShowEndCallConfirm(true);
  }

  async function confirmEndCall() {
    setShowEndCallConfirm(false);
    if (!isCoach) return;
    const res = await endCoachingCall(call._id, currentUserId);
    if (res.error) {
      setError(res.error);
      return;
    }
    // Daily will emit left-meeting when the room closes; until then, leave ourselves
    await daily?.leave();
    onLeave();
  }

  // While in preview phase, render the mirror instead of the live room.
  if (preJoinPhase === 'preview') {
    return (
      <PreCallMirror
        call={call}
        micOn={micOn}
        camOn={camOn}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onJoin={joinRoom}
        onCancel={onLeave}
      />
    );
  }

  // Coach gets the hand-queue button; attendees don't need it.
  const handQueueCount = Object.keys(raisedHands).length;
  const myLocalSessionId = daily?.participants().local?.session_id ?? null;
  const myHandRaised = myLocalSessionId ? !!raisedHands[myLocalSessionId] : false;

  return (
    <div
      className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col font-sans"
      // Override the underlying MeetingBotHub `.titlebar` drag region
      // (`-webkit-app-region: drag`) which otherwise eats clicks on top-bar
      // buttons whose pixel position happens to land in the underlying drag
      // strip. Coach-specific symptom: ViewModeToggle was unclickable for the
      // coach because their extra host buttons pushed the toggle leftward
      // into the drag zone, while non-coach attendees had fewer buttons so
      // the toggle landed in the no-drag (Messages/QuickBot) zone.
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {/* Top bar — 3 zones: meta left, brand center, status right.
          Left padding reserved for macOS traffic lights (titlebar:hiddenInset). */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-3 border-b border-white/10">
        {/* Left: live pill + session context */}
        <div className="flex items-center gap-3 min-w-0 pl-[80px]">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">
              Live · {call.coachName}
            </div>
            <div className="text-sm font-semibold text-white truncate">{call.title}</div>
          </div>
        </div>

        {/* Center: brand anchor */}
        <div className="flex items-center justify-center">
          <img
            src={logoImage}
            alt="Sequ3nce"
            className="h-14 w-auto [filter:invert(1)_contrast(1.1)_brightness(1.1)]"
          />
        </div>

        {/* Right: view toggle + timer + count + (clear-spotlight) + hand queue + chat */}
        <div className="flex items-center justify-end gap-3">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <span className="text-white/30">·</span>
          <LiveDurationPill startMs={startMs} />
          <span className="text-white/30">·</span>
          <ParticipantCountPill />
          {isCoach && focusMode.kind === 'spotlight' && (
            <button
              onClick={endSpotlight}
              className="ml-1 px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase tracking-wider bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors"
              title="Clear spotlight"
            >
              Clear spotlight
            </button>
          )}
          {isCoach && focusMode.kind === 'role-play' && (
            <button
              onClick={endRolePlay}
              className="ml-1 px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase tracking-wider bg-sky-500/20 text-sky-200 hover:bg-sky-500/30 transition-colors"
              title="End the role play"
            >
              End role play
            </button>
          )}
          {isCoach && brState.phase === 'idle' && focusMode.kind === 'coach' && (
            <HostControlsDropdown
              onStartBattleRoyale={() => setShowBrModal(true)}
              onStartSpotlight={() => setShowSpotlightPicker(true)}
              onStartRolePlay={() => setShowRolePlayPicker(true)}
            />
          )}
          {isCoach && (
            <button
              onClick={() => { setShowHandQueue((v) => !v); if (!showHandQueue) setShowChat(false); }}
              aria-label={showHandQueue ? 'Hide hand queue' : 'Show hand queue'}
              className={`ml-1 relative p-2 rounded-lg transition-colors ${
                showHandQueue
                  ? 'bg-white text-black'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              title="Raised hands"
            >
              <Icon name="hand" className="w-4 h-4" />
              {handQueueCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-amber-400 text-black text-[9px] font-bold">
                  {handQueueCount}
                </span>
              )}
            </button>
          )}
          <button
            onClick={() => {
              const opening = !showChat;
              setShowChat(opening);
              if (opening) {
                setShowHandQueue(false);
                // Opening the panel means the user has now seen everything
                // — clear the unread count so the badge goes away.
                setUnreadChatInRoom(0);
              }
            }}
            aria-label={showChat ? 'Hide chat' : 'Show chat'}
            className={`relative ml-1 p-2 rounded-lg transition-colors ${
              showChat
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon name="chat" className="w-4 h-4" />
            {!showChat && unreadChatInRoom > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-amber-400 text-black text-[9px] font-bold">
                {unreadChatInRoom}
              </span>
            )}
          </button>
          <button
            onClick={minimize}
            aria-label="Minimize call"
            title="Minimize (keep the call running while you use the rest of the app)"
            className="ml-1 p-2 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Icon name="minimize" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="mx-6 mt-3 px-3 py-2 bg-red-950/60 border border-red-900 text-red-200 rounded-lg text-[12px]">
          {error}
        </div>
      )}

      {/* Success / notice toast — auto-clears after 5s */}
      {notice && (
        <div className="mx-6 mt-3 px-3 py-2 bg-emerald-950/60 border border-emerald-900 text-emerald-200 rounded-lg text-[12px]">
          {notice}
        </div>
      )}

      {/* Main content: video area + optional side panel */}
      <div className="flex-1 flex min-h-0 relative">
        <div className="flex-1 p-6 overflow-hidden relative">
          {preJoinPhase === 'joined' ? (
            <VideoGrid
              coachUserId={call.coachUserId}
              isCoachView={isCoach}
              callId={call._id}
              currentUserId={currentUserId}
              viewMode={viewMode}
              focusMode={focusMode}
              raisedHands={raisedHands}
              liveReactions={liveReactions}
              onSpotlight={startSpotlight}
              onKickError={setError}
            />
          ) : (
            <ConnectingState />
          )}

          {/* Topic banner — shown during an active role play when the coach
              provided a topic. Minimizable; coach can edit inline. Unmounts
              when the role play ends (FocusMode transitions to coach). */}
          {focusMode.kind === 'role-play' && focusMode.topic.length > 0 && (
            <TopicBanner
              topic={focusMode.topic}
              isCoach={isCoach}
              onEdit={updateRolePlayTopic}
            />
          )}

          {/* Battle Royale overlay — renders over the video area during active
              rounds (submitting/voting/complete). Pointer-transparent outside
              the card so clicks on the grid still work. */}
          <BattleRoyaleOverlay
            state={brState}
            onSubmit={submitMyRebuttal}
            onVote={castBrVote}
            onDraftChange={updateBrDraft}
          />
        </div>

        {/* Side panels — only one visible at a time. Coach's Battle Royale
            workspace takes priority over chat/hand-queue during review/voting
            so they can focus on the game. */}
        {isCoach && (brState.phase === 'reviewing' || brState.phase === 'voting') ? (
          <BattleRoyaleCoachPanel
            state={brState}
            onToggleSelect={brToggleSelect}
            onReveal={brReveal}
            onEndVoting={endBrVoting}
            onAbort={abortBr}
          />
        ) : (
          <>
            {showChat && !showHandQueue && <ChatPanel messages={chatMessages} onSend={sendChat} />}
            {isCoach && showHandQueue && (
              <HandQueuePanel
                raisedHands={raisedHands}
                onCallOn={callOn}
                onDismiss={dismissHand}
              />
            )}
          </>
        )}

        {/* Watermark — signature icon mark bottom-left of the video pane.
            No opacity filter — that was washing the inverted white against the
            black background. Solid white icon reads as a clean brand signature. */}
        <div className="absolute bottom-4 left-6 pointer-events-none">
          <img
            src={iconImage}
            alt=""
            className="h-12 w-auto [filter:invert(1)_contrast(1.5)_brightness(1.1)]"
          />
        </div>
      </div>

      <BottomControls
        micOn={micOn}
        camOn={camOn}
        screenSharing={screenSharing}
        isCoach={isCoach}
        focusMode={focusMode}
        myHandRaised={myHandRaised}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleScreenShare={toggleScreenShare}
        onToggleRaiseHand={toggleRaiseHand}
        onReact={sendReaction}
        onLeave={handleLeave}
        onEndCall={handleEndCall}
      />

      {/* "Coach asked you to speak" — appears only for the called-on user */}
      {callOnPrompt && (
        <CallOnModal
          from={callOnPrompt.from}
          onAccept={acceptCallOn}
          onDecline={declineCallOn}
        />
      )}

      {/* Coach-only Battle Royale start modal */}
      {showBrModal && isCoach && (
        <StartBattleRoyaleModal
          onClose={() => setShowBrModal(false)}
          onStart={startBattleRoyale}
        />
      )}

      {/* Coach-only Spotlight picker — pick 1 attendee to feature at top */}
      {showSpotlightPicker && isCoach && (
        <SpotlightPickerModal
          candidates={buildSpotlightCandidates(parseParticipants(daily), call.coachUserId)}
          onClose={() => setShowSpotlightPicker(false)}
          onStart={(sessionId) => {
            startSpotlight(sessionId);
            setShowSpotlightPicker(false);
          }}
        />
      )}

      {/* Coach-only Role Play picker — pick 2 attendees + optional topic */}
      {showRolePlayPicker && isCoach && (
        <RolePlayPickerModal
          candidates={buildSpotlightCandidates(parseParticipants(daily), call.coachUserId)}
          onClose={() => setShowRolePlayPicker(false)}
          onStart={(sessionIds, topic) => {
            startRolePlay(sessionIds, topic);
            setShowRolePlayPicker(false);
          }}
        />
      )}

      {/* (Breakout modal + transition overlay removed in v1.15.) */}

      {/* Screen Recording permission explainer — only fires when the user
          clicks Share Screen but macOS hasn't granted screen-recording access.
          Separate from camera/mic because screen recording is its own TCC
          gate with no askForMediaAccess equivalent. */}
      {screenPermissionNeeded && (
        <ScreenPermissionModal
          onOpenSettings={openScreenSettings}
          onDismiss={() => setScreenPermissionNeeded(false)}
        />
      )}

      {/* In-app screen-share source picker — coach chooses which screen or
          window to share. Sources arrive via a 'display-media:request' IPC
          event from the main process when daily.startScreenShare() triggers
          getDisplayMedia. Routing the pick back via selectDisplayMediaSource
          fires the deferred handler so Daily gets a real MediaStream. */}
      {pickerSources && (
        <ScreenSharePickerModal
          sources={pickerSources}
          onResolve={confirmScreenShare}
        />
      )}

      {/* Confirm before stopping an active screen share — guards against an
          accidental click during a live demo. */}
      {showStopShareConfirm && (
        <StopShareConfirmModal
          onConfirm={confirmStopShare}
          onCancel={() => setShowStopShareConfirm(false)}
        />
      )}

      {/* Confirm before ending the meeting for everyone — easy to fat-finger
          and recovering from an accidental end means everyone has to rejoin. */}
      {showEndCallConfirm && (
        <EndCallConfirmModal
          onConfirm={confirmEndCall}
          onCancel={() => setShowEndCallConfirm(false)}
        />
      )}

      {/* DailyAudio is rendered at CoachingCallLayer so audio output stays
          attached across the full→mini transition. */}
    </div>
  );
}



