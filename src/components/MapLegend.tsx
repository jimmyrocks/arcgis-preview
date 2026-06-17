import React from 'react';
import type { AttributeStyleOptions, AttributeStyleRule, GeometryStyleOptions, StyleMode } from '../lib/styleOptions';
import { DEFAULT_POINT_ICON_ID, POINT_ICON_OPTIONS, defaultStyleOptions } from '../lib/styleOptions';

type FieldMeta = { name?: string; alias?: string; type?: string };

type Props = {
  mode: StyleMode;
  options?: GeometryStyleOptions;
  attributeStyle?: AttributeStyleOptions;
  geometryType?: string | null;
  layerName?: string;
  fields?: FieldMeta[];
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  activeHighlightKey?: string | null;
  onHighlightChange?: (highlight: LegendHighlight | null) => void;
};

type GeometryKind = 'point' | 'line' | 'polygon';

export type LegendHighlight = {
  key: string;
  label: string;
  filter: any[] | null;
};

export default function MapLegend({ mode, options, attributeStyle, geometryType, layerName, fields = [], collapsed: collapsedProp, onCollapsedChange, activeHighlightKey = null, onHighlightChange }: Props) {
  const [internalCollapsed, setInternalCollapsed] = React.useState(false);
  const collapsed = collapsedProp ?? internalCollapsed;
  const geometry = inferKind(geometryType);
  if (mode === 'server' || !geometry) return null;

  const style = resolveStyle(options);
  const rule = mode === 'attribute' ? attributeStyle?.rule : undefined;
  if (mode === 'attribute' && !rule) return null;

  const subtitle = rule ? getFieldLabel(fields, rule.field) : (layerName || 'Custom style');

  return (
    <aside
      aria-label="Map legend"
      style={{
        position: 'absolute',
        right: 12,
        bottom: 28,
        zIndex: 1200,
        width: collapsed ? 'auto' : 240,
        maxWidth: 'calc(100% - 24px)',
        color: 'var(--text)',
        background: 'rgba(var(--panel-rgb, 255,255,255), 0.94)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
        backdropFilter: 'blur(6px)',
        overflow: 'hidden',
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        onClick={() => {
          const next = !collapsed;
          setInternalCollapsed(next);
          onCollapsedChange?.(next);
        }}
        title={collapsed ? 'Show legend' : 'Hide legend'}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '8px 10px',
          border: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>Legend</span>
          {!collapsed ? (
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {subtitle}
            </span>
          ) : null}
        </span>
        <span aria-hidden style={{ color: 'var(--muted)', fontSize: 12 }}>{collapsed ? '+' : '-'}</span>
      </button>

      {!collapsed ? (
        <div style={{ display: 'grid', gap: 8, padding: 10 }}>
          {rule ? (
            <AttributeLegend
              rule={rule}
              geometry={geometry}
              pointStyle={style.point}
              fieldLabel={subtitle}
              activeHighlightKey={activeHighlightKey}
              onHighlightChange={onHighlightChange}
            />
          ) : (
            <FlatLegend
              geometry={geometry}
              style={style}
              activeHighlightKey={activeHighlightKey}
              onHighlightChange={onHighlightChange}
            />
          )}
          {style.label.enabled && style.label.field ? (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 7, fontSize: 11, color: 'var(--muted)' }}>
              Labels: {getFieldLabel(fields, style.label.field)}
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function AttributeLegend({
  rule,
  geometry,
  pointStyle,
  fieldLabel,
  activeHighlightKey,
  onHighlightChange,
}: {
  rule: AttributeStyleRule;
  geometry: GeometryKind;
  pointStyle: ReturnType<typeof resolveStyle>['point'];
  fieldLabel: string;
  activeHighlightKey?: string | null;
  onHighlightChange?: (highlight: LegendHighlight | null) => void;
}) {
  if (rule.kind === 'numeric') {
    const stops = [...rule.stops].sort((a, b) => a.value - b.value);
    const gradient = stops.length
      ? `linear-gradient(to right, ${stops.map((stop) => stop.color).join(', ')})`
      : rule.fallbackColor;
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fieldLabel}</div>
        <div style={{ height: 10, borderRadius: 9999, border: '1px solid var(--border)', background: gradient }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--muted)' }}>
          <span>{formatLegendNumber(stops[0]?.value)}</span>
          <span>{formatLegendNumber(stops[stops.length - 1]?.value)}</span>
        </div>
      </div>
    );
  }

  const enabledNamed = rule.stops.filter((stop) => stop.value !== null && stop.enabled);
  const other = buildGroupedOtherStop(rule);
  const stops = other ? [...enabledNamed, other] : enabledNamed;
  const visible = stops.slice(0, 8);
  const remaining = Math.max(0, stops.length - visible.length);
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fieldLabel}</div>
      {visible.map((stop, index) => {
        const label = stop.value === null ? (stop.label || 'Other / grouped') : String(stop.value);
        const key = `attribute:${rule.field}:${stop.value === null ? '__other__' : String(stop.value)}`;
        const active = activeHighlightKey === key;
        return (
          <LegendRow
            key={`${String(stop.value)}-${index}`}
            color={stop.color}
            geometry={geometry}
            pointStyle={pointStyle}
            label={label}
            suffix={typeof stop.count === 'number' ? stop.count.toLocaleString() : ''}
            active={active}
            onClick={onHighlightChange ? () => {
              onHighlightChange(active ? null : { key, label, filter: buildCategoricalLegendFilter(rule, stop.value) });
            } : undefined}
          />
        );
      })}
      {remaining ? <div className="u-small u-muted">+ {remaining} more</div> : null}
    </div>
  );
}

function buildGroupedOtherStop(rule: AttributeStyleRule & { kind: 'categorical' }) {
  const other = rule.stops.find((stop) => stop.value === null);
  if (!other) return null;
  const disabledCount = rule.stops
    .filter((stop) => stop.value !== null && !stop.enabled && typeof stop.count === 'number')
    .reduce((sum, stop) => sum + (stop.count || 0), 0);
  const count = typeof other.count === 'number' || disabledCount > 0
    ? (other.count || 0) + disabledCount
    : undefined;
  return {
    ...other,
    enabled: true,
    label: disabledCount > 0 ? 'Other / grouped' : other.label || 'Other / no data',
    count,
  };
}

function FlatLegend({
  geometry,
  style,
  activeHighlightKey,
  onHighlightChange,
}: {
  geometry: GeometryKind;
  style: ReturnType<typeof resolveStyle>;
  activeHighlightKey?: string | null;
  onHighlightChange?: (highlight: LegendHighlight | null) => void;
}) {
  const color =
    geometry === 'line' ? style.line.color :
    geometry === 'polygon' ? style.polygon.fillColor :
    style.point.fillColor;
  const label = geometry === 'point' ? (style.point.symbol === 'icon' ? pointIconLabel(style.point.icon) : 'Points') : geometry === 'line' ? 'Lines' : 'Polygons';
  const key = `flat:${geometry}`;
  const active = activeHighlightKey === key;
  return (
    <LegendRow
      color={color}
      geometry={geometry}
      pointStyle={style.point}
      label={label}
      active={active}
      onClick={onHighlightChange ? () => {
        onHighlightChange(active ? null : { key, label, filter: buildAllFeaturesFilter() });
      } : undefined}
    />
  );
}

function LegendRow({
  color,
  geometry,
  pointStyle,
  label,
  suffix,
  active = false,
  onClick,
}: {
  color: string;
  geometry: GeometryKind;
  pointStyle: ReturnType<typeof resolveStyle>['point'];
  label: string;
  suffix?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <SymbolSwatch color={color} geometry={geometry} pointStyle={pointStyle} />
      <span title={label} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
        {label}
      </span>
      {suffix ? <span style={{ color: 'var(--muted)', fontSize: 11 }}>{suffix}</span> : null}
    </>
  );
  const style: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '22px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
    borderRadius: 6,
    margin: '0 -4px',
    padding: '3px 4px',
    background: active ? 'rgba(91, 140, 255, 0.16)' : 'transparent',
    outline: active ? '1px solid rgba(91, 140, 255, 0.45)' : 'none',
  };
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={active ? `Clear ${label} highlight` : `Highlight ${label}`}
        style={{
          ...style,
          width: 'calc(100% + 8px)',
          border: 'none',
          color: 'var(--text)',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        {content}
      </button>
    );
  }
  return (
    <div style={style}>
      {content}
    </div>
  );
}

function buildCategoricalLegendFilter(rule: AttributeStyleRule & { kind: 'categorical' }, value: string | number | null): any[] {
  if (value !== null) return ['==', ['get', rule.field], value];
  const enabledValues = rule.stops
    .filter((stop) => stop.value !== null && stop.enabled)
    .map((stop) => stop.value) as Array<string | number>;
  if (!enabledValues.length) return buildAllFeaturesFilter();
  return ['!', ['match', ['get', rule.field], enabledValues, true, false]];
}

function buildAllFeaturesFilter(): any[] {
  return ['!=', ['id'], '__arcgis_preview_none__'];
}

function SymbolSwatch({ color, geometry, pointStyle }: { color: string; geometry: GeometryKind; pointStyle: ReturnType<typeof resolveStyle>['point'] }) {
  if (geometry === 'line') {
    return <span aria-hidden style={{ width: 22, height: 3, borderRadius: 9999, background: color, display: 'block' }} />;
  }
  if (geometry === 'polygon') {
    return <span aria-hidden style={{ width: 18, height: 14, borderRadius: 3, background: color, border: '1px solid var(--border)', display: 'block' }} />;
  }
  if (pointStyle.symbol === 'icon') {
    return (
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          fontSize: 15,
          lineHeight: 1,
        }}
      >
        {pointIconMark(pointStyle.icon)}
      </span>
    );
  }
  return <span aria-hidden style={{ width: 14, height: 14, borderRadius: 9999, background: color, border: `2px solid ${pointStyle.color}`, display: 'block' }} />;
}

