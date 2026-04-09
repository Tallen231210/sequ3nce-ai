// Stream hotkey service — listens for a hold-to-talk hotkey and emits
// 'hotkey-down' / 'hotkey-up' events.
//
// Cross-platform strategy:
//   - macOS: native dylib via koffi that uses CGEventTap to capture the Fn
//     (globe) key. This is the same approach CypherKey uses, ported into
//     apps/personal/native/stream-hotkey/. We poll the dylib at ~120fps so
//     down/up latency is invisible to the user. Required because libuiohook
//     (uiohook-napi) does not expose the Fn modifier on macOS.
//   - Windows: uiohook-napi listening for Right Control hold. uiohook-napi
//     surfaces standard Windows keyboard events including the right modifier
//     keys, so the existing approach works fine here.

import { EventEmitter } from 'events';
import type { UiohookKeyboardEvent } from 'uiohook-napi';
import { loadStreamHotkeyNative, type StreamHotkeyNative } from './native-loader';

// Default per-platform hotkey:
//   - macOS: Fn (globe). Always. The native dylib only knows how to capture Fn.
//   - Windows: RightControl. Reasonable single-modifier default; user can
//     rebind via the Settings tab to RightAlt / RightShift / etc.
export const DEFAULT_HOTKEY_MAC = 'Fn';
export const DEFAULT_HOTKEY_WIN = 'RightControl';

export function defaultHotkeyForPlatform(): string {
  return process.platform === 'darwin' ? DEFAULT_HOTKEY_MAC : DEFAULT_HOTKEY_WIN;
}

// Native macOS poll interval. 8ms = 125fps. The native dylib stores at most
// one event between polls, so we want this fast enough that a real hold can't
// be missed (a tap shorter than 8ms won't ever happen with a finger).
const MACOS_POLL_INTERVAL_MS = 8;

// Polling event codes (matched in apps/personal/native/stream-hotkey/stream-hotkey-macos.c)
const NATIVE_EVENT_FN_DOWN = 1;
const NATIVE_EVENT_FN_UP = 2;

// uiohook lazy loader (Windows only)
let _uiohook: typeof import('uiohook-napi') | null = null;
function loadUiohook(): typeof import('uiohook-napi') | null {
  if (_uiohook) return _uiohook;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _uiohook = require('uiohook-napi');
    return _uiohook;
  } catch (err) {
    console.error('[Stream] Failed to load uiohook-napi:', err);
    return null;
  }
}

export type HotkeyEvents = {
  'hotkey-down': [];
  'hotkey-up': [];
};

export class HotkeyService extends EventEmitter {
  private started = false;

  // macOS native path
  private macNative: StreamHotkeyNative | null = null;
  private macPollInterval: NodeJS.Timeout | null = null;

  // Windows uiohook path
  private winCurrentKeycode: number | null = null;
  private winIsDown = false;
  private winOnKeyDown: ((e: UiohookKeyboardEvent) => void) | null = null;
  private winOnKeyUp: ((e: UiohookKeyboardEvent) => void) | null = null;

