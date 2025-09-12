import React from 'react';
import FlashButton from './ui/FlashButton';
import CopyButton from './ui/CopyButton';

type Props = {
  open: boolean;
  onClose: () => void;
  mouse: string;
  zoom: number;
  center: string;
  bbox: string;
  coordOrder: 'lng-lat' | 'lat-lng';
  onChangeCoordOrder: (o: 'lng-lat' | 'lat-lng') => void;
  gdal: boolean;
  onChangeGdal: (g: boolean) => void;
  showHeaderButton?: boolean;
  shareUrl?: string;
  queryUrl?: string;
  curl?: string;
  ogr2ogr?: string;
};

export default function MoreInfoOverlay({ open, onClose, mouse, zoom, center, bbox, coordOrder, onChangeCoordOrder, gdal, onChangeGdal, showHeaderButton = true, shareUrl, queryUrl, curl, ogr2ogr }: Props) {
  if (!open) return null;
  return (
    <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, zIndex: 1500, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
      {showHeaderButton ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <FlashButton onClick={onClose} title={'Hide more info'} ariaLabel="Hide more info" style={{ padding: '4px 8px', fontSize: 14, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block' }}>▼</span>
            More Info
          </FlashButton>
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
        <LabeledCopy label="Mouse" value={mouse} />
        <LabeledCopy label="Zoom" value={String(zoom)} />
        <LabeledCopy label="Center" value={center} />
        <LabeledCopy label="Map" value={bbox} />
        {shareUrl ? <LabeledCopy label="Share" value={shareUrl} link /> : null}
        {queryUrl ? <LabeledCopy label="Query URL" value={queryUrl} link /> : null}
        {curl ? <LabeledCopy label="cURL" value={curl} code /> : null}
        {ogr2ogr ? <LabeledCopy label="ogr2ogr" value={ogr2ogr} code /> : null}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6 }}>
          <label style={{ color: 'var(--muted)' }}>
            <input type="radio" name="coord-order" checked={coordOrder === 'lng-lat'} onChange={() => onChangeCoordOrder('lng-lat')} /> Lng / Lat
          </label>
          <label style={{ color: 'var(--muted)' }}>
            <input type="radio" name="coord-order" checked={coordOrder === 'lat-lng'} onChange={() => onChangeCoordOrder('lat-lng')} /> Lat / Lng
          </label>
          <label style={{ color: 'var(--muted)' }}>
            <input type="checkbox" checked={gdal} onChange={(e) => onChangeGdal(e.target.checked)} /> GDAL
          </label>
        </div>
        <span>For better bboxes try <a href="http://bboxfinder.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>bboxfinder.com</a></span>
      </div>
    </div>
  );
}

function LabeledCopy({ label, value, link = false, code = false }: { label: string; value: string; link?: boolean; code?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--muted)', minWidth: 60 }}>{label}:</span>
      {link ? (
        <a href={value} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520 }}>{value}</a>
      ) : code ? (
        <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 11, background: 'var(--panel-subtle)', padding: '2px 4px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 520, display: 'inline-block' }}>{value}</code>
      ) : (
        <span>{value}</span>
      )}
      <CopyButton text={value} />
    </div>
  );
}
