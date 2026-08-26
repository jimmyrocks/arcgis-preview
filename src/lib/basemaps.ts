import type { Map as MapLibreMap } from 'maplibre-gl';

export type BasemapKey =
  | 'openfreemap_positron'
  | 'usgs_topo'
  | 'usgs_imagery_topo'
  | 'usgs_imagery'
  | 'osm'
  | 'openfreemap_dark'
  | 'openfreemap_liberty'
  | 'esri_worldimagery'
  | 'opentopomap';

export type CustomBasemap = {
  key: 'custom';
  url: string;
  attribution?: string;
  subdomains?: string[];
  detectRetina?: boolean;
};

export type BasemapSelection = BasemapKey | CustomBasemap;

type RasterBasemapConfig = {
  type: 'raster';
  key: string;
  tiles: string[];
  attribution: string;
};

type OpenFreeMapBasemapConfig = {
  type: 'openfreemap';
  key: BasemapKey;
  styleUrl: string;
};

export type BasemapConfig = RasterBasemapConfig | OpenFreeMapBasemapConfig;

export const DEFAULT_BASEMAP_KEY: BasemapKey = 'openfreemap_positron';

const BASEMAP_SOURCE_PREFIX = 'basemap-source-';
const BASEMAP_LAYER_PREFIX = 'basemap-layer-';
const RASTER_SOURCE_ID = `${BASEMAP_SOURCE_PREFIX}raster`;
const RASTER_LAYER_ID = `${BASEMAP_LAYER_PREFIX}raster`;
const BACKGROUND_LAYER_ID = 'background';
const DEFAULT_BACKGROUND_COLOR = '#eef2f7';
const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';

const LEGACY_BASEMAP_ALIASES: Record<string, BasemapKey> = {
  carto_positron: 'openfreemap_positron',
  carto_dark: 'openfreemap_dark',
  carto_voyager: 'openfreemap_liberty'
};

const BASEMAP_KEYS = new Set<BasemapKey>([
  'openfreemap_positron',
  'usgs_topo',
  'usgs_imagery_topo',
  'usgs_imagery',
  'osm',
  'openfreemap_dark',
  'openfreemap_liberty',
  'esri_worldimagery',
  'opentopomap'
]);

