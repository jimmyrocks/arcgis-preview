import React, { useState } from 'react';
import { toast } from 'react-toastify';
import type { MapServiceInfo, MapServiceLayerInfo, Extent } from '../../../lib/types/arcgis-rest';
import SelectTab from '../tabs/SelectTab';
import DetailsTab from '../tabs/DetailsTab';
import QueryTab from '../tabs/QueryTab';
import DataTab from '../tabs/DataTab';
import DownloadTab from '../tabs/DownloadTab';
import StyleTab from '../tabs/StyleTab';
import type { GeometryStyleOptions } from '../../../lib/styleOptions';
import { GITHUB_ISSUES_URL, GITHUB_FORK_URL, GITHUB_REPO_URL } from '../../../lib/links';
export { LabelValue, HtmlValue } from './SidebarPrimitives';


export type SidebarProps = {
  serviceUrl: string;
  onSelectServiceUrl: (url: string) => void;
  onZoomToExtent: (extent: { xmin: number; ymin: number; xmax: number; ymax: number } | null) => void;
  serviceMeta?: MapServiceInfo | null;
  layerMeta?: MapServiceLayerInfo | null;
  isGroupLayer?: boolean;
  featureCount?: number | null;
  downloadedExtent?: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
  // Applied WHERE (committed). Used for details/download.
  whereValue?: string;
  // Draft WHERE mirrors the header input (not yet applied). Used by Query tab.
  whereDraftValue?: string;
  onEditWhere?: (where: string) => void;
  onCommitWhere?: () => void;
  onClearWhere?: () => void;
  fallbackReason?: string;
  layerDataRows?: any[]; // future: rows coming from the map, not queried
  featureCollection?: any;
  onRowHover?: (id: string | number | null) => void;
  onRowClick?: (id: string | number | null) => void;
  highlightId?: string | number | null;
  disableQuery?: boolean;
  disableData?: boolean;
  disableDownload?: boolean;
  disableStyle?: boolean;
  zoom?: number;
  bbox?: string;
  center?: string;
  activeTabName?: 'select' | 'details' | 'query' | 'data' | 'download' | 'style';
  onTabChange?: (tab: 'select' | 'details' | 'query' | 'data' | 'download' | 'style') => void;
  styleMode?: 'server' | 'custom';
  styleOptions?: GeometryStyleOptions;
  onStyleModeChange?: (mode: 'server' | 'custom') => void;
  onStyleOptionsChange?: (opts: GeometryStyleOptions) => void;
  isLoadingService?: boolean;
};

