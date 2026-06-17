import React from 'react';
import { createPortal } from 'react-dom';
import maplibregl, {
  LngLat,
  LngLatBounds,
  LngLatLike,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  MapMouseEvent,
  LayerSpecification
} from 'maplibre-gl';
import { Bounds } from '../lib/geo';
import 'maplibre-gl/dist/maplibre-gl.css';
import { clearRendererArtifacts } from '@opendataland/source-arcgis';
import { registerArcGISRestSource } from '@opendataland/source-arcgis';
import type { Feature, FeatureCollection } from 'geojson';
import type { GeometryStyleOptions, AttributeStyleOptions } from '../lib/styleOptions';
import type { Extent } from '../lib/types/arcgis-rest';
import { extentToBounds, boundsToExtent4326, extentFromFeatures, boundsFromFeatures } from '../lib/geometry';
import { resolveEsriLayer, fetchLayerMetadata, fetchServiceMetadata, summarizeService } from '../lib/esriLayer';
import { applyFeatureSourceStyle } from '../lib/esriStyleRuntime';
import type { GeometryKind } from '../lib/esriStyle';
import { getFeatureId, findFeatureById } from '../lib/ids';
import { dedupeFeatures, type DuplicateFeatureSummary } from '../lib/dedupeFeatures';
import BasemapChooser from './controls/BasemapChooser';

type BasemapKey =
  | 'carto_positron'
  | 'usgs_topo'
  | 'usgs_imagery_topo'
  | 'usgs_imagery'
  | 'osm'
  | 'carto_dark'
  | 'carto_voyager'
  | 'esri_worldimagery'
  | 'opentopomap'
  | { key: 'custom'; url: string; attribution?: string; subdomains?: string[]; detectRetina?: boolean };

export type MapViewProps = {
  serviceUrl: string;
  selectedMapLayerId?: number;
  where?: string;
  forcedFetchPaused?: boolean;
  basemap?: BasemapKey;
  layerOpacity?: number;
  onBasemapChange?: (b: BasemapKey) => void;
  onBoundsChange?: (b: LngLatBounds) => void;
  onCenterZoomChange?: (center: LngLat, zoom: number) => void;
  onMouseMove?: (latlng: LngLat) => void;
  onStatusChange?: (status: 'loading' | 'loaded' | 'error') => void;
  onServiceMetadata?: (summary: string, meta: any) => void;
  zoomToLayerToken?: number | null;
  zoomToExtent?: Extent | null;
  initialCenter?: [number, number] | null;
  initialZoom?: number | null;
  onFeatureCollection?: (fc: FeatureCollection) => void;
  onDuplicateSummaryChange?: (summary: DuplicateFeatureSummary) => void;
  featureCollection?: FeatureCollection;
  selectedFeatureId?: string | number | null;
  flashFeature?: Feature | null;
  legendHighlightFilter?: any[] | null;
  onMapFeatureClickId?: (id: string | number | null) => void;
  // Drive the map hover-highlight from outside (e.g. hovering a row in the Data tab).
  externalHoverId?: string | number | null;
  // Emit the feature currently hovered on the map (e.g. to highlight its Data-tab row).
  onHoverFeatureId?: (id: string | number | null) => void;
  styleMode?: 'server' | 'custom' | 'attribute';
  customStyle?: GeometryStyleOptions;
  attributeStyle?: AttributeStyleOptions;
  onRenderModeChange?: (mode: 'feature' | 'dynamic' | 'fallback_dynamic' | 'image' | 'vector', reason?: string) => void;
  onDownloadedExtentChange?: (e: Extent | null) => void;
};

const ARC_SOURCE_ID = 'arcgis-source';
const BASEMAP_SOURCE_ID = 'basemap';
const BASEMAP_LAYER_ID = 'basemap-layer';
const RENDERER_PREFIX = 'arcgis-style';
const CUSTOM_PREFIX = 'arcgis-custom';
const LINE_HIT_LAYER_ID = `${CUSTOM_PREFIX}-line-hit`;
const DYNAMIC_SOURCE_ID = 'arcgis-dynamic-source';
const DYNAMIC_LAYER_ID = 'arcgis-dynamic-layer';
const VECTOR_SOURCE_ID = 'arcgis-vector-source';
const VECTOR_LAYER_PREFIX = 'arcgis-vector-style';
const HIGHLIGHT_HOVER_PREFIX = 'arcgis-highlight-hover';
const HIGHLIGHT_SELECTED_PREFIX = 'arcgis-highlight-selected';
const HIGHLIGHT_LEGEND_PREFIX = 'arcgis-highlight-legend';
const FLASH_SOURCE_ID = 'arcgis-flash';
const FLASH_LAYER_PREFIX = 'arcgis-flash';
const ACCENT_COLOR = '#5b8cff';
const ARC_PAN_DEBOUNCE_MS = 250;
const ARC_SEGMENT_CACHE_MAX = 40;
const ARC_PAGE_SIZE_START = 512;
const ARC_PAGE_SIZE_MIN = 1;
const ARC_PAGE_SIZE_FALLBACK_MAX = 1000;
const ARC_SNAPSHOT_DEBOUNCE_MS = 120;
const RASTER_BASE_OPACITY = 0.85;

const MAP_BTN_STYLE: React.CSSProperties = {
  width: 32, height: 32,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--panel)', color: 'var(--text)',
  border: '1px solid var(--border)', borderRadius: 6,
  cursor: 'pointer', fontSize: 14,
  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
};

type BasemapConfig = { key: string; tiles: string[]; attribution: string };

function normalizeGeometryType(esriType?: string): GeometryKind | undefined {
  if (!esriType) return undefined;
  const lc = esriType.toLowerCase();
  if (lc.includes('point')) return 'point';
  if (lc.includes('line')) return 'polyline';
  if (lc.includes('polyline')) return 'polyline';
  if (lc.includes('polygon')) return 'polygon';
  return undefined;
}

function tilesFromTemplate(template: string, subdomains?: string[], detectRetina?: boolean): string[] {
  const retinaSuffix = detectRetina ? '' : '';
  const cleanTemplate = template.replace('{r}', retinaSuffix);
  if (!subdomains || !subdomains.length) return [cleanTemplate];
  return subdomains.map((s) => cleanTemplate.replace('{s}', s));
}

function getBasemapConfig(key: BasemapKey | undefined): BasemapConfig {
  if (key && typeof key === 'object' && key.url) {
    return {
      key: 'custom',
      tiles: tilesFromTemplate(String(key.url), key.subdomains, key.detectRetina),
      attribution: String(key.attribution || '')
    };
  }
  switch (key) {
    case 'usgs_topo':
      return {
        key: 'usgs_topo',
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Tiles courtesy of the U.S. Geological Survey'
      };
    case 'usgs_imagery_topo':
      return {
        key: 'usgs_imagery_topo',
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Imagery courtesy of the U.S. Geological Survey'
      };
    case 'usgs_imagery':
      return {
        key: 'usgs_imagery',
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Imagery courtesy of the U.S. Geological Survey'
      };
    case 'osm':
      return {
        key: 'osm',
        tiles: tilesFromTemplate('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', ['a', 'b', 'c']),
        attribution: '© OpenStreetMap contributors'
      };
    case 'carto_dark':
      return {
        key: 'carto_dark',
        tiles: tilesFromTemplate('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', ['a', 'b', 'c', 'd']),
        attribution: '© OpenStreetMap contributors © CARTO'
      };
    case 'carto_voyager':
      return {
        key: 'carto_voyager',
        tiles: tilesFromTemplate('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', ['a', 'b', 'c', 'd']),
        attribution: '© OpenStreetMap contributors © CARTO'
      };
    case 'esri_worldimagery':
      return {
        key: 'esri_worldimagery',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Source: Esri'
      };
    case 'opentopomap':
      return {
        key: 'opentopomap',
        tiles: tilesFromTemplate('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', ['a', 'b', 'c']),
        attribution: '© OpenTopoMap (CC-BY-SA)'
      };
    case 'carto_positron':
    default:
      return {
        key: 'carto_positron',
        tiles: tilesFromTemplate('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', ['a', 'b', 'c', 'd']),
        attribution: '© OpenStreetMap contributors © CARTO'
      };
  }
}

function applyBasemap(map: MapLibreMap, key: BasemapKey | undefined) {
  const cfg = getBasemapConfig(key);
  try {
    if (map.getLayer(BASEMAP_LAYER_ID)) map.removeLayer(BASEMAP_LAYER_ID);
  } catch {}
  try {
    if (map.getSource(BASEMAP_SOURCE_ID)) map.removeSource(BASEMAP_SOURCE_ID);
  } catch {}
  map.addSource(BASEMAP_SOURCE_ID, {
    type: 'raster',
    tiles: cfg.tiles,
    tileSize: 256,
    attribution: cfg.attribution
  } as any);
  map.addLayer({
    id: BASEMAP_LAYER_ID,
    type: 'raster',
    source: BASEMAP_SOURCE_ID
  });
  // Keep basemap beneath all data/overlay layers
  const layers = map.getStyle()?.layers || [];
  const firstNonBase = layers.find((l) => l.id !== BASEMAP_LAYER_ID && l.id !== 'background');
  if (firstNonBase) {
    try { map.moveLayer(BASEMAP_LAYER_ID, firstNonBase.id); } catch {}
  }
}

function installArcgisSegmentLru(src: any, lru: Map<string, true>, maxEntries: number) {
  if (!src || src.arcgisType !== 'arcgis-rest' || !src._segments) return;
  const segments = src._segments;
  if (segments.__odlLruPatched) {
    lru.clear();
    return;
  }
  const recordQuality = typeof segments.recordQuality === 'function' ? segments.recordQuality.bind(segments) : null;
  if (!recordQuality) return;
  const clearCache = typeof segments.clearCache === 'function' ? segments.clearCache.bind(segments) : null;

  segments.__odlLruPatched = true;
  segments.recordQuality = (key: string, quality: any) => {
    recordQuality(key, quality);
    if (lru.has(key)) lru.delete(key);
    lru.set(key, true);
    while (lru.size > maxEntries) {
      const oldest = lru.keys().next().value;
      if (!oldest) break;
      lru.delete(oldest);
      try { segments.qualityCache?.delete(oldest); } catch {}
    }
  };
  if (clearCache) {
    segments.clearCache = () => {
      clearCache();
      lru.clear();
    };
  }
}

function multiplyOpacity(base: any, opacity: number): any {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1));
  if (typeof base === 'number') return base * clamped;
  if (Array.isArray(base)) return ['*', base, clamped];
  if (base == null) return clamped;
  return clamped;
}

