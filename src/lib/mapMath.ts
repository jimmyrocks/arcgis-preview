import type { Map as MapLibreMap } from 'maplibre-gl';

export function approxPrecisionMetersFromZoomLat(zoom: number, lat: number): number {
  try {
    const mpp = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
    return Math.max(1, Math.round(mpp * 1.5));
  } catch { return 0; }
}

export function approxPrecisionMeters(map: MapLibreMap): number {
  try {
    const lat = map.getCenter().lat || 0;
    const z = typeof (map as any).getZoom === 'function' ? (map as any).getZoom() : 0;
    return approxPrecisionMetersFromZoomLat(z, lat);
  } catch { return 0; }
}

function metersPerDeg(latDeg: number) {
  const φ = (latDeg * Math.PI) / 180;
  const mLat =
    111132.92 -
    559.82 * Math.cos(2 * φ) +
    1.175 * Math.cos(4 * φ) -
    0.0023 * Math.cos(6 * φ);
  const mLon =
    111412.84 * Math.cos(φ) -
    93.5 * Math.cos(3 * φ) +
    0.118 * Math.cos(5 * φ);
  return { mLat, mLon };
}

/**
 * Convert maxAllowableOffset (degrees) to approximate meters using bbox center latitude.
 */
export function offsetMeters4326(
  maxAllowableOffset: number,
  lat: number
) {

  const { mLat, mLon } = metersPerDeg(lat);

  const metersNS = maxAllowableOffset * mLat;
  const metersEW = maxAllowableOffset * mLon;
  const approxMeters = Math.max(metersNS, metersEW);

  return {
    latDeg: lat,
    maoDegrees: maxAllowableOffset,
    metersNorthSouth: metersNS,
    metersEastWest: metersEW,
    approxMeters
  };
}
