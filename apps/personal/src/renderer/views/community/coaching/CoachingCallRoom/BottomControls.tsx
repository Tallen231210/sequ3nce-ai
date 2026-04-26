import React from 'react';
import { Icon } from './Icon';
import { CtrlButton } from './CtrlButton';
import { ReactionButton } from './ReactionButton';
import type { FocusMode } from '../FocusModeTypes';

// Bottom strip of controls for the in-call view: mic, cam, share-screen
// (coach) / raise-hand (attendee), reactions, leave, end-call (coach).
//
// Pure view — every action is a callback prop. State (micOn, camOn, etc.)
// is owned by CoachingCallRoom; this component just renders the buttons.
export function BottomControls({
  micOn,
  camOn,
  screenSharing,
  isCoach,
  focusMode,
  myHandRaised,
  onToggleMic,
  onToggleCam,
  onToggleScreenShare,
  onToggleRaiseHand,
  onReact,
  onLeave,
  onEndCall,
}: {
  micOn: boolean;
  camOn: boolean;
  screenSharing: boolean;
  isCoach: boolean;
  focusMode: FocusMode;
  myHandRaised: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onToggleRaiseHand: () => void;
  onReact: (emoji: string) => void;
  onLeave: () => void;
  onEndCall: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-white/10">
      <CtrlButton active={!micOn} onClick={onToggleMic} iconName={micOn ? 'mic' : 'mic-off'} label={micOn ? 'Mute' : 'Unmute'} />
      <CtrlButton active={!camOn} onClick={onToggleCam} iconName={camOn ? 'camera' : 'camera-off'} label={camOn ? 'Camera off' : 'Camera on'} />
      {isCoach && (
        // Screen-share is disabled during spotlight/role-play — during
        // those modes the top slot is claimed by the focus target(s), and
        // coach isn't the focus. Re-enable it by ending the override first.
        <CtrlButton
          active={screenSharing}
          onClick={focusMode.kind === 'coach' ? onToggleScreenShare : () => {}}
          iconName="screen"
          label={screenSharing ? 'Stop sharing' : 'Share screen'}
          disabled={focusMode.kind !== 'coach'}
          disabledTitle="End the spotlight / role play to share your screen"
        />
      )}
      {!isCoach && (
        <CtrlButton
          active={myHandRaised}
          onClick={onToggleRaiseHand}
          iconName="hand"
          label={myHandRaised ? 'Lower hand' : 'Raise hand'}
        />
      )}
      <ReactionButton onReact={onReact} />
      <div className="w-3" />
      <button
        onClick={onLeave}
        className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors"
      >
        <Icon name="leave" className="w-4 h-4" />
        Leave
      </button>
      {isCoach && (
        <button
          onClick={onEndCall}
          className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
        >
          <Icon name="end-call" className="w-4 h-4" />
          End for everyone
        </button>
      )}
    </div>
  );
}
