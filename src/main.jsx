import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import LyricContour from './components/LyricContour.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LyricContour />
  </StrictMode>,
);
