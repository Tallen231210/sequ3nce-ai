import React from 'react';
import { Icon } from './Icon';

// Modal shown to a participant when the coach "calls on" them — invites them
// to unmute. The user can accept (mic turns on) or decline.
export function CallOnModal({
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
