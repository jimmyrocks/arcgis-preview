import React from 'react';
import type { FeatureCollection } from 'geojson';
import type { AttributeStyleRule, CategoryStop, NumericStop } from '../../../lib/styleOptions';
import { QUALITATIVE_PALETTES, SEQUENTIAL_PALETTES, type Palette } from '../../../lib/colorPalettes';
import { classifyCategorical, classifyNumeric, inferSubMode, interpolatePaletteColor } from '../../../lib/classifyField';

type FieldMeta = { name: string; type?: string; alias?: string };

type Props = {
  fields?: FieldMeta[];
  rule: AttributeStyleRule | undefined;
  paletteId?: string;
  featureCollection?: FeatureCollection;
  onRuleChange: (rule: AttributeStyleRule, meta?: { paletteId?: string }) => void;
  geometryType?: string | null;
};

export default function AttributeStyleEditor({ fields, rule, paletteId, featureCollection, onRuleChange }: Props) {
  const features = featureCollection?.features ?? [];
  const hasData = features.length > 0;
  const fieldList = fields ?? [];

  // Sort: numeric fields first, then string/other — easier to find useful fields
  const sortedFields = React.useMemo(() => sortFields(fieldList), [fieldList]);

  // Track which palette is active (instead of inferring from stop colors, which breaks on manual edits)
  const defaultPaletteId = rule?.kind === 'numeric' ? SEQUENTIAL_PALETTES[0].id : QUALITATIVE_PALETTES[0].id;
  const [localPaletteId, setLocalPaletteId] = React.useState<string>(paletteId || defaultPaletteId);
  const activePaletteId = paletteId || localPaletteId;

  React.useEffect(() => {
    if (paletteId) setLocalPaletteId(paletteId);
  }, [paletteId]);

  function setActivePaletteId(nextPaletteId: string) {
    setLocalPaletteId(nextPaletteId);
  }

  // Auto-init: whenever rule is absent but data+fields exist, classify the first field.
  // This also fires after Reset (which sets rule → undefined).
  const ruleAbsent = rule === undefined;
  React.useEffect(() => {
    if (!ruleAbsent || !hasData || sortedFields.length === 0) return;
    const first = sortedFields[0];
    const kind = inferSubMode(first.type);
    const pid = kind === 'numeric' ? SEQUENTIAL_PALETTES[0].id : QUALITATIVE_PALETTES[0].id;
    setActivePaletteId(pid);
    autoClassify(first.name, first.type, features, onRuleChange, pid);
  }, [ruleAbsent, hasData, sortedFields.length]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFieldChange(name: string) {
    const meta = sortedFields.find(f => f.name === name);
    const kind = inferSubMode(meta?.type);
    const pid = kind === 'numeric' ? SEQUENTIAL_PALETTES[0].id : QUALITATIVE_PALETTES[0].id;
    setActivePaletteId(pid);
    autoClassify(name, meta?.type, features, onRuleChange, pid);
  }

  function handleKindToggle(kind: 'categorical' | 'numeric') {
    if (!rule) return;
    const defaultPalette = kind === 'categorical' ? QUALITATIVE_PALETTES[0] : SEQUENTIAL_PALETTES[0];
    setActivePaletteId(defaultPalette.id);
    if (kind === 'categorical') {
      const stops = hasData
        ? classifyCategorical(features as any, rule.field, defaultPalette)
        : [{ value: null, color: '#aaaaaa', label: 'Other / No data', enabled: true }];
      onRuleChange({ kind: 'categorical', field: rule.field, channel: 'color', stops, fallbackColor: '#aaaaaa' }, { paletteId: defaultPalette.id });
    } else {
      const stops = hasData
        ? classifyNumeric(features as any, rule.field, defaultPalette)
        : [{ value: 0, color: defaultPalette.colors[0] }, { value: 1, color: defaultPalette.colors[defaultPalette.colors.length - 1] }];
      onRuleChange({ kind: 'numeric', field: rule.field, channel: 'color', stops, fallbackColor: defaultPalette.colors[0] }, { paletteId: defaultPalette.id });
    }
  }

  function handlePaletteChange(palette: Palette) {
    if (!rule) return;
    setActivePaletteId(palette.id);
    if (rule.kind === 'categorical') {
      const stops = rule.stops.map((s, i) => {
        if (s.value === null) return s; // keep "Other" stop color as-is
        return { ...s, color: palette.colors[i % palette.colors.length] };
      });
      onRuleChange({ ...rule, stops }, { paletteId: palette.id });
    } else {
      const stops = rule.stops.map((s, i) => {
        const t = rule.stops.length > 1 ? i / (rule.stops.length - 1) : 0;
        return { ...s, color: interpolatePaletteColor(palette.colors, t) };
      });
      onRuleChange({ ...rule, stops, fallbackColor: palette.colors[0] }, { paletteId: palette.id });
    }
  }

  function handleReclassify() {
    if (!rule || !hasData) return;
    const palettes = rule.kind === 'categorical' ? QUALITATIVE_PALETTES : SEQUENTIAL_PALETTES;
    const palette = palettes.find(p => p.id === activePaletteId) ?? palettes[0];
    if (rule.kind === 'categorical') {
      onRuleChange({ ...rule, stops: classifyCategorical(features as any, rule.field, palette) }, { paletteId: palette.id });
    } else {
      const stops = classifyNumeric(features as any, rule.field, palette);
      onRuleChange({ ...rule, stops, fallbackColor: palette.colors[0] }, { paletteId: palette.id });
    }
  }

  if (!hasData) {
    return <div style={{ padding: '12px 0', color: 'var(--muted)', fontSize: 12 }}>Load a layer to style by attribute.</div>;
  }

  const palettes = rule?.kind === 'categorical' ? QUALITATIVE_PALETTES : SEQUENTIAL_PALETTES;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Field picker */}
      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', alignItems: 'center', gap: 8 }}>
        <label className="u-label">Field</label>
        <select
          value={rule?.field ?? ''}
          onChange={e => handleFieldChange(e.target.value)}
          style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' }}
        >
          {sortedFields.length === 0 && <option value="">No fields</option>}
          {sortedFields.map(f => (
            <option key={f.name} value={f.name}>
              {f.alias && f.alias !== f.name ? `${f.alias} (${f.name})` : f.name}
            </option>
          ))}
        </select>
      </div>

      {/* Sub-mode toggle */}
      {rule && (
        <div style={{ display: 'flex', gap: 6 }}>
          {(['categorical', 'numeric'] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => handleKindToggle(k)}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: rule.kind === k ? 'var(--accent, #5b8cff)' : 'var(--panel-subtle)',
                color: rule.kind === k ? '#fff' : 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {k === 'categorical' ? 'Categorical' : 'Graduated'}
            </button>
          ))}
        </div>
      )}

      {/* Palette picker — 2-column grid */}
      {rule && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5 }}>
            <span className="u-label">Color palette</span>
            <a
              href="https://colorbrewer2.org"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 9, color: 'var(--muted)', textDecoration: 'none' }}
              title="Palettes from ColorBrewer 2.0 — colorbrewer2.org"
            >
              ColorBrewer 2.0
            </a>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {palettes.map(p => (
              <button
                key={p.id}
                type="button"
                title={p.label}
                onClick={() => handlePaletteChange(p)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 3,
                  padding: '4px 6px',
                  borderRadius: 4,
                  border: p.id === activePaletteId ? '2px solid var(--accent, #5b8cff)' : '1px solid var(--border)',
                  background: 'var(--panel)',
                  cursor: 'pointer',
                }}
              >
                <PaletteSwatchRow colors={p.colors} />
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Class list */}
      {rule?.kind === 'categorical' && (
        <CategoricalClassList rule={rule} onRuleChange={onRuleChange} />
      )}
      {rule?.kind === 'numeric' && (
        <NumericClassList rule={rule} onRuleChange={onRuleChange} />
      )}

      {/* Re-classify button */}
      {rule && (
        <button
          type="button"
          onClick={handleReclassify}
          disabled={!hasData}
          style={{
            padding: '5px 10px',
            fontSize: 11,
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'var(--panel-subtle)',
            color: 'var(--muted)',
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}
        >
          Re-classify from loaded data
        </button>
      )}
    </div>
  );
}

