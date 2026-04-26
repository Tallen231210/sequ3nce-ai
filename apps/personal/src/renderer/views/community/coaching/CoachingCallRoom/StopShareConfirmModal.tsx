import React from 'react';
import { Icon } from './Icon';

// Confirms before tearing down a live screen share. Quick safeguard against
// the coach accidentally killing a share they meant to keep up — easy to
// fat-finger Stop sharing during an active demo.
export function StopShareConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="w-[min(420px,90vw)] rounded-xl bg-zinc-900 border border-white/10 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-400/20 flex items-center justify-center">
            <Icon name="screen" className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-white/50">
              Screen share
            </div>
            <div className="text-[16px] font-semibold text-white">Stop sharing?</div>
          </div>
        </div>
        <p className="text-[13px] text-white/60 leading-snug mb-5">
          Everyone in the call will stop seeing your screen. You can always start a new share afterward.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-medium bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            Keep sharing
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-[13px] font-semibold bg-red-600 text-white rounded-lg hover:bg-red-500 transition-colors"
          >
            Stop sharing
          </button>
        </div>
      </div>
    </div>
  );
}
