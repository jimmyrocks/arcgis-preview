import { GeoJSONVT, type GeoJSONVTOptions, type GeoJSONVTTile } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import type { VectorSourceSpecification } from 'maplibre-gl';

export const LOCAL_VECTOR_TILE_LAYER = 'arcgis';
export const LOCAL_VECTOR_TILE_ID_PROPERTY = '__arcgis_exact_id';

export type TileCoordinate = { z: number; x: number; y: number };

export type LocalVectorTileMetrics = {
  revision: number;
  featureCount: number;
  indexBuildMs: number;
  requests: number;
  cacheHits: number;
  generatedTiles: number;
  generatedBytes: number;
  generationMs: number;
};

export type LocalVectorTileOptions = {
  layerName?: string;
  exactIdProperty?: string;
  maxZoom?: number;
  indexMaxZoom?: number;
  indexMaxPoints?: number;
  tolerance?: number;
  extent?: number;
  buffer?: number;
};

type ProtocolRequest = { url: string };
type ProtocolResponse = { data: ArrayBuffer };

/**
 * Experimental in-memory MVT boundary for comparing MapLibre's GeoJSON source
 * with a vector source. It intentionally remains separate from the production
 * ArcGIS controller until measurements justify a backend abstraction.
 */
export class LocalVectorTileIndex {
  readonly layerName: string;
  readonly exactIdProperty: string;
  private readonly options: GeoJSONVTOptions;
  private index!: GeoJSONVT;
  private cache = new Map<string, Uint8Array>();
  private revision = 0;
  private featureCount = 0;
  private indexBuildMs = 0;
  private requests = 0;
  private cacheHits = 0;
  private generatedTiles = 0;
  private generatedBytes = 0;
  private generationMs = 0;

  constructor(data: FeatureCollection, options: LocalVectorTileOptions = {}) {
    this.layerName = options.layerName ?? LOCAL_VECTOR_TILE_LAYER;
    this.exactIdProperty = options.exactIdProperty ?? LOCAL_VECTOR_TILE_ID_PROPERTY;
    this.options = {
      maxZoom: options.maxZoom ?? 14,
      indexMaxZoom: options.indexMaxZoom ?? 5,
      indexMaxPoints: options.indexMaxPoints ?? 100_000,
      tolerance: options.tolerance ?? 3,
      extent: options.extent ?? 4096,
      buffer: options.buffer ?? 64,
    };
    this.replaceData(data);
  }

  replaceData(data: FeatureCollection): void {
    const started = performance.now();
    const normalized = withExactIdProperties(data, this.exactIdProperty);
    this.index = new GeoJSONVT(normalized, this.options);
    this.indexBuildMs = performance.now() - started;
    this.featureCount = normalized.features.length;
    this.revision += 1;
    this.cache.clear();
  }

  getTile({ z, x, y }: TileCoordinate): Uint8Array {
    validateCoordinate(z, x, y);
    this.requests += 1;
    const key = `${this.revision}/${z}/${x}/${y}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.cacheHits += 1;
      return cached;
    }

    const started = performance.now();
    const tile = this.index.getTile(z, x, y);
    const encoded = encodeTile(this.layerName, tile, this.options.extent ?? 4096);
    this.generationMs += performance.now() - started;
    this.generatedTiles += 1;
    this.generatedBytes += encoded.byteLength;
    this.cache.set(key, encoded);
    return encoded;
  }

  protocolHandler = async (request: ProtocolRequest): Promise<ProtocolResponse> => {
    const coordinate = parseTileCoordinate(request.url);
    const bytes = this.getTile(coordinate);
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return { data };
  };

  sourceSpecification(protocol: string, dataset = 'dataset'): VectorSourceSpecification {
    return {
      type: 'vector',
      tiles: [`${protocol}://${dataset}/{z}/{x}/{y}.pbf?v=${this.revision}`],
      minzoom: 0,
      maxzoom: this.options.maxZoom ?? 14,
      promoteId: this.exactIdProperty,
    };
  }

  metrics(): LocalVectorTileMetrics {
    return {
      revision: this.revision,
      featureCount: this.featureCount,
      indexBuildMs: this.indexBuildMs,
      requests: this.requests,
      cacheHits: this.cacheHits,
      generatedTiles: this.generatedTiles,
      generatedBytes: this.generatedBytes,
      generationMs: this.generationMs,
    };
  }
}

export type SourceModeComparison = {
  featureCount: number;
  geojsonBytes: number;
  geojsonStringifyMs: number;
  vectorIndexBuildMs: number;
  requestedTiles: number;
  uniqueTiles: number;
  vectorTileBytes: number;
  vectorTileGenerationMs: number;
};

export function compareGeoJSONAndLocalTiles(
  data: FeatureCollection,
  coordinates: TileCoordinate[],
  options: LocalVectorTileOptions = {},
): SourceModeComparison {
  const stringifyStarted = performance.now();
  const serialized = JSON.stringify(data);
  const geojsonStringifyMs = performance.now() - stringifyStarted;
  const geojsonBytes = new TextEncoder().encode(serialized).byteLength;
  const tiles = new LocalVectorTileIndex(data, options);
  for (const coordinate of coordinates) tiles.getTile(coordinate);
  const metrics = tiles.metrics();
  return {
    featureCount: data.features.length,
    geojsonBytes,
    geojsonStringifyMs,
    vectorIndexBuildMs: metrics.indexBuildMs,
    requestedTiles: metrics.requests,
    uniqueTiles: metrics.generatedTiles,
    vectorTileBytes: metrics.generatedBytes,
    vectorTileGenerationMs: metrics.generationMs,
  };
}

export function withExactIdProperties(data: FeatureCollection, exactIdProperty = LOCAL_VECTOR_TILE_ID_PROPERTY): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: data.features.map((feature) => {
      const properties: GeoJsonProperties = { ...(feature.properties ?? {}) };
      if (feature.id != null) properties[exactIdProperty] = feature.id;
      // MVT's native feature ID is uint64 and current JS encoders coerce string
      // IDs through Number. Keep exact IDs in a string property and let
      // MapLibre promote that property after decoding instead.
      const normalized: Feature<Geometry, GeoJsonProperties> = {
        type: 'Feature',
        properties,
        geometry: feature.geometry,
      };
      return normalized;
    }),
  };
}

export function parseTileCoordinate(url: string): TileCoordinate {
  const match = url.match(/\/(\d+)\/(\d+)\/(\d+)\.pbf(?:[?#].*)?$/);
  if (!match) throw new Error(`Invalid local vector tile URL: ${url}`);
  const coordinate = { z: Number(match[1]), x: Number(match[2]), y: Number(match[3]) };
  validateCoordinate(coordinate.z, coordinate.x, coordinate.y);
  return coordinate;
}

function validateCoordinate(z: number, x: number, y: number): void {
  const dimension = 2 ** z;
  if (!Number.isInteger(z) || z < 0 || z > 24
    || !Number.isInteger(x) || x < 0 || x >= dimension
    || !Number.isInteger(y) || y < 0 || y >= dimension) {
    throw new RangeError(`Invalid vector tile coordinate: ${z}/${x}/${y}`);
  }
}

function encodeTile(layerName: string, tile: GeoJSONVTTile | null, extent: number): Uint8Array {
  if (!tile) return new Uint8Array();
  return fromGeojsonVt({ [layerName]: tile }, { extent, version: 2 });
}
