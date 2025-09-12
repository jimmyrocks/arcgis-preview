import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { featureLayer as featureLayerModuleFactory } from 'esri-leaflet';
import { arcgisToGeoJSON as a2g } from '@terraformer/arcgis';
import 'esri-leaflet-renderers';
import type LType from 'leaflet';
import { extentToBounds } from '../../lib/geometry';
import { fetchLayerExtent4326 } from '../../lib/esriLayer';
import { createHitOverlayManager } from '../../lib/hitOverlays';
import type { MapServiceInfo, MapServiceLayerInfo } from '../../lib/types/arcgis-rest';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import PopupContent from '../PopupContent';
import { createRoot } from 'react-dom/client';
import { getFeatureId } from '../../lib/ids';
import { approxPrecisionMeters, offsetMeters4326 } from '../../lib/mapMath';
import { log } from '../../lib/log';
import type { GeometryStyleOptions } from '../../lib/styleOptions';

type Props = {
  url: string;
  where?: string;
  serviceMeta?: MapServiceInfo | null;
  layerMeta?: MapServiceLayerInfo | null;
  onStatusChange?: (status: 'loading' | 'loaded' | 'error') => void;
  onComputedBounds?: (b: LType.LatLngBounds) => void;
  onFeatureCollection?: (featureCollection: FeatureCollection) => void;
  onFeaturePrecision?: (min: number, max: number) => void;
  onFeatureClickId?: (id: string | number | null) => void;
  styleMode?: 'server' | 'custom';
  customStyle?: GeometryStyleOptions;
};

type PrecisionInput = {
  center: { lat: number; lon: number };
  outSR: number;
  maxAllowableOffset?: number;
  geometryPrecision?: number;
  quantScale?: number;
};

type PrecisionPayload =
  | PrecisionInput
  | { params?: Record<string, unknown>; resp?: Record<string, unknown> }
  | undefined;

type RequestSuccessEvent = {
  params?: Record<string, unknown>;
  requestParams?: Record<string, unknown>;
  request?: { params?: Record<string, unknown>; response?: unknown };
  response?: unknown;
  rawResponse?: unknown;
};

