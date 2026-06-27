import React from 'react';
import type { MapServiceInfo, MapServiceLayerInfo, Extent } from '../../../lib/types/arcgis-rest';
import { fetchLayerExtent4326 } from '../../../lib/esriLayer';
import { extentToBounds, boundsToExtent4326 } from '../../../lib/geometry';
import { HtmlValue, LabelValue } from './Sidebar';
import DataReportTable from './DataReportTable';
import ExtentMiniMap from '../../ui/ExtentMiniMap';
import TimeBadge from '../../ui/TimeBadge';
import { computeLastEditDateString, timeExtentToBadge } from '../../../lib/arcgis-meta';
import { getLayerDescription, getServiceDescription, htmlToPlainText, summarizePlainText, type MetadataDescription } from '../../../lib/arcgisDescription';
import { describeArcgisRenderer } from '../../../lib/arcgisRenderer';

type Props = {
  serviceMeta: MapServiceInfo | null;
  layerMeta: MapServiceLayerInfo | null;
  loading: boolean;
  isDynamic: boolean;
  onZoomToExtent?: (ext: Extent) => void;
  featureCount?: number | null;
  serviceUrl?: string;
  whereValue?: string;
  bbox?: string;
  center?: string;
  zoom?: number;
  fallbackReason?: string;
  onClearWhere?: () => void;
  downloadedExtent?: Extent | null;
};

export default function DetailsPanel({ serviceMeta, layerMeta, loading, isDynamic, onZoomToExtent, featureCount, serviceUrl, whereValue = '1=1', fallbackReason, onClearWhere, downloadedExtent = null }: Props) {
  if (loading) return <div className="u-muted u-small" style={{ marginTop: 8 }}>Loading metadata…</div>;

  if (layerMeta && typeof layerMeta.id === 'number') {
    return (
      <LayerDetailsSection
        layerMeta={layerMeta}
        serviceMeta={serviceMeta}
        onZoomToExtent={onZoomToExtent}
        featureCount={featureCount}
        serviceUrl={serviceUrl}
        whereValue={whereValue}
        isDynamic={isDynamic}
        fallbackReason={fallbackReason}
        onClearWhere={onClearWhere}
        downloadedExtent={downloadedExtent}
      />
    );
  }

  if (serviceMeta) {
    return (
      <ServiceDetailsSection
        serviceMeta={serviceMeta}
        onZoomToExtent={onZoomToExtent}
        serviceUrl={serviceUrl}
      />
    );
  }

  return null;
}

