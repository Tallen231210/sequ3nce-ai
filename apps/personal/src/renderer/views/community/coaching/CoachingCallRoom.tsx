import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DailyParticipant } from '@daily-co/daily-js';
import {
  DailyVideo,
  useDaily,
  useParticipantIds,
  useLocalSessionId,
  useParticipant,
  useDailyEvent,
} from '@daily-co/daily-react';
import {
  endCoachingCall,
  kickFromCoachingCall,
  createPlaybookEntry,
  startBreakouts,
  type CoachingCall,
  type BreakoutGroup,
} from '../../../convex';
import { useCoachingSession } from './CoachingSessionContext';
import { playNotificationChime } from '../../notificationSound';
import type { BattleRoyaleState, BRSubmission, BRReveal } from './BattleRoyaleTypes';
import { StartBattleRoyaleModal } from './StartBattleRoyaleModal';
import { BattleRoyaleOverlay } from './BattleRoyaleOverlay';
import { BattleRoyaleCoachPanel } from './BattleRoyaleCoachPanel';
import { StartBreakoutsModal } from './StartBreakoutsModal';
import { BreakoutTransitionOverlay } from './BreakoutTransitionOverlay';
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
  const { minimize, markChatUnread, markHandsUnread, viewMode: sessionViewMode } = useCoachingSession();
  const [error, setError] = useState<string | null>(null);

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

  // Raised-hand queue. Keyed by sessionId for O(1) lookup; serialized to
  // array for the queue UI. Stays accurate across panel toggles.
  const [raisedHands, setRaisedHands] = useState<Record<string, {
    sessionId: string;
    userName: string;
    at: number;
  }>>({});

  // Active speaker (session id of whoever Daily says is currently speaking).
  // Debounced 800ms to avoid jarring swaps when people briefly talk over
  // each other. Used by speaker-view layout for focus-tile selection.
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const activeSpeakerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Spotlight — coach-driven override. When set, speaker view locks onto
  // this sessionId regardless of who's talking. Broadcast via app-message.
  const [spotlightedId, setSpotlightedId] = useState<string | null>(null);

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
  const brCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Role Play Rooms (breakouts) — coach-driven. Coach sees the full group
  // roster so they can hop between rooms. Attendees see their own assignment.
  type BreakoutState =
    | { phase: 'idle' }
    | {
        phase: 'transitioning';
        groupId: number;
        memberNames: string[];
        roomUrl: string;
        token: string;
        endsAt: number;
      }
    | {
        phase: 'in-breakout';
        groupId: number;
        roomName: string;
        endsAt: number;
      }
    | {
        // Coach-only in-breakout view: coach sees the full roster, knows
        // they can hop, and is currently in one of the rooms (or main).
        phase: 'coach-running';
        groups: BreakoutGroup[];
        endsAt: number;
        /** Room name the coach is currently in. null = main room. */
        currentRoomName: string | null;
      };
  const [breakoutState, setBreakoutState] = useState<BreakoutState>({ phase: 'idle' });
  const [showBreakoutsModal, setShowBreakoutsModal] = useState(false);
  const [showRoomsDropdown, setShowRoomsDropdown] = useState(false);
  // Original main-room credentials — captured on initial join so we can rejoin
  // after breakouts. Must NOT change when the user hops to a breakout room.
  const originalRoomRef = useRef<{ url: string; token: string } | null>(null);
  const breakoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // Flag unread badge + play a chime on the PiP mini if minimized. The
      // chime is how users find out about a new message without needing to
      // watch the mini — they can be typing in another tab.
      if (sessionViewMode === 'mini') {
        markChatUnread();
        playNotificationChime();
      }
      return;
    }

    if (payload.kind === 'hand-raise' && typeof payload.sessionId === 'string') {
      const sessionId = payload.sessionId as string;
      const userName = typeof payload.userName === 'string' ? payload.userName : 'Guest';
      const at = typeof payload.at === 'number' ? payload.at : Date.now();
      setRaisedHands((prev) => ({ ...prev, [sessionId]: { sessionId, userName, at } }));
      // Flag unread hand-queue badge + chime on the PiP mini if minimized.
      // Coach needs to know immediately when someone raises a hand.
      if (sessionViewMode === 'mini') {
        markHandsUnread();
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

    if (payload.kind === 'spotlight' && typeof payload.sessionId === 'string') {
      setSpotlightedId(payload.sessionId as string);
      return;
    }

    if (payload.kind === 'spotlight-clear') {
      setSpotlightedId(null);
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

    // ---- Role Play Rooms (breakouts) ----

    // Targeted to a single attendee. Contains their personal roomUrl + token
    // and the names of their groupmates.
    if (
      payload.kind === 'breakout-assign' &&
      typeof payload.groupId === 'number' &&
      typeof payload.roomUrl === 'string' &&
      typeof payload.token === 'string' &&
      typeof payload.endsAt === 'number' &&
      Array.isArray(payload.memberNames)
    ) {
      const memberNames = (payload.memberNames as unknown[])
        .filter((n): n is string => typeof n === 'string');
      setBreakoutState({
        phase: 'transitioning',
        groupId: payload.groupId as number,
        memberNames,
        roomUrl: payload.roomUrl as string,
        token: payload.token as string,
        endsAt: payload.endsAt as number,
      });
      return;
    }

    // Shared start signal — all clients now know the shared endsAt.
    // Attendees already transitioned via breakout-assign; this is informational.
    // (We don't use it to mutate state here; kept as a placeholder for future
    //  features like synchronized countdown without targeted assigns.)
    if (payload.kind === 'breakout-start') {
      return;
    }

    // Coach ended breakouts — every client (including coach) returns to main.
    if (payload.kind === 'breakout-end') {
      const originalRoom = originalRoomRef.current;
      if (originalRoom && daily) {
        void (async () => {
          try {
            await daily.leave();
            await daily.join({ url: originalRoom.url, token: originalRoom.token });
          } catch (err) {
            console.error('[CoachingCallRoom] breakout-end rejoin failed:', err);
          }
        })();
      }
      setBreakoutState({ phase: 'idle' });
      return;
    }
  });

  // Active-speaker-change — Daily fires this when the dominant speaker flips.
  // Debounce UI swaps so we don't hop tiles during brief cross-talk.
  useDailyEvent('active-speaker-change', (ev) => {
    const next = (ev as { activeSpeaker?: { peerId?: string } })?.activeSpeaker?.peerId;
    if (!next) return;
    if (activeSpeakerTimerRef.current) clearTimeout(activeSpeakerTimerRef.current);
    activeSpeakerTimerRef.current = setTimeout(() => setActiveSpeakerId(next), 800);
  });

  // Participant-left — sweep any stale hand-raised entries so the queue
  // doesn't point at people who already left the room.
  useDailyEvent('participant-left', (ev) => {
    const sessionId = (ev as { participant?: { session_id?: string } })?.participant?.session_id;
    if (!sessionId) return;
    setRaisedHands((prev) => {
      if (!prev[sessionId]) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
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

  // Coach-only spotlight controls.
  function spotlight(sessionId: string) {
    if (!daily || !isCoach) return;
    try {
      daily.sendAppMessage({ kind: 'spotlight', sessionId }, '*');
      setSpotlightedId(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to spotlight');
    }
  }
  function clearSpotlight() {
    if (!daily || !isCoach) return;
    try {
      daily.sendAppMessage({ kind: 'spotlight-clear' }, '*');
      setSpotlightedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear spotlight');
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

    // Auto-save to Playbook. Fail-safe: if the mutation errors, surface a
    // toast + copy text to clipboard so the coach can add it manually.
    try {
      const res = await createPlaybookEntry({
        coachUserId: currentUserId,
        rebuttalText: winnerWithAuthor.text,
        objectionText: state.objection,
        authorName: winnerWithAuthor.from || 'Anonymous',
        sourceCallId: call._id,
      });
      if ('error' in res) throw new Error(res.error);
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

  // ---- Role Play Rooms (breakouts) handlers ----

  // Coach-only: open the config modal + gather the live attendee roster.
  async function startBreakoutsFlow(args: { groupSize: number; durationMin: number }) {
    if (!daily || !isCoach) return;
    setShowBreakoutsModal(false);

    // Collect the currently-connected, non-local (non-coach), non-kicked roster.
    const participants = daily.participants();
    const local = participants.local;
    const attendees = Object.values(participants)
      .filter((p) => p && p.session_id !== local?.session_id)
      .map((p) => ({
        sessionId: p.session_id,
        userName: p.user_name || 'Guest',
      }));

    if (attendees.length < 2) {
      setError('Need at least 2 connected attendees to start breakouts');
      return;
    }

    const res = await startBreakouts({
      callId: call._id,
      coachUserId: currentUserId,
      groupSize: args.groupSize,
      durationMin: args.durationMin,
      attendees,
    });
    if ('error' in res) {
      setError(res.error);
      return;
    }

    // Broadcast per-attendee assignments (targeted).
    for (const group of res.groups) {
      const memberNames = group.members.map((m) => m.userName);
      for (const member of group.members) {
        try {
          daily.sendAppMessage(
            {
              kind: 'breakout-assign',
              groupId: group.groupId,
              roomUrl: group.roomUrl,
              token: member.token,
              endsAt: res.endsAt,
              memberNames: memberNames.filter((n) => n !== member.userName),
            },
            member.sessionId,
          );
        } catch (err) {
          console.error('[CoachingCallRoom] breakout-assign send failed:', err);
        }
      }
    }
    // Also broadcast a shared start message for informational use.
    try {
      daily.sendAppMessage({ kind: 'breakout-start', endsAt: res.endsAt }, '*');
    } catch { /* non-fatal */ }

    // Coach stays in main room and tracks the full roster.
    setBreakoutState({
      phase: 'coach-running',
      groups: res.groups,
      endsAt: res.endsAt,
      currentRoomName: null,
    });

    // Safety auto-end when the timer elapses — coach's client also broadcasts
    // breakout-end so attendees rejoin (their own timers will also fire as a
    // backup if this broadcast is lost).
    if (breakoutTimerRef.current) clearTimeout(breakoutTimerRef.current);
    breakoutTimerRef.current = setTimeout(() => {
      void endBreakoutsFlow();
    }, Math.max(0, res.endsAt - Date.now()));
  }

  // Coach-only: hop into a specific breakout room (or back to main).
  async function coachHopTo(group: BreakoutGroup | null) {
    if (!daily || !isCoach) return;
    if (breakoutState.phase !== 'coach-running') return;
    const target = group
      ? { url: group.roomUrl, token: group.coachToken }
      : originalRoomRef.current;
    if (!target) return;
    setShowRoomsDropdown(false);
    try {
      await daily.leave();
      await daily.join({ url: target.url, token: target.token });
      setBreakoutState({
        ...breakoutState,
        currentRoomName: group ? group.roomName : null,
      });
    } catch (err) {
      console.error('[CoachingCallRoom] coachHopTo failed:', err);
      setError('Failed to switch rooms');
    }
  }

  // Coach-only: broadcast end + rejoin main room.
  async function endBreakoutsFlow() {
    if (!daily || !isCoach) return;
    try {
      daily.sendAppMessage({ kind: 'breakout-end' }, '*');
    } catch { /* non-fatal */ }
    if (breakoutTimerRef.current) { clearTimeout(breakoutTimerRef.current); breakoutTimerRef.current = null; }
    // Coach rejoins main (if they were in a breakout).
    if (breakoutState.phase === 'coach-running' && breakoutState.currentRoomName !== null) {
      const main = originalRoomRef.current;
      if (main) {
        try {
          await daily.leave();
          await daily.join({ url: main.url, token: main.token });
        } catch (err) {
          console.error('[CoachingCallRoom] coach rejoin-main failed:', err);
        }
      }
    }
    setBreakoutState({ phase: 'idle' });
  }

  // Attendee: on 'transitioning', wait 3 seconds, then switch Daily rooms.
  // On 'in-breakout', arm an auto-rejoin timer so we always come back even if
  // the coach's breakout-end broadcast is lost.
  useEffect(() => {
    if (breakoutState.phase !== 'transitioning') return;
    const transition = breakoutState;
    const delay = 3000;
    const timer = setTimeout(async () => {
      if (!daily) return;
      try {
        await daily.leave();
        await daily.join({ url: transition.roomUrl, token: transition.token });
        setBreakoutState({
          phase: 'in-breakout',
          groupId: transition.groupId,
          roomName: transition.roomUrl,
          endsAt: transition.endsAt,
        });
      } catch (err) {
        console.error('[CoachingCallRoom] breakout switchRoom failed:', err);
        setError('Failed to join breakout room');
        setBreakoutState({ phase: 'idle' });
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [breakoutState, daily]);

  // Auto-rejoin safety timer for attendees in breakouts.
  useEffect(() => {
    if (breakoutState.phase !== 'in-breakout') return;
    const remaining = breakoutState.endsAt - Date.now();
    if (remaining <= 0) {
      const main = originalRoomRef.current;
      if (main && daily) {
        void (async () => {
          try {
            await daily.leave();
            await daily.join({ url: main.url, token: main.token });
          } catch (err) {
            console.error('[CoachingCallRoom] auto-rejoin-main failed:', err);
          }
        })();
      }
      setBreakoutState({ phase: 'idle' });
      return;
    }
    const timer = setTimeout(() => {
      const main = originalRoomRef.current;
      if (main && daily) {
        void (async () => {
          try {
            await daily.leave();
            await daily.join({ url: main.url, token: main.token });
          } catch (err) {
            console.error('[CoachingCallRoom] auto-rejoin-main failed:', err);
          }
        })();
      }
      setBreakoutState({ phase: 'idle' });
    }, remaining);
    return () => clearTimeout(timer);
  }, [breakoutState, daily]);

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
    // Stash the main-room credentials so breakouts can rejoin here on end.
    originalRoomRef.current = { url: roomUrl, token };
    try {
      await daily.join({ url: roomUrl, token });
      if (selfPhotoUrl) {
        try {
          daily.setUserData({ photoUrl: selfPhotoUrl });
        } catch {
          // non-fatal; avatars just fall back to the initial-letter state
        }
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
  async function toggleScreenShare() {
    if (!daily || !isCoach) return;
    if (screenSharing) {
      daily.stopScreenShare();
      setScreenSharing(false);
    } else {
      await daily.startScreenShare();
      setScreenSharing(true);
    }
  }

  async function handleLeave() {
    await daily?.leave();
    onLeave();
  }

  async function handleEndCall() {
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
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col font-sans">
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
          {isCoach && spotlightedId && (
            <button
              onClick={clearSpotlight}
              className="ml-1 px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase tracking-wider bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors"
              title="Clear spotlight"
            >
              Clear spotlight
            </button>
          )}
          {isCoach && brState.phase === 'idle' && breakoutState.phase === 'idle' && (
            <button
              onClick={() => setShowBrModal(true)}
              className="ml-1 px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase tracking-wider bg-amber-400/20 text-amber-200 hover:bg-amber-400/30 transition-colors border border-amber-400/30"
              title="Start Objection Battle Royale"
            >
              ⚔ Battle Royale
            </button>
          )}
          {isCoach && brState.phase === 'idle' && breakoutState.phase === 'idle' && (
            <button
              onClick={() => setShowBreakoutsModal(true)}
              className="ml-1 px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase tracking-wider bg-sky-400/20 text-sky-200 hover:bg-sky-400/30 transition-colors border border-sky-400/30"
              title="Start Role Play Rooms"
            >
              ⊞ Role Play
            </button>
          )}
          {isCoach && breakoutState.phase === 'coach-running' && (
            <BreakoutCoachControls
              groups={breakoutState.groups}
              currentRoomName={breakoutState.currentRoomName}
              endsAt={breakoutState.endsAt}
              open={showRoomsDropdown}
              onToggleOpen={() => setShowRoomsDropdown((v) => !v)}
              onHopTo={(g) => void coachHopTo(g)}
              onEnd={() => void endBreakoutsFlow()}
            />
          )}
          {breakoutState.phase === 'in-breakout' && (
            <BreakoutCountdownBadge
              groupId={breakoutState.groupId}
              endsAt={breakoutState.endsAt}
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
            onClick={() => { setShowChat((v) => !v); if (!showChat) setShowHandQueue(false); }}
            aria-label={showChat ? 'Hide chat' : 'Show chat'}
            className={`ml-1 p-2 rounded-lg transition-colors ${
              showChat
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon name="chat" className="w-4 h-4" />
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
              spotlightedId={spotlightedId}
              activeSpeakerId={activeSpeakerId}
              raisedHands={raisedHands}
              liveReactions={liveReactions}
              onSpotlight={spotlight}
              onKickError={setError}
            />
          ) : (
            <ConnectingState />
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

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-white/10">
        <CtrlButton active={!micOn} onClick={toggleMic} iconName={micOn ? 'mic' : 'mic-off'} label={micOn ? 'Mute' : 'Unmute'} />
        <CtrlButton active={!camOn} onClick={toggleCam} iconName={camOn ? 'camera' : 'camera-off'} label={camOn ? 'Camera off' : 'Camera on'} />
        {isCoach && (
          <CtrlButton active={screenSharing} onClick={toggleScreenShare} iconName="screen" label={screenSharing ? 'Stop sharing' : 'Share screen'} />
        )}
        {!isCoach && (
          <CtrlButton
            active={myHandRaised}
            onClick={toggleRaiseHand}
            iconName="hand"
            label={myHandRaised ? 'Lower hand' : 'Raise hand'}
          />
        )}
        <ReactionButton onReact={sendReaction} />
        <div className="w-3" />
        <button
          onClick={handleLeave}
          className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors"
        >
          <Icon name="leave" className="w-4 h-4" />
          Leave
        </button>
        {isCoach && (
          <button
            onClick={handleEndCall}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
          >
            <Icon name="end-call" className="w-4 h-4" />
            End for everyone
          </button>
        )}
      </div>

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

      {/* Coach-only breakouts config modal */}
      {showBreakoutsModal && isCoach && (
        <StartBreakoutsModal
          attendeeCount={
            daily
              ? Object.values(daily.participants()).filter(
                  (p) => p && p.session_id !== daily.participants().local?.session_id,
                ).length
              : 0
          }
          onClose={() => setShowBreakoutsModal(false)}
          onStart={startBreakoutsFlow}
        />
      )}

      {/* Attendee transition overlay (pre-switch to breakout room) */}
      {breakoutState.phase === 'transitioning' && (
        <BreakoutTransitionOverlay
          groupId={breakoutState.groupId}
          memberNames={breakoutState.memberNames}
          countdownSec={3}
        />
      )}

      {/* DailyAudio is rendered at CoachingCallLayer so audio output stays
          attached across the full→mini transition. */}
    </div>
  );
}

// ==================== Icon system ====================
// Stroke-only SVG icons — Heroicons-style. Pure white, no emoji, no color.

type IconName =
  | 'mic'
  | 'mic-off'
  | 'camera'
  | 'camera-off'
  | 'screen'
  | 'leave'
  | 'end-call'
  | 'chat'
  | 'send'
  | 'kick'
  | 'hand'
  | 'smile'
  | 'grid'
  | 'speaker'
  | 'spotlight'
  | 'minimize'
  | 'maximize';

function Icon({ name, className = 'w-4 h-4' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    'mic': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    ),
    'mic-off': (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M9 9v3.75a3 3 0 0 0 5.12 2.12M15 9.75V4.5a3 3 0 0 0-5.772-1.168M12 18.75a6 6 0 0 0 5.657-4M6 12.75a6 6 0 0 0 1.5 3.97M12 18.75v3.75m-3.75 0h7.5" />
      </>
    ),
    'camera': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.823-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.823 1.316ZM16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
    ),
    'camera-off': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15c.337 0 .654-.074.939-.207M21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.823-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-3.232-.065M9.428 4.196A48.45 48.45 0 0 1 12 4.126c.88 0 1.755.022 2.625.066M16.5 12.75a4.5 4.5 0 1 1-7.8-3.075" />
    ),
    'screen': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
    ),
    'leave': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    ),
    'end-call': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5.25l3 3m0 0 12 12m-12-12c3-3 12-3 15 0m-3 3 3 3M18 18a3 3 0 0 0 3-3l-1.5-1.5-3 1-1.5-3L12 10.5l-3 1-1.5-3L4.5 7.5 3 6a3 3 0 0 0 0 3" />
    ),
    'chat': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
    ),
    'send': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0 1 21.485 12 59.77 59.77 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5" />
    ),
    'kick': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    ),
    'hand': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 0 1 3.15 0V15M6.9 7.575a1.575 1.575 0 1 0-3.15 0v8.175a6.75 6.75 0 0 0 6.75 6.75h2.018a5.25 5.25 0 0 0 3.712-1.538l1.732-1.732a5.25 5.25 0 0 0 1.538-3.712l.003-2.024a.668.668 0 0 1 .198-.471 1.575 1.575 0 1 0-2.228-2.228 3.818 3.818 0 0 0-1.12 2.687M6.9 7.575V12m9.075 5.625v-8.25" />
    ),
    'smile': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
    ),
    'grid': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
    ),
    'speaker': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h12A2.25 2.25 0 0 1 20.25 6v9A2.25 2.25 0 0 1 18 17.25h-4.5m-9 0h4.5M7.5 20.25l2.25-3m0 0h4.5m-4.5 0 2.25 3" />
    ),
    'spotlight': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
    ),
    'minimize': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
    ),
    'maximize': (
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    ),
  };
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      {paths[name]}
    </svg>
  );
}

// ==================== Connecting / Empty-state helpers ====================

function ConnectingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5">
      <img
        src={logoImage}
        alt="Sequ3nce"
        className="h-18 w-auto opacity-70 animate-pulse [filter:invert(1)_contrast(1.1)_brightness(1.1)]"
      />
      <span className="text-[12px] font-mono uppercase tracking-[0.15em] text-white/50">
        Connecting
      </span>
    </div>
  );
}

// ==================== Sub-components ====================

// Mic / cam / screen-share control. `active` = "needs user attention" state
// (mic muted, camera off, screen-sharing on). Active uses red accent so
// the eye catches what's in a non-default state.
function CtrlButton({
  active,
  onClick,
  iconName,
  label,
}: {
  active: boolean;
  onClick: () => void;
  iconName: IconName;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex items-center gap-2 px-3.5 py-2 text-[12.5px] font-medium rounded-lg transition-colors ${
        active
          ? 'bg-red-600/90 text-white hover:bg-red-600'
          : 'bg-white/5 text-white/90 hover:bg-white/10'
      }`}
      title={label}
    >
      <Icon name={iconName} className="w-4 h-4" />
      {label}
    </button>
  );
}

function LiveDurationPill({ startMs }: { startMs: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const mm = String(Math.floor(diffSec / 60)).padStart(2, '0');
  const ss = String(diffSec % 60).padStart(2, '0');
  const hours = Math.floor(diffSec / 3600);
  const hh = String(hours).padStart(2, '0');
  const label = hours > 0 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
  return (
    <span className="text-[12px] font-mono text-white/70 tabular-nums">
      {label}
    </span>
  );
}

function ParticipantCountPill() {
  const ids = useParticipantIds();
  return (
    <span className="text-[11px] font-mono uppercase tracking-wider text-white/50">
      {ids.length} {ids.length === 1 ? 'person' : 'people'}
    </span>
  );
}

interface VideoGridProps {
  coachUserId: string;
  isCoachView: boolean;
  callId: string;
  currentUserId: string;
  viewMode: 'speaker' | 'gallery';
  spotlightedId: string | null;
  activeSpeakerId: string | null;
  raisedHands: Record<string, { sessionId: string; userName: string; at: number }>;
  liveReactions: Array<{ id: string; sessionId: string; emoji: string }>;
  onSpotlight: (sessionId: string) => void;
  onKickError: (msg: string) => void;
}

function VideoGrid(props: VideoGridProps) {
  const ids = useParticipantIds({ sort: 'joined_at' });

  // Solo state — a single tile centered with a waiting hint. Same in both
  // view modes; no point having a "speaker view" with one participant.
  if (ids.length <= 1) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-6">
        <div className="w-[min(560px,100%)] aspect-video">
          {ids.map((id) => (
            <ParticipantTileWrapped key={id} sessionId={id} {...props} />
          ))}
        </div>
        <div className="text-center">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/40">
            Waiting for others to join
          </div>
        </div>
      </div>
    );
  }

  // Speaker view — one big focus tile on top, remaining tiles in a strip below.
  // Layout rules that keep faces from being clipped at any window size:
  //   - Focus slot: max-w-full max-h-full aspect-video centered within its
  //     wrapper. The slot fits whichever dimension is most constraining
  //     (height-limited on landscape, width-limited on portrait) while
  //     preserving 16:9.
  //   - Strip: explicit h-[22%] with overflow-hidden. Each strip slot is
  //     h-full aspect-video so tiles compute width from the strip's fixed
  //     height — never overflowing vertically.
  if (props.viewMode === 'speaker') {
    const sessionIdsSet = new Set(ids);
    const coachSessionId = ids[0] && ids.find((id) => id === ids[0]);
    const focusId =
      (props.spotlightedId && sessionIdsSet.has(props.spotlightedId) && props.spotlightedId) ||
      (props.activeSpeakerId && sessionIdsSet.has(props.activeSpeakerId) && props.activeSpeakerId) ||
      coachSessionId ||
      ids[0];

    const otherIds = ids.filter((id) => id !== focusId);
    return (
      <div className="h-full w-full flex flex-col gap-3 overflow-hidden">
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="max-w-full max-h-full aspect-video">
            <ParticipantTileWrapped sessionId={focusId} isFocus {...props} />
          </div>
        </div>
        {otherIds.length > 0 && (
          // `justify-content: safe center` — centers the strip when it fits,
          // falls back to start-aligned when content overflows so users can
          // scroll back to the leftmost tile. Without `safe`, the scroll
          // origin clamps at 0 and left-of-center tiles become unreachable.
          <div
            className="shrink-0 h-[22%] flex items-center gap-3 overflow-x-auto overflow-y-hidden"
            style={{ justifyContent: 'safe center' }}
          >
            {otherIds.map((id) => (
              <div key={id} className="h-full aspect-video shrink-0">
                <ParticipantTileWrapped sessionId={id} {...props} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Gallery view — uniform grid. Each grid cell is 16:9 (aspect-video on the
  // cell), and tiles fill cells. Grid scrolls vertically if needed so tiles
  // are never clipped.
  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {ids.map((id) => (
          <div key={id} className="aspect-video">
            <ParticipantTileWrapped sessionId={id} {...props} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Thin wrapper to pass the new props through to ParticipantTile without
// threading a dozen positional arguments at every call site.
function ParticipantTileWrapped({
  sessionId,
  isFocus,
  callId,
  isCoachView,
  currentUserId,
  coachUserId,
  spotlightedId,
  raisedHands,
  liveReactions,
  onSpotlight,
  onKickError,
}: VideoGridProps & { sessionId: string; isFocus?: boolean }) {
  return (
    <ParticipantTile
      sessionId={sessionId}
      isFocus={isFocus}
      callId={callId}
      isCoachView={isCoachView}
      currentUserId={currentUserId}
      coachUserId={coachUserId}
      isSpotlighted={spotlightedId === sessionId}
      handRaised={!!raisedHands[sessionId]}
      reactions={liveReactions.filter((r) => r.sessionId === sessionId)}
      onSpotlight={onSpotlight}
      onKickError={onKickError}
    />
  );
}

function ParticipantTile({
  sessionId,
  callId,
  isCoachView,
  currentUserId,
  coachUserId,
  isFocus,
  isSpotlighted,
  handRaised,
  reactions,
  onSpotlight,
  onKickError,
}: {
  sessionId: string;
  callId: string;
  isCoachView: boolean;
  currentUserId: string;
  coachUserId: string;
  /** True when this tile is the large focus tile in Speaker view. Shown
   *  with a slightly different chrome (bigger avatar fallback, prominent
   *  border if spotlighted). */
  isFocus?: boolean;
  isSpotlighted: boolean;
  handRaised: boolean;
  reactions: Array<{ id: string; sessionId: string; emoji: string }>;
  onSpotlight: (sessionId: string) => void;
  onKickError: (msg: string) => void;
}) {
  const daily = useDaily();
  const participant = useParticipant(sessionId);
  const localId = useLocalSessionId();
  const isLocal = sessionId === localId;
  const name = participant?.user_name || 'Guest';
  // Whether the host has currently muted this attendee. We read the actual
  // audio track state from Daily — if the participant is muted (for whatever
  // reason), the icon reflects that.
  const isMuted = !participant?.audio;

  // Host can force-mute any attendee (useful for background noise). Attendees
  // can self-unmute afterwards — Daily's updateParticipant({setAudio:false})
  // is a nudge, not a permanent mute. That's the desired semantic per Tyler.
  async function handleToggleMute() {
    if (!daily || !isCoachView || isLocal) return;
    try {
      await daily.updateParticipant(sessionId, { setAudio: isMuted });
    } catch (err) {
      onKickError(err instanceof Error ? err.message : 'Failed to mute participant');
    }
  }

  // Daily ships each participant's token user_data as a JSON string. We use
  // it to transport the Sequ3nce profile photo URL so we can render the real
  // avatar on tiles when the camera is off. Parse defensively — a malformed
  // value shouldn't break rendering.
  const photoUrl: string | null = (() => {
    const raw = participant?.userData;
    if (!raw) return null;
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object' && 'photoUrl' in parsed) {
        const url = (parsed as { photoUrl: unknown }).photoUrl;
        return typeof url === 'string' ? url : null;
      }
      return null;
    } catch {
      return null;
    }
  })();

  // We can't reliably map Daily session -> our b2cUser id without a handshake.
  // For kick, we'd need the server to match by user_name or have clients send
  // their userId via app-message. v1 simplification: kick by Daily session id
  // alone; the backend uses Daily's eject API, and we best-effort record the
  // attendance row via user_name lookup (deferred — for now, we skip the DB
  // attendance patch client-side and let the cron / manual reconciliation
  // handle edge cases).

  async function handleKick() {
    const res = await kickFromCoachingCall(callId, currentUserId, sessionId);
    if (res.error) {
      onKickError(res.error);
    }
  }

  // Spotlighted tiles get a subtle amber border so everyone knows they're
  // the one being featured. Focus tiles in speaker view get a thin brand
  // accent to separate them from the strip below.
  const borderClass = isSpotlighted
    ? 'border-amber-400/80 ring-1 ring-amber-400/40'
    : isFocus
    ? 'border-white/25'
    : 'border-white/10';

  const avatarSize = isFocus ? 'w-28 h-28' : 'w-20 h-20';
  const initialsSize = isFocus ? 'w-20 h-20 text-3xl' : 'w-14 h-14 text-xl';

  return (
    <div className={`relative w-full h-full bg-zinc-950 rounded-xl overflow-hidden border ${borderClass} group transition-colors`}>
      {participant?.video ? (
        <DailyVideo
          sessionId={sessionId}
          type="video"
          automirror={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={name}
              className={`${avatarSize} rounded-full object-cover border border-white/20`}
            />
          ) : (
            <div className={`${initialsSize} rounded-full bg-white/10 flex items-center justify-center text-white/80 font-semibold`}>
              {name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}

      {/* Raised-hand badge — top-left so it doesn't collide with host actions */}
      {handRaised && (
        <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-amber-400 text-black text-[10px] font-bold flex items-center gap-1 shadow-lg">
          <Icon name="hand" className="w-3 h-3" />
          Hand up
        </div>
      )}

      {/* Spotlight label — top-center when locked so the person knows */}
      {isSpotlighted && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-amber-400/90 text-black text-[10px] font-bold uppercase tracking-wider">
          Spotlight
        </div>
      )}

      {/* Floating reactions — stack up from the bottom of the tile */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none overflow-hidden" style={{ height: '70%' }}>
        {reactions.map((r, i) => (
          <FloatingReaction key={r.id} emoji={r.emoji} offsetIndex={i} />
        ))}
      </div>

      {/* Gradient overlay with name — replaces the heavy black bubble */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pt-6 pb-2 px-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <span className="text-[12px] font-medium text-white truncate">
            {name}
          </span>
          {isLocal && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
              you
            </span>
          )}
        </div>
        {!participant?.audio && (
          <span className="shrink-0 text-white/80">
            <Icon name="mic-off" className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      {/* Coach-only per-tile controls: spotlight / mute / kick. */}
      {isCoachView && !isLocal && (
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onSpotlight(sessionId)}
            className={`p-1.5 rounded-md text-white hover:bg-black/90 ${
              isSpotlighted ? 'bg-amber-500/90' : 'bg-black/70'
            }`}
            title={isSpotlighted ? 'Spotlighted' : 'Spotlight participant'}
            aria-label="Spotlight participant"
          >
            <Icon name="spotlight" className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleToggleMute}
            className="p-1.5 rounded-md bg-black/70 text-white hover:bg-black/90"
            title={isMuted ? 'Request unmute' : 'Mute participant'}
            aria-label={isMuted ? 'Request unmute' : 'Mute participant'}
          >
            <Icon name={isMuted ? 'mic-off' : 'mic'} className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleKick}
            className="p-1.5 rounded-md bg-red-600/90 text-white hover:bg-red-500"
            title="Remove from call"
            aria-label="Remove from call"
          >
            <Icon name="kick" className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// Small animated emoji that floats up over the participant's tile.
// Purely decorative; removed from state by its parent after 2.5s.
function FloatingReaction({ emoji, offsetIndex }: { emoji: string; offsetIndex: number }) {
  return (
    <span
      className="absolute text-4xl"
      style={{
        left: `${50 + (offsetIndex % 5 - 2) * 12}%`,
        bottom: 0,
        transform: 'translateX(-50%)',
        animation: 'sq-reaction-rise 2.4s ease-out forwards',
      }}
    >
      {emoji}
    </span>
  );
}

// ==================== Chat panel ====================

interface ChatMessage {
  id: string;
  from: string;
  body: string;
  at: number;
}

// Pure view: messages are owned by the parent so closing/reopening the panel
// doesn't lose history, and the app-message listener likewise lives in the
// parent (stays mounted while the overlay is open).
function ChatPanel({
  messages,
  onSend,
}: {
  messages: ChatMessage[];
  onSend: (body: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function send() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setDraft('');
  }

  return (
    <div className="w-[320px] shrink-0 border-l border-white/10 flex flex-col">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">
          Chat
        </span>
        <img
          src={logoImage}
          alt="Sequ3nce"
          className="h-6 w-auto opacity-60 [filter:invert(1)_contrast(1.1)_brightness(1.1)]"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-[11px] text-white/40 text-center pt-6 font-mono">
            No messages yet
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id}>
              <div className="text-[10px] font-mono uppercase tracking-wider text-white/40 mb-0.5">
                {m.from}
              </div>
              <div className="text-[13px] text-white/90 leading-snug whitespace-pre-wrap break-words">
                {m.body}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <div className="px-3 py-3 border-t border-white/10">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Type a message…"
            className="flex-1 px-3 py-2 text-[12.5px] bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-white/30"
          />
          <button
            onClick={send}
            disabled={!draft.trim()}
            aria-label="Send message"
            title="Send message"
            className="p-2 bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Icon name="send" className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== View mode toggle ====================

function ViewModeToggle({
  value,
  onChange,
}: {
  value: 'speaker' | 'gallery';
  onChange: (v: 'speaker' | 'gallery') => void;
}) {
  return (
    <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10">
      <button
        onClick={() => onChange('speaker')}
        aria-label="Speaker view"
        title="Speaker view"
        className={`p-1.5 rounded-md transition-colors ${
          value === 'speaker' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
        }`}
      >
        <Icon name="speaker" className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onChange('gallery')}
        aria-label="Gallery view"
        title="Gallery view"
        className={`p-1.5 rounded-md transition-colors ${
          value === 'gallery' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
        }`}
      >
        <Icon name="grid" className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ==================== Reaction button + popover ====================

const REACTION_EMOJI = ['👏', '❤️', '🔥', '😂', '🎉', '✨'] as const;

function ReactionButton({ onReact }: { onReact: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={btnRef} className="relative">
      <CtrlButton
        active={open}
        onClick={() => setOpen((v) => !v)}
        iconName="smile"
        label="React"
      />
      {open && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1.5 bg-zinc-900/95 border border-white/10 rounded-lg shadow-xl backdrop-blur">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onReact(emoji);
                setOpen(false);
              }}
              className="text-xl px-1.5 py-1 rounded-md hover:bg-white/10 transition-colors"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== Hand queue panel (coach-only) ====================

function HandQueuePanel({
  raisedHands,
  onCallOn,
  onDismiss,
}: {
  raisedHands: Record<string, { sessionId: string; userName: string; at: number }>;
  onCallOn: (sessionId: string) => void;
  onDismiss: (sessionId: string) => void;
}) {
  // Sort by raise time — earliest first (FIFO queue).
  const entries = Object.values(raisedHands).sort((a, b) => a.at - b.at);

  return (
    <div className="w-[320px] shrink-0 border-l border-white/10 flex flex-col">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">
          Raised hands
        </span>
        <span className="text-[10px] font-mono text-white/40">
          {entries.length} waiting
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {entries.length === 0 ? (
          <div className="text-[11px] text-white/40 text-center pt-6 font-mono">
            No hands up
          </div>
        ) : (
          entries.map((h) => (
            <div
              key={h.sessionId}
              className="p-3 rounded-lg border border-white/10 bg-white/[0.02]"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon name="hand" className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[13px] font-medium text-white truncate">{h.userName}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onCallOn(h.sessionId)}
                  className="flex-1 px-2 py-1 text-[11px] font-semibold bg-white text-black rounded-md hover:bg-white/90 transition-colors"
                >
                  Call on
                </button>
                <button
                  onClick={() => onDismiss(h.sessionId)}
                  className="px-2 py-1 text-[11px] font-medium bg-white/5 text-white/70 rounded-md hover:bg-white/10 transition-colors"
                  title="Remove from queue (does not signal the attendee)"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ==================== Call-on modal (target user's view) ====================

function CallOnModal({
  from,
  onAccept,
  onDecline,
}: {
  from: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[min(420px,90vw)] rounded-xl bg-zinc-900 border border-white/10 shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-400/20 flex items-center justify-center">
            <Icon name="hand" className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-white/50">
              {from} asked you to speak
            </div>
            <div className="text-[16px] font-semibold text-white">Unmute your mic?</div>
          </div>
        </div>
        <p className="text-[13px] text-white/60 leading-snug mb-5">
          Your mic will turn on and the whole room will hear you. You can mute again anytime.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onDecline}
            className="px-4 py-2 text-[13px] font-medium bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={onAccept}
            className="px-4 py-2 text-[13px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
          >
            Unmute
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== Pre-call mirror ====================

interface PreCallMirrorProps {
  call: CoachingCall;
  micOn: boolean;
  camOn: boolean;
  onToggleMic: () => Promise<void> | void;
  onToggleCam: () => Promise<void> | void;
  onJoin: () => Promise<void> | void;
  onCancel: () => void;
}

function PreCallMirror({ call, micOn, camOn, onToggleMic, onToggleCam, onJoin, onCancel }: PreCallMirrorProps) {
  const localId = useLocalSessionId();
  const local = useParticipant(localId ?? '');
  const [joining, setJoining] = useState(false);

  async function handleJoin() {
    if (joining) return;
    setJoining(true);
    try {
      await onJoin();
    } finally {
      // If onJoin bounces back to preview (join error), clear so the button works again.
      setJoining(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a] flex flex-col items-center justify-center font-sans p-8">
      <div className="w-full max-w-[640px] flex flex-col gap-4">
        {/* Context: what call they're about to join */}
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50 mb-1">
            About to join
          </div>
          <div className="text-[20px] font-bold text-white">{call.title}</div>
          <div className="text-[13px] text-white/50 mt-0.5">Hosted by Coach {call.coachName}</div>
        </div>

        {/* Camera preview */}
        <div className="relative aspect-video bg-zinc-950 rounded-xl overflow-hidden border border-white/10">
          {localId && local?.video ? (
            <DailyVideo
              sessionId={localId}
              type="video"
              automirror
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
              <div className="flex flex-col items-center gap-2">
                <Icon name="camera-off" className="w-10 h-10 text-white/30" />
                <span className="text-[11px] font-mono uppercase tracking-wider text-white/40">
                  Camera off
                </span>
              </div>
            </div>
          )}

          {/* Mic meter — derived from Daily's local participant audio tracks */}
          <div className="absolute bottom-3 left-3">
            <MicMeter active={micOn} />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2">
          <CtrlButton
            active={!micOn}
            onClick={onToggleMic}
            iconName={micOn ? 'mic' : 'mic-off'}
            label={micOn ? 'Mute' : 'Unmute'}
          />
          <CtrlButton
            active={!camOn}
            onClick={onToggleCam}
            iconName={camOn ? 'camera' : 'camera-off'}
            label={camOn ? 'Camera off' : 'Camera on'}
          />
        </div>

        {/* Primary CTA */}
        <div className="flex items-center justify-center gap-3 mt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-medium bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleJoin}
            disabled={joining}
            className="px-6 py-2.5 text-[14px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-50 disabled:cursor-wait transition-colors"
          >
            {joining ? 'Joining…' : 'Join now'}
          </button>
        </div>
      </div>

      {/* DailyAudio rendered at CoachingCallLayer covers preview + joined. */}
    </div>
  );
}

// Compact visual mic meter. Polls Daily's local audio level at 100ms.
// Renders a vertical stack of bars that light up with volume.
function MicMeter({ active }: { active: boolean }) {
  const daily = useDaily();
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!daily || !active) {
      setLevel(0);
      return;
    }
    const interval = setInterval(() => {
      try {
        // Daily exposes audio level on the local participant's audio track.
        // `getInputSettings` / track-level APIs vary by SDK version; we use
        // the simple `localAudio.getLevel`-style approach when available,
        // falling back to zero. This is purely decorative.
        const local = daily.participants().local;
        // @ts-expect-error — `audioLevel` is a reasonable best-effort; SDK types don't universally expose it
        const lvl = typeof local?.audioLevel === 'number' ? local.audioLevel : 0;
        setLevel(Math.min(1, Math.max(0, lvl)));
      } catch {
        // ignore — meter just stays flat
      }
    }, 100);
    return () => clearInterval(interval);
  }, [daily, active]);

  if (!active) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 border border-white/10">
        <Icon name="mic-off" className="w-3 h-3 text-white/60" />
        <span className="text-[10px] font-mono text-white/50">Muted</span>
      </div>
    );
  }

  const bars = 5;
  const lit = Math.round(level * bars);
  return (
    <div className="flex items-end gap-[2px] px-2 py-1 rounded-md bg-black/60 border border-white/10">
      <Icon name="mic" className="w-3 h-3 text-white/80 mr-1" />
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`w-[3px] transition-colors ${i < lit ? 'bg-emerald-400' : 'bg-white/15'}`}
          style={{ height: 3 + i * 2 }}
        />
      ))}
    </div>
  );
}

// ==================== Global keyframes for reaction animation ====================
// Injected once at module load. Uses a named keyframe so adjacent instances
// can play independently without CSS class collisions.
if (typeof document !== 'undefined' && !document.getElementById('sq-reaction-keyframes')) {
  const style = document.createElement('style');
  style.id = 'sq-reaction-keyframes';
  style.textContent = `
    @keyframes sq-reaction-rise {
      0%   { transform: translateX(-50%) translateY(0)     scale(0.8); opacity: 0; }
      15%  { transform: translateX(-50%) translateY(-10px) scale(1);   opacity: 1; }
      85%  { transform: translateX(-50%) translateY(-120px) scale(1);  opacity: 1; }
      100% { transform: translateX(-50%) translateY(-160px) scale(0.9); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

// ==================== Breakout inline helpers ====================

// Coach-only rooms dropdown + end-breakouts button (top bar during a session).
function BreakoutCoachControls({
  groups,
  currentRoomName,
  endsAt,
  open,
  onToggleOpen,
  onHopTo,
  onEnd,
}: {
  groups: BreakoutGroup[];
  currentRoomName: string | null;
  endsAt: number;
  open: boolean;
  onToggleOpen: () => void;
  onHopTo: (g: BreakoutGroup | null) => void;
  onEnd: () => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const currentLabel = currentRoomName
    ? `Group ${groups.findIndex((g) => g.roomName === currentRoomName) + 1}`
    : 'Main';
  return (
    <div className="ml-1 flex items-center gap-1">
      <div className="relative">
        <button
          onClick={onToggleOpen}
          className="px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase tracking-wider bg-sky-400/20 text-sky-200 hover:bg-sky-400/30 transition-colors border border-sky-400/30"
          title="Hop between rooms"
        >
          Rooms · {currentLabel} · {mm}:{ss}
        </button>
        {open && (
          <div className="absolute top-full right-0 mt-2 w-[220px] rounded-lg bg-zinc-900 border border-white/10 shadow-xl overflow-hidden z-[30]">
            <button
              onClick={() => onHopTo(null)}
              className={`w-full px-3 py-2 text-left text-[12px] border-b border-white/5 transition-colors ${
                currentRoomName === null
                  ? 'bg-white/10 text-white font-semibold'
                  : 'text-white/80 hover:bg-white/5'
              }`}
            >
              Main room
            </button>
            {groups.map((g) => (
              <button
                key={g.roomName}
                onClick={() => onHopTo(g)}
                className={`w-full px-3 py-2 text-left text-[12px] transition-colors ${
                  currentRoomName === g.roomName
                    ? 'bg-white/10 text-white font-semibold'
                    : 'text-white/80 hover:bg-white/5'
                }`}
              >
                <div>Group {g.groupId}</div>
                <div className="text-[10px] text-white/40 truncate mt-0.5">
                  {g.members.map((m) => m.userName).join(', ')}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onEnd}
        className="px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase tracking-wider bg-red-500/20 text-red-200 hover:bg-red-500/30 transition-colors border border-red-500/30"
        title="End breakouts for everyone"
      >
        End
      </button>
    </div>
  );
}

// Attendee-facing breakout countdown badge shown in the top bar while they're
// in a sub-room. Pulses amber as the timer runs down.
function BreakoutCountdownBadge({
  groupId,
  endsAt,
}: {
  groupId: number;
  endsAt: number;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const urgent = secondsLeft <= 60;
  return (
    <div
      className={`ml-1 px-2.5 py-1 rounded-lg text-[11px] font-mono uppercase tracking-wider border ${
        urgent
          ? 'bg-red-400/20 text-red-200 border-red-400/30 animate-pulse'
          : 'bg-sky-400/20 text-sky-200 border-sky-400/30'
      }`}
    >
      Group {groupId} · {mm}:{ss}
    </div>
  );
}

