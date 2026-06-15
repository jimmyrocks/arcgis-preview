import {
  buildKmlMarkerIconDataUri,
  buildKmlStyleFromRenderer,
  buildKmlStyleHint,
  evaluateRendererSymbol,
  symbolToKmlStyleXml,
} from './kmlStyle';

import { buildZip } from './zip';

// Minimal KML builder for a GeoJSON FeatureCollection
// Supports Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon

function esc(s: string): string { return String(s).replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'} as any)[c]); }

function coord(c: any): string { const lon = c[0]; const lat = c[1]; const alt = c[2]; return `${lon},${lat}${alt != null ? ','+alt : ''}`; }

function coordsList(list: any[]): string { return list.map(coord).join(' '); }

function lineStringToKml(gs: any): string {
  return `<LineString><coordinates>${coordsList(gs.coordinates)}</coordinates></LineString>`;
}

function polygonToKml(gs: any): string {
  const rings = gs.coordinates || [];
  if (!Array.isArray(rings) || !rings.length) return '';
  const outer = rings[0] || [];
  const inners = rings.slice(1);
  return `<Polygon>`+
    `<outerBoundaryIs><LinearRing><coordinates>${coordsList(outer)}</coordinates></LinearRing></outerBoundaryIs>`+
    inners.map((r: any) => `<innerBoundaryIs><LinearRing><coordinates>${coordsList(r)}</coordinates></LinearRing></innerBoundaryIs>`).join('')+
    `</Polygon>`;
}

function geometryToKml(g: any): string {
  if (!g) return '';
  const t = g.type;
  if (t === 'Point') return `<Point><coordinates>${coord(g.coordinates)}</coordinates></Point>`;
  if (t === 'MultiPoint') return `<MultiGeometry>${g.coordinates.map((c: any) => `<Point><coordinates>${coord(c)}</coordinates></Point>`).join('')}</MultiGeometry>`;
  if (t === 'LineString') return lineStringToKml(g);
  if (t === 'MultiLineString') return `<MultiGeometry>${g.coordinates.map((l: any) => lineStringToKml({ type: 'LineString', coordinates: l })).join('')}</MultiGeometry>`;
  if (t === 'Polygon') return polygonToKml(g);
  if (t === 'MultiPolygon') return `<MultiGeometry>${g.coordinates.map((p: any) => polygonToKml({ type: 'Polygon', coordinates: p })).join('')}</MultiGeometry>`;
  return '';
}

function pickName(props: any): string {
  if (!props) return '';
  const keys = ['name','Name','TITLE','title','OBJECTID','id'];
  for (const k of keys) if (props[k] != null) return String(props[k]);
  return '';
}

function serializeDataEntries(props: any): string {
  try {
    const entries: string[] = [];
    const obj = props && typeof props === 'object' ? props : {};
    for (const [k, v] of Object.entries(obj)) {
      const val = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
      entries.push(`<Data name="${esc(k)}"><value>${esc(val)}</value></Data>`);
    }
    return entries.join('');
  } catch { return ''; }
}

function keyForSymbol(symbol: any): string {
  try {
    const simp: any = {
      type: symbol?.type,
      color: symbol?.color,
      size: symbol?.size,
      outline: symbol?.outline ? { color: symbol.outline.color, width: symbol.outline.width } : undefined,
      url: symbol?.url,
    };
    return JSON.stringify(simp);
  } catch { return String(Math.random()); }
}

export function featureCollectionToKml(fc: any, opts: { name?: string; metaJson?: string; renderer?: any; geometryType?: string | undefined; inlineIcons?: boolean } = {}): string {
  const name = esc(opts.name || 'Layer');
  const meta = opts.metaJson ? `<ExtendedData><Data name="_export_meta"><value>${esc(opts.metaJson)}</value></Data></ExtendedData>` : '';
  const features = Array.isArray(fc?.features) ? fc.features : [];
  let styleXml = '';
  let styleUrlByIndex: string[] = new Array(features.length).fill('');
  const styleHints = new Map<string, string>();
  try {
    const rtype = String(opts?.renderer?.type || '').toLowerCase();
    if (!opts?.renderer) {
      // no styles
    } else if (rtype === 'uniquevalue' || rtype === 'classbreaks') {
      const styleMap = new Map<string, string>();
      const styleChunks: string[] = [];
      let counter = 0;
      features.forEach((f: any, i: number) => {
        const sym = evaluateRendererSymbol(opts.renderer, f?.properties || {});
        if (!sym) return;
        const key = keyForSymbol(sym);
        let id = styleMap.get(key);
        if (!id) {
          id = `s${++counter}`;
          styleMap.set(key, id);
          const sx = symbolToKmlStyleXml(sym, opts.geometryType, id, !!opts.inlineIcons);
          if (sx) styleChunks.push(sx);
          const hint = buildKmlStyleHint(sym, opts.geometryType);
          if (hint) styleHints.set(id, JSON.stringify(hint));
        }
        styleUrlByIndex[i] = `#${id}`;
      });
      styleXml = styleChunks.join('');
    } else {
      // simple renderer fallback: one style for all
      const style = buildKmlStyleFromRenderer(opts.renderer, opts.geometryType, !!opts.inlineIcons);
      styleXml = style;
      if (styleXml) styleUrlByIndex = styleUrlByIndex.map(() => '#layer-style');
      const sym = opts?.renderer?.symbol || opts?.renderer?.defaultSymbol || null;
      const hint = buildKmlStyleHint(sym, opts.geometryType);
      if (hint) styleHints.set('layer-style', JSON.stringify(hint));
    }
  } catch {}

  const placemarks = features.map((f: any, i: number) => {
    const nm = esc(pickName(f?.properties || {}) || (f?.id != null ? String(f.id) : `feature-${i}`));
    const g = geometryToKml(f?.geometry);
    const su = styleUrlByIndex[i] ? `<styleUrl>${styleUrlByIndex[i]}</styleUrl>` : '';
    const hintId = styleUrlByIndex[i]?.replace(/^#/, '') || '';
    const hint = hintId ? styleHints.get(hintId) : null;
    const propsXml = serializeDataEntries(f?.properties || {});
    const extra = hint ? `<Data name="_style_hint"><value>${esc(hint)}</value></Data>` : '';
    const ext = (propsXml || extra) ? `<ExtendedData>${propsXml}${extra}</ExtendedData>` : '';
    return `<Placemark><name>${nm}</name>${su}${ext}${g}</Placemark>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n`+
    `<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>${name}</name>${meta}${styleXml}${placemarks}</Document></kml>`;
}

export default featureCollectionToKml;

// KMZ builder: packages KML + generated icons into a .kmz (zip) byte array
function addKmzIconHref(styleXml: string, id: string): string {
  if (/<Icon><href>[^<]*<\/href><\/Icon>/.test(styleXml)) {
    return styleXml.replace(
      /<Icon><href>[^<]*<\/href><\/Icon>/,
      `<Icon><href>icons/${id}.png</href></Icon>`,
    );
  }

  if (styleXml.includes('</IconStyle>')) {
    return styleXml.replace('</IconStyle>', `<Icon><href>icons/${id}.png</href></Icon></IconStyle>`);
  }

  return styleXml;
}

function dataUriToBytes(uri: string): Uint8Array | null {
  try {
    const m = uri.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!m) return null;
    const isBase64 = !!m[2];
    const dataPart = m[3];
    if (isBase64) {
      const bin = atob(dataPart);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } else {
      const decoded = decodeURIComponent(dataPart);
      const enc = new TextEncoder();
      return enc.encode(decoded);
    }
  } catch { return null; }
}

export function featureCollectionToKmz(fc: any, opts: { name?: string; metaJson?: string; renderer?: any; geometryType?: string | undefined }): Uint8Array {
  const name = opts.name || 'Layer';
  const enc = new TextEncoder();
  // Build styles similar to KML path, but reference icons/ID.png when we have generated icons
  const features = Array.isArray(fc?.features) ? fc.features : [];
  const styleHints = new Map<string, string>();
  const iconBytesById = new Map<string, Uint8Array>();
  let styleXml = '';
  let styleUrlByIndex: string[] = new Array(features.length).fill('');
  try {
    const rtype = String(opts?.renderer?.type || '').toLowerCase();
    if (opts?.renderer) {
      if (rtype === 'uniquevalue' || rtype === 'classbreaks') {
        const styleMap = new Map<string, string>();
        const styleChunks: string[] = [];
        let counter = 0;
        features.forEach((f: any, i: number) => {
          const sym = evaluateRendererSymbol(opts.renderer, f?.properties || {});
          if (!sym) return;
          const key = keyForSymbol(sym);
          let id = styleMap.get(key);
          if (!id) {
            id = `s${++counter}`;
            styleMap.set(key, id);
            // Build IconStyle, generating icon PNG when needed
            const st = symbolToKmlStyleXml(sym, opts.geometryType, id, false);
            // If point symbol without URL, generate icon and patch href
            const isPoint = /point/i.test(String(opts.geometryType || '')) || /simplemarkersymbol|sms/i.test(String((sym as any)?.type || ''));
            const hasUrl = typeof (sym as any)?.url === 'string' && (sym as any).url;
            if (isPoint && !hasUrl) {
              const dataUri = buildKmlMarkerIconDataUri(sym);
              const bytes = dataUri ? dataUriToBytes(dataUri) : null;
              if (bytes) {
                iconBytesById.set(id, bytes);
              }
            }
            // Replace any IconStyle href with relative icons path when we have an icon
            const patched = iconBytesById.has(id) ? addKmzIconHref(st, id) : st;
            styleChunks.push(patched);
            const hint = buildKmlStyleHint(sym, opts.geometryType);
            if (hint) styleHints.set(id, JSON.stringify(hint));
          }
          styleUrlByIndex[i] = `#${id}`;
        });
        styleXml = styleChunks.join('');
      } else {
        // Simple renderer
        const sym = (opts.renderer as any)?.symbol || (opts.renderer as any)?.defaultSymbol || null;
        let st = symbolToKmlStyleXml(sym, opts.geometryType, 'layer-style', false);
        const isPoint = /point/i.test(String(opts.geometryType || '')) || /simplemarkersymbol|sms/i.test(String((sym as any)?.type || ''));
        const hasUrl = typeof (sym as any)?.url === 'string' && (sym as any).url;
        if (isPoint && !hasUrl) {
          const dataUri = buildKmlMarkerIconDataUri(sym);
          const bytes = dataUri ? dataUriToBytes(dataUri) : null;
          if (bytes) {
            iconBytesById.set('layer-style', bytes);
            st = addKmzIconHref(st, 'layer-style');
          }
        }
        styleXml = st;
        styleUrlByIndex = styleUrlByIndex.map(() => '#layer-style');
        const hint = buildKmlStyleHint(sym, opts.geometryType);
        if (hint) styleHints.set('layer-style', JSON.stringify(hint));
      }
    }
  } catch {}

  const meta = opts.metaJson ? `<ExtendedData><Data name="_export_meta"><value>${esc(opts.metaJson)}</value></Data></ExtendedData>` : '';
  const placemarks = features.map((f: any, i: number) => {
    const nm = esc(pickName(f?.properties || {}) || (f?.id != null ? String(f.id) : `feature-${i}`));
    const g = geometryToKml(f?.geometry);
    const su = styleUrlByIndex[i] ? `<styleUrl>${styleUrlByIndex[i]}</styleUrl>` : '';
    const hintId = styleUrlByIndex[i]?.replace(/^#/, '') || '';
    const hint = hintId ? styleHints.get(hintId) : null;
    const propsXml = serializeDataEntries(f?.properties || {});
    const extra = hint ? `<Data name="_style_hint"><value>${esc(hint)}</value></Data>` : '';
    const ext = (propsXml || extra) ? `<ExtendedData>${propsXml}${extra}</ExtendedData>` : '';
    return `<Placemark><name>${nm}</name>${su}${ext}${g}</Placemark>`;
  }).join('');

  const kml = `<?xml version="1.0" encoding="UTF-8"?>\n`+
    `<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>${esc(name)}</name>${meta}${styleXml}${placemarks}</Document></kml>`;

  const files: { name: string; data: Uint8Array }[] = [];
  files.push({ name: 'doc.kml', data: enc.encode(kml) });
  for (const [id, bytes] of iconBytesById) {
    files.push({ name: `icons/${id}.png`, data: bytes });
  }
  return buildZip(files);
}