function LayerDetailsSection({ layerMeta, serviceMeta, onZoomToExtent, featureCount, serviceUrl, whereValue, isDynamic, fallbackReason, onClearWhere, downloadedExtent }: { layerMeta: MapServiceLayerInfo; serviceMeta: MapServiceInfo | null; onZoomToExtent?: (ext: Extent) => void; featureCount?: number | null; serviceUrl?: string; whereValue?: string; isDynamic?: boolean; fallbackReason?: string; onClearWhere?: () => void; downloadedExtent?: Extent | null }) {
  const fieldCount = Array.isArray(layerMeta.fields) ? layerMeta.fields.length : 0;
  const extent = (layerMeta as any)?.extent as Extent | undefined;
  const timeInfo = (layerMeta as any)?.timeInfo || (serviceMeta as any)?.timeInfo;
  const timeBadge = timeExtentToBadge(timeInfo);
  const [lastEdited, setLastEdited] = React.useState<string>('');
  const [extentOpen, setExtentOpen] = React.useState<boolean>(true);
  const layerUrl = React.useMemo(() => computeLayerUrl(serviceUrl, layerMeta?.id), [serviceUrl, layerMeta]);
  const [displayExtent, setDisplayExtent] = React.useState<Extent | undefined>(undefined);
  const [downloaded, setDownloaded] = React.useState<Extent | null>(null);
  const description = React.useMemo(() => getLayerDescription(layerMeta, serviceMeta), [layerMeta, serviceMeta]);
  const rendererDescription = React.useMemo(() => describeArcgisRenderer((layerMeta as any)?.drawingInfo?.renderer), [layerMeta]);

  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      computeLastEditDateString(layerMeta, serviceUrl, { signal: controller.signal })
        .then((s) => { if (!cancelled) setLastEdited(s || ''); })
        .catch(() => {});
    }, 200);
    return () => { cancelled = true; try { controller.abort(); } catch {}; window.clearTimeout(timer); };
  }, [layerMeta, serviceUrl]);

  // Ensure the mini extent map can render by fetching a 4326 extent when needed
  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          if (extent && extentToBounds(extent as any)) { setDisplayExtent(extent); return; }
          // Fallback to server-projected layer extent (4326)
          const url = layerUrl || '';
          if (!url) { setDisplayExtent(undefined); return; }
          const e = await fetchLayerExtent4326(url, '1=1', { signal: controller.signal });
          if (!cancelled) setDisplayExtent(e || undefined);
        } catch {
          if (!cancelled) setDisplayExtent(undefined);
        }
      })();
    }, 200);
    return () => { cancelled = true; try { controller.abort(); } catch {}; window.clearTimeout(timer); };
  }, [extent, layerUrl]);

  React.useEffect(() => {
    try { setDownloaded(downloadedExtent || null); } catch { setDownloaded(null); }
  }, [downloadedExtent]);

  const layerExtent4326 = React.useMemo(() => {
    try {
      const b = extentToBounds(displayExtent as any);
      return b ? boundsToExtent4326(b as any) : null;
    } catch { return null; }
  }, [displayExtent]);

  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
      {isDynamic ? (
        <div style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel-subtle)', color: 'var(--text)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <strong>Rendered as Dynamic</strong>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Fallback to dynamic map rendering. {fallbackReason ? `Reason: ${fallbackReason}. ` : ''}
                {whereValue && whereValue.trim() !== '1=1' ? 'Try resetting your WHERE clause to restore full functionality. ' : ''}
                Query, Data, Download, and Style are disabled.
              </div>
            </div>
            {whereValue && whereValue.trim() !== '1=1' && onClearWhere ? (
              <button
                onClick={onClearWhere}
                title="Clear WHERE clause to restore full functionality"
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                Clear WHERE
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {displayExtent ? (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <button onClick={() => setExtentOpen(o => !o)} style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', cursor: 'pointer' }}>
              {extentOpen ? 'Hide Extent Map' : 'Show Extent Map'}
            </button>
      {onZoomToExtent ? (
        <ZoomToExtentButton extent={displayExtent} onZoomToExtent={onZoomToExtent} serviceUrl={serviceUrl} layerId={layerMeta?.id} />
      ) : null}
          </div>
          {extentOpen ? <ExtentMiniMap extent={displayExtent} /> : null}
        </div>
      ) : null}

      {timeBadge ? (
        <div style={{ marginTop: 2 }}>
          <TimeBadge text={timeBadge} />
        </div>
      ) : null}
      {description ? (
        <MetadataDescriptionPanel
          description={description}
          title={description.source === 'layer' ? 'About this layer' : 'About this service'}
        />
      ) : null}
      {/* Extents (text) */}
      {layerExtent4326 ? (
        <LabelValue label="Layer Extent">
          {formatExtent(layerExtent4326 as any)}
        </LabelValue>
      ) : null}
      {downloaded ? (
        <LabelValue label="Downloaded Extent">
          <span>{formatExtent(downloaded)}</span>
          {onZoomToExtent ? (
            <button onClick={() => onZoomToExtent(downloaded as any)} style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', cursor: 'pointer', fontSize: 11 }}>Zoom</button>
          ) : null}
        </LabelValue>
      ) : null}
      <LabelValue label="Name">{layerMeta.name || '—'}</LabelValue>
      {typeof layerMeta.id === 'number' ? (
        <LabelValue label="Layer ID">{layerMeta.id}</LabelValue>
      ) : null}
      {serviceMeta?.mapName || serviceMeta?.documentInfo?.Title ? (
        <LabelValue label="Parent Service">
          {serviceMeta?.documentInfo?.Title || serviceMeta?.mapName || '—'}
        </LabelValue>
      ) : null}
      <LabelValue label="Type">{layerMeta.type || '—'}</LabelValue>
      <LabelValue label="Geometry">{layerMeta.geometryType || '—'}</LabelValue>
      {layerMeta.displayField ? <LabelValue label="Display Field">{layerMeta.displayField}</LabelValue> : null}
      {layerMeta.description && htmlToPlainText(layerMeta.description) !== description?.text ? (
        <LabelValue label="Description"><HtmlValue html={layerMeta.description || ''} /></LabelValue>
      ) : null}
      <LabelValue label="Records">{typeof featureCount === 'number' ? featureCount.toLocaleString() : '—'}</LabelValue>
      <LabelValue label="Fields">{fieldCount}</LabelValue>
      {layerUrl ? (
        <LabelValue label="Layer Viewer"><a href={`${layerUrl}?f=html`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{layerUrl}</a></LabelValue>
      ) : null}
      {lastEdited ? <LabelValue label="Last Edited">{lastEdited}</LabelValue> : null}
      {fieldCount ? <FieldsTable fields={layerMeta.fields || []} /> : null}
      <details style={{ marginTop: 4 }}>
        <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10 }}>▶</span> Advanced
        </summary>
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          {typeof (layerMeta as any)?.minScale === 'number' || typeof (layerMeta as any)?.maxScale === 'number' ? (
            <LabelValue label="Scale Range">{formatScaleRange((layerMeta as any)?.minScale, (layerMeta as any)?.maxScale)}</LabelValue>
          ) : null}
          {rendererDescription ? (
            <LabelValue label="Renderer">{rendererDescription}</LabelValue>
          ) : null}
          {typeof (layerMeta as any)?.maxRecordCount === 'number' ? (
            <LabelValue label="Max Records">{(layerMeta as any).maxRecordCount}</LabelValue>
          ) : null}
          {(layerMeta as any)?.capabilities ? (
            <LabelValue label="Capabilities">{String((layerMeta as any).capabilities)}</LabelValue>
          ) : null}
          {(layerMeta as any)?.spatialReference?.wkid || (layerMeta as any)?.spatialReference?.latestWkid ? (
            <LabelValue label="Spatial Ref">{String((layerMeta as any)?.spatialReference?.latestWkid || (layerMeta as any)?.spatialReference?.wkid)}</LabelValue>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function ZoomToExtentButton({ extent, onZoomToExtent, serviceUrl, layerId }: { extent?: Extent | null; onZoomToExtent: (e: Extent) => void; serviceUrl?: string; layerId?: number }) {
  const [busy, setBusy] = React.useState(false);
  const canFetch = React.useMemo(() => {
    try {
      const s = String(serviceUrl || '');
      if (/\/(MapServer|FeatureServer)\/\d+$/i.test(s)) return true;
      if (/\/(MapServer|FeatureServer)$/i.test(s) && typeof layerId === 'number') return true;
      return false;
    } catch { return false; }
  }, [serviceUrl, layerId]);
  const disabled = busy || (!extent && !canFetch);
  return (
    <button
      disabled={disabled}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          // Use provided extent if it converts to bounds; else fall back to server 4326 extent
          if (extent) {
            const canUse = !!extentToBounds(extent as any);
            if (canUse) { const clone: any = { ...(extent as any), spatialReference: (extent as any)?.spatialReference ? { ...(extent as any).spatialReference } : undefined }; onZoomToExtent(clone as any); return; }
          }
          const s = String(serviceUrl || '');
          const url = /\/(MapServer|FeatureServer)\/\d+$/i.test(s)
            ? s
            : (/\/(MapServer|FeatureServer)$/i.test(s) && typeof layerId === 'number' ? `${s.replace(/\/+$/, '')}/${layerId}` : '');
          if (url) {
            const ext = await fetchLayerExtent4326(url);
            if (ext) { onZoomToExtent({ ...ext, spatialReference: ext.spatialReference ? { ...ext.spatialReference } : undefined } as any); return; }
          }
        } catch { } finally { setBusy(false); }
        setBusy(false);
      }}
      style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}
    >
      {busy ? 'Zooming…' : 'Zoom to Layer Extent'}
    </button>
  );
}

