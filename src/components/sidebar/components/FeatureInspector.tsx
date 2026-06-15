import React from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import CopyButton from '../../ui/CopyButton';
import { getFeatureId, findFeatureById } from '../../../lib/ids';
import { formatAttrValue } from '../../../lib/format';

type Props = {
  featureCollection?: FeatureCollection | null;
  selectedFeatureId?: string | number | null;
  layerName?: string | null;
  onSelectFeature?: (id: string | number | null) => void;
  onFlashFeature?: (id: string | number | null) => void;
  onZoomToFeature?: (id: string | number | null) => void;
  onClose?: () => void;
};

/**
 * Slide-over record inspector. Covers the sidebar (tabs included) when a
 * feature is selected; back/Esc returns to whichever tab was active.
 */
export default function FeatureInspector({
  featureCollection,
  selectedFeatureId,
  layerName,
  onSelectFeature,
  onFlashFeature,
  onZoomToFeature,
  onClose,
}: Props) {
  const selectedFeature = React.useMemo(() => {
    if (!featureCollection || selectedFeatureId == null) return null;
    return findFeatureById(featureCollection as any, selectedFeatureId as any) as Feature | null;
  }, [featureCollection, selectedFeatureId]);

  const open = selectedFeature != null;

  // Keep the last-rendered feature so content stays visible during slide-out
  const lastRef = React.useRef<{ feature: Feature; id: string | number | null } | null>(null);
  if (selectedFeature) lastRef.current = { feature: selectedFeature, id: selectedFeatureId ?? null };
  const display = open ? { feature: selectedFeature, id: selectedFeatureId ?? null } : lastRef.current;

  const features: any[] = featureCollection?.features ?? [];
  const index = selectedFeature ? features.indexOf(selectedFeature) : -1;
  const prevId = index > 0 ? getFeatureId(features[index - 1]) : null;
  const nextId = index >= 0 && index < features.length - 1 ? getFeatureId(features[index + 1]) : null;

  const [tab, setTab] = React.useState<'attrs' | 'json'>('attrs');
  React.useEffect(() => { setTab('attrs'); }, [selectedFeatureId]);

  const props = React.useMemo(() =>
    Object.entries((display?.feature?.properties as Record<string, any>) || {})
      .filter(([k]) => !['__id', '__precision_m', '__zoom'].includes(k)),
    [display?.feature],
  );

  const jsonText = React.useMemo(() =>
    JSON.stringify(display?.feature?.properties ?? {}, null, 2),
    [display?.feature],
  );

  const geomType = (display?.feature?.geometry as any)?.type ?? null;

  const flash = React.useCallback(() => {
    onFlashFeature?.(null);
    setTimeout(() => onFlashFeature?.(selectedFeatureId ?? null), 10);
  }, [onFlashFeature, selectedFeatureId]);

  return (
    <div
      role="dialog"
      aria-label="Feature details"
      aria-hidden={!open}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--panel)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        visibility: open ? 'visible' : 'hidden',
        transition: 'transform 0.18s ease, visibility 0.18s',
      }}
    >
      {/* ── Header ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 8px',
        height: 40,
        borderBottom: '1px solid var(--border)',
        background: 'var(--panel-subtle)',
      }}>
        <button
          type="button"
          onClick={onClose}
          title="Back (Esc)"
          aria-label="Back"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 6, flexShrink: 0,
            border: '1px solid var(--border)', background: 'none',
            color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'none'; }}
        >←</button>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {layerName ?? 'Feature'}
            {display?.id != null
              ? <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 5 }}>#{display.id}</span>
              : null}
          </span>
          {geomType && (
            <span style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>{geomType}</span>
          )}
        </div>

        {/* Prev/next within the loaded features */}
        {index >= 0 && features.length > 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {index + 1} of {features.length}
            </span>
            <button type="button" className="u-btn" disabled={prevId == null}
              title="Previous feature" aria-label="Previous feature"
              style={{ opacity: prevId == null ? 0.4 : 1 }}
              onClick={() => { if (prevId != null) onSelectFeature?.(prevId); }}
            >‹</button>
            <button type="button" className="u-btn" disabled={nextId == null}
              title="Next feature" aria-label="Next feature"
              style={{ opacity: nextId == null ? 0.4 : 1 }}
              onClick={() => { if (nextId != null) onSelectFeature?.(nextId); }}
            >›</button>
          </div>
        ) : null}
      </div>

      {/* ── Tab bar + actions ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {(['attrs', 'json'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: '3px 10px',
              fontSize: 12,
              borderRadius: 4,
              border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--border)'}`,
              background: tab === t ? 'var(--accent-row)' : 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer',
              fontWeight: tab === t ? 600 : 400,
            }}
          >{t === 'attrs' ? 'Attributes' : 'JSON'}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" className="u-btn" onClick={flash} title="Flash on map">Flash</button>
        <button type="button" className="u-btn" onClick={() => onZoomToFeature?.(selectedFeatureId ?? null)} title="Zoom to feature">Zoom</button>
        <CopyButton text={jsonText} />
      </div>

      {/* ── Content ── */}
      <div style={{ flex: '1 1 0%', overflow: 'auto' }}>
        {tab === 'attrs' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {props.length === 0 ? (
                <tr>
                  <td colSpan={2} style={{ padding: '12px 10px', color: 'var(--muted)', fontStyle: 'italic' }}>
                    No attributes
                  </td>
                </tr>
              ) : props.map(([k, v], i) => (
                <tr key={k} style={{ background: i % 2 === 0 ? 'var(--panel)' : 'var(--panel-subtle)' }}>
                  <th style={{
                    textAlign: 'left', padding: '5px 10px',
                    color: 'var(--muted)', fontWeight: 500, fontSize: 11,
                    width: '38%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    borderTop: '1px solid var(--divider-weak)',
                  }}>{k}</th>
                  <td style={{
                    padding: '5px 10px', color: 'var(--text)',
                    borderTop: '1px solid var(--divider-weak)',
                    wordBreak: 'break-word', fontVariantNumeric: 'tabular-nums',
                  }}>
                    {v == null || v === ''
                      ? <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>—</span>
                      : formatAttrValue(v)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <pre style={{
            margin: 0, padding: '10px 12px', fontSize: 11,
            color: 'var(--text)', background: 'var(--panel-subtle)',
            whiteSpace: 'pre', overflowX: 'auto',
          }}>{jsonText}</pre>
        )}
      </div>
    </div>
  );
}
