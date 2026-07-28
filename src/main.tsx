import React from 'react';
import { createRoot } from 'react-dom/client';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import App from './App';

setWorkerUrl(maplibreWorkerUrl);

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
createRoot(root).render(<App />);
