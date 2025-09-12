import { getRestServiceUrlInfo } from './arcgis';
import { log } from './log';
import type { MapServiceInfo, MapServiceLayerInfo } from './types/arcgis-rest';
import type { Extent } from './types/arcgis-rest';

export type ResolvedLayer = {
  type: 'feature' | 'dynamic' | 'image' | 'unknown';
  url: string | null;
  serviceRootUrl: string | null;
  layerId?: number;
};

export function resolveEsriLayer(serviceUrl: string, selectedMapLayerId?: number): ResolvedLayer {
  log.debug('[resolveEsriLayer] input', { serviceUrl, selectedMapLayerId });
  try {
    const info = getRestServiceUrlInfo(serviceUrl);
    log.debug('[resolveEsriLayer] parsed', { serviceUrl, info, selectedMapLayerId });
    // MapServer and FeatureServer handling
    if (info.isMapServer || info.isFeatureServer) {
      if (info.isLayer) {
        return { type: 'feature', url: info.layerUrl!, serviceRootUrl: info.serviceUrl!, layerId: info.layerId };
      }
      if (typeof selectedMapLayerId === 'number') {
        return { type: 'feature', url: `${info.serviceUrl}/${selectedMapLayerId}`, serviceRootUrl: info.serviceUrl!, layerId: selectedMapLayerId };
      }
      if (info.isMapServer) {
        return { type: 'dynamic', url: info.serviceUrl!, serviceRootUrl: info.serviceUrl! };
      }
      // FeatureServer service root: default to layer 0 as feature layer
      if (info.isFeatureServer) {
        return { type: 'feature', url: `${info.serviceUrl}/0`, serviceRootUrl: info.serviceUrl!, layerId: 0 };
      }
    }
    if (info.serviceType === 'ImageServer' && info.serviceUrl) {
      return { type: 'image', url: info.serviceUrl, serviceRootUrl: info.serviceUrl };
    }
    return { type: 'unknown', url: null, serviceRootUrl: null };
  } catch(e) {
    log.error('Failed to resolve ArcGIS URL', e);
    return { type: 'unknown', url: null, serviceRootUrl: null };
  }
}

export async function fetchServiceMetadata(serviceRootUrl: string): Promise<MapServiceInfo> {
  const url = new URL(serviceRootUrl);
  url.searchParams.set('f', 'json');
  return fetchJsonCached<MapServiceInfo>(url.toString());
}

export async function fetchLayerMetadata(layerUrl: string): Promise<MapServiceLayerInfo> {
  const url = new URL(layerUrl);
  url.searchParams.set('f', 'json');
  return fetchJsonCached<MapServiceLayerInfo>(url.toString());
}

export async function fetchFeatureCount(layerUrl: string, where?: string): Promise<number> {
  const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('returnCountOnly', 'true');
  url.searchParams.set('where', (where && where.trim()) || '1=1');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load feature count: ${res.status}`);
  const json = await res.json();
  const n = typeof json?.count === 'number' ? json.count : (typeof json?.featureCount === 'number' ? json.featureCount : 0);
  return n;
}

export async function fetchFeatureCountInExtent(layerUrl: string, bbox4326: string, where?: string): Promise<number> {
  // bbox4326: "minX, minY, maxX, maxY" in WGS84
  const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('returnCountOnly', 'true');
  url.searchParams.set('where', (where && where.trim()) || '1=1');
  url.searchParams.set('geometry', bbox4326);
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load feature count in extent: ${res.status}`);
  const json = await res.json();
  const n = typeof json?.count === 'number' ? json.count : (typeof json?.featureCount === 'number' ? json.featureCount : 0);
  return n;
}

export function summarizeService(meta: MapServiceInfo, layerId: number | undefined): string {

  let layerName: string | undefined;
  const rootName = (meta?.documentInfo?.Title && String(meta.documentInfo.Title).trim())
    || (meta?.documentInfo?.Subject && String(meta.documentInfo.Subject).trim())
    || (meta?.mapName && String(meta.mapName).trim())
    || 'Service';
  if (layerId !== undefined && Array.isArray(meta?.layers)) {
    const layerMeta = meta.layers.find(l => l.id === layerId);
    if (layerMeta) {
      layerName = (layerMeta?.name && String(layerMeta.name).trim())
        || `Layer #${layerMeta.id}`;
    }
  }

  const title = layerName ? `${rootName} — ${layerName}` : rootName;
  const layerCount = Array.isArray(meta?.layers) ? meta.layers.length : 0;
  const tableCount = Array.isArray(meta?.tables) ? meta.tables.length : 0;
  const total = layerCount + tableCount;
  return `${title} — ${total} layers/tables`;
}

export async function fetchFeatureAttributes(layerUrl: string, where?: string, limit: number = 100): Promise<any[]> {
  const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('where', (where && where.trim()) || '1=1');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('resultRecordCount', String(limit));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load features: ${res.status}`);
  const json = await res.json();
  const feats = Array.isArray(json?.features) ? json.features : [];
  return feats.map((f: any) => f?.attributes || {});
}

// Fetch only the extent for a layer, reprojected to WGS84 (EPSG:4326)
export async function fetchLayerExtent4326(layerUrl: string, where: string = '1=1'): Promise<Extent | null> {
  try {
    const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
    url.searchParams.set('f', 'json');
    url.searchParams.set('where', (where && where.trim()) || '1=1');
    url.searchParams.set('returnExtentOnly', 'true');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('outSR', '4326');
    // Use cached fetch to debounce duplicate requests
    const json = await fetchJsonCached<any>(url.toString());
    const ext = (json && (json.extent || json?.fullExtent || json?.initialExtent)) || null;
    if (ext && typeof ext.xmin === 'number' && typeof ext.ymin === 'number' && typeof ext.xmax === 'number' && typeof ext.ymax === 'number') return ext as Extent;
    return null;
  } catch { return null; }
}

// ---- Simple in-memory fetch cache for JSON GET requests ----
const jsonCache = new Map<string, Promise<any>>();

async function fetchJsonCached<T = any>(url: string): Promise<T> {
  const key = normalizeCacheKey(url);
  const existing = jsonCache.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    return res.json();
  })();
  jsonCache.set(key, p);
  try { return await p; } finally { /* keep fulfilled promise in cache */ }
}

function normalizeCacheKey(url: string): string {
  try {
    const u = new URL(url);
    // Normalize by sorting query params
    const entries = Array.from(u.searchParams.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    u.search = '';
    for (const [k, v] of entries) u.searchParams.append(k, v);
    return u.toString();
  } catch {
    return url;
  }
}
