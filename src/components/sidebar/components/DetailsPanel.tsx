import React from 'react';
import type { MapServiceInfo, MapServiceLayerInfo, Extent } from '../../../lib/types/arcgis-rest';
import { fetchLayerExtent4326 } from '../../../lib/esriLayer';
import { extentToBounds } from '../../../lib/geometry';
import { HtmlValue, LabelValue } from './Sidebar';
import DataReportTable from './DataReportTable';
import ExtentMiniMap from '../../ui/ExtentMiniMap';
import TimeBadge from '../../ui/TimeBadge';
import { computeLastEditDateString, timeExtentToBadge } from '../../../lib/arcgis-meta';

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
};

export default function DetailsPanel({ serviceMeta, layerMeta, loading, isDynamic, onZoomToExtent, featureCount, serviceUrl, whereValue = '1=1', bbox = '', center = '', zoom = 0, fallbackReason, onClearWhere }: Props) {
  if (loading) return <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>Loading metadata…</div>;

  if (layerMeta && typeof layerMeta.id === 'number') {
    return (
      <LayerDetailsSection
        layerMeta={layerMeta}
        serviceMeta={serviceMeta}
        onZoomToExtent={onZoomToExtent}
        featureCount={featureCount}
        serviceUrl={serviceUrl}
        whereValue={whereValue}
        bbox={bbox}
        center={center}
        zoom={zoom}
        isDynamic={isDynamic}
        fallbackReason={fallbackReason}
        onClearWhere={onClearWhere}
      />
    );
  }

  if (serviceMeta) {
    return (
      <ServiceDetailsSection
        serviceMeta={serviceMeta}
        onZoomToExtent={onZoomToExtent}
        serviceUrl={serviceUrl}
        whereValue={whereValue}
        bbox={bbox}
        center={center}
        zoom={zoom}
      />
    );
  }

  return null;
}

