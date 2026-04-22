import React, { useEffect, useMemo, useRef, useState } from 'react';
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import {
  DailyProvider,
  DailyAudio,
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
  type CoachingCall,
} from '../../../convex';
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

// Main export — wraps the whole overlay in a DailyProvider. We create the
// call-object via useMemo and, CRITICALLY, call .destroy() on unmount. Daily
// enforces a global "only one call object alive at a time" invariant; if we
// skip destroy() the next mount throws "Duplicate DailyIframe instances".
export function CoachingCallRoom(props: CoachingCallRoomProps) {
  const callObject = useMemo(
    () => DailyIframe.createCallObject({ subscribeToTracksAutomatically: true }),
    []
  );

  useEffect(() => {
    return () => {
      // leave() is async; destroy() immediately tears down the instance.
      // Fire-and-forget — Daily handles the race internally.
      void callObject.leave().finally(() => {
        callObject.destroy();
      });
    };
  }, [callObject]);

  return (
    <DailyProvider callObject={callObject}>
      <CoachingCallRoomInner {...props} />
    </DailyProvider>
  );
}

// Inner component — has access to Daily hooks via the provider wrapping it.
function CoachingCallRoomInner({
  call,
  currentUserId,
  roomUrl,
  token,
  selfPhotoUrl,
  onLeave,
}: CoachingCallRoomProps) {
  const daily = useDaily();
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const recordingStartedRef = useRef(false);
  const isCoach = call.coachUserId === currentUserId;

  // Join the Daily room once on mount. Immediately after join completes, we
  // publish our Sequ3nce profile photo via setUserData so other participants
  // can render it on our tile when our camera is off. If the current user is
  // the coach (owner), we also kick off cloud recording — Daily requires an
  // explicit startRecording() call even when the room has enable_recording:"cloud".
  useEffect(() => {
    let cancelled = false;
    async function join() {
      if (!daily) return;
      try {
        await daily.join({ url: roomUrl, token });
        if (cancelled) return;
        // setUserData is a per-participant broadcast — other clients see it
        // via participant.userData. Safe to call repeatedly; Daily dedups.
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
        setJoined(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to join call');
        }
      }
    }
    void join();
    return () => {
      cancelled = true;
      daily?.leave();
    };
  }, [daily, roomUrl, token, selfPhotoUrl, isCoach]);

  // If the coach ends the call, Daily emits 'left-meeting' for everyone
  useDailyEvent('left-meeting', () => {
    onLeave();
  });

  // Mic / cam toggle helpers
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

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

        {/* Right: timer + count + chat toggle */}
        <div className="flex items-center justify-end gap-3">
          <LiveDurationPill startMs={call.actualStartTime ?? Date.now()} />
          <span className="text-white/30">·</span>
          <ParticipantCountPill />
          <button
            onClick={() => setShowChat(!showChat)}
            aria-label={showChat ? 'Hide chat' : 'Show chat'}
            className={`ml-1 p-2 rounded-lg transition-colors ${
              showChat
                ? 'bg-white text-black'
                : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon name="chat" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="mx-6 mt-3 px-3 py-2 bg-red-950/60 border border-red-900 text-red-200 rounded-lg text-[12px]">
          {error}
        </div>
      )}

      {/* Main content: video grid + optional chat panel */}
      <div className="flex-1 flex min-h-0 relative">
        <div className="flex-1 p-6 overflow-hidden">
          {joined ? (
            <VideoGrid coachUserId={call.coachUserId} isCoachView={isCoach} callId={call._id} currentUserId={currentUserId} onKickError={setError} />
          ) : (
            <ConnectingState />
          )}
        </div>
        {showChat && <ChatPanel />}

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

      {/* Daily audio — must be rendered once to hear participants */}
      <DailyAudio />
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
  | 'kick';

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

function VideoGrid({
  coachUserId,
  isCoachView,
  callId,
  currentUserId,
  onKickError,
}: {
  coachUserId: string;
  isCoachView: boolean;
  callId: string;
  currentUserId: string;
  onKickError: (msg: string) => void;
}) {
  const ids = useParticipantIds({ sort: 'joined_at' });

  // Solo state — center the single tile at a sensible size + add a waiting hint
  // so the coach has something to look at while attendees trickle in.
  if (ids.length <= 1) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-6">
        <div className="w-[min(560px,100%)]">
          {ids.map((id) => (
            <ParticipantTile
              key={id}
              sessionId={id}
              callId={callId}
              isCoachView={isCoachView}
              currentUserId={currentUserId}
              coachUserId={coachUserId}
              onKickError={onKickError}
            />
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

  return (
    <div className="h-full w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 auto-rows-min">
      {ids.map((id) => (
        <ParticipantTile
          key={id}
          sessionId={id}
          callId={callId}
          isCoachView={isCoachView}
          currentUserId={currentUserId}
          coachUserId={coachUserId}
          onKickError={onKickError}
        />
      ))}
    </div>
  );
}

function ParticipantTile({
  sessionId,
  callId,
  isCoachView,
  currentUserId,
  coachUserId,
  onKickError,
}: {
  sessionId: string;
  callId: string;
  isCoachView: boolean;
  currentUserId: string;
  coachUserId: string;
  onKickError: (msg: string) => void;
}) {
  const participant = useParticipant(sessionId);
  const localId = useLocalSessionId();
  const isLocal = sessionId === localId;
  const name = participant?.user_name || 'Guest';

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
    // v1 simplification: we pass the session id; backend kicks by session id.
    // The attendance row update uses a best-effort name match (see backend).
    // If that's too loose in practice, a follow-up will add app-message
    // handshake for userId.
    const res = await kickFromCoachingCall(callId, currentUserId, sessionId as unknown as string, sessionId);
    if (res.error) {
      onKickError(res.error);
    }
  }

  return (
    <div className="relative aspect-video bg-zinc-950 rounded-xl overflow-hidden border border-white/10 group">
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
              className="w-20 h-20 rounded-full object-cover border border-white/20"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-white/80 text-xl font-semibold">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}

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

      {isCoachView && !isLocal && (
        <button
          onClick={handleKick}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-red-600/90 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove from call"
          aria-label="Remove from call"
        >
          <Icon name="kick" className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ==================== Chat panel ====================

interface ChatMessage {
  id: string;
  from: string;
  body: string;
  at: number;
}

function ChatPanel() {
  const daily = useDaily();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Daily emits app-message for custom messages. We use sendAppMessage/receive
  // as a simple broadcast chat — no persistence needed for v1.
  useDailyEvent('app-message', (ev) => {
    const payload = ev?.data as { kind?: string; body?: string; from?: string };
    if (payload?.kind === 'chat' && payload.body) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          from: payload.from || 'Anon',
          body: payload.body,
          at: Date.now(),
        },
      ]);
    }
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function send() {
    const trimmed = draft.trim();
    if (!trimmed || !daily) return;
    const myName =
      daily.participants().local?.user_name || 'You';
    daily.sendAppMessage(
      { kind: 'chat', body: trimmed, from: myName },
      '*'
    );
    // Also render locally so the sender sees their own message
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-local`,
        from: myName,
        body: trimmed,
        at: Date.now(),
      },
    ]);
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
          className="h-3 w-auto opacity-40 [filter:invert(1)_contrast(1.1)_brightness(1.1)]"
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
