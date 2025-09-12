import React from 'react';
import { downloadText, downloadBlob, filterFeatureCollectionByRowIds } from '../../../lib/export';
import buildExportMeta from '../../../lib/exportMeta';
import { featureCollectionToKml, featureCollectionToKmz } from '../../../lib/kml';
import { fetchFeatureCountInExtent } from '../../../lib/esriLayer';
import CopyButton from '../../ui/CopyButton';
import { toast } from 'react-toastify';
import { approxPrecisionMetersFromZoomLat } from '../../../lib/mapMath';

type Props = {
  rows: any[];
  datasetName?: string;
  featureCollection?: any;
  whereValue?: string;
  serviceUrl?: string;
  layerId?: number;
  geometryType?: string | undefined;
  spatialWkid?: number | undefined;
  zoom?: number | undefined;
  bbox?: string | undefined; // minX, minY, maxX, maxY (WGS84)
  center?: string | undefined; // "lat, lng"
  layerTotal?: number | undefined;
  renderer?: any;
};

export default function DownloadTab({ rows, datasetName = 'features', featureCollection, whereValue = '1=1', serviceUrl, layerId, geometryType, spatialWkid, zoom = 0, bbox = '', center = '', layerTotal, renderer }: Props) {
  const hasGeom = Boolean(featureCollection && Array.isArray(featureCollection.features) && featureCollection.features.some((f: any) => f && f.geometry));
  const featureCount = hasGeom ? (featureCollection.features.length || 0) : 0;
  const attrRows = React.useMemo(() => {
    try {
      if (featureCollection && Array.isArray(featureCollection.features)) {
        return featureCollection.features.map((f: any) => ({ ...(f?.properties || {}) }));
      }
    } catch {}
    return Array.isArray(rows) ? rows : [];
  }, [featureCollection, rows]);
  const rowCount = attrRows.length;
  const isPoint = (geometryType || '').toLowerCase().includes('point');
  const [totalInView, setTotalInView] = React.useState<number | null>(null);
  const [loadingCount, setLoadingCount] = React.useState<boolean>(false);
  const [attrFormat, setAttrFormat] = React.useState<'csv' | 'json'>('csv');
  const allFields = React.useMemo(() => {
    try {
      const keys: string[] = Array.from((attrRows || []).reduce((s: Set<string>, r: any) => { Object.keys(r || {}).forEach(k => s.add(k)); return s; }, new Set<string>()));
      return keys;
    } catch { return [] as string[]; }
  }, [attrRows]);
  const [selectedFields, setSelectedFields] = React.useState<string[]>([]);
  const activeFields = selectedFields.length ? selectedFields : allFields;

  React.useEffect(() => {
    let cancelled = false;
    async function loadCount() {
      setLoadingCount(true);
      try {
        const layerUrl = resolveLayerUrl(serviceUrl, layerId);
        if (isPoint && layerUrl && bbox) {
          const n = await fetchFeatureCountInExtent(layerUrl, bbox, whereValue);
          if (!cancelled) setTotalInView(n);
        } else {
          if (!cancelled) setTotalInView(null);
        }
      } catch { if (!cancelled) setTotalInView(null); }
      finally { if (!cancelled) setLoadingCount(false); }
    }
    loadCount();
    return () => { cancelled = true; };
  }, [serviceUrl, layerId, whereValue, bbox, isPoint]);

  const readiness = React.useMemo(() => {
    if (!hasGeom) return { color: 'gray', label: 'N/A' };
    if (!isPoint) return { color: 'red', label: 'Low precision' };
    if (loadingCount) return { color: 'yellow', label: 'Checking…' };
    // Green only when ALL features are loaded into memory
    if (typeof layerTotal === 'number' && layerTotal > 0 && featureCount >= layerTotal) {
      return { color: 'green', label: 'Complete' };
    }
    return featureCount > 0 ? { color: 'yellow', label: 'Partial' } : { color: 'gray', label: 'N/A' };
  }, [hasGeom, isPoint, featureCount, totalInView, loadingCount, layerTotal]);

  const attrReadiness = React.useMemo(() => {
    if (rowCount === 0) return { color: 'red' as const, label: 'No data' };
    // Green only when ALL features are loaded into memory
    if (typeof layerTotal === 'number' && layerTotal > 0 && rowCount >= layerTotal) {
      return { color: 'green' as const, label: 'Complete' };
    }
    return { color: 'yellow' as const, label: 'Partial' };
  }, [rowCount, layerTotal]);

  const tolerance = React.useMemo(() => {
    // Approx display tolerance (meters) based on zoom and center latitude
    const lat = parseFloat((center || '').split(',')[0] || '0'); // center comes as "lat, lng"
    if (isPoint) return { text: 'Exact locations (no simplification)', range: null };
    const base = approxPrecisionMetersFromZoomLat(zoom || 0, lat);
    const min = Math.max(1, base);
    const max = Math.max(min, Math.round(base * (4 / 1.5)));
    return { text: `Display-simplified; vertices spaced ~${min}–${max} m at this zoom`, range: [min, max] as [number, number] };
  }, [zoom, center, isPoint]);

  const storedRange: { min: number; max: number } | null = React.useMemo(() => {
    try { const r = (featureCollection as any)?._precision_range_m; if (r && typeof r.min === 'number' && typeof r.max === 'number') return r; } catch {}
    return null;
  }, [featureCollection]);

  const [geomFormat, setGeomFormat] = React.useState<'geojson' | 'kml' | 'kmz'>('geojson');

  function downloadGeometry() {
    if (!hasGeom) return;
    const out = filterFeatureCollectionByRowIds(featureCollection, rows || []);
    const meta = buildExportMeta({
      exportType: 'on-screen', geometryType, zoom, bbox, where: whereValue, rendered: featureCount, totalInView: totalInView ?? undefined, tolerance: tolerance.range || undefined, serviceUrl, layerId, crs: spatialWkid,
    });
    const name = buildExportFileName(datasetName, 'on-screen', zoom, featureCount);
    if (geomFormat === 'kml') {
      const kml = featureCollectionToKml(out, { name: datasetName, metaJson: JSON.stringify(meta), renderer, geometryType, inlineIcons: false });
      downloadText(`${name}.kml`, 'application/vnd.google-earth.kml+xml', kml);
    } else if (geomFormat === 'kmz') {
      const kmz = featureCollectionToKmz(out, { name: datasetName, metaJson: JSON.stringify(meta), renderer, geometryType });
      downloadBlob(`${name}.kmz`, 'application/vnd.google-earth.kmz', kmz);
    } else {
      try { (out as any)._export_meta = meta; } catch {}
      downloadText(`${name}.geojson`, 'application/geo+json', JSON.stringify(out));
    }
    showExportToast(readiness.color, featureCount, totalInView ?? undefined);
  }

  // Precompute GeoJSON text for clipboard when selected and available
  const geojsonCopyText = React.useMemo(() => {
    try {
      if (!hasGeom || featureCount === 0 || geomFormat !== 'geojson') return '';
      const out = filterFeatureCollectionByRowIds(featureCollection, rows || []);
      const meta = buildExportMeta({
        exportType: 'on-screen', geometryType, zoom, bbox, where: whereValue, rendered: featureCount, totalInView: totalInView ?? undefined, tolerance: tolerance.range || undefined, serviceUrl, layerId, crs: spatialWkid,
      });
      try { (out as any)._export_meta = meta; } catch {}
      return JSON.stringify(out);
    } catch { return ''; }
  }, [hasGeom, featureCount, geomFormat, featureCollection, rows, geometryType, zoom, bbox, whereValue, totalInView, tolerance.range, serviceUrl, layerId, spatialWkid]);

  const geojsonIoUrl = React.useMemo(() => {
    try {
      if (!geojsonCopyText) return '';
      return `https://geojson.io/#data=data:application/json,${encodeURIComponent(geojsonCopyText)}`;
    } catch { return ''; }
  }, [geojsonCopyText]);

  const attributesCopyText = React.useMemo(() => {
    try {
      if (!rowCount) return '';
      const meta = buildExportMeta({
        exportType: 'attributes', geometryType, zoom, bbox, where: whereValue, rendered: rowCount, totalInView: totalInView ?? undefined, tolerance: tolerance.range || undefined, serviceUrl, layerId, crs: spatialWkid,
      });
      const rowsOut = (attrRows || []).map((r: any) => {
        if (!activeFields.length) return r;
        const out: any = {};
        activeFields.forEach(k => { out[k] = r[k]; });
        return out;
      });
      if (attrFormat === 'json') {
        const payload = { _export_meta: meta, rows: rowsOut };
        return JSON.stringify(payload);
      } else {
        return toCSV(rowsOut || []);
      }
    } catch { return ''; }
  }, [rowCount, attrRows, activeFields, attrFormat, geometryType, zoom, bbox, whereValue, totalInView, tolerance.range, serviceUrl, layerId, spatialWkid]);
  function downloadAttributes() {
    const meta = buildExportMeta({
      exportType: 'attributes', geometryType, zoom, bbox, where: whereValue, rendered: rowCount, totalInView: totalInView ?? undefined, tolerance: tolerance.range || undefined, serviceUrl, layerId, crs: spatialWkid,
    });
    const name = buildExportFileName(datasetName, 'attributes', zoom, rowCount);
    if (attrFormat === 'json') {
      const rowsOut = (attrRows || []).map((r: any) => {
        if (!activeFields.length) return r;
        const out: any = {};
        activeFields.forEach(k => { out[k] = r[k]; });
        return out;
      });
      const payload = { _export_meta: meta, rows: rowsOut };
      downloadText(`${name}.json`, 'application/json', JSON.stringify(payload));
    } else {
      const rowsOut = (attrRows || []).map((r: any) => {
        if (!activeFields.length) return r;
        const out: any = {};
        activeFields.forEach(k => { out[k] = r[k]; });
        return out;
      });
      const csv = toCSV(rowsOut || []);
      downloadText(`${name}.csv`, 'text/csv', csv);
      downloadText(`${name}.meta.json`, 'application/json', JSON.stringify(meta));
    }
    const color = attrReadiness.color;
    const total = (isPoint && totalInView != null) ? totalInView : layerTotal;
    showExportToast(color, rowCount, total);
  }

  const totalForGeo = ((): number | null => {
    if (typeof layerTotal === 'number') return layerTotal;
    if (isPoint && totalInView != null) return totalInView;
    return null;
  })();

  const statusDetailGeo = (() => {
    const MASSIVE = 50000;
    if (readiness.color === 'yellow') return 'Pan/zoom the map to load the full dataset.';
    const total = totalForGeo ?? layerTotal ?? null;
    if (typeof total === 'number' && total > MASSIVE) return 'Large dataset; consider filtering (WHERE) or zooming in.';
    if (readiness.color === 'green') return 'All records are loaded.';
    return '';
  })();

  const statusDetailAttr = (() => {
    const MASSIVE = 50000;
    if (attrReadiness.color === 'yellow') return 'Pan/zoom the map to load the full dataset.';
    if (typeof layerTotal === 'number' && layerTotal > MASSIVE) return 'Large dataset; consider selecting fewer fields or filtering.';
    if (attrReadiness.color === 'green') return 'All records are loaded.';
    if (attrReadiness.color === 'red') return 'No records in view.';
    return '';
  })();

  // Build a quick Query URL for convenient copy
  const queryUrlQuick = React.useMemo(() => {
    try {
      const layerUrl = resolveLayerUrl(serviceUrl, layerId);
      if (!layerUrl) return '';
      const u = new URL(`${layerUrl.replace(/\/+$/, '')}/query`);
      u.searchParams.set('f', 'json');
      u.searchParams.set('outFields', '*');
      const w = String(whereValue || '').trim();
      u.searchParams.set('where', w || '1=1');
      const e = String(bbox || '').replace(/\s+/g, '');
      if (e) {
        u.searchParams.set('geometry', e);
        u.searchParams.set('geometryType', 'esriGeometryEnvelope');
        u.searchParams.set('inSR', '4326');
        u.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
      }
      return u.toString();
    } catch { return ''; }
  }, [serviceUrl, layerId, whereValue, bbox]);

  // Responsive: use short count labels on narrow viewports
  const [viewportWidth, setViewportWidth] = React.useState<number>(() => {
    try { return typeof window !== 'undefined' ? window.innerWidth : 1200; } catch { return 1200; }
  });
  React.useEffect(() => {
    const onResize = () => { try { setViewportWidth(window.innerWidth); } catch {} };
    try { window.addEventListener('resize', onResize); } catch {}
    return () => { try { window.removeEventListener('resize', onResize); } catch {} };
  }, []);
  const useShortCount = viewportWidth < 900;
  const fmtCount = (n: number, total?: number | null): string => {
    if (typeof total === 'number') return useShortCount ? `${n}/${total}` : `${n.toLocaleString()} of ${total.toLocaleString()}`;
    return n.toLocaleString();
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ color: 'var(--muted)', fontSize: 12 }}>Download current data</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <small style={{ color: 'var(--muted)' }}>Quick Copy:</small>
        <CopyButton text={bbox || ''} />
        <span style={{ color: 'var(--muted)' }}>BBox</span>
        <CopyButton text={center || ''} />
        <span style={{ color: 'var(--muted)' }}>Center</span>
        <CopyButton text={queryUrlQuick || ''} />
        <span style={{ color: 'var(--muted)' }}>Query URL</span>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
          <colgroup>
            {/* Label/format column (even smaller) */}
            <col style={{ width: '20%' }} />
            {/* Count (narrow, right aligned) */}
            <col style={{ width: '12%' }} />
            {/* Status (extra room for wrapping) */}
            <col style={{ width: '44%' }} />
            {/* Action (wider for stacked controls) */}
            <col style={{ width: '24%' }} />
          </colgroup>
          <thead>
            <tr style={{ background: 'var(--panel-strong)' }}>
              {/* Format label removed per UX simplification */}
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}></th>
              <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>Count</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>Status</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--divider-weak)', whiteSpace: 'normal' }}>
                Attributes + Geospatial
                <div style={{ marginTop: 6 }}>
                  
                  <select value={geomFormat} onChange={(e) => setGeomFormat((e.target.value as any) || 'geojson')} style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)' }}>
                    <option value="geojson">GeoJSON</option>
                    <option value="kml">KML</option>
                    <option value="kmz">KMZ</option>
                  </select>
                  {/* Copy + geojson.io moved to Action column */}
                </div>
              </td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--divider-weak)', textAlign: 'right', whiteSpace: 'normal' }}>
                {hasGeom ? (
                  <div style={{ whiteSpace: 'normal' }}>
                    <div>
                      {fmtCount(featureCount, totalForGeo)}
                    </div>
                  </div>
                ) : '—'}
              </td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--divider-weak)', color: 'var(--text)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <ReadinessBadge color={readiness.color} label={readiness.label} />
                  <div style={{ color: 'var(--muted)', whiteSpace: 'normal' }}>
                    Geometry is simplified for display purposes, use{' '}
                    <a href="https://geodatadownloader.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span>geodatadownloader.com</span>
                      <span aria-hidden="true" style={{ fontSize: 12 }}>↗</span>
                    </a>
                    {' '}for full precision.
                  </div>
                  {readiness.color === 'red' && storedRange ? (
                    <div style={{ color: 'var(--muted)', whiteSpace: 'normal' }}>Stored precision range: ~{storedRange.min}–~{storedRange.max} m</div>
                  ) : null}
                  {statusDetailGeo ? (
                    <div style={{ color: 'var(--muted)', whiteSpace: 'normal' }}>{statusDetailGeo}</div>
                  ) : null}
                </div>
              </td>
              <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--divider-weak)' }}>
                <div style={{ display: 'grid', justifyItems: 'stretch', gap: 6 }}>
                  <button
                    onClick={downloadGeometry}
                    disabled={!hasGeom || featureCount === 0}
                    title={!hasGeom || featureCount === 0 ? 'No features in view.' : undefined}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', cursor: (!hasGeom || featureCount === 0) ? 'not-allowed' : 'pointer' }}
                  >
                    ⬇️ Download
                  </button>
                  {geomFormat === 'geojson' && hasGeom && featureCount > 0 ? (
                    <>
                      <span title="Copy GeoJSON to clipboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <CopyButton text={geojsonCopyText} />
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Copy GeoJSON</span>
                      </span>
                      <a href={geojsonIoUrl || '#'} target="_blank" rel="noreferrer" title="Open at geojson.io (external site)" style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span>geojson.io</span>
                        <span aria-hidden="true" style={{ fontSize: 12 }}>↗</span>
                      </a>
                    </>
                  ) : null}
                </div>
                {featureCount > 10000 ? (
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>Large export; may be slow to download.</div>
                ) : null}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 8px', whiteSpace: 'normal' }}>
                Attributes
                <div style={{ marginTop: 6 }}>
                  
                  <select value={attrFormat} onChange={(e) => setAttrFormat((e.target.value as any) || 'csv')} style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)' }}>
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                  </select>
                  {/* Copy button moved to Action column */}
                </div>
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'normal' }}>
                <div style={{ whiteSpace: 'normal' }}>{fmtCount(rowCount, typeof layerTotal === 'number' ? layerTotal : null)}</div>
              </td>
              <td style={{ padding: '6px 8px', color: 'var(--text)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                  <ReadinessBadge color={attrReadiness.color} label={attrReadiness.label} />
                  <span style={{ color: 'var(--muted)', whiteSpace: 'normal' }}>{statusDetailAttr}</span>
                </div>
              </td>
              <td style={{ padding: '6px 8px' }}>
                <div style={{ display: 'grid', justifyItems: 'stretch', gap: 6 }}>
                  <button onClick={downloadAttributes} disabled={!rowCount} title={!rowCount ? 'No attributes in view.' : undefined} style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', cursor: rowCount ? 'pointer' : 'not-allowed' }}>⬇️ Download</button>
                  {rowCount > 0 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={`Copy ${attrFormat.toUpperCase()} to clipboard`}>
                      <CopyButton text={attributesCopyText} />
                      <span style={{ color: 'var(--muted)', fontSize: 12 }}>Copy {attrFormat.toUpperCase()}</span>
                    </span>
                  ) : null}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReadinessBadge({ color, label }: { color: 'red' | 'yellow' | 'green' | 'gray' | string; label: string }) {
  const dot = color === 'red' ? '🟥' : color === 'yellow' ? '🟨' : color === 'green' ? '🟩' : '⬜';
  return <span aria-label={`Readiness: ${label}`} title={`Readiness: ${label}`} style={{ whiteSpace: 'nowrap' }}>{dot} <span style={{ color: 'var(--muted)' }}>{label}</span></span>;
}

function resolveLayerUrl(serviceUrl?: string, layerId?: number): string | null {
  if (!serviceUrl) return null;
  const trimmed = serviceUrl.replace(/\/+$/, '');
  if (/\/(\d+)$/.test(trimmed)) return trimmed;
  if (typeof layerId === 'number' && /(MapServer|FeatureServer)$/i.test(trimmed)) return `${trimmed}/${layerId}`;
  return null;
}

function buildExportFileName(dataset: string, kind: 'on-screen' | 'attributes', zoom: number, n: number): string {
  const now = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const base = dataset || 'dataset';
  return kind === 'on-screen'
    ? `${sanitize(base)}_on-screen_z${zoom}_${stamp}_n${n}`
    : `${sanitize(base)}_attributes_${stamp}_n${n}`;
}

// buildExportMeta moved to src/lib/exportMeta.ts

function sanitize(s: string): string { return s.replace(/[^a-z0-9_\-]+/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, ''); }

function showExportToast(color: string, rendered: number, total?: number) {
  try {
    if (color === 'red') toast('Export complete (simplified geometry or no data). For analysis, use backend tools.', { type: 'warning', autoClose: 2500 });
    else if (color === 'yellow') {
      const msg = typeof total === 'number' ? `Exported visible records (partial: ${rendered.toLocaleString()}/${total.toLocaleString()}).` : `Exported visible records (partial: ${rendered.toLocaleString()}).`;
      toast(msg, { type: 'info', autoClose: 2500 });
    }
    else if (color === 'green') toast(`Exported visible records (complete: ${rendered.toLocaleString()}).`, { type: 'success', autoClose: 2000 });
  } catch {}
}

function toCSV(rows: any[]): string {
  const keys: string[] = Array.from(rows.reduce((s: Set<string>, r: any) => { Object.keys(r || {}).forEach(k => s.add(k)); return s; }, new Set<string>()));
  if (keys.length === 0) return '';
  const esc = (v: any) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = keys.join(',');
  const lines = rows.map((r: any) => keys.map(k => esc(r[k])).join(','));
  return [header, ...lines].join('\n');
}
