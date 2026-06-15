import { getRestServiceUrlInfo } from './arcgis';

export type RecentLayerEntry = {
  layerUrl: string;
  serverRoot: string;
  servicePath: string;
  serviceType: 'MapServer' | 'FeatureServer' | 'ImageServer' | 'VectorTileServer';
  layerName: string;
  geometryType?: string;
  openedAt: number;
};

export const RECENT_LAYER_ENTRIES_KEY = 'layerFinder:recentLayers';
const MAX_RECENT_LAYER_ENTRIES = 8;

export function readRecentLayerEntries(): RecentLayerEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_LAYER_ENTRIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecentLayerEntry)
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, MAX_RECENT_LAYER_ENTRIES);
  } catch {
    return [];
  }
}

export function pushRecentLayerEntry(entry: RecentLayerEntry): void {
  try {
    const current = readRecentLayerEntries();
    const next = [entry, ...current.filter((item) => item.layerUrl !== entry.layerUrl)]
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, MAX_RECENT_LAYER_ENTRIES);
    localStorage.setItem(RECENT_LAYER_ENTRIES_KEY, JSON.stringify(next));
  } catch {}
}

export function buildRecentLayerEntry(params: {
  url: string;
  layerName?: string | null;
  geometryType?: string | null;
}): RecentLayerEntry | null {
  try {
    const info = getRestServiceUrlInfo(params.url);
    const serviceType = info.serviceType;
    const servicePath = info.servicePath;
    if (!serviceType || !servicePath) return null;
    if (serviceType !== 'MapServer' && serviceType !== 'FeatureServer' && serviceType !== 'ImageServer' && serviceType !== 'VectorTileServer') return null;
    const layerUrl = info.layerUrl || (serviceType === 'FeatureServer' && info.serviceUrl ? `${info.serviceUrl}/0` : null);
    if (!layerUrl) return null;
    const layerName = String(params.layerName || servicePath.split('/').pop() || 'Layer').trim();
    if (!layerName) return null;
    return {
      layerUrl,
      serverRoot: info.baseRoot,
      servicePath,
      serviceType,
      layerName,
      geometryType: params.geometryType ? String(params.geometryType) : undefined,
      openedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

function isRecentLayerEntry(value: unknown): value is RecentLayerEntry {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.layerUrl === 'string'
    && typeof item.serverRoot === 'string'
    && typeof item.servicePath === 'string'
    && typeof item.serviceType === 'string'
    && typeof item.layerName === 'string'
    && typeof item.openedAt === 'number';
}
