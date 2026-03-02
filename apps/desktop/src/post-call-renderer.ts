// Post-Call Questionnaire Window - Entry point
import './index.css';

import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { PostCallWindowApp } from './renderer/PostCallWindowApp';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(createElement(PostCallWindowApp));
}
