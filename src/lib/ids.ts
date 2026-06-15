export function getFeatureId(f: any): string | number | null {
  try {
    if (f?.id != null) return f.id;
    const props = f?.properties || f?.attributes || {};
    const keys = Object.keys(props);
    const oidKey = keys.find(k => /^(objectid|object-id|fid|id)$/i.test(k));
    if (oidKey) return props[oidKey];
    return null;
  } catch { return null; }
}

export function findFeatureById(fc: any, id: string | number | null): any | null {
  if (!fc || !Array.isArray(fc.features) || id == null) return null;
  return fc.features.find((f: any) => {
    try {
      if (f?.id != null) return String(f.id) === String(id);
      return String(f?.properties?.__id) === String(id);
    } catch { return false; }
  }) || null;
}

