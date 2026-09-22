import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { GROUND } from './lib/ground';
import './styles/global.css';

/*
  Set before React renders, and on <html> rather than on the app root, so the
  page background is right from the first paint. Put on the app root it would
  flash the paper ground for a frame on the one screen that is already dark.
*/
document.documentElement.setAttribute('data-ground', GROUND);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
