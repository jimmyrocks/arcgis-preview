import React from 'react';
import { getRestServiceUrlInfo } from '../../../lib/arcgis';
import { fetchLayerExtent4326, fetchServiceMetadata } from '../../../lib/esriLayer';
import { extentToBounds } from '../../../lib/geometry';
import { friendlyServiceLabel, serviceDataBadge, serviceShortHint, serviceSummaryHint } from '../../../lib/serviceSemantics';
import type { MapServiceInfo, MapServiceLayerInfo } from '../../../lib/types/arcgis-rest';
import SearchableSelect from '../../ui/SearchableSelect';
import type { SearchableSelectOption } from '../../ui/SearchableSelect';

type Props = {
  serviceUrl: string;
  onSelectServiceUrl: (url: string) => void;
  serviceMeta?: MapServiceInfo | null;
  layerMeta?: MapServiceLayerInfo | null;
  featureCount?: number | null;
  renderStatus?: 'idle' | 'loading' | 'loaded' | 'error';
  renderedFeatureCount?: number;
  renderMode?: 'feature' | 'dynamic' | 'fallback_dynamic' | 'image' | 'vector';
  onZoomToExtent: (extent: { xmin: number; ymin: number; xmax: number; ymax: number } | null) => void;
  onZoomToLayer?: () => void;
  onFocusFinder?: () => void;
  onBrowseServer?: () => void;
  onBrowseFolder?: (path: string) => void;
  onBrowseService?: (serviceKey: string) => void;
};

type LayerOption = {
  id: number;
  name: string;
};

