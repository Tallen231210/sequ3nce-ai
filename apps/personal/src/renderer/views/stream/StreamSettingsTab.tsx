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
      const result = await window.electron?.stream?.requestMicrophone();
      // If the handler opened System Settings (because permission was denied or
      // the prompt failed), the user will toggle it there and come back.
      // The focus listener in refreshPermissions handles the re-check.
      if (result && !result.granted) {
        // Permission not yet granted — System Settings was opened as fallback.
        // Don't show an error; the focus listener will re-check when they return.
      }
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
    <div className="flex flex-col gap-6 px-5 py-5">
      {/* Hero: hotkey visual */}
      <div className="flex flex-col items-center gap-3 pt-2 pb-4">
        <HotkeyVisual hotkey={currentHotkey} platform={permissions?.platform ?? 'darwin'} />
      </div>

      {errorMessage && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Permissions */}
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Permissions
        </h3>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {/* Microphone */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div>
              <div className="text-[13px] font-medium text-black">Microphone access</div>
              <div className="text-[12px] text-gray-500">
                So Stream can hear what you dictate
              </div>
            </div>
            {permissions?.microphone ? (
              <span className="text-[12px] font-medium text-gray-500">Granted</span>
            ) : (
              <button
                onClick={handleRequestMicrophone}
                disabled={checkingPermissions}
                className="px-3 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {checkingPermissions ? 'Checking…' : 'Grant'}
              </button>
            )}
          </div>

          {/* Accessibility (mac only) */}
          {isMac && (
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-[13px] font-medium text-black">Accessibility access</div>
                <div className="text-[12px] text-gray-500">
                  So Stream can paste into the focused app
                </div>
              </div>
              {permissions?.accessibility ? (
                <span className="text-[12px] font-medium text-gray-500">Granted</span>
              ) : (
                <button
                  onClick={handleRequestAccessibility}
                  className="px-3 py-1.5 text-[12px] font-semibold text-white bg-black rounded-md hover:bg-gray-800 transition-colors"
                >
                  Open Settings
                </button>
              )}
            </div>
          )}
        </div>
        {allGood && (
          <div className="text-[12px] text-gray-500">
            You&apos;re all set — hold{' '}
            <span className="font-semibold text-black">{displayNameForHotkey(currentHotkey)}</span>{' '}
            anywhere and speak.
          </div>
        )}
      </section>

      {/* Hotkey picker — Windows only. macOS is locked to Fn in v1. */}
      {!isMac && (
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Hotkey
          </h3>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {hotkeyOptions.map((opt, idx) => {
              const isSelected = opt.id === currentHotkey;
              const isBusy = busyKey === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleHotkeyChange(opt.id)}
                  disabled={isBusy}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                    idx > 0 ? 'border-t border-gray-100' : ''
                  } hover:bg-gray-50`}
                >
                  <div>
                    <div className="text-[13px] font-medium text-black">{opt.label}</div>
                    {opt.hint && (
                      <div className="text-[12px] text-gray-500">{opt.hint}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isBusy && <span className="text-[11px] text-gray-400">saving…</span>}
                    <div
                      className={`w-4 h-4 rounded-full border ${
                        isSelected ? 'border-black bg-black' : 'border-gray-300'
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
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Danger zone
        </h3>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-black">Delete all history</div>
            <div className="text-[12px] text-gray-500">
              Remove every transcription from your account. Cannot be undone.
            </div>
          </div>
          <button
            onClick={handleDeleteAll}
            disabled={deletingAll}
            className="px-3 py-1.5 text-[12px] font-semibold text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {deletingAll ? 'Deleting…' : deleteConfirm ? 'Click again to confirm' : 'Delete all'}
          </button>
        </div>
      </section>
    </div>
  );
}