function getOpacityBase(baseMap: Map<string, Record<string, any>>, map: MapLibreMap, layerId: string, prop: string): any {
  let entry = baseMap.get(layerId);
  if (!entry) {
    entry = {};
    baseMap.set(layerId, entry);
  }
  if (!(prop in entry)) {
    try {
      const current = map.getPaintProperty(layerId, prop);
      entry[prop] = current ?? 1;
    } catch {
      entry[prop] = 1;
    }
  }
  return entry[prop];
}

function applyOpacityToLayer(map: MapLibreMap, layerId: string, opacity: number, baseMap: Map<string, Record<string, any>>) {
  const layer: any = map.getLayer(layerId) as any;
  if (!layer) return;
  const type = layer.type;
  const props: string[] = [];
  if (type === 'circle') props.push('circle-opacity', 'circle-stroke-opacity');
  else if (type === 'line') props.push('line-opacity');
  else if (type === 'fill') props.push('fill-opacity');
  else if (type === 'symbol') props.push('icon-opacity', 'text-opacity');
  else if (type === 'raster') props.push('raster-opacity');
  else if (type === 'heatmap') props.push('heatmap-opacity');
  if (!props.length) return;
  props.forEach((prop) => {
    try {
      const base = getOpacityBase(baseMap, map, layerId, prop);
      map.setPaintProperty(layerId, prop, multiplyOpacity(base, opacity));
    } catch { /* ignore */ }
  });
}

function idFilter(id: string | number | null | undefined, idField?: string) {
  if (id == null) return ['==', ['id'], '__none__'];
  const asNumber = Number(id);
  const numeric = Number.isFinite(asNumber) ? asNumber : undefined;
  const candidates = [
    ['==', ['id'], id],
    ['==', ['get', '__id'], id],
    ...(idField ? [['==', ['get', idField], id]] : [])
  ];
  if (numeric !== undefined) {
    candidates.push(['==', ['id'], numeric]);
    candidates.push(['==', ['get', '__id'], numeric]);
    if (idField) candidates.push(['==', ['get', idField], numeric]);
  }
  if (candidates.length === 1) return candidates[0];
  return ['any', ...candidates];
}

function collectFeaturesFromSource(src: any): Feature[] {
  try {
    if (src?._featureStore instanceof Map) {
      const out: Feature[] = [];
      for (const entry of src._featureStore.values()) {
        if (entry?.feature) out.push(entry.feature as Feature);
      }
      return out;
    }
    if (src?._data?.type === 'FeatureCollection' && Array.isArray(src._data.features)) {
      return src._data.features as Feature[];
    }
  } catch {}
  return [];
}

function duplicateIdFilter(ids: Array<string | number>): any[] | null {
  const stringIds = Array.from(new Set(ids.map((id) => String(id))));
  if (!stringIds.length) return null;
  return [
    '!',
    [
      'any',
      ['match', ['to-string', ['id']], stringIds, true, false],
      ['match', ['to-string', ['get', '__id']], stringIds, true, false]
    ]
  ];
}

function applySuspectedDuplicateFilter(
  map: MapLibreMap,
  layerIds: string[],
  baseFilters: Map<string, any>,
  ids: Array<string | number>,
  enabled: boolean
) {
  const hideFilter = enabled ? duplicateIdFilter(ids) : null;
  const activeIds = new Set(layerIds);
  for (const key of Array.from(baseFilters.keys())) {
    if (!activeIds.has(key)) baseFilters.delete(key);
  }
  for (const layerId of layerIds) {
    try {
      const layer: any = map.getLayer(layerId);
      if (!layer) {
        baseFilters.delete(layerId);
        continue;
      }
      if (!baseFilters.has(layerId)) baseFilters.set(layerId, layer.filter ?? null);
      const base = baseFilters.get(layerId);
      const nextFilter = hideFilter ? (base ? ['all', base, hideFilter] : hideFilter) : base;
      map.setFilter(layerId, nextFilter ?? undefined);
    } catch {}
  }
}

function estimateSourceFeatureCount(src: any): number {
  try {
    if (src?._featureStore instanceof Map) return src._featureStore.size;
    if (src?._data?.type === 'FeatureCollection' && Array.isArray(src._data.features)) return src._data.features.length;
  } catch {}
  return 0;
}

function getPageSizeCap(maxRecordCount?: number): number {
  if (Number.isFinite(maxRecordCount) && (maxRecordCount as number) > 0) {
    return Math.max(ARC_PAGE_SIZE_MIN, Math.floor(maxRecordCount as number));
  }
  return ARC_PAGE_SIZE_FALLBACK_MAX;
}

function normalizePageSize(next: number, maxRecordCount?: number): number {
  const cap = getPageSizeCap(maxRecordCount);
  const n = Number.isFinite(next) ? Math.floor(next) : ARC_PAGE_SIZE_START;
  return Math.max(ARC_PAGE_SIZE_MIN, Math.min(cap, n));
}

function ensureHighlightLayers(map: MapLibreMap, sourceId: string, geometry?: GeometryKind) {
  const isPoint = geometry === 'point';
  const isLine = geometry === 'polyline';
  const isPolygon = geometry === 'polygon';

  // Hover layers - yellow/gold color
  const hoverFill: LayerSpecification = {
    id: `${HIGHLIGHT_HOVER_PREFIX}-fill`,
    type: 'fill',
    source: sourceId,
    paint: {
      'fill-color': '#ffd166',
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.2, 0],
      'fill-outline-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        '#ffd166',
        'rgba(0,0,0,0)'
      ]
    }
  };
  const hoverLine: LayerSpecification = {
    id: `${HIGHLIGHT_HOVER_PREFIX}-line`,
    type: 'line',
    source: sourceId,
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },
    paint: {
      'line-color': '#ffa726',
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        6, ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0],
        8, ['case', ['boolean', ['feature-state', 'hover'], false], 3, 0],
        10, ['case', ['boolean', ['feature-state', 'hover'], false], 4.5, 0],
        14, ['case', ['boolean', ['feature-state', 'hover'], false], 7, 0]
      ],
      'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0]
    }
  };
  const hoverCircle: LayerSpecification = {
    id: `${HIGHLIGHT_HOVER_PREFIX}-circle`,
    type: 'circle',
    source: sourceId,
    paint: {
      'circle-color': '#ffd166',
      'circle-stroke-color': '#ffa726',
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        6, ['case', ['boolean', ['feature-state', 'hover'], false], 1.2, 0],
        8, ['case', ['boolean', ['feature-state', 'hover'], false], 1.6, 0],
        10, ['case', ['boolean', ['feature-state', 'hover'], false], 2.2, 0],
        14, ['case', ['boolean', ['feature-state', 'hover'], false], 3.2, 0]
      ],
      'circle-stroke-width': [
        'interpolate', ['linear'], ['zoom'],
        6, ['case', ['boolean', ['feature-state', 'hover'], false], 0.8, 0],
        8, ['case', ['boolean', ['feature-state', 'hover'], false], 1.1, 0],
        10, ['case', ['boolean', ['feature-state', 'hover'], false], 1.5, 0],
        14, ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0]
      ],
      'circle-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.3, 0],
      'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0]
    }
  };

  // Selected layers - blue accent color with stronger presence
  const selFill: LayerSpecification = {
    id: `${HIGHLIGHT_SELECTED_PREFIX}-fill`,
    type: 'fill',
    source: sourceId,
    paint: {
      'fill-color': ACCENT_COLOR,
      'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.15, 0],
      'fill-outline-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        ACCENT_COLOR,
        'rgba(0,0,0,0)'
      ]
    }
  };
  const selLine: LayerSpecification = {
    id: `${HIGHLIGHT_SELECTED_PREFIX}-line`,
    type: 'line',
    source: sourceId,
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },
    paint: {
      'line-color': ACCENT_COLOR,
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        6, ['case', ['boolean', ['feature-state', 'selected'], false], 2, 0],
        8, ['case', ['boolean', ['feature-state', 'selected'], false], 3, 0],
        10, ['case', ['boolean', ['feature-state', 'selected'], false], 4.5, 0],
        14, ['case', ['boolean', ['feature-state', 'selected'], false], 6, 0]
      ],
      'line-gap-width': 0,
      'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.95, 0]
    }
  };
  const selCircle: LayerSpecification = {
    id: `${HIGHLIGHT_SELECTED_PREFIX}-circle`,
    type: 'circle',
    source: sourceId,
    paint: {
      'circle-color': ACCENT_COLOR,
      'circle-stroke-color': ACCENT_COLOR,
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        6, ['case', ['boolean', ['feature-state', 'selected'], false], 2.4, 0],
        8, ['case', ['boolean', ['feature-state', 'selected'], false], 3.2, 0],
        10, ['case', ['boolean', ['feature-state', 'selected'], false], 4.3, 0],
        14, ['case', ['boolean', ['feature-state', 'selected'], false], 5.8, 0]
      ],
      'circle-stroke-width': [
        'interpolate', ['linear'], ['zoom'],
        6, ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0],
        8, ['case', ['boolean', ['feature-state', 'selected'], false], 1.2, 0],
        10, ['case', ['boolean', ['feature-state', 'selected'], false], 1.6, 0],
        14, ['case', ['boolean', ['feature-state', 'selected'], false], 2.1, 0]
      ],
      'circle-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.25, 0],
      'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0]
    }
  };

  const layers: LayerSpecification[] = [];
  if (isPolygon) layers.push(hoverFill);
  if (isLine || isPolygon) layers.push(hoverLine);
  if (isPoint) layers.push(hoverCircle);
  if (isPolygon) layers.push(selFill);
  if (isLine || isPolygon) layers.push(selLine);
  if (isPoint) layers.push(selCircle);

  layers.forEach((layer) => {
    try {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    } catch {}
    map.addLayer(layer);
  });
}

