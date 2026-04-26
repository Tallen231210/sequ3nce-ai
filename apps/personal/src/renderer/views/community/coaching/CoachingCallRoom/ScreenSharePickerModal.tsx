import React, { useEffect, useState } from 'react';
import type { ScreenSource } from '../../../../types/electron';

interface ScreenSharePickerModalProps {
  /** Sources passed in by the parent — fetched in the main process via
   *  desktopCapturer.getSources() in response to a getDisplayMedia request. */
  sources: ScreenSource[];
  /** Called with the chosen source id (or null on cancel). The parent is
   *  responsible for routing the choice back to the deferred
   *  setDisplayMediaRequestHandler callback. */
  onResolve: (sourceId: string | null) => void;
}

// In-app picker for choosing which screen / window to share. The parent
// triggers a getDisplayMedia request (via Daily's startScreenShare) which
// fires Electron's setDisplayMediaRequestHandler in the main process; that
// handler defers its callback and pushes the source list to the renderer.
// The renderer renders THIS modal; user picks; we IPC the choice back, the
// deferred callback fires with the chosen source, and Daily's SDK gets a
// proper MediaStream to send to viewers.
//
// Why deferred-callback instead of the legacy `chromeMediaSourceId` +
// getUserMedia approach: Electron 39 silently returns an empty stream from
// the legacy chromeMediaSource constraint, which is what shipped a black
// tile to viewers in the v1.15.1 first attempt. The modern getDisplayMedia
// flow with a deferred handler is the supported path.
export function ScreenSharePickerModal({ sources, onResolve }: ScreenSharePickerModalProps) {
  const [tab, setTab] = useState<'screen' | 'window'>(() =>
    sources.some((s) => s.type === 'screen') ? 'screen' : 'window',
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Esc-to-close mirrors the convention used by other modals in this file.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onResolve(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onResolve]);

  const filtered = sources.filter((s) => s.type === tab);
  const selected = sources.find((s) => s.id === selectedId) ?? null;

  function confirm() {
    if (!selected) return;
    onResolve(selected.id);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => onResolve(null)}
    >
      <div
        className="w-[min(720px,94vw)] max-h-[88vh] flex flex-col rounded-xl bg-zinc-900 border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">
              Screen share
            </div>
            <div className="text-[16px] font-semibold text-white">Choose what to share</div>
          </div>
          {/* Tabs */}
          <div className="flex items-center bg-white/5 rounded-lg p-0.5 border border-white/10">
            <button
              onClick={() => { setTab('screen'); setSelectedId(null); }}
              className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${
                tab === 'screen' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              Entire Screen
            </button>
            <button
              onClick={() => { setTab('window'); setSelectedId(null); }}
              className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${
                tab === 'window' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              Application Window
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-[13px] text-white/50">
              {tab === 'window'
                ? 'No application windows available — open a window first.'
                : 'No screens detected.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((s) => {
                const isSelected = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    onDoubleClick={() => onResolve(s.id)}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-colors ${
                      isSelected ? 'border-white' : 'border-white/10 hover:border-white/30'
                    }`}
                    title={s.name}
                  >
                    <img
                      src={s.thumbnail}
                      alt={s.name}
                      className="w-full h-full object-cover bg-black"
                    />
                    {/* Caption bar */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-5 pb-1.5 px-2 flex items-center gap-1.5">
                      {s.appIcon && (
                        <img src={s.appIcon} alt="" className="w-3.5 h-3.5 shrink-0 rounded-sm" />
                      )}
                      <span className="text-[11px] font-medium text-white truncate text-left">
                        {s.name}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white text-black flex items-center justify-center shadow-lg">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10">
          <button
            onClick={() => onResolve(null)}
            className="px-4 py-2 text-[13px] font-medium bg-white/5 text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!selected}
            className="px-5 py-2 text-[13px] font-semibold bg-white text-black rounded-lg hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
