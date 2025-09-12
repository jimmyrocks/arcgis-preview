import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents, Pane, LayerGroup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'esri-leaflet-renderers';
import EsriLayer from './EsriLayer';
import type { GeometryStyleOptions } from '../lib/styleOptions';
import type { Extent } from '../lib/types/arcgis-rest';
import HighlightOverlay from './HighlightOverlay';
import { extentToBounds } from '../lib/geometry';
import ZoomToLayerControl from './controls/ZoomToLayerControl';
import BasemapChooser from './controls/BasemapChooser';

export type MapViewProps = {
  serviceUrl: string;
  selectedMapLayerId?: number;
  where?: string;
  basemap?: 'usgs_topo' | 'usgs_imagery_topo' | 'usgs_imagery' | 'osm' | 'carto_positron' | 'carto_dark' | 'carto_voyager' | 'esri_worldimagery' | 'opentopomap' | { key: 'custom'; url: string; attribution?: string; subdomains?: string[]; detectRetina?: boolean };
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
  onDownloadedExtentChange?: (e: Extent | null) => void;
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
  // Throttle mousemove notifications to once per animation frame
  const rafRef = React.useRef<number | null>(null);
  const lastLLRef = React.useRef<L.LatLng | null>(null);
  const scheduleMouseReport = React.useCallback(() => {
    if (rafRef.current != null) return;
    try {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const ll = lastLLRef.current;
        if (ll) { try { onMouseMove?.(ll); } catch { } }
      });
    } catch {
      // Fallback when rAF is unavailable
      try { onMouseMove?.(lastLLRef.current as any); } catch {}
    }
  }, [onMouseMove]);
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
      try { lastLLRef.current = e.latlng; scheduleMouseReport(); } catch { }
    },
  });
  React.useEffect(() => {
    return () => {
      try { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); } catch {}
      rafRef.current = null;
    };
  }, []);
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

export default function MapView({ serviceUrl, selectedMapLayerId, where, basemap = 'usgs_topo', onBasemapChange, onBoundsChange, onCenterZoomChange, onMouseMove, onStatusChange, onServiceMetadata, zoomToExtent, initialCenter, initialZoom, onFeatureCollection, featureCollection, hoverFeatureId, selectedFeatureId, onMapFeatureHoverId, onMapFeatureClickId, styleMode, customStyle, onRenderModeChange, onDownloadedExtentChange }: MapViewProps) {
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
        {/* Single TileLayer driven by basemap value */}
        <DynamicBasemap basemap={basemap} onBasemapChange={onBasemapChange} />
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
              onDownloadedExtentChange={onDownloadedExtentChange}
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
        <RecenterOnSelectedControl selectedId={selectedFeatureId} featureCollection={featureCollection} />
        <BasemapChooser value={basemap || 'usgs_topo'} onChange={(b) => onBasemapChange?.(b)} />
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
    if (selectedId == null) return;
    try {
      const feats = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
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
  }, [selectedId, map]);
  return null;
}

function RecenterOnSelectedControl({ selectedId, featureCollection }: { selectedId?: string | number | null; featureCollection?: any }) {
  const map = useMap();
  const controlRef = React.useRef<any>(null);
  React.useEffect(() => {
    // Create the control once
    const C = (L as any).Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const container = (L as any).DomUtil.create('div', 'leaflet-control leaflet-bar');
        const a = (L as any).DomUtil.create('a', '', container);
        a.href = '#';
        a.title = 'Recenter on selected';
        a.setAttribute('aria-label', 'Recenter on selected');
        a.style.width = '28px';
        a.style.height = '28px';
        a.style.display = 'flex';
        a.style.alignItems = 'center';
        a.style.justifyContent = 'center';
        a.innerHTML = '🎯';
        a.addEventListener('click', (e: any) => {
          e.preventDefault();
          try {
            if (selectedId == null) return;
            const feats = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
            const f = feats.find((x: any) => x && (String(x.id) === String(selectedId) || String(x?.properties?.__id) === String(selectedId)));
            if (!f) return;
            const g = (L as any).geoJSON(f);
            const b = g.getBounds();
            g.remove();
            if (b && b.isValid()) { map.fitBounds(b, { maxZoom: 14 }); }
          } catch {}
        });
        return container;
      }
    });
    const ctl = new C();
    controlRef.current = ctl;
    map.addControl(ctl);
    return () => { try { map.removeControl(ctl); } catch {} };
  }, [map]);

  // Enable/disable based on whether there is a selection
  React.useEffect(() => {
    try {
      const container: HTMLElement | null = controlRef.current && controlRef.current.getContainer ? controlRef.current.getContainer() : null;
      const btn = container ? (container.querySelector('a') as HTMLAnchorElement | null) : null;
      if (btn) btn.style.pointerEvents = selectedId == null ? 'none' : 'auto';
      if (btn) btn.style.opacity = selectedId == null ? '0.4' : '1';
    } catch {}
  }, [selectedId]);

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
function DynamicBasemap({ basemap }: { basemap?: any }) {
  const cfg = getBasemapConfig(basemap);
  return (
    <TileLayer key={cfg.key} url={cfg.url} attribution={cfg.attribution}
      {...(cfg.subdomains ? { subdomains: cfg.subdomains as any } : {})}
      {...(cfg.detectRetina ? { detectRetina: true } : {})}
    />
  );
}

function getBasemapConfig(key: any): { key: string; url: string; attribution: string; subdomains?: string[]; detectRetina?: boolean } {
  // custom object
  if (key && typeof key === 'object' && key.url) {
    return { key: 'custom', url: String(key.url), attribution: String(key.attribution || ''), subdomains: key.subdomains, detectRetina: !!key.detectRetina };
  }
  switch (key) {
    case 'usgs_imagery_topo':
      return { key: 'usgs_imagery_topo', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagery courtesy of the U.S. Geological Survey' };
    case 'usgs_imagery':
      return { key: 'usgs_imagery', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', attribution: 'Imagery courtesy of the U.S. Geological Survey' };
    case 'osm':
      return { key: 'osm', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' };
    case 'carto_positron':
      return { key: 'carto_positron', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap contributors &copy; CARTO', subdomains: ['a','b','c','d'], detectRetina: true };
    case 'carto_dark':
      return { key: 'carto_dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap contributors &copy; CARTO', subdomains: ['a','b','c','d'], detectRetina: true };
    case 'carto_voyager':
      return { key: 'carto_voyager', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap contributors &copy; CARTO', subdomains: ['a','b','c','d'], detectRetina: true };
    case 'esri_worldimagery':
      return { key: 'esri_worldimagery', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Source: Esri' };
    case 'opentopomap':
      return { key: 'opentopomap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenTopoMap (CC-BY-SA)' };
    case 'usgs_topo':
    default:
      return { key: 'usgs_topo', url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles courtesy of the U.S. Geological Survey' };
  }
}
