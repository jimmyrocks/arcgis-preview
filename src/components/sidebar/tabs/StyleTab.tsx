import React from 'react';
import type { GeometryStyleOptions } from '../../../lib/styleOptions';

export default function StyleTab({
  mode = 'server',
  options = {},
  geometryType,
  onModeChange,
  onOptionsChange,
}: {
  mode?: 'server' | 'custom';
  options?: GeometryStyleOptions;
  geometryType?: string | null;
  onModeChange?: (mode: 'server' | 'custom') => void;
  onOptionsChange?: (opts: GeometryStyleOptions) => void;
}) {
  const opts = normalize(options);
  const disabled = mode !== 'custom';
  const kind = inferKind(geometryType);

  const update = (partial: Partial<GeometryStyleOptions>) => {
    onOptionsChange?.({ ...opts, ...partial });
  };

  return (
    <div style={{ padding: 8, display: 'grid', gap: 12 }}>
      {kind ? (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Geometry: {kind === 'point' ? 'Point / MultiPoint' : kind === 'line' ? 'Line / MultiLine' : 'Polygon / MultiPolygon'}</div>
      ) : null}
      <div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Renderer</div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 16 }}>
          <input type="radio" name="style-mode" checked={mode === 'server'} onChange={() => onModeChange?.('server')} />
          <span>Server renderer</span>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input type="radio" name="style-mode" checked={mode === 'custom'} onChange={() => onModeChange?.('custom')} />
          <span>Custom style</span>
        </label>
      </div>

      {(kind === 'point' || !kind) && (
      <fieldset style={{ opacity: disabled ? 0.6 : 1.0 }}>
        <legend style={{ fontWeight: 600 }}>Points (circle)</legend>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 8 }}>
          <label htmlFor="ptColor">Stroke color</label>
          <input id="ptColor" type="color" value={opts.point.color} disabled={disabled} onChange={(e) => update({ point: { ...opts.point, color: e.target.value } })} />
          <label htmlFor="ptWeight">Stroke weight (px)</label>
          <input id="ptWeight" type="number" min={0} max={20} step={1} value={opts.point.weight} disabled={disabled} onChange={(e) => update({ point: { ...opts.point, weight: toNumber(e.target.value, 2) } })} />
          <label htmlFor="ptOpacity">Stroke opacity</label>
          <input id="ptOpacity" type="range" min={0} max={1} step={0.05} value={opts.point.opacity} disabled={disabled} onChange={(e) => update({ point: { ...opts.point, opacity: toNumber(e.target.value, 1) } })} />
          <label htmlFor="ptFillColor">Fill color</label>
          <input id="ptFillColor" type="color" value={opts.point.fillColor} disabled={disabled} onChange={(e) => update({ point: { ...opts.point, fillColor: e.target.value } })} />
          <label htmlFor="ptFillOpacity">Fill opacity</label>
          <input id="ptFillOpacity" type="range" min={0} max={1} step={0.05} value={opts.point.fillOpacity} disabled={disabled} onChange={(e) => update({ point: { ...opts.point, fillOpacity: toNumber(e.target.value, 0.2) } })} />
          <label htmlFor="ptRadius">Radius (px)</label>
          <input id="ptRadius" type="number" min={1} max={48} step={1} value={opts.point.radius} disabled={disabled} onChange={(e) => update({ point: { ...opts.point, radius: toNumber(e.target.value, 6) } })} />
        </div>
      </fieldset>
      )}

      {(kind === 'line' || !kind) && (
      <fieldset style={{ opacity: disabled ? 0.6 : 1.0 }}>
        <legend style={{ fontWeight: 600 }}>Lines</legend>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 8 }}>
          <label htmlFor="lnColor">Color</label>
          <input id="lnColor" type="color" value={opts.line.color} disabled={disabled} onChange={(e) => update({ line: { ...opts.line, color: e.target.value } })} />
          <label htmlFor="lnWeight">Weight (px)</label>
          <input id="lnWeight" type="number" min={0} max={20} step={1} value={opts.line.weight} disabled={disabled} onChange={(e) => update({ line: { ...opts.line, weight: toNumber(e.target.value, 2) } })} />
          <label htmlFor="lnOpacity">Opacity</label>
          <input id="lnOpacity" type="range" min={0} max={1} step={0.05} value={opts.line.opacity} disabled={disabled} onChange={(e) => update({ line: { ...opts.line, opacity: toNumber(e.target.value, 1) } })} />
          <label htmlFor="lnDash">Dash array</label>
          <input id="lnDash" type="text" placeholder="e.g. 5,10" value={opts.line.dashArray} disabled={disabled} onChange={(e) => update({ line: { ...opts.line, dashArray: e.target.value } })} />
          <label htmlFor="lnDashOffset">Dash offset</label>
          <input id="lnDashOffset" type="text" placeholder="e.g. 10" value={opts.line.dashOffset} disabled={disabled} onChange={(e) => update({ line: { ...opts.line, dashOffset: e.target.value } })} />
          <label htmlFor="lnCap">Line cap</label>
          <select id="lnCap" value={opts.line.lineCap} disabled={disabled} onChange={(e) => update({ line: { ...opts.line, lineCap: e.target.value as any } })}>
            <option value="butt">butt</option>
            <option value="round">round</option>
            <option value="square">square</option>
          </select>
          <label htmlFor="lnJoin">Line join</label>
          <select id="lnJoin" value={opts.line.lineJoin} disabled={disabled} onChange={(e) => update({ line: { ...opts.line, lineJoin: e.target.value as any } })}>
            <option value="miter">miter</option>
            <option value="round">round</option>
            <option value="bevel">bevel</option>
          </select>
        </div>
      </fieldset>
      )}

      {(kind === 'polygon' || !kind) && (
      <fieldset style={{ opacity: disabled ? 0.6 : 1.0 }}>
        <legend style={{ fontWeight: 600 }}>Polygons</legend>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: 8 }}>
          <label htmlFor="pgColor">Stroke color</label>
          <input id="pgColor" type="color" value={opts.polygon.color} disabled={disabled} onChange={(e) => update({ polygon: { ...opts.polygon, color: e.target.value } })} />
          <label htmlFor="pgWeight">Stroke weight (px)</label>
          <input id="pgWeight" type="number" min={0} max={20} step={1} value={opts.polygon.weight} disabled={disabled} onChange={(e) => update({ polygon: { ...opts.polygon, weight: toNumber(e.target.value, 2) } })} />
          <label htmlFor="pgOpacity">Stroke opacity</label>
          <input id="pgOpacity" type="range" min={0} max={1} step={0.05} value={opts.polygon.opacity} disabled={disabled} onChange={(e) => update({ polygon: { ...opts.polygon, opacity: toNumber(e.target.value, 1) } })} />
          <label htmlFor="pgDash">Dash array</label>
          <input id="pgDash" type="text" placeholder="e.g. 4,8" value={opts.polygon.dashArray} disabled={disabled} onChange={(e) => update({ polygon: { ...opts.polygon, dashArray: e.target.value } })} />
          <label htmlFor="pgFillColor">Fill color</label>
          <input id="pgFillColor" type="color" value={opts.polygon.fillColor} disabled={disabled} onChange={(e) => update({ polygon: { ...opts.polygon, fillColor: e.target.value } })} />
          <label htmlFor="pgFillOpacity">Fill opacity</label>
          <input id="pgFillOpacity" type="range" min={0} max={1} step={0.05} value={opts.polygon.fillOpacity} disabled={disabled} onChange={(e) => update({ polygon: { ...opts.polygon, fillOpacity: toNumber(e.target.value, 0.2) } })} />
          <label htmlFor="pgDashOffset">Dash offset</label>
          <input id="pgDashOffset" type="text" placeholder="e.g. 8" value={opts.polygon.dashOffset} disabled={disabled} onChange={(e) => update({ polygon: { ...opts.polygon, dashOffset: e.target.value } })} />
          <label htmlFor="pgFillRule">Fill rule</label>
          <select id="pgFillRule" value={opts.polygon.fillRule} disabled={disabled} onChange={(e) => update({ polygon: { ...opts.polygon, fillRule: e.target.value as any } })}>
            <option value="evenodd">evenodd</option>
            <option value="nonzero">nonzero</option>
          </select>
        </div>
      </fieldset>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => onOptionsChange?.({
            point: { stroke: true, color: '#3388ff', weight: 2, opacity: 1, fill: true, fillColor: '#3388ff', fillOpacity: 0.2, radius: 6 },
            line: { stroke: true, color: '#3388ff', weight: 2, opacity: 1, lineCap: 'round', lineJoin: 'round', dashArray: '', dashOffset: '' },
            polygon: { stroke: true, color: '#3388ff', weight: 2, opacity: 1, lineCap: 'round', lineJoin: 'round', dashArray: '', dashOffset: '', fill: true, fillColor: '#3388ff', fillOpacity: 0.2, fillRule: 'evenodd' },
          })}
          disabled={disabled}
          title="Reset to defaults"
          style={{
            padding: '6px 8px',
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: disabled ? 'var(--panel-strong)' : 'var(--panel-subtle)',
            color: disabled ? 'var(--muted)' : 'var(--text)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'background-color 160ms ease, border-color 160ms ease, color 160ms ease',
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.background = 'var(--hover)';
            }
          }}
          onMouseLeave={(e) => {
            if (!disabled) {
              e.currentTarget.style.background = 'var(--panel-subtle)';
            }
          }}
        >Reset</button>
      </div>
    </div>
  );
}

