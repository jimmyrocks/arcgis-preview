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
  // Raw values (lat, lng) and (minX, minY, maxX, maxY) for precise copies
  centerRaw?: string;
  bboxRaw?: string;
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

export default function MoreInfoOverlay({ open, onClose, mouse, zoom, center, bbox, centerRaw, bboxRaw, coordOrder, onChangeCoordOrder, gdal, onChangeGdal, showHeaderButton = true, shareUrl, queryUrl, curl, ogr2ogr }: Props) {
  if (!open) return null;
  // Prefer raw center/bbox when available (always lat,lng and minX,minY,maxX,maxY)
  const rawCenter = centerRaw || center;
  const rawBbox = bboxRaw || bbox;

  // Parse numbers
  const [lat, lng] = (() => {
    try {
      const parts = String(rawCenter || '').split(',').map(s => s.trim());
      if (parts.length !== 2) return [NaN, NaN];
      const a = parseFloat(parts[0]);
      const b = parseFloat(parts[1]);
      return [a, b]; // stored as lat, lng
    } catch { return [NaN, NaN]; }
  })();
  const [minX, minY, maxX, maxY] = (() => {
    try {
      const parts = String(rawBbox || '').split(',').map(s => s.trim());
      if (parts.length !== 4) return [NaN, NaN, NaN, NaN];
      return [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
    } catch { return [NaN, NaN, NaN, NaN]; }
  })();

  // Formats
  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(6) : '');
  const latStr = fmt(lat);
  const lngStr = fmt(lng);
  const wktPoint = (Number.isFinite(lat) && Number.isFinite(lng)) ? `POINT(${lngStr} ${latStr})` : '';
  const wktEnvelope = (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY))
    ? `ENVELOPE(${minX.toFixed(6)}, ${minY.toFixed(6)}, ${maxX.toFixed(6)}, ${maxY.toFixed(6)})`
    : '';
  const geojsonBbox = (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY))
    ? `[${minX.toFixed(6)}, ${minY.toFixed(6)}, ${maxX.toFixed(6)}, ${maxY.toFixed(6)}]`
    : '';

  return (
    <div className="more-info-overlay" style={{ position: 'absolute', left: 10, right: 10, bottom: 10, zIndex: 1500, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, maxHeight: '50vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
      {showHeaderButton ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <FlashButton onClick={onClose} title={'Hide more info'} ariaLabel="Hide more info" style={{ padding: '4px 8px', fontSize: 14, borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-block' }}>▼</span>
            More Info
          </FlashButton>
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: 6, fontSize: 11 }}>
        {/* Quick chips */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <small style={{ color: 'var(--muted)' }}>Quick Copy:</small>
          <CopyButton text={latStr} />
          <span style={{ color: 'var(--muted)' }}>Lat</span>
          <CopyButton text={lngStr} />
          <span style={{ color: 'var(--muted)' }}>Lng</span>
          <CopyButton text={wktPoint} />
          <span style={{ color: 'var(--muted)' }}>WKT POINT</span>
          <CopyButton text={wktEnvelope} />
          <span style={{ color: 'var(--muted)' }}>WKT ENVELOPE</span>
          <CopyButton text={geojsonBbox} />
          <span style={{ color: 'var(--muted)' }}>GeoJSON BBox</span>
        </div>

        {/* Map state */}
        <LabeledCopy label="Zoom" value={String(zoom)} />
        <LabeledCopy label="Center" value={center} />
        <LabeledCopy label="Map" value={bbox} />


        {/* Share & Query: compact inputs for easier copying */}
        {shareUrl ? (
          <LabeledInput label="Share">
            <ReadOnlyInput value={shareUrl} />
            <CopyButton text={shareUrl} />
          </LabeledInput>
        ) : null}
        {queryUrl ? (
          <LabeledInput label="Query URL">
            <ReadOnlyInput value={queryUrl} />
            <CopyButton text={queryUrl} />
          </LabeledInput>
        ) : null}

        {/* Advanced CLI (collapsible) */}
        {(curl || ogr2ogr) ? (
          <details>
            <summary style={{ cursor: 'pointer', color: 'var(--accent)' }}>Advanced: CLI commands</summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
              {curl ? (
                <LabeledInput label="cURL">
                  <CodeScroll>{curl}</CodeScroll>
                  <CopyButton text={curl} />
                </LabeledInput>
              ) : null}
              {ogr2ogr ? (
                <LabeledInput label="ogr2ogr">
                  <CodeScroll>{ogr2ogr}</CodeScroll>
                  <CopyButton text={ogr2ogr} />
                </LabeledInput>
              ) : null}
            </div>
          </details>
        ) : null}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--muted)', minWidth: 56, flex: 'none' }}>{label}:</span>
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        {link ? (
          <a href={value} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', display: 'inline-block' }}>{value}</a>
        ) : code ? (
          <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 11, background: 'var(--panel-subtle)', padding: '2px 4px', borderRadius: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', display: 'inline-block' }}>{value}</code>
        ) : (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', display: 'inline-block' }}>{value}</span>
        )}
      </div>
      <span style={{ flex: 'none' }}>
        <CopyButton text={value} />
      </span>
    </div>
  );
}

// Compact labeled input row for long values (share/query)
function LabeledInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--muted)', minWidth: 56, flex: 'none' }}>{label}:</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 auto', minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}

function ReadOnlyInput({ value }: { value: string }) {
  return (
    <input
      value={value}
      readOnly
      onFocus={(e) => { try { e.currentTarget.select(); } catch {} }}
      onClick={(e) => { try { (e.currentTarget as HTMLInputElement).select(); } catch {} }}
      className="u-input"
      style={{ flex: '1 1 auto', minWidth: 0, width: '100%', padding: '3px 6px', fontSize: 11 }}
    />
  );
}

function CodeScroll({ children }: { children: React.ReactNode }) {
  return (
    <pre style={{ margin: 0, padding: '4px 6px', background: 'var(--panel-subtle)', border: '1px solid var(--border)', borderRadius: 4, maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
      <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 11 }}>{children}</code>
    </pre>
  );
}
