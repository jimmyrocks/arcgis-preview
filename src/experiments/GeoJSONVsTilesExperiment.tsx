import React from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  addProtocol,
  removeProtocol,
  type MapOptions,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Geometry, Point, Position } from 'geojson';
import {
  LOCAL_VECTOR_TILE_ID_PROPERTY,
  LOCAL_VECTOR_TILE_LAYER,
  LocalVectorTileIndex,
  type SourceModeComparison,
} from '../lib/localVectorTiles';
import {
  loadArcGISGeoJSON,
  type ArcGISGeoJSONLoadProgress,
  type ArcGISGeoJSONResult,
} from '../lib/arcgisGeoJSON';

const PROTOCOL = 'arcgis-mvt-experiment';
const UNSAFE_ID = '9223372036854775807';
const DEFAULT_SERVICE = 'https://carto.nationalmap.gov/arcgis/rest/services/govunits/MapServer/23';

type BrowserMetrics = SourceModeComparison & {
  vectorRequests: number;
  vectorCacheHits: number;
  vectorGeneratedBytes: number;
  geojsonRendered: number;
  vectorRendered: number;
  promotedSampleId: string | number | null;
  arcgisFetchMs: number;
  arcgisRequests: number;
};

type ExperimentDataset = {
  data: FeatureCollection;
  label: string;
  detail: string;
  fetchMs: number;
  requestCount: number;
};

declare global {
  interface Window {
    __sourceModeExperiment?: BrowserMetrics;
  }
}