function CategoricalClassList({ rule, onRuleChange }: { rule: AttributeStyleRule & { kind: 'categorical' }; onRuleChange: (r: AttributeStyleRule) => void }) {
  function updateStop(i: number, patch: Partial<CategoryStop>) {
    const stops = rule.stops.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    onRuleChange({ ...rule, stops });
  }

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div className="u-label">Classes</div>
      <div style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: 3 }}>
        {rule.stops.map((stop, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: stop.enabled ? 1 : 0.45 }}>
            <input
              type="color"
              value={stop.color}
              onChange={e => updateStop(i, { color: e.target.value })}
              style={{ width: 22, height: 22, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 3, background: 'none' }}
              title="Change color"
            />
            <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)', display: 'flex', gap: 4, alignItems: 'baseline' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {stop.value === null ? (stop.label ?? 'Other / No data') : String(stop.value)}
              </span>
              {stop.count != null && (
                <span style={{ color: 'var(--muted)', fontSize: 10, flexShrink: 0 }}>({stop.count.toLocaleString()})</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => updateStop(i, { enabled: !stop.enabled })}
              title={stop.enabled ? 'Hide this class' : 'Show this class'}
              style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--muted)', cursor: 'pointer' }}
            >
              {stop.enabled ? 'on' : 'off'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NumericClassList({ rule, onRuleChange }: { rule: AttributeStyleRule & { kind: 'numeric' }; onRuleChange: (r: AttributeStyleRule) => void }) {
  function updateStop(i: number, patch: Partial<NumericStop>) {
    const stops = rule.stops.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    onRuleChange({ ...rule, stops });
  }

  const last = rule.stops.length - 1;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div className="u-label">Color ramp</div>
      <div style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: 3 }}>
        {rule.stops.map((stop, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="color"
              value={stop.color}
              onChange={e => updateStop(i, { color: e.target.value })}
              style={{ width: 22, height: 22, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 3, background: 'none' }}
              title="Change color"
            />
            <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 26, flexShrink: 0 }}>
              {i === 0 ? 'min' : i === last ? 'max' : ''}
            </span>
            <span style={{ fontSize: 11, flex: 1, color: 'var(--text)' }}>{formatNum(stop.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaletteSwatchRow({ colors }: { colors: string[] }) {
  const display = colors.slice(0, 8);
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {display.map((c, i) => (
        <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: c }} />
      ))}
    </div>
  );
}

