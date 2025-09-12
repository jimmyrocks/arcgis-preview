import React, { useEffect } from 'react';
import { LayersControl, MapContainer, TileLayer, useMap, useMapEvents, Pane, LayerGroup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'esri-leaflet-renderers';
import EsriLayer from './EsriLayer';
import type { GeometryStyleOptions } from '../lib/styleOptions';
import type { Extent } from '../lib/types/arcgis-rest';
import HighlightOverlay from './HighlightOverlay';
import { extentToBounds } from '../lib/geometry';
import ZoomToLayerControl from './controls/ZoomToLayerControl';

export type MapViewProps = {
  serviceUrl: string;
  selectedMapLayerId?: number;
  where?: string;
  basemap?: 'usgs_topo' | 'usgs_imagery_topo' | 'usgs_imagery' | 'osm' | 'carto_positron' | 'carto_dark';
  onBasemapChange?: (b: 'usgs_topo' | 'usgs_imagery_topo' | 'usgs_imagery' | 'osm' | 'carto_positron' | 'carto_dark') => void;
  onBoundsChange?: (b: L.LatLngBounds) => void;
  onCenterZoomChange?: (center: L.LatLng, zoom: number) => void;
  onMouseMove?: (latlng: L.LatLng) => void;
  onStatusChange?: (status: 'loading' | 'loaded' | 'error') => void;
  onServiceMetadata?: (summary: string, meta: any) => void;
  zoomToExtent?: Extent | null;
  initialCenter?: [number, number] | null;
  initialZoom?: number | null;
  onFeatureCollection?: (fc: any) => void;
  featureCollection?: any;
  hoverFeatureId?: string | number | null;
  selectedFeatureId?: string | number | null;
  onMapFeatureHoverId?: (id: string | number | null) => void;
  onMapFeatureClickId?: (id: string | number | null) => void;
  styleMode?: 'server' | 'custom';
  customStyle?: GeometryStyleOptions;
  onRenderModeChange?: (mode: 'feature' | 'dynamic' | 'fallback_dynamic', reason?: string) => void;
};



function MapAutoResizer() {
  const map = useMap();
  useEffect(() => {
    const invalidate = () => {
      try { map.invalidateSize({ animate: false }); } catch { }
    };
    // Initial pass after mount/layout
    const t = setTimeout(invalidate, 0);
    // Window resize
    window.addEventListener('resize', invalidate);
    // Observe container size changes (more reliable than window resize)
    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(() => invalidate());
      ro.observe(map.getContainer());
    } catch { }
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', invalidate);
      try { ro?.disconnect(); } catch { }
    };
  }, [map]);
  return null;
}

function MapInfoReporter({
  onBoundsChange,
  onCenterZoomChange,
  onMouseMove,
}: {
  onBoundsChange?: (b: L.LatLngBounds) => void;
  onCenterZoomChange?: (center: L.LatLng, zoom: number) => void;
  onMouseMove?: (latlng: L.LatLng) => void;
}) {
  const map = useMap();
  useMapEvents({
    load() {
      try {
        onBoundsChange?.(map.getBounds());
        onCenterZoomChange?.(map.getCenter(), map.getZoom());
      } catch { }
    },
    moveend() {
      try {
        onBoundsChange?.(map.getBounds());
        onCenterZoomChange?.(map.getCenter(), map.getZoom());
      } catch { }
    },
    zoomend() {
      try {
        onBoundsChange?.(map.getBounds());
        onCenterZoomChange?.(map.getCenter(), map.getZoom());
      } catch { }
    },
    resize() {
      try {
        onBoundsChange?.(map.getBounds());
        onCenterZoomChange?.(map.getCenter(), map.getZoom());
      } catch { }
    },
    mousemove(e) {
      try { onMouseMove?.(e.latlng); } catch { }
    },
  });
  React.useEffect(() => {
    const t = setTimeout(() => {
      try {
        onBoundsChange?.(map.getBounds());
        onCenterZoomChange?.(map.getCenter(), map.getZoom());
      } catch { }
    }, 50);
    return () => clearTimeout(t);
  }, [map, onBoundsChange, onCenterZoomChange]);
  return null;
}