export default function LayersTab({
  serviceUrl,
  onSelectServiceUrl,
  serviceMeta,
  layerMeta,
  featureCount,
  renderStatus = 'idle',
  renderedFeatureCount = 0,
  renderMode = 'feature',
  onZoomToExtent,
  onZoomToLayer,
  onFocusFinder,
  onBrowseServer,
  onBrowseFolder,
  onBrowseService,
}: Props) {
  const [copied, setCopied] = React.useState(false);
  const [zoomBusy, setZoomBusy] = React.useState(false);
  const [layerOptions, setLayerOptions] = React.useState<LayerOption[]>([]);
  const [layerOptionsLoading, setLayerOptionsLoading] = React.useState(false);
  const [sublayerInput, setSublayerInput] = React.useState('');
  const copyTimerRef = React.useRef<number | null>(null);
  const parsed = React.useMemo(() => {
    try {
      return getRestServiceUrlInfo(serviceUrl);
    } catch {
      return null;
    }
  }, [serviceUrl]);

  const serviceKey = React.useMemo(() => {
    if (!parsed?.servicePath || !parsed?.serviceType) return '';
    return `${parsed.servicePath}/${parsed.serviceType}`;
  }, [parsed?.servicePath, parsed?.serviceType]);

  const breadcrumbs = React.useMemo(() => {
    if (!parsed?.baseRoot) return [] as Array<{ key: string; label: string; onClick?: () => void; active?: boolean }>;
    const items: Array<{ key: string; label: string; onClick?: () => void; active?: boolean }> = [
      {
        key: 'server',
        label: rootLabel(parsed.baseRoot),
        onClick: onBrowseServer,
        active: !parsed.folders.length && !serviceKey,
      },
    ];

    let pathSoFar = '';
    parsed.folders.forEach((part) => {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;
      const target = pathSoFar;
      items.push({
        key: `folder:${target}`,
        label: part,
        onClick: onBrowseFolder ? () => onBrowseFolder(target) : undefined,
        active: target === parsed.folders.join('/') && !serviceKey,
      });
    });

    if (serviceKey) {
      items.push({
        key: `service:${serviceKey}`,
        label: parsed.serviceName || serviceNameFromPath(parsed.servicePath || ''),
        onClick: onBrowseService ? () => onBrowseService(serviceKey) : undefined,
        active: typeof parsed.layerId !== 'number',
      });
    }

    if (typeof parsed?.layerId === 'number') {
      items.push({
        key: `layer:${parsed.layerId}`,
        label: layerMeta?.name || `Layer ${parsed.layerId}`,
        active: true,
      });
    }

    return items;
  }, [layerMeta?.name, onBrowseFolder, onBrowseServer, onBrowseService, parsed?.baseRoot, parsed?.folders, parsed?.layerId, parsed?.serviceName, parsed?.servicePath, serviceKey]);

  const selectionUrl = parsed?.layerUrl
    || (parsed?.serviceType === 'FeatureServer' && parsed?.serviceUrl ? `${parsed.serviceUrl}/0` : parsed?.serviceUrl)
    || serviceUrl;
  const selectionTitle = layerMeta?.name || serviceMeta?.mapName || parsed?.serviceName || 'Layer';
  const isLayerSelection = typeof parsed?.layerId === 'number' || parsed?.serviceType === 'FeatureServer';
  const selectionLabel = isLayerSelection ? 'Current layer' : 'Current service';
  const selectionHint = serviceSummaryHint(parsed?.serviceType);
  const navigationUrl = selectionUrl || parsed?.serviceUrl || serviceUrl;
  const badges = [
    isLayerSelection ? (typeof parsed?.layerId === 'number' ? `Layer ${parsed.layerId}` : 'Layer') : 'Service',
    friendlyServiceLabel(parsed?.serviceType),
    serviceDataBadge(parsed?.serviceType),
    layerMeta?.geometryType ? humanizeGeometry(layerMeta.geometryType) : null,
    typeof featureCount === 'number' ? `${featureCount.toLocaleString()} records` : null,
  ].filter(Boolean) as string[];
  const canFallbackZoom = !!((layerMeta as any)?.extent || (serviceMeta as any)?.fullExtent || (serviceMeta as any)?.initialExtent) || !!onZoomToLayer;
  const isFeatureRender = renderMode === 'feature';
  const showSublayerPicker = !!parsed?.serviceUrl && (parsed.serviceType === 'MapServer' || parsed.serviceType === 'FeatureServer');

  React.useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!parsed?.serviceUrl || (parsed.serviceType !== 'MapServer' && parsed.serviceType !== 'FeatureServer')) {
      setLayerOptions([]);
      setLayerOptionsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLayerOptionsLoading(true);

    void fetchServiceMetadata(parsed.serviceUrl, { signal: controller.signal })
      .then((meta) => {
        if (cancelled) return;
        setLayerOptions(normalizeServiceLayers(meta, parsed.serviceType));
        setLayerOptionsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        if (parsed.serviceType === 'FeatureServer') {
          setLayerOptions([{ id: 0, name: parsed.serviceName || 'Layer 0' }]);
        } else {
          setLayerOptions([]);
        }
        setLayerOptionsLoading(false);
      });

    return () => {
      cancelled = true;
      try {
        controller.abort();
      } catch {}
    };
  }, [parsed?.serviceName, parsed?.serviceType, parsed?.serviceUrl]);

  const selectedLayerValue = React.useMemo(() => {
    if (!parsed) return '';
    if (parsed.serviceType === 'MapServer' && typeof parsed.layerId !== 'number') return 'dynamic';
    if (parsed.serviceType === 'FeatureServer') return String(parsed.layerId ?? 0);
    if (typeof parsed.layerId === 'number') return String(parsed.layerId);
    return '';
  }, [parsed]);

  const sublayerOptions = React.useMemo<SearchableSelectOption[]>(() => {
    const options: SearchableSelectOption[] = [];
    if (!parsed?.serviceType) return options;

    if (parsed.serviceType === 'MapServer') {
      options.push({
        value: 'dynamic',
        label: 'Dynamic map service (all layers)',
        groupKey: 'service-view',
        groupLabel: 'Styled Service View',
        renderLabel: () => (
          <div style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontWeight: 600 }}>Dynamic map service</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Whole service using the published styling across {Math.max(layerOptions.length, 1).toLocaleString()} layer{Math.max(layerOptions.length, 1) === 1 ? '' : 's'}.
            </span>
          </div>
        ),
      });
    }

    layerOptions.forEach((layer) => {
      options.push({
        value: String(layer.id),
        label: `${layer.name} (Layer ${layer.id})`,
        groupKey: 'layers',
        groupLabel: 'Open Individual Layers',
        renderLabel: () => (
          <div style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontWeight: 600 }}>{layer.name}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {parsed.serviceName || serviceNameFromPath(parsed.servicePath || '')} / Layer {layer.id} · {serviceShortHint(parsed.serviceType)}
            </span>
          </div>
        ),
      });
    });

    return options;
  }, [layerOptions, parsed?.serviceName, parsed?.servicePath, parsed?.serviceType]);

  const filteredSublayerOptions = React.useMemo(() => {
    const query = sublayerInput.trim().toLowerCase();
    if (!query) return sublayerOptions;
    return sublayerOptions.filter((option) => option.label.toLowerCase().includes(query));
  }, [sublayerInput, sublayerOptions]);

  const selectedSublayerLabel = React.useMemo(() => {
    const current = sublayerOptions.find((option) => option.value === selectedLayerValue);
    return current?.label || '';
  }, [selectedLayerValue, sublayerOptions]);

  React.useEffect(() => {
    setSublayerInput(selectedSublayerLabel);
  }, [selectedSublayerLabel]);

  async function handleCopy() {
    if (!navigationUrl) return;
    try {
      await navigator.clipboard.writeText(navigationUrl);
      setCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

  async function handleZoom() {
    if (zoomBusy) return;
    setZoomBusy(true);
    try {
      if (selectionUrl && /\/(MapServer|FeatureServer)\/\d+$/i.test(selectionUrl)) {
        const ext = await fetchLayerExtent4326(selectionUrl);
        if (ext) {
          onZoomToExtent({ ...ext, spatialReference: ext.spatialReference ? { ...ext.spatialReference } : undefined } as any);
          return;
        }
      }
      const ext0: any = (layerMeta?.extent || serviceMeta?.fullExtent || serviceMeta?.initialExtent) as any;
      if (ext0 && extentToBounds(ext0 as any)) {
        const clone = { ...ext0, spatialReference: ext0.spatialReference ? { ...ext0.spatialReference } : undefined } as any;
        onZoomToExtent(clone);
        return;
      }
      onZoomToLayer?.();
    } catch {
      onZoomToLayer?.();
    } finally {
      setZoomBusy(false);
    }
  }

  function handleSublayerChange(nextValue: string) {
    if (!parsed?.serviceUrl) return;
    if (parsed.serviceType === 'MapServer' && nextValue === 'dynamic') {
      if (parsed.serviceUrl !== serviceUrl) onSelectServiceUrl(parsed.serviceUrl);
      return;
    }
    if (!nextValue) return;
    const nextUrl = `${parsed.serviceUrl}/${nextValue}`;
    if (nextUrl === serviceUrl) return;
    onSelectServiceUrl(nextUrl);
  }

  if (!parsed?.serviceUrl) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Use the header to enter a URL</div>
          <div className="u-small u-muted" style={{ marginTop: 6, lineHeight: 1.6 }}>
            Once a service or layer is open, this tab becomes the navigation home for breadcrumbs and sublayers.
          </div>
          {onFocusFinder ? (
            <button type="button" className="u-btn" style={{ marginTop: 10, width: 'fit-content' }} onClick={onFocusFinder}>
              Focus layer finder
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 240px' }}>
            <div className="u-label" style={{ marginBottom: 0 }}>{selectionLabel}</div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{selectionTitle}</div>
            <div
              style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
              title={navigationUrl}
            >
              {navigationUrl}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {onFocusFinder ? (
              <button type="button" className="u-btn" onClick={onFocusFinder}>
                Change layer
              </button>
            ) : null}
            <button type="button" className="u-btn" onClick={handleCopy}>
              {copied ? 'Copied' : 'Copy URL'}
            </button>
            <button type="button" className="u-btn" onClick={() => { void handleZoom(); }} disabled={zoomBusy || !canFallbackZoom}>
              {zoomBusy ? 'Zooming…' : 'Zoom to layer'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {badges.map((badge) => (
            <span key={badge} style={badgeStyle}>{badge}</span>
          ))}
        </div>

        {selectionHint ? (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{selectionHint}</div>
        ) : null}

        {(renderStatus === 'loading' || renderStatus === 'loaded') ? (
          <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
            {renderStatus === 'loading' ? (
              <span style={{ width: 12, height: 12, border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            ) : null}
            <span>
              {(() => {
                if (!isFeatureRender) {
                  const modeLabel = renderMode === 'vector' ? 'vector tiles' : 'imagery';
                  return renderStatus === 'loading' ? `Rendering ${modeLabel}…` : `Rendered as ${modeLabel}.`;
                }
                if (renderStatus === 'loaded' && renderedFeatureCount === 0) {
                  return featureCount === 0 ? 'No features in this layer.' : 'No features in view.';
                }
                if (!renderedFeatureCount) return 'Rendering features…';
                const total = typeof featureCount === 'number' && featureCount > 0 ? ` / ${featureCount.toLocaleString()}` : '';
                const suffix = total ? ' (in view / total)' : ' in view';
                return `${renderStatus === 'loading' ? 'Rendering' : 'Rendered'} ${renderedFeatureCount.toLocaleString()}${total} features${suffix}`;
              })()}
            </span>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div style={cardStyle}>
          <div className="u-label" style={{ marginBottom: 0 }}>Path</div>
          <div style={breadcrumbRailStyle}>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.key}>
                {index > 0 ? <span style={{ color: 'var(--muted)' }}>/</span> : null}
                <button
                  type="button"
                  onClick={crumb.onClick}
                  disabled={!crumb.onClick}
                  style={{
                    ...breadcrumbChipStyle,
                    background: crumb.active ? 'var(--accent-row)' : 'var(--panel)',
                    color: crumb.active ? 'var(--accent)' : 'var(--text)',
                    cursor: crumb.onClick ? 'pointer' : 'default',
                    opacity: crumb.onClick ? 1 : 0.92,
                  }}
                  title={crumb.label}
                >
                  {crumb.label}
                </button>
              </React.Fragment>
            ))}
          </div>
          <div style={pathUrlStyle} title={navigationUrl}>
            {navigationUrl}
          </div>
        </div>

        {showSublayerPicker ? (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="u-label" style={{ marginBottom: 0 }}>
                {parsed.serviceName ? `Open sublayer in ${parsed.serviceName}` : 'Open sublayer'}
              </div>
              <div className="u-small u-muted">
                {layerOptionsLoading
                  ? 'Loading…'
                  : `${layerOptions.length.toLocaleString()} published layer${layerOptions.length === 1 ? '' : 's'}`}
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <SearchableSelect
                options={filteredSublayerOptions}
                value={selectedLayerValue}
                onChange={handleSublayerChange}
                onInputChange={setSublayerInput}
                inputValue={sublayerInput}
                placeholder="Search layers or choose the styled map view…"
                loading={layerOptionsLoading}
                disabled={layerOptionsLoading || !sublayerOptions.length}
                onInputFocus={() => {
                  if (sublayerInput === selectedSublayerLabel) setSublayerInput('');
                }}
                onInputBlur={() => {
                  setSublayerInput(selectedSublayerLabel);
                }}
                emptyState={sublayerInput.trim()
                  ? 'No matching sublayers.'
                  : 'No sublayers were reported for this service.'}
                aria-label="Open sublayer"
              />
            </div>
            <div className="u-small u-muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
              {parsed.serviceType === 'MapServer'
                ? 'Top section = the whole styled map service. Lower section = individual layers you can inspect and query directly.'
                : 'Search by name, then open the exact sublayer you want.'}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function normalizeServiceLayers(meta: any, serviceType: string | null): LayerOption[] {
  const list = Array.isArray(meta?.layers)
    ? meta.layers
        .filter((layer: any) => layer && typeof layer.id === 'number')
        .map((layer: any) => ({
          id: layer.id,
          name: String(layer.name || `Layer ${layer.id}`),
        }))
    : [];
  if (list.length || serviceType !== 'FeatureServer') return list;
  return [{ id: 0, name: String(meta?.name || meta?.mapName || 'Layer 0') }];
}

function rootLabel(root: string): string {
  try {
    const url = new URL(root);
    return url.hostname;
  } catch {
    return 'Server';
  }
}

function serviceNameFromPath(path: string): string {
  const parts = String(path || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || path || 'Service';
}

function humanizeGeometry(value: string): string {
  return String(value || '')
    .replace(/^esriGeometry/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim() || 'Geometry';
}

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 12px',
  background: 'var(--panel-subtle)',
};

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--panel)',
  color: 'var(--muted)',
  fontSize: 11,
  whiteSpace: 'nowrap',
};

const breadcrumbRailStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  overflowX: 'auto',
  paddingTop: 10,
  paddingBottom: 2,
  scrollbarWidth: 'thin',
};

const breadcrumbChipStyle: React.CSSProperties = {
  flex: '0 0 auto',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '4px 9px',
  fontSize: 12,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
};

const pathUrlStyle: React.CSSProperties = {
  marginTop: 10,
  fontSize: 12,
  color: 'var(--muted)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
