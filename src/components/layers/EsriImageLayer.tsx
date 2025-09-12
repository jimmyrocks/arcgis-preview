import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { imageMapLayer } from 'esri-leaflet';
import type LType from 'leaflet';
import { extentToBounds } from '../../lib/geometry';

type Props = {
  url: string;
  onStatusChange?: (status: 'loading' | 'loaded' | 'error') => void;
  onComputedBounds?: (b: LType.LatLngBounds) => void;
};

export default function EsriImageLayer({ url, onStatusChange, onComputedBounds }: Props) {
  const map = useMap();
  useEffect(() => {
    if (!url) return;
    let layer: any | null = null;
    (async () => {
      try {
        onStatusChange?.('loading');
        layer = imageMapLayer({ url });
        layer.addTo(map);
        try { (layer as any).bringToFront?.(); } catch {}
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
        }
        onStatusChange?.('loaded');
      } catch {
        onStatusChange?.('error');
      }
    })();
    return () => { try { if (layer) map.removeLayer(layer); } catch {} };
  }, [url, map]);
  return null;
}