function ensureLegendHighlightLayers(map: MapLibreMap, sourceId: string, geometry?: GeometryKind) {
  const isPoint = geometry === 'point';
  const isLine = geometry === 'polyline';
  const isPolygon = geometry === 'polygon';
  const hiddenFilter = ['==', ['id'], '__arcgis_preview_none__'];

  clearRendererArtifacts(map, HIGHLIGHT_LEGEND_PREFIX);

  const layers: LayerSpecification[] = [];
  if (isPolygon) {
    layers.push({
      id: `${HIGHLIGHT_LEGEND_PREFIX}-fill`,
      type: 'fill',
      source: sourceId,
      filter: hiddenFilter as any,
      paint: {
        'fill-color': '#00c2ff',
        'fill-opacity': 0.18,
        'fill-outline-color': '#00c2ff'
      }
    });
  }
  if (isLine || isPolygon) {
    layers.push({
      id: `${HIGHLIGHT_LEGEND_PREFIX}-line`,
      type: 'line',
      source: sourceId,
      filter: hiddenFilter as any,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#00a7e1',
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 10, 4, 14, 7],
        'line-opacity': 0.95
      }
    });
  }
  if (isPoint) {
    layers.push({
      id: `${HIGHLIGHT_LEGEND_PREFIX}-circle`,
      type: 'circle',
      source: sourceId,
      filter: hiddenFilter as any,
      paint: {
        'circle-color': '#00c2ff',
        'circle-opacity': 0.28,
        'circle-stroke-color': '#0077ff',
        'circle-stroke-opacity': 1,
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 1.2, 10, 2.2, 14, 3.4],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 10, 9, 14, 14]
      }
    });
  }

  for (const layer of layers) {
    try { map.addLayer(layer); } catch {}
  }
}

function applyLegendHighlightFilter(
  map: MapLibreMap,
  filter: any[] | null | undefined,
  duplicateIds: Array<string | number> = [],
  hideSuspectedDuplicates: boolean = false
) {
  const duplicateFilter = hideSuspectedDuplicates ? duplicateIdFilter(duplicateIds) : null;
  const next = filter
    ? (duplicateFilter ? ['all', filter, duplicateFilter] : filter)
    : ['==', ['id'], '__arcgis_preview_none__'];
  for (const id of [`${HIGHLIGHT_LEGEND_PREFIX}-fill`, `${HIGHLIGHT_LEGEND_PREFIX}-line`, `${HIGHLIGHT_LEGEND_PREFIX}-circle`]) {
    try {
      if (map.getLayer(id)) map.setFilter(id, next as any);
    } catch {}
  }
}

function updateHighlightStates(map: MapLibreMap, sourceId: string, hoverId: string | number | null | undefined, selectedId: string | number | null | undefined, prevHoverId?: string | number | null, prevSelectedId?: string | number | null) {
  try {
    // Clear previous hover state
    if (prevHoverId != null) {
      map.setFeatureState({ source: sourceId, id: prevHoverId }, { hover: false });
    }
    // Set new hover state
    if (hoverId != null) {
      map.setFeatureState({ source: sourceId, id: hoverId }, { hover: true });
    }

    // Clear previous selected state
    if (prevSelectedId != null && prevSelectedId !== selectedId) {
      map.setFeatureState({ source: sourceId, id: prevSelectedId }, { selected: false });
    }
    // Set new selected state
    if (selectedId != null) {
      map.setFeatureState({ source: sourceId, id: selectedId }, { selected: true });
    }
  } catch {}
}

function moveOverlayLayersToTop(map: MapLibreMap) {
  const order = [
    `${FLASH_LAYER_PREFIX}-fill`,
    `${FLASH_LAYER_PREFIX}-line`,
    `${FLASH_LAYER_PREFIX}-circle`,
    `${HIGHLIGHT_LEGEND_PREFIX}-fill`,
    `${HIGHLIGHT_LEGEND_PREFIX}-line`,
    `${HIGHLIGHT_LEGEND_PREFIX}-circle`,
    `${HIGHLIGHT_SELECTED_PREFIX}-fill`,
    `${HIGHLIGHT_SELECTED_PREFIX}-line`,
    `${HIGHLIGHT_SELECTED_PREFIX}-circle`,
    `${HIGHLIGHT_HOVER_PREFIX}-fill`,
    `${HIGHLIGHT_HOVER_PREFIX}-line`,
    `${HIGHLIGHT_HOVER_PREFIX}-circle`
  ];
  order.forEach((id) => {
    try { if (map.getLayer(id)) map.moveLayer(id); } catch {}
  });
}

function useMapReady(basemap: BasemapKey | undefined, initialCenter?: [number, number] | null, initialZoom?: number | null) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<MapLibreMap | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    registerArcGISRestSource(maplibregl as any);
    const center: LngLatLike = initialCenter ? [initialCenter[1], initialCenter[0]] : [-122.4194, 37.7749];
    const zoom = typeof initialZoom === 'number' ? initialZoom : 10;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef2f7' } }]
      },
      center,
      zoom
    });
    mapRef.current = map;
    map.on('load', () => {
      applyBasemap(map, basemap);
      setReady(true);
    });
    return () => {
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
    // We intentionally run once; later renders should not tear down the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    if (!map) return;
    applyBasemap(map, basemap);
  }, [basemap, ready]);

  return { containerRef, mapRef, ready };
}

