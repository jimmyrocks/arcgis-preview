import { parseArcGISJSON, type ArcGISInteger } from '@opendataland/source-arcgis';
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

export type ArcGISGeoJSONLoadProgress = {
  loaded: number;
  total: number;
  page: number;
};

export type ArcGISGeoJSONResult = {
  data: FeatureCollection;
  layerName: string;
  geometryType: string;
  objectIdField: string | null;
  availableFeatureCount: number;
  requestCount: number;
  fetchMs: number;
};

export type ArcGISGeoJSONLoadOptions = {
  maxFeatures?: number;
  maxAllowableOffset?: number;
  signal?: AbortSignal;
  onProgress?: (progress: ArcGISGeoJSONLoadProgress) => void;
  fetchImpl?: typeof fetch;
};

type ArcGISField = { name?: string; type?: string };
type ArcGISLayerMetadata = {
  name?: string;
  geometryType?: string;
  maxRecordCount?: number | ArcGISInteger;
  objectIdField?: string;
  objectIdFieldName?: string;
  fields?: ArcGISField[];
  error?: { message?: string };
};

type CountResponse = {
  count?: number | ArcGISInteger;
  error?: { message?: string };
};

export async function loadArcGISGeoJSON(
  layerUrl: string,
  options: ArcGISGeoJSONLoadOptions = {},
): Promise<ArcGISGeoJSONResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const normalizedLayerUrl = layerUrl.replace(/\/+$/, '');
  const started = performance.now();
  let requestCount = 0;

  const requestJSON = async <T>(url: string): Promise<T> => {
    requestCount += 1;
    const response = await fetchImpl(url, { signal: options.signal });
    if (!response.ok) throw new Error(`ArcGIS request failed (${response.status} ${response.statusText})`);
    return parseArcGISJSON(await response.text()) as T;
  };

  const metadataUrl = buildArcGISRequestUrl(normalizedLayerUrl, { f: 'json' });
  const countUrl = buildArcGISRequestUrl(`${normalizedLayerUrl}/query`, {
    where: '1=1',
    returnCountOnly: 'true',
    f: 'json',
  });
  const [metadata, countResponse] = await Promise.all([
    requestJSON<ArcGISLayerMetadata>(metadataUrl),
    requestJSON<CountResponse>(countUrl),
  ]);
  throwArcGISError(metadata);
  throwArcGISError(countResponse);

  const objectIdField = metadata.objectIdField
    ?? metadata.objectIdFieldName
    ?? metadata.fields?.find((field) => field.type === 'esriFieldTypeOID')?.name
    ?? null;
  const availableFeatureCount = toBoundedNumber(countResponse.count, 0);
  const requestedLimit = options.maxFeatures == null
    ? availableFeatureCount
    : Math.max(1, Math.floor(options.maxFeatures));
  const targetCount = Math.min(availableFeatureCount, requestedLimit);
  const advertisedPageSize = toBoundedNumber(metadata.maxRecordCount, 2_000);
  const pageSize = Math.max(1, Math.min(2_000, advertisedPageSize));
  const features: Feature<Geometry, GeoJsonProperties>[] = [];

  for (let offset = 0, page = 1; offset < targetCount; offset += pageSize, page += 1) {
    const resultRecordCount = Math.min(pageSize, targetCount - offset);
    const queryUrl = buildArcGISRequestUrl(`${normalizedLayerUrl}/query`, {
      where: '1=1',
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(resultRecordCount),
      ...(objectIdField ? { orderByFields: objectIdField } : {}),
      ...(options.maxAllowableOffset && options.maxAllowableOffset > 0
        ? { maxAllowableOffset: String(options.maxAllowableOffset) }
        : {}),
    });
    const pageData = await requestJSON<FeatureCollection | { error?: { message?: string } }>(queryUrl);
    throwArcGISError(pageData);
    if (!isFeatureCollection(pageData)) throw new Error('ArcGIS returned an invalid GeoJSON response');
    const normalized = normalizeArcGISGeoJSONPage(pageData, objectIdField);
    features.push(...normalized.features);
    options.onProgress?.({ loaded: features.length, total: targetCount, page });
    if (normalized.features.length < resultRecordCount) break;
  }

  return {
    data: { type: 'FeatureCollection', features },
    layerName: metadata.name ?? 'ArcGIS layer',
    geometryType: metadata.geometryType ?? inferGeometryType(features[0]?.geometry),
    objectIdField,
    availableFeatureCount,
    requestCount,
    fetchMs: performance.now() - started,
  };
}

export function buildArcGISRequestUrl(
  baseUrl: string,
  parameters: Record<string, string>,
): string {
  const url = new URL(baseUrl);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  return url.toString();
}

export function normalizeArcGISGeoJSONPage(
  data: FeatureCollection,
  objectIdField: string | null,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: data.features.map((feature) => {
      const oid = objectIdField ? feature.properties?.[objectIdField] : undefined;
      if (feature.id != null || (typeof oid !== 'number' && typeof oid !== 'string')) return feature;
      return { ...feature, id: oid };
    }),
  };
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
  return Boolean(value && typeof value === 'object'
    && (value as FeatureCollection).type === 'FeatureCollection'
    && Array.isArray((value as FeatureCollection).features));
}

function throwArcGISError(value: unknown): void {
  if (!value || typeof value !== 'object' || !('error' in value)) return;
  const error = (value as { error?: { message?: string } }).error;
  if (error) throw new Error(error.message || 'ArcGIS request failed');
}

function toBoundedNumber(value: number | ArcGISInteger | undefined, fallback: number): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function inferGeometryType(geometry: Geometry | null | undefined): string {
  if (!geometry) return '';
  return `esriGeometry${geometry.type.replace(/^Multi/, '')}`;
}
