import { parseArcGISJSON } from '@opendataland/source-arcgis';
import { getRestServiceUrlInfo } from './arcgis';
import { log } from './log';
import type { MapServiceInfo, MapServiceLayerInfo } from './types/arcgis-rest';
import { CACHE_TTLS } from './config';
import type { Extent } from './types/arcgis-rest';

export type ResolvedLayer = {
  type: 'feature' | 'dynamic' | 'image' | 'vector' | 'unknown';
  url: string | null;
  serviceRootUrl: string | null;
  layerId?: number;
};

export function resolveEsriLayer(serviceUrl: string, selectedMapLayerId?: number): ResolvedLayer {
  const trimmed = String(serviceUrl || '').trim();
  if (!trimmed) return { type: 'unknown', url: null, serviceRootUrl: null };
  try { new URL(trimmed); } catch { return { type: 'unknown', url: null, serviceRootUrl: null }; }
  log.debug('[resolveEsriLayer] input', { serviceUrl: trimmed, selectedMapLayerId });
  try {
    const info = getRestServiceUrlInfo(trimmed);
    log.debug('[resolveEsriLayer] parsed', { serviceUrl: trimmed, info, selectedMapLayerId });
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
    if (info.serviceType === 'VectorTileServer' && info.serviceUrl) {
      return { type: 'vector', url: info.serviceUrl, serviceRootUrl: info.serviceUrl };
    }
    return { type: 'unknown', url: null, serviceRootUrl: null };
  } catch(e) {
    if (trimmed.toLowerCase().includes('/rest/services')) {
      log.error('Failed to resolve ArcGIS URL', e);
    }
    return { type: 'unknown', url: null, serviceRootUrl: null };
  }
}

export async function fetchServiceMetadata(serviceRootUrl: string, opts?: { signal?: AbortSignal; ttlMs?: number }): Promise<MapServiceInfo> {
  const url = new URL(serviceRootUrl);
  url.searchParams.set('f', 'json');
  return fetchJsonCached<MapServiceInfo>(url.toString(), { signal: opts?.signal, ttlMs: opts?.ttlMs ?? CACHE_TTLS.metadataMs });
}

export async function fetchLayerMetadata(layerUrl: string, opts?: { signal?: AbortSignal; ttlMs?: number }): Promise<MapServiceLayerInfo> {
  const url = new URL(layerUrl);
  url.searchParams.set('f', 'json');
  return fetchJsonCached<MapServiceLayerInfo>(url.toString(), { signal: opts?.signal, ttlMs: opts?.ttlMs ?? CACHE_TTLS.metadataMs });
}

export async function fetchFeatureCount(layerUrl: string, where?: string, opts?: { signal?: AbortSignal }): Promise<number> {
  const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('returnCountOnly', 'true');
  url.searchParams.set('where', (where && where.trim()) || '1=1');
  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) throw new Error(`Failed to load feature count: ${res.status}`);
  const json = parseArcGISJSON<any>(await res.text());
  const n = typeof json?.count === 'number' ? json.count : (typeof json?.featureCount === 'number' ? json.featureCount : 0);
  return n;
}

export async function fetchFeatureCountInExtent(layerUrl: string, bbox4326: string, where?: string, opts?: { signal?: AbortSignal }): Promise<number> {
  // bbox4326: "minX, minY, maxX, maxY" in WGS84
  const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('returnCountOnly', 'true');
  url.searchParams.set('where', (where && where.trim()) || '1=1');
  url.searchParams.set('geometry', bbox4326);
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) throw new Error(`Failed to load feature count in extent: ${res.status}`);
  const json = parseArcGISJSON<any>(await res.text());
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

export async function fetchFeatureAttributes(layerUrl: string, where?: string, limit: number = 100, opts?: { signal?: AbortSignal }): Promise<any[]> {
  const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('where', (where && where.trim()) || '1=1');
  url.searchParams.set('outFields', '*');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('resultRecordCount', String(limit));
  const res = await fetch(url, { signal: opts?.signal });
  if (!res.ok) throw new Error(`Failed to load features: ${res.status}`);
  const json = parseArcGISJSON<any>(await res.text());
  const feats = Array.isArray(json?.features) ? json.features : [];
  return feats.map((f: any) => f?.attributes || {});
}

