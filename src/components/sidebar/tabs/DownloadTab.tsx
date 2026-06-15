import React from 'react';
import { downloadText, downloadBlob, filterFeatureCollectionByRowIds } from '../../../lib/export';
import buildExportMeta from '../../../lib/exportMeta';
import { featureCollectionToKml, featureCollectionToKmz } from '../../../lib/kml';
import { fetchFeatureCountInExtent } from '../../../lib/esriLayer';
import CopyButton from '../../ui/CopyButton';
import { toast } from 'react-toastify';
import { approxPrecisionMetersFromZoomLat } from '../../../lib/mapMath';
import type { ExportProgress } from '../components/Sidebar';

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
  onExportProgress?: (progress: ExportProgress | null) => void;
};

export default function DownloadTab({ rows, datasetName = 'features', featureCollection, whereValue = '1=1', serviceUrl, layerId, geometryType, spatialWkid, zoom = 0, bbox = '', center = '', layerTotal, renderer, onExportProgress }: Props) {
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
  // Advanced options (filenames, field filtering)
  const defaultGeomName = React.useMemo(() => buildExportFileName(datasetName, 'on-screen', zoom, featureCount), [datasetName, zoom, featureCount]);
  const defaultAttrName = React.useMemo(() => buildExportFileName(datasetName, 'attributes', zoom, rowCount), [datasetName, zoom, rowCount]);
  const [geomName, setGeomName] = React.useState<string>(defaultGeomName);
  const [attrName, setAttrName] = React.useState<string>(defaultAttrName);
  const [geomNameDirty, setGeomNameDirty] = React.useState<boolean>(false);
  const [attrNameDirty, setAttrNameDirty] = React.useState<boolean>(false);
  const [includeSelectedInGeom, setIncludeSelectedInGeom] = React.useState<boolean>(false);
  React.useEffect(() => { if (!geomNameDirty) setGeomName(defaultGeomName); }, [defaultGeomName, geomNameDirty]);
  React.useEffect(() => { if (!attrNameDirty) setAttrName(defaultAttrName); }, [defaultAttrName, attrNameDirty]);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingCount(true);
      try {
        const layerUrl = resolveLayerUrl(serviceUrl, layerId);
        if (isPoint && layerUrl && bbox) {
          const n = await fetchFeatureCountInExtent(layerUrl, bbox, whereValue, { signal: controller.signal });
          if (!cancelled) setTotalInView(n);
        } else {
          if (!cancelled) setTotalInView(null);
        }
      } catch { if (!cancelled) setTotalInView(null); }
      finally { if (!cancelled) setLoadingCount(false); }
    }, 200); // debounce
    return () => { cancelled = true; try { controller.abort(); } catch {}; window.clearTimeout(timer); };
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
  const [isExporting, setIsExporting] = React.useState<boolean>(false);
  const exportSeqRef = React.useRef<number>(0);

  const yieldToMain = React.useCallback(() => new Promise<void>((resolve) => setTimeout(resolve, 0)), []);

  async function downloadGeometry() {
    if (!hasGeom || isExporting) return;
    setIsExporting(true);
    const seq = ++exportSeqRef.current;
    const report = (processed: number, total: number) => {
      if (exportSeqRef.current !== seq) return;
      onExportProgress?.({ processed, total, unit: 'features' });
    };
    try {
      const fc = featureCollection && featureCollection.type === 'FeatureCollection' ? featureCollection : { type: 'FeatureCollection', features: [] };
      const feats = Array.isArray(fc.features) ? fc.features : [];
      const ids = new Set((rows || []).map((r: any) => r?.__id).filter((v: any) => v != null));
      const total = feats.length;
      if (onExportProgress && total > 0) report(0, total);
      const outFeats: any[] = [];
      const chunkSize = 500;
      const keep = includeSelectedInGeom && selectedFields.length > 0 ? new Set(activeFields) : null;
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        const id = f?.properties?.__id;
        if (!ids.size || ids.has(id)) {
          if (keep) {
            const props = (f && f.properties) || {};
            const nextProps: any = {};
            keep.forEach((k) => { nextProps[k] = props[k]; });
            outFeats.push({ ...(f || {}), properties: nextProps });
          } else {
            outFeats.push(f);
          }
        }
        if (onExportProgress && (i % chunkSize === 0 || i === feats.length - 1)) {
          report(i + 1, total);
          if (i !== feats.length - 1) await yieldToMain();
        }
      }
      const out = { type: 'FeatureCollection', features: outFeats };
      const meta = buildExportMeta({
        exportType: 'on-screen', geometryType, zoom, bbox, where: whereValue, rendered: featureCount, totalInView: totalInView ?? undefined, tolerance: tolerance.range || undefined, serviceUrl, layerId, crs: spatialWkid,
      });
      const name = geomName || defaultGeomName;
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
    } finally {
      if (exportSeqRef.current === seq) onExportProgress?.(null);
      setIsExporting(false);
    }
  }

  // Precompute GeoJSON text for clipboard when selected and available
  const geojsonCopyText = React.useMemo(() => {
    try {
      if (!hasGeom || featureCount === 0 || geomFormat !== 'geojson') return '';
      const out = filterFeatureCollectionByRowIds(featureCollection, rows || []);
      if (includeSelectedInGeom && selectedFields.length > 0) {
        const keep = new Set(activeFields);
        const feats = Array.isArray((out as any)?.features) ? (out as any).features : [];
        for (const f of feats) {
          const props = (f && f.properties) || {};
          const next: any = {};
          keep.forEach(k => { next[k] = props[k]; });
          f.properties = next;
        }
      }
      const meta = buildExportMeta({
        exportType: 'on-screen', geometryType, zoom, bbox, where: whereValue, rendered: featureCount, totalInView: totalInView ?? undefined, tolerance: tolerance.range || undefined, serviceUrl, layerId, crs: spatialWkid,
      });
      try { (out as any)._export_meta = meta; } catch {}
      return JSON.stringify(out);
    } catch { return ''; }
  }, [hasGeom, featureCount, geomFormat, featureCollection, rows, geometryType, zoom, bbox, whereValue, totalInView, tolerance.range, serviceUrl, layerId, spatialWkid, includeSelectedInGeom, activeFields, selectedFields.length]);

  const geojsonIoUrl = React.useMemo(() => {
    try {
      if (!geojsonCopyText) return '';
      return `https://geojson.io/#data=data:application/json,${encodeURIComponent(geojsonCopyText)}`;
    } catch { return ''; }
  }, [geojsonCopyText]);

  // Disable geojson.io link if the URL becomes excessively long
  const GEOJSON_IO_MAX_URL = 1048576; // lets limit it to 1mb
  const geojsonIoTooLong = React.useMemo(() => {
    try { return (geojsonIoUrl || '').length > GEOJSON_IO_MAX_URL; } catch { return true; }
  }, [geojsonIoUrl]);

  // (External viewers removed; keep only geojson.io support)

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
  async function downloadAttributes() {
    if (isExporting) return;
    setIsExporting(true);
    const seq = ++exportSeqRef.current;
    const report = (processed: number, total: number) => {
      if (exportSeqRef.current !== seq) return;
      onExportProgress?.({ processed, total, unit: 'rows' });
    };
    try {
      const meta = buildExportMeta({
        exportType: 'attributes', geometryType, zoom, bbox, where: whereValue, rendered: rowCount, totalInView: totalInView ?? undefined, tolerance: tolerance.range || undefined, serviceUrl, layerId, crs: spatialWkid,
      });
      const name = attrName || defaultAttrName;
      const rowsIn = Array.isArray(attrRows) ? attrRows : [];
      const total = rowsIn.length;
      if (onExportProgress && total > 0) report(0, total);
      const rowsOut: any[] = new Array(total);
      const chunkSize = 500;
      for (let i = 0; i < total; i++) {
        const r = rowsIn[i];
        if (!activeFields.length) {
          rowsOut[i] = r;
        } else {
          const out: any = {};
          activeFields.forEach(k => { out[k] = r[k]; });
          rowsOut[i] = out;
        }
        if (onExportProgress && (i % chunkSize === 0 || i === total - 1)) {
          report(i + 1, total);
          if (i !== total - 1) await yieldToMain();
        }
      }
      if (attrFormat === 'json') {
        const payload = { _export_meta: meta, rows: rowsOut };
        downloadText(`${name}.json`, 'application/json', JSON.stringify(payload));
      } else {
        const csv = toCSV(rowsOut || []);
        downloadText(`${name}.csv`, 'text/csv', csv);
        downloadText(`${name}.meta.json`, 'application/json', JSON.stringify(meta));
      }
      const color = attrReadiness.color;
      const exportTotal = (isPoint && totalInView != null) ? totalInView : layerTotal;
      showExportToast(color, rowCount, exportTotal);
    } finally {
      if (exportSeqRef.current === seq) onExportProgress?.(null);
      setIsExporting(false);
    }
  }

  // Micro copy chips content
  const attributesCsvText = React.useMemo(() => {
    try {
      const rowsOut = (attrRows || []).map((r: any) => {
        if (!activeFields.length) return r;
        const out: any = {};
        activeFields.forEach(k => { out[k] = r[k]; });
        return out;
      });
      return toCSV(rowsOut || []);
    } catch { return ''; }
  }, [attrRows, activeFields]);
  const attributesJsonQuick = React.useMemo(() => {
    try {
      const rowsOut = (attrRows || []).map((r: any) => {
        if (!activeFields.length) return r;
        const out: any = {};
        activeFields.forEach(k => { out[k] = r[k]; });
        return out;
      });
      const payload = { rows: rowsOut };
      return JSON.stringify(payload);
    } catch { return ''; }
  }, [attrRows, activeFields]);

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
      {/* Geometry + Attributes card */}
      <section className="export-card">
        <header className="export-card-head">
          <div className="export-card-title">On-screen features</div>
          <ReadinessBadge color={readiness.color} label={readiness.label} />
        </header>
        <div className="export-card-row">
          <label className="u-muted" htmlFor="geom-format">Format</label>
          <select id="geom-format" value={geomFormat} onChange={(e) => setGeomFormat((e.target.value as any) || 'geojson')} className="u-input" style={{ width: 'auto' }}>
            <option value="geojson">GeoJSON</option>
            <option value="kml">KML</option>
            <option value="kmz">KMZ</option>
          </select>
        </div>
        <div className="export-card-row">
          <span className="u-muted">Count</span>
          <strong aria-live="polite">{hasGeom ? fmtCount(featureCount, totalForGeo) : '—'}</strong>
        </div>
        <div className="export-card-note">
          <span className="u-note">Geometry is simplified for display purposes, use <a href="https://geodatadownloader.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>geodatadownloader.com</a> for full precision.</span>
          {readiness.color === 'red' && storedRange ? (
            <span className="u-note">Stored precision range: ~{storedRange.min}–~{storedRange.max} m</span>
          ) : null}
          {statusDetailGeo ? (<span className="u-note">{statusDetailGeo}</span>) : null}
        </div>
        <div className="export-card-actions">
          <button onClick={() => { void downloadGeometry(); }} disabled={!hasGeom || featureCount === 0 || isExporting} title={!hasGeom || featureCount === 0 ? 'No features in view.' : undefined} className="u-btn" style={{ width: '100%' }}>⬇️ Download</button>
          {geomFormat === 'geojson' && hasGeom && featureCount > 0 ? (
            <div className="u-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' as any }}>
              <span className="u-row" title="Copy GeoJSON to clipboard">
                <CopyButton text={geojsonCopyText} />
                <span className="u-muted u-small">Copy GeoJSON</span>
              </span>
              <span className="u-row" style={{ gap: 10 }}>
                <span className="u-muted u-small">Open in:</span>
                {geojsonIoTooLong ? (
                  <span title="URL too long for geojson.io" className="u-row u-muted" style={{ textDecoration: 'none', cursor: 'not-allowed' }}>
                    <span>geojson.io</span>
                    <span aria-hidden="true" className="u-small">⚠</span>
                  </span>
                ) : (
                  <a href={geojsonIoUrl || '#'} target="_blank" rel="noreferrer" title="Open at geojson.io" style={{ color: 'var(--accent)', textDecoration: 'none' }}>geojson.io ↗</a>
                )}
              </span>
            </div>
          ) : null}
          {featureCount > 10000 ? (<div className="u-note" style={{ marginTop: 4 }}>Large export; may be slow to download.</div>) : null}

          </div>
      </section>

      {/* Attributes only card */}
      <section className="export-card">
        <header className="export-card-head">
          <div className="export-card-title">Attributes only</div>
          <ReadinessBadge color={attrReadiness.color} label={attrReadiness.label} />
        </header>
        <div className="export-card-row">
          <label className="u-muted" htmlFor="attr-format">Format</label>
          <select id="attr-format" value={attrFormat} onChange={(e) => setAttrFormat((e.target.value as any) || 'csv')} className="u-input" style={{ width: 'auto' }}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </div>
        <div className="export-card-row">
          <span className="u-muted">Count</span>
          <strong aria-live="polite">{fmtCount(rowCount, typeof layerTotal === 'number' ? layerTotal : null)}</strong>
        </div>
        <div className="export-card-note">
          {statusDetailAttr ? (<span className="u-note">{statusDetailAttr}</span>) : null}
        </div>
        <div className="export-card-actions">
          <button onClick={() => { void downloadAttributes(); }} disabled={!rowCount || isExporting} title={!rowCount ? 'No attributes in view.' : undefined} className="u-btn" style={{ width: '100%' }}>⬇️ Download</button>
          {rowCount > 0 ? (
            <span className="u-row" title={`Copy ${attrFormat.toUpperCase()} to clipboard`}>
              <CopyButton text={attributesCopyText} />
              <span className="u-muted u-small">Copy {attrFormat.toUpperCase()}</span>
            </span>
          ) : null}
        </div>
      </section>

      {/* Developer tools — collapsed by default */}
      <details style={{ fontSize: 12 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)', userSelect: 'none', padding: '4px 0' }}>Developer tools</summary>
        <div className="u-row" style={{ flexWrap: 'wrap' as any, marginTop: 8, gap: 8 }}>
          <span className="u-muted">Copy:</span>
          <span className="u-row" style={{ gap: 4 }}><CopyButton text={bbox || ''} /><span className="u-muted">BBox</span></span>
          <span className="u-row" style={{ gap: 4 }}><CopyButton text={center || ''} /><span className="u-muted">Center</span></span>
          <span className="u-row" style={{ gap: 4 }}><CopyButton text={queryUrlQuick || ''} /><span className="u-muted">Query URL</span></span>
        </div>
      </details>
    </div>
  );
}

function ReadinessBadge({ color, label }: { color: 'red' | 'yellow' | 'green' | 'gray' | string; label: string }) {
  const dotColor = color === 'red' ? '#e05252' : color === 'yellow' ? '#d4a017' : color === 'green' ? '#4caf50' : 'var(--muted)';
  return (
    <span aria-label={`Readiness: ${label}`} title={`Readiness: ${label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</span>
    </span>
  );
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
