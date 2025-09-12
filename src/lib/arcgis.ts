export type restServiceUrlInfo = {
  // The original URL normalized (no trailing slash)
  url: URL;
  // The base REST root up to and including /…/rest/services
  baseRoot: string;
  // Folders between /services and the service name
  folders: string[];
  // Service name (segment before service type)
  serviceName: string | null;
  // One of the known ArcGIS service types
  serviceType: 'MapServer' | 'FeatureServer' | 'ImageServer' | 'GPServer' | 'NAServer' | 'GeometryServer' | 'GeocodeServer' | 'NetworkAnalysisServer' | 'GlobeServer' | 'SceneServer' | null;
  // The numeric layer id, when present
  layerId?: number;
  // Convenience flags
  isService: boolean; // points to a service (…/ServiceType)
  isLayer: boolean;   // points to a specific layer (…/ServiceType/:id)
  isMapServer: boolean;
  isFeatureServer: boolean;
  // Display intent: dynamic (service root) or layer
  displayType: 'dynamic' | 'layer';
  // Composed paths
  servicePath: string | null; // folders + serviceName (no type)
  serviceUrl: string | null;  // full URL to the service (…/ServiceType)
  layerUrl: string | null;    // full URL to the layer (…/ServiceType/:id) when applicable
};

export function getRestServiceUrlInfo(url: string | URL): restServiceUrlInfo {
  // Normalize to URL object and get clean pathname (no query/hash, no trailing slash)
  let urlObj: URL;
  try {
    urlObj = new URL(typeof url === 'string' ? url : url.toString());
  } catch {
    throw new Error('Invalid URL');
  }
  // Debug moved to toast logger in callers
  const pathname = urlObj.pathname.replace(/\/+$/, '');
  const segs = pathname.split('/').filter(Boolean);

  // Find /rest/services anywhere in the path, regardless of the product folder name
  const idx = segs.findIndex((s, i) => s.toLowerCase() === 'rest' && segs[i + 1]?.toLowerCase() === 'services');
  if (idx < 0) throw new Error('Invalid ArcGIS REST service URL: missing "/rest/services"');

  const tail = segs.slice(idx + 2); // [ ...folders, serviceName, serviceType, [layerId] ]
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
  const hasValidType = !!serviceTypePart && validTypes.has(serviceTypePart as any);

  const baseRoot = urlObj.origin + '/' + segs.slice(0, idx + 2).join('/');
  const servicePath = serviceName ? [...folders, serviceName].join('/') : null;
  const serviceUrl = hasValidType && serviceName ? `${baseRoot}/${servicePath}/${serviceTypePart}` : null;
  const layerUrl = serviceUrl && layerId !== undefined ? `${serviceUrl}/${layerId}` : null;

  return {
    url: new URL(urlObj.toString().replace(/\/+$/, '')),
    baseRoot,
    folders,
    serviceName,
    serviceType: hasValidType ? (serviceTypePart as restServiceUrlInfo['serviceType']) : null,
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
