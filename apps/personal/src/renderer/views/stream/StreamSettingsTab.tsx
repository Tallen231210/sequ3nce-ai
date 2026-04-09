import React, { useCallback, useEffect, useState } from 'react';
import type { CloserInfo } from '../../convex';
import { HotkeyVisual, displayNameForHotkey } from './HotkeyVisual';
import { saveStreamSettings, deleteAllStreamHistory, type StreamSettings } from './streamClient';

interface StreamSettingsTabProps {
  closerInfo: CloserInfo;
  settings: StreamSettings | null;
  onSettingsChanged: () => void;
}

interface PermissionsState {
  microphone: boolean;
  accessibility: boolean;
  platform: string;
}

export function StreamSettingsTab({ closerInfo, settings, onSettingsChanged }: StreamSettingsTabProps) {
  const [permissions, setPermissions] = useState<PermissionsState | null>(null);
  const [checkingPermissions, setCheckingPermissions] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Default hotkey depends on platform — macOS = Fn (via custom CGEventTap dylib),
  // Windows = Right Control (via uiohook-napi).
  const platformDefault = permissions?.platform === 'darwin' ? 'Fn' : 'RightControl';
  const currentHotkey = settings?.hotkey ?? platformDefault;

  const refreshPermissions = useCallback(async () => {
    setCheckingPermissions(true);
    try {
      const result = await window.electron?.stream?.checkPermissions();
      if (result) setPermissions(result);
    } catch (err) {
      console.error('[Stream settings] refreshPermissions failed', err);
    } finally {
      setCheckingPermissions(false);
    }
  }, []);

  useEffect(() => {
    refreshPermissions();
    // Re-check every time the window regains focus (user just came back from System Settings)
    const handleFocus = () => { refreshPermissions(); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshPermissions]);

  const handleRequestMicrophone = useCallback(async () => {
    try {
      await window.electron?.stream?.requestMicrophone();
    } catch (err) {
      console.error('[Stream settings] requestMicrophone failed', err);
    }
    await refreshPermissions();
  }, [refreshPermissions]);

  const handleRequestAccessibility = useCallback(async () => {
    try {
      await window.electron?.stream?.requestAccessibility();
    } catch (err) {
      console.error('[Stream settings] requestAccessibility failed', err);
    }
    // No refresh here — macOS toggles the checkbox asynchronously in System Settings.
    // The focus listener in refreshPermissions handles it when the user comes back.
  }, []);

  const handleHotkeyChange = useCallback(
    async (newHotkey: string) => {
      if (!closerInfo.b2cUserId) return;
      setBusyKey(newHotkey);
      setErrorMessage(null);
      try {
        await saveStreamSettings(closerInfo.b2cUserId, newHotkey);
        const rebindResult = await window.electron?.stream?.rebindHotkey(newHotkey);
        if (rebindResult && !rebindResult.success) {
          throw new Error(rebindResult.error ?? 'Rebind failed');
        }
        onSettingsChanged();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save hotkey';
        setErrorMessage(msg);
      } finally {
        setBusyKey(null);
      }
    },
    [closerInfo.b2cUserId, onSettingsChanged],
  );

  const handleDeleteAll = useCallback(async () => {
    if (!closerInfo.b2cUserId) return;
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setDeletingAll(true);
    setErrorMessage(null);
    try {
      await deleteAllStreamHistory(closerInfo.b2cUserId);
      onSettingsChanged();
      setDeleteConfirm(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete history';
      setErrorMessage(msg);
    } finally {
      setDeletingAll(false);
    }
  }, [closerInfo.b2cUserId, deleteConfirm, onSettingsChanged]);

  const isMac = permissions?.platform === 'darwin';
  const needsMic = isMac && permissions && !permissions.microphone;
  const needsAccessibility = isMac && permissions && !permissions.accessibility;
  const allGood = permissions && !needsMic && !needsAccessibility;

  const hotkeyOptions: Array<{ id: string; label: string; hint?: string }> = [
    { id: 'RightControl', label: 'Right Control', hint: 'Default — works on mac + windows' },
    { id: 'RightAlt', label: 'Right Option / Alt' },
    { id: 'RightShift', label: 'Right Shift' },
    { id: 'F13', label: 'F13', hint: 'Full-size keyboards only' },
  ];

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      {/* Hero: hotkey visual */}
      <div className="flex flex-col items-center gap-3 py-4">
        <HotkeyVisual hotkey={currentHotkey} platform={permissions?.platform ?? 'darwin'} />
      </div>

      {errorMessage && (
        <div className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Permissions */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Permissions
        </h3>
        <div className="rounded-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
          {/* Microphone */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800">
            <div className="flex items-start gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  !permissions ? 'bg-gray-100 dark:bg-zinc-800' : permissions.microphone ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-amber-100 dark:bg-amber-900/40'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z M19 10v2a7 7 0 01-14 0v-2 M12 19v4 M8 23h8"
                  />
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">Microphone access</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Required so Stream can hear what you dictate
                </div>
              </div>
            </div>
            {permissions?.microphone ? (
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Granted</span>
            ) : (
              <button
                onClick={handleRequestMicrophone}
                disabled={checkingPermissions}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-black rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {checkingPermissions ? 'Checking…' : 'Grant'}
              </button>
            )}
          </div>

          {/* Accessibility (mac only) */}
          {isMac && (
            <div className="flex items-center justify-between p-4">
              <div className="flex items-start gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    !permissions ? 'bg-gray-100 dark:bg-zinc-800' : permissions.accessibility ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-amber-100 dark:bg-amber-900/40'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l-4 4-4-4 M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">Accessibility access</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Required so Stream can paste into the focused app
                  </div>
                </div>
              </div>
              {permissions?.accessibility ? (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Granted</span>
              ) : (
                <button
                  onClick={handleRequestAccessibility}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-black rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Open Settings
                </button>
              )}
            </div>
          )}
        </div>
        {allGood && (
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            You&apos;re all set — try holding <span className="font-bold">{displayNameForHotkey(currentHotkey)}</span> anywhere and speak.
          </div>
        )}
      </section>

      {/* Hotkey picker — Windows only. macOS is locked to Fn in v1. */}
      {!isMac && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Hotkey
          </h3>
          <div className="rounded-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
            {hotkeyOptions.map((opt, idx) => {
              const isSelected = opt.id === currentHotkey;
              const isBusy = busyKey === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleHotkeyChange(opt.id)}
                  disabled={isBusy}
                  className={`w-full flex items-center justify-between p-4 text-left transition-colors ${
                    idx > 0 ? 'border-t border-gray-100 dark:border-zinc-800' : ''
                  } ${isSelected ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-gray-50 dark:hover:bg-zinc-800/60'}`}
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{opt.label}</div>
                    {opt.hint && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{opt.hint}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isBusy && <span className="text-[10px] text-gray-400">saving…</span>}
                    <div
                      className={`w-4 h-4 rounded-full border-2 ${
                        isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 dark:border-zinc-600'
                      }`}
                    >
                      {isSelected && (
                        <div className="w-full h-full rounded-full flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Danger zone */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Danger zone
        </h3>
        <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">Delete all history</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Remove every transcription from your account. This cannot be undone.
            </div>
          </div>
          <button
            onClick={handleDeleteAll}
            disabled={deletingAll}
            className="px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-white dark:bg-zinc-900 border border-red-300 dark:border-red-900 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/60 disabled:opacity-50 transition-colors"
          >
            {deletingAll ? 'Deleting…' : deleteConfirm ? 'Click again to confirm' : 'Delete all'}
          </button>
        </div>
      </section>
    </div>
  );
}