function LayerDetailsSection({ layerMeta, serviceMeta, onZoomToExtent, featureCount, serviceUrl, whereValue, bbox, center, zoom, isDynamic, fallbackReason, onClearWhere }: { layerMeta: MapServiceLayerInfo; serviceMeta: MapServiceInfo | null; onZoomToExtent?: (ext: Extent) => void; featureCount?: number | null; serviceUrl?: string; whereValue?: string; bbox?: string; center?: string; zoom?: number; isDynamic?: boolean; fallbackReason?: string; onClearWhere?: () => void }) {
  const fieldCount = Array.isArray(layerMeta.fields) ? layerMeta.fields.length : 0;
  const extent = (layerMeta as any)?.extent as Extent | undefined;
  const timeInfo = (layerMeta as any)?.timeInfo || (serviceMeta as any)?.timeInfo;
  const timeBadge = timeExtentToBadge(timeInfo);
  const [lastEdited, setLastEdited] = React.useState<string>('');
  const [extentOpen, setExtentOpen] = React.useState<boolean>(true);
  const layerUrl = React.useMemo(() => computeLayerUrl(serviceUrl, layerMeta?.id), [serviceUrl, layerMeta]);
  const [displayExtent, setDisplayExtent] = React.useState<Extent | undefined>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    computeLastEditDateString(layerMeta, serviceUrl).then((s) => { if (!cancelled) setLastEdited(s || ''); }).catch(() => {});
    return () => { cancelled = true; };
  }, [layerMeta, serviceUrl]);

  // Ensure the mini extent map can render by fetching a 4326 extent when needed
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (extent && extentToBounds(extent as any)) { setDisplayExtent(extent); return; }
        // Fallback to server-projected layer extent (4326)
        const url = layerUrl || '';
        if (!url) { setDisplayExtent(undefined); return; }
        const e = await fetchLayerExtent4326(url);
        if (!cancelled) setDisplayExtent(e || undefined);
      } catch {
        if (!cancelled) setDisplayExtent(undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [extent, layerUrl]);

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
      {typeof (layerMeta as any)?.minScale === 'number' || typeof (layerMeta as any)?.maxScale === 'number' ? (
        <LabelValue label="Scale Range">{formatScaleRange((layerMeta as any)?.minScale, (layerMeta as any)?.maxScale)}</LabelValue>
      ) : null}
      {((layerMeta as any)?.drawingInfo?.renderer?.type) ? (
        <LabelValue label="Renderer">{String((layerMeta as any).drawingInfo.renderer.type)}</LabelValue>
      ) : null}
      <LabelValue label="Description"><HtmlValue html={layerMeta.description || ''} /></LabelValue>
      <LabelValue label="Records">{typeof featureCount === 'number' ? featureCount.toLocaleString() : '—'}</LabelValue>
      <LabelValue label="Fields">{fieldCount}</LabelValue>
      {layerUrl ? (
        <LabelValue label="Layer Viewer"><a href={`${layerUrl}?f=html`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{layerUrl}</a></LabelValue>
      ) : null}
      {/* Query links removed */}
      {lastEdited ? <LabelValue label="Last Edited">{lastEdited}</LabelValue> : null}
      {fieldCount ? <FieldsTable fields={layerMeta.fields || []} /> : null}
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

function ServiceDetailsSection({ serviceMeta, onZoomToExtent, serviceUrl, whereValue, bbox, center, zoom }: { serviceMeta: MapServiceInfo; onZoomToExtent?: (ext: Extent) => void; serviceUrl?: string; whereValue?: string; bbox?: string; center?: string; zoom?: number }) {
  const title = serviceMeta?.documentInfo?.Title || serviceMeta.mapName || 'Service';
  const desc = serviceMeta?.serviceDescription || serviceMeta?.description || '';
  const layerCount = Array.isArray(serviceMeta.layers) ? serviceMeta.layers.length : 0;
  const tableCount = Array.isArray(serviceMeta.tables) ? serviceMeta.tables.length : 0;
  const extent = (serviceMeta as any)?.fullExtent || (serviceMeta as any)?.initialExtent;
  const timeBadge = timeExtentToBadge((serviceMeta as any)?.timeInfo);
  const [extentOpen, setExtentOpen] = React.useState<boolean>(true);
  const [displayExtent, setDisplayExtent] = React.useState<Extent | undefined>(undefined);

  // Try to render the service extent; if SR is unsupported, fall back to one layer's 4326 extent
  React.useEffect(() => {
    let cancelled = false;
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
        const e = await fetchLayerExtent4326(lyrUrl);
        if (!cancelled) setDisplayExtent(e || undefined);
      } catch {
        if (!cancelled) setDisplayExtent(undefined);
      }
    })();
    return () => { cancelled = true; };
  }, [extent, serviceMeta, serviceUrl]);

  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
      {displayExtent ? (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <button onClick={() => setExtentOpen(o => !o)} style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', cursor: 'pointer' }}>
              {extentOpen ? 'Hide Extent Map' : 'Show Extent Map'}
            </button>
            {onZoomToExtent ? (
              <button onClick={() => { const e: any = displayExtent as any; const clone = { ...e, spatialReference: e?.spatialReference ? { ...e.spatialReference } : undefined } as any; onZoomToExtent(clone); }} style={{ padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--text)', cursor: 'pointer' }}>Zoom to Service Extent</button>
            ) : null}
          </div>
          {extentOpen ? <ExtentMiniMap extent={displayExtent as any} /> : null}
        </div>
      ) : null}

      <LabelValue label="Title">{title}</LabelValue>
      <LabelValue label="Layers">{layerCount}</LabelValue>
      <LabelValue label="Tables">{tableCount}</LabelValue>
      {desc ? <LabelValue label="Description"><HtmlValue html={desc} /></LabelValue> : null}
      {timeBadge ? (
        <div>
          <TimeBadge text={timeBadge} />
        </div>
      ) : null}
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
      {serviceUrl ? (
        <LabelValue label="Endpoint"><a href={serviceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{serviceUrl}</a></LabelValue>
      ) : null}
      {/* Query links removed */}
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
