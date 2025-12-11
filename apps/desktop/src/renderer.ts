/**
 * Renderer entry point - initializes React app
 * Note: We use email-based login instead of Clerk in the desktop app
 * because Clerk's dynamic script loading doesn't work well in Electron
 */

import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './renderer/App';

console.log('[Renderer] Starting Seq3nce desktop app...');

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(React.createElement(App));

console.log('[Renderer] App mounted');