export default function EsriFeatureLayer({ url, where = '1=1', serviceMeta, layerMeta, onStatusChange, onComputedBounds, onFeatureCollection, onFeaturePrecision, onFeatureClickId, styleMode = 'server', customStyle = {} }: Props) {
  const map = useMap();
  const oidFieldNameRef = React.useRef<string | null>(null);
  const extentFetchRef = React.useRef<boolean>(false);
  const extentToastRef = React.useRef<boolean>(false);
  React.useEffect(() => {
    try {
      const name = (layerMeta?.fields || []).find((fld: any) => String(fld?.type || '').toLowerCase() === 'esrifieldtypeoid')?.name;
      if (name) oidFieldNameRef.current = String(name);
    } catch { }
  }, [layerMeta]);
  useEffect(() => {
    if (!url) return;
    log.debug('[EsriFeatureLayer] init', { url, where });
    let layer: (L.Layer & {
      on: (name: string, handler: (e: unknown) => void) => void;
      query?: () => { bounds: (cb: (err: unknown, b: L.LatLngBounds) => void) => void };
      addTo: (m: L.Map) => void;
      bringToFront?: () => void;
    }) | null = null;
    let cancelled = false;
    const collectedProperties = new Map<string | number, Feature['properties']>();
    const collectedGeometries = new Map<string | number, Feature['geometry']>();
    const collectedGeometriesPrecision = new Map<string | number, number>();
    const requestParamsByOid = new Map<string | number, PrecisionPayload>();
    let sawAnyFeature = false;

    const report = () => {
      // Stitch together the collected features
      const features: Feature[] = [];
      for (const [id, properties] of collectedProperties) {
        const geometry: Feature['geometry'] = collectedGeometries.get(id) || { type: 'Point', coordinates: [] };
        features.push({ type: 'Feature', id, properties, geometry });
      }
      // Report the data
      try {
        const vals = Array.from(collectedGeometriesPrecision.values());
        const fc: any = { type: 'FeatureCollection', features };
        if (vals.length) {
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          // Precision range update is reported via callback; suppress console noise
          onFeaturePrecision?.(min, max);
          fc._precision_range_m = { min: Math.round(min), max: Math.round(max) };
        }
        try { if (features.length > 0) sawAnyFeature = true; } catch {}
        onFeatureCollection?.(fc);
        return;
      } catch { }
      onFeatureCollection?.({ type: 'FeatureCollection', features });
    };

    const hitMgr = createHitOverlayManager(map as L.Map, {
      onClick: (id) => { try { onFeatureClickId?.(id); } catch { } }
    });

    const resolveFeatureId = (f: unknown, props: any, allowHashStable: boolean = false): { id: string | number; stable: boolean } => {
      try {
        // 1) OID from known field (layer meta or observed response) — preferred and required for stability
        try {
          const metaOid = (layerMeta?.fields || []).find((fld: any) => String(fld?.type || '').toLowerCase() === 'esrifieldtypeoid')?.name;
          const candidate = metaOid || oidFieldNameRef.current || undefined;
          if (candidate && props && Object.prototype.hasOwnProperty.call(props, candidate)) {
            const val = (props as any)[candidate];
            if (val != null) return { id: val, stable: true };
          }
        } catch { /* ignore */ }
        // 2) GlobalID / GUID if present
        try {
          const gidField = (layerMeta?.fields || []).find((fld: any) => {
            const t = String(fld?.type || '').toLowerCase();
            return t === 'esrifieldtypeglobalid' || t === 'esrifieldtypeguid';
          })?.name;
          if (gidField && props && Object.prototype.hasOwnProperty.call(props, gidField)) {
            const val = (props as any)[gidField];
            if (val != null) return { id: val, stable: true };
          }
        } catch { /* ignore */ }
        // 3) Single-field unique index (non-geometry)
        try {
          const idx = (layerMeta?.indexes || []).find((ix: any) => ix && ix.isUnique && typeof ix.fields === 'string');
          if (idx && typeof idx.fields === 'string') {
            const parts = idx.fields.split(',').map((s: string) => s.trim()).filter(Boolean);
            if (parts.length === 1) {
              const k = parts[0];
              if (k && props && Object.prototype.hasOwnProperty.call(props, k)) return { id: (props as any)[k], stable: true };
            }
          }
        } catch { /* ignore */ }
        // 4) GeoJSON Feature.id or common keys on the feature object — treat as unstable unless it matches a known OID
        try {
          const direct = getFeatureId(f);
          if (direct != null) return { id: direct, stable: false };
        } catch { /* ignore */ }
        // 5) Deterministic hash of properties as a last-resort stable id
        try {
          const exclude: string[] = [];
          try {
            const t1 = (layerMeta?.fields || []).find((fld: any) => String(fld?.type || '').toLowerCase() === 'esrifieldtypeoid')?.name;
            if (t1) exclude.push(String(t1));
          } catch { }
          const hid = stableHashFromProps(props, exclude);
          return { id: hid, stable: !!allowHashStable };
        } catch { /* ignore */ }
        // Fallback: unstable synthetic string
        return { id: JSON.stringify(props).slice(0, 200), stable: false };
      } catch { return { id: Math.random(), stable: false }; }
    };

    const addGeometryToCollection = (fid: string | number, geom: Geometry | null | undefined, precisionPayload?: PrecisionPayload) => {
      if (!geom) return;
      const isPoint = geom?.type === 'Point' || geom?.type === 'MultiPoint';
      const currP = isPoint ? 0 : effectiveMetersFromPrecision(toPrecisionInputFromParams(precisionPayload), map as L.Map);
      const prevP: number = collectedGeometriesPrecision.get(fid) ?? Number.POSITIVE_INFINITY;
      if (currP < prevP) {
        collectedGeometries.set(fid, geom);
        collectedGeometriesPrecision.set(fid, currP);
      }
    }

    (async () => {
      try {
        onStatusChange?.('loading');
        log.debug('Loading features from', url);
        const featureLayerFactory = ((L as any).esri && (L as any).esri.featureLayer) || featureLayerModuleFactory;
        // Prefer explicit idField so the OID is always available and stable across requests
        const explicitOid = (() => {
          try {
            const n = (layerMeta?.fields || []).find((fld: any) => String(fld?.type || '').toLowerCase() === 'esrifieldtypeoid')?.name;
            return (n && String(n)) || undefined;
          } catch { return undefined; }
        })();
        // Build optional custom per-geometry style
        const norm = normalizeStyleOptions(customStyle || {});
        const styleFn = (feat?: any) => {
          const gtype = String(feat?.geometry?.type || '').toLowerCase();
          if (gtype.includes('point')) {
            // Apply point stroke/fill to circle markers via setStyle
            return {
              stroke: norm.point.stroke,
              color: norm.point.color,
              weight: norm.point.weight,
              opacity: norm.point.opacity,
              fill: norm.point.fill,
              fillColor: norm.point.fillColor,
              fillOpacity: norm.point.fillOpacity,
            } as L.PathOptions;
          }
          if (gtype.includes('polygon')) {
            return {
              stroke: norm.polygon.stroke,
              color: norm.polygon.color,
              weight: norm.polygon.weight,
              opacity: norm.polygon.opacity,
              lineCap: norm.polygon.lineCap,
              lineJoin: norm.polygon.lineJoin,
              dashArray: norm.polygon.dashArray || undefined,
              dashOffset: norm.polygon.dashOffset || undefined,
              fill: norm.polygon.fill,
              fillColor: norm.polygon.fillColor,
              fillOpacity: norm.polygon.fillOpacity,
              fillRule: norm.polygon.fillRule,
            } as L.PathOptions;
          }
          if (gtype.includes('line')) {
            return {
              stroke: norm.line.stroke,
              color: norm.line.color,
              weight: norm.line.weight,
              opacity: norm.line.opacity,
              lineCap: norm.line.lineCap,
              lineJoin: norm.line.lineJoin,
              dashArray: norm.line.dashArray || undefined,
              dashOffset: norm.line.dashOffset || undefined,
              fill: false,
              fillOpacity: 0,
            } as L.PathOptions;
          }
          // default fallback (non-point fallback)
          return {
            stroke: norm.polygon.stroke,
            color: norm.polygon.color,
            weight: norm.polygon.weight,
            opacity: norm.polygon.opacity,
            fill: norm.polygon.fill,
            fillColor: norm.polygon.fillColor,
            fillOpacity: norm.polygon.fillOpacity,
          } as L.PathOptions;
        };
        const pointToLayerFn = (_feat: any, latlng: L.LatLng) => (L as any).circleMarker(latlng, {
          stroke: norm.point.stroke,
          color: norm.point.color,
          weight: norm.point.weight,
          opacity: norm.point.opacity,
          fill: norm.point.fill,
          fillColor: norm.point.fillColor,
          fillOpacity: norm.point.fillOpacity,
          radius: norm.point.radius,
          interactive: true,
          bubblingMouseEvents: true as any,
        } as any);
        layer = featureLayerFactory({
          url,
          simplifyFactor: 0.35,
          precision: 6,
          where: (where || '1=1').trim() || undefined,
          // Ask for all fields in responses so attributes/exports are complete
          fields: ['*'] as any,
          // Hint the OID field to esri-leaflet so features get stable ids
          idField: explicitOid as any,
          renderer: (L as any).canvas ? (L as any).canvas({ tolerance: 2 }) : undefined,
          ...(styleMode === 'custom' ? { style: styleFn as any, pointToLayer: pointToLayerFn as any, ignoreRenderer: true as any } : {}),
          onEachFeature: (feat: Feature, lyr: L.Layer) => {
            const tryUpdateGeometryFromLayer = (fid: string | number, layerRef: L.Layer, fallbackGeom?: Geometry | null) => {
              try {
                const gj = safeToGeoJSON(layerRef);
                const geom = (gj && (gj as any).geometry) || fallbackGeom || null;
                if (!geom) return;
                const rp = requestParamsByOid.get(fid);
                const precisionInput = toPrecisionInputFromParams(rp);
                addGeometryToCollection(fid, geom, precisionInput);
              } catch { }
            };
            // Single path for creating popups and collecting current display geometry
            try {
              const props: any = feat?.properties || (feat as any)?.attributes || {};
              const { id: fid, stable } = resolveFeatureId(feat, props, false);
              const gj = safeToGeoJSON(lyr);
              const geom: Feature['geometry'] = (gj && (gj as any).geometry) || (feat as any)?.geometry || null;
              const f: any = { type: 'Feature', properties: props, geometry: geom };
              if (fid != null) f.id = fid;

              const container = document.createElement('div');
              const layerName = inferLayerName(serviceMeta, url);
              try { lyr.bindPopup(container, { maxWidth: 360, className: 'odl-react-popup' }); } catch { }
              let root: any = null;
              lyr.on('popupopen', () => {
                try {
                  if (!root) root = createRoot(container);
                  root.render(React.createElement(PopupContent, { feature: f, layerName }));
                } catch { }
              });
              lyr.on('popupclose', () => { try { root?.unmount?.(); root = null; } catch { } });

              // Properties: keep the most recent
              if (stable && !collectedProperties.has(fid)) { collectedProperties.set(fid, props); }
              // Geometry: use display geometry from layer; prefer better precision (using request-derived precision if available)
              if (stable) {
                const rp0 = requestParamsByOid.get(fid);
                if (rp0) addGeometryToCollection(fid, geom, rp0);
                else tryUpdateGeometryFromLayer(fid, lyr, geom);
              }

              // Click handling and hit overlay for lines
              (lyr as any).on('click', (ev: unknown) => {
                try { (ev as any).originalEvent._odlFeatureClick = true; } catch { }
                try { if (ev && (ev as any).latlng) (map as any).panTo?.((ev as any).latlng, { animate: true }); } catch { }
                try { onFeatureClickId?.(stable ? fid : null); } catch { }
              });
              const g = geom;
              if (stable && (g?.type === 'LineString' || g?.type === 'MultiLineString')) {
                hitMgr.addLine(g as any, fid, lyr);
              }
            } catch { }
            report();
          }
        } as any);

        if (!layer) return;
        if (cancelled) return;

        // Observe request lifecycle and feature swaps to keep up with latest display geometry
        try {
          layer.on('requeststart', (e: any) => { log.debug('[EsriFeatureLayer] requeststart', e?.params || e?.requestParams || e?.request?.params); });
          layer.on('loading', () => { log.debug('[EsriFeatureLayer] loading'); });
          layer.on('load', () => { log.debug('[EsriFeatureLayer] load event'); try { report(); } catch {} });
          layer.on('requesterror', (e: any) => { try { log.error('[EsriFeatureLayer] requesterror', e); onStatusChange?.('error'); } catch {} });
          layer.on('requestsuccess', (e: unknown) => {
            try {
              const ev = (e as RequestSuccessEvent) || {};
              const params = ev.params || ev.requestParams || ev.request?.params || {};
              const resp: any = ev.response || ev.rawResponse || ev.request?.response || {};
              try {
                const n = Array.isArray((resp as any)?.features) ? (resp as any).features.length : (Array.isArray((resp as any)?.results) ? (resp as any).results.length : undefined);
                log.debug('[EsriFeatureLayer] requestsuccess', { featureCount: n, params });
              } catch {}

              // Capture objectIdFieldName for robust ID extraction across events
              try {
                const oidField = (resp?.objectIdFieldName || resp?.objectIdField || '').trim();
                if (oidField) oidFieldNameRef.current = oidField;
              } catch {}

              // Normalize to GeoJSON FeatureCollection when possible
              let fc: FeatureCollection | null = null;
              if (resp && resp.type === 'FeatureCollection' && Array.isArray(resp.features)) {
                fc = resp as FeatureCollection;
              } else if (resp && Array.isArray(resp.features)) {
                // Convert ArcGIS JSON to GeoJSON using @terraformer/arcgis
                const oidField = resp?.objectIdFieldName || resp?.objectIdField || 'OBJECTID';
                const out: FeatureCollection = { type: 'FeatureCollection', features: [] } as FeatureCollection;
                for (const f of resp.features as any[]) {
                  try {
                    const g = a2g(f, oidField);
                    if (g) (out.features as any).push(g);
                  } catch { }
                }
                fc = out;
              }

              if (fc && Array.isArray(fc.features)) {
                for (const f of fc.features as Feature[]) {
                  try {
                    const { id: fid } = resolveFeatureId(f, f?.properties || {}, true);
                    if (fid == null) continue;
                    // Keep track of params and raw response for precision derivation (quantization, etc.)
                    requestParamsByOid.set(fid, { params, resp } as any);
                    // Opportunistically update properties/geometry with this response
                    if (f?.properties && Object.keys(f.properties).length) {
                      if (!collectedProperties.has(fid)) collectedProperties.set(fid, f.properties);
                    }
                    const precisionInput = toPrecisionInputFromParams({ params, resp });
                    addGeometryToCollection(fid, f?.geometry, precisionInput);
                  } catch { }
                }
                try { if (fc.features.length > 0) sawAnyFeature = true; } catch {}
                report();
              }
            } catch { }
          });
          layer.on('requestend', (_e: any) => {
              try { log.debug('[EsriFeatureLayer] requestend'); /* noop: requestend has no response; handled in requestsuccess */ } catch { }
          });
          layer.on('removefeature', (e: unknown) => {
            try {
              const ev: any = e as any;
              const props = ev?.properties || ev?.layer?.feature?.properties || {};
              const { id: stableId, stable } = resolveFeatureId(ev?.layer?.feature, props);
              // Also compute any direct id to clear potential prior unstable entries
              let directId: any = null;
              try { directId = getFeatureId(ev?.layer?.feature); } catch {}
              const idsToClear = new Set<any>();
              if (stable) idsToClear.add(stableId);
              if (directId != null) idsToClear.add(directId);
              for (const id of idsToClear) {
                collectedGeometries.delete(id);
                collectedGeometriesPrecision.delete(id);
              }
              try { log.debug('[EsriFeatureLayer] removefeature', { id: stable ? stableId : '(unstable)', alsoCleared: directId != null && (!stable || directId !== stableId) ? directId : undefined }); } catch {}
            } catch { }
          });
          layer.on('addfeature', (e: unknown) => {
            try {
              // no-op: suppress noisy addfeature logs
              const ev: any = e as any;
              const props = ev?.properties || ev?.feature?.properties || {};
              const { id: fid, stable } = resolveFeatureId(ev?.feature, props, false);
              // Only add to the collection when we have a stable id to avoid duplicates
              if (stable) {
                if (!collectedProperties.has(fid)) collectedProperties.set(fid, props);
              }
              try {
                const gj = safeToGeoJSON(ev?.feature);
                const geom = (gj && (gj as any).geometry) || ev?.layer?.toGeoJSON?.()?.geometry || null;
                const rp = requestParamsByOid.get(fid);
                const precisionInput = toPrecisionInputFromParams(rp);
                // no-op: suppress geometry debug logs
                if (stable) addGeometryToCollection(fid, geom, precisionInput);
              } catch { }
              try { log.debug('[EsriFeatureLayer] addfeature', { id: stable ? fid : '(unstable)' }); } catch {}
              try { if (stable) sawAnyFeature = true; } catch {}
              if (stable) report();
            } catch { }
          });
        } catch { }
        await new Promise<void>((resolveReady) => {
          try { (map as any).whenReady(resolveReady); } catch { resolveReady(); }
        });
        // Defer one tick to ensure container is fully sized before adding
        await new Promise<void>((r) => setTimeout(() => r(), 0));
        try {
          // Guard against unmounted map
          layer.addTo(map as L.Map);
          log.debug('[EsriFeatureLayer] layer added to map');
          try { (layer as any).bringToFront?.(); } catch { }
          if (styleMode === 'custom') {
            try { (layer as any).setStyle?.(styleFn as any); } catch { }
          }
          if ((layer as any).query) {
            await new Promise<void>((resolve) => {
              (layer as any).query().bounds(async (err: any, latlngbounds: L.LatLngBounds) => {
                if (!err && latlngbounds) {
                  try { log.debug('[EsriFeatureLayer] computed bounds from query'); } catch {}
                  onComputedBounds?.(latlngbounds);
                  resolve();
                  return;
                }
                // Fallback: ask server for 4326 extent
                try {
                  if (!extentFetchRef.current) {
                    extentFetchRef.current = true;
                    const ext = await fetchLayerExtent4326(url);
                    const b2 = ext ? extentToBounds(ext as any) : null;
                    if (b2) {
                      try { log.debug('[EsriFeatureLayer] computed bounds from server extent 4326'); } catch {}
                      onComputedBounds?.(b2);
                      if (!extentToastRef.current) { extentToastRef.current = true; log.warn('Used server-projected extent (4326) fallback for bounds'); }
                    }
                    extentFetchRef.current = false;
                  }
                } catch { }
                resolve();
              });
            });
          } else if (serviceMeta) {
            const b = extentToBounds((serviceMeta as any)?.fullExtent || (serviceMeta as any)?.initialExtent);
            if (b) { try { log.debug('[EsriFeatureLayer] computed bounds from service meta'); } catch {} onComputedBounds?.(b); }
            else {
              // Fallback to server extent
              try {
                if (!extentFetchRef.current) {
                  extentFetchRef.current = true;
                  const ext = await fetchLayerExtent4326(url);
                  const b2 = ext ? extentToBounds(ext as any) : null;
                  if (b2) {
                    try { log.debug('[EsriFeatureLayer] computed bounds from server extent 4326 (service fallback)'); } catch {}
                    onComputedBounds?.(b2);
                    if (!extentToastRef.current) { extentToastRef.current = true; log.warn('Used server-projected extent (4326) fallback for bounds'); }
                  }
                  extentFetchRef.current = false;
                }
              } catch { }
            }
          }
          log.debug('[EsriFeatureLayer] status loaded');
          onStatusChange?.('loaded');
        } catch {
          log.warn('[EsriFeatureLayer] addTo(map) failed; marking loaded anyway');
          onStatusChange?.('loaded');
        }
      } catch {
        try { log.error('[EsriFeatureLayer] top-level error creating feature layer'); } catch {}
        if (!cancelled) onStatusChange?.('error');
      }
    })();

    return () => {
      cancelled = true;
      try { log.debug('[EsriFeatureLayer] cleanup'); } catch {}
      try { onFeatureCollection?.({ type: 'FeatureCollection', features: [] }); } catch { }
      try { hitMgr.destroy(); } catch { }
      if (layer) {
        try { map.removeLayer(layer); } catch { }
      }
    };
  }, [url, where, map, styleMode, JSON.stringify(customStyle || {})]);

  return null;
}

