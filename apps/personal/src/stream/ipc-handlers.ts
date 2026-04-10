// Stream IPC handlers — all ipcMain surface for the dictation feature, isolated
// here so the main index.ts stays clean. Called once from initializeStream().

import { ipcMain, systemPreferences, shell, app } from 'electron';
import { pasteText } from './paste-service';
import { getStreamOverlay, hideStreamOverlay } from './overlay-window';
import { HotkeyService } from './hotkey-service';
import { loadStreamHotkeyNative } from './native-loader';

interface StreamDeps {
  hotkeyService: HotkeyService;
}

// The signed-in B2C user id that the main window has told us about.
// Required so the overlay can attribute transcriptions to the right user when
// it POSTs to /b2c/stream/transcribe. Updated via stream:set-user-id from the
// main window, cleared to null on logout.
let currentUserId: string | null = null;

export function getCurrentStreamUserId(): string | null {
  return currentUserId;
}

export function setCurrentStreamUserId(userId: string | null): void {
  currentUserId = userId;
  // Push the new value to the overlay window so its React state can refresh.
  const overlay = getStreamOverlay();
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('stream:user-id-changed', userId);
  }
}

/**
 * Register the complete set of IPC channels used by the Stream feature.
 * Must be called exactly once (subsequent calls log a warning and noop).
 */
let registered = false;
export function registerStreamIpcHandlers(deps: StreamDeps): void {
  if (registered) {
    console.warn('[Stream] IPC handlers already registered');
    return;
  }
  registered = true;

  // --- Overlay → main: paste the transcribed text into the focused app ---
  ipcMain.handle('stream:paste-text', async (_event, text: unknown) => {
    if (typeof text !== 'string' || text.length === 0) {
      return { success: false, error: 'Invalid text' };
    }
    try {
      await pasteText(text);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Paste failed';
      console.error('[Stream] Paste failed:', msg);
      return { success: false, error: msg };
    }
  });

  // --- Overlay → main: hide the overlay window ---
  ipcMain.handle('stream:hide-overlay', async () => {
    hideStreamOverlay();
    return { success: true };
  });

  // --- Main-window → main: check macOS accessibility + microphone permissions ---
  ipcMain.handle('stream:check-permissions', async () => {
    const result: {
      microphone: boolean;
      accessibility: boolean;
      platform: NodeJS.Platform;
    } = {
      microphone: true, // non-mac platforms don't require explicit per-app mic perm at this layer
      accessibility: true,
      platform: process.platform,
    };

    if (process.platform === 'darwin') {
      // "granted" | "denied" | "restricted" | "not-determined" | "unknown"
      const micStatus = systemPreferences.getMediaAccessStatus('microphone');
      result.microphone = micStatus === 'granted';
      // isTrustedAccessibilityClient(false) returns status without popping the prompt.
      result.accessibility = systemPreferences.isTrustedAccessibilityClient(false);
    }

    return result;
  });

  // --- Main-window → main: request microphone permission (macOS) ---
  ipcMain.handle('stream:request-microphone', async () => {
    if (process.platform !== 'darwin') return { granted: true };
    const granted = await systemPreferences.askForMediaAccess('microphone');
    return { granted };
  });

  // --- Main-window → main: open macOS accessibility pref pane ---
  // Also pops the system prompt once via isTrustedAccessibilityClient(true) which
  // adds our app to the Accessibility list with a "denied" state — giving the user
  // a visible checkbox to flip.
  ipcMain.handle('stream:request-accessibility', async () => {
    if (process.platform !== 'darwin') return { opened: false };
    // Trigger the system prompt first (adds app to the list if missing)
    try {
      systemPreferences.isTrustedAccessibilityClient(true);
    } catch (err) {
      console.error('[Stream] isTrustedAccessibilityClient threw:', err);
    }
    // Then open the accessibility pane directly so the user can flip our checkbox
    await shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
    );
    return { opened: true };
  });

  // --- Main-window → main: rebind the Stream hotkey on the fly ---
  ipcMain.handle('stream:rebind-hotkey', async (_event, hotkeyName: unknown) => {
    if (typeof hotkeyName !== 'string') {
      return { success: false, error: 'hotkeyName must be a string' };
    }
    try {
      deps.hotkeyService.rebind(hotkeyName);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rebind failed';
      return { success: false, error: msg };
    }
  });

  // --- Main-window → main: get the currently-running Stream feature state ---
  ipcMain.handle('stream:get-status', async () => {
    const overlay = getStreamOverlay();
    return {
      overlayReady: !!overlay && !overlay.isDestroyed(),
      hotkeyAvailable: HotkeyService.isAvailable(),
      appVersion: app.getVersion(),
    };
  });

  // --- Main-window → main: push the signed-in user id into main + overlay ---
  // Called when the user logs in/out from the renderer so the overlay can
  // attribute transcriptions correctly.
  ipcMain.handle('stream:set-user-id', async (_event, userId: unknown) => {
    if (userId !== null && typeof userId !== 'string') {
      return { success: false, error: 'userId must be a string or null' };
    }
    setCurrentStreamUserId(userId);
    return { success: true };
  });

  // --- Overlay → main: fetch the current user id on mount ---
  ipcMain.handle('stream:get-user-id', async () => {
    return currentUserId;
  });

  // --- Main-window → main: enable/disable the hotkey hook at runtime ---
  // Called when the user flips the toggle in the Stream modal. When disabled,
  // the CGEventTap (macOS) or uiohook (Windows) stops completely — no Fn
  // capture, no audio, no overlay.
  ipcMain.handle('stream:set-enabled', async (_event, enabled: unknown) => {
    console.log('[Stream] set-enabled IPC received:', enabled);
    if (typeof enabled !== 'boolean') {
      return { success: false, error: 'enabled must be a boolean' };
    }
    try {
      if (enabled) {
        console.log('[Stream] Starting hotkey service...');
        deps.hotkeyService.start();
        console.log('[Stream] Hotkey service start() returned');
      } else {
        console.log('[Stream] Stopping hotkey service...');
        deps.hotkeyService.stop();
      }
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle';
      console.error('[Stream] set-enabled failed:', msg);
      return { success: false, error: msg };
    }
  });
}
