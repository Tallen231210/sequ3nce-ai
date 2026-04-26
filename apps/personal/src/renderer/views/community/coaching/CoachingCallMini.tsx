import React, { useMemo, useState } from 'react';
import {
  DailyVideo,
  useDaily,
  useDailyEvent,
  useLocalSessionId,
  useParticipantIds,
  useParticipant,
} from '@daily-co/daily-react';
import { useCoachingSession } from './CoachingSessionContext';
import { resolveFocusTopIds } from './FocusModeTypes';
import { findCoachSessionId, parseParticipants } from './CoachingCallRoom/participants';

// The floating picture-in-picture tile that renders when the user minimizes
// the full coaching-call overlay. Pinned to bottom-right; no drag in v1.
//
// Keeps the Daily call alive in the background while the user navigates the
// rest of the app (e.g., to grab a shareable call link for the coach). Hover
// reveals 4 minimal controls: mic, cam, leave, maximize.
//
// Assumes it's rendered inside the same DailyProvider as the main room, so
// Daily hooks work identically.
export function CoachingCallMini({ onLeave }: { onLeave: () => void }) {
  const daily = useDaily();
  const { maximize, unreadChatCount, unreadHandsCount, activeSession, focusMode } = useCoachingSession();

  const ids = useParticipantIds({ sort: 'joined_at' });
  const localId = useLocalSessionId();

  // Force a re-render when any participant updates their userData — that's
  // how the coach session id gets resolved (via b2cUserId broadcast).
  const [, bumpUserData] = useState(0);
  useDailyEvent('participant-updated', () => bumpUserData((n) => n + 1));

  // Resolve the top-slot tile(s) from FocusMode. Mirrors CoachingCallRoom's
  // layout so the mini and full view stay in sync: coach by default, or
  // spotlight target, or 2 role-play tiles side-by-side.
  const coachSessionId = useMemo(
    () => findCoachSessionId(
      parseParticipants(daily),
      ids,
      activeSession?.call.coachUserId ?? '',
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily, ids, activeSession?.call.coachUserId],
  );

  const topIds = useMemo(() => {
    const idSet = new Set(ids);
    const resolved = resolveFocusTopIds(focusMode, coachSessionId).filter((id) => idSet.has(id));
    if (resolved.length > 0) return resolved;
    // Fallback: first non-local participant, then local. Keeps the mini
    // from going blank if nothing else matches (e.g., coach hasn't joined).
    const fallback = ids.find((id) => id !== localId) ?? localId ?? ids[0];
    return fallback ? [fallback] : [];
  }, [focusMode, coachSessionId, ids, localId]);

  const [micOn, setMicOn] = useState(() => {
    // Read current mic state once on mount; after that, our toggle is source of truth.
    const local = daily?.participants().local;
    return local ? !!local.audio : true;
  });
  const [camOn, setCamOn] = useState(() => {
    const local = daily?.participants().local;
    return local ? !!local.video : true;
  });

  async function toggleMic() {
    if (!daily) return;
    const next = !micOn;
    setMicOn(next);
    try { await daily.setLocalAudio(next); } catch { /* non-fatal */ }
  }
  async function toggleCam() {
    if (!daily) return;
    const next = !camOn;
    setCamOn(next);
    try { await daily.setLocalVideo(next); } catch { /* non-fatal */ }
  }
  async function handleLeave() {
    try { await daily?.leave(); } catch { /* non-fatal */ }
    onLeave();
  }

  // The tile itself is clickable anywhere outside the control buttons to
  // maximize. We stop-propagation on each button to avoid double-triggering.
  return (
    <div
      onClick={maximize}
      className="fixed bottom-4 right-4 z-[90] w-[320px] aspect-video bg-zinc-950 rounded-xl overflow-hidden border border-white/15 shadow-2xl cursor-pointer group transition-transform hover:scale-[1.01]"
      role="button"
      aria-label="Maximize coaching call"
      title="Click to maximize"
    >
      {topIds.length === 2 ? (
        // Role-play mode: 2 tiles split 50/50 inside the mini so the user
        // can tell at a glance that a role-play is active.
        <div className="flex w-full h-full">
          {topIds.map((id) => (
            <div key={id} className="flex-1 relative border-r border-white/10 last:border-r-0">
              <MiniVideoFrame sessionId={id} isLocal={id === localId} />
            </div>
          ))}
        </div>
      ) : topIds.length === 1 ? (
        <MiniVideoFrame sessionId={topIds[0]} isLocal={topIds[0] === localId} />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
          <span className="text-[9px] font-mono uppercase tracking-wider text-white/40">
            Waiting
          </span>
        </div>
      )}

      {/* Subtle gradient so the controls read over any background */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

      {/* Unread activity badges — top-left. Show per-channel counts so the
          user knows whether they missed chat, a raised hand, or both. */}
      {(unreadChatCount > 0 || unreadHandsCount > 0) && (
        <div className="absolute top-2 left-2 flex items-center gap-1 shadow-md">
          {unreadChatCount > 0 && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-400 text-black text-[10px] font-bold uppercase tracking-wider">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
              </svg>
              {unreadChatCount}
            </div>
          )}
          {unreadHandsCount > 0 && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-400 text-black text-[10px] font-bold uppercase tracking-wider">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.25}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 1 0-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 0 1 3.15 0v1.5m-3.15 0 .075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 0 1 3.15 0V15M6.9 7.575a1.575 1.575 0 1 0-3.15 0v8.175a6.75 6.75 0 0 0 6.75 6.75h2.018a5.25 5.25 0 0 0 3.712-1.538l1.732-1.732a5.25 5.25 0 0 0 1.538-3.712l.003-2.024a.668.668 0 0 1 .198-.471 1.575 1.575 0 1 0-2.228-2.228 3.818 3.818 0 0 0-1.12 2.687M6.9 7.575V12m9.075 5.625v-8.25" />
              </svg>
              {unreadHandsCount}
            </div>
          )}
        </div>
      )}

      {/* Hover controls */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <MiniControl
          onClick={(e) => { e.stopPropagation(); void toggleMic(); }}
          active={!micOn}
          title={micOn ? 'Mute' : 'Unmute'}
          ariaLabel={micOn ? 'Mute' : 'Unmute'}
          icon={micOn ? MicIcon : MicOffIcon}
        />
        <MiniControl
          onClick={(e) => { e.stopPropagation(); void toggleCam(); }}
          active={!camOn}
          title={camOn ? 'Camera off' : 'Camera on'}
          ariaLabel={camOn ? 'Camera off' : 'Camera on'}
          icon={camOn ? CameraIcon : CameraOffIcon}
        />
        <MiniControl
          onClick={(e) => { e.stopPropagation(); maximize(); }}
          title="Maximize"
          ariaLabel="Maximize"
          icon={MaximizeIcon}
        />
        <MiniControl
          onClick={(e) => { e.stopPropagation(); void handleLeave(); }}
          danger
          title="Leave call"
          ariaLabel="Leave call"
          icon={LeaveIcon}
        />
      </div>
    </div>
  );
}

