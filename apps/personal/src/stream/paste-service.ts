// Stream paste service — writes transcribed text to the clipboard and synthesizes
// Cmd+V (macOS) / Ctrl+V (Windows) into the currently-focused app, then restores
// the user's original clipboard contents after a short delay.
//
// Cross-platform strategy mirrors hotkey-service.ts:
//   - macOS: native paste-simulator dylib that uses CGEventPost (ported from
//     CypherKey). More reliable than uiohook-napi's keyTap, and we already
//     ship a koffi-loaded dylib for the Fn hotkey.
//   - Windows: uiohook-napi's keyTap (Ctrl+V via libuiohook).

import { clipboard } from 'electron';
import { loadPasteSimulatorNative } from './native-loader';

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
 * Synthesize the platform paste shortcut into the focused app.
 * Throws if neither backend is available.
 */
function synthesizePasteKeystroke(): void {
  if (process.platform === 'darwin') {
    const native = loadPasteSimulatorNative();
    if (!native) {
      throw new Error('paste-simulator.dylib failed to load');
    }
    native.simulatePaste();
    return;
  }

  const mod = loadUiohook();
  if (!mod) {
    throw new Error('uiohook-napi not available — cannot simulate paste keystroke');
  }
  mod.uIOhook.keyTap(mod.UiohookKey.V, [mod.UiohookKey.Ctrl]);
}

/**
 * Paste the given text into the focused app.
 *
 * Flow:
 *   1. Capture the user's current clipboard contents (text + html + image).
 *   2. Write `text` to the clipboard.
 *   3. Synthesize the platform paste shortcut.
 *   4. After a short delay, restore the original clipboard.
 */
export async function pasteText(text: string): Promise<void> {
  if (!text) return;

  // Snapshot the previous clipboard so we can restore it later.
  const previousText = clipboard.readText();
  const previousHtml = clipboard.readHTML();
  const previousImage = clipboard.readImage();

  clipboard.writeText(text);

  try {
    synthesizePasteKeystroke();
  } catch (err) {
    console.error('[Stream] synthesizePasteKeystroke failed:', err);
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
