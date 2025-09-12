import L from 'leaflet';
import type { Geometry, LineString, MultiLineString } from 'geojson';

export type HitCallbacks = {
  onClick: (id: string | number) => void;
};

export type HitOverlayManager = {
  addLine: (geometry: LineString | MultiLineString, id: string | number, baseLayer?: L.Layer) => void;
  destroy: () => void;
};

export function createHitOverlayManager(map: L.Map, { onClick }: HitCallbacks): HitOverlayManager {
  const hitLayers: L.Layer[] = [];
  // No point hover/click helper — rely on native feature click.

  return {
    addLine: (geometry: LineString | MultiLineString, id: string | number, baseLayer?: L.Layer) => {
      try {
        const hit = (L as any).geoJSON({ type: 'Feature', geometry, properties: { __id: id } }, {
          style: { color: '#000', weight: 14, opacity: 0.001, fillOpacity: 0 },
          interactive: true,
          bubblingMouseEvents: false,
        });
        hit.on('click', (ev: unknown) => {
          try { (L as any).DomEvent?.stop?.((ev as any)?.originalEvent); } catch { }
          onClick(id);
          try { (baseLayer as any)?.openPopup?.(); } catch {}
        });
        hit.addTo(map);
        try { (hit as any).bringToFront?.(); } catch {}
        hitLayers.push(hit as any);
      } catch {}
    },
    destroy: () => {
      try {
        hitLayers.forEach((h: any) => {
          try {
            if (h && typeof h.remove === 'function' && typeof h.getPane !== 'function') {
              h.remove();
            } else {
              map.removeLayer(h);
            }
          } catch {}
        });
      } catch {}
    }
  };
}