function inferLayerName(serviceMeta: any | null | undefined, layerUrl: string): string | undefined {
  try {
    // Try to get layer id from URL
    const m = String(layerUrl || '').match(/\/(\d+)(?:\/?(?:query)?$)?/);
    const id = m ? Number(m[1]) : undefined;
    if (id != null && serviceMeta && Array.isArray(serviceMeta.layers)) {
      const layer = serviceMeta.layers.find((l: any) => l && l.id === id);
      if (layer && layer.name) return String(layer.name);
    }
    // Fall back to document title / mapName
    const title = (serviceMeta?.documentInfo?.Title && String(serviceMeta.documentInfo.Title).trim())
      || (serviceMeta?.mapName && String(serviceMeta.mapName).trim());
    return title || undefined;
  } catch { return undefined; }
}

function safeToGeoJSON(layer: L.Layer | { toGeoJSON?: () => unknown } | null | undefined): Feature | null {
  try { return (layer as any)?.toGeoJSON?.() || null; } catch { return null; }
}

function toPrecisionInputFromParams(payload: PrecisionPayload): PrecisionInput | undefined {
  try {
    if (!payload) return undefined;
    const pp = (payload as any);
    const params: Record<string, unknown> = (pp?.params || pp) as Record<string, unknown>;
    const resp: any = pp?.resp || {};
    const outSR = Number((params as any).outSR ?? (params as any).outSr ?? (params as any).outsr ?? resp?.spatialReference?.wkid ?? 4326);
    const mao = Number((params as any).maxAllowableOffset ?? (params as any).maxallowableoffset ?? (params as any).mao);
    const gp = Number((params as any).geometryPrecision ?? (params as any).geometryprecision ?? (params as any).gp);
    // Parse bbox center from request geometry
    let xmin: number | null = null, ymin: number | null = null, xmax: number | null = null, ymax: number | null = null;
    const inSR = Number((params as any).inSR ?? (params as any).inSr ?? (params as any).insr ?? 4326);
    const g: unknown = (params as any).geometry;
    if (typeof g === 'string') {
      const parts = g.split(',').map((s: string) => Number(s.trim()));
      if (parts.length === 4 && parts.every(n => Number.isFinite(n))) {
        [xmin, ymin, xmax, ymax] = parts as any;
      }
    } else if (g && typeof g === 'object') {
      xmin = Number((g as any).xmin); ymin = Number((g as any).ymin); xmax = Number((g as any).xmax); ymax = Number((g as any).ymax);
    }
    let lat = 0, lon = 0;
    if ([xmin, ymin, xmax, ymax].every(v => typeof v === 'number' && Number.isFinite(v as number))) {
      const cx = (xmin as number + (xmax as number)) / 2;
      const cy = (ymin as number + (ymax as number)) / 2;
      if (inSR === 4326) { lon = cx; lat = cy; }
      else if (inSR === 3857 || inSR === 102100 || inSR === 102113) { lon = mercXToLon(cx); lat = mercYToLat(cy); }
    }
    // Quantization scale from response.transform.scale
    let quantScale: number | undefined = undefined;
    try {
      if (resp && resp.transform && Array.isArray(resp.transform.scale)) {
        const s = resp.transform.scale;
        const sx = Number(s[0]); const sy = Number(s[1]);
        if (Number.isFinite(sx) && Number.isFinite(sy)) quantScale = Math.max(sx, sy);
      }
    } catch { }
    const out: PrecisionInput = { center: { lat, lon }, outSR };
    if (Number.isFinite(mao)) out.maxAllowableOffset = mao;
    if (Number.isFinite(gp)) out.geometryPrecision = gp;
    if (Number.isFinite(quantScale as any)) out.quantScale = quantScale;
    return out;
  } catch { return undefined; }
}

