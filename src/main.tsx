import React from 'react';
import { createRoot } from 'react-dom/client';
// Ensure Esri Leaflet attaches to window.L before loading the PBF plugin
import 'esri-leaflet';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
createRoot(root).render(<App />);
