// Stream Overlay Window — Entry point
import './index.css';

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { StreamOverlayApp } from './renderer/stream-overlay/StreamOverlayApp';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(createElement(StreamOverlayApp));
}