// Deterministic, order-independent hash from properties for last-resort IDs
function stableHashFromProps(props: Record<string, any> | undefined, excludeKeys: string[] = []): string {
  try {
    const p = props || {};
    const ex = new Set(excludeKeys.map((k) => String(k).toLowerCase()));
    const keys = Object.keys(p)
      .filter((k) => !ex.has(String(k).toLowerCase()))
      .sort((a, b) => a.localeCompare(b));
    const parts: string[] = [];
    for (const k of keys) {
      const v = (p as any)[k];
      if (v === undefined) continue;
      const vs = typeof v === 'string' ? v : (v == null ? '' : JSON.stringify(v));
      parts.push(`${k}=${vs}`);
    }
    const data = parts.join('|');
    // FNV-1a 32-bit
    let h = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) {
      h ^= data.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return `hx_${h.toString(36)}`;
  } catch {
    // Fallback to naive string slice
    try { return `hx_${JSON.stringify(props || {}).slice(0, 64)}`; } catch { return `hx_${Math.random().toString(36).slice(2)}`; }
  }
}

function normalizeStyleOptions(input: GeometryStyleOptions): {
  point: Required<NonNullable<GeometryStyleOptions['point']>>;
  line: Required<NonNullable<GeometryStyleOptions['line']>>;
  polygon: Required<NonNullable<GeometryStyleOptions['polygon']>>;
} {
  const point = input.point || {};
  const line = input.line || {};
  const polygon = input.polygon || {};
  return {
    point: {
      stroke: point.stroke !== false,
      color: point.color || '#3388ff',
      weight: Number.isFinite(point.weight as any) ? Number(point.weight) : 2,
      opacity: Number.isFinite(point.opacity as any) ? Number(point.opacity) : 1,
      fill: point.fill !== false,
      fillColor: point.fillColor || point.color || '#3388ff',
      fillOpacity: Number.isFinite(point.fillOpacity as any) ? Number(point.fillOpacity) : 0.2,
      radius: Number.isFinite(point.radius as any) ? Number(point.radius) : 6,
    },
    line: {
      stroke: line.stroke !== false,
      color: line.color || '#3388ff',
      weight: Number.isFinite(line.weight as any) ? Number(line.weight) : 2,
      opacity: Number.isFinite(line.opacity as any) ? Number(line.opacity) : 1,
      lineCap: (line.lineCap as any) || 'round',
      lineJoin: (line.lineJoin as any) || 'round',
      dashArray: (line.dashArray as any) || '',
      dashOffset: (line.dashOffset as any) || '',
    },
    polygon: {
      stroke: polygon.stroke !== false,
      color: polygon.color || '#3388ff',
      weight: Number.isFinite(polygon.weight as any) ? Number(polygon.weight) : 2,
      opacity: Number.isFinite(polygon.opacity as any) ? Number(polygon.opacity) : 1,
      lineCap: (polygon.lineCap as any) || 'round',
      lineJoin: (polygon.lineJoin as any) || 'round',
      dashArray: (polygon.dashArray as any) || '',
      dashOffset: (polygon.dashOffset as any) || '',
      fill: polygon.fill !== false,
      fillColor: polygon.fillColor || polygon.color || '#3388ff',
      fillOpacity: Number.isFinite(polygon.fillOpacity as any) ? Number(polygon.fillOpacity) : 0.2,
      fillRule: (polygon.fillRule as any) || 'evenodd',
    },
  } as any;
}

