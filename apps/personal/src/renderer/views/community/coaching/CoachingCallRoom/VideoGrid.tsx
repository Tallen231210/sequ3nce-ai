import React, { useMemo, useState } from 'react';
import { DailyVideo, useDaily, useDailyEvent, useParticipantIds } from '@daily-co/daily-react';
import { resolveFocusTopIds, type FocusMode } from '../FocusModeTypes';
import { findCoachSessionId, parseParticipants } from './participants';
import { ParticipantTileWrapped } from './ParticipantTile';
import type { VideoGridProps } from './types';

// Renders a participant's screen-share track. Used in the top slot of the
// classroom view (replacing whoever was there) when any participant is
// actively sharing their screen. Lets the sharer see their own preview AND
// shows viewers the share via the same code path.
function ScreenShareTile({ sessionId }: { sessionId: string }) {
  return (
    <div className="relative w-full h-full bg-black rounded-xl overflow-hidden border-2 border-emerald-400/70 ring-1 ring-emerald-400/40">
      <DailyVideo
        sessionId={sessionId}
        type="screenVideo"
        className="w-full h-full object-contain"
      />
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-emerald-400 text-black text-[10px] font-bold uppercase tracking-wider shadow-lg">
        Screen share
      </div>
    </div>
  );
}

// Placeholder shown in the classroom top slot when the coach hasn't joined
// yet. Keeps the layout stable — the top slot never collapses.
function ClassroomWaitingForCoach() {
  return (
    <div className="max-w-full max-h-full aspect-video flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black rounded-xl border border-white/10">
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
          <svg className="w-7 h-7 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        </div>
        <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/40">
          Waiting for coach
        </span>
      </div>
    </div>
  );
}