function ServiceDetailsSection({ serviceMeta, onZoomToExtent, serviceUrl }: { serviceMeta: MapServiceInfo; onZoomToExtent?: (ext: Extent) => void; serviceUrl?: string }) {
  const title = serviceMeta?.documentInfo?.Title || serviceMeta.mapName || 'Service';
  const desc = serviceMeta?.serviceDescription || serviceMeta?.description || '';
  const description = React.useMemo(() => getServiceDescription(serviceMeta), [serviceMeta]);
  const layerCount = Array.isArray(serviceMeta.layers) ? serviceMeta.layers.length : 0;
  const tableCount = Array.isArray(serviceMeta.tables) ? serviceMeta.tables.length : 0;
  const extent = (serviceMeta as any)?.fullExtent || (serviceMeta as any)?.initialExtent;
  const timeBadge = timeExtentToBadge((serviceMeta as any)?.timeInfo);
  const [extentOpen, setExtentOpen] = React.useState<boolean>(true);
  const [displayExtent, setDisplayExtent] = React.useState<Extent | undefined>(undefined);

  // Try to render the service extent; if SR is unsupported, fall back to one layer's 4326 extent
  React.useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          if (extent && extentToBounds(extent as any)) { setDisplayExtent(extent as any); return; }
          const layers = Array.isArray(serviceMeta?.layers) ? serviceMeta.layers : [];
          if (!layers.length) { setDisplayExtent(undefined); return; }
          const ids = layers.map((l: any) => Number(l?.id)).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
          if (!ids.length) { setDisplayExtent(undefined); return; }
          const root = (() => {
            try {
              const s = String(serviceUrl || '');
              if (/\/(MapServer|FeatureServer)$/i.test(s)) return s.replace(/\/+$/, '');
              const m = s.match(/^(.*\/(MapServer|FeatureServer))\/(?:\d+)(?:\/.*)?$/i);
              return (m && m[1]) ? m[1] : '';
            } catch { return ''; }
          })();
          if (!root) { setDisplayExtent(undefined); return; }
          const lyrUrl = `${root}/${ids[0]}`;
          const e = await fetchLayerExtent4326(lyrUrl, '1=1', { signal: controller.signal });
          if (!cancelled) setDisplayExtent(e || undefined);
        } catch {
          if (!cancelled) setDisplayExtent(undefined);
        }
      })();
    }, 200);
    return () => { cancelled = true; try { controller.abort(); } catch {}; window.clearTimeout(timer); };
  }, [extent, serviceMeta, serviceUrl]);

  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
      {displayExtent ? (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <button onClick={() => setExtentOpen(o => !o)} className="u-btn">
              {extentOpen ? 'Hide Extent Map' : 'Show Extent Map'}
            </button>
            {onZoomToExtent ? (
              <button onClick={() => { const e: any = displayExtent as any; const clone = { ...e, spatialReference: e?.spatialReference ? { ...e.spatialReference } : undefined } as any; onZoomToExtent(clone); }} className="u-btn">Zoom to Service Extent</button>
            ) : null}
          </div>
          {extentOpen ? <ExtentMiniMap extent={displayExtent as any} /> : null}
        </div>
      ) : null}

      <LabelValue label="Title">{title}</LabelValue>
      {description ? (
        <MetadataDescriptionPanel description={description} title="About this service" />
      ) : null}
      <LabelValue label="Layers">{layerCount}</LabelValue>
      <LabelValue label="Tables">{tableCount}</LabelValue>
      {desc && htmlToPlainText(desc) !== description?.text ? <LabelValue label="Description"><HtmlValue html={desc} /></LabelValue> : null}
      {timeBadge ? (
        <div>
          <TimeBadge text={timeBadge} />
        </div>
      ) : null}
      {serviceUrl ? (
        <LabelValue label="Endpoint"><a href={serviceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{serviceUrl}</a></LabelValue>
      ) : null}
      <details style={{ marginTop: 4 }}>
        <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10 }}>▶</span> Advanced
        </summary>
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          {(serviceMeta as any)?.spatialReference?.wkid || (serviceMeta as any)?.spatialReference?.latestWkid ? (
            <LabelValue label="Spatial Ref">{String((serviceMeta as any)?.spatialReference?.latestWkid || (serviceMeta as any)?.spatialReference?.wkid)}</LabelValue>
          ) : null}
          {serviceMeta?.capabilities ? (
            <LabelValue label="Capabilities">{serviceMeta.capabilities}</LabelValue>
          ) : null}
          {serviceMeta?.supportedQueryFormats ? (
            <LabelValue label="Query Formats">{serviceMeta.supportedQueryFormats}</LabelValue>
          ) : null}
          {typeof serviceMeta?.singleFusedMapCache === 'boolean' ? (
            <LabelValue label="Cached Tiles">{serviceMeta.singleFusedMapCache ? 'Yes' : 'No'}</LabelValue>
          ) : null}
          {(serviceMeta as any)?.documentInfo?.Author ? (
            <LabelValue label="Author">{String((serviceMeta as any)?.documentInfo?.Author)}</LabelValue>
          ) : null}
          {(serviceMeta as any)?.documentInfo?.Category ? (
            <LabelValue label="Category">{String((serviceMeta as any)?.documentInfo?.Category)}</LabelValue>
          ) : null}
          {serviceMeta?.copyrightText ? (
            <LabelValue label="Copyright">{serviceMeta.copyrightText}</LabelValue>
          ) : null}
          {typeof serviceMeta?.maxRecordCount === 'number' ? (
            <LabelValue label="Max Records">{serviceMeta.maxRecordCount}</LabelValue>
          ) : null}
          {typeof serviceMeta?.currentVersion === 'number' ? (
            <LabelValue label="Version">{serviceMeta.currentVersion}</LabelValue>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function MetadataDescriptionPanel({ description, title }: { description: MetadataDescription; title: string }) {
  const summary = summarizePlainText(description.text, 360);
  const hasMore = summary.length < htmlToPlainText(description.text).length;
  return (
    <section
      aria-label={title}
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--panel-subtle)',
        display: 'grid',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{description.source}</span>
      </div>
      <p style={{ margin: 0, color: 'var(--text)', fontSize: 12, lineHeight: 1.5 }}>{summary}</p>
      {hasMore ? (
        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: 12 }}>Show full description</summary>
          <p style={{ margin: '6px 0 0', color: 'var(--text)', fontSize: 12, lineHeight: 1.5 }}>{htmlToPlainText(description.text)}</p>
        </details>
      ) : null}
    </section>
  );
}

