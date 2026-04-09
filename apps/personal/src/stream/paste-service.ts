// Stream paste service — writes transcribed text to the clipboard and synthesizes
// Cmd+V (macOS) / Ctrl+V (Windows) into the currently-focused app, then restores
// the user's original clipboard contents after a short delay.
//
// Uses Electron's built-in clipboard module + uiohook-napi's keyTap for keystroke
// simulation. This avoids adding robotjs (abandoned since 2019) as a dependency.

import { clipboard } from 'electron';

// Delay before restoring the user's original clipboard contents.
// Must be long enough for the target app to actually receive the paste event.
// 400ms is the same margin CypherKey uses and works reliably on slow apps like Word.
const CLIPBOARD_RESTORE_DELAY_MS = 400;

let _uiohook: typeof import('uiohook-napi') | null = null;
function loadUiohook() {
  if (_uiohook) return _uiohook;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _uiohook = require('uiohook-napi');
    return _uiohook;
  } catch (err) {
    console.error('[Stream] paste-service failed to load uiohook-napi:', err);
    return null;
  }
}

/**
 * Paste the given text into the focused app.
 *
 * Flow:
 *   1. Capture the user's current clipboard contents (text + image if any).
 *   2. Write `text` to the clipboard.
 *   3. Simulate the platform paste shortcut (Cmd+V on darwin, Ctrl+V elsewhere).
 *   4. After a short delay, restore the original clipboard.
 */
export async function pasteText(text: string): Promise<void> {
  if (!text) return;

  const mod = loadUiohook();
  if (!mod) {
    throw new Error('uiohook-napi not available — cannot simulate paste keystroke');
  }
  const { uIOhook, UiohookKey } = mod;

  // Snapshot the previous clipboard so we can restore it later.
  // We capture text AND image separately because clipboard.readImage() returns
  // an empty NativeImage if the clipboard doesn't hold one (so it's safe to call).
  const previousText = clipboard.readText();
  const previousHtml = clipboard.readHTML();
  const previousImage = clipboard.readImage();

  clipboard.writeText(text);

  // Synthesize the paste shortcut. uiohook-napi's keyTap sends the modifier(s) down,
  // taps the target key, then releases the modifier(s).
  const modifierKey = process.platform === 'darwin' ? UiohookKey.Meta : UiohookKey.Ctrl;
  try {
    uIOhook.keyTap(UiohookKey.V, [modifierKey]);
  } catch (err) {
    console.error('[Stream] keyTap failed:', err);
    // Restore clipboard immediately if we couldn't paste — otherwise the user
    // is stuck with the transcribed text sitting on their clipboard.
    clipboard.writeText(previousText);
    throw err;
  }

  // Restore the user's clipboard after the paste has had time to land.
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      try {
        // Prefer rich content if the original clipboard had it.
        if (!previousImage.isEmpty()) {
          clipboard.writeImage(previousImage);
        } else if (previousHtml && previousHtml !== previousText) {
          clipboard.write({ text: previousText, html: previousHtml });
        } else {
          clipboard.writeText(previousText);
        }
      } catch (restoreErr) {
        console.error('[Stream] Failed to restore clipboard:', restoreErr);
      }
      resolve();
    }, CLIPBOARD_RESTORE_DELAY_MS);
  });
}
