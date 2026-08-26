import React from 'react';
import {
  fetchMapServerLegend,
  selectPublishedLegendLayers,
  type ArcGISLegendItem,
  type ArcGISLegendLayer,
} from '../lib/esriLayer';

type Props = {
  serviceRootUrl: string;
  selectedLayerId?: number;
  visibleLayerIds?: number[];
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};

function legendImageUrl(serviceRootUrl: string, item: ArcGISLegendItem): string | null {
  if (item.imageData) {
    const contentType = String(item.contentType || 'image/png');
    return `data:${contentType};base64,${String(item.imageData).replace(/\s+/g, '')}`;
  }
  if (!item.url) return null;
  try {
    return new URL(item.url, `${serviceRootUrl.replace(/\/+$/, '')}/legend`).toString();
  } catch {
    return null;
  }
}

export default function PublishedMapLegend({
  serviceRootUrl,
  selectedLayerId,
  visibleLayerIds,
  collapsed: collapsedProp,
  onCollapsedChange,
}: Props) {
  const [internalCollapsed, setInternalCollapsed] = React.useState(false);
  const [layers, setLayers] = React.useState<ArcGISLegendLayer[]>([]);
  const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error'>('loading');
  const [attempt, setAttempt] = React.useState(0);
  const collapsed = collapsedProp ?? internalCollapsed;
  const visibleKey = Array.isArray(visibleLayerIds) ? visibleLayerIds.join(',') : '';

  React.useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetchMapServerLegend(serviceRootUrl, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setLayers(selectPublishedLegendLayers(response, selectedLayerId, visibleLayerIds));
        setStatus('loaded');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [serviceRootUrl, selectedLayerId, visibleKey, attempt]);

  if (status === 'loaded' && layers.length === 0) return null;

  const toggle = () => {
    const next = !collapsed;
    setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };

  return (
    <aside className={`published-map-legend${collapsed ? ' is-collapsed' : ''}`} aria-label="Published map legend">
      <button
        type="button"
        className="published-map-legend-header"
        onClick={toggle}
        aria-expanded={!collapsed}
        title={collapsed ? 'Show published map legend' : 'Hide published map legend'}
      >
        <span>
          <span className="published-map-legend-title">Legend</span>
          {!collapsed ? <span className="published-map-legend-subtitle">Published by ArcGIS</span> : null}
        </span>
        <span aria-hidden>{collapsed ? '+' : '−'}</span>
      </button>

      {!collapsed ? (
        <div className="published-map-legend-body" aria-live="polite">
          {status === 'loading' ? (
            <div className="published-map-legend-loading" role="status">
              <span className="ui-spinner" aria-hidden />
              Loading published symbols…
            </div>
          ) : status === 'error' ? (
            <div className="published-map-legend-error" role="status">
              <span>The service legend could not be loaded.</span>
              <button type="button" className="u-btn" onClick={() => setAttempt((value) => value + 1)}>Retry</button>
            </div>
          ) : (
            layers.map((layer) => (
              <section className="published-map-legend-layer" key={layer.layerId} aria-label={layer.layerName || `Layer ${layer.layerId}`}>
                {layers.length > 1 ? <h3>{layer.layerName || `Layer ${layer.layerId}`}</h3> : null}
                <div className="published-map-legend-items">
                  {(layer.legend || []).map((item, index) => {
                    const imageUrl = legendImageUrl(serviceRootUrl, item);
                    const label = String(item.label || layer.layerName || 'Map symbol').trim();
                    return (
                      <div className="published-map-legend-item" key={`${layer.layerId}-${label}-${index}`}>
                        <span className="published-map-legend-symbol" aria-hidden>
                          {imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span />}
                        </span>
                        <span title={label}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      ) : null}
    </aside>
  );
}