export default function MapView({ serviceUrl, selectedMapLayerId, where, basemap = 'usgs_topo', onBasemapChange, onBoundsChange, onCenterZoomChange, onMouseMove, onStatusChange, onServiceMetadata, zoomToExtent, initialCenter, initialZoom, onFeatureCollection, featureCollection, hoverFeatureId, selectedFeatureId, onMapFeatureHoverId, onMapFeatureClickId, styleMode, customStyle, onRenderModeChange }: MapViewProps) {
  const [layerBounds, setLayerBounds] = React.useState<L.LatLngBounds | null>(null);
  const layerEndpointKey = React.useMemo(() => `${serviceUrl || ''}::${selectedMapLayerId ?? ''}`, [serviceUrl, selectedMapLayerId]);
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', minHeight: 0 }}>
      <MapContainer center={initialCenter || [37.7749, -122.4194]} zoom={initialZoom || 10} preferCanvas style={{ position: 'absolute', inset: 0 }}>
        <MapAutoResizer />
        <MapInitialViewEffect center={initialCenter} zoom={initialZoom} />
        {/* Dedicated pane for highlight overlays that never intercepts mouse/touch */}
        <Pane name="highlight" style={{ zIndex: 650, pointerEvents: 'none' as any }} />
        <MapClearSelection onClear={() => { try { onMapFeatureClickId?.(null); } catch {} }} />
        <MapInfoReporter onBoundsChange={onBoundsChange} onCenterZoomChange={onCenterZoomChange} onMouseMove={onMouseMove} />
        <BasemapChangeReporter onChange={onBasemapChange} />
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked={basemap === 'usgs_topo'} name="USGS National Map (Topo)">
            <TileLayer
              url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles courtesy of the U.S. Geological Survey"
              eventHandlers={{ add: () => { try { onBasemapChange?.('usgs_topo'); } catch {} } }}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={basemap === 'usgs_imagery_topo'} name="USGS Imagery Topo">
            <TileLayer
              url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}"
              attribution="Imagery courtesy of the U.S. Geological Survey"
              eventHandlers={{ add: () => { try { onBasemapChange?.('usgs_imagery_topo'); } catch {} } }}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={basemap === 'usgs_imagery'} name="USGS Imagery Only">
            <TileLayer
              url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"
              attribution="Imagery courtesy of the U.S. Geological Survey"
              eventHandlers={{ add: () => { try { onBasemapChange?.('usgs_imagery'); } catch {} } }}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={basemap === 'osm'} name="OpenStreetMap">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" eventHandlers={{ add: () => { try { onBasemapChange?.('osm'); } catch {} } }} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={basemap === 'carto_positron'} name="CARTO Positron">
            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap contributors &copy; CARTO" subdomains={["a", "b", "c", "d"] as any} detectRetina eventHandlers={{ add: () => { try { onBasemapChange?.('carto_positron'); } catch {} } }} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer checked={basemap === 'carto_dark'} name="CARTO DarkMatter">
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="&copy; OpenStreetMap contributors &copy; CARTO" subdomains={["a", "b", "c", "d"] as any} detectRetina eventHandlers={{ add: () => { try { onBasemapChange?.('carto_dark'); } catch {} } }} />
          </LayersControl.BaseLayer>
        </LayersControl>
        {serviceUrl ? (
          <LayerGroup key={`data-${layerEndpointKey}`}>
            <EsriLayer
              serviceUrl={serviceUrl}
              selectedMapLayerId={selectedMapLayerId}
              where={where}
              onStatusChange={onStatusChange}
              onServiceMetadata={onServiceMetadata}
              onRenderModeChange={onRenderModeChange}
              onFeatureCollection={onFeatureCollection}
              onFeatureHoverId={onMapFeatureHoverId}
              onFeatureClickId={onMapFeatureClickId}
              onComputedBounds={(b) => setLayerBounds(b)}
              styleMode={styleMode}
              customStyle={customStyle}
            />
          </LayerGroup>
        ) : null}
        <HighlightOverlay
          featureCollection={featureCollection}
          hoverId={hoverFeatureId}
          selectedId={selectedFeatureId}
          zoomOnSelect={false}
        />
        <CenterOnSelectedEffect featureCollection={featureCollection} selectedId={selectedFeatureId} />
        <ZoomToLayerControl bounds={layerBounds} />
        <ZoomToExtentEffect extent={zoomToExtent} />
      </MapContainer>
    </div>
  );
}

