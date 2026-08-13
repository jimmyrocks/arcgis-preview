import React from 'react';
import { createRoot } from 'react-dom/client';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import App from './App';

setWorkerUrl(maplibreWorkerUrl);

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');
const experiment = new URLSearchParams(location.search).get('experiment');
if (experiment === 'geojson-vs-tiles') {
  const GeoJSONVsTilesExperiment = React.lazy(() => import('./experiments/GeoJSONVsTilesExperiment'));
  createRoot(root).render(
    <React.Suspense fallback={<div style={{ padding: 16, fontFamily: 'system-ui, sans-serif' }}>Loading source comparison…</div>}>
      <GeoJSONVsTilesExperiment />
    </React.Suspense>
  );
} else {
  createRoot(root).render(<App />);
}
