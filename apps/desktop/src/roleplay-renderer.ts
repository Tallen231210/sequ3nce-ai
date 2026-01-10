// Role Play Room Window - Entry point
import './index.css';

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { RolePlayApp } from './renderer/RolePlayApp';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(createElement(RolePlayApp));
}