function ZoomToExtentEffect({ extent }: { extent: Extent | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!extent) return;
    const b = extentToBounds(extent);
    if (b) {
      try { map.fitBounds(b, { maxZoom: 12 }); } catch {}
    }
  }, [extent, map]);
  return null;
}

function MapInitialViewEffect({ center, zoom }: { center: [number, number] | null | undefined; zoom: number | null | undefined }) {
  const map = useMap();
  const appliedRef = React.useRef(false);
  useEffect(() => {
    if (appliedRef.current) return;
    if (!center || typeof zoom !== 'number') return;
    appliedRef.current = true;
    try { map.setView(center as any, zoom as number, { animate: false }); } catch {}
  }, [map, center, zoom]);
  return null;
}

function CenterOnSelectedEffect({ featureCollection, selectedId }: { featureCollection?: any; selectedId?: string | number | null }) {
  const map = useMap();
  useEffect(() => {
    if (!featureCollection || selectedId == null) return;
    try {
      const feats = Array.isArray(featureCollection.features) ? featureCollection.features : [];
      const f = feats.find((x: any) => x && (String(x.id) === String(selectedId) || String(x?.properties?.__id) === String(selectedId)));
      if (!f) return;
      const g = (L as any).geoJSON(f);
      const b = g.getBounds();
      g.remove();
      if (b && b.isValid()) {
        const c = b.getCenter();
        try { (map as any).panTo?.(c, { animate: true }); } catch {}
      }
    } catch { }
  }, [featureCollection, selectedId, map]);
  return null;
}

function MapClearSelection({ onClear }: { onClear?: () => void }) {
  useMapEvents({
    click(e) {
      try {
        // Skip clearing when the click originated from a feature handler
        if ((e as any)?.originalEvent && (e as any).originalEvent._odlFeatureClick) return;
        onClear?.();
      } catch { }
    },
  });
  return null;
}

function BasemapChangeReporter({ onChange }: { onChange?: (b: 'usgs_topo' | 'usgs_imagery_topo' | 'usgs_imagery' | 'osm' | 'carto_positron' | 'carto_dark') => void }) {
  const map = useMap();
  useEffect(() => {
    function handler(e: any) {
      try {
        const url: string = e?.layer?.options?.url || '';
        const key = urlToBasemapKey(url);
        if (key && onChange) onChange(key);
      } catch { }
    }
    map.on('baselayerchange', handler as any);
    return () => { try { map.off('baselayerchange', handler as any); } catch {} };
  }, [map, onChange]);
  return null;
}

function urlToBasemapKey(url: string): 'usgs_topo' | 'usgs_imagery_topo' | 'usgs_imagery' | 'osm' | 'carto_positron' | 'carto_dark' | null {
  if (!url) return null;
  if (url.includes('USGSTopo/MapServer')) return 'usgs_topo';
  if (url.includes('USGSImageryTopo/MapServer')) return 'usgs_imagery_topo';
  if (url.includes('USGSImageryOnly/MapServer')) return 'usgs_imagery';
  if (url.includes('tile.openstreetmap.org')) return 'osm';
  if (url.includes('basemaps.cartocdn.com/light_all')) return 'carto_positron';
  if (url.includes('basemaps.cartocdn.com/dark_all')) return 'carto_dark';
  return null;
}
