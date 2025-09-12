"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveEsriLayer = resolveEsriLayer;
exports.fetchServiceMetadata = fetchServiceMetadata;
exports.fetchLayerMetadata = fetchLayerMetadata;
exports.fetchFeatureCount = fetchFeatureCount;
exports.fetchFeatureCountInExtent = fetchFeatureCountInExtent;
exports.summarizeService = summarizeService;
exports.fetchFeatureAttributes = fetchFeatureAttributes;
const arcgis_1 = require("./arcgis");
function resolveEsriLayer(serviceUrl, selectedMapLayerId) {
    try {
        const info = (0, arcgis_1.getRestServiceUrlInfo)(serviceUrl);
        // MapServer and FeatureServer handling
        if (info.isMapServer || info.isFeatureServer) {
            if (info.isLayer) {
                return { type: 'feature', url: info.layerUrl, serviceRootUrl: info.serviceUrl, layerId: info.layerId };
            }
            if (typeof selectedMapLayerId === 'number') {
                return { type: 'feature', url: `${info.serviceUrl}/${selectedMapLayerId}`, serviceRootUrl: info.serviceUrl, layerId: selectedMapLayerId };
            }
            if (info.isMapServer) {
                return { type: 'dynamic', url: info.serviceUrl, serviceRootUrl: info.serviceUrl };
            }
            // FeatureServer service root: default to layer 0 as feature layer
            if (info.isFeatureServer) {
                return { type: 'feature', url: `${info.serviceUrl}/0`, serviceRootUrl: info.serviceUrl, layerId: 0 };
            }
        }
        if (info.serviceType === 'ImageServer' && info.serviceUrl) {
            return { type: 'image', url: info.serviceUrl, serviceRootUrl: info.serviceUrl };
        }
        return { type: 'unknown', url: null, serviceRootUrl: null };
    }
    catch {
        return { type: 'unknown', url: null, serviceRootUrl: null };
    }
}
async function fetchServiceMetadata(serviceRootUrl) {
    const url = new URL(serviceRootUrl);
    url.searchParams.set('f', 'json');
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Failed to load service metadata: ${res.status}`);
    return res.json();
}
async function fetchLayerMetadata(layerUrl) {
    const url = new URL(layerUrl);
    url.searchParams.set('f', 'json');
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Failed to load layer metadata: ${res.status}`);
    return res.json();
}
async function fetchFeatureCount(layerUrl, where) {
    const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
    url.searchParams.set('f', 'json');
    url.searchParams.set('returnCountOnly', 'true');
    url.searchParams.set('where', (where && where.trim()) || '1=1');
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Failed to load feature count: ${res.status}`);
    const json = await res.json();
    const n = typeof json?.count === 'number' ? json.count : (typeof json?.featureCount === 'number' ? json.featureCount : 0);
    return n;
}
async function fetchFeatureCountInExtent(layerUrl, bbox4326, where) {
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
    if (!res.ok)
        throw new Error(`Failed to load feature count in extent: ${res.status}`);
    const json = await res.json();
    const n = typeof json?.count === 'number' ? json.count : (typeof json?.featureCount === 'number' ? json.featureCount : 0);
    return n;
}
function summarizeService(meta, layerId) {
    let layerName;
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
async function fetchFeatureAttributes(layerUrl, where, limit = 100) {
    const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
    url.searchParams.set('f', 'json');
    url.searchParams.set('where', (where && where.trim()) || '1=1');
    url.searchParams.set('outFields', '*');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('resultRecordCount', String(limit));
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Failed to load features: ${res.status}`);
    const json = await res.json();
    const feats = Array.isArray(json?.features) ? json.features : [];
    return feats.map((f) => f?.attributes || {});
}