export default function MapView({
  serviceUrl,
  selectedMapLayerId,
  where = '1=1',
  forcedFetchPaused = false,
  basemap = 'carto_positron',
  layerOpacity = 1,
  onBasemapChange,
  onBoundsChange,
  onCenterZoomChange,
  onMouseMove,
  onStatusChange,
  onServiceMetadata,
  zoomToLayerToken,
  zoomToExtent,
  initialCenter,
  initialZoom,
  onFeatureCollection,
  onDuplicateSummaryChange,
  featureCollection,
  selectedFeatureId,
  flashFeature,
  legendHighlightFilter,
  onMapFeatureClickId,
  externalHoverId,
  onHoverFeatureId,
  styleMode = 'server',
  customStyle = {},
  attributeStyle,
  onRenderModeChange,
  onDownloadedExtentChange
}: MapViewProps) {
  const { containerRef, mapRef, ready } = useMapReady(basemap, initialCenter, initialZoom);
  const [bearing, setBearing] = React.useState(0);
  const [pitch, setPitch] = React.useState(0);
  const [layerBounds, setLayerBounds] = React.useState<Bounds | null>(null);
  const layerBoundsRef = React.useRef<Bounds | null>(null);
  const layerMetaRef = React.useRef<any>(null);
  const idFieldRef = React.useRef<string | undefined>(undefined);
  const geometryRef = React.useRef<GeometryKind | undefined>(undefined);
  const [hoverFeatureId, setHoverFeatureId] = React.useState<string | number | null>(null);
  const prevHoverIdRef = React.useRef<string | number | null>(null);
  const prevSelectedIdRef = React.useRef<string | number | null>(null);
  const interactionCleanupRef = React.useRef<(() => void) | null>(null);
  const sourceDataCleanupRef = React.useRef<(() => void) | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const isLoadingRef = React.useRef<boolean>(false);
  const featureClickFlagRef = React.useRef<boolean>(false);
  const flashTimeoutRef = React.useRef<number | null>(null);
  const [fetchPaused, setFetchPaused] = React.useState<boolean>(false);
  const fetchOnceRef = React.useRef<boolean>(false);
  const fetchPausedRef = React.useRef<boolean>(false);
  const minZoomToFetchRef = React.useRef<number | null>(null);
  const prevFetchPausedRef = React.useRef<boolean>(false);
  const arcPageSizeRef = React.useRef<number>(ARC_PAGE_SIZE_START);
  const opacityBaseRef = React.useRef<Map<string, Record<string, any>>>(new Map());
  const styleApplyVersionRef = React.useRef(0);
  const duplicateReportKeyRef = React.useRef<string>('');
  const duplicateFilterBaseRef = React.useRef<Map<string, any>>(new Map());
  const onDuplicateSummaryChangeRef = React.useRef(onDuplicateSummaryChange);
  const suspectedDuplicateIdsRef = React.useRef<Array<string | number>>([]);
  const legendHighlightFilterRef = React.useRef<any[] | null>(legendHighlightFilter ?? null);
  const styledLayerIdsRef = React.useRef<string[]>([]);
  const hideSuspectedDuplicatesRef = React.useRef(false);
  const segmentLruRef = React.useRef<Map<string, true>>(new Map());
  const lastClearZoomRef = React.useRef<number>(0);
  const [fetchControlContainer, setFetchControlContainer] = React.useState<HTMLDivElement | null>(null);
  const fetchControlRef = React.useRef<maplibregl.IControl | null>(null);

  React.useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  React.useEffect(() => {
    onDuplicateSummaryChangeRef.current = onDuplicateSummaryChange;
  }, [onDuplicateSummaryChange]);

  React.useEffect(() => {
    legendHighlightFilterRef.current = legendHighlightFilter ?? null;
  }, [legendHighlightFilter]);

  const effectiveFetchPaused = fetchPaused || forcedFetchPaused;
  const hideSuspectedDuplicates = !!customStyle?.display?.hideSuspectedDuplicates;

  React.useEffect(() => {
    hideSuspectedDuplicatesRef.current = hideSuspectedDuplicates;
  }, [hideSuspectedDuplicates]);

  React.useEffect(() => {
    fetchPausedRef.current = effectiveFetchPaused;
  }, [effectiveFetchPaused]);

  const applyFetchPause = React.useCallback((paused: boolean, refreshOnResume: boolean = false) => {
    if (!ready || !mapRef.current) return;
    const src: any = mapRef.current.getSource(ARC_SOURCE_ID);
    if (!src || src.arcgisType !== 'arcgis-rest' || !src._arcgis) return;
    if (minZoomToFetchRef.current == null) {
      const current = src._arcgis.minZoomToFetch;
      minZoomToFetchRef.current = Number.isFinite(current) ? current : 0;
    }
    if (paused) {
      src._arcgis.minZoomToFetch = Number.POSITIVE_INFINITY;
      try { src._abortAllPendingFetches?.(); } catch {}
      return;
    }
    src._arcgis.minZoomToFetch = minZoomToFetchRef.current ?? 0;
    if (refreshOnResume) {
      try { src.refresh?.(); } catch {}
    }
  }, [ready, mapRef]);

  React.useEffect(() => {
    const refreshOnResume = prevFetchPausedRef.current && !effectiveFetchPaused;
    applyFetchPause(effectiveFetchPaused, refreshOnResume);
    prevFetchPausedRef.current = effectiveFetchPaused;
  }, [effectiveFetchPaused, applyFetchPause]);

  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const opacity = Math.max(0, Math.min(1, Number.isFinite(layerOpacity) ? layerOpacity : 1));
    const layers = map.getStyle()?.layers || [];
    layers.forEach((layer: any) => {
      if (
        layer.id === DYNAMIC_LAYER_ID ||
        layer.id.startsWith(RENDERER_PREFIX) ||
        layer.id.startsWith(CUSTOM_PREFIX) ||
        layer.id.startsWith(VECTOR_LAYER_PREFIX)
      ) {
        applyOpacityToLayer(map, layer.id, opacity, opacityBaseRef.current);
      }
    });
  }, [layerOpacity, ready]);

  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (fetchControlRef.current) return;
    const map = mapRef.current;
    const control: maplibregl.IControl = {
      onAdd: () => {
        const container = document.createElement('div');
        container.className = 'maplibregl-ctrl maplibregl-ctrl-group odl-fetch-ctrl';
        setFetchControlContainer(container);
        return container;
      },
      onRemove: () => {
        setFetchControlContainer(null);
      }
    };
    map.addControl(control, 'top-left');
    fetchControlRef.current = control;
    return () => {
      try { map.removeControl(control); } catch {}
      fetchControlRef.current = null;
      setFetchControlContainer(null);
    };
  }, [ready, mapRef]);

  // Forward map position updates to parent
  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const reportBounds = () => {
      try {
        const b = map.getBounds();
        onBoundsChange?.(b);
        onCenterZoomChange?.(map.getCenter(), map.getZoom());
      } catch {}
    };
    map.on('moveend', reportBounds);
    map.on('zoomend', reportBounds);
    reportBounds();
    return () => {
      map.off('moveend', reportBounds);
      map.off('zoomend', reportBounds);
    };
  }, [ready, onBoundsChange, onCenterZoomChange, mapRef]);

  // Clear segment quality cache when zooming in by ≥1 integer level so geometry
  // gets re-fetched at the higher precision the new zoom affords.
  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const onZoomEnd = () => {
      try {
        const currentZoom = map.getZoom();
        if (Math.floor(currentZoom) > Math.floor(lastClearZoomRef.current)) {
          lastClearZoomRef.current = currentZoom;
          const src: any = map.getSource(ARC_SOURCE_ID);
          if (src?.arcgisType === 'arcgis-rest') {
            try { src._segments?.clearCache?.(); } catch {}
            try { src.refresh?.(); } catch {}
          }
        } else {
          lastClearZoomRef.current = currentZoom;
        }
      } catch {}
    };
    map.on('zoomend', onZoomEnd);
    return () => { map.off('zoomend', onZoomEnd); };
  }, [ready, mapRef]);

  // Mouse reporting
  React.useEffect(() => {
    if (!ready || !mapRef.current || !onMouseMove) return;
    const map = mapRef.current;
    const handler = (e: MapMouseEvent) => {
      try { onMouseMove(e.lngLat); } catch {}
    };
    map.on('mousemove', handler);
    return () => { map.off('mousemove', handler); };
  }, [ready, onMouseMove, mapRef]);

  // Track bearing + pitch so we can show the reset button
  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const update = () => { setBearing(map.getBearing()); setPitch(map.getPitch()); };
    map.on('rotateend', update);
    map.on('pitchend', update);
    return () => { map.off('rotateend', update); map.off('pitchend', update); };
  }, [ready, mapRef]);

  // Zoom to provided extent
  React.useEffect(() => {
    if (!ready || !mapRef.current || !zoomToExtent) return;
    const b = extentToBounds(zoomToExtent);
    if (b) {
      try { mapRef.current.fitBounds(b.toMaplibre(), { maxZoom: 12, padding: 24, duration: 0 }); } catch {}
    }
  }, [zoomToExtent, ready, mapRef]);

  // Track latest layer bounds for zoom requests
  React.useEffect(() => {
    layerBoundsRef.current = layerBounds;
  }, [layerBounds]);

  // Zoom to current layer bounds when requested
  const lastZoomTokenRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (zoomToLayerToken == null) return;
    if (lastZoomTokenRef.current === zoomToLayerToken) return;
    lastZoomTokenRef.current = zoomToLayerToken;
    const b = layerBoundsRef.current;
    if (!b) return;
    try { mapRef.current.fitBounds(b.toMaplibre(), { padding: 30, maxZoom: 12 }); } catch {}
  }, [zoomToLayerToken, ready]);

  // Clear selection when user interacts with the map background (click/drag/zoom)
  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const clearSelection = () => {
      try { onMapFeatureClickId?.(null); } catch {}
      setHoverFeatureId(null);
    };
    const clickHandler = (e: any) => {
      if (featureClickFlagRef.current) {
        featureClickFlagRef.current = false;
        return;
      }
      clearSelection();
    };
    map.on('click', clickHandler);
    return () => {
      map.off('click', clickHandler);
    };
  }, [ready, mapRef, onMapFeatureClickId]);

  // Clear selection on Escape for accessibility
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      try { onMapFeatureClickId?.(null); } catch {}
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onMapFeatureClickId]);

  // Add/update ArcGIS source when URL changes
  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    let cancelled = false;

    // cleanup previous layers/source
    interactionCleanupRef.current?.();
    interactionCleanupRef.current = null;
    sourceDataCleanupRef.current?.();
    sourceDataCleanupRef.current = null;
    clearRendererArtifacts(map, HIGHLIGHT_HOVER_PREFIX);
    clearRendererArtifacts(map, RENDERER_PREFIX);
    clearRendererArtifacts(map, CUSTOM_PREFIX);
    clearRendererArtifacts(map, HIGHLIGHT_SELECTED_PREFIX);
    clearRendererArtifacts(map, VECTOR_LAYER_PREFIX);
    try { if (map.getLayer(BASEMAP_LAYER_ID)) map.moveLayer(BASEMAP_LAYER_ID); } catch {}
    try { if (map.getLayer(DYNAMIC_LAYER_ID)) map.removeLayer(DYNAMIC_LAYER_ID); } catch {}
    try { if (map.getSource(DYNAMIC_SOURCE_ID)) map.removeSource(DYNAMIC_SOURCE_ID); } catch {}
    try { if (map.getSource(VECTOR_SOURCE_ID)) map.removeSource(VECTOR_SOURCE_ID); } catch {}
    try { if (map.getSource(ARC_SOURCE_ID)) map.removeSource(ARC_SOURCE_ID); } catch {}
    setLayerBounds(null);
    setHoverFeatureId(null);
    layerMetaRef.current = null;
    idFieldRef.current = undefined;
    geometryRef.current = undefined;
    minZoomToFetchRef.current = null;
    fetchOnceRef.current = false;
    opacityBaseRef.current.clear();
    segmentLruRef.current.clear();

    if (!serviceUrl) return;

    setIsLoading(true);
    onStatusChange?.('loading');

    (async () => {
      try {
        const resolved = resolveEsriLayer(serviceUrl, selectedMapLayerId);

        if (resolved.type === 'dynamic' && resolved.url) {
          onRenderModeChange?.('dynamic');

          // Fetch service metadata for extent/title
          let meta: any = null;
          try {
            if (resolved.serviceRootUrl) meta = await fetchServiceMetadata(resolved.serviceRootUrl).catch(() => null);
          } catch { /* ignore */ }
          if (meta) {
            try {
              const b = extentToBounds((meta as any).fullExtent || (meta as any).initialExtent || null);
              setLayerBounds(b);
              onDownloadedExtentChange?.(boundsToExtent4326(b));
              const summary = summarizeService(meta as any, undefined);
              onServiceMetadata?.(summary, meta);
            } catch { /* ignore */ }
          }

          const baseUrl = resolved.url.replace(/\/+$/, '');
          const tileInfo = (meta as any)?.tileInfo;
          const tileSize = Number(tileInfo?.rows || tileInfo?.cols) || 256;
          const tiles = tileInfo
            ? [`${baseUrl}/tile/{z}/{y}/{x}`]
            : [
              `${baseUrl}/export?f=image&format=png32&transparent=true&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=${tileSize},${tileSize}&dpi=96`
            ];
          try {
            map.addSource(DYNAMIC_SOURCE_ID, {
              type: 'raster',
              tiles,
              tileSize,
              attribution: (meta as any)?.copyrightText || ''
            } as any);
            map.addLayer({
              id: DYNAMIC_LAYER_ID,
              type: 'raster',
              source: DYNAMIC_SOURCE_ID,
              paint: { 'raster-opacity': RASTER_BASE_OPACITY }
            });
            applyOpacityToLayer(map, DYNAMIC_LAYER_ID, layerOpacity, opacityBaseRef.current);
            onStatusChange?.('loaded');
            setIsLoading(false);
            onFeatureCollection?.({ type: 'FeatureCollection', features: [] });
          } catch (err) {
            onStatusChange?.('error');
            setIsLoading(false);
          }
          return;
        }

        if (resolved.type === 'image' && resolved.url) {
          onRenderModeChange?.('image');

          let meta: any = null;
          try {
            if (resolved.serviceRootUrl) meta = await fetchServiceMetadata(resolved.serviceRootUrl).catch(() => null);
            else meta = await fetchServiceMetadata(resolved.url).catch(() => null);
          } catch { /* ignore */ }
          if (meta) {
            try {
              const b = extentToBounds((meta as any).fullExtent || (meta as any).initialExtent || null);
              setLayerBounds(b);
              onDownloadedExtentChange?.(boundsToExtent4326(b));
              const title = String((meta as any)?.name || (meta as any)?.serviceDescription || (meta as any)?.description || 'Image service').trim() || 'Image service';
              const summary = `${title} — ImageServer`;
              onServiceMetadata?.(summary, meta);
            } catch { /* ignore */ }
          }

          const baseUrl = resolved.url.replace(/\/+$/, '');
          const tileInfo = (meta as any)?.tileInfo;
          const tileSize = Number(tileInfo?.rows || tileInfo?.cols) || 256;
          const tiles = tileInfo
            ? [`${baseUrl}/tile/{z}/{y}/{x}`]
            : [
              `${baseUrl}/exportImage?f=image&format=png32&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=${tileSize},${tileSize}&dpi=96`
            ];
          try {
            map.addSource(DYNAMIC_SOURCE_ID, {
              type: 'raster',
              tiles,
              tileSize,
              attribution: (meta as any)?.copyrightText || ''
            } as any);
            map.addLayer({
              id: DYNAMIC_LAYER_ID,
              type: 'raster',
              source: DYNAMIC_SOURCE_ID,
              paint: { 'raster-opacity': RASTER_BASE_OPACITY }
            });
            applyOpacityToLayer(map, DYNAMIC_LAYER_ID, layerOpacity, opacityBaseRef.current);
            onStatusChange?.('loaded');
            setIsLoading(false);
            onFeatureCollection?.({ type: 'FeatureCollection', features: [] });
          } catch (err) {
            onStatusChange?.('error');
            setIsLoading(false);
          }
          return;
        }

        if (resolved.type === 'vector' && resolved.url) {
          onRenderModeChange?.('vector');

          let meta: any = null;
          try {
            if (resolved.serviceRootUrl) meta = await fetchServiceMetadata(resolved.serviceRootUrl).catch(() => null);
            else meta = await fetchServiceMetadata(resolved.url).catch(() => null);
          } catch { /* ignore */ }
          if (meta) {
            try {
              const b = extentToBounds((meta as any).fullExtent || (meta as any).initialExtent || null);
              setLayerBounds(b);
              onDownloadedExtentChange?.(boundsToExtent4326(b));
              const title = String((meta as any)?.name || (meta as any)?.serviceDescription || (meta as any)?.description || 'Vector tile service').trim() || 'Vector tile service';
              const summary = `${title} — VectorTileServer`;
              onServiceMetadata?.(summary, meta);
            } catch { /* ignore */ }
          }

          let styleJson: any = null;
          let styleUrl: string | null = null;
          const baseUrl = resolved.url.replace(/\/+$/, '');
          const styleUrls = [
            `${baseUrl}/resources/styles/root.json`,
            `${baseUrl}/resources/styles/root.json?f=pjson`,
            `${baseUrl}/resources/styles/root.json?f=json`
          ];
          for (const u of styleUrls) {
            try {
              const res = await fetch(u);
              if (!res.ok) continue;
              const json = await res.json();
              if (json && typeof json === 'object') { styleJson = json; styleUrl = u; break; }
            } catch { /* ignore */ }
          }
          if (!styleJson) {
            onStatusChange?.('error');
            setIsLoading(false);
            return;
          }

          try {
            clearRendererArtifacts(map, VECTOR_LAYER_PREFIX);
            try { if (map.getSource(VECTOR_SOURCE_ID)) map.removeSource(VECTOR_SOURCE_ID); } catch {}

            const styleSources = styleJson?.sources || {};
            const vectorSourceNames = Object.keys(styleSources).filter((k) => styleSources?.[k]?.type === 'vector');
            const sourceName = vectorSourceNames[0] || 'esri';
            const tileSize = Number(styleSources?.[sourceName]?.tileSize) || 512;
            const minzoom = Number(styleSources?.[sourceName]?.minzoom) || 0;
            const maxzoom = Number(styleSources?.[sourceName]?.maxzoom) || 22;

            const layers = Array.isArray(styleJson?.layers) ? styleJson.layers : [];
            const symbolLayers = layers.filter((l: any) => l?.type === 'symbol');
            const needsText = symbolLayers.some((l: any) => l?.layout?.['text-field']);
            const needsIcons = symbolLayers.some((l: any) => l?.layout?.['icon-image']);

            const resolveStyleAsset = (raw: string | undefined, fallback: string) => {
              if (!raw) return fallback;
              if (raw.startsWith('http')) return raw;
              try {
                return new URL(raw, styleUrl || `${baseUrl}/resources/styles/root.json`).toString();
              } catch {
                return fallback;
              }
            };

            const spriteUrl = resolveStyleAsset(styleJson?.sprite, `${baseUrl}/resources/sprites/sprite`);
            const glyphsUrl = resolveStyleAsset(styleJson?.glyphs, `${baseUrl}/resources/fonts/{fontstack}/{range}.pbf`);

            let spriteOk = !needsIcons;
            let glyphsOk = !needsText;

            if (needsIcons) {
              try {
                const spriteRes = await fetch(`${spriteUrl}.json`).catch(() => null);
                spriteOk = !!spriteRes?.ok;
              } catch { spriteOk = false; }
            }

            if (needsText) {
              const fontstack = symbolLayers
                .map((l: any) => l?.layout?.['text-font'])
                .find((fonts: any) => Array.isArray(fonts) && fonts.length > 0)?.[0];
              if (typeof fontstack === 'string' && fontstack.trim().length) {
                const testUrl = glyphsUrl
                  .replace('{fontstack}', encodeURIComponent(fontstack))
                  .replace('{range}', '0-255');
                try {
                  const glyphRes = await fetch(testUrl).catch(() => null);
                  glyphsOk = !!glyphRes?.ok;
                } catch { glyphsOk = false; }
              } else {
                // No explicit fontstack found; allow symbols and let MapLibre resolve.
                glyphsOk = true;
              }
            }

            const canRenderSymbols = symbolLayers.length > 0 ? (spriteOk && glyphsOk) : false;
            if (symbolLayers.length > 0 && !canRenderSymbols) {
              console.warn('[VectorTileServer] Could not load sprite/glyphs - labels will not appear');
            }

            if (canRenderSymbols) {
              try {
                const style = map.getStyle();
                if (style) {
                  const needsUpdate = style.sprite !== spriteUrl || style.glyphs !== glyphsUrl;
                  if (needsUpdate) {
                    style.sprite = spriteUrl;
                    style.glyphs = glyphsUrl;
                    map.setStyle(style, { diff: true });
                    await new Promise<void>((resolve) => {
                      if (map.isStyleLoaded()) { resolve(); return; }
                      const onData = () => {
                        if (map.isStyleLoaded()) {
                          map.off('styledata', onData);
                          resolve();
                        }
                      };
                      map.on('styledata', onData);
                    });
                  }
                }
              } catch { /* ignore style update errors */ }
            }

            map.addSource(VECTOR_SOURCE_ID, {
              type: 'vector',
              tiles: [`${baseUrl}/tile/{z}/{y}/{x}.pbf`],
              tileSize,
              minzoom,
              maxzoom,
              attribution: (meta as any)?.copyrightText || ''
            } as any);

            const allowAnySource = vectorSourceNames.length === 0;
            const vectorLayers = layers.filter((l: any) =>
              l &&
              l.type !== 'background' &&
              (canRenderSymbols || l.type !== 'symbol') &&
              (allowAnySource || !l.source || vectorSourceNames.includes(l.source))
            );

            const buildLabelDotLayer = (layer: any): any | null => {
              if (!layer || layer.type !== 'symbol') return null;
              const layout = layer.layout || {};
              if (!layout['text-field']) return null;
              if (layout['icon-image']) return null;
              const placement = layout['symbol-placement'];
              if (placement && placement !== 'point') return null;
              const sourceLayer = layer['source-layer'] || layer.sourceLayer;
              if (!sourceLayer) return null;
              const textColor = layer.paint?.['text-color'];
              const textOpacity = layer.paint?.['text-opacity'];
              const dot: any = {
                id: `${VECTOR_LAYER_PREFIX}-${layer.id}-dot`,
                type: 'circle',
                source: VECTOR_SOURCE_ID,
                'source-layer': sourceLayer,
                paint: {
                  'circle-color': textColor ?? ACCENT_COLOR,
                  'circle-opacity': textOpacity ?? 0.9,
                  'circle-radius': 3,
                  'circle-stroke-color': '#ffffff',
                  'circle-stroke-width': 0.5
                }
              };
              if (layout.visibility) dot.layout = { visibility: layout.visibility };
              const baseFilter: any = ['==', '$type', 'Point'];
              if (layer.filter) dot.filter = ['all', baseFilter, layer.filter];
              else dot.filter = baseFilter;
              if (layer.minzoom != null) dot.minzoom = layer.minzoom;
              if (layer.maxzoom != null) dot.maxzoom = layer.maxzoom;
              return dot;
            };

            vectorLayers.forEach((l: any) => {
              if (canRenderSymbols) {
                const dot = buildLabelDotLayer(l);
                if (dot) {
                  try {
                    map.addLayer(dot);
                    applyOpacityToLayer(map, dot.id, layerOpacity, opacityBaseRef.current);
                  } catch {}
                }
              }
              const next = { ...l, id: `${VECTOR_LAYER_PREFIX}-${l.id}`, source: VECTOR_SOURCE_ID };
              try {
                map.addLayer(next);
                applyOpacityToLayer(map, next.id, layerOpacity, opacityBaseRef.current);
              } catch {}
            });
            onStatusChange?.('loaded');
            setIsLoading(false);
            onFeatureCollection?.({ type: 'FeatureCollection', features: [] });
          } catch {
            onStatusChange?.('error');
            setIsLoading(false);
          }
          return;
        }

        if (resolved.type !== 'feature' || !resolved.url) {
          onRenderModeChange?.('fallback_dynamic', 'Only FeatureServer layers are supported in MapLibre mode');
          onStatusChange?.('error');
          setIsLoading(false);
          return;
        }

        const layerUrl = resolved.url;
        const [serviceMeta, lm] = await Promise.all([
          resolved.serviceRootUrl ? fetchServiceMetadata(resolved.serviceRootUrl).catch(() => null) : Promise.resolve(null),
          fetchLayerMetadata(layerUrl).catch(() => null)
        ]);
        if (cancelled) return;
        layerMetaRef.current = lm;
        geometryRef.current = normalizeGeometryType(lm?.geometryType) ?? 'polygon';
        const idField =
          (lm as any)?.objectIdField ||
          (lm as any)?.objectIdFieldName ||
          (lm as any)?.uniqueIdField?.name ||
          (lm as any)?.drawingInfo?.renderer?.field1 ||
          undefined;
        idFieldRef.current = idField;

        if (serviceMeta) {
          try {
            const summary = summarizeService(serviceMeta as any, resolved.layerId);
            onServiceMetadata?.(summary, serviceMeta);
          } catch {}
        }

        const layerType = String((lm as any)?.type || '').toLowerCase();
        const geometryType = String((lm as any)?.geometryType || '').toLowerCase();
        const capabilities = String((lm as any)?.capabilities || '').toLowerCase();
        const hasGeometry = !!geometryType && geometryType !== 'esrigeometrynone';
        const isRasterLike = layerType.includes('raster') || layerType.includes('image') || layerType.includes('mosaic');
        const isGroupLayer = layerType.includes('group');
        const hasQueryCapability = !capabilities || capabilities.includes('query');
        const isQueryable = hasGeometry && !isRasterLike && !isGroupLayer && hasQueryCapability;

        if (!isQueryable) {
          const baseUrl = (resolved.serviceRootUrl || resolved.url || '').replace(/\/+$/, '');
          const tileInfo = (serviceMeta as any)?.tileInfo;
          const tileSize = Number(tileInfo?.rows || tileInfo?.cols) || 256;
          const layerFilter = typeof resolved.layerId === 'number' ? `show:${resolved.layerId}` : '';
          const layersParam = layerFilter ? `&layers=${encodeURIComponent(layerFilter)}` : '';
          const tiles = (tileInfo && !layerFilter)
            ? [`${baseUrl}/tile/{z}/{y}/{x}`]
            : [
              `${baseUrl}/export?f=image&format=png32&transparent=true&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=${tileSize},${tileSize}&dpi=96${layersParam}`
            ];

          try {
            if (serviceMeta) {
              const b = extentToBounds((serviceMeta as any).fullExtent || (serviceMeta as any).initialExtent || null);
              setLayerBounds(b);
              onDownloadedExtentChange?.(boundsToExtent4326(b));
            } else if ((lm as any)?.extent) {
              const b = extentToBounds((lm as any).extent || null);
              setLayerBounds(b);
              onDownloadedExtentChange?.(boundsToExtent4326(b));
            }
          } catch { /* ignore extent */ }

          try {
            map.addSource(DYNAMIC_SOURCE_ID, {
              type: 'raster',
              tiles,
              tileSize,
              attribution: (serviceMeta as any)?.copyrightText || ''
            } as any);
            map.addLayer({
              id: DYNAMIC_LAYER_ID,
              type: 'raster',
              source: DYNAMIC_SOURCE_ID,
              paint: { 'raster-opacity': RASTER_BASE_OPACITY }
            });
            applyOpacityToLayer(map, DYNAMIC_LAYER_ID, layerOpacity, opacityBaseRef.current);
          } catch {}

          onRenderModeChange?.('dynamic', `Layer does not support Query (${(lm as any)?.type || 'non-feature'})`);
          onStatusChange?.('loaded');
          setIsLoading(false);
          onFeatureCollection?.({ type: 'FeatureCollection', features: [] });
          return;
        }

        clearRendererArtifacts(map, HIGHLIGHT_HOVER_PREFIX);
        clearRendererArtifacts(map, HIGHLIGHT_SELECTED_PREFIX);
        clearRendererArtifacts(map, RENDERER_PREFIX);
        clearRendererArtifacts(map, CUSTOM_PREFIX);
        try { if (map.getLayer(ARC_SOURCE_ID)) map.removeLayer(ARC_SOURCE_ID); } catch {}
        try { if (map.getSource(ARC_SOURCE_ID)) map.removeSource(ARC_SOURCE_ID); } catch {}
        map.addSource(ARC_SOURCE_ID, {
          type: 'arcgis-rest',
          url: layerUrl,
          where: (where || '1=1').trim() || '1=1',
          outFields: '*',
          idField: idField || 'OBJECTID',
          promoteId: idField || undefined,
          pageSize: ARC_PAGE_SIZE_START,
          requestBuffer: 0.2,
          debounce: ARC_PAN_DEBOUNCE_MS,
          maxAllowableOffsetPixels: 1.5,
          data: { type: 'FeatureCollection', features: [] }
        } as any);
        try {
          const src: any = map.getSource(ARC_SOURCE_ID);
          installArcgisSegmentLru(src, segmentLruRef.current, ARC_SEGMENT_CACHE_MAX);
          if (src?.arcgisType === 'arcgis-rest' && src?._arcgis) {
            const initialPageSize = normalizePageSize(ARC_PAGE_SIZE_START, Number(src?._serviceInfo?.maxRecordCount));
            arcPageSizeRef.current = initialPageSize;
            src._arcgis.pageSize = initialPageSize;
          }
        } catch {}
        applyFetchPause(fetchPausedRef.current);

        onRenderModeChange?.('feature');

        const geomForHighlight = geometryRef.current ?? normalizeGeometryType((lm as any)?.geometryType) ?? 'polygon';
        ensureHighlightLayers(map, ARC_SOURCE_ID, geomForHighlight);
        ensureLegendHighlightLayers(map, ARC_SOURCE_ID, geomForHighlight);
        applyLegendHighlightFilter(map, legendHighlightFilterRef.current, suspectedDuplicateIdsRef.current, hideSuspectedDuplicatesRef.current);
        updateHighlightStates(map, ARC_SOURCE_ID, hoverFeatureId, selectedFeatureId, prevHoverIdRef.current, prevSelectedIdRef.current);
        moveOverlayLayersToTop(map);

        // Apply renderer or custom style
        const applyStyle = async () => {
          const styleApplyVersion = ++styleApplyVersionRef.current;
          const isCurrentStyleApply = () =>
            !cancelled &&
            styleApplyVersionRef.current === styleApplyVersion &&
            Boolean(map.getSource(ARC_SOURCE_ID));

          const geom = geometryRef.current ?? normalizeGeometryType((lm as any)?.geometryType) ?? 'polygon';
          const applied = await applyFeatureSourceStyle({
            map,
            sourceId: ARC_SOURCE_ID,
            geometry: geom,
            styleMode,
            customStyle,
            attributeStyle,
            renderer: (lm as any)?.drawingInfo?.renderer,
            rendererLayerPrefix: RENDERER_PREFIX,
            customLayerPrefix: CUSTOM_PREFIX,
            lineHitLayerId: LINE_HIT_LAYER_ID,
            pointLabelFallbackColor: ACCENT_COLOR
          });
          if (!isCurrentStyleApply()) {
            clearRendererArtifacts(map, RENDERER_PREFIX);
            clearRendererArtifacts(map, CUSTOM_PREFIX);
            return;
          }
          applied.visualLayerIds.forEach((id) => {
            opacityBaseRef.current.delete(id);
            applyOpacityToLayer(map, id, layerOpacity, opacityBaseRef.current);
          });
          styledLayerIdsRef.current = applied.interactiveLayerIds;
          duplicateFilterBaseRef.current.clear();
          applySuspectedDuplicateFilter(map, styledLayerIdsRef.current, duplicateFilterBaseRef.current, suspectedDuplicateIdsRef.current, hideSuspectedDuplicatesRef.current);
          interactionCleanupRef.current?.();
          interactionCleanupRef.current = bindFeatureInteractions(
            map,
            applied.interactiveLayerIds,
            (id) => setHoverFeatureId(id),
            onMapFeatureClickId,
            featureClickFlagRef
          );
          if (!isCurrentStyleApply()) return;
          updateHighlightStates(map, ARC_SOURCE_ID, hoverFeatureId, selectedFeatureId, prevHoverIdRef.current, prevSelectedIdRef.current);
          moveOverlayLayersToTop(map);
        };
        await applyStyle();

        // Listen for source data to emit feature collection and bounds
        let latestPendingCount: number | null = null;
        let previousPendingCount: number | null = null;
        let cycleHadFailure = false;
        let stableFeatureCount = 0;
        let snapshotTimer: number | null = null;
        const flushSourceSnapshot = () => {
          try {
            const src: any = map.getSource(ARC_SOURCE_ID);
            if (!src) return;
            const rawFeatures = collectFeaturesFromSource(src);
            const { features: feats, summary } = dedupeFeatures(rawFeatures);
            if (summary.reportKey !== duplicateReportKeyRef.current) {
              duplicateReportKeyRef.current = summary.reportKey;
              onDuplicateSummaryChangeRef.current?.(summary);
              if (summary.duplicateCount > 0) {
                console.warn('[arcgis-preview] Duplicate features detected and deduped', summary);
              } else if (summary.repeatedGeometryCount > 0) {
                console.warn('[arcgis-preview] Repeated feature geometries detected', summary);
              }
            }
            suspectedDuplicateIdsRef.current = summary.suspectedDuplicateIds;
            applySuspectedDuplicateFilter(map, styledLayerIdsRef.current, duplicateFilterBaseRef.current, suspectedDuplicateIdsRef.current, hideSuspectedDuplicatesRef.current);
            applyLegendHighlightFilter(map, legendHighlightFilterRef.current, suspectedDuplicateIdsRef.current, hideSuspectedDuplicatesRef.current);
            const fc: FeatureCollection = { type: 'FeatureCollection', features: feats };
            onFeatureCollection?.(fc);
            const b = boundsFromFeatures(feats);
            setLayerBounds(b);
            onDownloadedExtentChange?.(boundsToExtent4326(b));
            if (latestPendingCount != null) {
              if (latestPendingCount > 0) {
                setIsLoading(true);
                onStatusChange?.('loading');
              } else {
                setIsLoading(false);
                onStatusChange?.('loaded');
              }
            }
          } catch {}
        };
        const scheduleSourceSnapshot = () => {
          if (snapshotTimer != null) return;
          snapshotTimer = window.setTimeout(() => {
            snapshotTimer = null;
            flushSourceSnapshot();
          }, ARC_SNAPSHOT_DEBOUNCE_MS);
        };
        const dataHandler = (e?: any) => {
          try {
            if (e?.sourceId && e.sourceId !== ARC_SOURCE_ID) return;
            const src: any = map.getSource(ARC_SOURCE_ID);
            if (!src) return;

            let pendingCount: number | null = null;
            if (src?.arcgisType === 'arcgis-rest') {
              try {
                const pending = src._segments?.pending;
                pendingCount = typeof pending?.size === 'number' ? pending.size : null;
              } catch {}
            }
            latestPendingCount = pendingCount;

            if (src?.arcgisType === 'arcgis-rest' && src?._arcgis) {
              const maxRecordCount = Number(src?._serviceInfo?.maxRecordCount);
              const cycleSettled =
                previousPendingCount != null &&
                previousPendingCount > 0 &&
                pendingCount != null &&
                pendingCount === 0;
              if (cycleSettled) {
                const renderedCount = estimateSourceFeatureCount(src);
                if (!cycleHadFailure && renderedCount > stableFeatureCount) {
                  const nextPageSize = normalizePageSize(arcPageSizeRef.current * 2, maxRecordCount);
                  if (nextPageSize !== arcPageSizeRef.current) {
                    arcPageSizeRef.current = nextPageSize;
                    src._arcgis.pageSize = nextPageSize;
                  }
                }
                stableFeatureCount = renderedCount;
                cycleHadFailure = false;
              }
            }
            previousPendingCount = pendingCount;

            if (pendingCount != null && pendingCount > 0) {
              setIsLoading(true);
              onStatusChange?.('loading');
            }

            scheduleSourceSnapshot();

            if (fetchOnceRef.current && fetchPausedRef.current && src?.arcgisType === 'arcgis-rest') {
              if (pendingCount == null || pendingCount === 0) {
                try {
                  if (minZoomToFetchRef.current == null && src._arcgis?.minZoomToFetch != null) {
                    minZoomToFetchRef.current = src._arcgis.minZoomToFetch;
                  }
                  src._arcgis.minZoomToFetch = Number.POSITIVE_INFINITY;
                  src._abortAllPendingFetches?.();
                } catch {}
                fetchOnceRef.current = false;
              }
            }
          } catch {}
        };
        const loadingHandler = (e: any) => {
          try {
            if (e?.sourceId && e.sourceId !== ARC_SOURCE_ID) return;
            setIsLoading(true);
            onStatusChange?.('loading');
          } catch {}
        };
        const errorHandler = (e: any) => {
          try {
            if (e?.sourceId && e.sourceId !== ARC_SOURCE_ID) return;
            const src: any = map.getSource(ARC_SOURCE_ID);
            if (!src || src.arcgisType !== 'arcgis-rest' || !src._arcgis) return;
            if (cycleHadFailure) return;
            cycleHadFailure = true;

            const maxRecordCount = Number(src?._serviceInfo?.maxRecordCount);
            const nextPageSize = normalizePageSize(Math.floor(arcPageSizeRef.current / 2), maxRecordCount);
            if (nextPageSize < arcPageSizeRef.current) {
              arcPageSizeRef.current = nextPageSize;
              src._arcgis.pageSize = nextPageSize;
              let pendingCount: number | null = null;
              try {
                const pending = src._segments?.pending;
                pendingCount = typeof pending?.size === 'number' ? pending.size : null;
              } catch {}
              if (pendingCount != null && pendingCount > 0) {
                try { src._abortAllPendingFetches?.(); } catch {}
                try { src.refresh?.(); } catch {}
              }
            }
          } catch {}
        };
        const idleHandler = () => {
          try {
            if (!isLoadingRef.current) return;
            const src: any = map.getSource(ARC_SOURCE_ID);
            if (!src || src.arcgisType !== 'arcgis-rest') return;
            let pendingCount: number | null = null;
            try {
              const pending = src._segments?.pending;
              pendingCount = typeof pending?.size === 'number' ? pending.size : null;
            } catch {}
            if (pendingCount != null && pendingCount > 0) return;
            latestPendingCount = pendingCount;
            if (snapshotTimer != null) {
              window.clearTimeout(snapshotTimer);
              snapshotTimer = null;
            }
            flushSourceSnapshot();
          } catch {}
        };
        map.on('sourcedata', dataHandler);
        map.on('dataloading', loadingHandler);
        map.on('error', errorHandler);
        map.on('idle', idleHandler);
        sourceDataCleanupRef.current = () => {
          if (snapshotTimer != null) {
            window.clearTimeout(snapshotTimer);
            snapshotTimer = null;
          }
          map.off('sourcedata', dataHandler);
          map.off('dataloading', loadingHandler);
          map.off('error', errorHandler);
          map.off('idle', idleHandler);
        };
      } catch (err) {
        if (cancelled) return;
        onStatusChange?.('error');
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      styleApplyVersionRef.current += 1;
      interactionCleanupRef.current?.();
      interactionCleanupRef.current = null;
      sourceDataCleanupRef.current?.();
      sourceDataCleanupRef.current = null;
      duplicateReportKeyRef.current = '';
      duplicateFilterBaseRef.current.clear();
      suspectedDuplicateIdsRef.current = [];
      styledLayerIdsRef.current = [];
      clearRendererArtifacts(map, HIGHLIGHT_HOVER_PREFIX);
      clearRendererArtifacts(map, HIGHLIGHT_SELECTED_PREFIX);
      clearRendererArtifacts(map, HIGHLIGHT_LEGEND_PREFIX);
      clearRendererArtifacts(map, RENDERER_PREFIX);
      clearRendererArtifacts(map, CUSTOM_PREFIX);
      clearRendererArtifacts(map, VECTOR_LAYER_PREFIX);
      try { if (map.getLayer(`${FLASH_LAYER_PREFIX}-fill`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-fill`); } catch {}
      try { if (map.getLayer(`${FLASH_LAYER_PREFIX}-line`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-line`); } catch {}
      try { if (map.getLayer(`${FLASH_LAYER_PREFIX}-circle`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-circle`); } catch {}
      try { if (map.getSource(FLASH_SOURCE_ID)) map.removeSource(FLASH_SOURCE_ID); } catch {}
      try { if (map.getLayer(DYNAMIC_LAYER_ID)) map.removeLayer(DYNAMIC_LAYER_ID); } catch {}
      try { if (map.getSource(DYNAMIC_SOURCE_ID)) map.removeSource(DYNAMIC_SOURCE_ID); } catch {}
      try { if (map.getSource(VECTOR_SOURCE_ID)) map.removeSource(VECTOR_SOURCE_ID); } catch {}
      try { if (map.getSource(ARC_SOURCE_ID)) map.removeSource(ARC_SOURCE_ID); } catch {}
    };
  }, [serviceUrl, selectedMapLayerId, ready]);

  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    try {
      const map = mapRef.current;
      if (!map.getSource(ARC_SOURCE_ID)) return;
      ensureLegendHighlightLayers(map, ARC_SOURCE_ID, geometryRef.current);
      applyLegendHighlightFilter(map, legendHighlightFilter, suspectedDuplicateIdsRef.current, hideSuspectedDuplicatesRef.current);
      moveOverlayLayersToTop(map);
    } catch {}
  }, [ready, JSON.stringify(legendHighlightFilter ?? null), hideSuspectedDuplicates]);

  // Update where without recreating the source
  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    try {
      const src: any = mapRef.current.getSource(ARC_SOURCE_ID);
      if (src?.setWhere) {
        if (src?.arcgisType === 'arcgis-rest' && src?._arcgis) {
          const resetPageSize = normalizePageSize(ARC_PAGE_SIZE_START, Number(src?._serviceInfo?.maxRecordCount));
          arcPageSizeRef.current = resetPageSize;
          src._arcgis.pageSize = resetPageSize;
        }
        src.setWhere((where || '1=1').trim() || '1=1');
        setIsLoading(true);
        onStatusChange?.('loading');
      }
    } catch {}
  }, [where, ready]);

  // Reapply styling when style mode changes
  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    const styleApplyVersion = ++styleApplyVersionRef.current;
    const isCurrentStyleApply = () =>
      styleApplyVersionRef.current === styleApplyVersion &&
      Boolean(map.getSource(ARC_SOURCE_ID));
    try {
      const src: any = map.getSource(ARC_SOURCE_ID);
      if (!src) return;
      const lm = layerMetaRef.current;
      void applyFeatureSourceStyle({
        map,
        sourceId: ARC_SOURCE_ID,
        geometry: geometryRef.current ?? normalizeGeometryType((lm as any)?.geometryType) ?? 'polygon',
        styleMode,
        customStyle,
        attributeStyle,
        renderer: (lm as any)?.drawingInfo?.renderer,
        rendererLayerPrefix: RENDERER_PREFIX,
        customLayerPrefix: CUSTOM_PREFIX,
        lineHitLayerId: LINE_HIT_LAYER_ID,
        pointLabelFallbackColor: ACCENT_COLOR
      }).then((applied) => {
        if (!isCurrentStyleApply()) {
          clearRendererArtifacts(map, RENDERER_PREFIX);
          clearRendererArtifacts(map, CUSTOM_PREFIX);
          return;
        }
        applied.visualLayerIds.forEach((id) => {
          opacityBaseRef.current.delete(id);
          applyOpacityToLayer(map, id, layerOpacity, opacityBaseRef.current);
        });
        styledLayerIdsRef.current = applied.interactiveLayerIds;
        duplicateFilterBaseRef.current.clear();
        applySuspectedDuplicateFilter(map, styledLayerIdsRef.current, duplicateFilterBaseRef.current, suspectedDuplicateIdsRef.current, hideSuspectedDuplicates);
        interactionCleanupRef.current?.();
        interactionCleanupRef.current = bindFeatureInteractions(
          map,
          applied.interactiveLayerIds,
          (id) => setHoverFeatureId(id),
          onMapFeatureClickId,
          featureClickFlagRef
        );
        updateHighlightStates(map, ARC_SOURCE_ID, hoverFeatureId, selectedFeatureId, prevHoverIdRef.current, prevSelectedIdRef.current);
        moveOverlayLayersToTop(map);
      }).catch(() => {});
    } catch {}
    return () => {
      if (styleApplyVersionRef.current === styleApplyVersion) {
        styleApplyVersionRef.current += 1;
      }
    };
  }, [styleMode, JSON.stringify(customStyle || {}), JSON.stringify(attributeStyle?.rule ?? null), ready, hideSuspectedDuplicates]);

  // Flash overlay for selected feature
  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    if (flashTimeoutRef.current) {
      window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    try {
      if (map.getLayer(`${FLASH_LAYER_PREFIX}-fill`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-fill`);
      if (map.getLayer(`${FLASH_LAYER_PREFIX}-line`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-line`);
      if (map.getLayer(`${FLASH_LAYER_PREFIX}-circle`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-circle`);
      if (map.getSource(FLASH_SOURCE_ID)) map.removeSource(FLASH_SOURCE_ID);
    } catch {}
    if (!flashFeature || !flashFeature.geometry) return;
    try {
      map.addSource(FLASH_SOURCE_ID, { type: 'geojson', data: flashFeature } as any);
      const geomType = String((flashFeature as any).geometry?.type || '').toLowerCase();
      if (geomType.includes('point')) {
        map.addLayer({
          id: `${FLASH_LAYER_PREFIX}-circle`,
          type: 'circle',
          source: FLASH_SOURCE_ID,
          paint: {
            'circle-color': ACCENT_COLOR,
            'circle-opacity': 0.4,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 10, 10, 16, 14, 22],
            'circle-stroke-color': ACCENT_COLOR,
            'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 10, 4, 14, 5.5],
            'circle-stroke-opacity': 0.9
          }
        });
      } else if (geomType.includes('line')) {
        map.addLayer({
          id: `${FLASH_LAYER_PREFIX}-line`,
          type: 'line',
          source: FLASH_SOURCE_ID,
          paint: {
            'line-color': ACCENT_COLOR,
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 4, 10, 8, 14, 12],
            'line-opacity': 0.85
          }
        });
      } else {
        map.addLayer({
          id: `${FLASH_LAYER_PREFIX}-fill`,
          type: 'fill',
          source: FLASH_SOURCE_ID,
          paint: {
            'fill-color': ACCENT_COLOR,
            'fill-opacity': 0.2
          }
        });
        map.addLayer({
          id: `${FLASH_LAYER_PREFIX}-line`,
          type: 'line',
          source: FLASH_SOURCE_ID,
          paint: {
            'line-color': ACCENT_COLOR,
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2.5, 10, 4.5, 14, 6.5],
            'line-opacity': 0.9
          }
        });
      }
      moveOverlayLayersToTop(map);
      flashTimeoutRef.current = window.setTimeout(() => {
        try {
          if (map.getLayer(`${FLASH_LAYER_PREFIX}-fill`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-fill`);
          if (map.getLayer(`${FLASH_LAYER_PREFIX}-line`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-line`);
          if (map.getLayer(`${FLASH_LAYER_PREFIX}-circle`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-circle`);
          if (map.getSource(FLASH_SOURCE_ID)) map.removeSource(FLASH_SOURCE_ID);
        } catch {}
      }, 1400);
    } catch {}
    return () => {
      if (flashTimeoutRef.current) { window.clearTimeout(flashTimeoutRef.current); flashTimeoutRef.current = null; }
      try {
        if (map.getLayer(`${FLASH_LAYER_PREFIX}-fill`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-fill`);
        if (map.getLayer(`${FLASH_LAYER_PREFIX}-line`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-line`);
        if (map.getLayer(`${FLASH_LAYER_PREFIX}-circle`)) map.removeLayer(`${FLASH_LAYER_PREFIX}-circle`);
        if (map.getSource(FLASH_SOURCE_ID)) map.removeSource(FLASH_SOURCE_ID);
      } catch {}
    };
  }, [flashFeature, ready]);

  // Effective hover = whatever the map mouse is over, else an externally driven
  // id (e.g. a hovered Data-tab row). Mouse-over the map always wins.
  const effectiveHoverId = hoverFeatureId != null ? hoverFeatureId : (externalHoverId ?? null);

  // Emit the map's own hovered feature so callers can highlight it elsewhere
  // (e.g. the Data tab). Uses a ref so an unstable callback prop doesn't churn.
  const onHoverFeatureIdRef = React.useRef(onHoverFeatureId);
  React.useEffect(() => { onHoverFeatureIdRef.current = onHoverFeatureId; });
  React.useEffect(() => { onHoverFeatureIdRef.current?.(hoverFeatureId); }, [hoverFeatureId]);

  // Selection + hover highlight updates
  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    try {
      updateHighlightStates(mapRef.current, ARC_SOURCE_ID, effectiveHoverId, selectedFeatureId, prevHoverIdRef.current, prevSelectedIdRef.current);
      prevHoverIdRef.current = effectiveHoverId;
      prevSelectedIdRef.current = selectedFeatureId ?? null;
    } catch {}
  }, [effectiveHoverId, selectedFeatureId, ready]);

  const pauseSupported = (() => {
    try {
      const src: any = mapRef.current?.getSource(ARC_SOURCE_ID);
      return !!src && src.arcgisType === 'arcgis-rest';
    } catch {
      return false;
    }
  })();

  // Keep user's auto-fetch preference even when a layer is not yet supported/visible.

  const handleFetchNow = React.useCallback(() => {
    if (forcedFetchPaused) return;
    if (!ready || !mapRef.current) return;
    const src: any = mapRef.current.getSource(ARC_SOURCE_ID);
    if (!src || src.arcgisType !== 'arcgis-rest' || !src._arcgis) return;
    if (minZoomToFetchRef.current == null) {
      const current = src._arcgis.minZoomToFetch;
      minZoomToFetchRef.current = Number.isFinite(current) ? current : 0;
    }
    if (fetchPausedRef.current) {
      fetchOnceRef.current = true;
      src._arcgis.minZoomToFetch = minZoomToFetchRef.current ?? 0;
    } else {
      fetchOnceRef.current = false;
    }
    try {
      setIsLoading(true);
      onStatusChange?.('loading');
    } catch {}
    try { src.refresh?.(); } catch {}
  }, [forcedFetchPaused, ready, mapRef, onStatusChange]);

  const handleClearData = React.useCallback(() => {
    if (!ready || !mapRef.current) return;
    const src: any = mapRef.current.getSource(ARC_SOURCE_ID);
    if (!src || src.arcgisType !== 'arcgis-rest') return;
    try { src._resetFeatures?.(); } catch {}
    try { onFeatureCollection?.({ type: 'FeatureCollection', features: [] }); } catch {}
    try { setLayerBounds(null); } catch {}
    try { onDownloadedExtentChange?.(null); } catch {}
    try { setHoverFeatureId(null); } catch {}
    try { prevHoverIdRef.current = null; } catch {}
  }, [ready, mapRef, onFeatureCollection, onDownloadedExtentChange]);

  const renderedCount = React.useMemo(() => {
    try {
      return Array.isArray(featureCollection?.features) ? featureCollection.features.length : 0;
    } catch {
      return 0;
    }
  }, [featureCollection]);

  const fetchControl = fetchControlContainer ? createPortal(
    <FetchControl
      autoFetch={!effectiveFetchPaused}
      supported={pauseSupported}
      isLoading={isLoading}
      renderedCount={renderedCount}
      onToggleAuto={() => { setFetchPaused((p) => !p); }}
      onFetchNow={handleFetchNow}
      onClearData={handleClearData}
    />,
    fetchControlContainer
  ) : null;

  return (
      <div style={{ position: 'relative', height: '100%', width: '100%', minHeight: 0 }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {fetchControl}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <BasemapChooser value={basemap} onChange={(b) => onBasemapChange?.(b as BasemapKey)} />
        {/* Compass / north-reset — only visible when rotated or tilted */}
        {(Math.abs(bearing) > 1 || pitch > 1) && (
          <button
            title="Reset bearing and pitch"
            onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0, duration: 300 })}
            style={MAP_BTN_STYLE}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ transform: `rotate(${-bearing}deg)`, transition: 'transform 0.1s' }}>
              <polygon points="10,2 12.5,10 10,8.5 7.5,10" fill="var(--accent, #5b8cff)" />
              <polygon points="10,18 12.5,10 10,11.5 7.5,10" fill="var(--muted, #888)" />
            </svg>
          </button>
        )}
        {/* Zoom in / out */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
          <button
            title="Zoom in"
            onClick={() => mapRef.current?.zoomIn()}
            style={{ ...MAP_BTN_STYLE, border: 'none', borderRadius: 0, borderBottom: '1px solid var(--border)', boxShadow: 'none', fontSize: 18 }}
          >+</button>
          <button
            title="Zoom out"
            onClick={() => mapRef.current?.zoomOut()}
            style={{ ...MAP_BTN_STYLE, border: 'none', borderRadius: 0, boxShadow: 'none', fontSize: 18 }}
          >−</button>
        </div>
      </div>
    </div>
  );
}

function FetchControl({
  autoFetch,
  supported,
  isLoading,
  renderedCount,
  onToggleAuto,
  onFetchNow,
  onClearData,
}: {
  autoFetch: boolean;
  supported: boolean;
  isLoading: boolean;
  renderedCount: number;
  onToggleAuto: () => void;
  onFetchNow: () => void;
  onClearData: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className={`fetch-ctrl ${open ? 'is-open' : ''}`}>
      {/* Header - clickable */}
      <button
        type="button"
        className="fetch-ctrl-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`fetch-ctrl-status ${autoFetch ? 'is-live' : 'is-paused'} ${isLoading ? 'is-loading' : ''}`}>
          {autoFetch ? (
            <svg viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="8" r="5" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="currentColor">
              <rect x="3" y="3" width="4" height="10" rx="1" />
              <rect x="9" y="3" width="4" height="10" rx="1" />
            </svg>
          )}
        </span>
        {renderedCount > 0 && (
          <span className="fetch-ctrl-count">{renderedCount.toLocaleString()}</span>
        )}
        <svg className="fetch-ctrl-chevron" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.47 5.47a.75.75 0 011.06 0L8 7.94l2.47-2.47a.75.75 0 111.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 010-1.06z" />
        </svg>
      </button>

      {/* Panel */}
      <div className="fetch-ctrl-panel">
        <div className="fetch-ctrl-row">
          <span className="fetch-ctrl-label">Sync on pan</span>
          <button
            type="button"
            className={`fetch-ctrl-switch ${autoFetch ? 'is-on' : ''}`}
            onClick={onToggleAuto}
            role="switch"
            aria-checked={autoFetch}
          >
            <span className="fetch-ctrl-switch-thumb" />
          </button>
        </div>
        <div className="fetch-ctrl-divider" />
        <div className="fetch-ctrl-actions">
          <button
            type="button"
            className="fetch-ctrl-action"
            onClick={onFetchNow}
            disabled={!supported || isLoading}
            title="Fetch current view"
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.705 8.005a.75.75 0 01.834.656 5.5 5.5 0 009.592 2.97l-1.204-1.204a.25.25 0 01.177-.427h3.646a.25.25 0 01.25.25v3.646a.25.25 0 01-.427.177l-1.38-1.38A7.001 7.001 0 011.05 8.84a.75.75 0 01.656-.834zM8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0114.95 7.16a.75.75 0 11-1.49.178A5.5 5.5 0 008 2.5z" />
            </svg>
            <span>Fetch</span>
          </button>
          <button
            type="button"
            className="fetch-ctrl-action"
            onClick={onClearData}
            disabled={!supported || renderedCount === 0}
            title="Clear cached data"
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M11 1.75V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM6.5 1.75V3h3V1.75a.25.25 0 00-.25-.25h-2.5a.25.25 0 00-.25.25zM4.5 5.5h7l-.9 9.2a1.75 1.75 0 01-1.74 1.55H7.14a1.75 1.75 0 01-1.74-1.55L4.5 5.5z" />
            </svg>
            <span>Clear</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function bindFeatureInteractions(
  map: MapLibreMap,
  layerIds: string[],
  onHover?: (id: string | number | null) => void,
  onClick?: (id: string | number | null) => void,
  featureClickRef?: React.MutableRefObject<boolean>
) {
  const handleEnter = () => {
    try { map.getCanvas().style.cursor = 'pointer'; } catch {}
  };
  const handleMove = (e: MapLayerMouseEvent) => {
    try {
      const f = e.features?.[0];
      const id = getFeatureId(f);
      onHover?.(id);
    } catch {}
  };
  const handleLeave = () => {
    try { map.getCanvas().style.cursor = ''; } catch {}
    try { onHover?.(null); } catch {}
  };
  const handleClick = (e: MapLayerMouseEvent) => {
    try {
      const f = e.features?.[0];
      const id = getFeatureId(f);
      onClick?.(id);
      if (featureClickRef) featureClickRef.current = true;
    } catch {}
  };
  layerIds.forEach((id) => {
    map.on('mouseenter', id, handleEnter);
    map.on('mousemove', id, handleMove);
    map.on('mouseleave', id, handleLeave);
    map.on('click', id, handleClick);
  });
  return () => {
    layerIds.forEach((id) => {
      map.off('mouseenter', id, handleEnter);
      map.off('mousemove', id, handleMove);
      map.off('mouseleave', id, handleLeave);
      map.off('click', id, handleClick);
    });
  };
}
