import React, { useEffect, useRef, useState } from 'react';
import { ToastContainer, ToastOptions, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import MapView from './components/MapView';
import { beautifyWhere, validateWhere } from './lib/whereUtils';
import WhereEditor from './components/WhereEditor';
import type { Extent } from './lib/types/arcgis-rest';
import FlashButton from './components/ui/FlashButton';
import MoreInfoOverlay from './components/MoreInfoOverlay';
import Sidebar from './components/sidebar/components/Sidebar';
import type { GeometryStyleOptions } from './lib/styleOptions';
import { defaultStyleOptions } from './lib/styleOptions';
import type { MapServiceInfo, MapServiceLayerInfo } from './lib/types/arcgis-rest';
import { resolveEsriLayer, fetchLayerMetadata, fetchFeatureCount } from './lib/esriLayer';

function getInitialUrl(): string {
  const params = new URLSearchParams(location.search);
  return params.get('url') || '';
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

function getInitialBasemap(): 'usgs_topo' | 'usgs_imagery_topo' | 'usgs_imagery' | 'osm' | 'carto_positron' | 'carto_dark' {
  const allowed = new Set(['usgs_topo', 'usgs_imagery_topo', 'usgs_imagery', 'osm', 'carto_positron', 'carto_dark']);
  try {
    const v = new URLSearchParams(location.search).get('basemap') || '';
    const key = v.toLowerCase();
    if (allowed.has(key)) return key as any;
  } catch { }
  return 'usgs_topo';
}

function getInitialTab(): 'select' | 'details' | 'query' | 'data' | 'download' | 'style' {
  const allowed = new Set(['select', 'details', 'query', 'data', 'download', 'style']);
  try {
    const v = (new URLSearchParams(location.search).get('tab') || '').toLowerCase();
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

function getInitialStyleMode(): 'server' | 'custom' {
  try {
    const v = (new URLSearchParams(location.search).get('styleMode') || '').toLowerCase();
    return v === 'custom' ? 'custom' : 'server';
  } catch { return 'server'; }
}

function getInitialStyleOptions(): GeometryStyleOptions {
  try {
    const raw = new URLSearchParams(location.search).get('style');
    if (!raw) return { ...defaultStyleOptions };
    return decodeStyle(raw);
  } catch { return { ...defaultStyleOptions }; }
}

function encodeStyle(opts: GeometryStyleOptions): string {
  // Roll back to plain JSON encoding in URL
  try { return JSON.stringify(opts); } catch { return JSON.stringify(defaultStyleOptions); }
}

function decodeStyle(s: string): GeometryStyleOptions {
  // Back-compat: allow raw JSON string
  const looksLikeJson = s.trim().startsWith('{') || s.trim().startsWith('[');
  if (looksLikeJson) {
    try { return JSON.parse(s) as GeometryStyleOptions; } catch { return { ...defaultStyleOptions }; }
  }
  try {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0;
    if (pad) b64 += '='.repeat(pad);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const obj = JSON.parse(json);
    if (obj && typeof obj === 'object') return obj as GeometryStyleOptions;
  } catch {}
  return { ...defaultStyleOptions };
}

export default function App() {
  const SWIPE_THRESHOLD_PX = 35; // horizontal movement required to trigger open/close
  const [serviceUrl, setServiceUrl] = useState<string>(getInitialUrl());
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    try { return window.matchMedia('(max-width: 768px)').matches; } catch { return false; }
  });
  const [selectedMapLayerId, setSelectedMapLayerId] = useState<number | undefined>(undefined);
  const defaultPlaceholder = 'https://sampleserver6.arcgisonline.com/arcgis/rest/services';
  const [inputUrl, setInputUrl] = useState<string>(serviceUrl || '');
  const [bbox, setBbox] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try { return !window.matchMedia('(max-width: 1024px)').matches; } catch { return true; }
  });
  const [center, setCenter] = useState<string>('');
  const initialCenterZoom = parseCenterParam();
  const [zoom, setZoom] = useState<number>(initialCenterZoom.zoom || 0);
  const [mouse, setMouse] = useState<string>('');
  const [infoOpen, setInfoOpen] = useState<boolean>(false);
  const [coordOrder, setCoordOrder] = useState<'lng-lat' | 'lat-lng'>('lng-lat');
  const [gdal, setGdal] = useState<boolean>(false);
  const [zoomToExtent, setZoomToExtent] = useState<Extent | null>(() => parseExtentParam());
  const [serviceMeta, setServiceMeta] = useState<MapServiceInfo | null>(null);
  const [layerMeta, setLayerMeta] = useState<MapServiceLayerInfo | null>(null);
  const [featureCount, setFeatureCount] = useState<number | null>(null);
  const [layerDataRows, setLayerDataRows] = useState<any[]>([]);
  const [featureCollection, setFeatureCollection] = useState<any>({ type: 'FeatureCollection', features: [] });
  const [renderMode, setRenderMode] = useState<'feature' | 'dynamic' | 'fallback_dynamic'>('feature');
  const [fallbackReason, setFallbackReason] = useState<string | undefined>(undefined);
  const [hoverFeatureId, setHoverFeatureId] = useState<string | number | null>(null);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | number | null>(getInitialSelectedId());
  const [isLoadingService, setIsLoadingService] = useState<boolean>(false);
  // Keep overlay mounted briefly to allow slide-out animation on mobile
  const [overlayMounted, setOverlayMounted] = useState<boolean>(() => {
    try { return window.matchMedia('(max-width: 768px)').matches && sidebarOpen; } catch { return false; }
  });
  const closeTimerRef = useRef<number | null>(null);
  const resolvedLayer = React.useMemo(() => {
    try { return resolveEsriLayer(serviceUrl, selectedMapLayerId); } catch { return { type: null } as any; }
  }, [serviceUrl, selectedMapLayerId]);
  const isFeatureLayer = (resolvedLayer as any)?.type === 'feature';
  const [where, setWhere] = useState<string>(getInitialWhere());
  const [whereInput, setWhereInput] = useState<string>(getInitialWhere());
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
  // Header "server list" info popover state
  const [showServerList, setShowServerList] = useState<boolean>(false);
  const serverListRef = React.useRef<HTMLDivElement | null>(null);
  const [basemap, setBasemap] = useState<'usgs_topo' | 'usgs_imagery_topo' | 'usgs_imagery' | 'osm' | 'carto_positron' | 'carto_dark'>(getInitialBasemap());
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
  useEffect(() => {
    try {
      const res = validateWhere(whereInput || '', new Set(fieldNames.map(s => s.toUpperCase())), fieldsMeta as any);
      setWhereIssues(res as any);
    } catch { setWhereIssues({ errors: [], unknown: [], warnings: [] }); }
    // Reset dismissal when text changes
    setDismissedIssuesKey('');
  }, [whereInput, fieldNames, JSON.stringify(fieldsMeta || [])]);
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

  // When closing on mobile, keep overlay mounted for slide-out animation
  useEffect(() => {
    const isMobileNow = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (!isMobileNow) { setOverlayMounted(false); return; }
    if (sidebarOpen) {
      if (closeTimerRef.current) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
      setOverlayMounted(true);
    } else {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = window.setTimeout(() => { setOverlayMounted(false); closeTimerRef.current = null; }, 220);
    }
  }, [sidebarOpen, isMobile]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (serviceUrl) {
      params.set('url', serviceUrl);
    } else {
      params.delete('url');
    }
    const newUrl = `${location.pathname}?${params.toString()}`;
    history.replaceState({}, '', newUrl);
  }, [serviceUrl]);

  // Keep WHERE in the URL (omit default 1=1, ignore spacing)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const w = (where || '').trim();
    if (w && !isTrivialWhere(w)) params.set('where', w); else params.delete('where');
    const newUrl = `${location.pathname}?${params.toString()}`;
    history.replaceState({}, '', newUrl);
  }, [where]);

  // Keep current extent (bounds) in the URL as `extent=xmin,ymin,xmax,ymax` (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams(location.search);
      const e = (bbox || '').replace(/\s+/g, '');
      if (e) params.set('extent', e); else params.delete('extent');
      const newUrl = `${location.pathname}?${params.toString()}`;
      history.replaceState({}, '', newUrl);
    }, 200);
    return () => clearTimeout(t);
  }, [bbox]);

  // Keep center and zoom in URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const c = (center || '').replace(/\s+/g, '');
    if (c) params.set('center', c); else params.delete('center');
    const newUrl = `${location.pathname}?${params.toString()}`;
    history.replaceState({}, '', newUrl);
  }, [center]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (typeof zoom === 'number' && zoom > 0) params.set('z', String(zoom)); else params.delete('z');
    const newUrl = `${location.pathname}?${params.toString()}`;
    history.replaceState({}, '', newUrl);
  }, [zoom]);

  // Keep basemap in URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (basemap) params.set('basemap', basemap);
    const newUrl = `${location.pathname}?${params.toString()}`;
    history.replaceState({}, '', newUrl);
  }, [basemap]);

  // Keep selected feature id in URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (selectedFeatureId == null || selectedFeatureId === '') params.delete('id');
    else params.set('id', String(selectedFeatureId));
    const newUrl = `${location.pathname}?${params.toString()}`;
    history.replaceState({}, '', newUrl);
  }, [selectedFeatureId]);


  // Keep sidebar active tab in URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (activeTab) params.set('tab', activeTab);
    const newUrl = `${location.pathname}?${params.toString()}`;
    history.replaceState({}, '', newUrl);
  }, [activeTab]);

  // Simple style state for FeatureLayers (URL sharing enabled)
  const [styleMode, setStyleMode] = useState<'server' | 'custom'>(getInitialStyleMode());
  const [styleOptions, setStyleOptions] = useState<GeometryStyleOptions>(getInitialStyleOptions());

  // Keep style mode + options in URL (only when custom)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (styleMode === 'custom') {
      params.set('styleMode', 'custom');
      try { params.set('style', encodeStyle(styleOptions)); } catch {}
    } else {
      params.delete('styleMode');
      params.delete('style');
    }
    const newUrl = `${location.pathname}?${params.toString()}`;
    history.replaceState({}, '', newUrl);
  }, [styleMode, styleOptions]);

  // Keep header input mirrored with serviceUrl for a simple UX
  useEffect(() => { setInputUrl(serviceUrl || ''); }, [serviceUrl]);
  // Keep header WHERE input mirrored with state
  useEffect(() => { setWhereInput(where || '1=1'); }, [where]);
  // Persist sidebar width
  useEffect(() => { try { localStorage.setItem('sidebarWidth', String(sidebarWidth)); } catch { } }, [sidebarWidth]);

  // Click-away close for the server list popover
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const el = serverListRef.current;
      if (!el) return;
      if (e.target && el.contains(e.target as Node)) return;
      setShowServerList(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function commitUrl() {
    const raw = (inputUrl || '').trim();
    if (!raw) { 
      setServiceUrl(''); 
      setIsLoadingService(false);
      return; 
    }
    let cleaned = raw.replace(/\s+/g, '').replace(/\/$/, '');
    if (/\/FeatureServer$/i.test(cleaned)) cleaned = `${cleaned}/0`;
    setIsLoadingService(true);
    setServiceUrl(cleaned);
    setInputUrl(cleaned);
  }

  function commitWhere() {
    const raw = (whereInput || '').trim();
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
  }

  function handleClearWhere() {
    setWhereInput('1=1');
    setWhere('1=1');
    setLayerDataRows([]);
    showToast('WHERE cleared');
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

  // Reset layer selection when URL changes
  useEffect(() => {
    const lower = serviceUrl.toLowerCase();
    const m = lower.match(/\/mapserver\/(\d+)$/i);
    if (/\/mapserver$/i.test(lower)) {
      // Switch to dynamic MapServer view: clear any previously selected layer id
      setSelectedMapLayerId(undefined);
    } else if (m) {
      setSelectedMapLayerId(Number(m[1]));
    } else {
      setSelectedMapLayerId(undefined);
    }
    // reset details when URL changes; MapView will repopulate
    setServiceMeta(null);
    setLayerMeta(null);
    setFeatureCount(null);
    setLayerDataRows([]);
    setFeatureCollection({ type: 'FeatureCollection', features: [] });
    setHoverFeatureId(null);
    setSelectedFeatureId(null);
    // Reset loading states
    setIsLoadingService(false);
    // Reset WHERE filter when switching layers/services
    try {
      setWhere('1=1');
      setWhereInput('1=1');
    } catch {}
  }, [serviceUrl]);

  // Table is disabled for now while map UX is refined

  return (
    <div className="app">
      <header className="header" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
          <h1 style={{ margin: 0, marginRight: 8 }}>ArcGIS Preview</h1>
          <div style={{ position: 'relative', flex: '1 1 auto' }}>
            <input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitUrl(); }}
              onBlur={commitUrl}
              placeholder={defaultPlaceholder}
              style={{ 
                width: '100%',
                padding: '10px 14px', 
                fontSize: 18, 
                borderRadius: 8, 
                border: '1px solid var(--border)', 
                background: 'var(--panel-subtle)', 
                color: 'var(--text)',
                paddingRight: isLoadingService ? '40px' : '14px'
              }}
            />
            {isLoadingService && (
              <div 
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '16px',
                  height: '16px',
                  border: '2px solid var(--border)',
                  borderTop: '2px solid var(--accent)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}
              />
            )}
          </div>
          <div ref={serverListRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowServerList(v => !v)}
              aria-label="Find ArcGIS servers"
              aria-expanded={showServerList}
              title={"Find ArcGIS REST servers"}
              className="icon-button"
            >
              ⓘ
            </button>
            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label="Toggle theme"
              className="icon-button"
            >{theme === 'dark' ? '☀️' : '🌙'}</button>
            {showServerList ? (
              <div
                role="dialog"
                aria-modal={false}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  maxWidth: 420,
                  padding: '10px 12px',
                  fontSize: 12,
                  color: 'var(--text)',
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                  zIndex: 2000,
                }}
              >
                Looking for ArcGIS REST servers? Try:
                {' '}
                <a
                  href="https://mappingsupport.com/p/surf_gis/list-federal-state-county-city-GIS-servers.txt"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent)', textDecoration: 'none' }}
                >
                  mappingsupport.com server list
                </a>
              </div>
            ) : null}
          </div>
          {/* URL applies on Enter/blur; filter controls below */}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', minWidth: 80 }}>Filter (WHERE)</div>
          <div style={{ position: 'relative', flex: 1 }}>
          <WhereEditor
            aria-label="Filter (WHERE)"
            value={whereInput}
            onChange={(v) => setWhereInput(v)}
            onCommit={commitWhere}
            placeholder="1=1"
            fields={fieldNames}
            fieldsMeta={fieldsMeta}
            valueSamples={headerValueSamples}
            fieldAliases={fieldAliasMap}
            keywords={[
              'AND', 'OR', 'NOT', 'LIKE', 'IN', 'BETWEEN', 'IS NULL', 'IS NOT NULL',
              '=', '<', '<=', '>', '>=', '<>'
            ]}
          />
            {whereInput && !isTrivialWhere(whereInput) && (
              <button
                onClick={() => {
                  setWhereInput('1=1');
                  showToast('WHERE cleared');
                }}
                title="Clear WHERE clause"
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'var(--panel-subtle)',
                  border: '1px solid var(--border)',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: 'var(--muted)',
                  zIndex: 10
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--hover)';
                  e.currentTarget.style.color = 'var(--text)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--panel-subtle)';
                  e.currentTarget.style.color = 'var(--muted)';
                }}
              >
                ✕
              </button>
            )}
          </div>
          {(whereIssues.errors.length || whereIssues.unknown.length || whereIssues.warnings.length) && dismissedIssuesKey !== whereInput ? (
            <div
              role="status"
              title={[...whereIssues.errors, (whereIssues.unknown.length ? (`Unknown fields: ${whereIssues.unknown.join(', ')}`) : ''), (whereIssues.warnings.length ? (`Warnings: ${whereIssues.warnings.join('; ')}`) : '')].filter(Boolean).join('\n')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'tomato', fontSize: 12 }}
            >
              ⚠️ {whereIssues.errors.length ? `${whereIssues.errors.length} issue${whereIssues.errors.length>1?'s':''}` : ''}
              {whereIssues.errors.length && whereIssues.unknown.length ? ' • ' : ''}
              {whereIssues.unknown.length ? `${whereIssues.unknown.length} unknown field${whereIssues.unknown.length>1?'s':''}` : ''}
              {(whereIssues.errors.length || whereIssues.unknown.length) && whereIssues.warnings.length ? ' • ' : ''}
              {whereIssues.warnings.length ? `${whereIssues.warnings.length} warning${whereIssues.warnings.length>1?'s':''}` : ''}
              <button onClick={() => { const b = beautifyWhere(whereInput, fieldsMeta as any); setWhereInput(b); }} style={{ marginLeft: 6, padding: '2px 6px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer' }}>Fix</button>
              <button onClick={() => setDismissedIssuesKey(whereInput)} style={{ padding: '2px 6px', borderRadius: 9999, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer' }}>Dismiss</button>
            </div>
          ) : null}
          {(renderMode !== 'feature' && isFeatureLayer && !isTrivialWhere(whereInput || '')) ? (
            <div
              role="button"
              tabIndex={0}
              title={"Rendering fell back to Dynamic. Filter may be invalid. Click to reset filter to 1=1."}
              onClick={() => { setWhere('1=1'); setWhereInput('1=1'); setLayerDataRows([]); showToast('Filter reset'); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setWhere('1=1'); setWhereInput('1=1'); setLayerDataRows([]); showToast('Filter reset'); } }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel-subtle)', color: 'var(--muted)', fontSize: 12, cursor: 'pointer' }}
            >
              ⚠️ Rendering fell back to Dynamic. Filter may be invalid. Click to reset.
            </div>
          ) : null}
          <FlashButton onClick={() => { commitWhere(); showToast('Query Updated'); }}>🔄 Update Query</FlashButton>
          <FlashButton onClick={() => { setWhere('1=1'); setWhereInput('1=1'); setLayerDataRows([]); showToast('Reset filter'); }}>♻️ Reset</FlashButton>
          {/* Language switcher removed for now */}
        </div>
      </header>
      <main className="main" style={{ display: 'flex', minHeight: 0 }}>
        <section className={`map-panel${(isMobile && overlayMounted && sidebarOpen) ? ' overlay-dim' : ''}`} style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
          <div style={{ flex: '1 1 0%', minHeight: 0, position: 'relative' }}>
            <MapView
              serviceUrl={serviceUrl}
              selectedMapLayerId={selectedMapLayerId}
              where={where}
              basemap={typeof basemap === 'string' ? basemap : 'usgs_topo'}
              onBasemapChange={(b) => setBasemap(b)}
              initialCenter={initialCenterZoom.center}
              initialZoom={initialCenterZoom.zoom}
              zoomToExtent={zoomToExtent}
              onFeatureCollection={(fc) => setFeatureCollection(fc)}
              featureCollection={featureCollection}
              hoverFeatureId={hoverFeatureId}
              selectedFeatureId={selectedFeatureId}
              onMapFeatureHoverId={(id) => setHoverFeatureId(id)}
              onMapFeatureClickId={(id) => setSelectedFeatureId(id)}
              styleMode={styleMode}
              customStyle={styleOptions}
              onBoundsChange={(b) => {
                try {
                  const sw = b.getSouthWest();
                  const ne = b.getNorthEast();
                  const fmt = (x: number) => x.toFixed(6);
                  setBbox(`${fmt(sw.lng)}, ${fmt(sw.lat)}, ${fmt(ne.lng)}, ${fmt(ne.lat)}`);
                } catch { setBbox(''); }
              }}
              onCenterZoomChange={(c, z) => {
                const fmt = (x: number) => x.toFixed(6);
                setCenter(`${fmt(c.lat)}, ${fmt(c.lng)}`);
                setZoom(z);
              }}
              onMouseMove={(ll) => setMouse(`${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`)}
              onStatusChange={(s) => {
                // Throttle noisy transient layer errors (tile aborts, retries, fallbacks)
                // Show at most one warning every 6s per URL, and clear on loaded.
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
              onServiceMetadata={async (summary, meta) => {
                // Show summary and persist details for Sidebar tabs
                setIsLoadingService(false); // Service metadata loaded
                try { showToast(summary, { type: 'info' }); } catch { }
                try { setServiceMeta(meta as MapServiceInfo); } catch { }
                try {
                  const resolved = resolveEsriLayer(serviceUrl, selectedMapLayerId);
                  if (resolved.type === 'feature' && resolved.url) {
                    const lm = await fetchLayerMetadata(resolved.url);
                    setLayerMeta(lm);
                    try {
                      const n = await fetchFeatureCount(resolved.url);
                      setFeatureCount(n);
                    } catch { setFeatureCount(null); }
                  } else if (typeof (resolved as any).layerId === 'number' && (resolved as any).serviceRootUrl) {
                    // MapServer sublayer: fetch per-layer metadata to power field suggestions
                    const layerUrl = `${String((resolved as any).serviceRootUrl).replace(/\/+$/, '')}/${(resolved as any).layerId}`;
                    try { const lm = await fetchLayerMetadata(layerUrl); setLayerMeta(lm as any); } catch { setLayerMeta(null); }
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
            {/* Bottom overlay (over the map) */}
            {infoOpen ? (
              <MoreInfoOverlay
                open={true}
                onClose={() => setInfoOpen(false)}
                mouse={format(mouse, coordOrder)}
                zoom={zoom}
                center={format(center, coordOrder)}
                bbox={formatBbox(bbox, coordOrder, gdal)}
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
              <FlashButton className="overlay-dimmable" onClick={() => { setInfoOpen(true); }} ariaLabel="Show more info" title={'Show more info'} style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 1500, padding: '8px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', transform: 'rotate(0deg)' }}>⏵</span>
                More Info
              </FlashButton>
            )}
          </div>
          {/* Sidebar toggle buttons: attached to sidebar when open; bottom-right when closed */}
          {!sidebarOpen && (
            <FlashButton
              onClick={() => { setSidebarOpen(true); }}
              title={'Show sidebar'}
              ariaLabel={'Show sidebar'}
              style={{
                position: 'absolute',
                right: 13,
                top: 140,
                zIndex: 1500,
                padding: '8px 10px',
                borderRadius: 20,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ display: 'inline-block', transform: 'rotate(180deg)' }}>⏵</span>
            </FlashButton>
          )}
          {/* Persistent edge handle to indicate collapsible sidebar */}
          {!sidebarOpen && (
            <button
              type="button"
              className="open-tab-handle"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
              title="Open sidebar"
            >
              ⏵
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
        {sidebarOpen && !isMobile && (
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
            style={{ width: 6, cursor: 'col-resize', background: 'transparent', touchAction: 'none' as any }}
            title="Drag to resize sidebar"
          />
        )}
        {/* Mobile overlay scrim */}
        {isMobile && overlayMounted ? (
          <div className={`overlay-scrim${sidebarOpen ? ' is-open' : ''}`} onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />
        ) : null}
        {(isMobile ? overlayMounted : sidebarOpen) && (
          <aside
            className={isMobile ? `sidebar-overlay${sidebarOpen ? ' is-open' : ''}` : undefined}
            style={isMobile ? (
              { position: 'absolute', right: 0, top: 0, bottom: 0, width: '85vw', maxWidth: '90vw', minWidth: 200, borderLeft: '1px solid var(--border)', background: 'var(--panel)', padding: 12, overflow: 'auto' }
            ) : (
              { position: 'relative', width: sidebarWidth, borderLeft: '1px solid var(--border)', background: 'var(--panel)', padding: 12, overflow: 'auto' }
            )}
          >
            {/* Mobile close button */}
            <FlashButton
              onClick={() => setSidebarOpen(false)}
              ariaLabel="Hide sidebar"
              title={'Hide sidebar'}
              className="sidebar-close-btn"
              style={{ position: 'absolute', right: 8, top: 8, zIndex: 20 }}
            >
              ✕
            </FlashButton>
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
            <Sidebar serviceUrl={serviceUrl} onSelectServiceUrl={setServiceUrl}
              serviceMeta={serviceMeta}
              layerMeta={layerMeta}
              isGroupLayer={/group/i.test(String(layerMeta?.type || ''))}
              featureCount={featureCount}
              layerDataRows={layerDataRows}
              featureCollection={featureCollection}
              onZoomToExtent={(ext) => setZoomToExtent(ext)}
              whereValue={where}
              whereDraftValue={whereInput}
              onEditWhere={(w) => setWhereInput(w)}
              onRowHover={(id) => setHoverFeatureId(id)}
              onRowClick={(id) => setSelectedFeatureId(id)}
              highlightId={selectedFeatureId ?? hoverFeatureId}
              disableQuery={!isFeatureLayer || /group/i.test(String(layerMeta?.type || '')) || (renderMode !== 'feature')}
              disableData={!isFeatureLayer || /group/i.test(String(layerMeta?.type || '')) || (renderMode !== 'feature')}
              disableDownload={!isFeatureLayer || /group/i.test(String(layerMeta?.type || '')) || (renderMode !== 'feature')}
              disableStyle={!isFeatureLayer || /group/i.test(String(layerMeta?.type || '')) || (renderMode !== 'feature')}
              zoom={zoom}
              bbox={bbox}
              center={center}
              activeTabName={activeTab}
              onTabChange={(t) => setActiveTab(t)}
              styleMode={styleMode}
              styleOptions={styleOptions}
              onStyleModeChange={(m) => setStyleMode(m)}
              onStyleOptionsChange={(o) => setStyleOptions(o)}
              onCommitWhere={() => commitWhere()}
              onClearWhere={handleClearWhere}
              fallbackReason={fallbackReason}
              isLoadingService={isLoadingService}
            />
          </aside>
        )}
      </main>
      <ToastContainer position="bottom-right" theme={theme} autoClose={1400} hideProgressBar closeOnClick pauseOnHover={false} newestOnTop={false} />
    </div>
  );
}
