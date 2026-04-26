import React from 'react';

// Shown when the coach clicks Share Screen but macOS Screen Recording
// permission isn't granted. macOS doesn't expose an askForMediaAccess API
// for screen recording, so we have to walk the user to System Settings.
// The app has to be restarted after the toggle flips — macOS caches the
// permission state at process start.
export function ScreenPermissionModal({
  onOpenSettings,
  onDismiss,
}: {
  onOpenSettings: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-[min(460px,92vw)] rounded-xl bg-zinc-900 border border-white/10 shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-400/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
            </svg>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-amber-200/80">
              macOS permission needed
            </div>
            <div className="text-[16px] font-semibold text-white">
              Allow Screen Recording
            </div>
          </div>
        </div>
        <p className="text-[13px] text-white/70 leading-snug mb-2">
          To share your screen, macOS needs to grant Sequ3nce Personal the
          Screen Recording permission. This is a one-time setup per machine.
        </p>
        <ol className="text-[12.5px] text-white/60 leading-snug space-y-1 mb-4 pl-4 list-decimal">
          <li>Click <span className="text-white font-semibold">Open Settings</span> below</li>
          <li>Toggle <span className="text-white font-semibold">Sequ3nce Personal</span> on</li>
          <li><span className="text-amber-300 font-semibold">Quit and reopen</span> the app — macOS caches this permission at launch</li>
          <li>Try Share Screen again</li>
        </ol>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-[13px] font-medium bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            Not now
          </button>
          <button
            onClick={onOpenSettings}
            className="px-4 py-2 text-[13px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
          >
            Open Settings
          </button>
        </div>
      </div>
    </div>
  );
}