export default function GeoJSONVsTilesExperiment() {
  const leftContainer = React.useRef<HTMLDivElement | null>(null);
  const rightContainer = React.useRef<HTMLDivElement | null>(null);
  const config = React.useMemo(readExperimentConfig, []);
  const [dataset, setDataset] = React.useState<ExperimentDataset | null>(null);
  const [progress, setProgress] = React.useState<ArcGISGeoJSONLoadProgress | null>(null);
  const [metrics, setMetrics] = React.useState<BrowserMetrics | null>(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const abortController = new AbortController();
    setError('');
    setDataset(null);
    setProgress(null);

    if (config.synthetic) {
      const data = syntheticPoints(config.featureCount);
      setDataset({
        data,
        label: 'Synthetic point grid',
        detail: `${data.features.length.toLocaleString()} generated features`,
        fetchMs: 0,
        requestCount: 0,
      });
      return () => abortController.abort();
    }

    loadArcGISGeoJSON(config.serviceUrl, {
      maxFeatures: config.featureLimit,
      maxAllowableOffset: config.maxAllowableOffset,
      signal: abortController.signal,
      onProgress: setProgress,
    }).then((result) => {
      if (abortController.signal.aborted) return;
      setDataset(toExperimentDataset(result, config.maxAllowableOffset));
    }).catch((cause) => {
      if (abortController.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => abortController.abort();
  }, [config]);

  React.useEffect(() => {
    if (!dataset || !leftContainer.current || !rightContainer.current) return;
    const { data } = dataset;
    const stringifyStarted = performance.now();
    const serialized = JSON.stringify(data);
    const geojsonStringifyMs = performance.now() - stringifyStarted;
    const tiles = new LocalVectorTileIndex(data);
    const initialTileMetrics = tiles.metrics();
    const initial: SourceModeComparison = {
      featureCount: data.features.length,
      geojsonBytes: new TextEncoder().encode(serialized).byteLength,
      geojsonStringifyMs,
      vectorIndexBuildMs: initialTileMetrics.indexBuildMs,
      requestedTiles: 0,
      uniqueTiles: 0,
      vectorTileBytes: 0,
      vectorTileGenerationMs: 0,
    };
    addProtocol(PROTOCOL, tiles.protocolHandler as any);

    const bounds = featureCollectionBounds(data);
    const mapOptions = (container: HTMLElement): MapOptions => ({
      container,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef2f7' } }],
      },
      center: bounds ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] : [0, 0],
      zoom: bounds ? 2 : 1,
      attributionControl: false,
      fadeDuration: 0,
    });
    const geojsonMap = new MapLibreMap(mapOptions(leftContainer.current));
    const vectorMap = new MapLibreMap(mapOptions(rightContainer.current));
    vectorMap.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    let syncing = false;
    let interval = 0;
    const geojsonLayerIds = sourceLayers('geojson', 'geojson-data');
    const vectorLayerIds = sourceLayers('vector', 'vector-data', LOCAL_VECTOR_TILE_LAYER);
    const sampleExactId = data.features.find((feature) => feature.id != null)?.id;

    const synchronize = (source: MapLibreMap, target: MapLibreMap) => {
      if (syncing) return;
      syncing = true;
      target.jumpTo({
        center: source.getCenter(),
        zoom: source.getZoom(),
        bearing: source.getBearing(),
        pitch: source.getPitch(),
      });
      syncing = false;
    };
    const onLeftMove = () => synchronize(geojsonMap, vectorMap);
    const onRightMove = () => synchronize(vectorMap, geojsonMap);
    geojsonMap.on('move', onLeftMove);
    vectorMap.on('move', onRightMove);

    const refreshMetrics = () => {
      try {
        const tileMetrics = tiles.metrics();
        const sampleVectorFeature = sampleExactId == null ? undefined : vectorMap
          .querySourceFeatures('vector-data', { sourceLayer: LOCAL_VECTOR_TILE_LAYER })
          .find((feature) => feature.properties?.[LOCAL_VECTOR_TILE_ID_PROPERTY] === String(sampleExactId));
        const next: BrowserMetrics = {
          ...initial,
          requestedTiles: tileMetrics.requests,
          uniqueTiles: tileMetrics.generatedTiles,
          vectorTileBytes: tileMetrics.generatedBytes,
          vectorTileGenerationMs: tileMetrics.generationMs,
          vectorRequests: tileMetrics.requests,
          vectorCacheHits: tileMetrics.cacheHits,
          vectorGeneratedBytes: tileMetrics.generatedBytes,
          geojsonRendered: geojsonMap.queryRenderedFeatures({ layers: geojsonLayerIds }).length,
          vectorRendered: vectorMap.queryRenderedFeatures({ layers: vectorLayerIds }).length,
          promotedSampleId: sampleVectorFeature?.id ?? null,
          arcgisFetchMs: dataset.fetchMs,
          arcgisRequests: dataset.requestCount,
        };
        window.__sourceModeExperiment = next;
        setMetrics(next);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    };

    geojsonMap.once('load', () => {
      geojsonMap.addSource('geojson-data', { type: 'geojson', data });
      geojsonLayerIds.forEach((_id, index) => geojsonMap.addLayer(sourceLayer('geojson', 'geojson-data', index)));
      if (bounds) geojsonMap.fitBounds(bounds, { padding: 24, duration: 0 });
    });
    vectorMap.once('load', () => {
      vectorMap.addSource('vector-data', tiles.sourceSpecification(PROTOCOL, 'real-data'));
      vectorLayerIds.forEach((_id, index) => vectorMap.addLayer(sourceLayer('vector', 'vector-data', index, LOCAL_VECTOR_TILE_LAYER)));
      if (bounds) vectorMap.fitBounds(bounds, { padding: 24, duration: 0 });
    });
    interval = window.setInterval(refreshMetrics, 100);

    return () => {
      window.clearInterval(interval);
      delete window.__sourceModeExperiment;
      geojsonMap.off('move', onLeftMove);
      vectorMap.off('move', onRightMove);
      geojsonMap.remove();
      vectorMap.remove();
      removeProtocol(PROTOCOL);
    };
  }, [dataset]);

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', color: '#172033', fontFamily: 'system-ui, sans-serif', padding: 16, boxSizing: 'border-box' }}>
      <h1 style={{ margin: '0 0 6px', fontSize: 22 }}>GeoJSON source vs local MVT source</h1>
      <p style={{ margin: '0 0 5px', maxWidth: 980, fontSize: 13, lineHeight: 1.5 }}>
        {dataset
          ? <>Both panes use the same <strong>{dataset.data.features.length.toLocaleString()}</strong> features from <strong>{dataset.label}</strong>. {dataset.detail}</>
          : progress
            ? <>Loading real ArcGIS data: {progress.loaded.toLocaleString()} / {progress.total.toLocaleString()} features…</>
            : <>Loading real ArcGIS layer metadata and features…</>}
      </p>
      <p style={{ margin: '0 0 14px', maxWidth: 980, fontSize: 12, color: '#526078' }}>
        The left sends one FeatureCollection to MapLibre’s GeoJSON worker. The right builds an in-memory geojson-vt index and exposes lazily encoded MVT through a custom protocol. Pan or zoom either map.
      </p>
      {error ? <div role="alert" style={{ marginBottom: 12, color: '#b42318' }}>{error}</div> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <ExperimentPane title="ArcGIS → GeoJSONSource" containerRef={leftContainer} testId="geojson-map" />
        <ExperimentPane title="ArcGIS → geojson-vt → VectorTileSource" containerRef={rightContainer} testId="vector-map" />
      </div>
      <section style={{ marginTop: 12, padding: 12, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15 }}>Live measurements</h2>
        {metrics ? (
          <table data-testid="source-mode-metrics" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              <Metric label="ArcGIS fetch" value={`${formatMs(metrics.arcgisFetchMs)} / ${metrics.arcgisRequests} requests`} />
              <Metric label="GeoJSON serialized bytes" value={formatBytes(metrics.geojsonBytes)} />
              <Metric label="GeoJSON stringify" value={formatMs(metrics.geojsonStringifyMs)} />
              <Metric label="MVT index build" value={formatMs(metrics.vectorIndexBuildMs)} />
              <Metric label="MVT protocol requests / cache hits" value={`${metrics.vectorRequests} / ${metrics.vectorCacheHits}`} />
              <Metric label="MVT generated bytes" value={formatBytes(metrics.vectorGeneratedBytes)} />
              <Metric label="MVT tile encoding" value={formatMs(metrics.vectorTileGenerationMs)} />
              <Metric label="Rendered features (GeoJSON / MVT)" value={`${metrics.geojsonRendered} / ${metrics.vectorRendered}`} />
              <Metric label="Sample ID after MVT promoteId" value={String(metrics.promotedSampleId ?? 'waiting…')} />
            </tbody>
          </table>
        ) : <div>{error ? 'The comparison could not start.' : 'Waiting for the ArcGIS response and both source workers…'}</div>}
      </section>
    </main>
  );
}

function ExperimentPane({ title, containerRef, testId }: {
  title: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  testId: string;
}) {
  return (
    <section>
      <h2 style={{ fontSize: 13, margin: '0 0 5px' }}>{title}</h2>
      <div ref={containerRef} data-testid={testId} style={{ height: 430, border: '1px solid #94a3b8', borderRadius: 6, overflow: 'hidden' }} />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th style={{ textAlign: 'left', padding: '3px 14px 3px 0', fontWeight: 600 }}>{label}</th>
      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</td>
    </tr>
  );
}

function sourceLayers(prefix: string, source: string, sourceLayer?: string): string[] {
  return [0, 1, 2].map((index) => sourceLayerId(prefix, source, index, sourceLayer));
}

function sourceLayerId(prefix: string, _source: string, index: number, _sourceLayer?: string): string {
  return `${prefix}-${['polygons', 'lines', 'points'][index]}`;
}

function sourceLayer(prefix: string, source: string, index: number, sourceLayer?: string): any {
  const common = {
    id: sourceLayerId(prefix, source, index, sourceLayer),
    source,
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}),
  };
  if (index === 0) {
    return {
      ...common,
      type: 'fill',
      filter: ['==', '$type', 'Polygon'],
      paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.3, 'fill-outline-color': '#1d4ed8' },
    };
  }
  if (index === 1) {
    return {
      ...common,
      type: 'line',
      filter: ['==', '$type', 'LineString'],
      paint: { 'line-color': '#1d4ed8', 'line-width': 1.5 },
    };
  }
  return {
    ...common,
    type: 'circle',
    filter: ['==', '$type', 'Point'],
    paint: {
      'circle-radius': 4,
      'circle-color': '#2563eb',
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1,
    },
  };
}