export default function Sidebar({ serviceUrl, onSelectServiceUrl, onZoomToExtent, serviceMeta, layerMeta, isGroupLayer = false, featureCount, whereValue, whereDraftValue, onEditWhere, onCommitWhere, onClearWhere, fallbackReason, layerDataRows, featureCollection, downloadedExtent, onRowHover, onRowClick, highlightId, disableQuery = false, disableData = false, disableDownload = false, disableStyle = false, zoom, bbox, center, activeTabName, onTabChange, styleMode = 'server', styleOptions = {}, onStyleModeChange, onStyleOptionsChange, isLoadingService = false }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'select' | 'details' | 'query' | 'data' | 'download' | 'style'>(activeTabName || 'select');
  React.useEffect(() => {
    if (!activeTabName) return;
    setActiveTab(activeTabName);
  }, [activeTabName]);
  const columnAliases = React.useMemo(() => {
    const map: Record<string, string> = {};
    const fields = layerMeta?.fields || [];
    fields.forEach((f: any) => { if (f?.name && f?.alias && f.alias !== f.name) map[f.name] = f.alias; });
    return map;
  }, [layerMeta]);

  // Build in-memory value samples per field from the currently rendered featureCollection or table rows
  const valueSamples = React.useMemo(() => {
    const out: Record<string, unknown[]> = {};
    const limitPerField = 200;
    const pushVal = (k: string, v: unknown) => {
      if (v == null) return;
      const arr = (out[k] ||= []);
      if (arr.length >= limitPerField) return;
      // avoid duplicates cheaply
      if (!arr.some((x) => String(x) === String(v))) arr.push(v);
    };
    try {
      const rows: any[] = Array.isArray(layerDataRows) && layerDataRows.length > 0
        ? layerDataRows
        : (Array.isArray((featureCollection as any)?.features)
            ? (featureCollection as any).features.map((f: any) => (f && f.properties) || {})
            : []);
      for (const row of rows) {
        for (const k of Object.keys(row || {})) {
          pushVal(k, (row as any)[k]);
        }
      }
    } catch { }
    return out;
  }, [layerDataRows, featureCollection]);

  // Ensure disabled tabs cannot remain active
  React.useEffect(() => {
    if ((activeTab === 'query' && disableQuery) || (activeTab === 'data' && disableData) || (activeTab === 'download' && disableDownload) || (activeTab === 'style' && disableStyle)) {
      setActiveTab('select');
    }
  }, [activeTab, disableQuery, disableData, disableDownload, disableStyle]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="tabs" role="tablist" aria-label="Sidebar Tabs" style={{ display: 'flex', gap: 0, marginBottom: 0 }}>
        <TabButton name="select" active={activeTab === 'select'} onClick={() => { setActiveTab('select'); onTabChange?.('select'); }}>Select</TabButton>
        <TabButton name="details" active={activeTab === 'details'} onClick={() => { setActiveTab('details'); onTabChange?.('details'); }}>Details</TabButton>
        <TabButton name="style" active={activeTab === 'style'} disabled={disableStyle}
          onClick={() => {
            if (disableStyle) { try { toast(isGroupLayer ? 'Style is not available for Group Layers' : 'Style is only available for Feature Layers'); } catch {} }
            else { setActiveTab('style'); onTabChange?.('style'); }
          }}
          title={disableStyle ? (isGroupLayer ? 'Not available for Group Layers' : 'Only for Feature Layers') : undefined}
        >Style</TabButton>
        <TabButton name="query" active={activeTab === 'query'} disabled={disableQuery}
          onClick={() => {
            if (disableQuery) { try { toast(isGroupLayer ? 'Query is not available for Group Layers' : 'Query is only available for Feature Layers'); } catch {} }
            else { setActiveTab('query'); onTabChange?.('query'); }
          }}
          title={disableQuery ? (isGroupLayer ? 'Not available for Group Layers' : 'Only for Feature Layers') : undefined}
        >Query</TabButton>
        <TabButton name="data" active={activeTab === 'data'} disabled={disableData}
          onClick={() => {
            if (disableData) { try { toast(isGroupLayer ? 'Data is not available for Group Layers' : 'Data is only available for Feature Layers'); } catch {} }
            else { setActiveTab('data'); onTabChange?.('data'); }
          }}
          title={disableData ? (isGroupLayer ? 'Not available for Group Layers' : 'Only for Feature Layers') : undefined}
        >Data</TabButton>
        <TabButton name="download" active={activeTab === 'download'} disabled={disableDownload}
          onClick={() => {
            if (disableDownload) { try { toast(isGroupLayer ? 'Download is not available for Group Layers' : 'Download is only available for Feature Layers'); } catch {} }
            else { setActiveTab('download'); onTabChange?.('download'); }
          }}
          title={disableDownload ? (isGroupLayer ? 'Not available for Group Layers' : 'Only for Feature Layers') : undefined}
        >Download</TabButton>
      </div>
      <div className="tab-panels" style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0, overflow: 'auto' }}>
        {activeTab === 'select' ? (
          <section id="panel-select" role="tabpanel" aria-labelledby="tab-select">
          <SelectTab
            serviceUrl={serviceUrl}
            onSelectServiceUrl={onSelectServiceUrl}
            onZoomToExtent={onZoomToExtent}
            serviceMeta={serviceMeta ?? null}
            layerMeta={layerMeta ?? null}
          />
          </section>
        ) : null}
        {activeTab === 'details' ? (
          <section id="panel-details" role="tabpanel" aria-labelledby="tab-details">
          <DetailsTab
            serviceMeta={serviceMeta ?? null}
            layerMeta={layerMeta ?? null}
            featureCount={featureCount ?? null}
            onZoomToExtent={onZoomToExtent}
            serviceUrl={serviceUrl}
            whereValue={whereValue}
            bbox={bbox}
            center={center}
            zoom={zoom}
            isDynamic={disableQuery || disableData || disableDownload || disableStyle}
            fallbackReason={fallbackReason}
            onClearWhere={onClearWhere}
            downloadedExtent={downloadedExtent as any}
          />
          </section>
        ) : null}
        {activeTab === 'style' ? (
          <section id="panel-style" role="tabpanel" aria-labelledby="tab-style">
          <StyleTab
            mode={styleMode}
            options={styleOptions}
            geometryType={layerMeta?.geometryType}
            onModeChange={onStyleModeChange}
            onOptionsChange={onStyleOptionsChange}
          />
          </section>
        ) : null}
        {activeTab === 'query' ? (
          <section id="panel-query" role="tabpanel" aria-labelledby="tab-query">
          <QueryTab
            fields={layerMeta?.fields || []}
            whereDraft={whereDraftValue}
            onDraftChange={(w) => onEditWhere?.(w)}
            onCommitDraft={() => onCommitWhere?.()}
            valueSamples={valueSamples}
            layerUrl={(function(){
              try {
                const s = String(serviceUrl || '');
                if (/\/(MapServer|FeatureServer)\/\d+$/i.test(s)) return s;
                if (/\/(MapServer|FeatureServer)$/i.test(s) && typeof (layerMeta as any)?.id === 'number') return `${s.replace(/\/+$/, '')}/${(layerMeta as any).id}`;
                return '';
              } catch { return ''; }
            })()}
          />
          </section>
        ) : null}
        {activeTab === 'data' ? (
          <section id="panel-data" role="tabpanel" aria-labelledby="tab-data">
          <DataTab
            rows={Array.isArray(layerDataRows) ? layerDataRows : []}
            datasetName={layerMeta?.name || 'features'}
            columnAliases={columnAliases}
            featureCollection={featureCollection}
            onRowHover={onRowHover}
            onRowClick={onRowClick}
            highlightId={highlightId}
            fields={layerMeta?.fields || []}
            layerTotal={typeof featureCount === 'number' ? featureCount : null}
          />
          </section>
        ) : null}
        {activeTab === 'download' ? (
          <section id="panel-download" role="tabpanel" aria-labelledby="tab-download">
          <DownloadTab
            rows={Array.isArray(layerDataRows) ? layerDataRows : []}
            datasetName={layerMeta?.name || 'features'}
            featureCollection={featureCollection}
            whereValue={whereValue || '1=1'}
            serviceUrl={serviceUrl}
            layerId={layerMeta?.id}
            geometryType={layerMeta?.geometryType}
            spatialWkid={(serviceMeta as any)?.spatialReference?.latestWkid || (serviceMeta as any)?.spatialReference?.wkid}
            zoom={zoom}
            bbox={bbox}
            center={center}
            layerTotal={typeof featureCount === 'number' ? featureCount : undefined}
            renderer={(layerMeta as any)?.drawingInfo?.renderer}
          />
          </section>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderTop: '1px solid var(--border)', color: 'var(--muted)', fontSize: 12 }}>
        <span>Contribute:</span>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href={GITHUB_ISSUES_URL} target="_blank" rel="noreferrer noopener" title="Report an issue" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Issues</a>
          <a href={GITHUB_FORK_URL} target="_blank" rel="noreferrer noopener" title="Fork on GitHub" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Fork</a>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer noopener" title="Repository" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Repo</a>
        </div>
      </div>
    </div>
  );
}

