import type { MapServiceLayerInfo } from './types/arcgis-rest';

export function buildLayerUrl(serviceUrl: string | undefined, id: number | undefined): string | null {
  if (!serviceUrl || id === undefined || id === null) return null;
  const trimmed = serviceUrl.replace(/\/+$/, '');
  if (/\/(\d+)$/.test(trimmed)) return trimmed; // already a layer URL
  if (/\/(MapServer|FeatureServer)$/i.test(trimmed)) return `${trimmed}/${id}`;
  return null;
}

export function formatDate(d: Date): string {
  try { return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); }
  catch { return d.toISOString(); }
}

export function timeExtentToBadge(timeInfo: any): string {
  try {
    const ext = timeInfo?.timeExtent;
    if (!Array.isArray(ext) || ext.length < 2) return '';
    const [start, end] = ext;
    const fmtYear = (v: any) => {
      if (v === null || v === undefined) return '';
      const n = Number(v);
      if (!Number.isFinite(n)) return '';
      return String(new Date(n).getUTCFullYear());
    };
    const a = fmtYear(start);
    const b = fmtYear(end);
    if (a && b) return `Data from ${a}-${b}`;
    if (a && !b) return `Data since ${a}`;
    if (!a && b) return `Data until ${b}`;
    return '';
  } catch { return ''; }
}

// Attempts to compute most recent edit date as a formatted string.
// Falls back to '', avoiding errors.
export async function computeLastEditDateString(layerMeta: MapServiceLayerInfo | null | undefined, serviceUrl?: string): Promise<string> {
  try {
    if (!layerMeta) return '';
    const editingInfo = (layerMeta as any)?.editingInfo;
    const editFieldsInfo = (layerMeta as any)?.editFieldsInfo;
    if (editingInfo && typeof editingInfo?.lastEditDate === 'number') {
      return formatDate(new Date(editingInfo.lastEditDate));
    }
    const editField: string | undefined = editFieldsInfo?.editDateField || editFieldsInfo?.lastEditDateField || editFieldsInfo?.editDateFieldName;
    if (editField) {
      const url = buildLayerUrl(serviceUrl, layerMeta?.id);
      if (!url) return '';
      const stats = [{ statisticType: 'max', onStatisticField: editField, outStatisticFieldName: 'maxEditDate' }];
      const q = new URL(`${url.replace(/\/+$/, '')}/query`);
      q.searchParams.set('f', 'json');
      q.searchParams.set('where', '1=1');
      q.searchParams.set('outFields', '');
      q.searchParams.set('returnGeometry', 'false');
      q.searchParams.set('outStatistics', JSON.stringify(stats));
      const res = await fetch(q.toString());
      if (!res.ok) return '';
      const json = await res.json();
      const feats = Array.isArray(json?.features) ? json.features : [];
      const attrs = feats[0]?.attributes || {};
      const maxTs = attrs?.maxEditDate;
      if (typeof maxTs === 'number' && Number.isFinite(maxTs)) {
        return formatDate(new Date(maxTs));
      }
    }
    return '';
  } catch {
    return '';
  }
}

