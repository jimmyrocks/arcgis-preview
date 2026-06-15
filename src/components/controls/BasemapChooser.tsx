import React from 'react';

type BaseKey =
  | 'carto_positron'
  | 'usgs_topo'
  | 'usgs_imagery_topo'
  | 'usgs_imagery'
  | 'osm'
  | 'carto_dark'
  | 'carto_voyager'
  | 'esri_worldimagery'
  | 'opentopomap';

export default function BasemapChooser({ value, onChange }: { value: BaseKey | any; onChange?: (b: any) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="basemap-chooser">
      <ChooserUI
        value={value}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        onChange={(b) => { onChange?.(b); setOpen(false); }}
      />
    </div>
  );
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
  return {
    carto_positron: { label: 'CARTO Positron', thumb: 'https://a.basemaps.cartocdn.com/light_all/3/2/3.png' },
    usgs_topo: { label: 'USGS Topo', thumb: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/3/3/2' },
    usgs_imagery_topo: { label: 'USGS Imagery Topo', thumb: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/3/3/2' },
    usgs_imagery: { label: 'USGS Imagery', thumb: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/3/3/2' },
    osm: { label: 'OpenStreetMap', thumb: 'https://a.tile.openstreetmap.org/3/2/3.png' },
    carto_dark: { label: 'CARTO Dark', thumb: 'https://a.basemaps.cartocdn.com/dark_all/3/2/3.png' },
    carto_voyager: { label: 'CARTO Voyager', thumb: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/3/2/3.png' },
    esri_worldimagery: { label: 'Esri World Imagery', thumb: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/3/2' },
    opentopomap: { label: 'OpenTopoMap', thumb: 'https://a.tile.opentopomap.org/3/2/3.png' },
  };
}

function guessThumb(urlTemplate: string): string | undefined {
  try {
    return urlTemplate.replace('{z}', '3').replace('{x}', '2').replace('{y}', '3').replace('{r}', '').replace('{s}', 'a');
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
