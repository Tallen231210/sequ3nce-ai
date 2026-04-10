// Sequ3nce Stream — main process entry point.
//
// This module is the ONLY thing the rest of the main process imports from
// ./stream/. It exposes two functions:
//   - initializeStream(): called once from app.whenReady() to set up hotkey,
//     overlay, and IPC handlers.
//   - shutdownStream(): called from before-quit to tear everything down cleanly.
//
// Everything is gated by STREAM_FEATURE_ENABLED and wrapped in try/catch so a
// failure in Stream (e.g. uiohook-napi fails to load) cannot crash the rest of
// the app.

import { createStreamOverlay, getStreamOverlay, showStreamOverlay, hideStreamOverlay, destroyStreamOverlay } from './overlay-window';
import { HotkeyService, defaultHotkeyForPlatform } from './hotkey-service';
import { registerStreamIpcHandlers } from './ipc-handlers';

// Feature kill switch. Flipping this to false and shipping a patch release
// instantly disables all Stream functionality. The UI check in MeetingBotHub
// mirrors this so the button doesn't render either.
export const STREAM_FEATURE_ENABLED = true;

let hotkeyService: HotkeyService | null = null;
let initialized = false;

export function initializeStream(): void {
  if (!STREAM_FEATURE_ENABLED) {
    console.log('[Stream] Feature disabled via kill switch');
    return;
  }
  if (initialized) {
    console.warn('[Stream] initializeStream called twice');
    return;
  }

  try {
    // 1. Check that the native hook is available. If not, we still register
    //    the IPC handlers so the main-window UI can show a "feature unavailable"
    //    state instead of appearing frozen.
    const hookAvailable = HotkeyService.isAvailable();
    if (!hookAvailable) {
      console.warn('[Stream] uiohook-napi not available — Stream will be inactive');
    }

    // 2. Pre-create overlay window off-screen so showing it on hotkey press is instant
    createStreamOverlay();

    // 3. Create the hotkey service and wire up events, but do NOT start yet.
    //    The user's toggle in the Stream modal controls whether the hook runs.
    //    When the user enables Stream, the renderer calls stream:set-enabled(true)
    //    which calls hotkeyService.start(). Default is OFF for new users.
    hotkeyService = new HotkeyService();
    hotkeyService.on('hotkey-down', () => {
      const overlay = getStreamOverlay();
      if (!overlay || overlay.isDestroyed()) return;
      showStreamOverlay();
      overlay.webContents.send('stream:hotkey-down');
    });
    hotkeyService.on('hotkey-up', () => {
      const overlay = getStreamOverlay();
      if (!overlay || overlay.isDestroyed()) return;
      overlay.webContents.send('stream:hotkey-up');
    });

    // 4. Register main-process IPC handlers (always, even if the hook failed)
    registerStreamIpcHandlers({ hotkeyService: hotkeyService! });

    initialized = true;
    console.log('[Stream] Initialized');
  } catch (err) {
    console.error('[Stream] Failed to initialize:', err);
    // Best-effort cleanup so we don't leak a half-initialized state
    try {
      hotkeyService?.stop();
    } catch {
      // swallow
    }
    try {
      destroyStreamOverlay();
    } catch {
      // swallow
    }
    hotkeyService = null;
    initialized = false;
  }
}

export function shutdownStream(): void {
  if (!STREAM_FEATURE_ENABLED) return;
  if (!initialized) return;

  try {
    hotkeyService?.stop();
  } catch (err) {
    console.error('[Stream] hotkeyService.stop failed:', err);
  }

  try {
    hideStreamOverlay();
    destroyStreamOverlay();
  } catch (err) {
    console.error('[Stream] destroyStreamOverlay failed:', err);
  }

  hotkeyService = null;
  initialized = false;
  console.log('[Stream] Shutdown complete');
}
