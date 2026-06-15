const R = 6378137; // WGS84 semi-major axis in meters
const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export class LonLat {
  constructor(public readonly lng: number, public readonly lat: number) {}

  /** Project to Web Mercator (EPSG:3857), returns [x, y] in meters */
  to3857(): [number, number] {
    const x = this.lng * RAD * R;
    const y = Math.log(Math.tan(Math.PI / 4 + this.lat * RAD / 2)) * R;
    return [x, y];
  }

  /** Slippy map tile coordinate at the given zoom level */
  toTile(zoom: number): { x: number; y: number; z: number } {
    const z = Math.floor(zoom);
    const n = Math.pow(2, z);
    const x = Math.floor((this.lng + 180) / 360 * n);
    const latRad = this.lat * RAD;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y, z };
  }

  /** [lng, lat] — GeoJSON / MapLibre LngLatLike */
  toArray(): [number, number] {
    return [this.lng, this.lat];
  }

  /** Construct from Web Mercator (EPSG:3857) meters */
  static from3857(x: number, y: number): LonLat {
    return new LonLat(
      (x / R) * DEG,
      (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * DEG,
    );
  }
}

export class Bounds {
  constructor(public readonly sw: LonLat, public readonly ne: LonLat) {}

  isEmpty(): boolean {
    return (
      !isFinite(this.sw.lng) || !isFinite(this.sw.lat) ||
      !isFinite(this.ne.lng) || !isFinite(this.ne.lat)
    );
  }

  center(): LonLat {
    return new LonLat(
      (this.sw.lng + this.ne.lng) / 2,
      (this.sw.lat + this.ne.lat) / 2,
    );
  }

  /** Returns a new Bounds expanded to include the given point */
  extend(p: LonLat): Bounds {
    return new Bounds(
      new LonLat(Math.min(this.sw.lng, p.lng), Math.min(this.sw.lat, p.lat)),
      new LonLat(Math.max(this.ne.lng, p.lng), Math.max(this.ne.lat, p.lat)),
    );
  }

  /** [west, south, east, north] — standard bbox order */
  toArray(): [number, number, number, number] {
    return [this.sw.lng, this.sw.lat, this.ne.lng, this.ne.lat];
  }

  /** [[sw_lng, sw_lat], [ne_lng, ne_lat]] — MapLibre LngLatBoundsLike */
  toMaplibre(): [[number, number], [number, number]] {
    return [this.sw.toArray(), this.ne.toArray()];
  }

  /** Tile x/y range covered at the given zoom level */
  toTileRange(zoom: number): { minX: number; minY: number; maxX: number; maxY: number; z: number } {
    const sw = this.sw.toTile(zoom);
    const ne = this.ne.toTile(zoom);
    return {
      minX: Math.min(sw.x, ne.x),
      minY: Math.min(sw.y, ne.y),
      maxX: Math.max(sw.x, ne.x),
      maxY: Math.max(sw.y, ne.y),
      z: Math.floor(zoom),
    };
  }

  static fromPoints(points: LonLat[]): Bounds | null {
    if (!points.length) return null;
    let minLng = points[0].lng, minLat = points[0].lat;
    let maxLng = minLng, maxLat = minLat;
    for (const p of points) {
      if (p.lng < minLng) minLng = p.lng;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lng > maxLng) maxLng = p.lng;
      if (p.lat > maxLat) maxLat = p.lat;
    }
    return new Bounds(new LonLat(minLng, minLat), new LonLat(maxLng, maxLat));
  }
}
