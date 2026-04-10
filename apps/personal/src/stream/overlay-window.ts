// Stream overlay window — a small, transparent, always-on-top window that shows
// the waveform + recording state while the user is dictating. Pre-created off-screen
// at startup so showing it on hotkey press is instant (just a position move + showInactive).

import { BrowserWindow, screen } from 'electron';

// Webpack-injected constants from forge.config.ts renderer entry "stream_overlay"
declare const STREAM_OVERLAY_WEBPACK_ENTRY: string;
declare const STREAM_OVERLAY_PRELOAD_WEBPACK_ENTRY: string;

// Compact horizontal pill — logo + waveform + close button
const OVERLAY_WIDTH = 280;
const OVERLAY_HEIGHT = 60;

// Off-screen position used while the overlay is hidden. We use negative coords
// far off any plausible display instead of calling hide() because show() after
// hide() has a visible flash on some macOS versions.
const OFFSCREEN_X = -10_000;
const OFFSCREEN_Y = -10_000;

let overlayWindow: BrowserWindow | null = null;

export function getStreamOverlay(): BrowserWindow | null {
  return overlayWindow;
}

export function createStreamOverlay(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x: OFFSCREEN_X,
    y: OFFSCREEN_Y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: STREAM_OVERLAY_PRELOAD_WEBPACK_ENTRY,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  overlayWindow.loadURL(STREAM_OVERLAY_WEBPACK_ENTRY);

  // NOTE: Do NOT showInactive()+hide() here for pre-rendering. That pattern
  // breaks the app's macOS dock indicator and activation state — the app loses
  // its dock dot and can't be focused via Cmd+Tab. The overlay renders on
  // first actual show instead; any brief flash is acceptable.

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

/**
 * Move the overlay to the bottom-center of the primary display and show it
 * without stealing focus. Safe to call from the hotkey-down handler.
 */
export function showStreamOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createStreamOverlay();
  }
  if (!overlayWindow) return;

  const primary = screen.getPrimaryDisplay();
  const workArea = primary.workArea;
  const x = Math.round(workArea.x + (workArea.width - OVERLAY_WIDTH) / 2);
  const y = Math.round(workArea.y + workArea.height - OVERLAY_HEIGHT - 40); // compact pill near the bottom

  overlayWindow.setPosition(x, y);
  overlayWindow.showInactive();
}

export function hideStreamOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  // Move off-screen first so the hide transition doesn't flicker the old position
  // on the next show.
  overlayWindow.hide();
  overlayWindow.setPosition(OFFSCREEN_X, OFFSCREEN_Y);
}

export function destroyStreamOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
  }
  overlayWindow = null;
}
