export async function countInExtent(layerUrl: string, bbox4326: string, where?: string): Promise<number> {
  const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('returnCountOnly', 'true');
  url.searchParams.set('where', (where && where.trim()) || '1=1');
  url.searchParams.set('geometry', bbox4326);
  url.searchParams.set('geometryType', 'esriGeometryEnvelope');
  url.searchParams.set('inSR', '4326');
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load feature count in extent: ${res.status}`);
  const json = await res.json();
  const n = typeof json?.count === 'number' ? json.count : (typeof json?.featureCount === 'number' ? json.featureCount : 0);
  return n;
}

export async function countLayer(layerUrl: string, where?: string): Promise<number> {
  const url = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('returnCountOnly', 'true');
  url.searchParams.set('where', (where && where.trim()) || '1=1');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load feature count: ${res.status}`);
  const json = await res.json();
  const n = typeof json?.count === 'number' ? json.count : (typeof json?.featureCount === 'number' ? json.featureCount : 0);
  return n;
}

