import React, { useEffect, useRef, useState, startTransition } from 'react';
import { ToastContainer, ToastOptions, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import MapView from './components/MapView';
import MapLegend, { type LegendHighlight } from './components/MapLegend';
import ErrorBoundary from './components/ErrorBoundary';
import { beautifyWhere, normalizeWhereInput, validateWhere } from './lib/whereUtils';
import WhereEditor, { type WhereEditorHandle } from './components/WhereEditor';
import type { Extent } from './lib/types/arcgis-rest';
import FlashButton from './components/ui/FlashButton';
import MoreInfoOverlay from './components/MoreInfoOverlay';
import Sidebar, { type ExportProgress } from './components/sidebar/components/Sidebar';
import SelectTab, { type SelectTabHandle } from './components/sidebar/tabs/SelectTab';
import type { GeometryStyleOptions, AttributeStyleOptions, StyleMode, CategoryStop, NumericStop } from './lib/styleOptions';
import { defaultStyleOptions } from './lib/styleOptions';
import { classifyCategorical, classifyNumeric, inferSubMode } from './lib/classifyField';
import { QUALITATIVE_PALETTES, SEQUENTIAL_PALETTES } from './lib/colorPalettes';
import type { MapServiceInfo, MapServiceLayerInfo } from './lib/types/arcgis-rest';
import { resolveEsriLayer, fetchLayerMetadata, fetchFeatureCount, fetchFeatureCountInExtent } from './lib/esriLayer';
import { extentFromFeatures } from './lib/geometry';
import { findFeatureById, getFeatureId } from './lib/ids';
import { getRestServiceUrlInfo } from './lib/arcgis';
import { buildRecentLayerEntry, pushRecentLayerEntry } from './lib/layerFinderRecent';
import type { DuplicateFeatureSummary } from './lib/dedupeFeatures';

function coerceUrlInput(raw: string): string {
  const cleaned = String(raw || '').trim().replace(/\s+/g, '').replace(/\/$/, '');
  if (!cleaned) return '';
  if (/^[a-z]+:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith('//')) return `https:${cleaned}`;
  return `https://${cleaned}`;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function getInitialUrl(): string {
  const params = new URLSearchParams(location.search);
  const raw = params.get('url') || '';
  const coerced = coerceUrlInput(raw);
  if (!coerced || !isValidUrl(coerced)) return '';
  if (!/\/rest\/services/i.test(coerced)) return '';
  return coerced;
}

function getInitialWhere(): string {
  try {
    const params = new URLSearchParams(location.search);
    const w = params.get('where');
    if (typeof w === 'string' && w.trim().length) return w;
  } catch { }
  return '1=1';
}

function isTrivialWhere(s: string | undefined | null): boolean {
  try {
    const noSpace = String(s || '').replace(/\s+/g, '').toLowerCase();
    return noSpace === '1=1';
  } catch { return false; }
}

function normalizeWhereText(s: string | undefined | null): string {
  return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function summarizeWhereLabel(s: string | undefined | null, maxLength: number = 56): string {
  const cleaned = String(s || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '1=1';
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function normalizeExtentKey(bbox: string | undefined | null, decimals: number = 4): string {
  try {
    const parts = String(bbox || '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value));
    if (parts.length !== 4) return '';
    return parts.map((value) => value.toFixed(decimals)).join(',');
  } catch {
    return '';
  }
}

function buildPerfWarningKey(layerUrl: string | null | undefined, bbox: string | undefined | null, where: string | undefined | null): string {
  const cleanLayerUrl = String(layerUrl || '').replace(/\/+$/, '');
  const extentKey = normalizeExtentKey(bbox);
  if (!cleanLayerUrl || !extentKey) return '';
  return `${cleanLayerUrl}|${normalizeWhereText(where) || '1=1'}|${extentKey}`;
}

type ViewBounds = { minX: number; minY: number; maxX: number; maxY: number };

function parseBboxBounds(bbox: string | undefined | null): ViewBounds | null {
  try {
    const parts = String(bbox || '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((value) => Number.isFinite(value));
    if (parts.length !== 4) return null;
    const [x1, y1, x2, y2] = parts as [number, number, number, number];
    return {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2),
    };
  } catch {
    return null;
  }
}

function boundsIntersect(a: ViewBounds, b: ViewBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function normalizeFeatureBbox(bbox: unknown): ViewBounds | null {
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  const values = bbox.slice(0, 4).map((value) => Number(value));
  if (!values.every((value) => Number.isFinite(value))) return null;
  const [x1, y1, x2, y2] = values as [number, number, number, number];
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  };
}

function geometryBounds(geometry: any): ViewBounds | null {
  if (!geometry) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const addCoord = (coord: any[]) => {
    const x = Number(coord?.[0]);
    const y = Number(coord?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  const visit = (value: any) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      addCoord(value);
      return;
    }
    value.forEach(visit);
  };

  if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
    geometry.geometries.forEach((item: any) => visit(item?.coordinates));
  } else {
    visit(geometry.coordinates);
  }

  if (![minX, minY, maxX, maxY].every((value) => Number.isFinite(value))) return null;
  return { minX, minY, maxX, maxY };
}

function featureBounds(feature: any): ViewBounds | null {
  return normalizeFeatureBbox(feature?.bbox) || geometryBounds(feature?.geometry);
}

function countFeaturesInBbox(featureCollection: any, bbox: string | undefined | null): number {
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
  const view = parseBboxBounds(bbox);
  if (!view) return features.length;
  let count = 0;
  for (const feature of features) {
    const bounds = featureBounds(feature);
    if (bounds && boundsIntersect(bounds, view)) count += 1;
  }
  return count;
}

function parseExtentParam(): Extent | null {
  try {
    const params = new URLSearchParams(location.search);
    const raw = params.get('extent') || params.get('bbox');
    if (!raw) return null;
    const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length !== 4) return null;
    const nums = parts.map(Number);
    if (!nums.every(n => Number.isFinite(n))) return null;
    const [xmin, ymin, xmax, ymax] = nums as [number, number, number, number];
    if (!(xmax > xmin && ymax > ymin)) return null;
    return { xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326 } } as Extent;
  } catch { return null; }
}

function parseCenterParam(): { center: [number, number] | null; zoom: number | null } {
  try {
    const params = new URLSearchParams(location.search);
    const c = params.get('center');
    const z = params.get('z');
    let center: [number, number] | null = null;
    let zoom: number | null = null;
    if (c) {
      const parts = c.split(',').map(s => s.trim());
      if (parts.length === 2) {
        const lat = Number(parts[0]);
        const lng = Number(parts[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) center = [lat, lng];
      }
    }
    if (z) {
      const n = Number(z);
      if (Number.isFinite(n)) zoom = n;
    }
    return { center, zoom };
  } catch { return { center: null, zoom: null }; }
}

function formatUrlNumber(value: number): string {
  return value.toFixed(6);
}

function formatExtentForUrl(ext: Extent | null): string {
  if (!ext) return '';
  const nums = [ext.xmin, ext.ymin, ext.xmax, ext.ymax].map(Number);
  if (!nums.every((n) => Number.isFinite(n))) return '';
  return nums.map(formatUrlNumber).join(',');
}

function formatCenterForUrl(center: [number, number] | null): string {
  if (!center) return '';
  const [lat, lng] = center;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  return `${formatUrlNumber(lat)},${formatUrlNumber(lng)}`;
}

function getInitialBasemap(): 'carto_positron' | 'usgs_topo' | 'usgs_imagery_topo' | 'usgs_imagery' | 'osm' | 'carto_dark' | 'carto_voyager' | 'esri_worldimagery' | 'opentopomap' {
  const allowed = new Set(['carto_positron', 'usgs_topo', 'usgs_imagery_topo', 'usgs_imagery', 'osm', 'carto_dark', 'carto_voyager', 'esri_worldimagery', 'opentopomap']);
  try {
    const v = new URLSearchParams(location.search).get('basemap') || '';
    const key = v.toLowerCase();
    if (allowed.has(key)) return key as any;
  } catch { }
  return 'carto_positron';
}

function getInitialTab(): 'select' | 'details' | 'query' | 'data' | 'download' | 'style' {
  const allowed = new Set(['select', 'details', 'query', 'data', 'download', 'style', 'inspect']);
  try {
    const v = (new URLSearchParams(location.search).get('tab') || '').toLowerCase();
    if (v === 'inspect') return 'data';
    if (allowed.has(v)) return v as any;
  } catch { }
  return 'select';
}

function getInitialSelectedId(): string | number | null {
  try {
    const id = new URLSearchParams(location.search).get('id');
    if (id == null || id === '') return null;
    const asNum = Number(id);
    return Number.isFinite(asNum) ? asNum : id;
  } catch { return null; }
}

function getInitialStyleMode(): StyleMode {
  try {
    const v = (new URLSearchParams(location.search).get('styleMode') || '').toLowerCase();
    if (v === 'custom') return 'custom';
    if (v === 'attribute') return 'attribute';
    return 'server';
  } catch { return 'server'; }
}

function getInitialStyleOptions(): GeometryStyleOptions {
  try {
    const raw = new URLSearchParams(location.search).get('style');
    if (!raw) return applyLegacyLegendVisibility({ ...defaultStyleOptions });
    return applyLegacyLegendVisibility(decodeStyle(raw));
  } catch { return applyLegacyLegendVisibility({ ...defaultStyleOptions }); }
}

function getInitialAttributeStyle(): AttributeStyleOptions {
  try {
    const raw = new URLSearchParams(location.search).get('astyle');
    if (!raw) return {};
    return decodeAttributeStyle(raw);
  } catch { return {}; }
}

function getInitialLegendCollapsed(): boolean {
  try {
    const v = (new URLSearchParams(location.search).get('legend') || '').toLowerCase();
    return v === '0' || v === 'false' || v === 'collapsed';
  } catch { return false; }
}

function applyLegacyLegendVisibility(options: GeometryStyleOptions): GeometryStyleOptions {
  try {
    const v = (new URLSearchParams(location.search).get('legend') || '').toLowerCase();
    if (v !== 'hidden') return options;
    return {
      ...options,
      display: {
        ...options.display,
        showLegend: false,
      },
    };
  } catch {
    return options;
  }
}

// --- Geometry style URL (de)serialization -----------------------------------
// Validate one style section (point/line/polygon/label) against the matching
// defaults: only known keys whose value type matches the default are kept, so a
// hand-edited or truncated URL can't inject junk into MapLibre. Missing keys
// fall back to defaults, which also lets us store only the changed properties.
function sanitizeStyleSection<T extends Record<string, any>>(input: any, defaults: T): T {
  const out: any = { ...defaults };
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const key of Object.keys(defaults)) {
      const dv = (defaults as any)[key];
      const iv = input[key];
      if (iv === undefined || iv === null) continue;
      if (typeof iv === typeof dv && (typeof iv !== 'number' || Number.isFinite(iv))) out[key] = iv;
    }
  }
  return out;
}

function sanitizeGeometryStyle(obj: any): GeometryStyleOptions {
  return {
    point: sanitizeStyleSection(obj?.point, defaultStyleOptions.point as Record<string, any>),
    line: sanitizeStyleSection(obj?.line, defaultStyleOptions.line as Record<string, any>),
    polygon: sanitizeStyleSection(obj?.polygon, defaultStyleOptions.polygon as Record<string, any>),
    label: sanitizeStyleSection(obj?.label, defaultStyleOptions.label as Record<string, any>),
    display: sanitizeStyleSection(obj?.display, defaultStyleOptions.display as Record<string, any>),
    raster: sanitizeStyleSection(obj?.raster, defaultStyleOptions.raster as Record<string, any>),
  };
}

// Keep only the properties that differ from the defaults so the `style` param
// stays short and readable (e.g. {"polygon":{"fillColor":"#ff0000"}}). Decoding
// merges back onto defaults, so dropped keys round-trip correctly.
function diffStyleSection(opts: any, defaults: Record<string, any>): Record<string, any> | undefined {
  if (!opts || typeof opts !== 'object') return undefined;
  const out: Record<string, any> = {};
  for (const key of Object.keys(defaults)) {
    const ov = opts[key];
    if (ov !== undefined && ov !== defaults[key]) out[key] = ov;
  }
  return Object.keys(out).length ? out : undefined;
}

function encodeStyle(opts: GeometryStyleOptions): string {
  // Returns '{}' when nothing differs from defaults, so the caller can omit the
  // param entirely rather than dump a full default blob into the URL.
  try {
    const min: Record<string, any> = {};
    const point = diffStyleSection(opts?.point, defaultStyleOptions.point as Record<string, any>);
    const line = diffStyleSection(opts?.line, defaultStyleOptions.line as Record<string, any>);
    const polygon = diffStyleSection(opts?.polygon, defaultStyleOptions.polygon as Record<string, any>);
    const label = diffStyleSection(opts?.label, defaultStyleOptions.label as Record<string, any>);
    const display = diffStyleSection(opts?.display, defaultStyleOptions.display as Record<string, any>);
    const raster = diffStyleSection(opts?.raster, defaultStyleOptions.raster as Record<string, any>);
    if (point) min.point = point;
    if (line) min.line = line;
    if (polygon) min.polygon = polygon;
    if (label) min.label = label;
    if (display) min.display = display;
    if (raster) min.raster = raster;
    return JSON.stringify(min);
  } catch { return '{}'; }
}

function decodeStyle(s: string): GeometryStyleOptions {
  // Accept raw JSON (current format) or legacy base64-encoded JSON, then
  // validate/merge onto defaults via sanitizeGeometryStyle.
  let obj: any = null;
  const looksLikeJson = s.trim().startsWith('{') || s.trim().startsWith('[');
  if (looksLikeJson) {
    try { obj = JSON.parse(s); } catch { obj = null; }
  } else {
    try {
      let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0;
      if (pad) b64 += '='.repeat(pad);
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      obj = JSON.parse(new TextDecoder().decode(bytes));
    } catch { obj = null; }
  }
  return sanitizeGeometryStyle(obj);
}

// --- Attribute (color-by-field) style URL (de)serialization -----------------
function encodeAttributeStyle(opts: AttributeStyleOptions): string {
  // Own param so it stays independent of the geometry `style`. Keep the full
  // editor-visible rule here: colors, enabled classes, labels, counts, and
  // lightweight UI metadata should all survive a shared-link round trip.
  try {
    const rule = opts?.rule;
    if (!rule) return '';
    const meta = opts.meta && Object.keys(opts.meta).length ? { meta: opts.meta } : {};
    return JSON.stringify({ rule, ...meta });
  } catch { return ''; }
}

function sanitizeAttributeStyle(obj: any): AttributeStyleOptions {
  const rule = obj?.rule;
  if (!rule || typeof rule !== 'object') return {};
  const field = typeof rule.field === 'string' ? rule.field : '';
  if (!field || !Array.isArray(rule.stops)) return {};
  const fallbackColor = typeof rule.fallbackColor === 'string' ? rule.fallbackColor : '#aaaaaa';
  if (rule.kind === 'categorical') {
    const stops: CategoryStop[] = rule.stops
      .filter((st: any) => st && typeof st === 'object' && typeof st.color === 'string')
      .map((st: any) => ({
        value: (typeof st.value === 'string' || typeof st.value === 'number' || st.value === null) ? st.value : null,
        color: st.color,
        ...(typeof st.label === 'string' ? { label: st.label } : {}),
        enabled: typeof st.enabled === 'boolean' ? st.enabled : true,
        ...(Number.isFinite(st.count) ? { count: st.count } : {}),
      }));
    if (!stops.length) return {};
    return withAttributeMeta({ rule: { kind: 'categorical', field, channel: 'color', stops, fallbackColor } }, obj?.meta);
  }
  if (rule.kind === 'numeric') {
    const stops: NumericStop[] = rule.stops
      .filter((st: any) => st && typeof st === 'object' && Number.isFinite(st.value) && typeof st.color === 'string')
      .map((st: any) => ({ value: st.value, color: st.color }));
    if (!stops.length) return {};
    return withAttributeMeta({ rule: { kind: 'numeric', field, channel: 'color', stops, fallbackColor } }, obj?.meta);
  }
  return {};
}

function withAttributeMeta(style: AttributeStyleOptions, rawMeta: any): AttributeStyleOptions {
  if (!rawMeta || typeof rawMeta !== 'object') return style;
  const meta: NonNullable<AttributeStyleOptions['meta']> = {};
  if (typeof rawMeta.paletteId === 'string' && rawMeta.paletteId) meta.paletteId = rawMeta.paletteId;
  return Object.keys(meta).length ? { ...style, meta } : style;
}

function decodeAttributeStyle(s: string): AttributeStyleOptions {
  try { return sanitizeAttributeStyle(JSON.parse(s)); } catch { return {}; }
}

export default function App() {
  const SWIPE_THRESHOLD_PX = 35; // horizontal movement required to trigger open/close
  const initialCenterZoom = parseCenterParam();
  const hasInitialCamera = !!initialCenterZoom.center && initialCenterZoom.zoom != null;
  const [serviceUrl, setServiceUrl] = useState<string>(getInitialUrl());
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    try { return window.matchMedia('(max-width: 768px)').matches; } catch { return false; }
  });
  const [selectedMapLayerId, setSelectedMapLayerId] = useState<number | undefined>(undefined);
  const [bbox, setBbox] = useState<string>(() => formatExtentForUrl(parseExtentParam()));
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return !window.matchMedia('(max-width: 1024px)').matches; } catch { return true; }
  });
  const [center, setCenter] = useState<string>(() => formatCenterForUrl(initialCenterZoom.center));
  const [zoom, setZoom] = useState<number>(initialCenterZoom.zoom || 0);
  const [mapPositionReady, setMapPositionReady] = useState<boolean>(false);
  const [mouse, setMouse] = useState<string>('');
  const [infoOpen, setInfoOpen] = useState<boolean>(false);
  const [coordOrder, setCoordOrder] = useState<'lng-lat' | 'lat-lng'>('lng-lat');
  const [gdal, setGdal] = useState<boolean>(false);
  const [zoomToExtent, setZoomToExtent] = useState<Extent | null>(() => hasInitialCamera ? null : parseExtentParam());
  const [serviceMeta, setServiceMeta] = useState<MapServiceInfo | null>(null);
  const [layerMeta, setLayerMeta] = useState<MapServiceLayerInfo | null>(null);
  const [featureCount, setFeatureCount] = useState<number | null>(null);
  const [layerDataRows, setLayerDataRows] = useState<any[]>([]);
  const [featureCollection, setFeatureCollection] = useState<any>({ type: 'FeatureCollection', features: [] });
  const [suspectedDuplicateIds, setSuspectedDuplicateIds] = useState<Array<string | number>>([]);
  const [renderMode, setRenderMode] = useState<'feature' | 'dynamic' | 'fallback_dynamic' | 'image' | 'vector'>('feature');
  const [layerOpacity, setLayerOpacity] = useState<number>(1);
  const [downloadedExtent, setDownloadedExtent] = useState<Extent | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | undefined>(undefined);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | number | null>(getInitialSelectedId());
  // Bidirectional hover link between the map and the Data tab table.
  const [mapHoverId, setMapHoverId] = useState<string | number | null>(null); // hovered on the map → highlight its row
  const [tableHoverId, setTableHoverId] = useState<string | number | null>(null); // hovered a row → highlight on the map
  const [flashFeature, setFlashFeature] = useState<any | null>(null);
  const [zoomToLayerToken, setZoomToLayerToken] = useState<number | null>(null);
  const [isLoadingService, setIsLoadingService] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [renderStatus, setRenderStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [autoFetchEnabled, setAutoFetchEnabled] = useState<boolean>(true);
  const PERF_WARN_THRESHOLD = 20000;
  const PERF_COUNT_CACHE_MAX = 80;
  const [perfWarning, setPerfWarning] = useState<{ count: number; warningKey: string; source: 'preflight' | 'loaded' } | null>(null);
  const [perfCheckPending, setPerfCheckPending] = useState(false);
  const perfDismissedRef = useRef<Set<string>>(new Set());
  const perfCountCacheRef = useRef<Map<string, number>>(new Map());
  const perfCountControllerRef = useRef<AbortController | null>(null);
  const headerFinderRef = useRef<SelectTabHandle | null>(null);
  const metaControllerRef = React.useRef<AbortController | null>(null);
  const resolvedLayer = React.useMemo(() => {
    const normalized = coerceUrlInput(serviceUrl);
    if (!serviceUrl || !isValidUrl(normalized) || !/\/rest\/services/i.test(normalized)) {
      return { type: 'unknown', url: null, serviceRootUrl: null } as any;
    }
    try { return resolveEsriLayer(serviceUrl, selectedMapLayerId); } catch { return { type: 'unknown', url: null, serviceRootUrl: null } as any; }
  }, [serviceUrl, selectedMapLayerId]);
  const isFeatureLayer = (resolvedLayer as any)?.type === 'feature';
  const [where, setWhere] = useState<string>(getInitialWhere());
  const [whereInput, setWhereInput] = useState<string>(getInitialWhere());
  const perfWarningKey = React.useMemo(
    () => buildPerfWarningKey((resolvedLayer as any)?.url || '', bbox, where),
    [resolvedLayer, bbox, where]
  );
  const dismissPerfWarning = React.useCallback(() => {
    const warningKey = perfWarning?.warningKey || perfWarningKey;
    if (warningKey) perfDismissedRef.current.add(warningKey);
    try { perfCountControllerRef.current?.abort(); } catch {}
    perfCountControllerRef.current = null;
    setPerfCheckPending(false);
    setPerfWarning(null);
  }, [perfWarning, perfWarningKey]);
  const [isHeaderFilterOpen, setIsHeaderFilterOpen] = useState<boolean>(false);
  const headerWhereEditorRef = useRef<WhereEditorHandle | null>(null);
  const layerErrorGateRef = useRef<{ url: string; last: number }>({ url: '', last: 0 });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = Number(localStorage.getItem('sidebarWidth') || '0');
    try {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const min = vw <= 768 ? 200 : 240;
      const max = Math.max(min, vw - 100);
      if (Number.isFinite(stored) && stored > 0) return Math.min(Math.max(stored, min), max);
      const target = Math.round(vw * 0.4);
      return Math.min(Math.max(target, min), max);
    } catch { return 480; }
  });
  // Track viewport to toggle mobile overlay behavior
  useEffect(() => {
    try {
      const mq = window.matchMedia('(max-width: 768px)');
      const update = () => setIsMobile(!!mq.matches);
      mq.addEventListener ? mq.addEventListener('change', update) : (mq as any).addListener(update);
      update();
      return () => { mq.removeEventListener ? mq.removeEventListener('change', update) : (mq as any).removeListener(update); };
    } catch {}
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.shiftKey || event.altKey) return;
      if (String(event.key || '').toLowerCase() !== 'k') return;
      event.preventDefault();
      headerFinderRef.current?.focusFinder();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  // Header overflow menu state
  const [showHeaderMenu, setShowHeaderMenu] = useState<boolean>(false);
  const headerMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [basemap, setBasemap] = useState<any>(getInitialBasemap());
  const [activeTab, setActiveTab] = useState<'select' | 'details' | 'query' | 'data' | 'download' | 'style'>(getInitialTab());
  // Sidebar resize interaction is handled with transient listeners; no state needed
  const toastSeenRef = useRef<Map<string, number>>(new Map());
  const showToast = (msg: string, options: ToastOptions = {}) => {
    try {
      const now = Date.now();
      const win = 100; // ms
      const map = toastSeenRef.current;
      // purge stale
      for (const [m, t] of Array.from(map.entries())) { if (now - t > win) map.delete(m); }
      const last = map.get(msg) || 0;
      if (now - last <= win) return;
      map.set(msg, now);
      toast(msg, { autoClose: 1400, ...options });
    } catch { }
  };

  const inMemoryFeatureCount = React.useMemo(() => {
    try {
      return Array.isArray(featureCollection?.features) ? featureCollection.features.length : 0;
    } catch {
      return 0;
    }
  }, [featureCollection]);
  const inViewFeatureCount = React.useMemo(
    () => countFeaturesInBbox(featureCollection, bbox),
    [featureCollection, bbox]
  );
  const hasActiveWhere = !isTrivialWhere(where);
  const allFeaturesLoadedInMemory = React.useMemo(() => {
    if (!isFeatureLayer || hasActiveWhere) return false;
    if (typeof featureCount !== 'number') return false;
    const total = featureCount;
    if (!Number.isFinite(total) || total < 0) return false;
    return inMemoryFeatureCount >= total;
  }, [featureCount, hasActiveWhere, inMemoryFeatureCount, isFeatureLayer]);

  useEffect(() => {
    if (!autoFetchEnabled) {
      setPerfWarning((current) => current?.source === 'loaded' ? null : current);
      return;
    }
    if (!perfWarningKey) {
      setPerfWarning((current) => current?.source === 'loaded' ? null : current);
      return;
    }
    if (renderStatus !== 'loaded' || perfCheckPending) {
      setPerfWarning((current) => current?.source === 'loaded' ? null : current);
      return;
    }
    if (inViewFeatureCount <= 0) {
      setPerfWarning((current) => current?.source === 'loaded' ? null : current);
      return;
    }
    if (inViewFeatureCount > PERF_WARN_THRESHOLD && !perfDismissedRef.current.has(perfWarningKey)) {
      setPerfWarning({ count: inViewFeatureCount, warningKey: perfWarningKey, source: 'loaded' });
      return;
    }
    setPerfWarning((current) => (current?.source === 'loaded' ? null : current));
  }, [autoFetchEnabled, inViewFeatureCount, perfWarningKey, PERF_WARN_THRESHOLD, renderStatus, perfCheckPending]);

  useEffect(() => {
    const abortCurrentCheck = () => {
      try { perfCountControllerRef.current?.abort(); } catch {}
      perfCountControllerRef.current = null;
    };

    if (!autoFetchEnabled || !isFeatureLayer || renderMode !== 'feature' || !(resolvedLayer as any)?.url) {
      abortCurrentCheck();
      setPerfCheckPending(false);
      setPerfWarning((current) => current?.source === 'preflight' ? null : current);
      return;
    }
    if (!perfWarningKey) {
      abortCurrentCheck();
      setPerfCheckPending(false);
      setPerfWarning((current) => current?.source === 'preflight' ? null : current);
      return;
    }
    if (perfDismissedRef.current.has(perfWarningKey)) {
      abortCurrentCheck();
      setPerfCheckPending(false);
      setPerfWarning((current) => current?.source === 'preflight' ? null : current);
      return;
    }
    if (allFeaturesLoadedInMemory) {
      abortCurrentCheck();
      const localCount = inViewFeatureCount;
      const cache = perfCountCacheRef.current;
      cache.delete(perfWarningKey);
      cache.set(perfWarningKey, localCount);
      while (cache.size > PERF_COUNT_CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (!oldest) break;
        cache.delete(oldest);
      }
      setPerfCheckPending(false);
      if (localCount > PERF_WARN_THRESHOLD) {
        setPerfWarning({ count: localCount, warningKey: perfWarningKey, source: 'preflight' });
      } else {
        setPerfWarning((current) => current?.source === 'preflight' ? null : current);
      }
      return;
    }
    const cached = perfCountCacheRef.current.get(perfWarningKey);
    if (typeof cached === 'number') {
      perfCountCacheRef.current.delete(perfWarningKey);
      perfCountCacheRef.current.set(perfWarningKey, cached);
      setPerfCheckPending(false);
      if (cached > PERF_WARN_THRESHOLD) {
        setPerfWarning({ count: cached, warningKey: perfWarningKey, source: 'preflight' });
      } else {
        setPerfWarning((current) => current?.source === 'preflight' ? null : current);
      }
      return;
    }

    const controller = new AbortController();
    abortCurrentCheck();
    perfCountControllerRef.current = controller;
    setPerfCheckPending(true);
    setPerfWarning((current) => current?.source === 'preflight' ? null : current);

    const timeoutId = window.setTimeout(() => {
      void fetchFeatureCountInExtent((resolvedLayer as any).url, bbox, where, { signal: controller.signal })
        .then((count) => {
          if (controller.signal.aborted) return;
          const cache = perfCountCacheRef.current;
          cache.delete(perfWarningKey);
          cache.set(perfWarningKey, count);
          while (cache.size > PERF_COUNT_CACHE_MAX) {
            const oldest = cache.keys().next().value;
            if (!oldest) break;
            cache.delete(oldest);
          }
          setPerfCheckPending(false);
          if (perfDismissedRef.current.has(perfWarningKey)) {
            setPerfWarning((current) => current?.source === 'preflight' ? null : current);
            return;
          }
          if (count > PERF_WARN_THRESHOLD) {
            setPerfWarning({ count, warningKey: perfWarningKey, source: 'preflight' });
            return;
          }
          setPerfWarning((current) => current?.source === 'preflight' ? null : current);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          setPerfCheckPending(false);
          setPerfWarning((current) => current?.source === 'preflight' ? null : current);
          if (String((error as Error)?.name || '') === 'AbortError') return;
        });
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      if (perfCountControllerRef.current === controller) perfCountControllerRef.current = null;
      setPerfCheckPending(false);
    };
  }, [autoFetchEnabled, bbox, where, isFeatureLayer, perfWarningKey, renderMode, resolvedLayer, allFeaturesLoadedInMemory, inViewFeatureCount, PERF_WARN_THRESHOLD]);

  // (Removed) Service Worker registration for share links no longer needed

  // Build samples for autocomplete in header WHERE editor
  const fieldsWithAliases = React.useMemo(() => {
    try {
      const metaFields = (layerMeta?.fields || []).map((f: any) => ({ name: String(f?.name || ''), alias: String(f?.alias || ''), type: String(f?.type || ''), length: typeof f?.length === 'number' ? f.length : undefined })).filter((f: any) => f.name);
      if (metaFields.length) return metaFields;
    } catch {}
    // Fallback: infer from current data if layerMeta not available
    const keys = new Set<string>();
    try {
      const rows: any[] = Array.isArray(layerDataRows) && layerDataRows.length > 0
        ? layerDataRows
        : (Array.isArray(featureCollection?.features)
            ? featureCollection.features.map((f: any) => (f && f.properties) || {})
            : []);
      for (const row of rows) for (const k of Object.keys(row || {})) keys.add(k);
    } catch {}
    return Array.from(keys).map((k) => ({ name: k, alias: k }));
  }, [layerMeta, layerDataRows, featureCollection]);
  const fieldNames = React.useMemo(() => fieldsWithAliases.map(f => f.name), [fieldsWithAliases]);
  const fieldAliasMap = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const f of fieldsWithAliases) { if (f.alias && f.alias !== f.name) m[f.name] = f.alias; }
    return m;
  }, [fieldsWithAliases]);
  const fieldsMeta = React.useMemo(() => fieldsWithAliases.map(f => ({ name: f.name, type: (f as any).type, length: (f as any).length })), [fieldsWithAliases]);
  const [whereIssues, setWhereIssues] = useState<{ errors: string[]; unknown: string[]; warnings: string[] }>({ errors: [], unknown: [], warnings: [] });
  const [dismissedIssuesKey, setDismissedIssuesKey] = useState<string>('');
  const hasFilterableLayer = isFeatureLayer && Boolean((resolvedLayer as any)?.url);
  const hasPendingWhereChanges = normalizeWhereText(whereInput) !== normalizeWhereText(where);
  const filterIssueCount = whereIssues.errors.length + whereIssues.unknown.length + whereIssues.warnings.length;
  const filterIssueTitle = [
    ...whereIssues.errors,
    (whereIssues.unknown.length ? `Unknown fields: ${whereIssues.unknown.join(', ')}` : ''),
    (whereIssues.warnings.length ? `Warnings: ${whereIssues.warnings.join('; ')}` : ''),
  ].filter(Boolean).join('\n');

  const flashFeatureOnMap = React.useCallback((id: string | number | null) => {
    setSelectedFeatureId(id);
    if (id == null) return;
    try {
      const f = findFeatureById(featureCollection as any, id as any);
      if (f) {
        setFlashFeature(f);
      }
    } catch {}
  }, [featureCollection]);

  const zoomToFeatureOnMap = React.useCallback((id: string | number | null) => {
    setSelectedFeatureId(id);
    if (id == null) return;
    try {
      const f = findFeatureById(featureCollection as any, id as any);
      if (f) {
        const ext = extentFromFeatures([f as any]);
        if (ext) setZoomToExtent(ext);
      }
    } catch {}
  }, [featureCollection]);

  useEffect(() => {
    try {
      const res = validateWhere(whereInput || '', new Set(fieldNames.map(s => s.toUpperCase())), fieldsMeta as any);
      setWhereIssues(res as any);
    } catch { setWhereIssues({ errors: [], unknown: [], warnings: [] }); }
    // Reset dismissal when text changes
    setDismissedIssuesKey('');
  }, [whereInput, fieldNames, JSON.stringify(fieldsMeta || [])]);
  useEffect(() => {
    if (hasFilterableLayer) return;
    setIsHeaderFilterOpen(false);
  }, [hasFilterableLayer]);
  useEffect(() => {
    if (!isHeaderFilterOpen) return;
    const timer = window.setTimeout(() => {
      try { headerWhereEditorRef.current?.focus(); } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isHeaderFilterOpen]);
  const headerValueSamples = React.useMemo(() => {
    const out: Record<string, unknown[]> = {};
    const limitPerField = 200;
    const pushVal = (k: string, v: unknown) => {
      if (v == null) return;
      const arr = (out[k] ||= []);
      if (arr.length >= limitPerField) return;
      if (!arr.some((x) => String(x) === String(v))) arr.push(v);
    };
    try {
      const rows: any[] = Array.isArray(layerDataRows) && layerDataRows.length > 0
        ? layerDataRows
        : (Array.isArray(featureCollection?.features)
            ? featureCollection.features.map((f: any) => (f && f.properties) || {})
            : []);
      for (const row of rows) {
        for (const k of Object.keys(row || {})) pushVal(k, (row as any)[k]);
      }
    } catch { }
    return out;
  }, [layerDataRows, featureCollection]);

  // Theme state: follow saved preference; else default to OS setting
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') return saved as 'dark' | 'light';
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')?.matches) {
        return 'dark';
      }
    } catch { }
    return 'light';
  });
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
      localStorage.setItem('theme', theme);
    } catch { }
  }, [theme]);

  // no overlay animation; sidebar remains side-by-side on all screen sizes

  // Simple style state for FeatureLayers (URL sharing enabled)
  const [styleMode, setStyleMode] = useState<StyleMode>(getInitialStyleMode());
  const [styleOptions, setStyleOptions] = useState<GeometryStyleOptions>(getInitialStyleOptions());
  const [attributeStyle, setAttributeStyle] = useState<AttributeStyleOptions>(getInitialAttributeStyle());
  const [legendCollapsed, setLegendCollapsed] = useState<boolean>(getInitialLegendCollapsed());
  const [legendHighlight, setLegendHighlight] = useState<LegendHighlight | null>(null);
  useEffect(() => {
    setSuspectedDuplicateIds([]);
    setLegendHighlight(null);
  }, [serviceUrl, selectedMapLayerId, where]);

  const styleFeatureCollection = React.useMemo(() => {
    if (!styleOptions.display?.hideSuspectedDuplicates || suspectedDuplicateIds.length === 0) return featureCollection;
    const hidden = new Set(suspectedDuplicateIds.map((id) => `${typeof id}:${String(id)}`));
    const features = Array.isArray(featureCollection?.features)
      ? featureCollection.features.filter((feature: any) => {
          const id = getFeatureId(feature);
          return id == null || !hidden.has(`${typeof id}:${String(id)}`);
        })
      : [];
    return { ...(featureCollection || { type: 'FeatureCollection' }), type: 'FeatureCollection', features };
  }, [featureCollection, styleOptions.display?.hideSuspectedDuplicates, suspectedDuplicateIds]);
  const legendVisible = styleOptions.display?.showLegend !== false;

  function handleStyleByField(fieldName: string) {
    const meta = (layerMeta?.fields as any[] | undefined)?.find((f: any) => f?.name === fieldName);
    const features = (styleFeatureCollection as any)?.features ?? [];
    const kind = inferSubMode(meta?.type);
    let rule: AttributeStyleOptions['rule'];
    let paletteId: string;
    if (kind === 'categorical') {
      const palette = QUALITATIVE_PALETTES[0];
      paletteId = palette.id;
      rule = { kind: 'categorical', field: fieldName, channel: 'color', stops: classifyCategorical(features, fieldName, palette), fallbackColor: '#aaaaaa' };
    } else {
      const palette = SEQUENTIAL_PALETTES[0];
      paletteId = palette.id;
      const stops = classifyNumeric(features, fieldName, palette);
      rule = { kind: 'numeric', field: fieldName, channel: 'color', stops, fallbackColor: palette.colors[0] };
    }
    setAttributeStyle({ rule, meta: { paletteId } });
    setStyleMode('attribute');
    setActiveTab('style');
  }

  const lastSyncedUrlRef = useRef<string>('');

  useEffect(() => {
    const delay = isMobile ? 450 : 140;
    const timeoutId = window.setTimeout(() => {
      try {
        const params = new URLSearchParams(window.location.search);

        if (serviceUrl) params.set('url', serviceUrl);
        else params.delete('url');

        const w = (where || '').trim();
        if (w && !isTrivialWhere(w)) params.set('where', w);
        else params.delete('where');

        const e = (bbox || '').replace(/\s+/g, '');
        if (e) params.set('extent', e);
        else if (mapPositionReady) params.delete('extent');

        const c = (center || '').replace(/\s+/g, '');
        if (c) params.set('center', c);
        else if (mapPositionReady) params.delete('center');

        if (typeof zoom === 'number' && zoom > 0) params.set('z', String(zoom));
        else if (mapPositionReady) params.delete('z');

        if (basemap) params.set('basemap', basemap);
        else params.delete('basemap');

        if (selectedFeatureId == null || selectedFeatureId === '') params.delete('id');
        else params.set('id', String(selectedFeatureId));

        if (activeTab) params.set('tab', activeTab);
        else params.delete('tab');

        if (styleMode === 'custom' || styleMode === 'attribute') {
          params.set('styleMode', styleMode);
          // Only carry `style` when something actually differs from the
          // defaults — keeps shared URLs short and readable.
          const s = encodeStyle(styleOptions);
          if (s && s !== '{}') params.set('style', s);
          else params.delete('style');
          // Attribute mode also carries the color-by-field rule in `astyle`.
          const astyle = styleMode === 'attribute' ? encodeAttributeStyle(attributeStyle) : '';
          if (astyle) params.set('astyle', astyle);
          else params.delete('astyle');
          if (styleOptions.display?.showLegend === false) params.set('legend', 'hidden');
          else if (legendCollapsed) params.set('legend', '0');
          else params.delete('legend');
        } else {
          params.delete('styleMode');
          params.delete('style');
          params.delete('astyle');
          params.delete('legend');
        }

        const search = params.toString();
        const newUrl = search ? `${window.location.pathname}?${search}` : window.location.pathname;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (newUrl === currentUrl || newUrl === lastSyncedUrlRef.current) return;

        try {
          window.history.replaceState({}, '', newUrl);
          lastSyncedUrlRef.current = newUrl;
        } catch {}
      } catch {}
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [activeTab, basemap, bbox, center, isMobile, legendCollapsed, mapPositionReady, selectedFeatureId, serviceUrl, styleMode, styleOptions, attributeStyle, where, zoom]);

  // Keep header WHERE input mirrored with state
  useEffect(() => { setWhereInput(where || '1=1'); }, [where]);
  // Persist sidebar width
  useEffect(() => { try { localStorage.setItem('sidebarWidth', String(sidebarWidth)); } catch { } }, [sidebarWidth]);

  // Click-away close for the header overflow menu
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      const menuEl = headerMenuRef.current;
      if (target && menuEl && menuEl.contains(target)) return;
      setShowHeaderMenu(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function commitWhere() {
    const raw = normalizeWhereInput(whereInput || '');
    const w = raw.length ? raw : '1=1';
    // Validate and warn on common issues
    try {
      const { errors, unknown, warnings } = validateWhere(w, new Set(fieldNames.map(s => s.toUpperCase())), fieldsMeta as any) as any;
      if (errors.length) showToast(errors.join('; '), { type: 'warning' });
      if (unknown.length) showToast(`Unknown fields: ${unknown.join(', ')}`, { type: 'warning' });
      if (warnings.length) showToast(warnings.join('; '), { type: 'info' });
    } catch {}
    setWhere(w);
    setWhereInput(w);
    // Clear current rows; Esri layer will repopulate based on new filter
    setLayerDataRows([]);
    setIsHeaderFilterOpen(false);
  }

  function handleClearWhere() {
    setWhereInput('1=1');
    setWhere('1=1');
    setLayerDataRows([]);
    setDismissedIssuesKey('');
    setIsHeaderFilterOpen(false);
  }

  function handleCancelHeaderFilterEdit() {
    setWhereInput(where || '1=1');
    setDismissedIssuesKey('');
    setIsHeaderFilterOpen(false);
  }

  // Local format/validation replaced by shared whereUtils

  function swapPairStr(pair: string): string {
    // pair is formatted as "a, b" with fixed decimals
    const parts = pair.split(',').map(s => s.trim());
    if (parts.length !== 2) return pair;
    return `${parts[1]}, ${parts[0]}`;
  }
  function format(pair: string, order: 'lng-lat' | 'lat-lng'): string {
    if (!pair) return '—';
    return order === 'lng-lat' ? pair : swapPairStr(pair);
  }
  function formatBbox(b: string, order: 'lng-lat' | 'lat-lng', gdalFmt: boolean): string {
    if (!b) return '—';
    const nums = b.split(',').map(s => s.trim());
    if (nums.length !== 4) return b;
    // b is stored as minX, minY, maxX, maxY (lng, lat)
    let out = nums;
    if (order === 'lat-lng') out = [nums[1], nums[0], nums[3], nums[2]];
    return gdalFmt ? out.join(' ') : out.join(', ');
  }

  // FlashButton and CopyButton moved to components/ui

  // Derive the selected sublayer from the URL. Runs on mount too, so a shared /
  // restored link initializes the right layer.
  useEffect(() => {
    try {
      const info = getRestServiceUrlInfo(serviceUrl);
      if (typeof info?.layerId === 'number') {
        setSelectedMapLayerId(info.layerId);
      } else if (info?.serviceType === 'FeatureServer' && info?.isService) {
        setSelectedMapLayerId(0);
      } else {
        setSelectedMapLayerId(undefined);
      }
    } catch {
      setSelectedMapLayerId(undefined);
    }
  }, [serviceUrl]);

  // Reset view + filters + styling when the user actually switches layer/service.
  // Guarded against the initial mount (and StrictMode's double-invoke) by
  // comparing the previous URL, so URL-restored state — where, selected feature,
  // attribute style — survives a shared link instead of being wiped on load.
  const prevServiceUrlRef = useRef<string>(serviceUrl);
  useEffect(() => {
    if (prevServiceUrlRef.current === serviceUrl) return;
    prevServiceUrlRef.current = serviceUrl;
    // reset details; MapView will repopulate
    setServiceMeta(null);
    setLayerMeta(null);
    setFeatureCount(null);
    setLayerDataRows([]);
    setFeatureCollection({ type: 'FeatureCollection', features: [] });
    setSelectedFeatureId(null);
    setExportProgress(null);
    setRenderStatus('idle');
    // A new layer should start from the source renderer; the Style tab will show
    // those server values and switch to custom on the first user edit.
    setAttributeStyle({});
    setStyleMode('server');
    setIsLoadingService(false);
    // Reset WHERE filter when switching layers/services
    try {
      setWhere('1=1');
      setWhereInput('1=1');
      setIsHeaderFilterOpen(false);
    } catch {}
    try { setDownloadedExtent(null); } catch {}
  }, [serviceUrl]);

  useEffect(() => {
    const entry = buildRecentLayerEntry({
      url: serviceUrl,
      layerName: layerMeta?.name || serviceMeta?.mapName || null,
      geometryType: layerMeta?.geometryType || null,
    });
    if (entry) pushRecentLayerEntry(entry);
  }, [layerMeta?.geometryType, layerMeta?.name, serviceMeta?.mapName, serviceUrl]);

  // Table is disabled for now while map UX is refined
  const isRasterStyleMode = renderMode === 'dynamic' || renderMode === 'fallback_dynamic' || renderMode === 'image';
  const isGroupLayer = /group/i.test(String(layerMeta?.type || ''));
  const disableStyle = isGroupLayer || (!(isFeatureLayer && renderMode === 'feature') && !isRasterStyleMode);

  return (
    <div className="app">
      <header className="header" aria-label="Layer finder and filter" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: isMobile ? 8 : 12, alignItems: 'flex-start', width: '100%' }}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <SelectTab
              ref={headerFinderRef}
              finderMode="search-only"
              finderChrome="compact"
              serviceUrl={serviceUrl}
              onSelectServiceUrl={(nextUrl) => {
                setIsLoadingService(true);
                setServiceUrl(nextUrl);
              }}
              onZoomToExtent={() => {}}
              onZoomToLayer={() => setZoomToLayerToken((t) => (t ?? 0) + 1)}
              serviceMeta={serviceMeta ?? null}
              layerMeta={layerMeta ?? null}
              featureCount={featureCount}
              renderStatus={renderStatus}
              renderedFeatureCount={inViewFeatureCount}
              renderMode={renderMode}
            />
          </div>
          <div ref={headerMenuRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setShowHeaderMenu((v) => !v)}
              aria-label="Open header menu"
              aria-haspopup="menu"
              aria-expanded={showHeaderMenu}
              title="More"
              className="icon-button"
            >
              ⋯
            </button>
            {showHeaderMenu ? (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  minWidth: 220,
                  padding: 6,
                  fontSize: 13,
                  color: 'var(--text)',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                  zIndex: 2000,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
                  }}
                  className="button secondary"
                  style={{ width: '100%', justifyContent: 'flex-start' }}
                >
                  {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                </button>
                <a
                  role="menuitem"
                  href="https://mappingsupport.com/p/surf_gis/list-federal-state-county-city-GIS-servers.txt"
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setShowHeaderMenu(false)}
                  className="button secondary"
                  style={{ display: 'flex', width: '100%', justifyContent: 'flex-start', marginTop: 6, textDecoration: 'none' }}
                >
                  Find ArcGIS servers
                </a>
              </div>
            ) : null}
          </div>
          {/* URL applies on Enter/blur; filter controls below */}
        </div>
        {hasFilterableLayer ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            {isHeaderFilterOpen ? (
              <>
                <div style={{ display: 'flex', gap: isMobile ? 6 : 8, alignItems: 'center', width: '100%' }}>
                  <div style={{ flex: 1 }}>
                    <WhereEditor
                      ref={headerWhereEditorRef as any}
                      aria-label="Filter features"
                      value={whereInput}
                      onChange={(v: string) => setWhereInput(v)}
                      onCommit={commitWhere}
                      commitKey={isMobile ? 'enter' : 'mod-enter'}
                      placeholder="Filter features…"
                      fields={fieldNames}
                      fieldsMeta={fieldsMeta}
                      valueSamples={headerValueSamples}
                      fieldAliases={fieldAliasMap}
                      keywords={[
                        'AND', 'OR', 'NOT', 'LIKE', 'IN', 'BETWEEN', 'IS NULL', 'IS NOT NULL',
                        '=', '<', '<=', '>', '>=', '<>'
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={handleCancelHeaderFilterEdit}
                    aria-label="Close filter editor"
                    title="Close filter editor"
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                  <span className="u-small u-muted">
                    {isMobile ? 'Press Enter to apply.' : 'Press Ctrl/Cmd+Enter to apply.'}
                  </span>
                  {hasPendingWhereChanges ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--muted)', fontSize: 12 }}>
                      Draft
                    </span>
                  ) : null}
                  {filterIssueCount && dismissedIssuesKey !== whereInput ? (
                    <div
                      role="status"
                      title={filterIssueTitle}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'tomato', fontSize: 12 }}
                    >
                      ⚠️ {whereIssues.errors.length ? `${whereIssues.errors.length} issue${whereIssues.errors.length > 1 ? 's' : ''}` : ''}
                      {whereIssues.errors.length && whereIssues.unknown.length ? ' • ' : ''}
                      {whereIssues.unknown.length ? `${whereIssues.unknown.length} unknown field${whereIssues.unknown.length > 1 ? 's' : ''}` : ''}
                      {(whereIssues.errors.length || whereIssues.unknown.length) && whereIssues.warnings.length ? ' • ' : ''}
                      {whereIssues.warnings.length ? `${whereIssues.warnings.length} warning${whereIssues.warnings.length > 1 ? 's' : ''}` : ''}
                      <button onClick={() => { const b = beautifyWhere(whereInput, fieldsMeta as any); setWhereInput(b); }} style={{ marginLeft: 6, padding: '2px 6px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer' }}>Fix</button>
                      <button onClick={() => setDismissedIssuesKey(whereInput)} style={{ padding: '2px 6px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer' }}>Dismiss</button>
                    </div>
                  ) : null}
                  {(renderMode !== 'feature' && !isTrivialWhere(whereInput || '')) ? (
                    <div
                      role="button"
                      tabIndex={0}
                      title="Rendering fell back to Dynamic. Filter may be invalid. Click to clear the filter."
                      onClick={handleClearWhere}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClearWhere(); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}
                    >
                      ⚠️ Rendering fell back to Dynamic. Clear filter.
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
                {hasActiveWhere ? (
                  <>
                    <button
                      type="button"
                      className="u-btn"
                      onClick={() => setIsHeaderFilterOpen(true)}
                      title={where}
                      style={{ maxWidth: 'min(100%, 520px)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderRadius: 9999 }}
                    >
                      {`Filter: ${summarizeWhereLabel(where, isMobile ? 36 : 64)}`}
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={handleClearWhere}
                      aria-label="Clear filter"
                      title="Clear filter"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="u-btn"
                    onClick={() => setIsHeaderFilterOpen(true)}
                    style={{ borderRadius: 9999, color: 'var(--muted)' }}
                  >
                    Filter features…
                  </button>
                )}
                {hasPendingWhereChanges ? (
                  <button
                    type="button"
                    onClick={() => setIsHeaderFilterOpen(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}
                    title="There are un-applied filter edits."
                  >
                    Draft
                  </button>
                ) : null}
                {filterIssueCount && dismissedIssuesKey !== whereInput ? (
                  <button
                    type="button"
                    onClick={() => setIsHeaderFilterOpen(true)}
                    title={filterIssueTitle}
                    style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'tomato', fontSize: 12, cursor: 'pointer' }}
                  >
                    {`⚠️ ${filterIssueCount} ${filterIssueCount === 1 ? 'issue' : 'issues'}`}
                  </button>
                ) : null}
                {(renderMode !== 'feature' && !isTrivialWhere(whereInput || '')) ? (
                  <div
                    role="button"
                    tabIndex={0}
                    title="Rendering fell back to Dynamic. Filter may be invalid. Click to clear the filter."
                    onClick={handleClearWhere}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClearWhere(); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}
                  >
                    ⚠️ Dynamic fallback
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </header>
      <main className="main" style={{ display: 'flex', minHeight: 0 }}>
        <section className={`map-panel`} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
          <div style={{ flex: '1 1 0%', minHeight: 0, position: 'relative' }}>
            {/* Loading ribbon over map */}
            {isLoadingService && (
              <div aria-live="polite" role="status" style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 1100, pointerEvents: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--muted)', borderRadius: 8, padding: '6px 10px', boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}>
                  <span style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <span className="u-small">Loading layer…</span>
                </div>
              </div>
            )}
            {perfCheckPending && !perfWarning ? (
              <div role="status" style={{ position: 'absolute', top: isLoadingService ? 44 : 8, left: 8, right: 8, zIndex: 1100 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--muted)', borderRadius: 8, padding: '7px 10px', boxShadow: '0 2px 10px rgba(0,0,0,0.15)' }}>
                  <span style={{ width: 12, height: 12, border: '2px solid var(--border)', borderTop: '2px solid var(--accent)', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                  <span className="u-small">Checking how many features are in view before loading…</span>
                </div>
              </div>
            ) : null}
            {perfWarning ? (
              <div role="status" style={{ position: 'absolute', top: isLoadingService ? 44 : 8, left: 8, right: 8, zIndex: 1100 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', boxShadow: '0 2px 10px rgba(0,0,0,0.15)', flexWrap: 'wrap' }}>
                  <span className="u-small">
                    ⚠️ About {perfWarning.count.toLocaleString()} features are in view. Performance may be impacted. Zoom in to a smaller area or continue.
                  </span>
                  <button
                    type="button"
                    className="u-btn"
                    onClick={dismissPerfWarning}
                    style={{ padding: '4px 8px', fontSize: 12 }}
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : null}
            <ErrorBoundary onReset={() => setIsLoadingService(false)}>
            <MapView
              serviceUrl={serviceUrl}
              selectedMapLayerId={selectedMapLayerId}
              where={where}
              forcedFetchPaused={perfCheckPending || !!perfWarning}
              allFeaturesLoaded={allFeaturesLoadedInMemory}
              onManualFetchIntent={dismissPerfWarning}
              onAutoFetchChange={setAutoFetchEnabled}
              basemap={basemap}
              layerOpacity={layerOpacity}
              onBasemapChange={(b) => setBasemap(b)}
              initialCenter={initialCenterZoom.center}
              initialZoom={initialCenterZoom.zoom}
              zoomToExtent={zoomToExtent}
             onFeatureCollection={(fc) => {
               // Transition heavy updates to keep input/UI responsive
               startTransition(() => setFeatureCollection(fc));
             }}
              onDuplicateSummaryChange={(summary: DuplicateFeatureSummary) => {
                setSuspectedDuplicateIds(summary.suspectedDuplicateIds);
              }}
              onDownloadedExtentChange={(e) => setDownloadedExtent(e as any)}
              featureCollection={featureCollection}
              selectedFeatureId={selectedFeatureId}
              flashFeature={flashFeature}
              legendHighlightFilter={legendVisible ? legendHighlight?.filter ?? null : null}
              zoomToLayerToken={zoomToLayerToken}
              onMapFeatureClickId={(id) => setSelectedFeatureId(id)}
              externalHoverId={tableHoverId}
              onHoverFeatureId={(id) => setMapHoverId(id)}
              styleMode={styleMode}
              customStyle={styleOptions}
              attributeStyle={attributeStyle}
              onBoundsChange={(b) => {
                try {
                  const sw = b.getSouthWest();
                  const ne = b.getNorthEast();
                  const fmt = formatUrlNumber;
                  setBbox(`${fmt(sw.lng)}, ${fmt(sw.lat)}, ${fmt(ne.lng)}, ${fmt(ne.lat)}`);
                  setMapPositionReady(true);
                } catch { setBbox(''); }
              }}
              onCenterZoomChange={(c, z) => {
                const fmt = formatUrlNumber;
                setCenter(`${fmt(c.lat)}, ${fmt(c.lng)}`);
                setZoom(z);
                setMapPositionReady(true);
              }}
              onMouseMove={(ll) => setMouse(`${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`)}
              onStatusChange={(s) => {
                // Throttle noisy transient layer errors (tile aborts, retries, fallbacks)
                // Show at most one warning every 6s per URL, and clear on loaded.
                setRenderStatus(s);
                const gate = layerErrorGateRef.current;
                if (gate.url !== serviceUrl) { gate.url = serviceUrl; gate.last = 0; }
                if (s === 'loading') { 
                  /* no toast to reduce noise */ 
                }
                else if (s === 'error') {
                  const now = Date.now();
                  if (now - gate.last > 6000) {
                    showToast('Layer is having trouble loading (retrying)...', { type: 'warning' });
                    gate.last = now;
                  }
                } else if (s === 'loaded') {
                  // clear gate so future real errors can surface once
                  const now = Date.now();
                  gate.last = now - 6000; // allow immediate future error toast if it truly fails after load
                }
              }}
              onRenderModeChange={(mode, reason) => { setRenderMode(mode); setFallbackReason(reason); }}
              onServiceMetadata={async (_summary, meta) => {
                // Persist details for Sidebar tabs; selection context is shown inline in the UI.
                setIsLoadingService(false); // Service metadata loaded
                try { setServiceMeta(meta as MapServiceInfo); } catch { }
                try {
                  // cancel any in-flight metadata/count requests
                  try { metaControllerRef.current?.abort(); } catch {}
                  metaControllerRef.current = new AbortController();
                  const signal = metaControllerRef.current.signal;
                  const resolved = resolveEsriLayer(serviceUrl, selectedMapLayerId);
                  if (resolved.type === 'feature' && resolved.url) {
                    const lm = await fetchLayerMetadata(resolved.url, { signal });
                    setLayerMeta(lm);
                    try {
                      const n = await fetchFeatureCount(resolved.url, undefined, { signal });
                      setFeatureCount(n);
                    } catch { setFeatureCount(null); }
                  } else if (typeof (resolved as any).layerId === 'number' && (resolved as any).serviceRootUrl) {
                    // MapServer sublayer: fetch per-layer metadata to power field suggestions
                    const layerUrl = `${String((resolved as any).serviceRootUrl).replace(/\/+$/, '')}/${(resolved as any).layerId}`;
                    try { const lm = await fetchLayerMetadata(layerUrl, { signal }); setLayerMeta(lm as any); } catch { setLayerMeta(null); }
                    setFeatureCount(null);
                  } else {
                    setLayerMeta(null);
                    setFeatureCount(null);
                  }
                } catch {
                  setLayerMeta(null);
                  setFeatureCount(null);
                }
              }}
            />
            {legendVisible ? (
              <MapLegend
                mode={styleMode}
                options={styleOptions}
                attributeStyle={attributeStyle}
                geometryType={layerMeta?.geometryType}
                layerName={layerMeta?.name || (serviceMeta as any)?.mapName}
                fields={(layerMeta?.fields as any) || []}
                collapsed={legendCollapsed}
                onCollapsedChange={setLegendCollapsed}
                activeHighlightKey={legendHighlight?.key ?? null}
                onHighlightChange={setLegendHighlight}
              />
            ) : null}
            </ErrorBoundary>
            {/* Empty state overlay when no layer is loaded */}
            {!serviceUrl ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 10 }}>
                <div style={{ background: 'rgba(var(--panel-rgb, 255,255,255), 0.88)', backdropFilter: 'blur(4px)', borderRadius: 10, padding: '18px 28px', textAlign: 'center', color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, maxWidth: 340, boxShadow: '0 2px 12px rgba(0,0,0,0.10)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>Paste an ArcGIS URL to get started</div>
                  <div>Enter a service or layer URL in the bar above</div>
                </div>
              </div>
            ) : null}
            {/* Bottom overlay (over the map) */}
            {infoOpen ? (
              <MoreInfoOverlay
                open={true}
                onClose={() => setInfoOpen(false)}
                mouse={format(mouse, coordOrder)}
                zoom={zoom}
                center={format(center, coordOrder)}
                bbox={formatBbox(bbox, coordOrder, gdal)}
                centerRaw={center}
                bboxRaw={bbox}
                coordOrder={coordOrder}
                onChangeCoordOrder={setCoordOrder}
                gdal={gdal}
                onChangeGdal={setGdal}
                showHeaderButton={true}
                shareUrl={typeof window !== 'undefined' ? window.location.href : undefined}
                queryUrl={(() => {
                  try {
                    const r = resolveEsriLayer(serviceUrl, selectedMapLayerId);
                    if (r.type !== 'feature' || !r.url) return undefined;
                    const u = new URL(`${r.url.replace(/\/+$/, '')}/query`);
                    u.searchParams.set('f', 'json');
                    u.searchParams.set('outFields', '*');
                    const w = (where || '').trim();
                    u.searchParams.set('where', w || '1=1');
                    const e = (bbox || '').replace(/\s+/g, '');
                    if (e) {
                      u.searchParams.set('geometry', e);
                      u.searchParams.set('geometryType', 'esriGeometryEnvelope');
                      u.searchParams.set('inSR', '4326');
                      u.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
                    }
                    return u.toString();
                  } catch { return undefined; }
                })()}
                curl={(() => {
                  try {
                    const r = resolveEsriLayer(serviceUrl, selectedMapLayerId);
                    if (r.type !== 'feature' || !r.url) return undefined;
                    const u = new URL(`${r.url.replace(/\/+$/, '')}/query`);
                    u.searchParams.set('f', 'json');
                    u.searchParams.set('outFields', '*');
                    const w = (where || '').trim();
                    u.searchParams.set('where', w || '1=1');
                    const e = (bbox || '').replace(/\s+/g, '');
                    if (e) {
                      u.searchParams.set('geometry', e);
                      u.searchParams.set('geometryType', 'esriGeometryEnvelope');
                      u.searchParams.set('inSR', '4326');
                      u.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
                    }
                    return `curl -L '${u.toString()}' -o out.json`;
                  } catch { return undefined; }
                })()}
                ogr2ogr={(() => {
                  try {
                    const r = resolveEsriLayer(serviceUrl, selectedMapLayerId);
                    if (r.type !== 'feature' || !r.url) return undefined;
                    const parts: string[] = [
                      'ogr2ogr -f GeoJSON out.geojson',
                      `'${r.url}'`,
                    ];
                    const w = (where || '').trim();
                    if (w && !isTrivialWhere(w)) parts.push(`-where "${w.replace(/"/g, '\\"')}"`);
                    const e = (bbox || '').replace(/\s+/g, '');
                    if (e) {
                      const p = e.split(',').map(s => s.trim());
                      if (p.length === 4) parts.push(`-spat ${p[0]} ${p[1]} ${p[2]} ${p[3]}`);
                    }
                    parts.push('-skipfailures');
                    return parts.join(' ');
                  } catch { return undefined; }
                })()}
              />
            ) : (
              <FlashButton onClick={() => { setInfoOpen(true); }} ariaLabel="Show more info" title={'Show more info'} style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 1500, padding: '8px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', transform: 'rotate(0deg)' }}>⏵</span>
                More Info
              </FlashButton>
            )}
          </div>
          {/* Sidebar open affordance handled by edge handle + swipe */}
          {/* Persistent edge handle to indicate collapsible sidebar */}
          {!sidebarOpen && (
            <button
              type="button"
              className="open-tab-handle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              title="Open sidebar"
            >
              ⏴
            </button>
          )}
          {/* Edge swipe opener (when sidebar is closed) */}
          {!sidebarOpen && (
            <div
              className="edge-open-zone"
              onPointerDown={(e) => {
                try { e.preventDefault(); } catch {}
                const startX = e.clientX;
                const startY = e.clientY;
                const onMove = (ev: PointerEvent) => {
                  const dx = ev.clientX - startX; // moving left => negative
                  const dy = ev.clientY - startY;
                  if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
                    if (dx < 0) setSidebarOpen(true);
                    cleanup();
                  }
                };
                const onUp = () => cleanup();
                const cleanup = () => {
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                };
                window.addEventListener('pointermove', onMove, { passive: true } as any);
                window.addEventListener('pointerup', onUp, { passive: true } as any);
              }}
              onTouchStart={(e) => {
                try { e.preventDefault(); } catch {}
                const t = e.touches && e.touches[0];
                if (!t) return;
                const startX = t.clientX;
                const startY = t.clientY;
                const onMove = (ev: TouchEvent) => {
                  const touch = ev.touches && ev.touches[0];
                  if (!touch) return;
                  const dx = touch.clientX - startX; // moving left => negative
                  const dy = touch.clientY - startY;
                  if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
                    if (dx < 0) setSidebarOpen(true);
                    cleanup();
                  }
                };
                const onUp = () => cleanup();
                const onCancel = () => cleanup();
                const cleanup = () => {
                  window.removeEventListener('touchmove', onMove as any);
                  window.removeEventListener('touchend', onUp as any);
                  window.removeEventListener('touchcancel', onCancel as any);
                };
                window.addEventListener('touchmove', onMove as any, { passive: true });
                window.addEventListener('touchend', onUp as any, { passive: true });
                window.addEventListener('touchcancel', onCancel as any, { passive: true });
              }}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 1400 }}
              title="Swipe from edge to open"
            />
          )}
        </section>
        {/* Resizer between map and sidebar (mouse + touch) */}
        {sidebarOpen && (
          <div
            onPointerDown={(e) => {
              try { e.preventDefault(); } catch {}
              const startX = e.clientX;
              const startWidth = sidebarWidth;
              try { document.body.style.cursor = 'col-resize'; (document.body.style as any).userSelect = 'none'; } catch { }
              const onMove = (ev: PointerEvent) => {
                const delta = startX - ev.clientX;
                const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
                const min = vw <= 768 ? 200 : 240; // sidebar must be at least this wide
                const max = Math.max(min, vw - 100); // leave at least 100px for the map
                const next = Math.max(min, Math.min(max, startWidth + delta));
                setSidebarWidth(next);
              };
              const onUp = () => {
                try { document.body.style.cursor = ''; (document.body.style as any).userSelect = ''; } catch { }
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
            }}
            onTouchStart={(e) => {
              // Fallback for browsers without Pointer Events
              try { e.preventDefault(); } catch {}
              const t = e.touches && e.touches[0];
              if (!t) return;
              const startX = t.clientX;
              const startWidth = sidebarWidth;
              try { document.body.style.cursor = 'col-resize'; (document.body.style as any).userSelect = 'none'; } catch { }
              const onMove = (ev: TouchEvent) => {
                const touch = ev.touches && ev.touches[0];
                if (!touch) return;
                const delta = startX - touch.clientX;
                const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
                const min = vw <= 768 ? 200 : 240;
                const max = Math.max(min, vw - 100);
                const next = Math.max(min, Math.min(max, startWidth + delta));
                setSidebarWidth(next);
              };
              const onUp = () => {
                try { document.body.style.cursor = ''; (document.body.style as any).userSelect = ''; } catch { }
                window.removeEventListener('touchmove', onMove);
                window.removeEventListener('touchend', onUp);
                window.removeEventListener('touchcancel', onUp);
              };
              window.addEventListener('touchmove', onMove, { passive: false });
              window.addEventListener('touchend', onUp);
              window.addEventListener('touchcancel', onUp);
            }}
            className="sidebar-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            tabIndex={0}
            onKeyDown={(e) => {
              const key = e.key;
              if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
              e.preventDefault();
              const step = (e.shiftKey ? 40 : 16);
              const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
              const min = vw <= 768 ? 200 : 240;
              const max = Math.max(min, vw - 100);
              const delta = key === 'ArrowLeft' ? step : -step; // left increases map area => reduce sidebar width
              const next = Math.max(min, Math.min(max, sidebarWidth - delta));
              setSidebarWidth(next);
            }}
            style={{ width: 10, cursor: 'col-resize', background: 'transparent', touchAction: 'none' as any }}
            title="Drag to resize sidebar"
          />
        )}
        {sidebarOpen && (
          <aside
            style={{ position: 'relative', width: sidebarWidth, borderLeft: '1px solid var(--border)', background: 'var(--panel)', padding: 12, overflow: 'auto' }}
          >
            {/* Mobile close button (sticky header, avoids covering tabs) */}
            <div className="sidebar-mobile-header">
              <FlashButton
                onClick={() => setSidebarOpen(false)}
                ariaLabel="Collapse sidebar"
                title={'Collapse sidebar'}
                className="sidebar-close-btn"
                style={{ padding: '8px 10px', fontSize: 14 }}
              >
                ⏵
              </FlashButton>
            </div>
            {/* Edge swipe closer (inside sidebar, near left edge) */}
            <div
              className="sidebar-swipe-close-zone"
              onPointerDown={(e) => {
                try { e.preventDefault(); } catch {}
                const startX = e.clientX;
                const startY = e.clientY;
                try { (document.body.style as any).userSelect = 'none'; } catch {}
                const onMove = (ev: PointerEvent) => {
                  const dx = ev.clientX - startX; // moving right => positive
                  const dy = ev.clientY - startY;
                  if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
                    if (dx > 0) setSidebarOpen(false);
                    cleanup();
                  }
                };
                const onUp = () => cleanup();
                const cleanup = () => {
                  try { (document.body.style as any).userSelect = ''; } catch {}
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
              }}
              onTouchStart={(e) => {
                try { e.preventDefault(); } catch {}
                const t = e.touches && e.touches[0];
                if (!t) return;
                const startX = t.clientX;
                const startY = t.clientY;
                try { (document.body.style as any).userSelect = 'none'; } catch {}
                const onMove = (ev: TouchEvent) => {
                  const touch = ev.touches && ev.touches[0];
                  if (!touch) return;
                  const dx = touch.clientX - startX; // moving right => positive
                  const dy = touch.clientY - startY;
                  if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
                    if (dx > 0) setSidebarOpen(false);
                    cleanup();
                  }
                };
                const onUp = () => cleanup();
                const onCancel = () => cleanup();
                const cleanup = () => {
                  try { (document.body.style as any).userSelect = ''; } catch {}
                  window.removeEventListener('touchmove', onMove as any);
                  window.removeEventListener('touchend', onUp as any);
                  window.removeEventListener('touchcancel', onCancel as any);
                };
                window.addEventListener('touchmove', onMove as any, { passive: true });
                window.addEventListener('touchend', onUp as any, { passive: true });
                window.addEventListener('touchcancel', onCancel as any, { passive: true });
              }}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 10, touchAction: 'none' as any }}
              title="Swipe to close sidebar"
            />
            <ErrorBoundary>
            <Sidebar serviceUrl={serviceUrl} onSelectServiceUrl={setServiceUrl}
              serviceMeta={serviceMeta}
              layerMeta={layerMeta}
              isGroupLayer={isGroupLayer}
              featureCount={featureCount}
              layerDataRows={layerDataRows}
              featureCollection={featureCollection}
              styleFeatureCollection={styleFeatureCollection}
              downloadedExtent={downloadedExtent as any}
              onFlashFeature={(id) => flashFeatureOnMap(id)}
              onZoomToFeature={(id) => zoomToFeatureOnMap(id)}
              onZoomToExtent={(ext) => setZoomToExtent(ext)}
              onZoomToLayer={() => setZoomToLayerToken((t) => (t ?? 0) + 1)}
              selectedFeatureId={selectedFeatureId}
              onClearSelection={() => setSelectedFeatureId(null)}
              whereValue={where}
              whereDraftValue={whereInput}
              onEditWhere={(w) => setWhereInput(w)}
              onRowHover={(id) => setTableHoverId(id)}
              onRowClick={(id) => setSelectedFeatureId(id)}
              onRowDoubleClick={(id) => {
                setSelectedFeatureId(id);
                try {
                  const f = findFeatureById(featureCollection as any, id as any);
                  if (f) {
                    const ext = extentFromFeatures([f as any]);
                    if (ext) setZoomToExtent(ext);
                  }
                } catch {}
              }}
              highlightId={mapHoverId ?? selectedFeatureId}
              disableQuery={!isFeatureLayer || isGroupLayer || (renderMode !== 'feature')}
              disableData={!isFeatureLayer || isGroupLayer || (renderMode !== 'feature')}
              disableDownload={!isFeatureLayer || isGroupLayer || (renderMode !== 'feature')}
              disableStyle={disableStyle}
              zoom={zoom}
              bbox={bbox}
              center={center}
              activeTabName={activeTab}
              onTabChange={(t) => setActiveTab(t)}
              styleMode={styleMode}
              styleOptions={styleOptions}
              onStyleModeChange={(m) => setStyleMode(m)}
              onStyleOptionsChange={(o) => setStyleOptions(o)}
              attributeStyle={attributeStyle}
              onAttributeStyleChange={(a) => setAttributeStyle(a)}
              onStyleByField={handleStyleByField}
              onCommitWhere={() => commitWhere()}
              onClearWhere={handleClearWhere}
              fallbackReason={fallbackReason}
              isLoadingService={isLoadingService}
              exportProgress={exportProgress}
              onExportProgress={setExportProgress}
              renderStatus={renderStatus}
              renderedFeatureCount={inViewFeatureCount}
              renderMode={renderMode}
              layerOpacity={layerOpacity}
              onLayerOpacityChange={setLayerOpacity}
              onFocusFinder={() => headerFinderRef.current?.focusFinder()}
              onBrowseServer={() => headerFinderRef.current?.browseServer()}
              onBrowseFolder={(path) => headerFinderRef.current?.browseFolder(path)}
              onBrowseService={(serviceKey) => headerFinderRef.current?.browseService(serviceKey)}
            />
            </ErrorBoundary>
          </aside>
        )}
      </main>
      <ToastContainer position="bottom-right" theme={theme} autoClose={1400} hideProgressBar closeOnClick pauseOnHover={false} newestOnTop={false} />
    </div>
  );
}
