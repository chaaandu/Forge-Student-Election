import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SpeechesWall } from './screens/SpeechesWall';
import './styles/wall.css';

/*
  A separate entry from the ballot on purpose.

  This page is projected in a hall while candidates speak; the kiosk is what a
  voter touches. Sharing an entry would put a 3D scene in the voting bundle and
  the voting machine in the projector's, and neither wants the other.
*/
const root = document.getElementById('wall');
if (!root) throw new Error('Missing #wall element');

createRoot(root).render(
  <StrictMode>
    <SpeechesWall />
  </StrictMode>,
);
