import type { LayerSpecification } from 'maplibre-gl';
import type { AttributeStyleRule, GeometryStyleOptions } from './styleOptions';
import { DEFAULT_POINT_ICON_ID, POINT_ICON_ALIGNMENT_OPTIONS, POINT_ICON_ANCHOR_OPTIONS, defaultStyleOptions } from './styleOptions';

export type GeometryKind = 'point' | 'polyline' | 'polygon';

export const DEFAULT_CUSTOM_LAYER_PREFIX = 'arcgis-custom';

const LABEL_POSITIONS: Record<string, { anchor: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; offset: [number, number] }> = {
  center: { anchor: 'center', offset: [0, 0] },
  top: { anchor: 'bottom', offset: [0, -0.8] },
  bottom: { anchor: 'top', offset: [0, 0.8] },
  left: { anchor: 'right', offset: [-0.8, 0] },
  right: { anchor: 'left', offset: [0.8, 0] },
  'top-left': { anchor: 'bottom-right', offset: [-0.6, -0.6] },
  'top-right': { anchor: 'bottom-left', offset: [0.6, -0.6] },
  'bottom-left': { anchor: 'top-right', offset: [-0.6, 0.6] },
  'bottom-right': { anchor: 'top-left', offset: [0.6, 0.6] },
};

function buildResolvedStyle(opts: GeometryStyleOptions | undefined) {
  return {
    point: { ...defaultStyleOptions.point, ...(opts?.point || {}) },
    line: { ...defaultStyleOptions.line, ...(opts?.line || {}) },
    polygon: { ...defaultStyleOptions.polygon, ...(opts?.polygon || {}) },
    label: { ...defaultStyleOptions.label, ...(opts?.label || {}) }
  };
}

function buildPointIconLayer(
  sourceId: string,
  style: ReturnType<typeof buildResolvedStyle>,
  layerIdPrefix: string,
  color: unknown
): LayerSpecification {
  const iconSize = Math.max(10, Math.min(80, Number(style.point?.iconSize) || 24));
  const iconAnchor = POINT_ICON_ANCHOR_OPTIONS.includes(style.point?.iconAnchor as any) ? style.point?.iconAnchor : 'center';
  const iconRotationAlignment = POINT_ICON_ALIGNMENT_OPTIONS.includes(style.point?.iconRotationAlignment as any) ? style.point?.iconRotationAlignment : 'auto';
  const iconPitchAlignment = POINT_ICON_ALIGNMENT_OPTIONS.includes(style.point?.iconPitchAlignment as any) ? style.point?.iconPitchAlignment : 'auto';
  const iconRotate = Math.max(-360, Math.min(360, Number(style.point?.iconRotate) || 0));
  return {
    id: `${layerIdPrefix}-point-icon`,
    type: 'symbol',
    source: sourceId,
    layout: {
      'icon-image': style.point?.icon || DEFAULT_POINT_ICON_ID,
      'icon-size': iconSize / 64,
      'icon-anchor': iconAnchor,
      'icon-allow-overlap': !!style.point?.iconAllowOverlap,
      'icon-ignore-placement': !!style.point?.iconIgnorePlacement,
      'icon-rotate': iconRotate,
      'icon-rotation-alignment': iconRotationAlignment,
      'icon-pitch-alignment': iconPitchAlignment,
    },
    paint: {
      'icon-color': color as any,
      'icon-opacity': style.point?.fillOpacity ?? 1,
    }
  };
}

function buildLabelLayer(
  sourceId: string,
  geometry: GeometryKind,
  style: ReturnType<typeof buildResolvedStyle>,
  layerIdPrefix: string
): LayerSpecification | null {
  const field = String(style.label?.field || '').trim();
  if (!style.label?.enabled || !field) return null;
  const textSize = Math.max(8, Math.min(32, Number(style.label?.size) || 12));
  const placement = geometry === 'polyline' ? 'line' : 'point';
  const position = LABEL_POSITIONS[String(style.label?.position || 'top')] || LABEL_POSITIONS.top;
  return {
    id: `${layerIdPrefix}-label`,
    type: 'symbol',
    source: sourceId,
    layout: {
      'symbol-placement': placement,
      'text-field': ['case', ['has', field], ['to-string', ['get', field]], ''] as any,
      'text-size': textSize,
      'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      'text-anchor': geometry === 'polyline' ? 'center' : position.anchor,
      'text-offset': geometry === 'polyline' ? [0, 0] : position.offset,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-max-width': 12,
    },
    paint: {
      'text-color': style.label?.color || '#111827',
      'text-halo-color': style.label?.haloColor || '#ffffff',
      'text-halo-width': Math.max(0, Math.min(6, Number(style.label?.haloWidth) || 0)),
    }
  };
}

