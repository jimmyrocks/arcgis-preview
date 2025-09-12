import React, { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import type LType from 'leaflet';
import { resolveEsriLayer, fetchServiceMetadata, fetchFeatureCount, summarizeService, fetchLayerMetadata } from '../lib/esriLayer';
import { log } from '../lib/log';
import type { MapServiceLayerInfo } from '../lib/types/arcgis-rest';
import EsriFeatureLayer from './layers/EsriFeatureLayer';
import EsriDynamicLayer from './layers/EsriDynamicLayer';
import EsriImageLayer from './layers/EsriImageLayer';
import type { GeometryStyleOptions } from '../lib/styleOptions';

type EsriLayerProps = {
  serviceUrl: string;
  selectedMapLayerId?: number;
  where?: string;
  onStatusChange?: (status: 'loading' | 'loaded' | 'error') => void;
  onServiceMetadata?: (summary: string, meta: any) => void;
  onComputedBounds?: (b: LType.LatLngBounds) => void;
  onDownloadedExtentChange?: (e: { xmin: number; ymin: number; xmax: number; ymax: number; spatialReference?: { wkid?: number; latestWkid?: number } } | null) => void;
  onFeatureCollection?: (fc: any) => void;
  onFeatureHoverId?: (id: string | number | null) => void;
  onFeatureClickId?: (id: string | number | null) => void;
  styleMode?: 'server' | 'custom';
  customStyle?: GeometryStyleOptions;
  onRenderModeChange?: (mode: 'feature' | 'dynamic' | 'fallback_dynamic', reason?: string) => void;
};

export default function EsriLayer({ serviceUrl, selectedMapLayerId, where = '1=1', onStatusChange, onServiceMetadata, onComputedBounds, onDownloadedExtentChange, onFeatureCollection, onFeatureClickId, styleMode, customStyle, onRenderModeChange }: EsriLayerProps) {
  const [serviceMeta, setServiceMeta] = React.useState<any | null>(null);
  const [fallbackOnlyLayerId, setFallbackOnlyLayerId] = React.useState<number | null>(null);
  const [dynamicOverlayOnlyLayerId, setDynamicOverlayOnlyLayerId] = React.useState<number | null>(null);
  const [layerSupportsQuery, setLayerSupportsQuery] = React.useState<boolean | null>(null);
  const [layerMeta, setLayerMeta] = React.useState<MapServiceLayerInfo | null>(null);
  const lastFallbackReasonRef = React.useRef<string | undefined>(undefined);
  const resolved = React.useMemo(() => {
    try {
      const r = resolveEsriLayer(serviceUrl, selectedMapLayerId ?? undefined);
      log.debug('[EsriLayer] resolve', { serviceUrl, selectedMapLayerId, resolved: r });
      return r;
    } catch {
      log.error('[EsriLayer] resolve error');
      return { type: 'unknown' } as any;
    }
  }, [serviceUrl, selectedMapLayerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!serviceUrl) return;
        onStatusChange?.('loading');
        setFallbackOnlyLayerId(null);
        setServiceMeta(null);
        setLayerSupportsQuery(null);
        setLayerMeta(null);
        if (resolved.serviceRootUrl) {
          try {
            log.debug('[EsriLayer] fetching service metadata', resolved.serviceRootUrl);
            const meta = await fetchServiceMetadata(resolved.serviceRootUrl);
            log.debug('[EsriLayer] fetched service metadata');
            if (!cancelled) setServiceMeta(meta);
            let summary = summarizeService(meta as any, resolved.layerId);
            if (resolved.type === 'feature' && resolved.url && typeof resolved.layerId === 'number') {
              try {
                const count = await fetchFeatureCount(resolved.url, where);
                summary = `${summary} — ${count.toLocaleString()} features`;
              } catch {}
              try {
                const lm2 = await fetchLayerMetadata(resolved.url);
                if (!cancelled) setLayerMeta(lm2 as any);
              } catch {}
            }
            if (!cancelled) onServiceMetadata?.(summary, meta);
          } catch (e) {
            // surface error early if metadata fails
            onStatusChange?.('error');
            log.error('[EsriLayer] failed to fetch service metadata', e);
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [serviceUrl, selectedMapLayerId, where]);

  // Decide best rendering mode with fallback for MapServer layers that don't support Query
  const isMapServerLayer = resolved.url ? (/\/mapserver\//i.test(resolved.url) && typeof resolved.layerId === 'number') : false;

  // For MapServer sublayers, show a dynamic overlay immediately so users see something
  React.useEffect(() => {
    if (isMapServerLayer && typeof resolved.layerId === 'number') {
      setDynamicOverlayOnlyLayerId(resolved.layerId);
      log.debug('[EsriLayer] dynamic overlay primed for layer', resolved.layerId);
    } else {
      setDynamicOverlayOnlyLayerId(null);
    }
    // Reset hard fallback when URL changes
    setFallbackOnlyLayerId(null);
    setLayerSupportsQuery(null);
    setLayerMeta(null);
    lastFallbackReasonRef.current = undefined;
  }, [isMapServerLayer, resolved.layerId, resolved.url]);

  // If styling changes, ensure any temporary dynamic overlay is cleared to avoid double rendering
  React.useEffect(() => {
    try {
      if (dynamicOverlayOnlyLayerId != null) {
        setDynamicOverlayOnlyLayerId(null);
        log.debug('[EsriLayer] style changed; clearing dynamic overlay');
      }
    } catch {}
    // do not reset fallbackOnlyLayerId here; fallback state should persist if the layer lacks Query
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleMode, JSON.stringify(customStyle || {})]);

  // For MapServer sublayers, fetch the layer metadata to accurately detect Query support
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(isMapServerLayer && resolved.serviceRootUrl && typeof resolved.layerId === 'number')) return;
        const layerUrl = `${String(resolved.serviceRootUrl).replace(/\/+$/, '')}/${resolved.layerId}`;
        log.debug('[EsriLayer] fetching layer metadata', layerUrl);
        const lm = await fetchLayerMetadata(layerUrl);
        if (cancelled) return;
        setLayerMeta(lm as any);
        const caps: string = String((lm as any)?.capabilities || '');
        const fmt: string = String((lm as any)?.supportedQueryFormats || '');
        const supportsQuery = /(?:^|,)\s*Query\s*(?:,|$)/i.test(caps) || /json/i.test(fmt);
        log.debug('[EsriLayer] layer meta fetched; supportsQuery?', { supportsQuery, caps, fmt, id: (lm as any)?.id });
        setLayerSupportsQuery(!!supportsQuery);
        if (!supportsQuery) lastFallbackReasonRef.current = 'Layer does not support Query';
      } catch (e) {
        // If layer meta fails, leave null and allow feature path to attempt and fallback on error
        log.error('[EsriLayer] failed to fetch layer metadata; will rely on runtime error to fallback', e);
      }
    })();
    return () => { cancelled = true; };
  }, [isMapServerLayer, resolved.serviceRootUrl, resolved.layerId]);

  // Report pure dynamic mode for MapServer roots
  React.useEffect(() => {
    try {
      if (resolved.type === 'dynamic') onRenderModeChange?.('dynamic');
    } catch {}
  }, [resolved.type, resolved.url]);

  if (fallbackOnlyLayerId != null && resolved.url) {
    log.info('[EsriLayer] using dynamic fallback onlyLayerId', fallbackOnlyLayerId);
    try { onRenderModeChange?.('fallback_dynamic', lastFallbackReasonRef.current); } catch {}
    return (
      <EsriDynamicLayer
        url={(resolved as any).serviceRootUrl || resolved.url}
        serviceMeta={serviceMeta}
        onStatusChange={onStatusChange}
        onComputedBounds={onComputedBounds}
        onlyLayerId={fallbackOnlyLayerId}
      />
    );
  }
  if (resolved.url) {
    if (resolved.type === 'feature') {
      // Use per-layer metadata when available to decide feature vs dynamic
      if (isMapServerLayer && layerSupportsQuery === false && typeof resolved.layerId === 'number') {
        log.info('[EsriLayer] layer lacks Query; using dynamic fallback', { layerId: resolved.layerId });
        return (
          <EsriDynamicLayer
            url={(resolved as any).serviceRootUrl || resolved.url}
            serviceMeta={serviceMeta}
            onStatusChange={onStatusChange}
            onComputedBounds={onComputedBounds}
            onlyLayerId={resolved.layerId}
          />
        );
      }
      const handleStatus = (s: 'loading' | 'loaded' | 'error') => {
        try { onStatusChange?.(s); } catch {}
        if (s === 'error' && isMapServerLayer && typeof resolved.layerId === 'number') {
          // feature path failed (likely CORS or disabled query) → fall back to dynamic
          setFallbackOnlyLayerId(resolved.layerId);
          try { onServiceMetadata?.('Rendered as dynamic (CORS or Query disabled)', serviceMeta); } catch {}
          log.error('[EsriLayer] feature path errored; switching to dynamic');
          try { onRenderModeChange?.('fallback_dynamic', lastFallbackReasonRef.current || 'Feature requests failed (CORS or access)'); } catch {}
        } else if (s === 'loaded') {
          // Feature layer is alive; ensure dynamic overlay is removed
          if (dynamicOverlayOnlyLayerId != null) {
            setDynamicOverlayOnlyLayerId(null);
            log.debug('[EsriLayer] feature layer loaded; removing dynamic overlay');
          }
          try { onRenderModeChange?.('feature'); } catch {}
        }
      };
      const handleFeatureCollection = (fc: any) => {
        try {
          const count = Array.isArray(fc?.features) ? fc.features.length : 0;
          if (count > 0) {
            // Remove the dynamic overlay once we know features are rendering
            setDynamicOverlayOnlyLayerId(null);
            log.debug('[EsriLayer] feature data received; removing dynamic overlay');
          }
        } catch {}
        try { onFeatureCollection?.(fc); } catch {}
      };
      return (
        <>
          {dynamicOverlayOnlyLayerId != null ? (
          <EsriDynamicLayer
            url={(resolved as any).serviceRootUrl || resolved.url}
            serviceMeta={serviceMeta}
            onStatusChange={() => { /* overlay status ignored */ }}
            onComputedBounds={onComputedBounds}
            onlyLayerId={dynamicOverlayOnlyLayerId}
          />
          ) : null}
          <EsriFeatureLayer
            key={`fl-${String(resolved.url)}-${String(styleMode)}-${JSON.stringify(customStyle || {})}`}
            url={resolved.url}
            where={where}
            serviceMeta={serviceMeta}
            layerMeta={layerMeta}
            onStatusChange={handleStatus}
            onComputedBounds={onComputedBounds}
            onDownloadedExtentChange={onDownloadedExtentChange}
            onFeatureCollection={handleFeatureCollection}
            onFeatureClickId={onFeatureClickId}
            styleMode={styleMode}
            customStyle={customStyle}
          />
        </>
      );
    }
    if (resolved.type === 'dynamic') {
      return (
        <EsriDynamicLayer
          url={resolved.url}
          serviceMeta={serviceMeta}
          onStatusChange={onStatusChange}
          onComputedBounds={onComputedBounds}
        />
      );
    }
  }
  if (resolved.type === 'image' && resolved.url) {
    return (
      <EsriImageLayer
        url={resolved.url}
        onStatusChange={onStatusChange}
        onComputedBounds={onComputedBounds}
      />
    );
  }
  return null;
}
