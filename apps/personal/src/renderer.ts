/**
 * Renderer entry point - initializes React app
 * Note: We use email-based login instead of Clerk in the desktop app
 * because Clerk's dynamic script loading doesn't work well in Electron
 */

// Sentry renderer SDK piggybacks on the main-process SDK via IPC, so
// no DSN config needed here — just init() to register the error
// handler that forwards thrown React/window errors back to main.
import * as Sentry from '@sentry/electron/renderer';

// Capture launch time at module load so beforeSend can suppress network
// errors that fire before the OS has finished bringing wifi up on a
// cold boot. Observed in production: app launched within ~1s of OS
// boot fired 5+ "Failed to fetch" errors at startup because the
// network stack wasn't ready yet. None were real bugs.
const APP_LAUNCH_TIME = Date.now();
const LAUNCH_NETWORK_GRACE_MS = 15_000;

Sentry.init({
  // Drop "Failed to fetch" errors when the device is in a transient
  // network state — offline, mid-sleep/wake, or freshly launched
  // before the network stack is up. The existing graceful-degrade UX
  // (every silent catch returns null/empty and the UI shows a retry
  // affordance) already handles these for the user; sending them to
  // Sentry just produces noise. Real fetch failures while online AND
  // past the launch grace still flow through.
  beforeSend(event, hint) {
    const err = hint?.originalException;
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : '';

    if (err instanceof TypeError && /Failed to fetch/i.test(message)) {
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false;
      const justLaunched =
        Date.now() - APP_LAUNCH_TIME < LAUNCH_NETWORK_GRACE_MS;
      if (offline || justLaunched) {
        return null;
      }
    }

    return event;
  },
});

import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './renderer/App';

console.log('[Renderer] Starting Sequ3nce Personal app...');

// Set correct window size BEFORE React mounts to prevent flash of small 400x600 window.
// If the user has a saved session and was previously in bot mode, resize to 1200x800
// immediately so the window is the right size when ready-to-show fires.
try {
  const savedInfo = localStorage.getItem('sequ3nce_personal_info');
  const savedBotMode = localStorage.getItem('sequ3nce_personal_bot_mode');
  if (savedInfo && savedBotMode === 'true') {
    window.electron?.app?.setWindowSize?.(1200, 800);
    console.log('[Renderer] Pre-sized window to 1200x800 (saved bot mode)');
  }
} catch (e) {
  // Ignore — localStorage may not be available
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(React.createElement(App));

// Reveal UI after React mounts (prevents flash of stale cached UI during hot reload)
requestAnimationFrame(() => {
  (window as any).__showRoot?.();
});

console.log('[Renderer] App mounted');
