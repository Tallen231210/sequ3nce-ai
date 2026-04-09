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
export function StreamModal({ closerInfo, onClose }: StreamModalProps) {
  const [activeTab, setActiveTab] = useState<StreamTab>('history');
  const [settings, setSettings] = useState<StreamSettings | null>(null);
  const [transcriptions, setTranscriptions] = useState<StreamTranscription[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const b2cUserId = closerInfo.b2cUserId;

  // Initial load: fetch settings + decide which tab to open on
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
        // First-run: if no settings row OR they haven't finished onboarding, show Settings tab.
        if (!s || !s.hasCompletedOnboarding) {
          setActiveTab('settings');
          // Seed a settings row with the platform-default hotkey so the user
          // has something to see. macOS uses Fn (custom CGEventTap dylib);
          // Windows uses Right Control. Mark onboarding complete so next opens
          // jump straight to History.
          const platform = await detectPlatform();
          const platformDefault = platform === 'darwin' ? 'Fn' : 'RightControl';
          try {
            await saveStreamSettings(b2cUserId, s?.hotkey ?? platformDefault, true);
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
  }, [b2cUserId]);

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
    } catch (err) {
      console.error('[StreamModal] reload settings failed:', err);
    }
    // Also refresh history in case they triggered delete-all
    refreshHistory();
  }, [b2cUserId, refreshHistory]);

  // Escape closes the modal (matches the pattern used by other modals)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl w-[720px] max-w-[90vw] h-[640px] max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 dark:border-zinc-800">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center shadow-md">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z M19 10v2a7 7 0 01-14 0v-2 M12 19v4 M8 23h8"
                />
              </svg>
            </div>
            <div>
              <div className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">Sequ3nce Stream</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">Hold-to-talk dictation anywhere on your screen</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-8 pt-3 shrink-0 border-b border-gray-100 dark:border-zinc-800">
          {(['history', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-semibold capitalize rounded-t-lg transition-colors relative ${
                activeTab === tab
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {!initialLoadDone ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gray-200 dark:border-zinc-700 border-t-black dark:border-t-white rounded-full animate-spin" />
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
