import React from 'react';
import { MapContainer, TileLayer, Rectangle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Extent } from '../../lib/types/arcgis-rest';
import { extentToBounds } from '../../lib/geometry';

function FitBounds({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  React.useEffect(() => {
    if (!bounds) return;
    try { map.fitBounds(bounds.pad(0.05)); } catch { }
  }, [map, bounds]);
  return null;
}

export default function ExtentMiniMap({ extent, height = 120 }: { extent?: Extent | null; height?: number }) {
  const bounds = React.useMemo(() => extentToBounds(extent as any), [extent]);
  if (!bounds) return null;
  const rect = [bounds.getSouthWest(), bounds.getNorthEast()] as any;
  return (
    <div style={{ width: '100%', height, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      <MapContainer
        style={{ width: '100%', height: '100%' }}
        center={bounds.getCenter()}
        zoom={3}
        zoomControl={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        dragging={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Rectangle bounds={rect} pathOptions={{ color: 'var(--accent)', weight: 2, fill: false }} />
        <FitBounds bounds={bounds} />
      </MapContainer>
    </div>
  );
}