function resolveStyle(options: GeometryStyleOptions | undefined) {
  return {
    point: {
      symbol: options?.point?.symbol === 'icon' ? 'icon' as const : 'circle' as const,
      icon: POINT_ICON_OPTIONS.some((icon) => icon.id === options?.point?.icon) ? options?.point?.icon || DEFAULT_POINT_ICON_ID : DEFAULT_POINT_ICON_ID,
      color: options?.point?.color ?? defaultStyleOptions.point?.color ?? '#3388ff',
      fillColor: options?.point?.fillColor ?? options?.point?.color ?? defaultStyleOptions.point?.fillColor ?? '#3388ff',
    },
    line: {
      color: options?.line?.color ?? defaultStyleOptions.line?.color ?? '#3388ff',
    },
    polygon: {
      fillColor: options?.polygon?.fillColor ?? options?.polygon?.color ?? defaultStyleOptions.polygon?.fillColor ?? '#3388ff',
    },
    label: {
      enabled: !!options?.label?.enabled && !!options?.label?.field,
      field: options?.label?.field ?? '',
    },
  };
}

function inferKind(geometryType?: string | null): GeometryKind | null {
  const value = String(geometryType || '').toLowerCase();
  if (!value) return null;
  if (value.includes('point')) return 'point';
  if (value.includes('line')) return 'line';
  if (value.includes('poly')) return 'polygon';
  return null;
}

function getFieldLabel(fields: FieldMeta[], name: string): string {
  const field = fields.find((item) => item.name === name);
  return field?.alias && field.alias !== name ? field.alias : name;
}

function formatLegendNumber(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function pointIconLabel(iconId: string): string {
  return POINT_ICON_OPTIONS.find((icon) => icon.id === iconId)?.label || 'Icons';
}

function pointIconMark(iconId: string): string {
  switch (iconId) {
    case 'odl-square': return '■';
    case 'odl-diamond': return '◆';
    case 'odl-triangle': return '▲';
    case 'odl-star': return '★';
    case 'odl-cross': return '+';
    case 'odl-flag': return '⚑';
    case 'odl-circle-dot': return '●';
    case 'odl-marker':
    default:
      return '●';
  }
}
