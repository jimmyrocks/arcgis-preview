import type { Map as MapLibreMap, LayerSpecification } from 'maplibre-gl';
import { applyRendererAsync, clearRendererArtifacts } from '@opendataland/source-arcgis';
import type { AttributeStyleOptions, GeometryStyleOptions, StyleMode } from './styleOptions';
import { buildAttributeLayers, buildCustomLayers, type GeometryKind } from './esriStyle';
import { registerDefaultPointIcons } from './mapIcons';
import { getRenderableArcgisRenderer } from './arcgisRenderer';

const DEFAULT_RENDERER_LAYER_PREFIX = 'arcgis-style';
const DEFAULT_CUSTOM_LAYER_PREFIX = 'arcgis-custom';
const DEFAULT_LINE_HIT_SUFFIX = 'line-hit';
const DEFAULT_POINT_FALLBACK_COLOR = '#5b8cff';

export type ApplyFeatureSourceStyleOptions = {
  map: MapLibreMap;
  sourceId: string;
  geometry: GeometryKind;
  styleMode: StyleMode;
  customStyle?: GeometryStyleOptions;
  attributeStyle?: AttributeStyleOptions;
  renderer?: any;
  rendererLayerPrefix?: string;
  customLayerPrefix?: string;
  lineHitLayerId?: string;
  pointLabelFallbackColor?: string;
  serviceUrl?: string;
  token?: string;
};

export type ApplyFeatureSourceStyleResult = {
  visualLayerIds: string[];
  interactiveLayerIds: string[];
};

function resolveLineHitLayerId(customLayerPrefix: string, lineHitLayerId?: string): string {
  return lineHitLayerId || `${customLayerPrefix}-${DEFAULT_LINE_HIT_SUFFIX}`;
}

export function addPointLabelFallback(
  map: MapLibreMap,
  layerIds: string[],
  sourceId: string,
  geometry: GeometryKind | undefined,
  rendererLayerPrefix: string = DEFAULT_RENDERER_LAYER_PREFIX,
  color: string = DEFAULT_POINT_FALLBACK_COLOR
): string[] {
  if (geometry !== 'point' || !layerIds.length) return [];

  let hasNonLabel = false;
  let hasIcon = false;
  let hasTextLabel = false;
  for (const id of layerIds) {
    const layer: any = map.getLayer(id) as any;
    if (!layer) continue;
    if (layer.type !== 'symbol') {
      hasNonLabel = true;
      continue;
    }
    const layout = layer.layout || {};
    if (layout['icon-image']) hasIcon = true;
    if (layout['text-field']) hasTextLabel = true;
  }
  if (hasNonLabel || hasIcon || !hasTextLabel) return [];

  const fallbackId = `${rendererLayerPrefix}-label-fallback`;
  try {
    if (map.getLayer(fallbackId)) map.removeLayer(fallbackId);
  } catch {}

  const fallback: LayerSpecification = {
    id: fallbackId,
    type: 'circle',
    source: sourceId,
    paint: {
      'circle-color': color,
      'circle-opacity': 0.65,
      'circle-radius': 6,
      'circle-stroke-color': color,
      'circle-stroke-width': 1.5,
      'circle-stroke-opacity': 0.9
    }
  };

  try {
    map.addLayer(fallback, layerIds[0]);
  } catch {
    try {
      map.addLayer(fallback);
    } catch {}
  }
  return [fallbackId];
}

export function addLineHitLayer(map: MapLibreMap, sourceId: string, layerId: string): string | null {
  try {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: { 'line-width': 20, 'line-opacity': 0 }
    });
    return layerId;
  } catch {
    return null;
  }
}

export async function applyFeatureSourceStyle({
  map,
  sourceId,
  geometry,
  styleMode,
  customStyle,
  attributeStyle,
  renderer,
  rendererLayerPrefix = DEFAULT_RENDERER_LAYER_PREFIX,
  customLayerPrefix = DEFAULT_CUSTOM_LAYER_PREFIX,
  lineHitLayerId,
  pointLabelFallbackColor = DEFAULT_POINT_FALLBACK_COLOR,
  serviceUrl,
  token
}: ApplyFeatureSourceStyleOptions): Promise<ApplyFeatureSourceStyleResult> {
  clearRendererArtifacts(map, rendererLayerPrefix);
  clearRendererArtifacts(map, customLayerPrefix);

  const hitLayerId = resolveLineHitLayerId(customLayerPrefix, lineHitLayerId);

  const serverRenderer = getRenderableArcgisRenderer(renderer);
  if (styleMode === 'server' && serverRenderer) {
    try {
      const rendererLayerIds = await applyRendererAsync(map, serverRenderer as any, {
        sourceId,
        geometryType: geometry,
        layerIdPrefix: rendererLayerPrefix,
        removeExisting: true,
        serviceUrl,
        token
      });
      if (rendererLayerIds.length) {
        const fallbackIds = addPointLabelFallback(
          map,
          rendererLayerIds,
          sourceId,
          geometry,
          rendererLayerPrefix,
          pointLabelFallbackColor
        );
        const lineHitId = geometry === 'polyline' ? addLineHitLayer(map, sourceId, hitLayerId) : null;
        const visualLayerIds = [...rendererLayerIds, ...fallbackIds];
        return {
          visualLayerIds,
          interactiveLayerIds: [...visualLayerIds, ...(lineHitId ? [lineHitId] : [])]
        };
      }
    } catch {}
  }

  const rule = styleMode === 'attribute' ? attributeStyle?.rule : undefined;
  if (geometry === 'point' && customStyle?.point?.symbol === 'icon') {
    registerDefaultPointIcons(map);
  }
  const layers = rule
    ? buildAttributeLayers(sourceId, geometry, rule, customStyle, customLayerPrefix)
    : buildCustomLayers(sourceId, geometry, customStyle, customLayerPrefix);

  for (const layer of layers) {
    try {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    } catch {}
    map.addLayer(layer);
  }

  const lineHitId = geometry === 'polyline' ? addLineHitLayer(map, sourceId, hitLayerId) : null;
  const visualLayerIds = layers.map((layer) => layer.id);
  return {
    visualLayerIds,
    interactiveLayerIds: [...visualLayerIds, ...(lineHitId ? [lineHitId] : [])]
  };
}