function FieldsTable({ fields }: { fields: Array<{ name: string; alias?: string; type: string; length?: number }> }) {
  const rows = React.useMemo(() => {
    return (Array.isArray(fields) ? fields : []).map(f => ({
      alias: f.alias || f.name,
      name: f.name,
      type: f.type,
      length: typeof f.length === 'number' ? f.length : '',
    }));
  }, [fields]);
  if (!rows.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <DataReportTable
        data={rows}
        datasetName={'fields'}
        displayFields={['alias', 'name', 'type', 'length']}
        showHideButton={true}
        fullHeight={false}
        maxHeight={220}
      />
    </div>
  );
}

// helpers moved to src/lib/arcgis-meta.ts
function formatScaleRange(minScale?: number, maxScale?: number): string {
  const min = typeof minScale === 'number' && Number.isFinite(minScale) ? minScale : null;
  const max = typeof maxScale === 'number' && Number.isFinite(maxScale) ? maxScale : null;
  if (min && max) return `${min} — ${max}`;
  if (min) return `≥ ${min}`;
  if (max) return `≤ ${max}`;
  return '—';
}

function computeLayerUrl(serviceUrl?: string, id?: number) {
  if (!serviceUrl) return '';
  const trimmed = serviceUrl.replace(/\/+$/, '');
  if (/\/(\d+)$/.test(trimmed)) return trimmed;
  if (typeof id === 'number' && /(MapServer|FeatureServer)$/i.test(trimmed)) return `${trimmed}/${id}`;
  return trimmed;
}

// buildQueryUrls removed

function formatExtent(e: Extent | { xmin: number; ymin: number; xmax: number; ymax: number } | null | undefined): string {
  try {
    if (!e) return '—';
    const xmin = Number((e as any).xmin), ymin = Number((e as any).ymin), xmax = Number((e as any).xmax), ymax = Number((e as any).ymax);
    if ([xmin, ymin, xmax, ymax].some(v => !Number.isFinite(v))) return '—';
    const fmt = (n: number) => n.toFixed(6);
    return `${fmt(xmin)}, ${fmt(ymin)}, ${fmt(xmax)}, ${fmt(ymax)}`;
  } catch { return '—'; }
}
