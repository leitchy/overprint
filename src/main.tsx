import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { initPwa } from './stores/pwa-store';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Register the service worker and wire the install prompt (no-op if unsupported).
initPwa();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