function TabButton({ name, active, onClick, children, disabled = false, title }: { name: 'select' | 'details' | 'style' | 'query' | 'data' | 'download'; active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; title?: string }) {
  const [isCoarse, setIsCoarse] = React.useState<boolean>(() => {
    try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
  });
  React.useEffect(() => {
    try {
      const mql = window.matchMedia('(pointer: coarse)');
      const handler = () => setIsCoarse(mql.matches);
      if (typeof mql.addEventListener === 'function') mql.addEventListener('change', handler);
      else if (typeof (mql as any).addListener === 'function') (mql as any).addListener(handler);
      return () => {
        if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', handler);
        else if (typeof (mql as any).removeListener === 'function') (mql as any).removeListener(handler);
      };
    } catch { return; }
  }, []);
  return (
    <button onClick={onClick} title={title}
      role="tab"
      id={`tab-${name}`}
      aria-controls={`panel-${name}`}
      aria-selected={active}
      aria-disabled={disabled}
      className={`tab-button${active ? ' is-active' : ''}`}
      style={{
        padding: isCoarse ? '10px 14px' : '8px 12px',
        margin: 0,
        border: '1px solid var(--border)',
        borderBottom: active ? '1px solid var(--panel)' : '1px solid var(--border)',
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        background: active ? 'var(--panel)' : 'var(--panel-subtle)',
        color: disabled ? 'var(--muted)' : (active ? 'var(--text)' : 'var(--muted)'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}><span className="tab-label">{children}</span></button>
  );
}
