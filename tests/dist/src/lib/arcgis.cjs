"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRestServiceUrlInfo = getRestServiceUrlInfo;
function getRestServiceUrlInfo(url) {
    // Normalize to URL object and get clean pathname (no query/hash, no trailing slash)
    let urlObj;
    try {
        urlObj = new URL(typeof url === 'string' ? url : url.toString());
    }
    catch {
        throw new Error('Invalid URL');
    }
    const pathname = urlObj.pathname.replace(/\/+$/, '');
    const segs = pathname.split('/').filter(Boolean);
    // Find arcgis/rest/services triple
    const idx = segs.findIndex((s, i) => s.toLowerCase() === 'arcgis' && segs[i + 1]?.toLowerCase() === 'rest' && segs[i + 2]?.toLowerCase() === 'services');
    if (idx < 0)
        throw new Error('Invalid ArcGIS REST service URL: missing "arcgis/rest/services"');
    const tail = segs.slice(idx + 3); // [ ...folders, serviceName, serviceType, [layerId] ]
    const isRoot = tail.length < 2; // points at /arcgis/rest/services root or a folder under it
    const last = tail[tail.length - 1];
    const hasLayerId = !!last && /^\d+$/.test(last);
    const layerId = hasLayerId ? Number(last) : undefined;
    const serviceTypePart = isRoot ? null : tail[tail.length - (hasLayerId ? 2 : 1)];
    const serviceName = isRoot ? null : (tail[tail.length - (hasLayerId ? 3 : 2)] ?? null);
    const folders = isRoot ? tail : tail.slice(0, Math.max(0, tail.length - (hasLayerId ? 3 : 2)));
    const validTypes = new Set([
        'MapServer', 'FeatureServer', 'ImageServer', 'GPServer', 'NAServer', 'GeometryServer', 'GeocodeServer', 'NetworkAnalysisServer', 'GlobeServer', 'SceneServer'
    ]);
    const hasValidType = !!serviceTypePart && validTypes.has(serviceTypePart);
    const baseRoot = urlObj.origin + '/' + segs.slice(0, idx + 3).join('/');
    const servicePath = serviceName ? [...folders, serviceName].join('/') : null;
    const serviceUrl = hasValidType && serviceName ? `${baseRoot}/${servicePath}/${serviceTypePart}` : null;
    const layerUrl = serviceUrl && layerId !== undefined ? `${serviceUrl}/${layerId}` : null;
    return {
        url: new URL(urlObj.toString().replace(/\/+$/, '')),
        baseRoot,
        folders,
        serviceName,
        serviceType: hasValidType ? serviceTypePart : null,
        layerId,
        isService: !!hasValidType && !!serviceName && layerId === undefined,
        isLayer: !!hasValidType && !!serviceName && layerId !== undefined,
        isMapServer: (serviceTypePart === 'MapServer') || /\/MapServer/i.test(urlObj.pathname),
        isFeatureServer: (serviceTypePart === 'FeatureServer') || /\/FeatureServer/i.test(urlObj.pathname),
        displayType: layerId === undefined ? 'dynamic' : 'layer',
        servicePath,
        serviceUrl,
        layerUrl,
    };
}
