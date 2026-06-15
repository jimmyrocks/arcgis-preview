export function filterFeatureCollectionByRowIds(featureCollection: any, rows: any[]): any {
  try {
    const fc = featureCollection && featureCollection.type === 'FeatureCollection' ? featureCollection : { type: 'FeatureCollection', features: [] };
    const ids = new Set((rows || []).map((r: any) => r?.__id).filter((v: any) => v != null));
    const feats = Array.isArray(fc.features) ? fc.features.filter((f: any) => {
      const id = f?.properties?.__id;
      return ids.size ? ids.has(id) : true;
    }) : [];
    return { type: 'FeatureCollection', features: feats };
  } catch {
    return { type: 'FeatureCollection', features: [] };
  }
}

export function downloadText(filename: string, mime: string, content: string) {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {}
}

export function downloadBlob(filename: string, mime: string, data: BlobPart | ArrayBuffer | Uint8Array | BlobPart[]) {
  try {
    let parts: BlobPart[];
    if (Array.isArray(data)) {
      parts = data as BlobPart[];
    } else if (data instanceof Uint8Array) {
      // Convert to plain ArrayBuffer to satisfy older DOM lib typings
      const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      parts = [ab as ArrayBuffer];
    } else {
      parts = [data as BlobPart];
    }
    const blob = new Blob(parts, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {}
}