function mercXToLon(x: number): number {
  const R = 6378137;
  return (x / R) * (180 / Math.PI);
}
function mercYToLat(y: number): number {
  const R = 6378137;
  return (Math.atan(Math.sinh(y / R)) * 180) / Math.PI;
}

function effectiveMetersFromPrecision(input: PrecisionInput | undefined, map: L.Map): number {
  try {
    const fallback = approxPrecisionMeters(map);
    if (!input) return fallback;
    const lat = Number(input.center?.lat ?? 0) || (map?.getCenter ? Number(map.getCenter().lat) : 0) || 0;
    const outSR = Number(input.outSR ?? 4326);
    const candidates: number[] = [];
    // Quantization dominates if present
    if (Number.isFinite(input.quantScale)) {
      if (outSR === 4326) {
        const perDeg = offsetMeters4326(1, lat).approxMeters;
        candidates.push(perDeg * Number(input.quantScale));
      } else if (outSR === 3857 || outSR === 102100 || outSR === 102113) {
        candidates.push(Number(input.quantScale));
      }
    }
    // maxAllowableOffset
    if (Number.isFinite(input.maxAllowableOffset)) {
      const mao = Number(input.maxAllowableOffset);
      if (outSR === 4326) candidates.push(offsetMeters4326(mao, lat).approxMeters);
      else candidates.push(Math.abs(mao));
    }
    // geometryPrecision (decimal places)
    if (Number.isFinite(input.geometryPrecision)) {
      const gp = Number(input.geometryPrecision);
      if (gp >= 0) {
        if (outSR === 4326) {
          const stepDeg = Math.pow(10, -gp);
          const perDeg = offsetMeters4326(1, lat).approxMeters;
          candidates.push(stepDeg * perDeg);
        } else if (outSR === 3857 || outSR === 102100 || outSR === 102113) {
          // decimal places in meters; step = 10^-gp meters
          candidates.push(Math.pow(10, -gp));
        }
      }
    }
    candidates.push(fallback);
    // Effective precision is the dominant (largest) limit
    return Math.max(...candidates.filter((n) => Number.isFinite(n) && n > 0));
  } catch { return approxPrecisionMeters(map); }
}
