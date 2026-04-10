import React, { useCallback, useEffect, useState } from 'react';
import type { CloserInfo } from '../../convex';
import { StreamHistoryTab } from './StreamHistoryTab';
import { StreamSettingsTab } from './StreamSettingsTab';
import {
  fetchStreamSettings,
  fetchStreamHistory,
  saveStreamSettings,
  type StreamSettings,
  type StreamTranscription,
} from './streamClient';

interface StreamModalProps {
  closerInfo: CloserInfo;
  onClose: () => void;
  streamEnabled: boolean;
  onStreamEnabledChange: (enabled: boolean) => void;
}

type StreamTab = 'history' | 'settings';

async function detectPlatform(): Promise<string> {
  try {
    const result = await window.electron?.stream?.checkPermissions();
    return result?.platform ?? 'darwin';
  } catch {
    return 'darwin';
  }
}

/**
 * Full-screen centered modal for Sequ3nce Stream. Two tabs:
 *  - History: rolling 500 transcriptions fetched from /b2c/stream/history
 *  - Settings: permissions, hotkey picker, delete-all
 *
 * On first open (hasCompletedOnboarding is false), automatically routes to
 * Settings so the user sees the permissions flow + hotkey visual. After the
 * settings are saved once, subsequent opens go straight to History.
 */
export function StreamModal({ closerInfo, onClose, streamEnabled, onStreamEnabledChange }: StreamModalProps) {
  const [activeTab, setActiveTab] = useState<StreamTab>('history');
  const [settings, setSettings] = useState<StreamSettings | null>(null);
  const [transcriptions, setTranscriptions] = useState<StreamTranscription[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  const b2cUserId = closerInfo.b2cUserId;

  // Initial load: fetch settings + decide which tab to open on + sync enabled state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!b2cUserId) {
        setInitialLoadDone(true);
        return;
      }
      try {
        const s = await fetchStreamSettings(b2cUserId);
        if (cancelled) return;
        setSettings(s);
        // Sync the enabled state from persisted settings — both visual AND main process.
        // Without the IPC call, the toggle shows ON but the hotkey doesn't actually run.
        const isEnabled = s?.enabled ?? false;
        onStreamEnabledChange(isEnabled);
        if (isEnabled) {
          window.electron?.stream?.setEnabled(true).catch((err) => {
            console.error('[StreamModal] initial setEnabled IPC failed:', err);
          });
        }
        // First-run: if no settings row OR they haven't finished onboarding, show Settings tab.
        if (!s || !s.hasCompletedOnboarding) {
          setActiveTab('settings');
          // Seed a settings row with the platform-default hotkey so the user
          // has something to see. macOS uses Fn (custom CGEventTap dylib);
          // Windows uses Right Control. Defaults OFF — user flips the toggle.
          const platform = await detectPlatform();
          const platformDefault = platform === 'darwin' ? 'Fn' : 'RightControl';
          try {
            await saveStreamSettings(b2cUserId, s?.hotkey ?? platformDefault, true, false);
            const refreshed = await fetchStreamSettings(b2cUserId);
            if (!cancelled) setSettings(refreshed);
          } catch (err) {
            console.error('[StreamModal] seed settings failed:', err);
          }
        }
      } catch (err) {
        console.error('[StreamModal] fetch settings failed:', err);
      } finally {
        if (!cancelled) setInitialLoadDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [b2cUserId, onStreamEnabledChange]);

  const refreshHistory = useCallback(async () => {
    if (!b2cUserId) return;
    setLoadingHistory(true);
    try {
      const rows = await fetchStreamHistory(b2cUserId);
      setTranscriptions(rows);
    } catch (err) {
      console.error('[StreamModal] fetch history failed:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [b2cUserId]);

  // Whenever we're on the history tab, refresh. Cheap enough — the endpoint returns
  // at most 500 small rows and users open this rarely.
  useEffect(() => {
    if (activeTab === 'history') {
      refreshHistory();
    }
  }, [activeTab, refreshHistory]);

  // Push the user id to the main process so the overlay can attribute
  // transcriptions. Safe to call multiple times.
  useEffect(() => {
    if (b2cUserId) {
      window.electron?.stream?.setUserId(b2cUserId).catch((err) => {
        console.error('[StreamModal] setUserId failed:', err);
      });
    }
  }, [b2cUserId]);

  const handleSettingsChanged = useCallback(async () => {
    if (!b2cUserId) return;
    try {
      const s = await fetchStreamSettings(b2cUserId);
      setSettings(s);
      onStreamEnabledChange(s?.enabled ?? false);
    } catch (err) {
      console.error('[StreamModal] reload settings failed:', err);
    }
    // Also refresh history in case they triggered delete-all
    refreshHistory();
  }, [b2cUserId, refreshHistory, onStreamEnabledChange]);

  const handleToggleEnabled = useCallback(async () => {
    if (!b2cUserId || togglingEnabled) return;
    const newEnabled = !streamEnabled;
    setTogglingEnabled(true);
    // Update UI immediately
    onStreamEnabledChange(newEnabled);
    try {
      // Fire IPC first — this starts/stops the hotkey hook instantly
      await window.electron?.stream?.setEnabled(newEnabled);
      // Then persist to Convex in the background (non-blocking for the user)
      saveStreamSettings(b2cUserId, settings?.hotkey ?? 'Fn', undefined, newEnabled)
        .then(() => fetchStreamSettings(b2cUserId))
        .then((s) => setSettings(s))
        .catch((err) => console.error('[StreamModal] save settings failed:', err));
    } catch (err) {
      // Revert UI if IPC failed
      onStreamEnabledChange(!newEnabled);
      console.error('[StreamModal] toggle enabled failed:', err);
    } finally {
      setTogglingEnabled(false);
    }
  }, [b2cUserId, streamEnabled, settings, togglingEnabled, onStreamEnabledChange]);

  // Escape closes the modal (matches the pattern used by other modals)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
      <div className="w-[640px] max-w-[92vw] h-[600px] max-h-[88vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-black">Sequ3nce Stream</h2>
            <p className="text-[12px] text-gray-500 mt-0.5">Hold-to-talk dictation, anywhere on your screen.</p>
          </div>
          <div className="flex items-center gap-3">
            {/* On/Off toggle */}
            <button
              onClick={handleToggleEnabled}
              disabled={togglingEnabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                streamEnabled ? 'bg-black' : 'bg-gray-200'
              }`}
              title={streamEnabled ? 'Disable Stream' : 'Enable Stream'}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  streamEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center px-5 border-b border-gray-200 shrink-0">
          {(['history', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-3 pb-3 -mb-px text-[13px] font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'text-black'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-px bg-black" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!initialLoadDone ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-black rounded-full animate-spin" />
            </div>
          ) : activeTab === 'history' ? (
            <StreamHistoryTab
              closerInfo={closerInfo}
              transcriptions={transcriptions}
              loading={loadingHistory}
              onRefresh={refreshHistory}
              onSwitchToSettings={() => setActiveTab('settings')}
            />
          ) : (
            <div className="flex-1 overflow-y-auto">
              <StreamSettingsTab
                closerInfo={closerInfo}
                settings={settings}
                onSettingsChanged={handleSettingsChanged}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
