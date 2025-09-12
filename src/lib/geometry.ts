import L from 'leaflet';
import type { Extent } from './types/arcgis-rest';

// Converts ArcGIS Extent (Web Mercator 102100/3857 or WGS84 4326) to Leaflet bounds
export function extentToBounds(ext: Extent | (Extent | null | undefined) | ({
  xmin: number; ymin: number; xmax: number; ymax: number; spatialReference?: { wkid?: number; latestWkid?: number }
} | null | undefined)): L.LatLngBounds | null {
  // Normalize nullable
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e: any = ext as any;
  if (!e) return null;
  const wkid = Number((e.spatialReference?.latestWkid || e.spatialReference?.wkid) ?? 0);
  // Web Mercator variants
  if (wkid === 102100 || wkid === 3857 || wkid === 102113) {
    const sw = L.Projection.SphericalMercator.unproject(L.point(e.xmin, e.ymin));
    const ne = L.Projection.SphericalMercator.unproject(L.point(e.xmax, e.ymax));
    return L.latLngBounds(sw, ne);
  }
  // Geographic degrees (WGS84 4326 or NAD83 4269; treat both as lon/lat degrees for visualization)
  if (wkid === 4326 || wkid === 4269) {
    return L.latLngBounds(L.latLng(e.ymin, e.xmin), L.latLng(e.ymax, e.xmax));
  }
  // Heuristic fallback: if values look like degrees, assume lon/lat degrees
  const looksLikeDegrees = isFinite(e.xmin) && isFinite(e.xmax) && isFinite(e.ymin) && isFinite(e.ymax)
    && Math.abs(e.xmin) <= 180 && Math.abs(e.xmax) <= 180 && Math.abs(e.ymin) <= 90 && Math.abs(e.ymax) <= 90;
  if (!wkid && looksLikeDegrees) {
    return L.latLngBounds(L.latLng(e.ymin, e.xmin), L.latLng(e.ymax, e.xmax));
  }
  return null;
}
