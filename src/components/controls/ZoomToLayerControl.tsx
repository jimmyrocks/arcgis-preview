import React from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

type Props = {
  bounds: L.LatLngBounds | null;
};

export default function ZoomToLayerControl({ bounds }: Props) {
  const map = useMap();
  const controlRef = React.useRef<any>(null);
  const buttonRef = React.useRef<HTMLAnchorElement | null>(null);

  // Only create/show the control when bounds exist
  React.useEffect(() => {
    if (!bounds) return; // no extent yet -> no control
    const C = (L as any).Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        const container = (L as any).DomUtil.create('div', 'leaflet-control leaflet-bar');
        const a = (L as any).DomUtil.create('a', '', container);
        a.href = '#';
        a.title = 'Zoom to layer extent';
        a.setAttribute('role', 'button');
        a.style.width = '28px';
        a.style.height = '28px';
        a.style.display = 'flex';
        a.style.alignItems = 'center';
        a.style.justifyContent = 'center';
        a.innerHTML = iconSvg;
        buttonRef.current = a as HTMLAnchorElement;
        return container;
      },
    });
    const ctl = new C();
    controlRef.current = ctl;
    map.addControl(ctl);

    const btn = buttonRef.current;
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      if (!bounds) return;
      try { map.fitBounds(bounds.pad(0.1), { maxZoom: 12 }); } catch {}
    };
    if (btn) btn.addEventListener('click', onClick);

    return () => {
      try { if (btn) btn.removeEventListener('click', onClick); } catch {}
      try { map.removeControl(ctl); } catch {}
      buttonRef.current = null;
      controlRef.current = null;
    };
  }, [map, bounds]);

  return null;
}

const iconSvg = `
<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <!-- four corner brackets -->
    <path d="M4 9V5h4"/>
    <path d="M20 9V5h-4"/>
    <path d="M4 15v4h4"/>
    <path d="M20 15v4h-4"/>
    <!-- inner rectangle representing layer extent -->
    <rect x="7" y="8" width="10" height="8" rx="1"/>
  </g>
</svg>`;
