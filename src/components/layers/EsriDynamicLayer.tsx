import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { dynamicMapLayer } from 'esri-leaflet';
import type LType from 'leaflet';
import type { MapServiceInfo } from '../../lib/types/arcgis-rest';
import { extentToBounds } from '../../lib/geometry';
import { fetchLayerExtent4326 } from '../../lib/esriLayer';
import { log } from '../../lib/log';

type Props = {
  url: string;
  serviceMeta?: MapServiceInfo | null;
  onStatusChange?: (status: 'loading' | 'loaded' | 'error') => void;
  onComputedBounds?: (b: LType.LatLngBounds) => void;
  onlyLayerId?: number; // when provided, show only this sublayer
};

export default function EsriDynamicLayer({ url, serviceMeta, onStatusChange, onComputedBounds, onlyLayerId }: Props) {
  const map = useMap();
  const extentFetchRef = React.useRef<boolean>(false);
  const extentToastRef = React.useRef<boolean>(false);

  useEffect(() => {
    if (!url) return;
    let layer: any | null = null;
    (async () => {
      try {
        onStatusChange?.('loading');
        log.debug('[EsriDynamicLayer] init', { url, onlyLayerId });
        const allLayers: any[] = Array.isArray(serviceMeta?.layers) ? (serviceMeta as any).layers : [];
        const defaultVisible = allLayers.filter((l: any) => l && l.defaultVisibility === true).map((l: any) => l.id);
        const leafLayers = allLayers
          .filter((l: any) => !Array.isArray(l?.subLayerIds) || l.subLayerIds.length === 0)
          .map((l: any) => l.id);
        const visibleLayerIds = typeof onlyLayerId === 'number'
          ? [onlyLayerId]
          : (defaultVisible.length > 0 ? defaultVisible : leafLayers);
        log.debug('[EsriDynamicLayer] visibleLayerIds', visibleLayerIds);
        layer = dynamicMapLayer({
          url,
          useCors: true,
          format: 'png32',
          transparent: true,
          opacity: 1,
          layers: Array.isArray(visibleLayerIds) && visibleLayerIds.length ? visibleLayerIds : undefined,
        } as any);

        layer.addTo(map);
        log.debug('[EsriDynamicLayer] layer added to map');
        // Keep dynamic overlay visually behind feature layers and non-interactive
        try { (layer as any).bringToBack?.(); } catch {}
        try { const c = (layer as any).getContainer?.(); if (c) (c as HTMLElement).style.pointerEvents = 'none'; } catch {}

        if ((layer as any).metadata) {
          await new Promise<void>((resolve) => {
            (layer as any).metadata((err: any, meta: any) => {
              if (!err) {
                const b = extentToBounds(meta?.fullExtent || meta?.initialExtent);
                if (b) { onComputedBounds?.(b); }
              }
              resolve();
            });
          });
        } else if (serviceMeta) {
          const b = extentToBounds((serviceMeta as any)?.fullExtent || (serviceMeta as any)?.initialExtent);
          if (b) { onComputedBounds?.(b); }
        }
        // Fallback: when showing a single sublayer, ask server for 4326 extent
        try {
          if (typeof onlyLayerId === 'number' && !extentFetchRef.current) {
            extentFetchRef.current = true;
            const ext = await fetchLayerExtent4326(`${url.replace(/\/+$/, '')}/${onlyLayerId}`);
            const b2 = ext ? extentToBounds(ext as any) : null;
            if (b2) {
              onComputedBounds?.(b2);
              if (!extentToastRef.current) { extentToastRef.current = true; log.warn('Used server-projected extent (4326) fallback for bounds'); }
            }
            extentFetchRef.current = false;
          }
        } catch { }
        log.debug('[EsriDynamicLayer] status loaded');
        onStatusChange?.('loaded');
      } catch (e) {
        log.error('[EsriDynamicLayer] error creating dynamic layer', e);
        onStatusChange?.('error');
      }
    })();

    return () => { try { if (layer) { map.removeLayer(layer); log.debug('[EsriDynamicLayer] cleanup'); } } catch {} };
  }, [url, serviceMeta, map, onlyLayerId]);

  return null;
}
// end of file
