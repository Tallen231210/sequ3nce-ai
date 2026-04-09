// Resolves and loads the macOS-only Sequ3nce Stream native dylibs (Fn hotkey
// hook + paste simulator) via koffi. The dylibs are built by
// scripts/build-native.sh and shipped via forge.config.ts extraResource.
//
// On non-darwin platforms this module's loaders return null — callers should
// fall back to the cross-platform uiohook-napi path.

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let _koffi: typeof import('koffi') | null = null;
function loadKoffi(): typeof import('koffi') | null {
  if (_koffi) return _koffi;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _koffi = require('koffi');
    return _koffi;
  } catch (err) {
    console.error('[Stream] Failed to load koffi:', err);
    return null;
  }
}

/**
 * Resolve the absolute path of a native dylib for the Stream feature.
 * Works in both dev (apps/personal/native/...) and packaged (Resources/native/...) builds.
 */
export function resolveNativePath(folder: string, file: string): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'native', folder, file);
  }
  // In dev, the main bundle lives at .webpack/main/, so we walk up to apps/personal/
  return path.join(__dirname, '..', '..', 'native', folder, file);
}

// ---------- stream-hotkey (macOS Fn key via CGEventTap) ----------

export interface StreamHotkeyNative {
  start(): void;
  poll(): number;
  stop(): void;
  checkPermission(): number;
}

let _hotkeyNative: StreamHotkeyNative | null = null;
let _hotkeyLoadAttempted = false;

export function loadStreamHotkeyNative(): StreamHotkeyNative | null {
  if (_hotkeyNative) return _hotkeyNative;
  if (_hotkeyLoadAttempted) return null;
  _hotkeyLoadAttempted = true;

  if (process.platform !== 'darwin') return null;

  const koffi = loadKoffi();
  if (!koffi) return null;

  const dylibPath = resolveNativePath('stream-hotkey', 'stream-hotkey.dylib');
  if (!fs.existsSync(dylibPath)) {
    console.error('[Stream] stream-hotkey.dylib not found at', dylibPath);
    return null;
  }

  try {
    const lib = koffi.load(dylibPath);
    _hotkeyNative = {
      start: lib.func('void stream_hotkey_start()') as () => void,
      poll: lib.func('int stream_hotkey_poll()') as () => number,
      stop: lib.func('void stream_hotkey_stop()') as () => void,
      checkPermission: lib.func('int stream_hotkey_check_permission()') as () => number,
    };
    console.log('[Stream] Loaded stream-hotkey.dylib');
    return _hotkeyNative;
  } catch (err) {
    console.error('[Stream] Failed to bind stream-hotkey symbols:', err);
    return null;
  }
}

// ---------- paste-simulator (macOS Cmd+V via CGEventPost) ----------

export interface PasteSimulatorNative {
  simulatePaste(): void;
}

let _pasteNative: PasteSimulatorNative | null = null;
let _pasteLoadAttempted = false;

export function loadPasteSimulatorNative(): PasteSimulatorNative | null {
  if (_pasteNative) return _pasteNative;
  if (_pasteLoadAttempted) return null;
  _pasteLoadAttempted = true;

  if (process.platform !== 'darwin') return null;

  const koffi = loadKoffi();
  if (!koffi) return null;

  const dylibPath = resolveNativePath('paste-simulator', 'paste-simulator.dylib');
  if (!fs.existsSync(dylibPath)) {
    console.error('[Stream] paste-simulator.dylib not found at', dylibPath);
    return null;
  }

  try {
    const lib = koffi.load(dylibPath);
    _pasteNative = {
      simulatePaste: lib.func('void stream_simulate_paste()') as () => void,
    };
    console.log('[Stream] Loaded paste-simulator.dylib');
    return _pasteNative;
  } catch (err) {
    console.error('[Stream] Failed to bind paste-simulator symbols:', err);
    return null;
  }
}
