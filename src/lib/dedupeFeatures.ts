import type { Feature } from 'geojson';
import { getFeatureId } from './ids';

export type DuplicateFeatureSummary = {
  inputCount: number;
  outputCount: number;
  duplicateCount: number;
  duplicateIdentityCount: number;
  duplicateNoIdCount: number;
  repeatedGeometryCount: number;
  suspectedDuplicateIds: Array<string | number>;
  examples: string[];
  reportKey: string;
};

export type DedupeFeatureResult = {
  features: Feature[];
  summary: DuplicateFeatureSummary;
};

const TRANSIENT_PROPERTY_KEYS = new Set(['__precision_m', '__zoom']);

export function dedupeFeatures(features: Feature[]): DedupeFeatureResult {
  const seenKeys = new Set<string>();
  const geometryKeys = new Map<string, { identities: Set<string>; suspectedIds: Array<string | number> }>();
  const output: Feature[] = [];
  const examples: string[] = [];
  let duplicateIdentityCount = 0;
  let duplicateNoIdCount = 0;

  for (const feature of features) {
    const identity = featureIdentity(feature);
    const fingerprint = featureFingerprint(feature);
    const dedupeKey = identity ? `id:${identity}` : `fingerprint:${fingerprint}`;
    const geometryKey = stableStringify(feature?.geometry ?? null);
    const mapId = featureMapId(feature);

    if (geometryKey) {
      const geometryIdentity = identity || `fingerprint:${fingerprint}`;
      let geometryEntry = geometryKeys.get(geometryKey);
      if (!geometryEntry) {
        geometryEntry = { identities: new Set<string>(), suspectedIds: [] };
        geometryKeys.set(geometryKey, geometryEntry);
      }
      if (!geometryEntry.identities.has(geometryIdentity) && geometryEntry.identities.size > 0 && mapId != null) {
        geometryEntry.suspectedIds.push(mapId);
      }
      geometryEntry.identities.add(geometryIdentity);
    }

    if (seenKeys.has(dedupeKey)) {
      if (identity) duplicateIdentityCount += 1;
      else duplicateNoIdCount += 1;
      if (examples.length < 4) examples.push(identity ? `id ${identity}` : 'identical no-id feature');
      continue;
    }

    seenKeys.add(dedupeKey);
    output.push(feature);
  }

  const repeatedGeometryGroups = Array.from(geometryKeys.values()).filter((entry) => entry.identities.size > 1);
  const repeatedGeometryCount = repeatedGeometryGroups.length;
  const suspectedDuplicateIds = uniqueIds(repeatedGeometryGroups.flatMap((entry) => entry.suspectedIds));
  const duplicateCount = duplicateIdentityCount + duplicateNoIdCount;
  return {
    features: output,
    summary: {
      inputCount: features.length,
      outputCount: output.length,
      duplicateCount,
      duplicateIdentityCount,
      duplicateNoIdCount,
      repeatedGeometryCount,
      suspectedDuplicateIds,
      examples,
      reportKey: [
        features.length,
        output.length,
        duplicateIdentityCount,
        duplicateNoIdCount,
        repeatedGeometryCount,
        suspectedDuplicateIds.join(','),
        examples.join('|')
      ].join(':')
    }
  };
}

function featureIdentity(feature: Feature): string {
  const id = getFeatureId(feature as any);
  return id == null ? '' : `${typeof id}:${String(id)}`;
}

function featureMapId(feature: Feature): string | number | null {
  const id = (feature as any)?.id;
  if (typeof id === 'string' || typeof id === 'number') return id;
  const fallback = getFeatureId(feature as any);
  return typeof fallback === 'string' || typeof fallback === 'number' ? fallback : null;
}

function uniqueIds(ids: Array<string | number>): Array<string | number> {
  const seen = new Set<string>();
  const out: Array<string | number> = [];
  for (const id of ids) {
    const key = `${typeof id}:${String(id)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

function featureFingerprint(feature: Feature): string {
  return stableStringify({
    geometry: feature?.geometry ?? null,
    properties: stableProperties(feature?.properties)
  });
}

function stableProperties(properties: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!properties || typeof properties !== 'object') return out;
  for (const key of Object.keys(properties).sort()) {
    if (TRANSIENT_PROPERTY_KEYS.has(key)) continue;
    out[key] = properties[key];
  }
  return out;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
