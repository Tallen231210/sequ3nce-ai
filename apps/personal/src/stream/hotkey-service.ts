// Stream hotkey service — listens for a configurable hold-to-talk hotkey via uiohook-napi
// and fires start/stop callbacks. Uses uiohook-napi because Electron's built-in globalShortcut
// can't detect single-modifier key holds like Right Control.

import { EventEmitter } from 'events';
import type { UiohookKeyboardEvent } from 'uiohook-napi';

// Default hotkey — Right Control on both macOS and Windows.
// uiohook-napi maps keys to libuiohook keycodes. CtrlRight = 0x0E1D (3613).
//
// Note: Apple's Fn key cannot be reliably captured by libuiohook on macOS because
// Apple treats it as a hardware-level modifier, not a keyboard event. We ship
// Right Control as a safe default that works cross-platform; users can customize
// the binding in the Stream settings tab in a future iteration.
export const DEFAULT_HOTKEY_NAME = 'RightControl';

// Keycode lookup. We tolerate missing uiohook-napi (lazy load) so the rest of the app
// still boots if the native module fails to compile.
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
  private currentKeycode: number | null = null;
  private isDown = false;
  // Track raw uiohook-napi listeners so we can remove them on shutdown.
  private onKeyDown: ((e: UiohookKeyboardEvent) => void) | null = null;
  private onKeyUp: ((e: UiohookKeyboardEvent) => void) | null = null;

  /**
   * Resolve a human-readable hotkey name (e.g. "RightControl") into its libuiohook keycode.
   * Returns null if the name is unknown.
   */
  static resolveKeycode(name: string): number | null {
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
      RightCommand: UiohookKey.MetaRight,
      LeftMeta: UiohookKey.Meta,
      LeftCommand: UiohookKey.Meta,
      CapsLock: UiohookKey.CapsLock,
      F13: UiohookKey.F13,
      F14: UiohookKey.F14,
      F15: UiohookKey.F15,
      F16: UiohookKey.F16,
      F17: UiohookKey.F17,
      F18: UiohookKey.F18,
      F19: UiohookKey.F19,
    };
    return map[name] ?? null;
  }

  /** Returns true if uiohook-napi is available on this platform/build. */
  static isAvailable(): boolean {
    return loadUiohook() !== null;
  }

  /**
   * Start listening for the configured hotkey. Subsequent calls with a different
   * hotkey name will rebind without restarting the underlying hook.
   */
  start(hotkeyName: string = DEFAULT_HOTKEY_NAME): void {
    const mod = loadUiohook();
    if (!mod) {
      throw new Error('uiohook-napi is not available on this platform');
    }

    const keycode = HotkeyService.resolveKeycode(hotkeyName);
    if (keycode == null) {
      throw new Error(`Unknown Stream hotkey: ${hotkeyName}`);
    }
    this.currentKeycode = keycode;

    // Attach listeners once; we keep the keycode in a field so rebinding doesn't
    // require tearing down the hook.
    if (!this.started) {
      this.onKeyDown = (event: UiohookKeyboardEvent) => {
        if (event.keycode !== this.currentKeycode) return;
        // libuiohook repeats keydown events while held; debounce so we only
        // fire 'hotkey-down' on the *initial* press.
        if (this.isDown) return;
        this.isDown = true;
        this.emit('hotkey-down');
      };
      this.onKeyUp = (event: UiohookKeyboardEvent) => {
        if (event.keycode !== this.currentKeycode) return;
        if (!this.isDown) return;
        this.isDown = false;
        this.emit('hotkey-up');
      };

      mod.uIOhook.on('keydown', this.onKeyDown);
      mod.uIOhook.on('keyup', this.onKeyUp);
      mod.uIOhook.start();
      this.started = true;
      console.log(`[Stream] Hotkey service started (${hotkeyName} -> keycode ${keycode})`);
    } else {
      console.log(`[Stream] Hotkey rebound to ${hotkeyName} -> keycode ${keycode}`);
    }
  }

  /** Rebind to a different hotkey without stopping the native hook. */
  rebind(hotkeyName: string): void {
    const keycode = HotkeyService.resolveKeycode(hotkeyName);
    if (keycode == null) {
      throw new Error(`Unknown Stream hotkey: ${hotkeyName}`);
    }
    this.currentKeycode = keycode;
    this.isDown = false; // Reset hold state so a stale press doesn't trigger on the new key
    console.log(`[Stream] Hotkey rebound to ${hotkeyName} -> keycode ${keycode}`);
  }

  /** Stop listening and tear down the native hook. Safe to call multiple times. */
  stop(): void {
    if (!this.started) return;
    const mod = loadUiohook();
    try {
      if (this.onKeyDown) mod?.uIOhook.off('keydown', this.onKeyDown);
      if (this.onKeyUp) mod?.uIOhook.off('keyup', this.onKeyUp);
      mod?.uIOhook.stop();
    } catch (err) {
      console.error('[Stream] Error stopping hotkey service:', err);
    }
    this.started = false;
    this.isDown = false;
    this.onKeyDown = null;
    this.onKeyUp = null;
    console.log('[Stream] Hotkey service stopped');
  }
}
