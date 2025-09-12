import React from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { createRoot } from 'react-dom/client';

type BaseKey = 'usgs_topo' | 'usgs_imagery_topo' | 'usgs_imagery' | 'osm' | 'carto_positron' | 'carto_dark' | 'carto_voyager' | 'esri_worldimagery' | 'opentopomap';

export default function BasemapChooser({ value, onChange }: { value: BaseKey | any; onChange?: (b: any) => void }) {
  const map = useMap();
  const controlRef = React.useRef<any>(null);
  const rootRef = React.useRef<ReturnType<typeof createRoot> | null>(null);
  const openRef = React.useRef(false);

  React.useEffect(() => {
    const C = (L as any).Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        const container = (L as any).DomUtil.create('div', 'leaflet-control basemap-chooser');
        (L as any).DomEvent.disableClickPropagation(container);
        (L as any).DomEvent.disableScrollPropagation(container);
        return container;
      },
    });
    const ctl = new C();
    controlRef.current = ctl;
    map.addControl(ctl);
    rootRef.current = createRoot(ctl.getContainer());
    const render = () => {
      rootRef.current?.render(
        <ChooserUI value={value} onChange={(b) => { onChange?.(b); openRef.current = false; render(); }} open={openRef.current} onToggle={() => { openRef.current = !openRef.current; render(); }} />
      );
    };
    render();
    return () => {
      try { rootRef.current?.unmount(); } catch {}
      try { map.removeControl(ctl); } catch {}
      rootRef.current = null;
      controlRef.current = null;
    };
  }, [map]);

  React.useEffect(() => {
    // Re-render on external value change
    if (!rootRef.current || !controlRef.current) return;
    const render = () => {
      rootRef.current?.render(
        <ChooserUI value={value} onChange={(b) => { onChange?.(b); openRef.current = false; render(); }} open={openRef.current} onToggle={() => { openRef.current = !openRef.current; render(); }} />
      );
    };
    render();
  }, [value]);

  return null;
}

function ChooserUI({ value, open, onToggle, onChange }: { value: BaseKey | any; open: boolean; onToggle: () => void; onChange: (b: any) => void }) {
  const cfg = getBasemaps();
  const active = typeof value === 'string' ? cfg[value as BaseKey] : undefined;
  const label = active?.label || (typeof value === 'object' ? 'Custom' : 'Basemap');
  const thumb = active?.thumb || (typeof value === 'object' && typeof value.url === 'string' ? guessThumb(value.url) : undefined);
  return (
    <div className={`bm-ctl${open ? ' is-open' : ''}`}>
      <button className="bm-toggle" title="Change basemap" aria-expanded={open} onClick={onToggle}>
        {thumb ? <img src={thumb} alt="" width={18} height={18} /> : null}
        <span>{label}</span>
      </button>
      {open && (
        <div className="bm-panel" role="menu">
          {Object.entries(cfg).map(([k, v]) => (
            <button key={k} className={`bm-option${value === k ? ' is-active' : ''}`} role="menuitemradio" aria-checked={value === k}
              onClick={() => onChange(k as BaseKey)} title={v.label}>
              <img src={v.thumb} alt="" width={48} height={48} />
              <span>{v.label}</span>
            </button>
          ))}
          <div className="bm-custom">
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Custom tile URL</div>
            <CustomBasemapForm onSubmit={(u,a) => onChange({ key: 'custom', url: u, attribution: a })} />
          </div>
        </div>
      )}
    </div>
  );
}

function getBasemaps(): Record<BaseKey, { label: string; thumb: string }> {
  // pick representative tiles for small thumbnails
  return {
    usgs_topo: { label: 'USGS Topo', thumb: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/3/3/2' },
    usgs_imagery_topo: { label: 'USGS Imagery Topo', thumb: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/3/3/2' },
    usgs_imagery: { label: 'USGS Imagery', thumb: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/3/3/2' },
    osm: { label: 'OpenStreetMap', thumb: 'https://a.tile.openstreetmap.org/3/2/3.png' },
    carto_positron: { label: 'CARTO Positron', thumb: 'https://a.basemaps.cartocdn.com/light_all/3/2/3.png' },
    carto_dark: { label: 'CARTO Dark', thumb: 'https://a.basemaps.cartocdn.com/dark_all/3/2/3.png' },
    carto_voyager: { label: 'CARTO Voyager', thumb: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/3/2/3.png' },
    esri_worldimagery: { label: 'Esri World Imagery', thumb: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/3/2' },
    opentopomap: { label: 'OpenTopoMap', thumb: 'https://a.tile.opentopomap.org/3/2/3.png' },
  };
}

function guessThumb(urlTemplate: string): string | undefined {
  try {
    let u = urlTemplate.replace('{z}', '3').replace('{x}', '2').replace('{y}', '3').replace('{r}', '').replace('{s}', 'a');
    return u;
  } catch { return undefined; }
}

function CustomBasemapForm({ onSubmit }: { onSubmit: (url: string, attribution: string) => void }) {
  const [url, setUrl] = React.useState('');
  const [attr, setAttr] = React.useState('');
  return (
    <form className="bm-form" onSubmit={(e) => { e.preventDefault(); if (!url.trim()) return; onSubmit(url.trim(), attr.trim()); }}>
      <input className="u-input" placeholder="https://{s}.tile.server/{z}/{x}/{y}.png" value={url} onChange={(e) => setUrl(e.target.value)} />
      <input className="u-input" placeholder="Attribution (optional)" value={attr} onChange={(e) => setAttr(e.target.value)} />
      <button type="submit" className="u-btn" style={{ width: '100%' }}>Use custom</button>
    </form>
  );
}