export function buildCustomLayers(
  sourceId: string,
  geometry: GeometryKind,
  opts: GeometryStyleOptions | undefined,
  layerIdPrefix: string = DEFAULT_CUSTOM_LAYER_PREFIX
): LayerSpecification[] {
  const style = buildResolvedStyle(opts);
  const layers: LayerSpecification[] = [];

  if (geometry === 'point') {
    if (style.point?.symbol === 'icon') {
      layers.push(buildPointIconLayer(sourceId, style, layerIdPrefix, style.point?.fillColor ?? '#3388ff'));
    } else {
      layers.push({
        id: `${layerIdPrefix}-point`,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-color': style.point?.fillColor ?? '#3388ff',
          'circle-opacity': style.point?.fillOpacity ?? 0.7,
          'circle-radius': style.point?.radius ?? 6,
          'circle-stroke-color': style.point?.color ?? '#3388ff',
          'circle-stroke-width': style.point?.weight ?? 1,
          'circle-stroke-opacity': style.point?.opacity ?? 1
        }
      });
    }
    const labelLayer = buildLabelLayer(sourceId, geometry, style, layerIdPrefix);
    if (labelLayer) layers.push(labelLayer);
    return layers;
  }

  if (geometry === 'polyline') {
    layers.push({
      id: `${layerIdPrefix}-line`,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': style.line?.color ?? '#3388ff',
        'line-width': style.line?.weight ?? 0.5,
        'line-opacity': style.line?.opacity ?? 1,
        ...(style.line?.dashArray
          ? { 'line-dasharray': style.line.dashArray.split(',').map((v) => Number(v.trim()) || 0) }
          : {})
      },
      layout: {
        ...(style.line?.lineCap ? { 'line-cap': style.line.lineCap } : {}),
        ...(style.line?.lineJoin ? { 'line-join': style.line.lineJoin } : {})
      }
    });
    const labelLayer = buildLabelLayer(sourceId, geometry, style, layerIdPrefix);
    if (labelLayer) layers.push(labelLayer);
    return layers;
  }

  layers.push({
    id: `${layerIdPrefix}-fill`,
    type: 'fill',
    source: sourceId,
    paint: {
      'fill-color': style.polygon?.fillColor ?? '#3388ff',
      'fill-opacity': style.polygon?.fillOpacity ?? 0.2
    }
  });
  layers.push({
    id: `${layerIdPrefix}-outline`,
    type: 'line',
    source: sourceId,
    paint: {
      'line-color': style.polygon?.color ?? '#3388ff',
      'line-width': style.polygon?.weight ?? 2,
      'line-opacity': style.polygon?.opacity ?? 1,
      ...(style.polygon?.dashArray
        ? { 'line-dasharray': style.polygon.dashArray.split(',').map((v) => Number(v.trim()) || 0) }
        : {})
    },
    layout: {
      ...(style.polygon?.lineCap ? { 'line-cap': style.polygon.lineCap } : {}),
      ...(style.polygon?.lineJoin ? { 'line-join': style.polygon.lineJoin } : {})
    }
  });
  const labelLayer = buildLabelLayer(sourceId, geometry, style, layerIdPrefix);
  if (labelLayer) layers.push(labelLayer);
  return layers;
}

export function buildAttributeLayers(
  sourceId: string,
  geometry: GeometryKind,
  rule: AttributeStyleRule,
  baseOpts: GeometryStyleOptions | undefined,
  layerIdPrefix: string = DEFAULT_CUSTOM_LAYER_PREFIX
): LayerSpecification[] {
  const layers: LayerSpecification[] = [];
  const base = buildResolvedStyle(baseOpts);
  const colorExpr = buildColorExpression(rule);

  if (geometry === 'point') {
    if (base.point?.symbol === 'icon') {
      layers.push(buildPointIconLayer(sourceId, base, layerIdPrefix, colorExpr));
    } else {
      layers.push({
        id: `${layerIdPrefix}-point`,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-color': colorExpr as any,
          'circle-opacity': base.point?.fillOpacity ?? 0.7,
          'circle-radius': base.point?.radius ?? 6,
          'circle-stroke-color': base.point?.color ?? '#3388ff',
          'circle-stroke-width': base.point?.weight ?? 1,
          'circle-stroke-opacity': base.point?.opacity ?? 1
        }
      });
    }
    const labelLayer = buildLabelLayer(sourceId, geometry, base, layerIdPrefix);
    if (labelLayer) layers.push(labelLayer);
    return layers;
  }

  if (geometry === 'polyline') {
    layers.push({
      id: `${layerIdPrefix}-line`,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': colorExpr as any,
        'line-width': base.line?.weight ?? 0.5,
        'line-opacity': base.line?.opacity ?? 1
      }
    });
    const labelLayer = buildLabelLayer(sourceId, geometry, base, layerIdPrefix);
    if (labelLayer) layers.push(labelLayer);
    return layers;
  }

  layers.push({
    id: `${layerIdPrefix}-fill`,
    type: 'fill',
    source: sourceId,
    paint: {
      'fill-color': colorExpr as any,
      'fill-opacity': base.polygon?.fillOpacity ?? 0.2
    }
  });
  layers.push({
    id: `${layerIdPrefix}-outline`,
    type: 'line',
    source: sourceId,
    paint: {
      'line-color': base.polygon?.color ?? '#3388ff',
      'line-width': base.polygon?.weight ?? 2,
      'line-opacity': base.polygon?.opacity ?? 1
    }
  });
  const labelLayer = buildLabelLayer(sourceId, geometry, base, layerIdPrefix);
  if (labelLayer) layers.push(labelLayer);
  return layers;
}

export function buildColorExpression(rule: AttributeStyleRule): unknown {
  if (rule.kind === 'categorical') {
    const enabled = rule.stops.filter((stop) => stop.enabled);
    const arms: unknown[] = [];
    for (const stop of enabled) {
      if (stop.value !== null) {
        arms.push(stop.value, stop.color);
      }
    }
    const fallback = rule.stops.find((stop) => stop.value === null && stop.enabled)?.color ?? rule.fallbackColor;
    return ['match', ['get', rule.field], ...arms, fallback];
  }

  if (rule.stops.length < 2) {
    return rule.fallbackColor;
  }

  const stops = [...rule.stops].sort((a, b) => a.value - b.value);
  const arms: unknown[] = [];
  for (const stop of stops) {
    arms.push(stop.value, stop.color);
  }
  return ['interpolate', ['linear'], ['to-number', ['get', rule.field], 0], ...arms];
}
