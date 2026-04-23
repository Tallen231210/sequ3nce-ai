import React, { useEffect, useMemo } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { DailyProvider } from '@daily-co/daily-react';
import { useCoachingSession } from './CoachingSessionContext';
import { CoachingCallRoom } from './CoachingCallRoom';
import { CoachingCallMini } from './CoachingCallMini';

// Floating wrapper that renders whenever an active coaching session exists.
//
// Owns the Daily call-object lifecycle. Creating the callObject here (rather
// than inside CoachingCallRoom) means:
//   - The call survives when the user navigates away from the Community tab
//     (MeetingBotHub mounts this layer as a sibling to the tab router, so
//     the layer stays mounted across tab switches).
//   - Full and mini views share the same callObject — switching between them
//     doesn't reconnect, doesn't re-prompt for media, doesn't interrupt audio.
//
// Daily enforces a global "only one call object alive at a time" invariant,
// so `.destroy()` on cleanup is critical.
export function CoachingCallLayer({
  currentUserId,
  onLeave,
}: {
  currentUserId: string;
  onLeave: () => void;
}) {
  const { activeSession, viewMode } = useCoachingSession();

  // One callObject per session. Re-key on the call's id so a fresh session
  // (after leaving and rejoining a different call) gets a fresh instance.
  const callObject = useMemo(() => {
    if (!activeSession) return null;
    return DailyIframe.createCallObject({ subscribeToTracksAutomatically: true });
  }, [activeSession?.call._id]);

  useEffect(() => {
    if (!callObject) return;
    return () => {
      // leave() is async; destroy() tears down the instance. Fire-and-forget;
      // Daily handles the race internally.
      void callObject.leave().finally(() => {
        callObject.destroy();
      });
    };
  }, [callObject]);

  if (!activeSession || !callObject) return null;

  return (
    <DailyProvider callObject={callObject}>
      {viewMode === 'full' ? (
        <CoachingCallRoom
          call={activeSession.call}
          currentUserId={currentUserId}
          roomUrl={activeSession.roomUrl}
          token={activeSession.token}
          selfPhotoUrl={activeSession.selfPhotoUrl}
          onLeave={onLeave}
        />
      ) : (
        <CoachingCallMini onLeave={onLeave} />
      )}
    </DailyProvider>
  );
}
