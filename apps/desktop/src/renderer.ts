/**
 * Renderer entry point - initializes React app
 * Note: We use email-based login instead of Clerk in the desktop app
 * because Clerk's dynamic script loading doesn't work well in Electron
 */

// Sentry renderer SDK piggybacks on the main-process SDK via IPC, so
// no DSN config needed here — just init() to register the error
// handler that forwards thrown React/window errors back to main.
import * as Sentry from '@sentry/electron/renderer';
Sentry.init({});

import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './renderer/App';

console.log('[Renderer] Starting Sequ3nce desktop app...');

// Set correct window size BEFORE React mounts to prevent flash of small 400x600 window.
// If the user has a saved session and was previously in bot mode, resize to 1200x800
// immediately so the window is the right size when ready-to-show fires.
try {
  const savedInfo = localStorage.getItem('sequ3nce_closer_info');
  const savedBotMode = localStorage.getItem('sequ3nce_bot_mode');
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
