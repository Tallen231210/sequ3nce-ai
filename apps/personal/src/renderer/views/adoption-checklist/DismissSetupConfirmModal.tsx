import React, { useEffect } from 'react';

interface DismissSetupConfirmModalProps {
  remainingCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

// Friendly speed-bump before the user dismisses the Setup checklist.
// Without this, ✕ Skip is a single click that hides the entire onboarding
// surface forever — making it too easy to bypass the behaviors that drive
// $99/mo retention. We're not blocking anyone, just making them say yes
// twice and reminding them what they'd miss.
export function DismissSetupConfirmModal({
  remainingCount,
  onConfirm,
  onCancel,
}: DismissSetupConfirmModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="w-[min(440px,92vw)] rounded-xl bg-white border border-gray-200 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-[18px]">
            🚀
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
              Setup checklist
            </div>
            <div className="text-[16px] font-semibold text-gray-900">
              Skip the setup checklist?
            </div>
          </div>
        </div>
        <p className="text-[13px] text-gray-600 leading-snug mb-2">
          You still have{' '}
          <span className="font-semibold text-gray-900">
            {remainingCount} task{remainingCount === 1 ? '' : 's'}
          </span>{' '}
          to complete. These quick steps — profile, first call, highlight
          clip, and coaching — are the fastest path to actually getting
          value out of Sequ3nce.
        </p>
        <p className="text-[12px] text-gray-500 leading-snug mb-5">
          Skipping won't break anything; the checklist just disappears and
          you'll explore on your own.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-[13px] font-medium bg-white text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Skip anyway
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-semibold bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  );
}