function normalize(options: GeometryStyleOptions): Required<GeometryStyleOptions> & GeometryStyleOptions {
  return {
    point: {
      stroke: options.point?.stroke !== false,
      color: options.point?.color ?? '#3388ff',
      weight: clampNum(options.point?.weight ?? 2, 0, 50),
      opacity: clamp01(options.point?.opacity ?? 1),
      fill: options.point?.fill !== false,
      fillColor: options.point?.fillColor ?? options.point?.color ?? '#3388ff',
      fillOpacity: clamp01(options.point?.fillOpacity ?? 0.2),
      radius: clampNum(options.point?.radius ?? 6, 1, 100),
    },
    line: {
      stroke: options.line?.stroke !== false,
      color: options.line?.color ?? '#3388ff',
      weight: clampNum(options.line?.weight ?? 2, 0, 50),
      opacity: clamp01(options.line?.opacity ?? 1),
      lineCap: (options.line?.lineCap as any) || 'round',
      lineJoin: (options.line?.lineJoin as any) || 'round',
      dashArray: options.line?.dashArray ?? '',
      dashOffset: options.line?.dashOffset ?? '',
    },
    polygon: {
      stroke: options.polygon?.stroke !== false,
      color: options.polygon?.color ?? '#3388ff',
      weight: clampNum(options.polygon?.weight ?? 2, 0, 50),
      opacity: clamp01(options.polygon?.opacity ?? 1),
      lineCap: (options.polygon?.lineCap as any) || 'round',
      lineJoin: (options.polygon?.lineJoin as any) || 'round',
      dashArray: options.polygon?.dashArray ?? '',
      dashOffset: options.polygon?.dashOffset ?? '',
      fill: options.polygon?.fill !== false,
      fillColor: options.polygon?.fillColor ?? options.polygon?.color ?? '#3388ff',
      fillOpacity: clamp01(options.polygon?.fillOpacity ?? 0.2),
      fillRule: (options.polygon?.fillRule as any) || 'evenodd',
    },
  } as any;
}

function inferKind(geometryType?: string | null): 'point' | 'line' | 'polygon' | null {
  const g = String(geometryType || '').toLowerCase();
  if (!g) return null;
  if (g.includes('point')) return 'point';
  if (g.includes('line')) return 'line';
  if (g.includes('poly')) return 'polygon';
  return null;
}

function clamp01(n: number): number { if (!Number.isFinite(n)) return 0; return Math.max(0, Math.min(1, n)); }
function clampNum(n: number, min: number, max: number): number { if (!Number.isFinite(n)) return min; return Math.max(min, Math.min(max, n)); }
function toNumber(v: string, d: number): number { const n = Number(v); return Number.isFinite(n) ? n : d; }
