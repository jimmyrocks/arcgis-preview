import React from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Extent } from '../../lib/types/arcgis-rest';
import { extentToBounds } from '../../lib/geometry';

export default function ExtentMiniMap({ extent, height = 120 }: { extent?: Extent | null; height?: number }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const bounds = extentToBounds(extent || null);
    if (!bounds) return;
    if (!containerRef.current) return;

    // Get computed CSS variable values
    const computedStyle = getComputedStyle(document.documentElement);
    const accentColor = computedStyle.getPropertyValue('--accent').trim() || '#2563eb';
    const bgColor = computedStyle.getPropertyValue('--panel-subtle').trim() || '#f8fafc';

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': bgColor } }]
      },
      interactive: false,
      attributionControl: false,
      dragPan: false,
      scrollZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false
    });
    map.on('load', () => {
      try {
        map.addSource('mini-basemap', {
          type: 'raster',
          tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        } as any);
        map.addLayer({ id: 'mini-basemap-layer', type: 'raster', source: 'mini-basemap' });
        const sw = bounds.sw.toArray();
        const ne = bounds.ne.toArray();
        const poly = {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [sw[0], sw[1]],
              [ne[0], sw[1]],
              [ne[0], ne[1]],
              [sw[0], ne[1]],
              [sw[0], sw[1]]
            ]]
          },
          properties: {}
        };
        map.addSource('mini-extent', { type: 'geojson', data: poly } as any);
        map.addLayer({
          id: 'mini-extent-outline',
          type: 'line',
          source: 'mini-extent',
          paint: { 'line-color': accentColor, 'line-width': 2 }
        });
        map.fitBounds(bounds.toMaplibre(), { padding: 6, duration: 0 });
      } catch {}
    });
    return () => { try { map.remove(); } catch {} };
  }, [extent]);

  if (!extent) return null;
  return <div ref={containerRef} style={{ width: '100%', height, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }} />;
}