function syntheticPoints(count: number): FeatureCollection<Point> {
  const features: FeatureCollection<Point>['features'] = [{
    type: 'Feature',
    id: UNSAFE_ID,
    properties: { OBJECTID: UNSAFE_ID, name: 'unsafe-id-control' },
    geometry: { type: 'Point', coordinates: [0, 0] },
  }];
  const side = Math.ceil(Math.sqrt(Math.max(1, count - 1)));
  for (let index = 1; index < count; index += 1) {
    const column = (index - 1) % side;
    const row = Math.floor((index - 1) / side);
    features.push({
      type: 'Feature',
      id: index,
      properties: { OBJECTID: index, group: index % 10 },
      geometry: {
        type: 'Point',
        coordinates: [
          -170 + (column / Math.max(1, side - 1)) * 340,
          -75 + (row / Math.max(1, side - 1)) * 150,
        ],
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function toExperimentDataset(result: ArcGISGeoJSONResult, maxAllowableOffset: number): ExperimentDataset {
  const limited = result.data.features.length < result.availableFeatureCount
    ? `Loaded ${result.data.features.length.toLocaleString()} of ${result.availableFeatureCount.toLocaleString()} available features.`
    : `Loaded all ${result.availableFeatureCount.toLocaleString()} available features.`;
  return {
    data: result.data,
    label: result.layerName,
    detail: `${limited} Geometry was requested in WGS84 with maxAllowableOffset=${maxAllowableOffset}.`,
    fetchMs: result.fetchMs,
    requestCount: result.requestCount,
  };
}

function readExperimentConfig() {
  const parameters = new URLSearchParams(location.search);
  const synthetic = parameters.get('dataset') === 'synthetic';
  const rawFeatureCount = Number(parameters.get('features') || 10_000);
  const rawFeatureLimit = Number(parameters.get('limit') || 5_000);
  const rawOffset = Number(parameters.get('simplify') || 0.001);
  return {
    synthetic,
    serviceUrl: parameters.get('service') || DEFAULT_SERVICE,
    featureCount: Math.max(10, Math.min(100_000, Number.isFinite(rawFeatureCount) ? Math.floor(rawFeatureCount) : 10_000)),
    featureLimit: Math.max(1, Math.min(100_000, Number.isFinite(rawFeatureLimit) ? Math.floor(rawFeatureLimit) : 5_000)),
    maxAllowableOffset: Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0.001),
  };
}

function featureCollectionBounds(data: FeatureCollection): [[number, number], [number, number]] | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  const visitPosition = (position: Position) => {
    if (position.length < 2 || !Number.isFinite(position[0]) || !Number.isFinite(position[1])) return;
    west = Math.min(west, position[0]);
    south = Math.min(south, position[1]);
    east = Math.max(east, position[0]);
    north = Math.max(north, position[1]);
  };
  const visitCoordinates = (coordinates: unknown): void => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === 'number') {
      visitPosition(coordinates as Position);
      return;
    }
    coordinates.forEach(visitCoordinates);
  };
  const visitGeometry = (geometry: Geometry | null): void => {
    if (!geometry) return;
    if (geometry.type === 'GeometryCollection') geometry.geometries.forEach(visitGeometry);
    else visitCoordinates(geometry.coordinates);
  };
  data.features.forEach((feature) => visitGeometry(feature.geometry));
  return Number.isFinite(west) ? [[west, south], [east, north]] : null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes.toLocaleString()} B`;
}

function formatMs(milliseconds: number): string {
  return `${milliseconds.toFixed(2)} ms`;
}