// ---- Small button + inline icons (kept local so the mini has no import coupling
//      to the main CoachingCallRoom file's Icon component, which lives there for
//      reasons tied to the main overlay's sizing). ----

// One video frame inside the mini — renders DailyVideo when the participant
// has video, falls back to an initials circle otherwise. Used for both the
// single-tile view and each half of the role-play split view.
function MiniVideoFrame({ sessionId, isLocal }: { sessionId: string; isLocal: boolean }) {
  const participant = useParticipant(sessionId);
  const name = participant?.user_name || '?';
  if (participant?.video) {
    return (
      <DailyVideo
        sessionId={sessionId}
        type="video"
        automirror={isLocal}
        className="w-full h-full object-cover"
      />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black">
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-base font-semibold">
          {name.charAt(0).toUpperCase()}
        </div>
        <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 truncate max-w-full px-2">
          {name}
        </span>
      </div>
    </div>
  );
}

interface MiniControlProps {
  onClick: (e: React.MouseEvent) => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  ariaLabel: string;
  active?: boolean;
  danger?: boolean;
}

function MiniControl({ onClick, icon: IconComponent, title, ariaLabel, active, danger }: MiniControlProps) {
  const baseBg = danger
    ? 'bg-red-600/90 hover:bg-red-500'
    : active
    ? 'bg-white text-black hover:bg-white/90'
    : 'bg-white/10 text-white hover:bg-white/20';
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={`p-1.5 rounded-md transition-colors ${baseBg}`}
    >
      <IconComponent className="w-3.5 h-3.5" />
    </button>
  );
}

// Heroicons-style stroke-only icons, sized by className.
const strokeProps = {
  fill: 'none' as const,
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.75,
};

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
    </svg>
  );
}
function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M9 9v3.75a3 3 0 0 0 5.12 2.12M15 9.75V4.5a3 3 0 0 0-5.772-1.168M12 18.75a6 6 0 0 0 5.657-4M6 12.75a6 6 0 0 0 1.5 3.97M12 18.75v3.75m-3.75 0h7.5" />
    </svg>
  );
}
function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.823-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.823 1.316ZM16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
    </svg>
  );
}
function CameraOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15c.337 0 .654-.074.939-.207M21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169M16.5 12.75a4.5 4.5 0 1 1-7.8-3.075" />
    </svg>
  );
}
function MaximizeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  );
}
function LeaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...strokeProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
  );
}