export async function fetchDistinctFieldValues(
  layerUrl: string,
  fieldName: string,
  opts?: { signal?: AbortSignal; where?: string; limit?: number }
): Promise<unknown[]> {
  const limit = Math.max(1, Math.min(200, Number(opts?.limit) || 50));
  const baseUrl = `${layerUrl.replace(/\/+$/, '')}/query`;
  const run = async (includeOrderBy: boolean): Promise<unknown[]> => {
    const url = new URL(baseUrl);
    url.searchParams.set('f', 'json');
    url.searchParams.set('where', (opts?.where && opts.where.trim()) || '1=1');
    url.searchParams.set('outFields', fieldName);
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('returnDistinctValues', 'true');
    url.searchParams.set('resultRecordCount', String(limit));
    if (includeOrderBy) url.searchParams.set('orderByFields', fieldName);
    const json = await fetchJsonCached<any>(url.toString(), { signal: opts?.signal, ttlMs: CACHE_TTLS.extentMs });
    const feats = Array.isArray(json?.features) ? json.features : [];
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const feat of feats) {
      const value = feat?.attributes?.[fieldName];
      if (value == null) continue;
      const key = typeof value === 'string' ? value : JSON.stringify(value);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length >= limit) break;
    }
    return out;
  };
  try {
    return await run(true);
  } catch {
    try {
      return await run(false);
    } catch {
      return [];
    }
  }
}

// Fetch only the extent for a layer, reprojected to WGS84 (EPSG:4326)
export async function fetchLayerExtent4326(layerUrl: string, where: string = '1=1', opts?: { signal?: AbortSignal; ttlMs?: number }): Promise<Extent | null> {
  try {
    const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
    url.searchParams.set('f', 'json');
    url.searchParams.set('where', (where && where.trim()) || '1=1');
    url.searchParams.set('returnExtentOnly', 'true');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('outSR', '4326');
    // Use cached fetch to debounce duplicate requests
    const json = await fetchJsonCached<any>(url.toString(), { signal: opts?.signal, ttlMs: opts?.ttlMs ?? CACHE_TTLS.extentMs });
    const ext = (json && (json.extent || json?.fullExtent || json?.initialExtent)) || null;
    if (ext && typeof ext.xmin === 'number' && typeof ext.ymin === 'number' && typeof ext.xmax === 'number' && typeof ext.ymax === 'number') return ext as Extent;
    return null;
  } catch { return null; }
}

// ---- In-memory fetch cache with basic ETag/Last-Modified revalidation ----
type CacheEntry = { data: any; etag?: string | null; lastModified?: string | null; timestamp: number };
const JSON_CACHE_MAX = 150;
const jsonCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>();

async function fetchJsonCached<T = any>(url: string, opt?: { signal?: AbortSignal; ttlMs?: number }): Promise<T> {
  const key = normalizeCacheKey(url);
  const now = Date.now();
  const ttl = typeof opt?.ttlMs === 'number' ? opt!.ttlMs! : 5 * 60 * 1000; // default 5 minutes

  // Coalesce concurrent requests
  const inFlight = inflight.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const cached = jsonCache.get(key);
  if (cached && (now - cached.timestamp) < ttl) {
    jsonCache.delete(key);
    jsonCache.set(key, cached);
    return cached.data as T;
  }

  const p = (async () => {
    const headers: Record<string, string> = {};
    if (cached?.etag) headers['If-None-Match'] = cached.etag;
    if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;
    const res = await fetch(url, { headers, signal: opt?.signal });
    if (res.status === 304 && cached) {
      // Not modified; refresh timestamp
      cached.timestamp = now;
      return cached.data as T;
    }
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    const data = parseArcGISJSON<T>(await res.text());
    const etag = res.headers.get('ETag');
    const lastModified = res.headers.get('Last-Modified');
    setJsonCacheEntry(key, { data, etag, lastModified, timestamp: now });
    return data as T;
  })();
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
}

function setJsonCacheEntry(key: string, entry: CacheEntry): void {
  jsonCache.delete(key);
  jsonCache.set(key, entry);
  while (jsonCache.size > JSON_CACHE_MAX) {
    const oldest = jsonCache.keys().next().value;
    if (!oldest) break;
    jsonCache.delete(oldest);
  }
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