  /** Returns true if the platform-appropriate hotkey backend is loadable. */
  static isAvailable(): boolean {
    if (process.platform === 'darwin') {
      return loadStreamHotkeyNative() !== null;
    }
    // Windows / Linux: uiohook-napi
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('uiohook-napi');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve a hotkey name into a uiohook keycode (Windows only).
   * macOS hotkey is hardcoded to Fn so this returns null on darwin.
   */
  static resolveWindowsKeycode(name: string): number | null {
    const mod = loadUiohook();
    if (!mod) return null;
    const { UiohookKey } = mod;
    const map: Record<string, number> = {
      RightControl: UiohookKey.CtrlRight,
      RightCtrl: UiohookKey.CtrlRight,
      LeftControl: UiohookKey.Ctrl,
      LeftCtrl: UiohookKey.Ctrl,
      RightAlt: UiohookKey.AltRight,
      RightOption: UiohookKey.AltRight,
      LeftAlt: UiohookKey.Alt,
      LeftOption: UiohookKey.Alt,
      RightShift: UiohookKey.ShiftRight,
      LeftShift: UiohookKey.Shift,
      RightMeta: UiohookKey.MetaRight,
      LeftMeta: UiohookKey.Meta,
      CapsLock: UiohookKey.CapsLock,
      F13: UiohookKey.F13,
      F14: UiohookKey.F14,
      F15: UiohookKey.F15,
      F16: UiohookKey.F16,
    };
    return map[name] ?? null;
  }

  /** Start listening for the configured hotkey. */
  start(hotkeyName: string = defaultHotkeyForPlatform()): void {
    if (this.started) return;

    if (process.platform === 'darwin') {
      this.startMacOs();
    } else {
      this.startWindows(hotkeyName);
    }
  }

  private startMacOs(): void {
    const native = loadStreamHotkeyNative();
    if (!native) {
      throw new Error('macOS Fn hotkey native dylib failed to load');
    }
    this.macNative = native;
    native.start();

    this.macPollInterval = setInterval(() => {
      if (!this.macNative) return;
      const event = this.macNative.poll();
      if (event === NATIVE_EVENT_FN_DOWN) {
        this.emit('hotkey-down');
      } else if (event === NATIVE_EVENT_FN_UP) {
        this.emit('hotkey-up');
      }
    }, MACOS_POLL_INTERVAL_MS);

    this.started = true;
    console.log('[Stream] Hotkey service started (macOS Fn via CGEventTap)');
  }

  private startWindows(hotkeyName: string): void {
    const mod = loadUiohook();
    if (!mod) {
      throw new Error('uiohook-napi is not available on this platform');
    }

    const keycode = HotkeyService.resolveWindowsKeycode(hotkeyName);
    if (keycode == null) {
      throw new Error(`Unknown Stream hotkey: ${hotkeyName}`);
    }
    this.winCurrentKeycode = keycode;

    this.winOnKeyDown = (event: UiohookKeyboardEvent) => {
      if (event.keycode !== this.winCurrentKeycode) return;
      // libuiohook repeats keydown events while held; debounce so we only
      // fire 'hotkey-down' on the *initial* press.
      if (this.winIsDown) return;
      this.winIsDown = true;
      this.emit('hotkey-down');
    };
    this.winOnKeyUp = (event: UiohookKeyboardEvent) => {
      if (event.keycode !== this.winCurrentKeycode) return;
      if (!this.winIsDown) return;
      this.winIsDown = false;
      this.emit('hotkey-up');
    };

    mod.uIOhook.on('keydown', this.winOnKeyDown);
    mod.uIOhook.on('keyup', this.winOnKeyUp);
    mod.uIOhook.start();

    this.started = true;
    console.log(`[Stream] Hotkey service started (Windows ${hotkeyName} via uiohook-napi)`);
  }

  /** Rebind to a different hotkey. macOS is locked to Fn — calls are no-ops. */
  rebind(hotkeyName: string): void {
    if (process.platform === 'darwin') {
      // macOS: only Fn is supported in v1. The Settings tab hides the picker on mac.
      console.log('[Stream] Rebind ignored — macOS hotkey is locked to Fn');
      return;
    }

    const keycode = HotkeyService.resolveWindowsKeycode(hotkeyName);
    if (keycode == null) {
      throw new Error(`Unknown Stream hotkey: ${hotkeyName}`);
    }
    this.winCurrentKeycode = keycode;
    this.winIsDown = false;
    console.log(`[Stream] Hotkey rebound to ${hotkeyName} -> keycode ${keycode}`);
  }

  /** Stop listening and tear down the backend. Safe to call multiple times. */
  stop(): void {
    if (!this.started) return;

    if (process.platform === 'darwin') {
      if (this.macPollInterval) {
        clearInterval(this.macPollInterval);
        this.macPollInterval = null;
      }
      try {
        this.macNative?.stop();
      } catch (err) {
        console.error('[Stream] macNative.stop failed:', err);
      }
      this.macNative = null;
    } else {
      const mod = loadUiohook();
      try {
        if (this.winOnKeyDown) mod?.uIOhook.off('keydown', this.winOnKeyDown);
        if (this.winOnKeyUp) mod?.uIOhook.off('keyup', this.winOnKeyUp);
        mod?.uIOhook.stop();
      } catch (err) {
        console.error('[Stream] uiohook stop failed:', err);
      }
      this.winOnKeyDown = null;
      this.winOnKeyUp = null;
      this.winIsDown = false;
    }

    this.started = false;
    console.log('[Stream] Hotkey service stopped');
  }
}
