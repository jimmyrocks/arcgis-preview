import React from 'react';
import {
  BASEMAP_CHOICES,
  type BasemapKey,
  type BasemapSelection
} from '../../lib/basemaps';

export default function BasemapChooser({ value, onChange }: { value: BasemapSelection; onChange?: (b: BasemapSelection) => void }) {
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

function ChooserUI({ value, open, onToggle, onChange }: { value: BasemapSelection; open: boolean; onToggle: () => void; onChange: (b: BasemapSelection) => void }) {
  const cfg = getBasemaps();
  const active = typeof value === 'string' ? cfg[value as BasemapKey] : undefined;
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
              onClick={() => onChange(k as BasemapKey)} title={v.label}>
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

function getBasemaps(): Record<BasemapKey, { label: string; thumb: string }> {
  return Object.fromEntries(
    BASEMAP_CHOICES.map(({ key, label, thumb }) => [key, { label, thumb }])
  ) as Record<BasemapKey, { label: string; thumb: string }>;
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
