import type { Feature, Geometry } from 'geojson';
import type { Extent } from './types/arcgis-rest';
import { LonLat, Bounds } from './geo';

function coordsFromGeometry(geom: Geometry | null | undefined, acc: LonLat[]): void {
  if (!geom) return;
  const pushCoords = (c: any) => {
    if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
      acc.push(new LonLat(c[0], c[1]));
    }
  };
  const recur = (coords: any) => {
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      pushCoords(coords);
    } else if (Array.isArray(coords)) {
      coords.forEach(recur);
    }
  };
  recur((geom as any).coordinates);
}

// Converts ArcGIS Extent (Web Mercator 102100/3857 or WGS84 4326) to Bounds
export function extentToBounds(
  ext: Extent | (Extent | null | undefined) | ({ xmin: number; ymin: number; xmax: number; ymax: number; spatialReference?: { wkid?: number; latestWkid?: number } } | null | undefined)
): Bounds | null {
  const e: any = ext as any;
  if (!e) return null;
  const wkid = Number((e.spatialReference?.latestWkid || e.spatialReference?.wkid) ?? 0);
  const looksLikeMercator =
    [e.xmin, e.xmax, e.ymin, e.ymax].some((v: number) => Math.abs(v) > 180) &&
    [e.xmin, e.xmax].every((v: number) => Math.abs(v) <= 2.5e7) &&
    [e.ymin, e.ymax].every((v: number) => Math.abs(v) <= 2.5e7);

  if (wkid === 102100 || wkid === 3857 || wkid === 102113) {
    const sw = LonLat.from3857(e.xmin, e.ymin);
    const ne = LonLat.from3857(e.xmax, e.ymax);
    return new Bounds(sw, ne);
  }

  if (wkid === 4326 || wkid === 4269) {
    return new Bounds(new LonLat(e.xmin, e.ymin), new LonLat(e.xmax, e.ymax));
  }

  if (looksLikeMercator) {
    const sw = LonLat.from3857(e.xmin, e.ymin);
    const ne = LonLat.from3857(e.xmax, e.ymax);
    return new Bounds(sw, ne);
  }

  const looksLikeDegrees =
    isFinite(e.xmin) &&
    isFinite(e.xmax) &&
    isFinite(e.ymin) &&
    isFinite(e.ymax) &&
    Math.abs(e.xmin) <= 180 &&
    Math.abs(e.xmax) <= 180 &&
    Math.abs(e.ymin) <= 90 &&
    Math.abs(e.ymax) <= 90;
  if (!wkid && looksLikeDegrees) {
    return new Bounds(new LonLat(e.xmin, e.ymin), new LonLat(e.xmax, e.ymax));
  }
  return null;
}

// Converts Bounds to an ArcGIS-style extent in WGS84 (wkid 4326)
export function boundsToExtent4326(b: Bounds | null | undefined): Extent | null {
  try {
    if (!b || b.isEmpty()) return null;
    return {
      xmin: b.sw.lng,
      ymin: b.sw.lat,
      xmax: b.ne.lng,
      ymax: b.ne.lat,
      spatialReference: { wkid: 4326 }
    } as Extent;
  } catch {
    return null;
  }
}

export function boundsFromFeatures(features: Feature[] | null | undefined): Bounds | null {
  if (!features || !features.length) return null;
  const pts: LonLat[] = [];
  features.forEach((f) => coordsFromGeometry(f.geometry, pts));
  return Bounds.fromPoints(pts);
}

export function extentFromFeatures(features: Feature[] | null | undefined): Extent | null {
  return boundsToExtent4326(boundsFromFeatures(features));
}
