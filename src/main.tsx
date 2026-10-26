import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { Root } from './app/root';
import { registerServiceWorker } from './lib/pwa';

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing.');

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

registerServiceWorker();
