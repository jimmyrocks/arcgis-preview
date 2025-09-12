import React from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import type { FeatureCollection } from 'geojson';
import L from 'leaflet';
import { findFeatureById } from '../lib/ids';

type Props = {
  featureCollection?: FeatureCollection | null;
  hoverId?: string | number | null;
  selectedId?: string | number | null;
  zoomOnSelect?: boolean;
};

export default function HighlightOverlay({ featureCollection, hoverId, selectedId, zoomOnSelect = true }: Props) {
  const map = useMap();

  const hoverFeature = React.useMemo(() => findFeatureById(featureCollection as any, hoverId as any), [featureCollection, hoverId]);
  const selectedFeature = React.useMemo(() => findFeatureById(featureCollection as any, selectedId as any), [featureCollection, selectedId]);

  React.useEffect(() => {
    if (!zoomOnSelect) return;
    if (!selectedFeature) return;
    try {
      const g = L.geoJSON(selectedFeature as any);
      const b = g.getBounds();
      if (b && b.isValid()) {
        map.fitBounds(b.pad(0.2), { maxZoom: 14 });
      }
      g.remove();
    } catch {}
  }, [selectedFeature, map, zoomOnSelect]);

  return (
    <>
      {selectedFeature ? (
        <GeoJSON
          key={`selected-${String(selectedId)}`}
          data={selectedFeature as any}
          pane="highlight"
          style={{ color: 'var(--accent)', weight: 4, opacity: 0.95, fillColor: 'var(--accent)', fillOpacity: 0.15 }}
          interactive={false}
          bubblingMouseEvents={false as any}
        />
      ) : null}
      {hoverFeature && String(hoverId) !== String(selectedId) ? (
        <GeoJSON
          key={`hover-${String(hoverId)}`}
          data={hoverFeature as any}
          pane="highlight"
          style={{ color: '#ffd166', weight: 3, opacity: 0.9, dashArray: '4 3', fillColor: '#ffd166', fillOpacity: 0.08 }}
          interactive={false}
          bubblingMouseEvents={false as any}
        />
      ) : null}
    </>
  );
}