export function VideoGrid(rawProps: VideoGridProps) {
  const daily = useDaily();
  const ids = useParticipantIds({ sort: 'joined_at' });
  // Participant-updated bump: when any participant updates their userData
  // (e.g., broadcasts b2cUserId right after join), force a re-render so the
  // coach lookup picks up the fresh metadata. useParticipantIds only reacts
  // to list changes; we need userData updates too. Also drives the
  // screenShareSessionId re-evaluation below — when someone starts/stops
  // sharing, Daily fires participant-updated.
  const [, bumpUserData] = useState(0);
  useDailyEvent('participant-updated', () => bumpUserData((n) => n + 1));

  // Active screen-share detection — derived directly from participants
  // rather than via daily-react's useScreenShare hook because that hook
  // doesn't reliably report the local participant's screen share in
  // Electron (verified empirically: local.screen was true, screenVideo
  // track 'playable', persistentTrack a real MediaStreamTrack — yet
  // useScreenShare().screens was empty).
  //
  // Computed inline (no useMemo) so it re-evaluates on every render. The
  // bumpUserData re-render hook above triggers re-renders on every
  // participant-updated event (which is what fires when someone toggles
  // screen.share), so this stays in sync. The cost is a single object
  // walk per render of a small participant list — negligible.
  const screenShareSessionId: string | null = (() => {
    if (!daily) return null;
    const participants = daily.participants();
    if (participants.local?.screen) return participants.local.session_id;
    for (const p of Object.values(participants)) {
      if (!p || p === participants.local) continue;
      if (p.screen) return p.session_id;
    }
    return null;
  })();

  const coachSessionId = useMemo(
    () => findCoachSessionId(parseParticipants(daily), ids, rawProps.coachUserId),
    // Re-eval when participants list or coach id changes. bumpUserData state
    // changes also trigger re-render; the memo recomputes because participants()
    // returns fresh data on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daily, ids, rawProps.coachUserId],
  );

  // Thread the resolved coach session id through every ParticipantTile so
  // the coach tile can render its amber border + "COACH" badge anywhere it
  // appears (classroom bottom rows or gallery grid).
  const props: VideoGridProps = { ...rawProps, coachSessionId };

  // Solo state — a single tile centered with a waiting hint. Same in both
  // view modes; no point having a "speaker view" with one participant.
  // EXCEPTION: when the solo participant is screen-sharing, we still need
  // to render the screen-share tile so they can see their own preview.
  if (ids.length <= 1) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-3 p-2">
        {screenShareSessionId && (
          <div className="w-[min(960px,100%)] flex-1 min-h-0 flex items-center justify-center">
            <div className="max-w-full max-h-full aspect-video w-full h-full">
              <ScreenShareTile sessionId={screenShareSessionId} />
            </div>
          </div>
        )}
        <div
          className={
            screenShareSessionId
              ? 'w-[min(280px,40%)] aspect-video shrink-0'
              : 'w-[min(560px,100%)] aspect-video'
          }
        >
          {ids.map((id) => (
            <ParticipantTileWrapped key={id} sessionId={id} {...props} />
          ))}
        </div>
        {!screenShareSessionId && (
          <div className="text-center">
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/40">
              Waiting for others to join
            </div>
          </div>
        )}
      </div>
    );
  }

  // Classroom layout — the default view. Coach is persistent at the top
  // (auditorium-style), attendees fill 2 rows below with horizontal scroll
  // for overflow. Spotlight/role-play override the top slot: 1 attendee
  // replaces coach (spotlight) or 2 attendees split the slot 50/50
  // (role-play). Coach drops into the bottom rows during overrides.
  //
  // Why not speaker-view-with-active-speaker-follow (v1.14): the auto-follow
  // was too jumpy in real testing — every cough flipped the view. Coaching
  // calls have a clear anchor (the coach) and don't need peer-symmetric
  // switching. See plan doc v1.15 for the full reasoning.
  if (props.viewMode === 'speaker') {
    const sessionIdsSet = new Set(ids);
    const rawFocusIds = resolveFocusTopIds(props.focusMode, coachSessionId)
      .filter((id) => sessionIdsSet.has(id));
    // If focus resolves to nothing (coach not yet joined, or target left),
    // fall back to the first participant so the top slot isn't empty.
    const topIds: string[] = rawFocusIds.length > 0 ? rawFocusIds : ids[0] ? [ids[0]] : [];
    // When someone's sharing, ALL participant cameras drop to the bottom
    // strip — the screen takes the entire top slot.
    const bottomIds = screenShareSessionId
      ? ids
      : ids.filter((id) => !topIds.includes(id));

    const coachJoined = coachSessionId !== null && sessionIdsSet.has(coachSessionId);
    const showWaitingPlaceholder = !screenShareSessionId &&
      (topIds.length === 0 || (props.focusMode.kind === 'coach' && !coachJoined));

    return (
      <div className="h-full w-full flex flex-col gap-3 overflow-hidden">
        {/* Top slot — screen share takes priority when active; otherwise
            coach by default, or spotlight / role-play override. 50% height
            of the video area. */}
        <div className="h-1/2 min-h-0 flex items-center justify-center gap-3">
          {screenShareSessionId ? (
            <div className="max-w-full max-h-full aspect-video w-full h-full flex items-center justify-center">
              <div className="max-w-full max-h-full w-full h-full">
                <ScreenShareTile sessionId={screenShareSessionId} />
              </div>
            </div>
          ) : showWaitingPlaceholder ? (
            <ClassroomWaitingForCoach />
          ) : topIds.length === 2 ? (
            // Role-play: two tiles side-by-side, each ~50% width, same height.
            // Each fits within the top slot as a 16:9 rectangle.
            topIds.map((id) => (
              <div key={id} className="flex-1 max-w-[48%] h-full flex items-center justify-center">
                <div className="max-w-full max-h-full aspect-video">
                  <ParticipantTileWrapped sessionId={id} isFocus {...props} />
                </div>
              </div>
            ))
          ) : (
            // Single focus tile (coach by default, or 1-person spotlight).
            <div className="max-w-full max-h-full aspect-video">
              <ParticipantTileWrapped sessionId={topIds[0]} isFocus {...props} />
            </div>
          )}
        </div>

        {/* Bottom strip — 2 rows of attendees, horizontal scroll for overflow.
            `grid-flow-col` fills column-by-column: tile A goes [row1,col1],
            B goes [row2,col1], C goes [row1,col2], etc. Keeps the column
            balanced as the strip scrolls. */}
        {bottomIds.length > 0 && (
          <div
            className="h-1/2 grid grid-rows-2 grid-flow-col auto-cols-max gap-3 overflow-x-auto overflow-y-hidden"
            style={{ justifyContent: 'safe center' }}
          >
            {bottomIds.map((id) => (
              <div key={id} className="h-full aspect-video">
                <ParticipantTileWrapped sessionId={id} {...props} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Gallery view — uniform grid with coach-first sorting and role-based
  // borders applied via ParticipantTileWrapped → ParticipantTile. Coach
  // always at position 0,0 with an amber border + "COACH" badge; spotlight/
  // role-play targets get their own highlighted border colors so viewers can
  // instantly see who's being featured even in the flat grid layout.
  // When someone's sharing, the screen takes the first cell of the grid.
  const gallerySortedIds = sortIdsForGallery(ids, coachSessionId, props.focusMode);
  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {screenShareSessionId && (
          <div key={`screen-${screenShareSessionId}`} className="aspect-video col-span-2 sm:col-span-3 md:col-span-2">
            <ScreenShareTile sessionId={screenShareSessionId} />
          </div>
        )}
        {gallerySortedIds.map((id) => (
          <div key={id} className="aspect-video">
            <ParticipantTileWrapped sessionId={id} {...props} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Gallery sort: coach first, then spotlight / role-play targets, then the
// rest in joined_at order. Stable — we maintain the joined_at order inside
// each group so the view doesn't reshuffle between renders.
function sortIdsForGallery(
  ids: string[],
  coachSessionId: string | null,
  focusMode: FocusMode,
): string[] {
  const focusIds = resolveFocusTopIds(focusMode, coachSessionId);
  const coachFirst = coachSessionId && ids.includes(coachSessionId)
    ? [coachSessionId]
    : [];
  const featured = focusIds.filter((id) => id !== coachSessionId && ids.includes(id));
  const rest = ids.filter((id) => id !== coachSessionId && !featured.includes(id));
  return [...coachFirst, ...featured, ...rest];
}
