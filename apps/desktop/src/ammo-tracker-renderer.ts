// Ammo Tracker Window - Entry point
import './index.css';

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { AmmoTrackerApp } from './renderer/AmmoTrackerApp';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(createElement(AmmoTrackerApp));
}
