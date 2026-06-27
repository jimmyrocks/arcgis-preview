import React, { useState } from 'react';
import { toast } from 'react-toastify';
import type { MapServiceInfo, MapServiceLayerInfo, Extent } from '../../../lib/types/arcgis-rest';
import LayersTab from '../tabs/LayersTab';
import DetailsTab from '../tabs/DetailsTab';
import QueryTab from '../tabs/QueryTab';
import DataTab from '../tabs/DataTab';
import FeatureInspector from './FeatureInspector';
import DownloadTab from '../tabs/DownloadTab';
import StyleTab from '../tabs/StyleTab';
import type { GeometryStyleOptions, AttributeStyleOptions, StyleMode } from '../../../lib/styleOptions';
import { GITHUB_ISSUES_URL, GITHUB_FORK_URL, GITHUB_REPO_URL } from '../../../lib/links';
import { buildInfo } from '../../../lib/buildInfo';

function ContributeFooter() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', padding: '4px 8px', borderTop: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Contribute"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}
      >
        ···
      </button>
      {open ? (
        <div style={{ position: 'absolute', bottom: '100%', right: 8, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 0', minWidth: 140, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100 }}>
          <a href={GITHUB_ISSUES_URL} target="_blank" rel="noreferrer noopener" onClick={() => setOpen(false)} style={{ display: 'block', padding: '6px 14px', color: 'var(--text)', textDecoration: 'none', fontSize: 13 }}>Report an issue</a>
          <a href={GITHUB_FORK_URL} target="_blank" rel="noreferrer noopener" onClick={() => setOpen(false)} style={{ display: 'block', padding: '6px 14px', color: 'var(--text)', textDecoration: 'none', fontSize: 13 }}>Fork on GitHub</a>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer noopener" onClick={() => setOpen(false)} style={{ display: 'block', padding: '6px 14px', color: 'var(--text)', textDecoration: 'none', fontSize: 13 }}>Repository</a>
          <div style={{ marginTop: 4, borderTop: '1px solid var(--border)', padding: '7px 14px 5px', color: 'var(--muted)', fontSize: 11, lineHeight: 1.35, whiteSpace: 'nowrap' }}>
            Build {buildInfo.gitSha}
          </div>
        </div>
      ) : null}
    </div>
  );
}
export { LabelValue, HtmlValue } from './SidebarPrimitives';

export type ExportProgress = {
  processed: number;
  total: number;
  unit: 'features' | 'rows';
};

export type RenderStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type SidebarProps = {
  serviceUrl: string;
  onSelectServiceUrl: (url: string) => void;
  onZoomToExtent: (extent: { xmin: number; ymin: number; xmax: number; ymax: number } | null) => void;
  onZoomToLayer?: () => void;
  serviceMeta?: MapServiceInfo | null;
  layerMeta?: MapServiceLayerInfo | null;
  isGroupLayer?: boolean;
  featureCount?: number | null;
  downloadedExtent?: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
  selectedFeatureId?: string | number | null;
  onFlashFeature?: (id: string | number | null) => void;
  onZoomToFeature?: (id: string | number | null) => void;
  onClearSelection?: () => void;
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
  styleFeatureCollection?: any;
  onRowHover?: (id: string | number | null) => void;
  onRowClick?: (id: string | number | null) => void;
  onRowDoubleClick?: (id: string | number | null) => void;
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
  styleMode?: StyleMode;
  styleOptions?: GeometryStyleOptions;
  onStyleModeChange?: (mode: StyleMode) => void;
  onStyleOptionsChange?: (opts: GeometryStyleOptions) => void;
  attributeStyle?: AttributeStyleOptions;
  onAttributeStyleChange?: (a: AttributeStyleOptions) => void;
  onStyleByField?: (fieldName: string) => void;
  isLoadingService?: boolean;
  exportProgress?: ExportProgress | null;
  onExportProgress?: (progress: ExportProgress | null) => void;
  renderStatus?: RenderStatus;
  renderedFeatureCount?: number;
  renderMode?: 'feature' | 'dynamic' | 'fallback_dynamic' | 'image' | 'vector';
  layerOpacity?: number;
  onLayerOpacityChange?: (opacity: number) => void;
  onFocusFinder?: () => void;
  onBrowseServer?: () => void;
  onBrowseFolder?: (path: string) => void;
  onBrowseService?: (serviceKey: string) => void;
};

