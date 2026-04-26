import React from 'react';
import {
  DailyVideo,
  useDaily,
  useLocalSessionId,
  useParticipant,
} from '@daily-co/daily-react';
import { kickFromCoachingCall } from '../../../../convex';
import { Icon } from './Icon';
import type { VideoGridProps } from './types';

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

// Thin wrapper to pass the new props through to ParticipantTile without
// threading a dozen positional arguments at every call site.
export function ParticipantTileWrapped({
  sessionId,
  isFocus,
  callId,
  isCoachView,
  currentUserId,
  coachUserId,
  coachSessionId,
  focusMode,
  raisedHands,
  liveReactions,
  onSpotlight,
  onKickError,
}: VideoGridProps & { sessionId: string; isFocus?: boolean }) {
  // "Spotlighted" covers both 1-person spotlight and 2-person role-play —
  // both promote the attendee to the top slot, both get the amber border.
  const isSpotlighted =
    (focusMode.kind === 'spotlight' && focusMode.sessionId === sessionId) ||
    (focusMode.kind === 'role-play' && focusMode.sessionIds.includes(sessionId));
  const isCoachTile = coachSessionId === sessionId;
  // Role-play tiles get sky border; 1-person spotlight gets amber (same as
  // the coach's default tile color). Differentiating helps viewers spot
  // which override is active at a glance.
  const roleHighlight: 'none' | 'spotlight' | 'role-play' =
    focusMode.kind === 'role-play' && focusMode.sessionIds.includes(sessionId)
      ? 'role-play'
      : focusMode.kind === 'spotlight' && focusMode.sessionId === sessionId
      ? 'spotlight'
      : 'none';
  return (
    <ParticipantTile
      sessionId={sessionId}
      isFocus={isFocus}
      callId={callId}
      isCoachView={isCoachView}
      currentUserId={currentUserId}
      coachUserId={coachUserId}
      isSpotlighted={isSpotlighted}
      isCoachTile={isCoachTile}
      roleHighlight={roleHighlight}
      // Only allow the per-tile spotlight button when no focus override is
      // currently active. Prevents accidentally swapping role-play → spotlight
      // with one click. Coach can End role play / spotlight from the top bar
      // before picking a different target.
      canSpotlight={focusMode.kind === 'coach'}
      handRaised={!!raisedHands[sessionId]}
      reactions={liveReactions.filter((r) => r.sessionId === sessionId)}
      onSpotlight={onSpotlight}
      onKickError={onKickError}
    />
  );
}

export function ParticipantTile({
  sessionId,
  callId,
  isCoachView,
  currentUserId,
  coachUserId,
  isFocus,
  isSpotlighted,
  isCoachTile,
  roleHighlight,
  canSpotlight,
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
  /** True if this tile is the coach's own tile (resolved via userData
   *  b2cUserId match). Drives the amber border + COACH badge. */
  isCoachTile?: boolean;
  /** Which focus-mode override applies to this tile. Used by ParticipantTile
   *  to pick the right border color. 'spotlight' = amber, 'role-play' = sky. */
  roleHighlight?: 'none' | 'spotlight' | 'role-play';
  /** Coach-only flag: is the per-tile Spotlight button clickable? False
   *  when there's already an active focus-mode override, so clicking it
   *  doesn't silently swap role-play → spotlight. */
  canSpotlight?: boolean;
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

  // Border priority (most-specific first):
  //   1. Role-play target  → sky blue (2 people in this state)
  //   2. Spotlight target  → amber     (1 person in this state)
  //   3. Coach tile        → amber     (their persistent identity)
  //   4. Focus (speaker-view legacy) → subtle white
  //   5. Default           → dim white
  const borderClass =
    roleHighlight === 'role-play'
      ? 'border-sky-400/80 ring-1 ring-sky-400/40'
      : roleHighlight === 'spotlight'
      ? 'border-amber-400/80 ring-1 ring-amber-400/40'
      : isCoachTile
      ? 'border-amber-300/70 ring-1 ring-amber-300/30'
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

      {/* Coach badge — top-left when this tile is the coach's. Identifies
          the coach visually in any layout (classroom bottom rows, gallery,
          mini). Does not collide with the raised-hand badge because coaches
          don't raise their own hand. */}
      {isCoachTile && !handRaised && (
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-300 text-black text-[9px] font-bold uppercase tracking-wider shadow-lg">
          Coach
        </div>
      )}

      {/* Raised-hand badge — top-left so it doesn't collide with host actions */}
      {handRaised && (
        <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-amber-400 text-black text-[10px] font-bold flex items-center gap-1 shadow-lg">
          <Icon name="hand" className="w-3 h-3" />
          Hand up
        </div>
      )}

      {/* Role badge — top-center. "Spotlight" for 1-person focus (amber),
          "Role Play" for 2-person role-play (sky). Only one renders at a
          time via the roleHighlight enum. */}
      {roleHighlight === 'spotlight' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-amber-400/90 text-black text-[10px] font-bold uppercase tracking-wider">
          Spotlight
        </div>
      )}
      {roleHighlight === 'role-play' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md bg-sky-400/90 text-black text-[10px] font-bold uppercase tracking-wider">
          Role Play
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

      {/* Coach-only per-tile controls: spotlight (when allowed) / mute / kick. */}
      {isCoachView && !isLocal && (
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {canSpotlight && (
            <button
              onClick={() => onSpotlight(sessionId)}
              className="p-1.5 rounded-md text-white bg-black/70 hover:bg-black/90"
              title="Spotlight this participant"
              aria-label="Spotlight participant"
            >
              <Icon name="spotlight" className="w-3.5 h-3.5" />
            </button>
          )}
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

// (isSpotlighted prop is computed inside ParticipantTileWrapped and passed
// through; consumers outside this file should use ParticipantTileWrapped.)