function autoClassify(
  fieldName: string,
  fieldType: string | undefined,
  features: any[],
  onRuleChange: (r: AttributeStyleRule, meta?: { paletteId?: string }) => void,
  paletteId?: string,
) {
  const kind = inferSubMode(fieldType);
  if (kind === 'categorical') {
    const palette = QUALITATIVE_PALETTES[0];
    onRuleChange({ kind: 'categorical', field: fieldName, channel: 'color', stops: classifyCategorical(features, fieldName, palette), fallbackColor: '#aaaaaa' }, { paletteId: paletteId || palette.id });
  } else {
    const palette = SEQUENTIAL_PALETTES[0];
    const stops = classifyNumeric(features, fieldName, palette);
    onRuleChange({ kind: 'numeric', field: fieldName, channel: 'color', stops, fallbackColor: palette.colors[0] }, { paletteId: paletteId || palette.id });
  }
}

function sortFields(fields: FieldMeta[]): FieldMeta[] {
  return [...fields].sort((a, b) => fieldSortWeight(a.type) - fieldSortWeight(b.type));
}

function fieldSortWeight(type?: string): number {
  if (!type) return 2;
  const t = type.toLowerCase();
  if (t.includes('integer') || t.includes('double') || t.includes('single') || t.includes('float') || t.includes('small')) return 0;
  if (t.includes('string') || t.includes('date') || t.includes('guid')) return 1;
  return 2;
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