export default function Sidebar({ serviceUrl, onSelectServiceUrl, onZoomToExtent, onZoomToLayer, serviceMeta, layerMeta, isGroupLayer = false, featureCount, whereValue, whereDraftValue, onEditWhere, onCommitWhere, onClearWhere, fallbackReason, layerDataRows, featureCollection, styleFeatureCollection, downloadedExtent, selectedFeatureId, onFlashFeature, onZoomToFeature, onClearSelection, onRowHover, onRowClick, onRowDoubleClick, highlightId, disableQuery = false, disableData = false, disableDownload = false, disableStyle = false, zoom, bbox, center, activeTabName, onTabChange, styleMode = 'server', styleOptions = {}, onStyleModeChange, onStyleOptionsChange, attributeStyle, onAttributeStyleChange, onStyleByField, isLoadingService = false, exportProgress = null, onExportProgress, renderStatus = 'idle', renderedFeatureCount = 0, renderMode = 'feature', layerOpacity = 1, onLayerOpacityChange, onFocusFinder, onBrowseServer, onBrowseFolder, onBrowseService }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'select' | 'details' | 'query' | 'data' | 'download' | 'style'>(activeTabName || 'select');
  React.useEffect(() => {
    if (!activeTabName) return;
    setActiveTab(activeTabName);
  }, [activeTabName]);
  const styleDisabledMessage = isGroupLayer
    ? 'Style is not available for Group Layers'
    : 'Style is available for Feature Layers and raster imagery previews';
  const styleDisabledTitle = isGroupLayer
    ? 'Not available for Group Layers'
    : 'Feature Layers and raster imagery previews only';
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
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="tabs" role="tablist" aria-label="Sidebar Tabs" style={{ display: 'flex', gap: 0, marginBottom: 0 }}>
        <TabButton name="select" active={activeTab === 'select'} onClick={() => { setActiveTab('select'); onTabChange?.('select'); }}>Layer</TabButton>
        <TabButton name="details" active={activeTab === 'details'} onClick={() => { setActiveTab('details'); onTabChange?.('details'); }}>Details</TabButton>
        <TabButton name="style" active={activeTab === 'style'} disabled={disableStyle}
          onClick={() => {
            if (disableStyle) { try { toast(styleDisabledMessage); } catch {} }
            else { setActiveTab('style'); onTabChange?.('style'); }
          }}
          title={disableStyle ? styleDisabledTitle : undefined}
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
      <div className="tab-panels" style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <section
          id="panel-select"
          role="tabpanel"
          aria-labelledby="tab-select"
          aria-hidden={activeTab !== 'select'}
          style={{ display: activeTab === 'select' ? 'block' : 'none' }}
        >
          <LayersTab
            serviceUrl={serviceUrl}
            onSelectServiceUrl={onSelectServiceUrl}
            onZoomToExtent={onZoomToExtent}
            onZoomToLayer={onZoomToLayer}
            serviceMeta={serviceMeta ?? null}
            layerMeta={layerMeta ?? null}
            featureCount={featureCount ?? null}
            renderStatus={renderStatus}
            renderedFeatureCount={renderedFeatureCount}
            renderMode={renderMode}
            onFocusFinder={onFocusFinder}
            onBrowseServer={onBrowseServer}
            onBrowseFolder={onBrowseFolder}
            onBrowseService={onBrowseService}
          />
        </section>
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
            isDynamic={renderMode === 'dynamic' || renderMode === 'fallback_dynamic'}
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
            renderMode={renderMode}
            renderer={(layerMeta as any)?.drawingInfo?.renderer}
            onModeChange={onStyleModeChange}
            onOptionsChange={onStyleOptionsChange}
            layerOpacity={layerOpacity}
            onLayerOpacityChange={onLayerOpacityChange}
            attributeStyle={attributeStyle}
            onAttributeStyleChange={onAttributeStyleChange}
            fields={(layerMeta?.fields as any) ?? undefined}
            featureCollection={(styleFeatureCollection ?? featureCollection) as any}
          />
          </section>
        ) : null}
        {activeTab === 'query' ? (
          <section id="panel-query" role="tabpanel" aria-labelledby="tab-query">
          <QueryTab
            fields={layerMeta?.fields || []}
            appliedWhere={whereValue}
            whereDraft={whereDraftValue}
            onDraftChange={(w) => onEditWhere?.(w)}
            onCommitDraft={() => onCommitWhere?.()}
            onClearWhere={onClearWhere}
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
          <section id="panel-data" role="tabpanel" aria-labelledby="tab-data" style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <DataTab
              datasetName={layerMeta?.name || 'features'}
              columnAliases={columnAliases}
              featureCollection={featureCollection}
              onRowHover={onRowHover}
              onRowClick={onRowClick}
              onRowDoubleClick={onRowDoubleClick}
              highlightId={highlightId}
              fields={layerMeta?.fields || []}
              layerTotal={typeof featureCount === 'number' ? featureCount : null}
              onStyleByField={onStyleByField}
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
            onExportProgress={onExportProgress}
          />
          </section>
        ) : null}
      </div>
      <ContributeFooter />
      {/* Record inspector — slides over the whole sidebar when a feature is selected */}
      <FeatureInspector
        featureCollection={featureCollection}
        selectedFeatureId={selectedFeatureId}
        layerName={layerMeta?.name || (serviceMeta as any)?.mapName}
        onSelectFeature={onRowClick}
        onFlashFeature={onFlashFeature}
        onZoomToFeature={onZoomToFeature}
        onClose={onClearSelection}
      />
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