function styleThumb(background: string, land: string, water: string, road: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="${background}"/><path d="M0 8L15 3l11 8 22-4v24l-13 5-17-6L0 36z" fill="${land}"/><path d="M-4 42C8 30 11 21 19 17S35 18 52 2" fill="none" stroke="${water}" stroke-width="7"/><path d="M-3 17L51 35M13-4l8 56M-2 34l52-18" fill="none" stroke="${road}" stroke-width="2"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const BASEMAP_CHOICES: ReadonlyArray<{ key: BasemapKey; label: string; thumb: string }> = [
  {
    key: 'openfreemap_positron',
    label: 'Positron (OpenFreeMap)',
    thumb: styleThumb('#f2f3f0', '#e6e7e2', '#aad3df', '#ffffff')
  },
  {
    key: 'usgs_topo',
    label: 'USGS Topo',
    thumb: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/3/3/2'
  },
  {
    key: 'usgs_imagery_topo',
    label: 'USGS Imagery Topo',
    thumb: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/3/3/2'
  },
  {
    key: 'usgs_imagery',
    label: 'USGS Imagery',
    thumb: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/3/3/2'
  },
  {
    key: 'osm',
    label: 'OpenStreetMap',
    thumb: 'https://a.tile.openstreetmap.org/3/2/3.png'
  },
  {
    key: 'openfreemap_dark',
    label: 'Dark (OpenFreeMap)',
    thumb: styleThumb('#0c0c0c', '#171717', '#1d3138', '#3d3d3d')
  },
  {
    key: 'openfreemap_liberty',
    label: 'Liberty (OpenFreeMap)',
    thumb: styleThumb('#f8f4f0', '#e5ead8', '#a8d1df', '#ffffff')
  },
  {
    key: 'esri_worldimagery',
    label: 'Esri World Imagery',
    thumb: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/3/2'
  },
  {
    key: 'opentopomap',
    label: 'OpenTopoMap',
    thumb: 'https://a.tile.opentopomap.org/3/2/3.png'
  }
];

export function normalizeBasemapKey(value: string | null | undefined): BasemapKey {
  const key = String(value || '').toLowerCase();
  if (BASEMAP_KEYS.has(key as BasemapKey)) return key as BasemapKey;
  return LEGACY_BASEMAP_ALIASES[key] || DEFAULT_BASEMAP_KEY;
}

function tilesFromTemplate(template: string, subdomains?: string[], detectRetina?: boolean): string[] {
  const retinaSuffix = detectRetina ? '' : '';
  const cleanTemplate = template.replace('{r}', retinaSuffix);
  if (!subdomains?.length) return [cleanTemplate];
  return subdomains.map((subdomain) => cleanTemplate.replace('{s}', subdomain));
}

export function getBasemapConfig(selection: BasemapSelection | undefined): BasemapConfig {
  if (selection && typeof selection === 'object' && selection.url) {
    return {
      type: 'raster',
      key: 'custom',
      tiles: tilesFromTemplate(String(selection.url), selection.subdomains, selection.detectRetina),
      attribution: String(selection.attribution || '')
    };
  }

  const key = normalizeBasemapKey(typeof selection === 'string' ? selection : undefined);
  switch (key) {
    case 'openfreemap_positron':
      return { type: 'openfreemap', key, styleUrl: 'https://tiles.openfreemap.org/styles/positron' };
    case 'openfreemap_dark':
      return { type: 'openfreemap', key, styleUrl: 'https://tiles.openfreemap.org/styles/dark' };
    case 'openfreemap_liberty':
      return { type: 'openfreemap', key, styleUrl: 'https://tiles.openfreemap.org/styles/liberty' };
    case 'usgs_topo':
      return {
        type: 'raster',
        key,
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Tiles courtesy of the U.S. Geological Survey'
      };
    case 'usgs_imagery_topo':
      return {
        type: 'raster',
        key,
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Imagery courtesy of the U.S. Geological Survey'
      };
    case 'usgs_imagery':
      return {
        type: 'raster',
        key,
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Imagery courtesy of the U.S. Geological Survey'
      };
    case 'osm':
      return {
        type: 'raster',
        key,
        tiles: tilesFromTemplate('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', ['a', 'b', 'c']),
        attribution: '© OpenStreetMap contributors'
      };
    case 'esri_worldimagery':
      return {
        type: 'raster',
        key,
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Source: Esri'
      };
    case 'opentopomap':
      return {
        type: 'raster',
        key,
        tiles: tilesFromTemplate('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', ['a', 'b', 'c']),
        attribution: '© OpenTopoMap (CC-BY-SA)'
      };
  }
}

const styleCache = new Map<string, Promise<any>>();
const mapApplyVersions = new WeakMap<MapLibreMap, number>();

function loadStyle(url: string): Promise<any> {
  const cached = styleCache.get(url);
  if (cached) return cached;
  const pending = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Basemap style request failed (${response.status})`);
      const style = await response.json();
      if (!style || style.version !== 8 || !style.sources || !Array.isArray(style.layers)) {
        throw new Error('Basemap style response was not a MapLibre style');
      }
      return style;
    })
    .catch((error) => {
      styleCache.delete(url);
      throw error;
    });
  styleCache.set(url, pending);
  return pending;
}

function isBasemapLayer(id: string): boolean {
  return id.startsWith(BASEMAP_LAYER_PREFIX);
}

function removeBasemap(map: MapLibreMap): void {
  const layers = map.getStyle()?.layers || [];
  for (const layer of [...layers].reverse()) {
    if (!isBasemapLayer(layer.id)) continue;
    try { map.removeLayer(layer.id); } catch {}
  }
  const sources = map.getStyle()?.sources || {};
  for (const sourceId of Object.keys(sources)) {
    if (!sourceId.startsWith(BASEMAP_SOURCE_PREFIX)) continue;
    try { map.removeSource(sourceId); } catch {}
  }
}

function firstOverlayLayerId(map: MapLibreMap): string | undefined {
  return (map.getStyle()?.layers || []).find(
    (layer) => layer.id !== BACKGROUND_LAYER_ID && !isBasemapLayer(layer.id)
  )?.id;
}

function setBackground(map: MapLibreMap, color: unknown = DEFAULT_BACKGROUND_COLOR, opacity: unknown = 1): void {
  try { map.setPaintProperty(BACKGROUND_LAYER_ID, 'background-color', color as any); } catch {}
  try { map.setPaintProperty(BACKGROUND_LAYER_ID, 'background-opacity', opacity as any); } catch {}
}

function addRasterBasemap(map: MapLibreMap, config: RasterBasemapConfig): void {
  map.addSource(RASTER_SOURCE_ID, {
    type: 'raster',
    tiles: config.tiles,
    tileSize: 256,
    attribution: config.attribution
  } as any);
  map.addLayer({
    id: RASTER_LAYER_ID,
    type: 'raster',
    source: RASTER_SOURCE_ID
  }, firstOverlayLayerId(map));
}

function addOpenFreeMapStyle(map: MapLibreMap, style: any): void {
  const background = style.layers.find((layer: any) => layer?.type === 'background');
  setBackground(
    map,
    background?.paint?.['background-color'] ?? DEFAULT_BACKGROUND_COLOR,
    background?.paint?.['background-opacity'] ?? 1
  );

  if (style.glyphs && map.getStyle()?.glyphs !== style.glyphs) {
    try { map.setGlyphs(style.glyphs); } catch {}
  }
  if (style.sprite && map.getStyle()?.sprite !== style.sprite) {
    try { map.setSprite(style.sprite); } catch {}
  }

  const sourceIds = new Map<string, string>();
  for (const [sourceName, source] of Object.entries(style.sources || {})) {
    const sourceId = `${BASEMAP_SOURCE_PREFIX}${sourceName}`;
    sourceIds.set(sourceName, sourceId);
    const specification: any = { ...(source as any) };
    if (sourceName === 'openmaptiles' && !specification.attribution) {
      specification.attribution = OPENFREEMAP_ATTRIBUTION;
    }
    map.addSource(sourceId, specification);
  }

  const beforeId = firstOverlayLayerId(map);
  for (const layer of style.layers) {
    if (!layer || layer.type === 'background') continue;
    const sourceId = layer.source ? sourceIds.get(layer.source) : undefined;
    if (layer.source && !sourceId) continue;
    map.addLayer({
      ...layer,
      id: `${BASEMAP_LAYER_PREFIX}${layer.id}`,
      ...(sourceId ? { source: sourceId } : {})
    } as any, beforeId);
  }
}

/** Apply a basemap without replacing the map style or disturbing application overlay sources. */
export async function applyBasemap(map: MapLibreMap, selection: BasemapSelection | undefined): Promise<void> {
  const version = (mapApplyVersions.get(map) || 0) + 1;
  mapApplyVersions.set(map, version);
  removeBasemap(map);
  setBackground(map);

  const config = getBasemapConfig(selection);
  if (config.type === 'raster') {
    addRasterBasemap(map, config);
    return;
  }

  try {
    const style = await loadStyle(config.styleUrl);
    if (mapApplyVersions.get(map) !== version) return;
    removeBasemap(map);
    addOpenFreeMapStyle(map, style);
  } catch (error) {
    if (mapApplyVersions.get(map) !== version) return;
    console.warn('[Basemap] OpenFreeMap style could not be loaded; using OpenStreetMap fallback', error);
    removeBasemap(map);
    setBackground(map);
    const fallback = getBasemapConfig('osm');
    if (fallback.type === 'raster') addRasterBasemap(map, fallback);
  }
}
